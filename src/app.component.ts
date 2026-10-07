import { Component, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DashboardComponent } from './components/dashboard.component';
import { StoreManagerComponent } from './components/store-manager.component';
import { BillCalculatorComponent } from './components/bill-calculator.component';
import { StoreReportComponent } from './components/store-report.component';
import { AuthService, UserRole } from './services/auth.service';
import { IndexedDbService } from './services/indexed-db.service';
import { ThemeService } from './services/theme.service';
import { NavigationService, AppView } from './services/navigation.service';
import { FormsModule } from '@angular/forms';

type View = AppView;

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, DashboardComponent, StoreManagerComponent, BillCalculatorComponent, StoreReportComponent, FormsModule],
  template: `
<div class="flex h-screen bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden font-sans flex-col md:flex-row relative transition-colors duration-200">
  
  <!-- Floating Sync / Network Toast Notification (IndexedDB) -->
  @if (indexedDb.syncMessage()) {
    <div class="fixed top-14 left-3 right-3 md:top-4 md:left-auto md:right-6 md:w-96 z-50 bg-slate-900/95 text-white backdrop-blur-md px-4 py-3 rounded-xl shadow-2xl border border-slate-700 text-xs flex items-center justify-between gap-3 animate-fade-in">
      <div class="flex items-center gap-2">
        <span class="text-teal-400 font-bold">ℹ️</span>
        <span class="font-medium text-slate-200">{{ indexedDb.syncMessage() }}</span>
      </div>
      <button (click)="indexedDb.syncMessage.set(null)" class="text-slate-400 hover:text-white p-1 rounded font-bold cursor-pointer" title="Fechar">✕</button>
    </div>
  }

  <!-- Mobile Header -->
  <header class="md:hidden bg-slate-900 text-white px-4 py-3 flex justify-between items-center shadow-md z-30 shrink-0 border-b border-slate-800">
    <div class="flex items-center gap-2.5">
      <span class="text-accent text-xl">◆</span>
      <div>
        <span class="font-bold text-base tracking-tight">ShopRateio</span>
        <span class="text-[10px] text-slate-400 block -mt-1 font-medium">Gestão & Leituras</span>
      </div>
    </div>
    
    <div class="flex items-center gap-2">
      <!-- Dark Mode / Alto Contraste Toggle (Campo & Bateria OLED) -->
      <button type="button" 
        (click)="themeService.toggleTheme()" 
        class="p-1.5 px-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer border"
        [class]="themeService.isDarkMode() 
          ? 'bg-amber-400/20 text-amber-300 border-amber-500/40 hover:bg-amber-400/30 shadow-xs' 
          : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white hover:bg-slate-700'"
        [title]="themeService.isDarkMode() ? 'Alternar para Modo Claro' : 'Ativar Modo Escuro / Alto Contraste (OLED)'">
        <span>{{ themeService.isDarkMode() ? '☀️' : '🌙' }}</span>
        <span class="text-[10px] hidden xs:inline">{{ themeService.isDarkMode() ? 'Claro' : 'Escuro' }}</span>
      </button>

      <!-- Offline Pill on Mobile Header -->
      @if (!indexedDb.isOnline()) {
        <span class="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1 shadow-xs" title="Modo Offline ativo: gravações salvas no IndexedDB">
          <span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
          <span>Offline</span>
        </span>
      }

      <!-- Role Badge on Mobile Header -->
      <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
           [class.bg-green-950]="authService.isAdmin()"
           [class.text-green-300]="authService.isAdmin()"
           [class.border]="true"
           [class.border-green-800]="authService.isAdmin()"
           [class.bg-amber-950]="authService.isTech()"
           [class.text-amber-300]="authService.isTech()"
           [class.border-amber-800]="authService.isTech()"
           [class.bg-blue-950]="authService.isViewer()"
           [class.text-blue-300]="authService.isViewer()"
           [class.border-blue-800]="authService.isViewer()">
        <span>
          @if(authService.isAdmin()){ 🛡️ }
          @else if(authService.isTech()){ 👷 }
          @else { 👀 }
        </span>
        <span class="text-[11px]">{{ authService.currentUserRole() }}</span>
      </div>

      <button (click)="toggleMobileMenu()" class="p-2 text-slate-300 hover:text-white rounded-lg hover:bg-slate-800 focus:outline-none transition-colors" title="Abrir menu">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          @if (isMobileMenuOpen()) {
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          } @else {
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
          }
        </svg>
      </button>
    </div>
  </header>

  <!-- Sidebar (Desktop: Visible / Mobile: Drawer) -->
  <aside 
    [class.translate-x-0]="isMobileMenuOpen()"
    [class.-translate-x-full]="!isMobileMenuOpen()"
    class="fixed inset-y-0 left-0 w-64 bg-slate-900 text-white flex flex-col shadow-xl z-40 transition-transform duration-300 ease-in-out md:translate-x-0 md:relative md:inset-auto md:h-full">
    
    <!-- Logo (Desktop Only) -->
    <div class="hidden md:block p-6 border-b border-slate-800">
      <h1 class="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
        <span class="text-accent text-3xl">◆</span> ShopRateio
      </h1>
      <p class="text-slate-400 text-xs mt-1">Gestão Inteligente de Custos</p>
    </div>

    <!-- Role Switcher -->
    <div class="px-4 py-3 bg-slate-800 border-b border-slate-700 mt-14 md:mt-0">
      <label class="text-[10px] uppercase font-bold text-slate-500 mb-1 block">Modo de Acesso</label>
      <select 
        [ngModel]="authService.currentUserRole()" 
        (ngModelChange)="onRoleChange($event)"
        class="w-full bg-slate-900 border border-slate-600 text-white text-xs rounded p-2 focus:ring-1 focus:ring-accent outline-none">
        <option value="ADM">🛡️ Administrador</option>
        <option value="TEC">👷 Técnico (Leituras)</option>
        <option value="VIS">👀 Visualizador</option>
      </select>
    </div>

    <nav class="flex-1 p-4 space-y-2 overflow-y-auto">
      <button (click)="setView('dashboard')" 
        [class]="currentView() === 'dashboard' ? 'bg-accent text-white shadow-lg shadow-accent/20' : 'text-slate-300 hover:bg-slate-800 hover:text-white'"
        class="w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 group">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 opacity-70 group-hover:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
        <span class="font-medium">Dashboard</span>
      </button>

      <button (click)="setView('report')" 
        [class]="currentView() === 'report' ? 'bg-accent text-white shadow-lg shadow-accent/20' : 'text-slate-300 hover:bg-slate-800 hover:text-white'"
        class="w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 group">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 opacity-70 group-hover:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        <span class="font-medium">Relatório por Loja</span>
      </button>

      <button (click)="setView('calculator')" 
        [class]="currentView() === 'calculator' ? 'bg-accent text-white shadow-lg shadow-accent/20' : 'text-slate-300 hover:bg-slate-800 hover:text-white'"
        class="w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 group">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 opacity-70 group-hover:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
        <span class="font-medium">Calculadora</span>
      </button>

      <!-- Store Manager hidden for Techs -->
      @if (!authService.isTech()) {
        <button (click)="setView('stores')" 
          [class]="currentView() === 'stores' ? 'bg-accent text-white shadow-lg shadow-accent/20' : 'text-slate-300 hover:bg-slate-800 hover:text-white'"
          class="w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 group">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 opacity-70 group-hover:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
          <span class="font-medium">Lojas</span>
        </button>
      }

      <!-- PWA Install Button (Conditional) -->
      @if (deferredPrompt) {
        <button (click)="installPWA()" 
          class="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-green-600/20 text-green-400 hover:bg-green-600/30 transition-all duration-200 border border-green-600/30 mt-4">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          <span class="font-bold text-sm">Instalar Aplicativo</span>
        </button>
      }
    </nav>

    <!-- Dark Mode / Field OLED Switcher in Sidebar -->
    <div class="px-4 py-3 border-t border-slate-800 flex items-center justify-between bg-slate-900/60">
      <div class="flex items-center gap-2">
        <span class="text-base">{{ themeService.isDarkMode() ? '🌙' : '☀️' }}</span>
        <div class="flex flex-col">
          <span class="text-xs font-bold text-white">{{ themeService.isDarkMode() ? 'Modo Escuro (OLED)' : 'Modo Claro' }}</span>
          <span class="text-[9px] text-slate-400">Alto contraste para campo</span>
        </div>
      </div>
      <button type="button"
        (click)="themeService.toggleTheme()"
        class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none"
        [class.bg-teal-500]="themeService.isDarkMode()"
        [class.bg-slate-700]="!themeService.isDarkMode()"
        [title]="themeService.isDarkMode() ? 'Desativar modo escuro' : 'Ativar modo escuro'">
        <span class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out"
          [class.translate-x-5]="themeService.isDarkMode()"
          [class.translate-x-0]="!themeService.isDarkMode()"></span>
      </button>
    </div>
    
    <div class="p-4 border-t border-slate-800 flex items-center justify-between gap-3">
        <div class="flex items-center gap-3 truncate">
            <div class="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold shrink-0"
                 [class.text-green-400]="authService.isAdmin()"
                 [class.text-amber-400]="authService.isTech()"
                 [class.text-blue-400]="authService.isViewer()">
                {{ authService.currentUserRole() }}
            </div>
            <div class="flex flex-col truncate">
                <span class="text-xs font-bold text-white truncate">{{ authService.getRoleLabel(authService.currentUserRole()) }}</span>
                <span class="text-[10px] text-slate-500 truncate">
                   @if(authService.isAdmin()){ Acesso Total }
                   @else if(authService.isTech()){ Apenas Leituras }
                   @else { Somente Leitura }
                </span>
            </div>
        </div>

        <!-- Connection indicator -->
        <div class="flex items-center gap-1.5 shrink-0" [title]="indexedDb.isOnline() ? 'IndexedDB Online e Sincronizado' : 'IndexedDB Offline: dados seguros'">
          <span class="w-2 h-2 rounded-full" [class.bg-green-400]="indexedDb.isOnline()" [class.bg-amber-400]="!indexedDb.isOnline()"></span>
          <span class="text-[10px] text-slate-400 font-mono">{{ indexedDb.isOnline() ? 'Online' : 'Offline' }}</span>
        </div>
    </div>
  </aside>

  <!-- Overlay for mobile sidebar -->
  @if (isMobileMenuOpen()) {
    <div (click)="toggleMobileMenu()" class="fixed inset-0 bg-black/50 z-30 md:hidden backdrop-blur-sm"></div>
  }

  <!-- PASSWORD MODAL -->
  @if (showPasswordModal()) {
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
       <!-- Backdrop -->
       <div class="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" (click)="cancelPassword()"></div>
       
       <!-- Modal Content -->
       <div class="bg-white dark:bg-slate-900 border border-transparent dark:border-slate-800 text-slate-900 dark:text-white rounded-xl shadow-2xl p-6 w-full max-w-sm relative z-10 animate-fade-in transform scale-100">
           <div class="text-center mb-6">
               <div class="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-3 text-2xl">
                   🔒
               </div>
               <h3 class="text-lg font-bold text-slate-800 dark:text-white">Acesso Restrito</h3>
               <p class="text-sm text-slate-500 dark:text-slate-400">Digite a senha de administrador.</p>
           </div>
           
           <input 
              type="password" 
              [ngModel]="passwordAttempt()" 
              (ngModelChange)="passwordAttempt.set($event)"
              (keyup.enter)="confirmPassword()"
              placeholder="Senha"
              class="w-full px-4 py-3 border rounded-lg mb-2 focus:ring-2 focus:ring-slate-800 outline-none transition-all bg-white dark:bg-slate-950 text-slate-900 dark:text-white border-slate-300 dark:border-slate-700"
              [class.border-red-500]="passwordError()"
              [class.bg-red-50]="passwordError()"
              [class.dark:bg-red-950/30]="passwordError()"
           >
           
           @if (passwordError()) {
              <p class="text-xs text-red-500 font-bold mb-4 text-center">Senha incorreta. Tente novamente.</p>
           } @else {
              <div class="mb-4"></div>
           }

           <div class="flex gap-2">
              <button (click)="cancelPassword()" class="flex-1 py-2 text-slate-600 dark:text-slate-300 font-bold text-sm bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer">
                 Cancelar
              </button>
              <button (click)="confirmPassword()" class="flex-1 py-2 text-white font-bold text-sm bg-slate-900 dark:bg-teal-600 hover:bg-slate-800 dark:hover:bg-teal-700 rounded-lg transition-colors cursor-pointer">
                 Entrar
              </button>
           </div>
       </div>
    </div>
  }

  <!-- Main Content -->
  <main class="flex-1 overflow-y-auto p-3 sm:p-4 md:p-8 relative w-full pb-24 md:pb-8 bg-slate-100 dark:bg-slate-950 transition-colors duration-200">
    <header class="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 md:mb-8 gap-2">
      <div>
        <h2 class="text-xl md:text-2xl font-bold text-slate-800 dark:text-white">
          @switch (currentView()) {
            @case ('dashboard') { Visão Geral }
            @case ('report') { Relatório por Loja }
            @case ('calculator') { Rateio & Leituras de Campo }
            @case ('stores') { Gestão de Lojas }
          }
        </h2>
        <p class="text-xs md:text-base text-slate-500 dark:text-slate-400">
          @switch (currentView()) {
            @case ('dashboard') { Indicadores principais do shopping. }
            @case ('report') { Histórico de consumo e valores pagos para cada loja individualmente. }
            @case ('calculator') { Coleta e conferência de leituras em campo ou rateio geral. }
            @case ('stores') { Adicione ou remova lojas participantes. }
          }
        </p>
      </div>
    </header>

    @switch (currentView()) {
      @case ('dashboard') { <app-dashboard /> }
      @case ('report') { <app-store-report /> }
      @case ('calculator') { <app-bill-calculator /> }
      @case ('stores') { <app-store-manager /> }
    }
  </main>

  <!-- Mobile Bottom Navigation Bar (Barra Rápida para o Técnico em Campo) -->
  <nav class="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 text-white shadow-2xl flex items-center justify-around py-1.5 px-2 relative transition-opacity"
       [class.pointer-events-none]="navService.isRecentlyLocked()">
    
    <!-- Transparent Ghost-Click & Tap-Through Absorber Overlay (Bloqueia cliques vazados ao fechar a câmera nativa) -->
    @if (navService.isRecentlyLocked()) {
      <div class="absolute inset-0 z-50 bg-transparent pointer-events-auto cursor-default" 
           (click)="$event.stopPropagation(); $event.preventDefault()"></div>
    }

    <button 
      (click)="setView('calculator')"
      [class]="currentView() === 'calculator' ? 'text-teal-400 font-bold' : 'text-slate-400 hover:text-slate-200'"
      class="flex flex-col items-center justify-center flex-1 py-1 px-1 transition-all relative">
      <div class="relative">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
        @if (authService.isTech()) {
          <span class="absolute -top-1 -right-2 flex h-2 w-2">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
            <span class="relative inline-flex rounded-full h-2 w-2 bg-teal-500"></span>
          </span>
        }
      </div>
      <span class="text-[10px] mt-1 font-medium">Leituras</span>
    </button>

    <button 
      (click)="setView('dashboard')"
      [class]="currentView() === 'dashboard' ? 'text-teal-400 font-bold' : 'text-slate-400 hover:text-slate-200'"
      class="flex flex-col items-center justify-center flex-1 py-1 px-1 transition-all">
      <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
      </svg>
      <span class="text-[10px] mt-1 font-medium">Dashboard</span>
    </button>

    <button 
      (click)="setView('report')"
      [class]="currentView() === 'report' ? 'text-teal-400 font-bold' : 'text-slate-400 hover:text-slate-200'"
      class="flex flex-col items-center justify-center flex-1 py-1 px-1 transition-all">
      <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
      <span class="text-[10px] mt-1 font-medium">Relatório</span>
    </button>

    @if (!authService.isTech()) {
      <button 
        (click)="setView('stores')"
        [class]="currentView() === 'stores' ? 'text-teal-400 font-bold' : 'text-slate-400 hover:text-slate-200'"
        class="flex flex-col items-center justify-center flex-1 py-1 px-1 transition-all">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
        <span class="text-[10px] mt-1 font-medium">Lojas</span>
      </button>
    } @else {
      <button 
        (click)="toggleMobileMenu()"
        class="flex flex-col items-center justify-center flex-1 py-1 px-1 text-slate-400 hover:text-slate-200 transition-all">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
        </svg>
        <span class="text-[10px] mt-1 font-medium">Mais</span>
      </button>
    }
  </nav>
</div>
  `,
})
export class AppComponent {
  authService = inject(AuthService);
  indexedDb = inject(IndexedDbService);
  themeService = inject(ThemeService);
  navService = inject(NavigationService);
  currentView = computed(() => this.navService.currentView());
  
