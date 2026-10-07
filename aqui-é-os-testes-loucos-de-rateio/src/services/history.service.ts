import { Injectable, inject } from '@angular/core';
import { IndexedDbService } from './indexed-db.service';

export type StoreReading = {
  reading: number;       // Leitura Atual
  constant: number;      // Constante do medidor (Luz)
  virtual: number;       // Consumo Virtual (override)
  adjustment: number;    // Fator de ajuste Multiplicador (Luz/Água/Gás - Ajuste X)
  
  // Novos campos opcionais para Gás
  adjustmentAdd?: number; // Ajuste (+) Somatório
  fcm?: number;           // Fator de Correção do Medidor (FCM)
  fluxoCost?: number;     // Recuperação de Fluxo (R$)

  calculatedConsumption: number; // Consumo Final calculado/salvo
  note?: string;          // Observação de campo (ex: 'Relógio embaçado', 'Loja em reforma')
  hasPhoto?: boolean;     // Comprovante / Foto de Evidência gravada no IndexedDB
  photoTimestamp?: string;// Data/hora da captura da foto
};

export interface BillData {
  costItems: any[];
  consumptionInput: any;
  acInput: number;
  // Readings agora pode armazenar o objeto complexo ou número legado
  readings: Record<string, StoreReading | number>; 
  manualBill?: number;
  manualConsumption?: number;
  lastUpdated: string;
}

@Injectable({
  providedIn: 'root'
})
export class HistoryService {
  private readonly STORAGE_KEY = 'shop_rateio_history';
  readonly indexedDb = inject(IndexedDbService);

  constructor() {}

  private getStorage(): Record<string, BillData> {
    const data = localStorage.getItem(this.STORAGE_KEY);
    return data ? JSON.parse(data) : {};
  }

  generateKey(type: string, month: string): string {
    return `${type}_${month}`;
  }

  saveBill(type: string, month: string, data: BillData) {
    const storage = this.getStorage();
    const key = this.generateKey(type, month);
    const updated = {
      ...data,
      lastUpdated: new Date().toISOString()
    };
    storage[key] = updated;
    
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(storage));
    } catch (e) {
      console.warn('LocalStorage limit reached or full, relying on IndexedDB', e);
    }

    // Persist to IndexedDB and queue for sync if offline
    this.indexedDb.saveBill(type, month, updated).catch(err => {
      console.error('Error saving bill to IndexedDB:', err);
    });
  }

  getBill(type: string, month: string): BillData | null {
    const storage = this.getStorage();
    const key = this.generateKey(type, month);
    return storage[key] || null;
  }

  hasBill(type: string, month: string): boolean {
    const storage = this.getStorage();
    return !!storage[this.generateKey(type, month)];
  }

  // Método para o Dashboard
  getAllData(): Record<string, BillData> {
    return this.getStorage();
  }
}