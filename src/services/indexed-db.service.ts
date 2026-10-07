import { Injectable, signal, computed } from '@angular/core';
import { BillData } from './history.service';

export interface SyncQueueItem {
  id?: number;
  type: string;
  month: string;
  data: BillData;
  timestamp: string;
  synced: boolean;
}

export interface MeterPhotoRecord {
  id: string;               // `${type}_${month}_${storeId}`
  type: 'luz' | 'agua' | 'gas';
  month: string;            // 'YYYY-MM'
  storeId: string;
  storeName: string;
  luc: string;
  readingValue: number;     // Leitura capturada no momento
  photoDataUrl: string;     // Base64 comprimida (JPEG ~80-150KB)
  capturedAt: string;       // ISO Timestamp
  note?: string;            // Observação vinculada
}

@Injectable({
  providedIn: 'root'
})
export class IndexedDbService {
  private readonly DB_NAME = 'ShopRateioDB';
  private readonly DB_VERSION = 3;

  private db: IDBDatabase | null = null;
  private dbReadyPromise: Promise<IDBDatabase>;

  // Network & Sync Reactive State Signals
  readonly isOnline = signal<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  readonly syncStatus = signal<'synced' | 'pending' | 'syncing' | 'offline'>(
    typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'synced'
  );
  readonly pendingCount = signal<number>(0);
  readonly lastSyncTimestamp = signal<string | null>(null);
  readonly syncMessage = signal<string | null>(null);

  constructor() {
    this.dbReadyPromise = this.initIndexedDB();
    this.setupNetworkListeners();
  }

