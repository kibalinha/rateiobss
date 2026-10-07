import { Injectable, signal, computed } from '@angular/core';

export type UserRole = 'ADM' | 'TEC' | 'VIS';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  // Estado do papel atual (Padrão: TEC ou restaurado do localStorage)
  currentUserRole = signal<UserRole>(this.getInitialRole());

  private getInitialRole(): UserRole {
    if (typeof localStorage !== 'undefined') {
      try {
        const saved = localStorage.getItem('shop_rateio_user_role') as UserRole;
        if (saved && (saved === 'ADM' || saved === 'TEC' || saved === 'VIS')) {
          return saved;
        }
      } catch (e) {}
    }
    return 'TEC';
  }

  // Computed helpers para usar nos templates
  isAdmin = computed(() => this.currentUserRole() === 'ADM');
  isTech = computed(() => this.currentUserRole() === 'TEC');
  isViewer = computed(() => this.currentUserRole() === 'VIS');

  // Regras de Negócio
  canEditReadings = computed(() => this.isAdmin() || this.isTech());
  canManageStores = computed(() => this.isAdmin());
  canConfigureBill = computed(() => this.isAdmin());
  canImport = computed(() => this.isAdmin()); // Importação restrita a ADM para segurança dos dados estruturais

  setRole(role: UserRole) {
    this.currentUserRole.set(role);
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('shop_rateio_user_role', role);
      } catch (e) {}
    }
  }

  validateAdminPassword(password: string): boolean {
    const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('admin_password') : null;
    if (stored) {
      return password === stored;
    }
    return false;
  }

  getRoleLabel(role: UserRole) {
    switch(role) {
      case 'ADM': return 'Administrador';
      case 'TEC': return 'Técnico';
      case 'VIS': return 'Visualizador';
    }
  }
}