  // Mobile Menu State
  isMobileMenuOpen = signal(false);

  // Password Modal State
  showPasswordModal = signal(false);
  passwordAttempt = signal('');
  passwordError = signal(false);
  
  // Track previous role to revert if password fails
  private previousRole: UserRole = 'TEC'; 

  // PWA Install Prompt
  deferredPrompt: any = null;

  constructor() {
    // Sync local tracker with initial state
    this.previousRole = this.authService.currentUserRole();
    
    // Listen for PWA install prompt
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        this.deferredPrompt = e;
      });
    }
  }

  installPWA() {
      if (this.deferredPrompt) {
          this.deferredPrompt.prompt();
          this.deferredPrompt.userChoice.then((choiceResult: any) => {
              if (choiceResult.outcome === 'accepted') {
                  console.log('User accepted the install prompt');
              }
              this.deferredPrompt = null;
          });
      }
  }

  setView(view: View) {
    const changed = this.navService.setView(view);
    if (changed) {
      this.isMobileMenuOpen.set(false); // Close menu on navigation
    }
  }

  toggleMobileMenu() {
    this.isMobileMenuOpen.update(v => !v);
  }

  onRoleChange(newRole: string) {
    const role = newRole as UserRole;
    const current = this.authService.currentUserRole();
    
    // Se tentar mudar para ADM e não for ADM atualmente
    if (role === 'ADM' && current !== 'ADM') {
      this.previousRole = current; // Salva o estado anterior
      this.passwordAttempt.set('');
      this.passwordError.set(false);
      this.showPasswordModal.set(true); // Abre o modal
      
      // NOTA: Não atualizamos o authService ainda. 
      // O <select> na UI vai mudar visualmente, mas o estado real só muda se a senha for correta.
      // Se cancelar, forçamos o revert.
    } else {
      // Mudanças normais (para TEC ou VIS) não pedem senha
      this.authService.setRole(role);
      this.previousRole = role;
    }
  }

  confirmPassword() {
    if (this.authService.validateAdminPassword(this.passwordAttempt())) {
      this.authService.setRole('ADM');
      this.showPasswordModal.set(false);
      this.passwordAttempt.set('');
    } else {
      this.passwordError.set(true);
      // Shake animation effect could be added here
    }
  }

  cancelPassword() {
    this.showPasswordModal.set(false);
    this.passwordAttempt.set('');
    
    // Reverte visualmente o Select para o valor anterior
    // O hack do setTimeout é necessário porque o evento change já ocorreu no DOM
    const prev = this.previousRole;
    this.authService.setRole('VIS'); // Muda para um temporário para forçar refresh se prev for igual
    setTimeout(() => {
        this.authService.setRole(prev);
    }, 0);
  }
}