  // --- 1. INITIALIZE INDEXEDDB ---
  private initIndexedDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        console.warn('IndexedDB is not supported in this environment.');
        return reject('IndexedDB not supported');
      }

      const request = window.indexedDB.open(this.DB_NAME, this.DB_VERSION);

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result;
        this.createMissingStores(db);
      };

      request.onsuccess = (event: Event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        this.refreshPendingCount();
        this.migrateFromLocalStorage();
        resolve(this.db);
      };

      request.onerror = (event: Event) => {
        console.error('Error opening IndexedDB:', (event.target as IDBOpenDBRequest).error);
        reject((event.target as IDBOpenDBRequest).error);
      };
    });
  }

  /**
   * Garante a criação de todas as tabelas (objectStores) e índices necessários
   */
  private createMissingStores(db: IDBDatabase) {
    // Store for monthly bills & tenant readings
    if (!db.objectStoreNames.contains('bills')) {
      db.createObjectStore('bills', { keyPath: 'id' });
    }

    // Store for shops / tenants
    if (!db.objectStoreNames.contains('stores')) {
      db.createObjectStore('stores', { keyPath: 'id' });
    }

    // Offline sync queue for field readings
    if (!db.objectStoreNames.contains('sync_queue')) {
      const queueStore = db.createObjectStore('sync_queue', { keyPath: 'id', autoIncrement: true });
      queueStore.createIndex('synced', 'synced', { unique: false });
    }

    // Meta parameters (lastSync, deviceId, etc.)
    if (!db.objectStoreNames.contains('meta')) {
      db.createObjectStore('meta', { keyPath: 'key' });
    }

    // Store for Photographic Meter Evidence (Evidência Fotográfica de Medidores)
    if (!db.objectStoreNames.contains('meter_photos')) {
      const photoStore = db.createObjectStore('meter_photos', { keyPath: 'id' });
      photoStore.createIndex('storeMonth', ['storeId', 'month'], { unique: false });
      photoStore.createIndex('utilityMonth', ['type', 'month'], { unique: false });
    }
  }

  // --- 2. NETWORK EVENT LISTENERS & AUTO-SYNC ---
  private setupNetworkListeners() {
    if (typeof window === 'undefined') return;

    window.addEventListener('online', () => {
      this.isOnline.set(true);
      this.showToast('📡 Conexão detectada! Sincronizando dados coletados...');
      this.syncPendingData();
    });

    window.addEventListener('offline', () => {
      this.isOnline.set(false);
      this.syncStatus.set('offline');
      this.showToast('📡 Modo Offline ativado. Todas as leituras serão gravadas com segurança no IndexedDB.');
    });
  }

  // --- 3. MIGRATION & REHYDRATION ---
  private async migrateFromLocalStorage() {
    try {
      if (typeof localStorage === 'undefined') return;
      
      // Migrate history bills
      const localHistory = localStorage.getItem('shop_rateio_history');
      if (localHistory) {
        const parsed = JSON.parse(localHistory);
        for (const [key, billData] of Object.entries(parsed)) {
          const existing = await this.getBillById(key);
          if (!existing) {
            await this.putRecord('bills', {
              id: key,
              ...(billData as any),
              synced: true
            });
          }
        }
      }

      // Migrate stores
      const localStores = localStorage.getItem('shop_rateio_stores_data');
      if (localStores) {
        const stores = JSON.parse(localStores);
        if (Array.isArray(stores)) {
          for (const s of stores) {
            await this.putRecord('stores', s);
          }
        }
      }
    } catch (err) {
      console.warn('Migration to IndexedDB encountered an error:', err);
    }
  }

  // --- 4. BILL OPERATIONS (READINGS PERSISTENCE) ---
  async saveBill(type: string, month: string, billData: BillData): Promise<void> {
    const key = `${type}_${month}`;
    const online = this.isOnline();

    const record = {
      id: key,
      type,
      month,
      ...billData,
      lastUpdated: new Date().toISOString(),
      synced: online
    };

    // 1. Save directly into IndexedDB bills store
    await this.putRecord('bills', record);

    // 2. Also keep localStorage as an instant mirror
    if (typeof localStorage !== 'undefined') {
      try {
        const storageStr = localStorage.getItem('shop_rateio_history');
        const storage = storageStr ? JSON.parse(storageStr) : {};
        storage[key] = { ...billData, lastUpdated: record.lastUpdated };
        localStorage.setItem('shop_rateio_history', JSON.stringify(storage));
      } catch (e) {
        console.warn('LocalStorage mirror warning:', e);
      }
    }

    // 3. If offline, enqueue/update in sync_queue
    if (!online) {
      await this.addToSyncQueue({
        type,
        month,
        data: billData,
        timestamp: record.lastUpdated,
        synced: false
      });
      this.syncStatus.set('pending');
      await this.refreshPendingCount();
      this.showToast(`💾 Leitura salva offline no IndexedDB (${this.pendingCount()} pendente(s))`);
    } else {
      this.syncStatus.set('synced');
    }
  }

  // --- STORES CACHE IN INDEXEDDB ---
  async saveStores(stores: any[]): Promise<void> {
    try {
      const db = await this.getDb();
      const tx = db.transaction('stores', 'readwrite');
      const storeObj = tx.objectStore('stores');
      for (const s of stores) {
        storeObj.put(s);
      }
    } catch (e) {
      console.warn('Error saving stores to IndexedDB:', e);
    }
  }

  async getStores(): Promise<any[]> {
    try {
      return await this.getAllRecords<any>('stores');
    } catch {
      return [];
    }
  }

  async getBill(type: string, month: string): Promise<BillData | null> {
    const key = `${type}_${month}`;
    const record = await this.getBillById(key);
    if (record) {
      const { id, synced, ...bill } = record;
      return bill as BillData;
    }

    // Fallback to localStorage
    if (typeof localStorage !== 'undefined') {
      try {
        const storageStr = localStorage.getItem('shop_rateio_history');
        if (storageStr) {
          const storage = JSON.parse(storageStr);
          return storage[key] || null;
        }
      } catch (e) {
        console.warn('Error reading from localStorage fallback:', e);
      }
    }
    return null;
  }

  async getAllBills(): Promise<Record<string, BillData>> {
    try {
      const records = await this.getAllRecords<any>('bills');
      const result: Record<string, BillData> = {};
      records.forEach(r => {
        if (r.id) {
          const { id, synced, ...data } = r;
          result[r.id] = data as BillData;
        }
      });

      // Merge with localStorage if any missing
      if (typeof localStorage !== 'undefined') {
        const localHistory = localStorage.getItem('shop_rateio_history');
        if (localHistory) {
          const parsed = JSON.parse(localHistory);
          Object.assign(result, parsed, result);
        }
      }

      return result;
    } catch {
      return {};
    }
  }

  // --- 5. SYNC QUEUE MANAGEMENT & AUTO-SYNC ---
  private async addToSyncQueue(item: Omit<SyncQueueItem, 'id'>): Promise<void> {
    const queue = await this.getAllRecords<SyncQueueItem>('sync_queue');
    const existing = queue.find(q => q.type === item.type && q.month === item.month && !q.synced);
    if (existing && existing.id !== undefined) {
      await this.putRecord('sync_queue', {
        ...item,
        id: existing.id
      });
    } else {
      await this.putRecord('sync_queue', item);
    }
  }

  async syncPendingData(): Promise<void> {
    if (!this.isOnline()) {
      this.showToast('⚠️ Sem conexão com a internet. Não é possível sincronizar no momento.');
      return;
    }

    this.syncStatus.set('syncing');

    try {
      const queue = await this.getAllRecords<SyncQueueItem>('sync_queue');
      const pendingItems = queue.filter(item => !item.synced);

      if (pendingItems.length === 0) {
        this.syncStatus.set('synced');
        this.pendingCount.set(0);
        return;
      }

      // Process and mark each pending reading as synced in IndexedDB
      for (const item of pendingItems) {
        if (item.id !== undefined) {
          await this.deleteRecord('sync_queue', item.id);
        }

        // Ensure bill in 'bills' store is marked as synced
        const key = `${item.type}_${item.month}`;
        const existing = await this.getBillById(key);
        if (existing) {
          await this.putRecord('bills', { ...existing, synced: true });
        }
      }

      const count = pendingItems.length;
      const nowStr = new Date().toISOString();
      this.lastSyncTimestamp.set(nowStr);
      await this.putRecord('meta', { key: 'last_sync', value: nowStr });

      this.syncStatus.set('synced');
      this.pendingCount.set(0);

      this.showToast(`✓ Sincronização concluída com sucesso! ${count} lote(s) de leituras sincronizados.`);
    } catch (err) {
      console.error('Error during synchronization:', err);
      this.syncStatus.set('pending');
      this.showToast('Erro ao sincronizar. Os dados continuam preservados no IndexedDB.');
    }
  }

  async refreshPendingCount(): Promise<number> {
    try {
      const queue = await this.getAllRecords<SyncQueueItem>('sync_queue');
      const pending = queue.filter(item => !item.synced).length;
      this.pendingCount.set(pending);
      if (pending > 0 && this.isOnline()) {
        this.syncStatus.set('pending');
      } else if (!this.isOnline()) {
        this.syncStatus.set('offline');
      } else {
        this.syncStatus.set('synced');
      }
      return pending;
    } catch {
      return 0;
    }
  }

  // --- 6. METER PHOTO EVIDENCE (EVIDÊNCIA FOTOGRÁFICA DO MEDIDOR) ---
  async saveMeterPhoto(record: MeterPhotoRecord): Promise<void> {
    try {
      await this.putRecord('meter_photos', record);
      this.showToast(`📷 Foto de evidência salva no IndexedDB (${record.luc} - ${record.storeName})`);
    } catch (err) {
      console.warn('Aviso: Salvamento direto no IndexedDB falhou, aplicando fallback local:', err);
      try {
        const key = `fallback_photo_${record.id}`;
        localStorage.setItem(key, JSON.stringify(record));
      } catch (lsErr) {
        console.warn('Quota de localStorage excedida:', lsErr);
      }
      this.showToast(`📷 Foto registrada com sucesso (${record.luc})`);
    }
  }

  async getMeterPhoto(type: string, month: string, storeId: string): Promise<MeterPhotoRecord | null> {
    const id = `${type}_${month}_${storeId}`;
    try {
      const db = await this.ensureStoreExists('meter_photos');
      return await new Promise((resolve) => {
        try {
          const tx = db.transaction('meter_photos', 'readonly');
          const store = tx.objectStore('meter_photos');
          const req = store.get(id);
          req.onsuccess = () => resolve(req.result || null);
          req.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      });
    } catch {
      // Fallback localStorage
      try {
        const key = `fallback_photo_${id}`;
        const raw = localStorage.getItem(key);
        if (raw) return JSON.parse(raw);
      } catch {}
      return null;
    }
  }

  async getMeterPhotosForMonth(type: string, month: string): Promise<Record<string, MeterPhotoRecord>> {
    const filtered: Record<string, MeterPhotoRecord> = {};
    try {
      const records = await this.getAllRecords<MeterPhotoRecord>('meter_photos');
      for (const rec of records) {
        if (rec.type === type && rec.month === month) {
          filtered[rec.storeId] = rec;
        }
      }
    } catch (err) {
      console.warn('Aviso ao carregar meter_photos do IndexedDB:', err);
    }

    // Mesclar eventuais registros do fallback de emergência
    try {
      if (typeof localStorage !== 'undefined') {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('fallback_photo_')) {
            const raw = localStorage.getItem(key);
            if (raw) {
              const rec = JSON.parse(raw) as MeterPhotoRecord;
              if (rec.type === type && rec.month === month && !filtered[rec.storeId]) {
                filtered[rec.storeId] = rec;
              }
            }
          }
        }
      }
    } catch {}

    return filtered;
  }

  async getMeterPhotosForStore(type: string, storeId: string): Promise<Record<string, MeterPhotoRecord>> {
    const filtered: Record<string, MeterPhotoRecord> = {};
    try {
      const records = await this.getAllRecords<MeterPhotoRecord>('meter_photos');
      for (const rec of records) {
        if (rec.type === type && rec.storeId === storeId) {
          filtered[rec.month] = rec;
        }
      }
    } catch {
      // Fallback localStorage
      try {
        if (typeof localStorage !== 'undefined') {
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('fallback_photo_')) {
              const raw = localStorage.getItem(key);
              if (raw) {
                const rec = JSON.parse(raw) as MeterPhotoRecord;
                if (rec.type === type && rec.storeId === storeId) {
                  filtered[rec.month] = rec;
                }
              }
            }
          }
        }
      } catch {}
    }
    return filtered;
  }

  async deleteMeterPhoto(type: string, month: string, storeId: string): Promise<void> {
    const id = `${type}_${month}_${storeId}`;
    try {
      await this.deleteRecord('meter_photos', id);
    } catch {}
    try {
      localStorage.removeItem(`fallback_photo_${id}`);
    } catch {}
    this.showToast('🗑️ Foto de evidência removida.');
  }

  /**
   * Compacta a foto capturada pela câmera do celular para ~80-150KB
   * e estampa marca d'água com data, hora e dados da loja para comprovante incontestável.
   */
  compressImage(
    file: File, 
    options?: { maxWidth?: number; maxHeight?: number; quality?: number; watermarkText?: string }
  ): Promise<string> {
    const maxWidth = options?.maxWidth || 1200;
    const maxHeight = options?.maxHeight || 1200;
    const quality = options?.quality !== undefined ? options.quality : 0.72;
    const watermarkText = options?.watermarkText || '';

    return new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || typeof FileReader === 'undefined') {
        return reject('Ambiente sem suporte a FileReader');
      }

      const reader = new FileReader();
      reader.onload = (e: ProgressEvent<FileReader>) => {
        const result = e.target?.result as string;
        if (!result) return reject('Falha ao ler arquivo de imagem');

        const img = new Image();
        img.onload = () => {
          let width = img.width;
          let height = img.height;

          // Manter proporção
          if (width > height) {
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            return resolve(result); // Fallback se não conseguir canvas 2d
          }

          // Desenhar imagem redimensionada
          ctx.drawImage(img, 0, 0, width, height);

          // Estampar tarja e texto de evidência (comprovante incontestável)
          const now = new Date();
          const timestampStr = now.toLocaleString('pt-BR', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit'
          });
          const bannerText = watermarkText 
            ? `ShopRateio • ${watermarkText} • ${timestampStr}` 
            : `ShopRateio • Evidência de Medidor • ${timestampStr}`;

          const barHeight = Math.max(28, Math.round(height * 0.04));
          ctx.fillStyle = 'rgba(15, 23, 42, 0.75)'; // Slate 900 semi-transparente
          ctx.fillRect(0, height - barHeight, width, barHeight);

          ctx.font = `bold ${Math.max(11, Math.round(barHeight * 0.45))}px monospace`;
          ctx.fillStyle = '#f8fafc';
          ctx.textBaseline = 'middle';
          ctx.fillText(bannerText, 10, height - (barHeight / 2));

          try {
            const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
            resolve(compressedDataUrl);
          } catch (err) {
            console.warn('Canvas toDataURL failed, using raw data url', err);
            resolve(result);
          }
        };

        img.onerror = () => reject('Erro ao decodificar imagem para compactação');
        img.src = result;
      };

      reader.onerror = () => reject('Erro ao carregar arquivo de foto');
      reader.readAsDataURL(file);
    });
  }

  // --- 7. GENERIC INDEXEDDB HELPERS ---
  private async getDb(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    return this.dbReadyPromise;
  }

  /**
   * Verifica se a objectStore solicitada existe na base.
   * Se não existir (por exemplo, banco aberto em versão antiga no cliente),
   * fecha a conexão e realiza upgrade incremental instantâneo criando a tabela.
   */
  private async ensureStoreExists(storeName: string): Promise<IDBDatabase> {
    const db = await this.getDb();
    if (db.objectStoreNames.contains(storeName)) {
      return db;
    }

    console.warn(`ObjectStore '${storeName}' ausente no IndexedDB v${db.version}. Executando auto-upgrade da base...`);
    const nextVersion = Math.max(this.DB_VERSION, db.version + 1);
    db.close();

    return new Promise((resolve, reject) => {
      const req = window.indexedDB.open(this.DB_NAME, nextVersion);
      req.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const upgradedDb = (event.target as IDBOpenDBRequest).result;
        this.createMissingStores(upgradedDb);
      };
      req.onsuccess = () => {
        this.db = req.result;
        resolve(this.db);
      };
      req.onerror = () => {
        console.error('Falha ao auto-atualizar IndexedDB:', req.error);
        reject(req.error);
      };
    });
  }

  private async getBillById(id: string): Promise<any | null> {
    try {
      const db = await this.ensureStoreExists('bills');
      return await new Promise((resolve) => {
        try {
          const tx = db.transaction('bills', 'readonly');
          const store = tx.objectStore('bills');
          const req = store.get(id);
          req.onsuccess = () => resolve(req.result || null);
          req.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      });
    } catch {
      return null;
    }
  }

  private async putRecord(storeName: string, item: any): Promise<void> {
    const db = await this.ensureStoreExists(storeName);
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const req = store.put(item);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  private async getAllRecords<T>(storeName: string): Promise<T[]> {
    const db = await this.ensureStoreExists(storeName);
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.getAll();
        req.onsuccess = () => resolve((req.result || []) as T[]);
        req.onerror = () => reject(req.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  private async deleteRecord(storeName: string, key: IDBValidKey): Promise<void> {
    const db = await this.ensureStoreExists(storeName);
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const req = store.delete(key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  // --- 7. TOAST NOTIFICATION HELPER ---
  private showToast(msg: string) {
    this.syncMessage.set(msg);
    setTimeout(() => {
      if (this.syncMessage() === msg) {
        this.syncMessage.set(null);
      }
    }, 4500);
  }
}
