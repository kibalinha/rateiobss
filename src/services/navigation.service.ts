import { Injectable, signal } from '@angular/core';

export type AppView = 'dashboard' | 'calculator' | 'stores' | 'report';

@Injectable({
  providedIn: 'root'
})
export class NavigationService {
  currentView = signal<AppView>(this.getInitialView());
  isLocked = signal<boolean>(false);
  
  private lockTimer: any = null;
  private lastLockTimestamp = 0;

  constructor() {
    this.setupWindowListeners();
  }

  private getInitialView(): AppView {
    if (typeof window !== 'undefined') {
      try {
        const hash = window.location.hash.replace('#', '') as AppView;
        if (['dashboard', 'calculator', 'stores', 'report'].includes(hash)) {
          return hash;
        }
        const saved = localStorage.getItem('shop_rateio_current_view') as AppView;
        if (saved && ['dashboard', 'calculator', 'stores', 'report'].includes(saved)) {
          return saved;
        }
      } catch (e) {}
    }
    // Default: 'calculator' for field technicians, or 'calculator' if field session is active
    return 'calculator';
  }

  /**
   * Trava a navegação temporariamente. Usado ao abrir a câmera ou voltar dela,
   * para evitar que o clique no botão "OK / Salvar" do app nativo de câmera
   * vaze (ghost click / tap-through) para a barra de navegação inferior (botão Dashboard).
   */
  lockNavigation(durationMs = 2500) {
    this.isLocked.set(true);
    this.lastLockTimestamp = Date.now();
    if (this.lockTimer) {
      clearTimeout(this.lockTimer);
    }
    this.lockTimer = setTimeout(() => {
      this.isLocked.set(false);
      this.lockTimer = null;
    }, durationMs);
  }

  unlockNavigation() {
    if (this.lockTimer) {
      clearTimeout(this.lockTimer);
      this.lockTimer = null;
    }
    this.isLocked.set(false);
  }

  isRecentlyLocked(): boolean {
    return this.isLocked() || (Date.now() - this.lastLockTimestamp < 1800);
  }

  setView(view: AppView, force = false): boolean {
    // Se a navegação estiver temporariamente bloqueada (ex: retorno da câmera do celular),
    // ignora qualquer clique fantasma que atinja a barra inferior
    if (!force && this.isRecentlyLocked()) {
      console.warn(`[NavigationService] Navegação para "${view}" ignorada para bloquear tap-through da câmera.`);
      return false;
    }

    this.currentView.set(view);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('shop_rateio_current_view', view);
        // Usa replaceState para não empilhar entradas no histórico do Android que causem pop de volta ao dashboard
        window.history.replaceState(null, '', `#${view}`);
      } catch (e) {}
    }
    return true;
  }

  private setupWindowListeners() {
    if (typeof window === 'undefined') return;

    // Escuta mudanças de hash na URL, mas protege contra popstate/back involuntário do Android ao fechar a câmera
    window.addEventListener('hashchange', () => {
      const hash = window.location.hash.replace('#', '') as AppView;
      if (['dashboard', 'calculator', 'stores', 'report'].includes(hash)) {
        if (this.isRecentlyLocked() && this.currentView() === 'calculator' && hash !== 'calculator') {
          console.warn('[NavigationService] Hashchange para', hash, 'bloqueado devido à atividade recente de câmera. Mantendo calculadora.');
          try {
            window.history.replaceState(null, '', '#calculator');
          } catch (e) {}
          return;
        }

        if (this.currentView() !== hash) {
          this.currentView.set(hash);
          try {
            localStorage.setItem('shop_rateio_current_view', hash);
          } catch (e) {}
        }
      }
    });

    // Quando a janela do navegador recupera o foco (ex: técnico bateu a foto e o app de câmera fechou)
    window.addEventListener('focus', () => {
      if (this.currentView() === 'calculator' || this.isRecentlyLocked()) {
        this.lockNavigation(1800);
      }
    });

    // Caso de tab restore por restrição de memória no mobile
    window.addEventListener('pageshow', () => {
      if (this.currentView() === 'calculator' || this.isRecentlyLocked()) {
        this.lockNavigation(1800);
      }
    });
  }
}
