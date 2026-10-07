import { Component, inject, signal, computed, effect, untracked } from '@angular/core';
import { CommonModule, DecimalPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { StoreService, Store } from '../services/store.service';
import { HistoryService, BillData, StoreReading } from '../services/history.service';
import { AuthService } from '../services/auth.service';
import { ReportExportService } from '../services/report-export.service';
import { IndexedDbService, MeterPhotoRecord } from '../services/indexed-db.service';
import { GeminiService, MeterOcrResult } from '../services/gemini.service';

interface CostItem {
  id: string;
  name: string;
  value: number;
}

// Definição das colunas disponíveis para importação
type ColumnDef = {
  key: string;
  label: string;
  placeholder: string;
  width?: string;
};

@Component({
  selector: 'app-bill-calculator',
  standalone: true,
  imports: [CommonModule, FormsModule, DecimalPipe, DatePipe],
  template: `
    <div class="space-y-6 pb-20 md:pb-0">
      
      <!-- Top Bar: Month Selection, Utility Pills & Actions (Static flow on mobile & desktop so it doesn't freeze on screen) -->
      <div class="bg-white dark:bg-slate-900 p-3.5 md:p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-3 transition-colors">
        <div class="flex items-center justify-between gap-3 flex-wrap">
          <div class="flex flex-col">
            <label class="text-[10px] md:text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Mês de Referência</label>
            <input type="month" 
              [ngModel]="selectedMonth()" 
              (ngModelChange)="onMonthChange($event)"
              class="px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg focus:ring-2 focus:ring-teal-500 font-medium text-slate-700 dark:text-slate-200 text-xs sm:text-sm">
          </div>

          <!-- Utility Selector Pills with Counters -->
          <div class="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
            <button type="button" (click)="setUtility('luz')"
              [class]="utilityType() === 'luz' ? 'bg-teal-600 text-white shadow-xs font-bold' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 font-medium'"
              class="px-2.5 py-1.5 rounded-lg text-xs transition-all flex items-center gap-1.5 cursor-pointer">
              <span>⚡ Luz</span>
              <span class="text-[10px] px-1.5 py-0.2 rounded-full font-mono"
                    [class]="utilityType() === 'luz' ? 'bg-teal-700 text-teal-100' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'">
                {{ utilityStats().luz.completed }}/{{ utilityStats().luz.total }}
              </span>
            </button>
            <button type="button" (click)="setUtility('agua')"
              [class]="utilityType() === 'agua' ? 'bg-blue-600 text-white shadow-xs font-bold' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 font-medium'"
              class="px-2.5 py-1.5 rounded-lg text-xs transition-all flex items-center gap-1.5 cursor-pointer">
              <span>💧 Água</span>
              <span class="text-[10px] px-1.5 py-0.2 rounded-full font-mono"
                    [class]="utilityType() === 'agua' ? 'bg-blue-700 text-blue-100' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'">
                {{ utilityStats().agua.completed }}/{{ utilityStats().agua.total }}
              </span>
            </button>
            <button type="button" (click)="setUtility('gas')"
              [class]="utilityType() === 'gas' ? 'bg-red-600 text-white shadow-xs font-bold' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 font-medium'"
              class="px-2.5 py-1.5 rounded-lg text-xs transition-all flex items-center gap-1.5 cursor-pointer">
              <span>🔥 Gás</span>
              <span class="text-[10px] px-1.5 py-0.2 rounded-full font-mono"
                    [class]="utilityType() === 'gas' ? 'bg-red-700 text-red-100' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'">
                {{ utilityStats().gas.completed }}/{{ utilityStats().gas.total }}
              </span>
            </button>
          </div>
          
          <!-- Auto-Save Status Indicator -->
          <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors"
              [class]="saveStatus() === 'saving' ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800' : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'">
            @if (saveStatus() === 'saving') {
              <svg class="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>Salvando</span>
            } @else {
              <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
              <span>Salvo</span>
            }
          </div>

          <!-- IndexedDB Offline & Auto-Sync Pill -->
          @if (!indexedDb.isOnline()) {
            <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300"
                 title="Modo offline ativo: as leituras são gravadas com segurança no IndexedDB e serão sincronizadas quando houver conexão">
              <span>📡 Offline (IndexedDB)</span>
              @if (indexedDb.pendingCount() > 0) {
                <span class="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-200 text-amber-950 font-mono">
                  {{ indexedDb.pendingCount() }} pendente(s)
                </span>
              }
            </div>
          } @else if (indexedDb.pendingCount() > 0) {
            <button type="button" 
              (click)="indexedDb.syncPendingData()"
              [disabled]="indexedDb.syncStatus() === 'syncing'"
              class="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-900 border border-blue-300 hover:bg-blue-200 cursor-pointer transition-colors shadow-xs"
              title="Clique para sincronizar agora com o sistema">
              @if (indexedDb.syncStatus() === 'syncing') {
                <span class="animate-spin text-xs">⏳</span>
                <span>Sincronizando...</span>
              } @else {
                <span>🔄 Sincronizar ({{ indexedDb.pendingCount() }})</span>
              }
            </button>
          } @else {
            <div class="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200"
                 title="Banco local IndexedDB sincronizado">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              <span class="text-[11px]">IndexedDB OK</span>
            </div>
          }
        </div>

        <div class="flex items-center gap-2 justify-between lg:justify-end">
           <span class="hidden md:inline text-xs text-slate-400 italic">
             {{ lastSaved() ? 'Sincronizado: ' + (lastSaved() | date:'shortTime') : '' }}
           </span>

           <!-- Botão Exportar Excel no Topo -->
           <button 
             type="button"
             (click)="exportToExcel()" 
             [disabled]="isExportingExcel() || tableData().length === 0"
             class="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed whitespace-nowrap ml-auto"
             title="Exportar demonstrativo completo de rateio em planilha Excel (.xlsx)">
             @if (isExportingExcel()) {
               <span class="animate-spin text-xs">⏳</span>
               <span>Exportando...</span>
             } @else {
               <span>📊</span>
               <span>Exportar Excel</span>
             }
           </button>
        </div>
      </div>

      <!-- Offline Notice Banner for Field Technicians -->
      @if (!indexedDb.isOnline()) {
        <div class="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 flex items-center justify-between gap-3 text-xs shadow-xs animate-fade-in">
          <div class="flex items-center gap-2">
            <span class="text-base shrink-0">📡</span>
            <div>
              <strong class="font-bold">Modo Offline Ativo (IndexedDB):</strong>
              <span class="ml-1 text-amber-800 dark:text-amber-300">
                Você pode continuar preenchendo as leituras em campo normalmente sem internet. Seus dados estão 100% seguros no armazenamento local do aparelho e serão sincronizados automaticamente assim que você reconectar.
              </span>
            </div>
          </div>
          @if (indexedDb.pendingCount() > 0) {
            <span class="px-2 py-0.5 bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-200 rounded-full font-mono font-bold text-[10px] whitespace-nowrap shrink-0">
              {{ indexedDb.pendingCount() }} pendente(s)
            </span>
          }
        </div>
      }

      <div class="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        <!-- Left Column: Inputs (Collapsible on Mobile for Techs) -->
        <div class="xl:col-span-1 space-y-6">
          
          <!-- Utility Config Card -->
          <div class="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden transition-colors">
            
            <!-- Mobile Toggle Header for Config -->
            <button (click)="toggleConfigVisibility()" class="w-full md:hidden flex justify-between items-center p-4 bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800">
               <h2 class="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2">
                 <span class="p-1 rounded bg-slate-200 dark:bg-slate-700 text-xs">⚙️</span> Configuração
               </h2>
               <svg class="w-5 h-5 text-slate-500 dark:text-slate-400 transform transition-transform" [class.rotate-180]="isConfigOpen()" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
               </svg>
            </button>

            <!-- Config Content -->
            <div [class.hidden]="!isConfigOpen() && isMobile()" class="p-6 md:block space-y-6">
              
              <!-- Selector -->
              <div>
                <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Tipo de Despesa</label>
                <div class="flex rounded-md shadow-sm" role="group">
                  <button type="button" (click)="setUtility('luz')" 
                    [class]="utilityType() === 'luz' ? 'bg-teal-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'"
                    class="flex-1 px-2 py-2 text-sm font-medium border border-slate-300 dark:border-slate-700 rounded-l-lg focus:z-10 focus:ring-2 focus:ring-teal-500 transition-colors">
                    ⚡ Luz
                  </button>
                  <button type="button" (click)="setUtility('agua')" 
                    [class]="utilityType() === 'agua' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'"
                    class="flex-1 px-2 py-2 text-sm font-medium border-t border-b border-slate-300 dark:border-slate-700 focus:z-10 focus:ring-2 focus:ring-blue-500 transition-colors">
                    💧 Água
                  </button>
                  <button type="button" (click)="setUtility('gas')" 
                    [class]="utilityType() === 'gas' ? 'bg-red-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'"
                    class="flex-1 px-2 py-2 text-sm font-medium border border-slate-300 dark:border-slate-700 rounded-r-lg focus:z-10 focus:ring-2 focus:ring-red-500 transition-colors">
                    🔥 Gás
                  </button>
                </div>
              </div>

              <!-- DETAILED FORM -->
              <div class="animate-fade-in space-y-6">
                <!-- Section 1: Dynamic Costs Breakdown -->
                <div class="space-y-3 p-4 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200 dark:border-slate-700">
                  <div class="flex justify-between items-center border-b border-slate-200 dark:border-slate-700 pb-2 mb-2">
                    <h3 class="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Custos (R$)</h3>
                    @if (authService.canConfigureBill()) {
                      <button (click)="addCostItem()" class="text-xs flex items-center gap-1 text-accent font-medium hover:text-blue-700 transition-colors">
                        <span>+ Item</span>
                      </button>
                    }
                  </div>
                  
                  <div class="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                    @for (item of currentCostItems(); track item.id) {
                      <div class="flex items-center gap-2 group animate-fade-in">
                        <input type="text" 
                          [ngModel]="item.name" 
                          (ngModelChange)="updateItemName(item.id, $event)"
                          [disabled]="!authService.canConfigureBill()"
                          class="w-full px-2 py-1 text-xs border border-transparent bg-transparent hover:bg-white dark:hover:bg-slate-700 hover:border-slate-300 dark:hover:border-slate-600 focus:bg-white dark:focus:bg-slate-700 focus:border-accent rounded transition-colors text-slate-700 dark:text-slate-200 disabled:opacity-75"
                          placeholder="Nome">
                        
                        <input type="number" 
                          step="0.01"
                          [ngModel]="item.value" 
                          (ngModelChange)="updateItemValue(item.id, $event)"
                          [disabled]="!authService.canConfigureBill()"
                          class="w-24 px-2 py-1 text-sm border border-slate-300 dark:border-slate-700 rounded text-right font-mono focus:ring-1 focus:ring-warning bg-white dark:bg-slate-800 text-slate-900 dark:text-white disabled:bg-slate-100 dark:disabled:bg-slate-900" 
                          placeholder="0.00">
                        
                        @if (authService.canConfigureBill()) {
                          <button (click)="removeCostItem(item.id)" 
                            class="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors md:opacity-0 group-hover:opacity-100">
                            ×
                          </button>
                        }
                      </div>
                    }
                  </div>
                  
                  <div class="pt-2 mt-2 border-t border-slate-200 flex justify-end">
                      <span class="text-xs text-slate-500 mr-2">Subtotal:</span>
                      <span class="text-sm font-mono font-bold text-slate-700">{{ totalBillAmount() | currency:'BRL' }}</span>
                  </div>
                </div>

                <!-- Section 2: Consumption Inputs -->
                <div class="space-y-3 p-4 bg-slate-50 rounded-lg border border-slate-200">
                  <h3 class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 border-b border-slate-200 pb-1">
                    @if(utilityType() === 'luz') { Entrada (kWh) } @else { Consumo (m³) }
                  </h3>
                  
                  @if (utilityType() === 'luz') {
                    <div class="grid grid-cols-1 gap-2">
                      @for (key of ['bss1', 'bss2', 'bss3', 'bss4']; track key) {
                        <div class="flex items-center gap-2">
                           <label class="text-xs text-slate-600 w-1/2 uppercase">{{ key }}</label>
                           <input type="number" step="0.0001" [disabled]="!authService.canConfigureBill()" 
                           [ngModel]="luzConsumption()[key]" (ngModelChange)="updateLuzCons(key, $event)" 
                           class="w-1/2 px-2 py-1 text-sm border border-slate-300 rounded text-right font-mono focus:ring-1 focus:ring-warning disabled:bg-slate-100" placeholder="0">
                        </div>
                      }
                    </div>
                  } @else {
                    <div class="flex items-center gap-2">
                      <label class="text-xs text-slate-600 w-1/2">Total (m³)</label>
                      <input type="number" step="0.0001" [disabled]="!authService.canConfigureBill()" 
                      [ngModel]="utilityType() === 'agua' ? aguaTotalReading() : gasTotalReading()" 
                      (ngModelChange)="utilityType() === 'agua' ? aguaTotalReading.set($event) : gasTotalReading.set($event)" 
                      class="w-1/2 px-2 py-1 text-sm border border-slate-300 rounded text-right font-mono focus:ring-1 focus:ring-accent disabled:bg-slate-100" placeholder="0">
                    </div>
                  }
                </div>
              </div>

              <!-- Summary Box -->
              <div class="p-4 bg-slate-800 text-white rounded-lg shadow-sm">
                <div class="flex justify-between text-sm mb-1">
                  <span class="text-slate-300">Custo Total:</span>
                  <span class="font-mono">{{ totalBillAmount() | currency:'BRL' }}</span>
                </div>
                <div class="flex justify-between text-sm mb-3">
                  <span class="text-slate-300">Consumo Total:</span>
                  <span class="font-mono">{{ totalConsumption() | number:'1.0-4' }} {{ getUnit() }}</span>
                </div>
                <div class="pt-3 border-t border-slate-600">
                  <div class="flex justify-between items-center">
                    <span class="text-xs text-slate-300 font-medium uppercase tracking-wider">Preço Unit.</span>
                    <span class="font-bold text-lg text-warning font-mono">{{ calculatedUnitPrice() | currency:'BRL':'symbol':'1.4-4' }}</span>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>

        <!-- Right Column: Stores Table & Final Summary -->
        <div class="xl:col-span-2 flex flex-col gap-6">
          
          <!-- Main Table/Card Container -->
          <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
            <div class="p-3.5 md:p-5 border-b border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center bg-slate-50 gap-3">
              <div>
                <h2 class="text-base md:text-lg font-bold text-slate-800 flex items-center gap-2">
                  <span>Leituras & Coleta — {{ utilityType() | uppercase }}</span>
                  <span class="text-xs px-2 py-0.5 rounded-full font-medium"
                        [class]="utilityType() === 'luz' ? 'bg-teal-100 text-teal-800' : (utilityType() === 'agua' ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800')">
                    {{ getUnit() }}
                  </span>
                </h2>
                <p class="text-[11px] text-slate-500 font-medium mt-0.5">
                  Preencha as leituras em campo ou confira o rateio mensal.
                </p>
              </div>

              <div class="flex flex-wrap items-center gap-2 w-full md:w-auto justify-between md:justify-end">
                 <!-- Botão Exportar Excel -->
                 <button (click)="exportToExcel()" 
                    [disabled]="isExportingExcel() || tableData().length === 0"
                    class="text-xs px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                    title="Exportar demonstrativo completo de rateio em planilha Excel (.xlsx)">
                    @if (isExportingExcel()) {
                      <span class="animate-spin text-xs">⏳</span>
                      <span>Exportando...</span>
                    } @else {
                      <span>📊</span>
                      <span>Exportar Excel</span>
                    }
                 </button>

                 <!-- Botão Importar (ADM) -->
                 @if (authService.canImport()) {
                   <button (click)="toggleImport()" 
                      class="text-xs px-3 py-1.5 bg-teal-50 text-teal-700 hover:bg-teal-100 border border-teal-200 rounded font-medium transition-colors flex items-center gap-1 whitespace-nowrap">
                      <span class="md:hidden">Importar</span>
                      <span class="hidden md:inline">Importar por colunas (Grid)</span>
                   </button>
                 }
                 <div class="text-xs md:text-sm text-slate-600 md:ml-2 whitespace-nowrap">
                    Total: <strong class="text-slate-900">{{ totalDistributedCost() | currency:'BRL' }}</strong>
                 </div>
              </div>
            </div>

            <!-- IMPORT AREA: COLUMNAR PASTE -->
            @if (showImport()) {
              <div class="bg-teal-50 p-4 md:p-6 border-b border-teal-100 animate-fade-in">
                 <div class="flex justify-between items-start mb-4">
                    <div>
                      <h4 class="text-base font-bold text-teal-800">Importação por Colunas</h4>
                      <p class="text-xs text-teal-600 mt-1 hidden md:block">
                         Copie as colunas do seu Excel e cole nas caixas abaixo. 
                      </p>
                    </div>
                    <button (click)="toggleImport()" class="text-teal-400 hover:text-teal-600 font-bold text-lg">✕</button>
                 </div>

                 <!-- GRID INPUTS -->
                 <div class="flex gap-2 overflow-x-auto pb-4 snap-x">
                    @for (col of importColumns(); track col.key; let idx = $index) {
                      <div class="flex-shrink-0 flex flex-col gap-1 w-[120px] snap-start">
                         <label class="text-[10px] font-bold text-teal-700 uppercase truncate">{{ col.label }}</label>
                         <textarea 
                            [placeholder]="col.placeholder"
                            [value]="getPastedColumnValue(col.key)"
                            (paste)="onPasteColumn($event, col.key, idx)"
                            (input)="onInputColumn($event, col.key)"
                            class="w-full h-32 md:h-48 p-2 text-xs font-mono border border-teal-300 rounded focus:ring-2 focus:ring-teal-500 bg-white shadow-inner resize-none whitespace-pre overflow-y-scroll"></textarea>
                      </div>
                    }
                 </div>

                 <div class="flex flex-col md:flex-row justify-between items-center bg-teal-100 p-2 rounded gap-2">
                    <div class="flex items-center gap-2 w-full md:w-auto justify-between md:justify-start">
                      <label class="flex items-center gap-1 cursor-pointer text-xs text-teal-800">
                          <input type="checkbox" [ngModel]="skipHeader()" (ngModelChange)="skipHeader.set($event)" class="rounded text-teal-600">
                          Ignorar cabeçalho
                      </label>
                      <span class="text-xs font-bold text-teal-700">Linhas: {{ detectedRows() }}</span>
                    </div>

                    <button (click)="executeColumnImport()" 
                      [disabled]="detectedRows() === 0"
                      class="w-full md:w-auto px-4 py-2 bg-teal-600 text-white rounded hover:bg-teal-700 transition-colors shadow-sm font-bold text-xs uppercase tracking-wide disabled:opacity-50 disabled:cursor-not-allowed">
                       Processar
                    </button>
                 </div>
              </div>
            }

            <!-- FIELD TECHNICIAN CONTROL CENTER (Painel de Progresso, Busca e Filtros de Campo) -->
            <div class="p-3.5 md:p-4 bg-slate-50/80 dark:bg-slate-900/90 border-b border-slate-200 dark:border-slate-800 flex flex-col gap-3 transition-colors">
              
              <!-- Progress Bar & Mode Toggle -->
              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div class="flex-1">
                  <div class="flex justify-between items-center text-xs mb-1.5">
                    <span class="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <span>👷 Coleta em Campo:</span>
                      <strong class="text-teal-700 dark:text-teal-400">{{ fieldStats().completed }} de {{ fieldStats().total }}</strong> lojas lidas
                      @if (fieldStats().pending === 0 && fieldStats().total > 0) {
                        <span class="bg-green-100 dark:bg-green-950/60 text-green-700 dark:text-green-300 text-[10px] px-2 py-0.5 rounded-full font-bold border border-green-300 dark:border-green-800">✓ 100% Concluído</span>
                      }
                    </span>
                    <span class="font-mono font-bold text-slate-600 dark:text-slate-400">{{ fieldStats().progressPct }}%</span>
                  </div>
                  
                  <!-- Visual Progress Bar -->
                  <div class="w-full bg-slate-200 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden shadow-inner">
                    <div class="h-full bg-gradient-to-r from-teal-500 to-emerald-500 rounded-full transition-all duration-300"
                         [style.width.%]="fieldStats().progressPct"></div>
                  </div>
                </div>

                <!-- Mobile View Mode Toggle (Cards vs Step Rota) -->
                <div class="flex items-center gap-1 bg-white dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700 self-start sm:self-auto shrink-0 md:hidden">
                  <button type="button" 
                    (click)="mobileViewMode.set('cards')"
                    [class]="mobileViewMode() === 'cards' ? 'bg-slate-900 dark:bg-teal-600 text-white font-bold' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'"
                    class="px-2.5 py-1 text-xs rounded transition-all flex items-center gap-1 cursor-pointer">
                    <span>📱 Lista</span>
                  </button>
                  <button type="button" 
                    (click)="mobileViewMode.set('step')"
                    [class]="mobileViewMode() === 'step' ? 'bg-teal-600 dark:bg-teal-500 text-white font-bold' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'"
                    class="px-2.5 py-1 text-xs rounded transition-all flex items-center gap-1 cursor-pointer"
                    title="Modo focado para caminhar loja por loja">
                    <span>🎯 Modo Rota</span>
                  </button>
                </div>
              </div>

              <!-- Search Bar & Status Filter Chips -->
              <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                <!-- Search Box -->
                <div class="relative flex-1">
                  <span class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 text-xs">🔍</span>
                  <input type="text" 
                    [ngModel]="searchQuery()" 
                    (ngModelChange)="searchQuery.set($event)"
                    placeholder="Buscar loja por Nome, LUC ou Contrato..." 
                    class="w-full pl-8 pr-8 py-2 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 transition-colors">
                  @if (searchQuery()) {
                    <button (click)="searchQuery.set('')" class="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs cursor-pointer">
                      ✕
                    </button>
                  }
                </div>

                <!-- Filter Chips -->
                <div class="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 shrink-0">
                  <button type="button" 
                    (click)="statusFilter.set('all')"
                    [class]="statusFilter() === 'all' ? 'bg-slate-800 dark:bg-slate-700 text-white font-bold shadow-xs' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'"
                    class="px-2.5 py-1.5 rounded-lg text-xs whitespace-nowrap transition-all cursor-pointer">
                    Todas ({{ fieldStats().total }})
                  </button>

                  <button type="button" 
                    (click)="statusFilter.set('pending')"
                    [class]="statusFilter() === 'pending' ? 'bg-amber-600 text-white font-bold shadow-xs' : 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-950/60 border border-amber-200 dark:border-amber-800'"
                    class="px-2.5 py-1.5 rounded-lg text-xs whitespace-nowrap transition-all cursor-pointer font-medium flex items-center gap-1">
                    <span>⚠️ Pendentes</span>
                    <span class="px-1.5 py-0.2 rounded-full text-[10px]"
                          [class]="statusFilter() === 'pending' ? 'bg-amber-700 text-white' : 'bg-amber-200/80 dark:bg-amber-900 text-amber-900 dark:text-amber-200'">
                      {{ fieldStats().pending }}
                    </span>
                  </button>

                  <button type="button" 
                    (click)="statusFilter.set('completed')"
                    [class]="statusFilter() === 'completed' ? 'bg-green-600 text-white font-bold shadow-xs' : 'bg-green-50 dark:bg-green-950/40 text-green-800 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-950/60 border border-green-200 dark:border-green-800'"
                    class="px-2.5 py-1.5 rounded-lg text-xs whitespace-nowrap transition-all cursor-pointer font-medium flex items-center gap-1">
                    <span>✅ Lidas</span>
                    <span class="px-1.5 py-0.2 rounded-full text-[10px]"
                          [class]="statusFilter() === 'completed' ? 'bg-green-700 text-white' : 'bg-green-200/80 dark:bg-green-900 text-green-900 dark:text-green-200'">
                      {{ fieldStats().completed }}
                    </span>
                  </button>

                  @if (fieldStats().alerts > 0) {
                    <button type="button" 
                      (click)="statusFilter.set('alert')"
                      [class]="statusFilter() === 'alert' ? 'bg-red-600 text-white font-bold shadow-xs' : 'bg-red-50 dark:bg-rose-950/50 text-red-700 dark:text-rose-300 hover:bg-red-100 dark:hover:bg-rose-950/70 border border-red-200 dark:border-rose-800'"
                      class="px-2.5 py-1.5 rounded-lg text-xs whitespace-nowrap transition-all cursor-pointer font-medium flex items-center gap-1">
                      <span>🚨 Alertas</span>
                      <span class="px-1.5 py-0.2 rounded-full text-[10px]"
                            [class]="statusFilter() === 'alert' ? 'bg-red-700 text-white' : 'bg-red-200/80 dark:bg-rose-900 text-red-900 dark:text-rose-200'">
                        {{ fieldStats().alerts }}
                      </span>
                    </button>
                  }
                </div>
              </div>
            </div>

            <!-- DESKTOP TABLE VIEW (Hidden on Mobile) -->
            <div class="hidden md:block overflow-x-auto">
              <table class="w-full text-left border-collapse text-sm">
                <thead class="bg-teal-700 text-white sticky top-0 z-10 shadow-sm">
                  <tr>
                    <th class="p-3 font-semibold uppercase text-xs w-28 border-r border-teal-600">Loja</th>
                    <th class="p-3 font-semibold uppercase text-xs text-center w-20 border-r border-teal-600">Ant.</th>
                    <th class="p-3 font-semibold uppercase text-xs text-right w-24 border-r border-teal-600">Leitura</th>
                    @if (utilityType() === 'luz') {
                      <th class="p-3 font-semibold uppercase text-xs text-center w-16 border-r border-teal-600">Const.</th>
                    }
                    <th class="p-3 font-semibold uppercase text-xs text-right w-20 border-r border-teal-600">Virtual</th>
                    @if (utilityType() === 'gas') {
                       <th class="p-3 font-semibold uppercase text-xs text-center w-16 border-r border-teal-600">Aj(x)</th>
                       <th class="p-3 font-semibold uppercase text-xs text-center w-16 border-r border-teal-600">Aj(+)</th>
                       <th class="p-3 font-semibold uppercase text-xs text-center w-16 border-r border-teal-600">FCM</th>
                    } @else {
                       <th class="p-3 font-semibold uppercase text-xs text-center w-16 border-r border-teal-600">Ajuste</th>
                    }
                    <th class="p-3 font-semibold uppercase text-xs text-right w-24 border-r border-teal-600">
                        {{ utilityType() === 'gas' ? 'Cons. FCC' : 'Consumo' }}
                    </th>
                    <th class="p-3 font-semibold uppercase text-xs text-right w-16 border-r border-teal-600">Var (%)</th>
                    @if (utilityType() === 'gas') {
                        <th class="p-3 font-semibold uppercase text-xs text-right w-24 border-r border-teal-600">Fluxo</th>
                    }
                    <th class="p-3 font-semibold uppercase text-xs text-right w-24 border-r border-teal-600">Obs. Campo</th>
                    <th class="p-3 font-semibold uppercase text-xs text-center w-24 border-r border-teal-600">Foto Medidor</th>
                    <th class="p-3 font-semibold uppercase text-xs text-right w-28 bg-teal-800">Custo Total</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900 transition-colors">
                  @for (item of filteredTableData(); track item.storeId) {
                    <tr class="hover:bg-teal-50/50 dark:hover:bg-teal-950/40 transition-colors group text-xs"
                        [class.bg-rose-50/90]="item.validationAlert.severity === 'critical'"
                        [class.dark:bg-rose-950/40]="item.validationAlert.severity === 'critical'"
                        [class.bg-amber-50/70]="item.validationAlert.severity === 'warning'"
                        [class.dark:bg-amber-950/30]="item.validationAlert.severity === 'warning'">
                      <td class="p-3 font-medium text-slate-800 dark:text-slate-100 border-r border-slate-100 dark:border-slate-800">
                          <div class="truncate max-w-[140px] font-semibold flex items-center gap-1.5" [title]="item.storeName">
                            <span>{{ item.storeName }}</span>
                            @if (item.validationAlert.hasAlert) {
                              <span class="text-[10px] px-1.5 py-0.5 rounded font-black cursor-help shrink-0 shadow-2xs"
                                [class.bg-rose-600]="item.validationAlert.severity === 'critical'"
                                [class.text-white]="item.validationAlert.severity === 'critical'"
                                [class.bg-amber-500]="item.validationAlert.severity === 'warning'"
                                [class.text-slate-950]="item.validationAlert.severity === 'warning'"
                                [title]="item.validationAlert.message">
                                {{ item.validationAlert.badgeLabel }}
                              </span>
                            }
                          </div>
                          <div class="text-[10px] text-slate-400 font-mono flex items-center gap-1.5 mt-0.5">
                            <span class="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-1 py-0.5 rounded font-semibold">{{ item.luc }}</span>
                            @if (item.contrato) {
                              <span class="text-slate-300 dark:text-slate-600">•</span>
                              <span class="text-slate-500 dark:text-slate-400 font-medium">Ctr: {{ item.contrato }}</span>
                            }
                          </div>
                      </td>
                      <td class="p-3 text-center text-slate-400 dark:text-slate-400 font-mono border-r border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                        {{ item.prevReading | number:'1.0-0' }}
                      </td>
                      <td class="p-3 border-r border-slate-100 dark:border-slate-800">
                         <div class="flex items-center gap-1">
                            <input type="number" 
                              step="0.0001" 
                              inputmode="decimal"
                              [ngModel]="item.currentReading" 
                              (ngModelChange)="updateDetailedReading(item.storeId, 'reading', $event)" 
                              (paste)="onPasteCell($event, item.storeId, 'reading')" 
                              [disabled]="!authService.canEditReadings()" 
                              class="w-full text-right bg-white dark:bg-slate-950 dark:text-white border-2 rounded px-1.5 py-1 focus:ring-2 font-bold disabled:bg-transparent disabled:border-none disabled:text-slate-500 transition-colors"
                              [class.border-rose-500]="item.validationAlert.severity === 'critical'"
                              [class.ring-2]="item.validationAlert.hasAlert"
                              [class.ring-rose-400]="item.validationAlert.severity === 'critical'"
                              [class.border-amber-500]="item.validationAlert.severity === 'warning'"
                              [class.ring-amber-400]="item.validationAlert.severity === 'warning'"
                              [class.border-emerald-400]="item.isRead && !item.validationAlert.hasAlert"
                              [class.border-slate-300]="!item.isRead"
                              [class.dark:border-slate-700]="!item.isRead"
                              [title]="item.validationAlert.hasAlert ? item.validationAlert.message : ''"
                              placeholder="0">
                         </div>
                      </td>
                      
                      @if (utilityType() === 'luz') {
                          <td class="p-3 border-r border-slate-100 dark:border-slate-800">
                              <input type="number" step="0.0001" [ngModel]="item.constant" (ngModelChange)="updateDetailedReading(item.storeId, 'constant', $event)" (paste)="onPasteCell($event, item.storeId, 'constant')" [disabled]="!authService.canConfigureBill()" class="w-full text-center bg-transparent border-b border-transparent hover:border-slate-300 focus:border-teal-500 text-slate-600 dark:text-slate-300 disabled:opacity-50" placeholder="1">
                          </td>
                      }
                      <td class="p-3 border-r border-slate-100 dark:border-slate-800">
                          <input type="number" step="0.0001" [ngModel]="item.virtual" (ngModelChange)="updateDetailedReading(item.storeId, 'virtual', $event)" (paste)="onPasteCell($event, item.storeId, 'virtual')" [disabled]="!authService.canConfigureBill()" class="w-full text-right bg-transparent border border-slate-200 dark:border-slate-700 rounded px-1 py-0.5 focus:border-teal-500 text-blue-600 dark:text-blue-400 placeholder-slate-300 disabled:border-none disabled:text-slate-400" placeholder="-">
                      </td>

                      @if (utilityType() === 'gas') {
                          <td class="p-3 border-r border-slate-100 dark:border-slate-800">
                              <input type="number" step="0.000001" [ngModel]="item.adjustment" (ngModelChange)="updateDetailedReading(item.storeId, 'adjustment', $event)" (paste)="onPasteCell($event, item.storeId, 'adjustment')" [disabled]="!authService.canConfigureBill()" class="w-full text-center bg-transparent border-b border-transparent hover:border-slate-300 focus:border-teal-500 text-slate-500 dark:text-slate-400 disabled:opacity-50" placeholder="1.347">
                          </td>
                          <td class="p-3 border-r border-slate-100 dark:border-slate-800">
                              <input type="number" step="0.000001" [ngModel]="item.adjustmentAdd" (ngModelChange)="updateDetailedReading(item.storeId, 'adjustmentAdd', $event)" (paste)="onPasteCell($event, item.storeId, 'adjustmentAdd')" [disabled]="!authService.canConfigureBill()" class="w-full text-center bg-transparent border-b border-transparent hover:border-slate-300 focus:border-teal-500 text-slate-500 dark:text-slate-400 disabled:opacity-50" placeholder="0">
                          </td>
                           <td class="p-3 border-r border-slate-100 dark:border-slate-800">
                              <input type="number" step="0.000001" [ngModel]="item.fcm" (ngModelChange)="updateDetailedReading(item.storeId, 'fcm', $event)" (paste)="onPasteCell($event, item.storeId, 'fcm')" [disabled]="!authService.canConfigureBill()" class="w-full text-center bg-transparent border-b border-transparent hover:border-slate-300 focus:border-teal-500 text-slate-500 dark:text-slate-400 disabled:opacity-50" placeholder="1.0727">
                          </td>
                      } @else {
                          <td class="p-3 border-r border-slate-100 dark:border-slate-800">
                            <input type="number" step="0.000001" [ngModel]="item.adjustment" (ngModelChange)="updateDetailedReading(item.storeId, 'adjustment', $event)" (paste)="onPasteCell($event, item.storeId, 'adjustment')" [disabled]="!authService.canConfigureBill()" class="w-full text-center bg-transparent border-b border-transparent hover:border-slate-300 focus:border-teal-500 text-slate-500 dark:text-slate-400 disabled:opacity-50" placeholder="1">
                          </td>
                      }
                      <td class="p-3 text-right font-mono font-bold text-slate-800 dark:text-slate-100 border-r border-slate-100 dark:border-slate-800 text-sm">
                        {{ item.consumption | number:'1.0-4' }}
                      </td>
                      <td class="p-3 text-right font-mono text-[10px] border-r border-slate-100 dark:border-slate-800" 
                          [class.text-red-500]="item.variation > 0" 
                          [class.text-green-500]="item.variation < 0">
                          {{ item.variation > 0 ? '+' : '' }}{{ item.variation | number:'1.1-1' }}%
                      </td>
                      @if (utilityType() === 'gas') {
                          <td class="p-3 border-r border-slate-100 dark:border-slate-800">
                              <input type="number" step="0.01" [ngModel]="item.fluxoCost" (ngModelChange)="updateDetailedReading(item.storeId, 'fluxoCost', $event)" (paste)="onPasteCell($event, item.storeId, 'fluxoCost')" [disabled]="!authService.canConfigureBill()" class="w-full text-right bg-transparent border-b border-transparent hover:border-slate-300 focus:border-teal-500 text-slate-600 dark:text-slate-300 disabled:opacity-50" placeholder="0.00">
                          </td>
                      }
                      <!-- Observação de Campo Desktop -->
                      <td class="p-3 border-r border-slate-100 dark:border-slate-800 text-right">
                        @if (item.note) {
                          <span class="inline-block max-w-[100px] truncate bg-amber-50 dark:bg-amber-950/50 text-amber-900 dark:text-amber-200 border border-amber-200 dark:border-amber-800 px-1.5 py-0.5 rounded text-[10px]" [title]="item.note">
                            {{ item.note }}
                          </span>
                        } @else {
                          <button (click)="openNoteEditor(item.storeId)" class="text-[10px] text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 transition-colors cursor-pointer">
                            + nota
                          </button>
                        }
                      </td>
                      <!-- Foto do Medidor Desktop -->
                      <td class="p-3 border-r border-slate-100 dark:border-slate-800 text-center">
                        @if (isReadingOcr() === item.storeId) {
                          <span class="inline-flex items-center gap-1 text-[10px] text-indigo-700 dark:text-indigo-300 font-bold animate-pulse">
                            <span class="animate-spin text-xs">⚡</span>
                            <span>Lendo IA...</span>
                          </span>
                        } @else if (meterPhotos()[item.storeId]) {
                          <div class="inline-flex items-center gap-1">
                            <button type="button" 
                              (click)="openPhotoViewer(item.storeId)" 
                              class="inline-flex items-center gap-1 px-2 py-0.5 bg-teal-50 dark:bg-teal-950/60 hover:bg-teal-100 text-teal-800 dark:text-teal-300 border border-teal-200 dark:border-teal-800 rounded text-[10px] font-bold transition-all cursor-pointer shadow-xs"
                              title="Ver foto de evidência gravada no IndexedDB">
                              <span>📷 Foto</span>
                            </button>
                            <button type="button" 
                              (click)="runOcrOnPhoto(item.storeId)"
                              class="inline-flex items-center px-1.5 py-0.5 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded text-[9px] font-bold transition-all cursor-pointer shadow-xs"
                              title="Ler visor com Qwen 3.8 27B (Groq) ou Gemini">
                              <span>⚡</span>
                            </button>
                          </div>
                        } @else {
                          <label class="cursor-pointer text-[10px] text-slate-400 hover:text-teal-700 dark:hover:text-teal-400 inline-flex items-center gap-0.5 transition-colors">
                            <span>+ foto</span>
                            <input type="file" 
                              accept="image/*" 
                              capture="environment" 
                              (change)="onPhotoCaptured($event, item.storeId, item.storeName, item.luc, item.currentReading)" 
                              class="hidden">
                          </label>
                        }
                      </td>
                      <td class="p-3 text-right font-mono font-bold text-teal-800 dark:text-teal-400 bg-teal-50/30 dark:bg-teal-950/20">
                        {{ item.cost | currency:'BRL' }}
                      </td>
                    </tr>
                  }
                  @if (filteredTableData().length === 0) {
                    <tr>
                      <td colspan="12" class="p-8 text-center text-slate-400 text-xs">
                        Nenhuma loja encontrada para os filtros selecionados.
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>

            <!-- MOBILE INTERFACE (Visível apenas em dispositivos móveis / telas menores) -->
            <div class="md:hidden">

              <!-- MODO 1: LISTA DE CARDS OTIMIZADA PARA O TÉCNICO -->
              @if (mobileViewMode() === 'cards') {
                <div class="flex flex-col divide-y divide-slate-200 dark:divide-slate-800 bg-slate-100 dark:bg-slate-950">
                  @for (item of filteredTableData(); track item.storeId) {
                     <div class="p-4 bg-white dark:bg-slate-900 transition-colors"
                          [class.border-l-4]="true"
                          [class.border-l-rose-500]="item.validationAlert.severity === 'critical'"
                          [class.border-l-amber-500]="item.validationAlert.severity === 'warning'"
                          [class.border-l-emerald-500]="item.isRead && !item.validationAlert.hasAlert"
                          [class.border-l-slate-300]="!item.isRead"
                          [class.dark:border-l-slate-700]="!item.isRead">
                        
                        <!-- Header do Card: LUC, Nome e Status -->
                        <div class="flex justify-between items-start mb-2.5">
                           <div class="flex-1 pr-2">
                             <div class="flex items-center gap-1.5 flex-wrap">
                               <span class="text-xs font-mono font-extrabold text-white bg-slate-900 dark:bg-slate-800 px-2 py-0.5 rounded-md shadow-xs border border-transparent dark:border-slate-700">
                                 {{ item.luc }}
                               </span>
                                @if (item.contrato) {
                                  <span class="text-[11px] font-mono text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                                    Ctr: {{ item.contrato }}
                                  </span>
                                }
                             </div>
                             <div class="font-bold text-slate-900 dark:text-white text-base mt-1 leading-tight">
                               {{ item.storeName }}
                             </div>
                           </div>

                           <div class="text-right shrink-0">
                              @if (item.validationAlert.hasAlert) {
                                <span class="text-[10px] font-black px-2 py-0.5 rounded-full border block shadow-2xs"
                                  [class.bg-rose-100]="item.validationAlert.severity === 'critical'"
                                  [class.text-rose-800]="item.validationAlert.severity === 'critical'"
                                  [class.border-rose-300]="item.validationAlert.severity === 'critical'"
                                  [class.dark:bg-rose-950/80]="item.validationAlert.severity === 'critical'"
                                  [class.dark:text-rose-200]="item.validationAlert.severity === 'critical'"
                                  [class.dark:border-rose-800]="item.validationAlert.severity === 'critical'"
                                  [class.bg-amber-100]="item.validationAlert.severity === 'warning'"
                                  [class.text-amber-900]="item.validationAlert.severity === 'warning'"
                                  [class.border-amber-300]="item.validationAlert.severity === 'warning'"
                                  [class.dark:bg-amber-950/80]="item.validationAlert.severity === 'warning'"
                                  [class.dark:text-amber-200]="item.validationAlert.severity === 'warning'"
                                  [class.dark:border-amber-800]="item.validationAlert.severity === 'warning'">
                                  {{ item.validationAlert.badgeLabel }}
                                </span>
                              } @else if (item.isRead) {
                                <span class="bg-green-100 dark:bg-green-950/60 text-green-700 dark:text-green-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-green-200 dark:border-green-800 block">
                                  ✓ Lida
                                </span>
                              } @else {
                                <span class="bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[10px] font-medium px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-700 block">
                                  ⏳ Pendente
                                </span>
                              }
                           </div>
                        </div>
                        
                        <!-- Área de Leituras: Leitura Anterior (fixa) vs Leitura Atual (teclado numérico grande) -->
                        <div class="grid grid-cols-2 gap-3 items-center my-3">
                           <!-- Leitura Anterior -->
                           <div class="flex flex-col bg-slate-50 dark:bg-slate-800/80 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700">
                              <label class="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-400 tracking-wider">Leitura Anterior</label>
                              <div class="text-slate-700 dark:text-slate-200 font-mono text-lg font-bold mt-0.5">
                                 {{ item.prevReading | number:'1.0-0' }} <span class="text-xs font-normal text-slate-400">{{ getUnit() }}</span>
                              </div>
                           </div>
                           
                           <!-- Leitura Atual (Foco de Digitação em Campo) -->
                           <div class="flex flex-col">
                              <div class="flex items-center justify-between">
                                <label class="text-[10px] uppercase font-bold text-teal-700 dark:text-teal-400 tracking-wider">Leitura Atual</label>
                                @if (isReadingOcr() === item.storeId) {
                                  <span class="text-[9px] bg-indigo-100 dark:bg-indigo-900/60 text-indigo-800 dark:text-indigo-200 px-1.5 py-0.2 rounded-full font-bold flex items-center gap-1 animate-pulse">
                                    <span class="animate-spin text-[10px]">⚡</span>
                                    <span>Lendo...</span>
                                  </span>
                                }
                              </div>

                              <!-- Indicador OCR Ativo no Card -->
                              @if (isReadingOcr() === item.storeId) {
                                <div class="mt-1 p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-200 dark:border-indigo-800 text-indigo-900 dark:text-indigo-200 text-[11px] font-bold flex items-center justify-between gap-1.5 animate-pulse">
                                  <span class="flex items-center gap-1">
                                    <span>⚡</span>
                                    <span>{{ ocrCurrentModelLabel() }} lendo foto...</span>
                                  </span>
                                  <span class="text-[9px] bg-indigo-200 dark:bg-indigo-800 px-1 rounded">OCR</span>
                                </div>
                              }

                              <!-- Feedback OCR no Card -->
                              @if (ocrFeedback()[item.storeId]; as fb) {
                                <div class="mt-1 p-1.5 rounded-lg text-[11px] flex items-center justify-between gap-1 transition-all"
                                     [class]="fb.success ? 'bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-emerald-950 dark:text-emerald-100' : 'bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 text-amber-950 dark:text-amber-100'">
                                  <div class="flex items-center gap-1 truncate">
                                    <span>{{ fb.success ? '🤖✓' : '🤖⚠️' }}</span>
                                    <span class="font-bold truncate">{{ fb.message }}</span>
                                  </div>
                                  <button (click)="dismissOcrFeedback(item.storeId)" class="p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-white font-bold cursor-pointer shrink-0">✕</button>
                                </div>
                              }

                              <div class="relative mt-0.5">
                                <input type="number" 
                                   inputmode="decimal"
                                   step="0.0001"
                                   [ngModel]="item.currentReading" 
                                   (ngModelChange)="updateDetailedReading(item.storeId, 'reading', $event)"
                                   [disabled]="!authService.canEditReadings()"
                                   class="w-full text-right text-xl font-mono p-2.5 border-2 rounded-xl focus:ring-2 font-bold bg-white dark:bg-slate-950 text-slate-900 dark:text-white disabled:bg-slate-100 dark:disabled:bg-slate-800 transition-colors"
                                   [class.border-rose-500]="item.validationAlert.severity === 'critical'"
                                   [class.ring-2]="item.validationAlert.hasAlert"
                                   [class.ring-rose-400]="item.validationAlert.severity === 'critical'"
                                   [class.bg-rose-50/20]="item.validationAlert.severity === 'critical'"
                                   [class.border-amber-500]="item.validationAlert.severity === 'warning'"
                                   [class.ring-amber-400]="item.validationAlert.severity === 'warning'"
                                   [class.bg-amber-50/20]="item.validationAlert.severity === 'warning'"
                                   [class.border-emerald-500]="item.isRead && !item.validationAlert.hasAlert"
                                   [class.border-slate-300]="!item.isRead"
                                   [class.dark:border-slate-700]="!item.isRead"
                                   placeholder="0">
                              </div>
                           </div>
                        </div>

                        <!-- ALERTA INSTANTÂNEO DE LEITURA SUSPEITA / ERRO DE DIGITAÇÃO -->
                        @if (item.validationAlert.hasAlert) {
                          <div class="mb-3 p-3 rounded-xl border flex items-start gap-2.5 text-xs shadow-xs"
                               [class.bg-rose-50]="item.validationAlert.severity === 'critical'"
                               [class.border-rose-300]="item.validationAlert.severity === 'critical'"
                               [class.text-rose-950]="item.validationAlert.severity === 'critical'"
                               [class.dark:bg-rose-950/40]="item.validationAlert.severity === 'critical'"
                               [class.dark:border-rose-800]="item.validationAlert.severity === 'critical'"
                               [class.dark:text-rose-200]="item.validationAlert.severity === 'critical'"
                               [class.bg-amber-50]="item.validationAlert.severity === 'warning'"
                               [class.border-amber-300]="item.validationAlert.severity === 'warning'"
                               [class.text-amber-950]="item.validationAlert.severity === 'warning'"
                               [class.dark:bg-amber-950/40]="item.validationAlert.severity === 'warning'"
                               [class.dark:border-amber-800]="item.validationAlert.severity === 'warning'"
                               [class.dark:text-amber-200]="item.validationAlert.severity === 'warning'">
                            <span class="text-xl shrink-0 leading-none">
                              {{ item.validationAlert.severity === 'critical' ? '🚨' : '⚠️' }}
                            </span>
                            <div class="flex-1 space-y-1">
                              <div class="font-extrabold flex items-center justify-between">
                                <span class="text-xs">{{ item.validationAlert.title }}</span>
                                <span class="px-2 py-0.2 rounded text-[9px] uppercase font-black tracking-wide"
                                  [class.bg-rose-600]="item.validationAlert.severity === 'critical'"
                                  [class.text-white]="item.validationAlert.severity === 'critical'"
                                  [class.bg-amber-500]="item.validationAlert.severity === 'warning'"
                                  [class.text-slate-950]="item.validationAlert.severity === 'warning'">
                                  {{ item.validationAlert.badgeLabel }}
                                </span>
                              </div>
                              <p class="leading-relaxed text-[11px] text-slate-700 dark:text-slate-300">
                                {{ item.validationAlert.message }}
                              </p>
                              <!-- Metadados de Comparação em Tempo Real -->
                              <div class="pt-1.5 mt-1 border-t border-black/10 dark:border-white/10 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] font-mono text-slate-600 dark:text-slate-400">
                                <span>Anterior: <strong>{{ item.prevReading | number:'1.0-0' }}</strong></span>
                                <span>Digitada: <strong>{{ item.currentReading | number:'1.0-2' }}</strong></span>
                                @if (item.validationAlert.avgConsumption > 0) {
                                  <span>Média Histórica: <strong>{{ item.validationAlert.avgConsumption | number:'1.0-1' }} {{ getUnit() }}</strong></span>
                                }
                              </div>
                              <div class="text-[10px] font-semibold text-rose-800 dark:text-rose-300 bg-white/70 dark:bg-slate-900/80 px-2 py-0.5 rounded border border-rose-200 dark:border-rose-800 mt-1 inline-block">
                                🔍 Confira no visor do relógio antes de sair da loja
                              </div>
                            </div>
                          </div>
                        }

                        <!-- Resultados Calculados em Tempo Real -->
                        @if (item.isRead) {
                          <div class="grid grid-cols-3 gap-2 bg-slate-50 dark:bg-slate-800/80 p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs mb-2">
                             <div>
                                <span class="text-[10px] text-slate-400 block">Diferença</span>
                                <strong class="font-mono text-slate-700 dark:text-slate-200">+{{ item.readingDiff | number:'1.0-2' }} {{ getUnit() }}</strong>
                             </div>
                             <div>
                                <span class="text-[10px] text-slate-400 block">Consumo</span>
                                <strong class="font-mono text-slate-900 dark:text-white">{{ item.consumption | number:'1.0-2' }} {{ getUnit() }}</strong>
                             </div>
                             <div class="text-right">
                                <span class="text-[10px] text-slate-400 block">Custo Est.</span>
                                <strong class="font-mono text-teal-700 dark:text-teal-400">{{ item.cost | currency:'BRL' }}</strong>
                             </div>
                          </div>
                        }

                        <!-- Observações de Campo Rápidas (Chips de 1 toque) -->
                        <div class="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-1.5 text-xs">
                           <div class="flex items-center gap-1 flex-wrap">
                             @if (item.note) {
                               <div class="inline-flex items-center gap-1 bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 px-2 py-0.5 rounded-full text-xs border border-amber-200 dark:border-amber-800 font-medium">
                                 <span>📝 {{ item.note }}</span>
                                 <button (click)="clearNote(item.storeId)" class="hover:text-red-600 font-bold ml-1 cursor-pointer" title="Remover observação">✕</button>
                               </div>
                             } @else {
                               <span class="text-[10px] text-slate-400">Etiqueta:</span>
                               <button type="button" (click)="applyQuickTag(item.storeId, 'Porta Fechada')" class="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-[10px] text-slate-600 dark:text-slate-300 transition-colors cursor-pointer">
                                 🔒 Fechada
                               </button>
                               <button type="button" (click)="applyQuickTag(item.storeId, 'Visor Embaçado')" class="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-[10px] text-slate-600 dark:text-slate-300 transition-colors cursor-pointer">
                                 👁️ Embaçado
                               </button>
                               <button type="button" (click)="applyQuickTag(item.storeId, 'Relógio Trocado')" class="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-[10px] text-slate-600 dark:text-slate-300 transition-colors cursor-pointer">
                                 🔄 Novo
                               </button>
                             }
                           </div>

                           <button type="button" (click)="openNoteEditor(item.storeId, item.note)" class="text-slate-500 dark:text-slate-400 hover:text-teal-700 dark:hover:text-teal-300 text-xs font-semibold underline cursor-pointer">
                             {{ item.note ? 'Editar nota' : '+ Observação' }}
                           </button>
                        </div>

                        <!-- Foto de Evidência do Medidor (Offline no IndexedDB) -->
                        <div class="mt-2.5 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
                          <div class="flex items-center gap-2">
                            @if (meterPhotos()[item.storeId]) {
                              <div class="relative cursor-pointer group shrink-0" (click)="openPhotoViewer(item.storeId)" title="Visualizar comprovante fotográfico">
                                <img [src]="meterPhotos()[item.storeId].photoDataUrl" 
                                     alt="Foto do Medidor" 
                                     class="w-10 h-10 object-cover rounded-xl border-2 border-teal-500 shadow-xs">
                                <span class="absolute -bottom-1 -right-1 bg-teal-600 text-white rounded-full w-3.5 h-3.5 flex items-center justify-center text-[8px] font-bold shadow-xs">
                                  ✓
                                </span>
                              </div>
                              <div class="flex flex-col">
                                <button type="button" 
                                        (click)="openPhotoViewer(item.storeId)"
                                        class="text-xs font-bold text-teal-800 hover:text-teal-950 flex items-center gap-1 cursor-pointer text-left">
                                  <span>📷 Ver Foto Medidor</span>
                                </button>
                                <span class="text-[9px] text-slate-400 font-mono">
                                  {{ meterPhotos()[item.storeId].capturedAt | date:'dd/MM HH:mm' }} • IndexedDB
                                </span>
                                <button type="button" 
                                        (click)="runOcrOnPhoto(item.storeId)"
                                        [disabled]="isReadingOcr() === item.storeId"
                                        class="mt-1 text-[10px] font-bold text-indigo-700 dark:text-indigo-300 hover:text-indigo-900 dark:hover:text-white bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 px-2 py-0.5 rounded-md border border-indigo-200 dark:border-indigo-800 flex items-center gap-1 cursor-pointer w-fit shadow-xs">
                                  @if (isReadingOcr() === item.storeId) {
                                    <span class="animate-spin text-[10px]">⏳</span>
                                    <span>Lendo...</span>
                                  } @else {
                                    <span>⚡ Ler com IA</span>
                                  }
                                </button>
                              </div>
                            } @else {
                              <label class="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 text-xs font-bold transition-all shadow-xs active:scale-95">
                                @if (isCapturingPhoto() === item.storeId) {
                                  <span class="animate-spin text-xs">⏳</span>
                                  <span>Compactando...</span>
                                } @else {
                                  <span>📷</span>
                                  <span>Foto do Medidor</span>
                                }
                                <input type="file" 
                                       accept="image/*" 
                                       capture="environment" 
                                       (change)="onPhotoCaptured($event, item.storeId, item.storeName, item.luc, item.currentReading)" 
                                       class="hidden"
                                       [disabled]="isCapturingPhoto() === item.storeId">
                              </label>
                            }
                          </div>

                          @if (meterPhotos()[item.storeId]) {
                            <label class="cursor-pointer text-[10px] font-semibold text-slate-500 hover:text-slate-800 underline shrink-0">
                              <span>Substituir</span>
                              <input type="file" 
                                     accept="image/*" 
                                     capture="environment" 
                                     (change)="onPhotoCaptured($event, item.storeId, item.storeName, item.luc, item.currentReading)" 
                                     class="hidden">
                            </label>
                          }
                        </div>
                     </div>
                  }

                  @if (filteredTableData().length === 0) {
                    <div class="p-8 text-center bg-white dark:bg-slate-900 border border-transparent dark:border-slate-800 rounded-xl">
                      <div class="text-3xl mb-2">📋</div>
                      <p class="font-bold text-slate-700 dark:text-slate-300 text-sm">Nenhuma loja encontrada</p>
                      <p class="text-xs text-slate-400 mt-1">Ajuste o termo da busca ou o filtro de pendentes.</p>
                      <button (click)="statusFilter.set('all'); searchQuery.set('')" class="mt-3 px-3 py-1.5 bg-teal-600 text-white rounded text-xs font-bold cursor-pointer">
                        Ver Todas as Lojas
                      </button>
                    </div>
                  }
                </div>
              }

              <!-- MODO 2: MODO ROTA / PASSO A PASSO (FOCO TOTAL PARA O TÉCNICO CAMINHANDO NO SHOPPING) -->
              @if (mobileViewMode() === 'step') {
                <div class="p-4 bg-slate-100 dark:bg-slate-950 min-h-[400px] flex flex-col justify-between transition-colors">
                  @if (currentStepStore(); as stepStore) {
                    <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-5 space-y-4 transition-colors">
                      
                      <!-- Step Indicator Header -->
                      <div class="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
                        <div class="flex items-center gap-2">
                          <span class="text-xs font-bold px-2 py-0.5 bg-teal-100 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300 rounded-full font-mono border border-teal-200 dark:border-teal-800">
                            Loja {{ stepIndex() + 1 }} de {{ tableData().length }}
                          </span>
                          @if (stepStore.isRead) {
                            <span class="text-xs font-bold text-green-600 dark:text-green-400 flex items-center gap-1">✓ Lida</span>
                          } @else {
                            <span class="text-xs font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1">⏳ Pendente</span>
                          }
                        </div>

                        <!-- Dropdown de seleção rápida de loja -->
                        <select 
                          [ngModel]="stepIndex()" 
                          (ngModelChange)="setStepIndex($event)"
                          class="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded p-1 font-mono text-slate-700 dark:text-slate-200 max-w-[130px]">
                          @for (st of tableData(); track st.storeId; let sIdx = $index) {
                            <option [value]="sIdx">
                              {{ st.luc }} - {{ st.storeName }} {{ st.isRead ? '✓' : '' }}
                            </option>
                          }
                        </select>
                      </div>

                      <!-- Dados da Loja -->
                      <div>
                        <div class="flex items-center gap-2">
                          <span class="text-sm font-mono font-extrabold text-white bg-slate-900 dark:bg-slate-800 px-2.5 py-0.5 rounded shadow-xs border border-transparent dark:border-slate-700">
                            {{ stepStore.luc }}
                          </span>
                          @if (stepStore.contrato) {
                            <span class="text-xs font-mono text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                              Ctr: {{ stepStore.contrato }}
                            </span>
                          }
                        </div>
                        <h3 class="text-xl font-bold text-slate-900 dark:text-white mt-1.5 leading-tight">
                          {{ stepStore.storeName }}
                        </h3>
                      </div>

                      <!-- Leitura Anterior (Cartão Grande) -->
                      <div class="bg-slate-50 dark:bg-slate-800/80 p-3 rounded-xl border border-slate-200 dark:border-slate-700 flex justify-between items-center">
                        <span class="text-xs uppercase font-bold text-slate-500 dark:text-slate-400">Leitura Anterior:</span>
                        <span class="font-mono text-xl font-bold text-slate-800 dark:text-slate-100">
                          {{ stepStore.prevReading | number:'1.0-0' }} <span class="text-sm font-normal text-slate-400">{{ getUnit() }}</span>
                        </span>
                      </div>

                      <!-- Campo Gigante para Leitura Atual -->
                      <div class="space-y-1.5">
                        <div class="flex items-center justify-between">
                          <label class="text-xs uppercase font-extrabold text-teal-700 dark:text-teal-400 tracking-wider block">
                            DIGITAR LEITURA ATUAL ({{ getUnit() }}):
                          </label>
                          @if (isReadingOcr() === stepStore.storeId) {
                            <span class="text-[10px] bg-indigo-100 dark:bg-indigo-900/60 text-indigo-800 dark:text-indigo-200 px-2 py-0.5 rounded-full font-bold flex items-center gap-1 animate-pulse">
                              <span class="animate-spin text-xs">⚡</span>
                              <span>{{ ocrCurrentModelLabel() }}...</span>
                            </span>
                          }
                        </div>

                        <!-- Indicador de Processamento OCR com Qwen / Gemini -->
                        @if (isReadingOcr() === stepStore.storeId) {
                          <div class="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-200 dark:border-indigo-800 text-indigo-900 dark:text-indigo-200 text-xs font-bold flex items-center justify-between gap-2 animate-pulse shadow-xs">
                            <div class="flex items-center gap-2">
                              <span class="text-xl">⚡</span>
                              <div>
                                <p class="leading-tight">{{ ocrCurrentModelLabel() }} lendo visor...</p>
                                <p class="text-[10px] font-normal opacity-85">1º Qwen 3.8 27B (Groq) com fallback automático para Gemini 3.8 Flash</p>
                              </div>
                            </div>
                            <span class="text-[10px] bg-indigo-200 dark:bg-indigo-800 px-2 py-0.5 rounded font-mono font-bold">OCR DUPLO</span>
                          </div>
                        }

                        <!-- Feedback de Leitura Automática OCR com Opção de Verificação Cruzada -->
                        @if (ocrFeedback()[stepStore.storeId]; as fb) {
                          <div class="p-3 rounded-xl text-xs flex flex-col gap-1.5 shadow-xs transition-all"
                               [class]="fb.success ? 'bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-emerald-950 dark:text-emerald-100' : 'bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 text-amber-950 dark:text-amber-100'">
                            <div class="flex items-center justify-between gap-2">
                              <div class="flex items-center gap-2">
                                <span class="text-lg shrink-0">{{ fb.success ? (fb.provider === 'qwen' ? '⚡' : '🤖') : '⚠️' }}</span>
                                <div>
                                  <p class="font-bold leading-tight">{{ fb.message }}</p>
                                  @if (fb.explanation) {
                                    <p class="text-[10px] opacity-85 mt-0.5">{{ fb.explanation }}</p>
                                  }
                                </div>
                              </div>
                              <button (click)="dismissOcrFeedback(stepStore.storeId)" class="p-1 text-slate-400 hover:text-slate-800 dark:hover:text-white font-bold cursor-pointer">✕</button>
                            </div>
                            @if (fb.success && meterPhotos()[stepStore.storeId]) {
                              <div class="pt-1 mt-0.5 border-t border-black/10 dark:border-white/10 flex items-center justify-between text-[10px]">
                                <span class="font-mono opacity-75">Motor: {{ fb.modelName }}</span>
                                <div class="flex items-center gap-2">
                                  @if (fb.provider === 'qwen') {
                                    <button type="button" (click)="runOcrOnPhoto(stepStore.storeId, 'gemini')" [disabled]="isReadingOcr() === stepStore.storeId" class="text-indigo-700 dark:text-indigo-300 hover:underline font-bold cursor-pointer">
                                      🤖 Conferir com Gemini
                                    </button>
                                  } @else {
                                    <button type="button" (click)="runOcrOnPhoto(stepStore.storeId, 'qwen')" [disabled]="isReadingOcr() === stepStore.storeId" class="text-indigo-700 dark:text-indigo-300 hover:underline font-bold cursor-pointer">
                                      ⚡ Conferir com Qwen 3.8 27B
                                    </button>
                                  }
                                </div>
                              </div>
                            }
                          </div>
                        }

                        <input type="number" 
                          inputmode="decimal"
                          step="0.0001"
                          [ngModel]="stepStore.currentReading" 
                          (ngModelChange)="updateDetailedReading(stepStore.storeId, 'reading', $event)"
                          [disabled]="!authService.canEditReadings()"
                          class="w-full text-center text-3xl font-mono font-bold p-3.5 border-2 rounded-2xl focus:ring-4 transition-all bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                          [class.border-rose-500]="stepStore.validationAlert.severity === 'critical'"
                          [class.ring-4]="stepStore.validationAlert.hasAlert"
                          [class.ring-rose-300]="stepStore.validationAlert.severity === 'critical'"
                          [class.bg-rose-50/20]="stepStore.validationAlert.severity === 'critical'"
                          [class.border-amber-500]="stepStore.validationAlert.severity === 'warning'"
                          [class.ring-amber-300]="stepStore.validationAlert.severity === 'warning'"
                          [class.bg-amber-50/20]="stepStore.validationAlert.severity === 'warning'"
                          [class.border-emerald-500]="stepStore.isRead && !stepStore.validationAlert.hasAlert"
                          [class.border-slate-300]="!stepStore.isRead"
                          [class.dark:border-slate-700]="!stepStore.isRead"
                          placeholder="0">
                      </div>

                      <!-- ALERTA INSTANTÂNEO EM TEMPO REAL NO MODO ROTA -->
                      @if (stepStore.validationAlert.hasAlert) {
                        <div class="p-3.5 rounded-xl border text-xs flex items-start gap-2.5 shadow-sm"
                             [class.bg-rose-50]="stepStore.validationAlert.severity === 'critical'"
                             [class.border-rose-300]="stepStore.validationAlert.severity === 'critical'"
                             [class.text-rose-950]="stepStore.validationAlert.severity === 'critical'"
                             [class.dark:bg-rose-950/40]="stepStore.validationAlert.severity === 'critical'"
                             [class.dark:border-rose-800]="stepStore.validationAlert.severity === 'critical'"
                             [class.dark:text-rose-200]="stepStore.validationAlert.severity === 'critical'"
                             [class.bg-amber-50]="stepStore.validationAlert.severity === 'warning'"
                             [class.border-amber-300]="stepStore.validationAlert.severity === 'warning'"
                             [class.text-amber-950]="stepStore.validationAlert.severity === 'warning'"
                             [class.dark:bg-amber-950/40]="stepStore.validationAlert.severity === 'warning'"
                             [class.dark:border-amber-800]="stepStore.validationAlert.severity === 'warning'"
                             [class.dark:text-amber-200]="stepStore.validationAlert.severity === 'warning'">
                          <span class="text-2xl shrink-0 leading-none">
                            {{ stepStore.validationAlert.severity === 'critical' ? '🚨' : '⚠️' }}
                          </span>
                          <div class="flex-1 space-y-1">
                            <div class="flex items-center justify-between">
                              <strong class="text-sm font-black">{{ stepStore.validationAlert.title }}</strong>
                              <span class="px-2 py-0.5 rounded text-[10px] font-black uppercase"
                                [class.bg-rose-600]="stepStore.validationAlert.severity === 'critical'"
                                [class.text-white]="stepStore.validationAlert.severity === 'critical'"
                                [class.bg-amber-500]="stepStore.validationAlert.severity === 'warning'"
                                [class.text-slate-950]="stepStore.validationAlert.severity === 'warning'">
                                {{ stepStore.validationAlert.badgeLabel }}
                              </span>
                            </div>
                            <p class="text-xs text-slate-700 dark:text-slate-300 leading-snug">
                              {{ stepStore.validationAlert.message }}
                            </p>
                            <div class="pt-1.5 mt-1 border-t border-black/10 dark:border-white/10 flex flex-wrap items-center gap-x-3 text-[11px] font-mono text-slate-600 dark:text-slate-400">
                              <span>Anterior: <strong>{{ stepStore.prevReading | number:'1.0-0' }}</strong></span>
                              <span>Digitada: <strong>{{ stepStore.currentReading }}</strong></span>
                              @if (stepStore.validationAlert.avgConsumption > 0) {
                                <span>Média: <strong>{{ stepStore.validationAlert.avgConsumption | number:'1.0-1' }} {{ getUnit() }}</strong></span>
                              }
                            </div>
                            <div class="mt-1 text-[11px] font-semibold text-rose-800 dark:text-rose-300 bg-white/80 dark:bg-slate-900/90 px-2.5 py-1 rounded border border-rose-200 dark:border-rose-800">
                              ✋ Evite retrabalho: confirme os números no relógio antes de sair para a próxima loja!
                            </div>
                          </div>
                        </div>
                      }

                      <!-- Feedback de Diferença e Custo -->
                      @if (stepStore.isRead) {
                        <div class="bg-teal-50 dark:bg-teal-950/40 p-3 rounded-xl border border-teal-200 dark:border-teal-800 grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span class="text-[10px] text-teal-600 dark:text-teal-400 block">Diferença / Consumo</span>
                            <strong class="font-mono text-base text-teal-900 dark:text-teal-100">+{{ stepStore.readingDiff | number:'1.0-2' }} {{ getUnit() }}</strong>
                          </div>
                          <div class="text-right">
                            <span class="text-[10px] text-teal-600 dark:text-teal-400 block">Custo Estimado</span>
                            <strong class="font-mono text-base text-teal-900 dark:text-teal-100">{{ stepStore.cost | currency:'BRL' }}</strong>
                          </div>
                        </div>
                      }

                      <!-- Foto de Evidência do Medidor no Modo Rota -->
                      <div class="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                        <div class="flex items-center gap-2">
                          @if (meterPhotos()[stepStore.storeId]) {
                            <div class="relative cursor-pointer shrink-0" (click)="openPhotoViewer(stepStore.storeId)" title="Visualizar comprovante fotográfico">
                              <img [src]="meterPhotos()[stepStore.storeId].photoDataUrl" 
                                   alt="Evidência Medidor" 
                                   class="w-12 h-12 object-cover rounded-xl border-2 border-teal-500 shadow-xs">
                              <span class="absolute -bottom-1 -right-1 bg-teal-600 text-white rounded-full w-4 h-4 flex items-center justify-center text-[9px] font-bold shadow-xs">
                                ✓
                              </span>
                            </div>
                            <div class="flex flex-col">
                              <button type="button" 
                                      (click)="openPhotoViewer(stepStore.storeId)"
                                      class="text-xs font-bold text-teal-800 dark:text-teal-300 hover:text-teal-950 dark:hover:text-teal-100 flex items-center gap-1 cursor-pointer text-left">
                                <span>📷 Ver Foto do Relógio</span>
                              </button>
                              <span class="text-[10px] text-slate-400 font-mono">
                                {{ meterPhotos()[stepStore.storeId].capturedAt | date:'dd/MM HH:mm' }} • IndexedDB
                              </span>
                              <button type="button" 
                                      (click)="runOcrOnPhoto(stepStore.storeId)"
                                      [disabled]="isReadingOcr() === stepStore.storeId"
                                      class="mt-1 text-[11px] font-bold text-indigo-700 dark:text-indigo-300 hover:text-indigo-900 dark:hover:text-white bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 px-2 py-0.5 rounded-md border border-indigo-200 dark:border-indigo-800 flex items-center gap-1 cursor-pointer w-fit shadow-xs">
                                @if (isReadingOcr() === stepStore.storeId) {
                                  <span class="animate-spin text-xs">⏳</span>
                                  <span>Lendo (Qwen/Gemini)...</span>
                                } @else {
                                  <span>⚡ Ler com IA</span>
                                }
                              </button>
                            </div>
                          } @else {
                            <label class="cursor-pointer inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-teal-50 dark:bg-teal-950/60 hover:bg-teal-100 dark:hover:bg-teal-900/60 text-teal-900 dark:text-teal-200 border border-teal-300 dark:border-teal-700 text-xs font-bold transition-all shadow-xs active:scale-95">
                              @if (isCapturingPhoto() === stepStore.storeId) {
                                <span class="animate-spin text-sm">⏳</span>
                                <span>Compactando...</span>
                              } @else {
                                <span class="text-base">📷</span>
                                <span>Tirar Foto do Relógio</span>
                              }
                              <input type="file" 
                                     accept="image/*" 
                                     capture="environment" 
                                     (change)="onPhotoCaptured($event, stepStore.storeId, stepStore.storeName, stepStore.luc, stepStore.currentReading)" 
                                     class="hidden"
                                     [disabled]="isCapturingPhoto() === stepStore.storeId">
                            </label>
                          }
                        </div>

                        @if (meterPhotos()[stepStore.storeId]) {
                          <label class="cursor-pointer text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white underline shrink-0">
                            <span>Substituir</span>
                            <input type="file" 
                                   accept="image/*" 
                                   capture="environment" 
                                   (change)="onPhotoCaptured($event, stepStore.storeId, stepStore.storeName, stepStore.luc, stepStore.currentReading)" 
                                   class="hidden">
                          </label>
                        }
                      </div>

                      <!-- Observação de Campo no Modo Rota -->
                      <div class="pt-2 border-t border-slate-100 dark:border-slate-800">
                        <div class="flex items-center justify-between text-xs mb-1.5">
                          <span class="font-bold text-slate-500 dark:text-slate-400">Observação de Campo:</span>
                          <button (click)="openNoteEditor(stepStore.storeId, stepStore.note)" class="text-teal-700 dark:text-teal-400 font-bold underline cursor-pointer">
                            {{ stepStore.note ? 'Alterar' : '+ Adicionar Nota' }}
                          </button>
                        </div>
                        @if (stepStore.note) {
                          <div class="bg-amber-50 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 border border-amber-200 dark:border-amber-800 p-2 rounded-lg text-xs flex justify-between items-center">
                            <span>📝 {{ stepStore.note }}</span>
                            <button (click)="clearNote(stepStore.storeId)" class="text-red-500 hover:text-red-700 font-bold ml-2 cursor-pointer">✕</button>
                          </div>
                        } @else {
                          <div class="flex gap-1.5 flex-wrap">
                            <button (click)="applyQuickTag(stepStore.storeId, 'Porta Fechada')" class="px-2 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-xs text-slate-600 dark:text-slate-300 transition-colors cursor-pointer">
                              🔒 Fechada
                            </button>
                            <button (click)="applyQuickTag(stepStore.storeId, 'Visor Embaçado')" class="px-2 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-xs text-slate-600 dark:text-slate-300 transition-colors cursor-pointer">
                              👁️ Embaçado
                            </button>
                            <button (click)="applyQuickTag(stepStore.storeId, 'Relógio Novo')" class="px-2 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-xs text-slate-600 dark:text-slate-300 transition-colors cursor-pointer">
                              🔄 Relógio Novo
                            </button>
                          </div>
                        }
                      </div>

                      <!-- Botões de Navegação com Polegar (Próxima Pendente) -->
                      <div class="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2">
                        <button type="button" 
                          (click)="prevStep()" 
                          [disabled]="stepIndex() === 0"
                          class="flex-1 py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 text-slate-700 dark:text-slate-200 rounded-xl font-bold text-xs transition-colors flex items-center justify-center gap-1 cursor-pointer">
                          <span>◀ Anterior</span>
                        </button>

                        <button type="button" 
                          (click)="jumpToNextPending()" 
                          class="flex-1 py-3 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black rounded-xl text-xs transition-colors flex items-center justify-center gap-1 shadow-sm cursor-pointer"
                          title="Pula direto para a próxima loja que ainda não foi lida">
                          <span>⚡ Próx. Pendente</span>
                        </button>

                        <button type="button" 
                          (click)="nextStep()" 
                          [disabled]="stepIndex() >= tableData().length - 1"
                          class="flex-1 py-3 bg-teal-600 hover:bg-teal-700 disabled:opacity-30 text-white rounded-xl font-bold text-xs transition-colors flex items-center justify-center gap-1 shadow-sm cursor-pointer">
                          <span>Próxima ▶</span>
                        </button>
                      </div>

                    </div>
                  } @else {
                    <div class="p-8 text-center bg-white dark:bg-slate-900 rounded-xl border border-transparent dark:border-slate-800">
                      <p class="text-sm font-bold text-slate-700 dark:text-slate-300">Nenhuma loja cadastrada para este insumo.</p>
                    </div>
                  }
                </div>
              }

            </div>
          </div>

          <!-- Footer Summary (ALL TYPES) -->
          <div class="rounded-xl overflow-hidden border border-orange-200 shadow-sm font-sans animate-fade-in">
             <!-- Compact Mobile Summary -->
             <div class="md:hidden p-4 bg-orange-50 space-y-2">
                <div class="flex justify-between items-center text-sm">
                   <span class="font-bold text-orange-900">Áreas Comuns</span>
                   <span class="font-mono text-orange-800">{{ commonAreaCost() | currency:'BRL' }}</span>
                </div>
                <div class="flex justify-between items-center text-sm">
                   <span class="font-bold text-orange-900">Valor SAP</span>
                   <span class="font-mono text-orange-800">{{ totalDistributedCost() | currency:'BRL' }}</span>
                </div>
             </div>

             <!-- Full Desktop Summary (Keep existing layout for desktop) -->
             <div class="hidden md:block">
                <!-- 1. Áreas Comuns Row -->
                <div class="bg-orange-600 text-white grid grid-cols-1 md:grid-cols-12 items-center p-3 border-b border-orange-700">
                    <div class="md:col-span-6 font-bold text-right pr-4 text-sm uppercase tracking-wide">
                      Áreas Comuns
                    </div>
                    <div class="md:col-span-3 text-right pr-4">
                      <div class="font-mono font-bold text-lg leading-tight">{{ commonAreaCost() | currency:'BRL' }}</div>
                      <div class="text-xs opacity-80">{{ getPercentage(commonAreaCost()) }}%</div>
                    </div>
                    <div class="md:col-span-3 text-right font-mono text-sm pl-4 border-l border-orange-500">
                      {{ commonAreaConsumption() | number:'1.0-4' }} {{ getUnit() }}
                    </div>
                </div>

                <!-- 2. Ar Condicionado Row -->
                @if(utilityType() !== 'gas') {
                  <div class="bg-orange-200 text-orange-900 grid grid-cols-1 md:grid-cols-12 items-center p-3 border-b border-orange-300">
                      <div class="md:col-span-6 font-bold text-right pr-4 text-sm uppercase tracking-wide">
                        Ar Condicionado
                      </div>
                      <div class="md:col-span-3 text-right pr-4">
                        <div class="font-mono font-bold text-lg leading-tight">{{ airConditioningCost() | currency:'BRL' }}</div>
                        <div class="text-xs opacity-70">{{ getPercentage(airConditioningCost()) }}%</div>
                      </div>
                      <div class="md:col-span-3 text-right pl-4 border-l border-orange-300">
                        <div class="flex items-center justify-end gap-2">
                          <label class="text-[10px] uppercase font-bold opacity-60">Consumo:</label>
                          <input type="number" 
                              step="0.0001"
                              [ngModel]="currentACConsumption()" 
                              (ngModelChange)="setAirConditioning($event)"
                              [disabled]="!authService.canConfigureBill()"
                              class="w-24 px-2 py-1 text-sm bg-white border border-orange-300 rounded text-right font-mono focus:ring-1 focus:ring-orange-500 disabled:bg-transparent disabled:border-transparent"
                              placeholder="0">
                            <span class="text-xs font-mono">{{ getUnit() }}</span>
                        </div>
                      </div>
                  </div>
                }

                <!-- 3. Valor SAP Row -->
                <div class="bg-orange-700 text-white grid grid-cols-1 md:grid-cols-12 items-center p-3 border-b border-orange-800">
                    <div class="md:col-span-6 text-right pr-4">
                      <div class="font-bold text-sm uppercase tracking-wide">Valor SAP</div>
                    </div>
                    <div class="md:col-span-3 text-right pr-4">
                      <div class="font-mono font-bold text-xl leading-tight text-white">{{ totalDistributedCost() | currency:'BRL' }}</div>
                    </div>
                    <div class="md:col-span-3 bg-orange-800/20 h-full"></div>
                </div>
             </div>
          </div>
        </div>
      </div>

      <!-- NOTE EDITOR MODAL FOR FIELD TECHNICIAN -->
      @if (activeNoteStoreId()) {
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div class="absolute inset-0 bg-black/60 backdrop-blur-xs" (click)="closeNoteEditor()"></div>
          
          <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-5 w-full max-w-sm relative z-10 space-y-4 border border-slate-200 dark:border-slate-800 transition-colors">
            <div class="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-2">
              <h3 class="font-bold text-slate-800 dark:text-white text-sm flex items-center gap-1.5">
                <span>📝 Observação de Campo</span>
              </h3>
              <button (click)="closeNoteEditor()" class="text-slate-400 hover:text-slate-600 dark:hover:text-white text-lg font-bold cursor-pointer">✕</button>
            </div>

            <!-- Quick tag suggestions -->
            <div>
              <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Etiquetas Rápidas</label>
              <div class="flex flex-wrap gap-1.5">
                <button type="button" (click)="activeNoteText.set('Porta Trancada / Sem Acesso')" class="px-2 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded text-xs cursor-pointer">
                  🔒 Sem Acesso
                </button>
                <button type="button" (click)="activeNoteText.set('Visor Embaçado / Difícil Leitura')" class="px-2 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded text-xs cursor-pointer">
                  👁️ Embaçado
                </button>
                <button type="button" (click)="activeNoteText.set('Relógio Reiniciado / Trocado')" class="px-2 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded text-xs cursor-pointer">
                  🔄 Relógio Trocado
                </button>
                <button type="button" (click)="activeNoteText.set('Suspeita de Vazamento / Salto')" class="px-2 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded text-xs cursor-pointer">
                  💧 Vazamento
                </button>
                <button type="button" (click)="activeNoteText.set('Loja em Reforma')" class="px-2 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded text-xs cursor-pointer">
                  🔨 Em Reforma
                </button>
              </div>
            </div>

            <div>
              <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Texto da Observação</label>
              <textarea 
                [ngModel]="activeNoteText()" 
                (ngModelChange)="activeNoteText.set($event)"
                placeholder="Ex: Medidor com visor quebrado, leitura estimada com o lojista..."
                class="w-full h-20 p-2.5 text-xs border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-teal-500 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:bg-white dark:focus:bg-slate-800 resize-none"></textarea>
            </div>

            <div class="flex gap-2 pt-1">
              <button type="button" (click)="closeNoteEditor()" class="flex-1 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg cursor-pointer">
                Cancelar
              </button>
              <button type="button" (click)="saveNote(activeNoteStoreId()!)" class="flex-1 py-2 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-lg shadow-sm cursor-pointer">
                Salvar Nota
              </button>
            </div>
          </div>
        </div>
      }

      <!-- PHOTO EVIDENCE VIEWER & AUDIT MODAL (Comprovante Incontestável no IndexedDB) -->
      @if (showPhotoModal() && activePhotoRecord(); as photo) {
        <div class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
          <!-- Backdrop -->
          <div class="absolute inset-0 bg-black/85 backdrop-blur-sm" (click)="closePhotoViewer()"></div>
          
          <!-- Modal Card -->
          <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden w-full max-w-lg relative z-10 max-h-[92vh] flex flex-col animate-fade-in border border-slate-700">
            
            <!-- Modal Header -->
            <div class="bg-slate-900 text-white p-3.5 sm:p-4 flex justify-between items-center border-b border-slate-800">
              <div class="flex items-center gap-2.5">
                <span class="text-xs font-mono font-extrabold bg-teal-500 text-slate-950 px-2 py-0.5 rounded shadow-xs">
                  {{ photo.luc }}
                </span>
                <div>
                  <h3 class="font-bold text-sm sm:text-base leading-tight truncate max-w-[200px] sm:max-w-xs text-white">
                    {{ photo.storeName }}
                  </h3>
                  <p class="text-[10px] text-slate-400 mt-0.5">
                    Evidência Fotográfica • {{ photo.type | uppercase }} • Mês: {{ photo.month }}
                  </p>
                </div>
              </div>
              <button (click)="closePhotoViewer()" class="text-slate-400 hover:text-white text-xl font-bold p-1 cursor-pointer">✕</button>
            </div>

            <!-- Photo Canvas / Image Display -->
            <div class="flex-1 bg-slate-950 flex items-center justify-center overflow-hidden relative min-h-[260px] max-h-[58vh]">
              <img [src]="photo.photoDataUrl" 
                   alt="Foto do Medidor" 
                   class="max-w-full max-h-[58vh] object-contain select-none">
              
              <!-- Badge overlay with verified reading value -->
              <div class="absolute top-3 left-3 bg-slate-900/85 backdrop-blur-md text-white px-2.5 py-1 rounded-lg text-xs font-mono border border-slate-700 flex items-center gap-1.5 shadow-md">
                <span class="text-teal-400 font-bold">🔢 Leitura:</span>
                <strong class="text-white">{{ photo.readingValue || 0 }}</strong>
              </div>
            </div>

            <!-- Status de Leitura OCR com IA no Modal -->
            @if (isReadingOcr() === photo.storeId) {
              <div class="p-3 bg-indigo-900/90 text-indigo-100 border-b border-indigo-700 flex items-center justify-between text-xs font-bold animate-pulse">
                <div class="flex items-center gap-2">
                  <span class="text-lg">⚡</span>
                  <div>
                    <p>{{ ocrCurrentModelLabel() }} lendo mostrador...</p>
                    <p class="text-[10px] text-indigo-300 font-normal">Processando com Groq / Gemini para alta precisão</p>
                  </div>
                </div>
                <span class="text-[10px] bg-indigo-700 px-2 py-0.5 rounded font-mono">OCR ATIVO</span>
              </div>
            }

            @if (ocrFeedback()[photo.storeId]; as fb) {
              <div class="p-3 border-b text-xs flex flex-col gap-1.5"
                   [class]="fb.success ? 'bg-emerald-950/90 border-emerald-800 text-emerald-100' : 'bg-amber-950/90 border-amber-800 text-amber-100'">
                <div class="flex items-center justify-between gap-2">
                  <div class="flex items-center gap-2">
                    <span class="text-lg shrink-0">{{ fb.success ? (fb.provider === 'qwen' ? '⚡' : '🤖') : '⚠️' }}</span>
                    <div>
                      <p class="font-bold leading-tight">{{ fb.message }}</p>
                      @if (fb.explanation) {
                        <p class="text-[10px] opacity-85 mt-0.5">{{ fb.explanation }}</p>
                      }
                    </div>
                  </div>
                  <button (click)="dismissOcrFeedback(photo.storeId)" class="p-1 text-slate-400 hover:text-white font-bold cursor-pointer">✕</button>
                </div>
                @if (fb.success) {
                  <div class="text-[10px] opacity-80 flex items-center justify-between border-t border-white/10 pt-1">
                    <span>Motor: {{ fb.modelName }}</span>
                    <span>Confiança: {{ fb.confidence === 'high' ? 'Alta' : 'Média' }}</span>
                  </div>
                }
              </div>
            }

            <!-- Footer Details & Quick Operations -->
            <div class="p-3.5 sm:p-4 bg-slate-50 dark:bg-slate-900/90 border-t border-slate-200 dark:border-slate-800 space-y-3">
              <div class="flex justify-between items-center text-xs text-slate-600 dark:text-slate-300">
                <span class="flex items-center gap-1">
                  <span>📅 Capturada em:</span>
                  <strong class="font-mono text-slate-800 dark:text-white">{{ photo.capturedAt | date:'dd/MM/yyyy HH:mm:ss' }}</strong>
                </span>
                <span class="bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-300 dark:border-emerald-800 flex items-center gap-1">
                  <span>✓</span>
                  <span>IndexedDB Seguro</span>
                </span>
              </div>

              <!-- Botões Principais de Leitura por Foto OCR -->
              <div class="space-y-1.5">
                <button type="button" 
                  (click)="runOcrOnPhoto(photo.storeId)" 
                  [disabled]="isReadingOcr() === photo.storeId"
                  class="w-full py-2.5 px-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer">
                  @if (isReadingOcr() === photo.storeId) {
                    <span class="animate-spin text-sm">⏳</span>
                    <span>Processando imagem...</span>
                  } @else {
                    <span class="text-base">⚡</span>
                    <span>Ler com Qwen 3.8 27B (Groq) • Fallback Gemini</span>
                  }
                </button>

                <div class="grid grid-cols-2 gap-2 text-[11px]">
                  <button type="button"
                    (click)="runOcrOnPhoto(photo.storeId, 'qwen')"
                    [disabled]="isReadingOcr() === photo.storeId"
                    class="py-1.5 px-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-lg font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors">
                    <span>⚡ Apenas Qwen 3.8 27B</span>
                  </button>
                  <button type="button"
                    (click)="runOcrOnPhoto(photo.storeId, 'gemini')"
                    [disabled]="isReadingOcr() === photo.storeId"
                    class="py-1.5 px-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-lg font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors">
                    <span>🤖 Verificar com Gemini</span>
                  </button>
                </div>
              </div>

              <!-- Action Buttons -->
              <div class="flex items-center gap-2 pt-1">
                <button type="button" 
                  (click)="downloadActivePhoto()" 
                  class="flex-1 py-2.5 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 shadow-xs cursor-pointer">
                  <span>⬇️ Baixar Foto</span>
                </button>

                <label class="flex-1 py-2.5 px-3 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 shadow-xs cursor-pointer text-center">
                  <span>🔄 Substituir</span>
                  <input type="file" 
                         accept="image/*" 
                         capture="environment" 
                         (change)="onPhotoCaptured($event, photo.storeId, photo.storeName, photo.luc, photo.readingValue)" 
                         class="hidden">
                </label>

                <button type="button" 
                  (click)="removePhoto(photo.storeId)" 
                  class="py-2.5 px-3 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1 cursor-pointer"
                  title="Excluir comprovante do IndexedDB">
                  <span>🗑️</span>
                </button>
              </div>
            </div>

          </div>
        </div>
      }

      <!-- Mobile Floating Quick Route Bar -->
      <div class="md:hidden fixed bottom-16 left-3 right-3 z-30 pointer-events-none flex justify-center">
        <div class="pointer-events-auto bg-slate-900/90 text-white backdrop-blur-md px-3.5 py-2 rounded-full shadow-xl border border-slate-700 flex items-center gap-3 text-xs">
          <span class="flex items-center gap-1.5 font-medium">
            <span class="w-2 h-2 rounded-full" [class.bg-green-400]="fieldStats().pending === 0" [class.bg-amber-400]="fieldStats().pending > 0"></span>
            <span>{{ fieldStats().completed }}/{{ fieldStats().total }}</span>
            <span class="text-slate-400">({{ fieldStats().progressPct }}%)</span>
          </span>

          @if (fieldStats().alerts > 0) {
            <button type="button" 
              (click)="statusFilter.set('alert'); mobileViewMode.set('cards')"
              class="px-2 py-0.5 rounded-full bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-[10px] flex items-center gap-1 shadow-xs cursor-pointer animate-pulse"
              title="Filtrar leituras com alerta de validação">
              <span>🚨</span>
              <span>{{ fieldStats().alerts }} alerta(s)</span>
            </button>
          }

          @if (fieldStats().pending > 0) {
            <button type="button" 
              (click)="mobileViewMode.set('step'); jumpToNextPending()"
              class="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-full text-[11px] transition-colors flex items-center gap-1 shadow-xs cursor-pointer">
              <span>⚡ Próx. Pendente</span>
            </button>
          } @else {
            <span class="text-[11px] text-green-300 font-bold">✓ Concluído</span>
          }
        </div>
      </div>
    </div>
  `
})
export class BillCalculatorComponent {
  storeService = inject(StoreService);
  historyService = inject(HistoryService);
  authService = inject(AuthService); // Inject Auth
  exportService = inject(ReportExportService);
  indexedDb = inject(IndexedDbService);
  geminiService = inject(GeminiService);

  utilityType = signal<'luz' | 'agua' | 'gas'>('luz');
  
  // Date State
  selectedMonth = signal<string>(new Date().toISOString().substring(0, 7)); // YYYY-MM
  dataLoaded = signal(false);
  lastSaved = signal<string | null>(null);
  
  // Auto-Save Status
  saveStatus = signal<'saved' | 'saving' | 'error'>('saved');

  // Export State
  isExportingExcel = signal(false);

  // UI State for Mobile
  isConfigOpen = signal(false); // Default collapsed on mobile/tech, open on desktop

  // --- FIELD / MOBILE ENHANCED STATE ---
  searchQuery = signal<string>('');
  statusFilter = signal<'all' | 'pending' | 'completed' | 'alert'>('all');
  mobileViewMode = signal<'cards' | 'step'>('cards');
  stepIndex = signal<number>(0);
  activeNoteStoreId = signal<string | null>(null);
  activeNoteText = signal<string>('');

  // --- METER PHOTO EVIDENCE (EVIDÊNCIA FOTOGRÁFICA DO MEDIDOR) ---
  meterPhotos = signal<Record<string, MeterPhotoRecord>>({});
  activePhotoRecord = signal<MeterPhotoRecord | null>(null);
  showPhotoModal = signal<boolean>(false);
  isCapturingPhoto = signal<string | null>(null);

  // --- OCR DUAL-ENGINE STATE (QWEN 3.8 27B GROQ + GEMINI 3.8 FLASH FALLBACK) ---
  isReadingOcr = signal<string | null>(null); // storeId sendo analisado
  ocrCurrentModelLabel = signal<string>('Qwen 3.8 27B (Groq)');
  ocrFeedback = signal<Record<string, {
    success: boolean;
    message: string;
    reading?: number;
    confidence?: string;
    explanation?: string;
    provider?: 'qwen' | 'gemini' | 'none';
    modelName?: string;
    fallbackUsed?: boolean;
  }>>({});

  // Utility counts for header badges:
  utilityStats = computed(() => {
    const all = this.storeService.stores();
    const reads = this.readings();
    
    const countUtil = (type: 'luz' | 'agua' | 'gas') => {
      const stores = all.filter(s => {
        const uses = type === 'luz' ? s.usesLuz : (type === 'agua' ? s.usesAgua : s.usesGas);
        return uses && s.active !== false;
      });
      const map = reads[type];
      const completed = stores.filter(s => {
        const r = map?.get(s.id);
        return r && r.reading > 0;
      }).length;
      return { total: stores.length, completed };
    };

    return {
      luz: countUtil('luz'),
      agua: countUtil('agua'),
      gas: countUtil('gas'),
    };
  });

  // -- Detailed Mode State (Luz) --
  luzCostItems = signal<CostItem[]>([
    { id: '1', name: 'Conta CEEE BSS-1 (UC 72207914)', value: 0 },
    { id: '2', name: 'Valor conta CEMIG BSS-1', value: 0 },
    { id: '3', name: 'Valor ENEVA', value: 0 },
    { id: '4', name: 'Contribuição-1 associativa CCEE', value: 0 },
    { id: '5', name: 'Contabilização energia reserva - RES005', value: 0 },
    { id: '6', name: 'Tarifa bancária Bradesco', value: 0 },
    { id: '7', name: 'Diferenças convertidas no rateio (ajustes)', value: 0 },
    { id: '8', name: 'Sumário (liq. Financeira) - SUM001', value: 0 },
    { id: '9', name: 'Automação CAG - Microblau', value: 0 },
    { id: '10', name: 'Valor conta CEEE BSS-2 (UC 68203772)', value: 0 },
    { id: '11', name: 'Valor conta CEMIG BSS-2', value: 0 },
    { id: '12', name: 'Valor conta CEEE BSS-3 (UC 64550214)', value: 0 },
    { id: '13', name: 'Valor conta CEEE BSS-4 (UC 54031443)', value: 0 },
    { id: '14', name: 'Valor Siclo - Consultoria', value: 0 },
    { id: '15', name: 'Valor Agroenergia - Consultoria', value: 0 },
    { id: '16', name: 'Gestão Mercado Livre (Versa)', value: 0 },
    { id: '17', name: 'Fluxo de caixa', value: 0 },
    { id: '18', name: 'Guia judicial', value: 0 }
  ]);
  
  luzConsumption = signal({
    bss1: 0,
    bss2: 0,
    bss3: 0,
    bss4: 0
  });

  luzAC = signal<number>(0);

  // -- Detailed Mode State (Agua) --
  aguaCostItems = signal<CostItem[]>([
    { id: 'w1', name: 'Valor conta', value: 0 },
    { id: 'w2', name: 'Enviro Tools', value: 0 },
    { id: 'w3', name: 'Fluxo de caixa', value: 0 },
  ]);

  aguaTotalReading = signal<number>(0); // Total from Bill
  aguaAC = signal<number>(0);

  // -- Detailed Mode State (Gas) --
  gasCostItems = signal<CostItem[]>([
    { id: 'g1', name: 'Valor conta', value: 0 },
    { id: 'g2', name: 'Enviro Tools', value: 0 },
    { id: 'g3', name: 'Fluxo de caixa', value: 0 },
  ]);
  gasTotalReading = signal<number>(0);

  // -- COMPLEX CONSUMPTION STORAGE --
  readings = signal<{
    luz: Map<string, StoreReading>;
    agua: Map<string, StoreReading>;
    gas: Map<string, StoreReading>;
  }>({
    luz: new Map(),
    agua: new Map(),
    gas: new Map()
  });

  // Stores Previous Month Data for Calculations
  previousReadings = signal<Map<string, { reading: number, consumption: number }>>(new Map());
  
  // Import State
  showImport = signal(false);
  pastedData = signal<Record<string, string>>({}); // Stores the raw text for each column
  skipHeader = signal(true);
  
  // AI State
  isAnalyzing = signal(false);
  aiAnalysis = signal('');
  
  // FILTERED STORES
  activeStores = computed(() => {
    const type = this.utilityType();
    const allStores = this.storeService.stores();
    const readingsMap = this.readings()[type];
    
    return allStores.filter(s => {
      const usesUtil = type === 'luz' ? s.usesLuz : (type === 'agua' ? s.usesAgua : s.usesGas);
      if (!usesUtil) return false;

      // Se a loja está ativa, inclui no rateio deste mês
      if (s.active !== false) return true;

      // Se a loja está inativa, inclui apenas se já houver leitura registrada neste mês
      const hasReadingInMonth = readingsMap && readingsMap.has(s.id);
      return !!hasReadingInMonth;
    });
  });

  constructor() {
    // 1. Data Loader Effect
    effect(() => {
      this.loadDataForCurrentSelection();
    }, { allowSignalWrites: true });

    // 2. Mobile Config Optimization: Collapse config if Tech user on Mobile
    effect(() => {
       const isTech = this.authService.isTech();
       if (isTech && this.isMobile()) {
           this.isConfigOpen.set(false);
       }
    }, { allowSignalWrites: true });

    // 3. Auto-Save Effect
    effect((onCleanup) => {
       const _costs = this.currentCostItems();
       const _luzCons = this.luzConsumption();
       const _aguaCons = this.aguaTotalReading();
       const _gasCons = this.gasTotalReading();
       const _ac = this.currentACConsumption();
       const _reads = this.readings();
       
       untracked(() => {
           if (!this.dataLoaded()) return;
           if (!this.authService.canEditReadings()) return; // Don't save if user can't edit

           this.saveStatus.set('saving');
           const timer = setTimeout(() => {
               this.internalSave();
           }, 1000); 

           onCleanup(() => clearTimeout(timer));
       });
    });
  }

  isMobile() {
      // Simple check, can be improved with ResizeObserver
      return typeof window !== 'undefined' ? window.innerWidth < 1280 : false; 
  }

  toggleConfigVisibility() {
      this.isConfigOpen.update(v => !v);
  }

  setUtility(type: 'luz' | 'agua' | 'gas') {
    this.utilityType.set(type);
    this.showImport.set(false);
    this.resetImportState();
  }

  onMonthChange(newMonth: string) {
    this.selectedMonth.set(newMonth);
  }

  createDefaultReading(): StoreReading {
      return { reading: 0, constant: 1, virtual: 0, adjustment: 1, calculatedConsumption: 0 };
  }

  // --- NEW IMPORT LOGIC (Columnar Inputs) ---

  toggleImport() {
    if (!this.authService.canImport()) return;

    if (!this.showImport()) {
        this.resetImportState();
        this.showImport.set(true);
    } else {
        this.showImport.set(false);
    }
  }

  resetImportState() {
     this.pastedData.set({});
     this.skipHeader.set(true);
  }

  // Define columns dynamically based on utility
  importColumns = computed<ColumnDef[]>(() => {
     const type = this.utilityType();
     const cols: ColumnDef[] = [
        { key: 'luc', label: 'LUC', placeholder: 'L-101\nL-102...', width: '100px' },
        { key: 'reading', label: 'Leitura', placeholder: '1500\n1620...', width: '100px' }
     ];

     if (type === 'luz') {
        cols.push({ key: 'constant', label: 'Constante', placeholder: '1\n40...', width: '80px' });
     } else if (type === 'gas') {
        cols.push({ key: 'adjustment', label: 'Ajuste (x)', placeholder: '1.34\n...', width: '80px' });
     } else {
        // Agua/Default
     }
     
     // Add remaining fields (optional but good for power users)
     cols.push({ key: 'virtual', label: 'Virtual', placeholder: '0\n0...', width: '80px' });
     
     if (type !== 'gas') {
        cols.push({ key: 'adjustment', label: 'Ajuste', placeholder: '1\n1...', width: '80px' });
     }
     
     if (type === 'gas') {
         cols.push({ key: 'adjustmentAdd', label: 'Aj (+)', placeholder: '0...', width: '80px' });
         cols.push({ key: 'fcm', label: 'FCM', placeholder: '1.07...', width: '80px' });
         cols.push({ key: 'fluxoCost', label: 'Fluxo', placeholder: '0...', width: '80px' });
     }

     return cols;
  });

  getPastedColumnValue(key: string) {
     return this.pastedData()[key] || '';
  }

  onInputColumn(event: any, key: string) {
     const val = event.target.value;
     this.pastedData.update(curr => ({ ...curr, [key]: val }));
  }

  onPasteColumn(event: ClipboardEvent, key: string, colIndex: number) {
     // If user pastes into the first column (LUC) AND content has tabs, we distribute it
     // If user pastes into other columns OR content has no tabs, we just paste normally (handled by default if we don't preventDefault, but we want control)
     
     const text = event.clipboardData?.getData('text') || '';
     
     // SMART PASTE LOGIC
     if (key === 'luc' && text.includes('\t')) {
        event.preventDefault(); // Stop default paste
        
        const rows = text.split(/\r?\n/);
        const cols = this.importColumns();
        const newData: Record<string, string[]> = {};
        
        // Initialize arrays
        cols.forEach(c => newData[c.key] = []);

        rows.forEach(row => {
            if (!row.trim()) return;
            const parts = row.split('\t');
            // Distribute parts to columns based on index
            parts.forEach((val, idx) => {
               if (cols[idx]) {
                   newData[cols[idx].key].push(val);
               }
            });
        });

        // Join back to strings
        const updateObj: Record<string, string> = {};
        cols.forEach(c => {
            if (newData[c.key].length > 0) {
                updateObj[c.key] = newData[c.key].join('\n');
            }
        });
        
        this.pastedData.set(updateObj);
     }
     // If user is just pasting a single column list (e.g. copied "Leitura" col from excel)
     // The default behavior of textarea is fine, but let's sync state
  }

  detectedRows() {
      const lucText = this.pastedData()['luc'] || '';
      return lucText.split('\n').filter(l => l.trim()).length;
  }

  executeColumnImport() {
     const data = this.pastedData();
     const type = this.utilityType();
     const skip = this.skipHeader();
     const stores = this.storeService.stores();

     // Parse each column string into an array
     const parsedCols: Record<string, string[]> = {};
     Object.keys(data).forEach(k => {
         parsedCols[k] = data[k].split('\n').map(s => s.trim());
     });

     const lucList = parsedCols['luc'] || [];
     if (lucList.length === 0) return;

     let count = 0;
     const currentReadingsMap = new Map(this.readings()[type] as Map<string, StoreReading>);

     // Iterate by row index
     for (let i = 0; i < lucList.length; i++) {
         if (skip && i === 0) continue; // Skip header row

         const luc = lucList[i];
         if (!luc) continue;

         const storeMatch = stores.find(s => 
           s.luc.toLowerCase() === luc.toLowerCase() ||
           (s.contrato && s.contrato.toLowerCase() === luc.toLowerCase())
         );
         if (storeMatch) {
             const currentData = currentReadingsMap.get(storeMatch.id) || { 
               reading: 0, constant: 1, virtual: 0, adjustment: 1, calculatedConsumption: 0 
             };
             const newData = { ...currentData };
             let updated = false;

             // Map other columns at this index
             this.importColumns().forEach(col => {
                 if (col.key === 'luc') return;
                 
                 const valStr = parsedCols[col.key]?.[i];
                 if (valStr) {
                    const cleanVal = valStr.replace('.', '').replace(',', '.');
                    const numVal = parseFloat(cleanVal);
                    // Fallback
                    const altVal = parseFloat(valStr.replace(',', '.'));
                    const finalVal = !isNaN(numVal) ? numVal : altVal;

                    if (!isNaN(finalVal)) {
                        (newData as any)[col.key] = finalVal;
                        updated = true;
                    }
                 }
             });

             if (updated) {
                 currentReadingsMap.set(storeMatch.id, newData);
                 count++;
             }
         }
     }

     this.readings.update(curr => ({ ...curr, [type]: currentReadingsMap }));
     this.toggleImport();
     alert(`${count} lojas atualizadas com sucesso!`);
  }

  // --- HISTORY & PERSISTENCE ---

  internalSave() {
    if (!this.authService.canEditReadings()) return;
    
    const type = this.utilityType();
    const month = this.selectedMonth();
    
    const currentTableData = this.tableData();
    const readingsMap = this.readings()[type] as Map<string, StoreReading>;
    const readingsToSave: Record<string, StoreReading> = {};

    currentTableData.forEach(row => {
        const original = readingsMap.get(row.storeId) || this.createDefaultReading();
        
        readingsToSave[row.storeId] = {
            ...original,
            calculatedConsumption: row.consumption 
        };
    });

    const dataToSave: BillData = {
      costItems: this.currentCostItems(),
      consumptionInput: type === 'luz' ? this.luzConsumption() : 
                        type === 'agua' ? this.aguaTotalReading() : this.gasTotalReading(),
      acInput: this.currentACConsumption(),
      readings: readingsToSave, 
      lastUpdated: new Date().toISOString()
    };

    this.historyService.saveBill(type, month, dataToSave);
    this.lastSaved.set(dataToSave.lastUpdated);
    this.saveStatus.set('saved');
  }

  loadDataForCurrentSelection() {
    const type = this.utilityType();
    const month = this.selectedMonth();
    
    // 1. Load Current Month Data
    const existingData = this.historyService.getBill(type, month);

    if (existingData) {
      if (type === 'luz') this.luzCostItems.set(existingData.costItems);
      else if (type === 'agua') this.aguaCostItems.set(existingData.costItems);
      else if (type === 'gas') this.gasCostItems.set(existingData.costItems);

      if (type === 'luz') this.luzConsumption.set(existingData.consumptionInput);
      else if (type === 'agua') this.aguaTotalReading.set(existingData.consumptionInput);
      else if (type === 'gas') this.gasTotalReading.set(existingData.consumptionInput);

      if (type === 'luz') this.luzAC.set(existingData.acInput);
      else if (type === 'agua') this.aguaAC.set(existingData.acInput);
      
      // Load Readings
      const map = new Map<string, StoreReading>();
      if (existingData.readings) {
         Object.entries(existingData.readings).forEach(([k, v]) => {
            if (typeof v === 'number') {
                 map.set(k, { reading: v, constant: 1, virtual: 0, adjustment: 1, calculatedConsumption: 0 });
            } else {
                 map.set(k, v as StoreReading);
            }
         });
      }
      this.readings.update(curr => ({ ...curr, [type]: map }));
     
      this.lastSaved.set(existingData.lastUpdated);
      this.dataLoaded.set(true);

    } else {
      this.resetFormValues(type);
      this.lastSaved.set(null);
      this.dataLoaded.set(false); // New month, empty data
    }

    // 2. Load Previous Month Data
    const prevMonth = this.getPreviousMonth(month);
    const prevData = this.historyService.getBill(type, prevMonth);
    const prevMap = new Map<string, { reading: number, consumption: number }>();

    // 3. Load Meter Photos from IndexedDB
    this.indexedDb.getMeterPhotosForMonth(type, month).then(photos => {
      this.meterPhotos.set(photos);
    }).catch(() => {
      this.meterPhotos.set({});
    });

    if (prevData) {
        Object.entries(prevData.readings).forEach(([k, v]) => {
            if (typeof v === 'object' && v !== null) {
                prevMap.set(k, { reading: (v as any).reading || 0, consumption: (v as any).calculatedConsumption || 0 });
            } else if (typeof v === 'number') {
                prevMap.set(k, { reading: v, consumption: v }); 
            }
        });
    }
    this.previousReadings.set(prevMap);
    this.dataLoaded.set(true); 
  }

  getPreviousMonth(currentMonth: string): string {
    const [year, month] = currentMonth.split('-').map(Number);
    const date = new Date(year, month - 1 - 1, 1);
    return date.toISOString().substring(0, 7);
  }

  resetFormValues(type: 'luz' | 'agua' | 'gas') {
    if (type === 'luz') {
      this.luzCostItems.update(items => items.map(i => ({ ...i, value: 0 })));
      this.luzConsumption.set({ bss1: 0, bss2: 0, bss3: 0, bss4: 0 });
      this.luzAC.set(0);
      this.readings.update(curr => ({ ...curr, luz: new Map() }));
    } else if (type === 'agua') {
      this.aguaCostItems.update(items => items.map(i => ({ ...i, value: 0 })));
      this.aguaTotalReading.set(0);
      this.aguaAC.set(0);
      this.readings.update(curr => ({ ...curr, agua: new Map() }));
    } else if (type === 'gas') {
      this.gasCostItems.update(items => items.map(i => ({ ...i, value: 0 })));
      this.gasTotalReading.set(0);
      this.readings.update(curr => ({ ...curr, gas: new Map() }));
    }
  }

  // ---

  currentCostItems = computed(() => {
    switch(this.utilityType()) {
      case 'luz': return this.luzCostItems();
      case 'agua': return this.aguaCostItems();
      case 'gas': return this.gasCostItems();
    }
  });

  currentACConsumption = computed(() => {
    if (this.utilityType() === 'luz') return this.luzAC();
    if (this.utilityType() === 'agua') return this.aguaAC();
    return 0; // Gas has no AC
  });

  addCostItem() {
    if (!this.authService.canConfigureBill()) return;
    const newId = crypto.randomUUID();
    const newItem = { id: newId, name: 'Novo Item de Custo', value: 0 };
    
    if (this.utilityType() === 'luz') this.luzCostItems.update(items => [...items, newItem]);
    else if (this.utilityType() === 'agua') this.aguaCostItems.update(items => [...items, newItem]);
    else if (this.utilityType() === 'gas') this.gasCostItems.update(items => [...items, newItem]);
  }

  removeCostItem(id: string) {
    if (!this.authService.canConfigureBill()) return;
    if (this.utilityType() === 'luz') this.luzCostItems.update(items => items.filter(i => i.id !== id));
    else if (this.utilityType() === 'agua') this.aguaCostItems.update(items => items.filter(i => i.id !== id));
    else if (this.utilityType() === 'gas') this.gasCostItems.update(items => items.filter(i => i.id !== id));
  }

  updateItemValue(id: string, newValue: number) {
    if (!this.authService.canConfigureBill()) return;
    const type = this.utilityType();
    const updater = (items: CostItem[]) => items.map(item => item.id === id ? { ...item, value: newValue } : item);
    if (type === 'luz') this.luzCostItems.update(updater);
    else if (type === 'agua') this.aguaCostItems.update(updater);
    else if (type === 'gas') this.gasCostItems.update(updater);
  }

  updateItemName(id: string, newName: string) {
    if (!this.authService.canConfigureBill()) return;
    const type = this.utilityType();
    const updater = (items: CostItem[]) => items.map(item => item.id === id ? { ...item, name: newName } : item);
    if (type === 'luz') this.luzCostItems.update(updater);
    else if (type === 'agua') this.aguaCostItems.update(updater);
    else if (type === 'gas') this.gasCostItems.update(updater);
  }

  updateLuzCons(field: keyof ReturnType<typeof this.luzConsumption>, value: number) {
    if (!this.authService.canConfigureBill()) return;
    this.luzConsumption.update(current => ({ ...current, [field]: value }));
  }

  getUnit() {
    switch(this.utilityType()) {
      case 'luz': return 'kWh';
      case 'agua': return 'm³';
      case 'gas': return 'm³';
    }
  }

  totalBillAmount = computed(() => {
    return this.currentCostItems().reduce((acc, item) => acc + (item.value || 0), 0);
  });

  totalConsumption = computed(() => {
    if (this.utilityType() === 'luz') {
       const c = this.luzConsumption();
       return (c.bss1 || 0) + (c.bss2 || 0) + (c.bss3 || 0) + (c.bss4 || 0);
    }
    if (this.utilityType() === 'agua') return this.aguaTotalReading();
    if (this.utilityType() === 'gas') return this.gasTotalReading();
    return 0;
  });

  calculatedUnitPrice = computed(() => {
    const bill = this.totalBillAmount();
    const cons = this.totalConsumption();
    if (!bill || !cons || cons === 0) return 0;
    return bill / cons;
  });

  // Histórico médio de consumo de cada loja para a utilidade ativa (excluindo mês atual para baseline limpa)
  historicalAverages = computed<Map<string, { avgConsumption: number; count: number }>>(() => {
    const allData = this.historyService.getAllData();
    const type = this.utilityType();
    const currentMonth = this.selectedMonth();
    const map = new Map<string, { total: number; count: number }>();

    Object.entries(allData).forEach(([key, bill]) => {
      const parts = key.split('_');
      if (parts.length === 2) {
        const [bType, bMonth] = parts;
        if (bType === type && bMonth && bMonth !== currentMonth && bill.readings) {
          Object.entries(bill.readings).forEach(([storeId, r]) => {
            let cons = 0;
            if (typeof r === 'object' && r !== null) {
              cons = (r as any).calculatedConsumption ?? (r as any).consumption ?? 0;
            } else if (typeof r === 'number') {
              cons = r;
            }
            if (cons > 0) {
              const curr = map.get(storeId) || { total: 0, count: 0 };
              curr.total += cons;
              curr.count += 1;
              map.set(storeId, curr);
            }
          });
        }
      }
    });

    const result = new Map<string, { avgConsumption: number; count: number }>();
    map.forEach((val, storeId) => {
      result.set(storeId, {
        avgConsumption: val.count > 0 ? val.total / val.count : 0,
        count: val.count
      });
    });
    return result;
  });

  // --- TABLE DATA CALCULATION ---
  tableData = computed(() => {
    const stores = this.activeStores();
    const price = this.calculatedUnitPrice();
    const type = this.utilityType();
    const unit = type === 'luz' ? 'kWh' : 'm³';
    
    const readingsStore = this.readings();
    const prevReadings = this.previousReadings(); 
    const histAvgMap = this.historicalAverages();

    return stores.map(store => {
      let consumption = 0;
      let cost = 0;
      
      let prevReading = 0;
      let currentReading = 0;
      let constant = 1;
      let virtual = 0;
      let adjustment = 1;
      let variation = 0;
      let adjustmentAdd = 0;
      let fcm = 1;
      let fluxoCost = 0;

      const storeMap = readingsStore[type] as Map<string, StoreReading>;
      const data = storeMap.get(store.id) || this.createDefaultReading();
      const prevData = prevReadings.get(store.id) || { reading: 0, consumption: 0 };
      
      currentReading = data.reading;
      prevReading = prevData.reading;
      constant = data.constant || 1;
      virtual = data.virtual || 0;
      
      if (type === 'gas') {
         adjustment = data.adjustment !== undefined ? data.adjustment : 1.347; 
         adjustmentAdd = data.adjustmentAdd || 0;
         fcm = data.fcm || 1.0727; 
         fluxoCost = data.fluxoCost || 0;
      } else {
         adjustment = data.adjustment || 1;
      }

      // CALCULATION LOGIC
      if (virtual > 0) {
          consumption = virtual;
      } else {
          let diff = currentReading - prevReading;
          if (diff < 0) diff = 0;

          if (type === 'gas') {
              const initial = (diff * adjustment) + adjustmentAdd;
              consumption = initial * fcm;
          } else {
              consumption = diff * constant * adjustment;
          }
      }

      if (prevData.consumption > 0) {
          variation = ((consumption - prevData.consumption) / prevData.consumption) * 100;
      }

      cost = consumption * price;

      if (type === 'gas') {
          cost += fluxoCost;
      }

      const note = data.note || '';
      const photoRec = this.meterPhotos()[store.id];
      const hasPhoto = !!data.hasPhoto || !!photoRec;
      const photoTimestamp = data.photoTimestamp || photoRec?.capturedAt || '';
      const isRead = currentReading > 0;
      const readingDiff = isRead ? (currentReading - prevReading) : 0;

      // --- VALIDAÇÃO INSTANTÂNEA DE LEITURA SUSPEITA / ERRO DE DIGITAÇÃO ---
      const histData = histAvgMap.get(store.id);
      const avgCons = histData && histData.avgConsumption > 0 ? histData.avgConsumption : (prevData.consumption > 0 ? prevData.consumption : 0);

      // 1. Alerta: Leitura menor que a anterior (possível virada de relógio ou digitação invertida)
      const isNegative = isRead && prevReading > 0 && currentReading < prevReading;

      // 2. Alerta: Consumo zero em loja ativa (relógio travado/avariado ou digitação repetida)
      const isZeroActive = isRead && store.active !== false && prevReading > 0 && (currentReading === prevReading || consumption === 0);

      // 3. Alerta: Suspeita de "zero a mais" ou erro de grandeza (salto extremo de digitação >= 4x padrão)
      const isHugeTypoJump = isRead && !isNegative && (
        (avgCons > 0 && consumption >= avgCons * 4 && consumption > 25) ||
        (prevData.consumption > 0 && consumption >= prevData.consumption * 4 && consumption > 25)
      );

      // 4. Alerta: Consumo anômalo (>80% acima da média histórica ou anterior)
      const isAtypicalJump = isRead && !isNegative && !isHugeTypoJump && (
        (avgCons > 0 && consumption > avgCons * 1.8 && consumption > 15) ||
        (prevData.consumption > 0 && consumption > prevData.consumption * 1.8 && consumption > 15)
      );

      const hasSuspiciousAlert = isNegative || isZeroActive || isHugeTypoJump || isAtypicalJump;
      const alertSeverity: 'none' | 'warning' | 'critical' = 
        (isNegative || isHugeTypoJump) ? 'critical' : (isZeroActive || isAtypicalJump ? 'warning' : 'none');

      let alertType: 'none' | 'negative' | 'zero_active' | 'typo_jump' | 'atypical_jump' = 'none';
      let alertBadge = '';
      let alertTitle = '';
      let alertMessage = '';

      if (isNegative) {
        alertType = 'negative';
        alertBadge = '🚨 Leitura Menor';
        alertTitle = 'Leitura Menor que a Anterior';
        const diffVal = Math.abs(currentReading - prevReading);
        alertMessage = `A leitura digitada (${currentReading}) é menor que a anterior (${prevReading}). Diferença: -${diffVal.toFixed(1)} ${unit}. Verifique se houve inversão de dígitos ou virada física do medidor.`;
      } else if (isHugeTypoJump) {
        alertType = 'typo_jump';
        alertBadge = '🚨 Zero a Mais?';
        alertTitle = '🚨 Suspeita de Zero a Mais (Salto Extremo)';
        const mult = avgCons > 0 ? (consumption / avgCons).toFixed(1) : (consumption / prevData.consumption).toFixed(1);
        alertMessage = `Consumo calculado de ${consumption.toFixed(1)} ${unit} está ${mult}x acima do histórico da loja (Média: ${avgCons.toFixed(1)} ${unit}). Confira no visor do relógio se não digitou um zero extra no final!`;
      } else if (isAtypicalJump) {
        alertType = 'atypical_jump';
        alertBadge = '⚠️ Salto >80%';
        alertTitle = '⚠️ Variação de Consumo Anômala (>80%)';
        const pctDiff = avgCons > 0 ? Math.round(((consumption - avgCons) / avgCons) * 100) : Math.round(variation);
        alertMessage = `Consumo de ${consumption.toFixed(1)} ${unit} está +${pctDiff}% acima da média histórica (${avgCons.toFixed(1)} ${unit}). Confira se houve vazamento ou medição atípica.`;
      } else if (isZeroActive) {
        alertType = 'zero_active';
        alertBadge = '⚠️ Consumo Zero';
        alertTitle = '⚠️ Consumo Zero em Loja Ativa';
        alertMessage = `A loja está ativa, mas a leitura digitada (${currentReading}) é idêntica à anterior (${prevReading}), gerando consumo 0 ${unit}. Verifique se o medidor está travado ou desligado.`;
      }

      const validationAlert = {
        hasAlert: hasSuspiciousAlert,
        type: alertType,
        severity: alertSeverity,
        badgeLabel: alertBadge,
        title: alertTitle,
        message: alertMessage,
        avgConsumption: avgCons,
        prevConsumption: prevData.consumption,
        prevReading,
        currentReading,
        consumption,
        diffPct: avgCons > 0 ? Math.round(((consumption - avgCons) / avgCons) * 100) : null
      };

      return {
        storeId: store.id,
        luc: store.luc,
        contrato: store.contrato || '',
        storeName: store.name,
        active: store.active !== false,
        consumption,
        cost,
        prevReading,
        currentReading,
        constant,
        virtual,
        adjustment,
        adjustmentAdd,
        fcm,
        fluxoCost,
        variation,
        note,
        hasPhoto,
        photoTimestamp,
        isRead,
        isNegative,
        isZeroActive,
        isHugeTypoJump,
        isAtypicalJump,
        hasSuspiciousAlert,
        alertSeverity,
        validationAlert,
        readingDiff
      };
    });
  });

  // --- FIELD COMPUTED FILTERS & STATS ---
  fieldStats = computed(() => {
    const list = this.tableData();
    const total = list.length;
    const completed = list.filter(item => item.isRead).length;
    const pending = total - completed;
    const alerts = list.filter(item => item.hasSuspiciousAlert).length;
    const progressPct = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, pending, alerts, progressPct };
  });

  filteredTableData = computed(() => {
    let list = this.tableData();
    const filter = this.statusFilter();
    const q = this.searchQuery().trim().toLowerCase();

    if (filter === 'pending') {
      list = list.filter(item => !item.isRead);
    } else if (filter === 'completed') {
      list = list.filter(item => item.isRead);
    } else if (filter === 'alert') {
      list = list.filter(item => item.hasSuspiciousAlert);
    }

    if (q) {
      list = list.filter(item => 
        item.storeName.toLowerCase().includes(q) ||
        item.luc.toLowerCase().includes(q) ||
        (item.contrato && item.contrato.toLowerCase().includes(q))
      );
    }

    return list;
  });

  currentStepStore = computed(() => {
    const list = this.tableData();
    if (list.length === 0) return null;
    const idx = Math.min(Math.max(0, this.stepIndex()), list.length - 1);
    return list[idx];
  });

  // Step Navigation Helpers (Modo Foco em Campo)
  nextStep() {
    const total = this.tableData().length;
    if (this.stepIndex() < total - 1) {
      this.stepIndex.update(i => i + 1);
    }
  }

  prevStep() {
    if (this.stepIndex() > 0) {
      this.stepIndex.update(i => i - 1);
    }
  }

  jumpToNextPending() {
    const list = this.tableData();
    const current = this.stepIndex();
    // Search ahead
    const nextIdx = list.findIndex((item, idx) => idx > current && !item.isRead);
    if (nextIdx !== -1) {
      this.stepIndex.set(nextIdx);
      return;
    }
    // Search from start
    const wrapIdx = list.findIndex(item => !item.isRead);
    if (wrapIdx !== -1) {
      this.stepIndex.set(wrapIdx);
    }
  }

  setStepIndex(idx: number) {
    this.stepIndex.set(idx);
  }

  // Field Notes Helpers
  openNoteEditor(storeId: string, currentNote?: string) {
    this.activeNoteStoreId.set(storeId);
    this.activeNoteText.set(currentNote || '');
  }

  closeNoteEditor() {
    this.activeNoteStoreId.set(null);
    this.activeNoteText.set('');
  }

  saveNote(storeId: string) {
    this.updateStoreNote(storeId, this.activeNoteText().trim());
    this.closeNoteEditor();
  }

  applyQuickTag(storeId: string, tag: string) {
    const item = this.tableData().find(t => t.storeId === storeId);
    const existing = item?.note || '';
    const updated = existing ? `${existing} | ${tag}` : tag;
    this.updateStoreNote(storeId, updated);
  }

  clearNote(storeId: string) {
    this.updateStoreNote(storeId, '');
  }

  updateStoreNote(storeId: string, noteText: string) {
    if (!this.authService.canEditReadings()) return;
    const type = this.utilityType();
    this.readings.update(curr => {
      const map = new Map(curr[type] as Map<string, StoreReading>);
      const currentData = map.get(storeId) || this.createDefaultReading();
      map.set(storeId, { ...currentData, note: noteText });
      return { ...curr, [type]: map };
    });
  }

  // --- UPDATERS ---

  updateDetailedReading(storeId: string, field: keyof StoreReading, value: any) {
      if (!this.authService.canEditReadings()) return;
      // Tech can edit 'reading', 'note', 'hasPhoto', 'photoTimestamp'
      if (this.authService.isTech() && field !== 'reading' && field !== 'note' && field !== 'hasPhoto' && field !== 'photoTimestamp') return;

      const type = this.utilityType();

      this.readings.update(curr => {
          const map = new Map(curr[type] as Map<string, StoreReading>);
          const currentData = map.get(storeId) || this.createDefaultReading();
          
          const safeData: StoreReading = currentData;
          const newData: StoreReading = { ...safeData, [field]: value };
          
          map.set(storeId, newData);

          return { ...curr, [type]: map };
      });
  }

  // --- PHOTO EVIDENCE METHODS (FOTO DO MEDIDOR OFFLINE NO INDEXEDDB) ---
  async onPhotoCaptured(event: Event, storeId: string, storeName: string, luc: string, currentReading: number) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];

    this.isCapturingPhoto.set(storeId);

    try {
      const type = this.utilityType();
      const month = this.selectedMonth();
      const utilLabel = type === 'luz' ? 'Luz' : type === 'agua' ? 'Água' : 'Gás';
      const watermark = `${luc} • ${storeName} • ${utilLabel} • Leitura: ${currentReading || 0}`;

      const compressedBase64 = await this.indexedDb.compressImage(file, {
        maxWidth: 1200,
        maxHeight: 1200,
        quality: 0.72,
        watermarkText: watermark
      });

      const record: MeterPhotoRecord = {
        id: `${type}_${month}_${storeId}`,
        type,
        month,
        storeId,
        storeName,
        luc,
        readingValue: currentReading || 0,
        photoDataUrl: compressedBase64,
        capturedAt: new Date().toISOString()
      };

      await this.indexedDb.saveMeterPhoto(record);

      this.meterPhotos.update(prev => ({
        ...prev,
        [storeId]: record
      }));

      if (this.activePhotoRecord()?.storeId === storeId) {
        this.activePhotoRecord.set(record);
      }

      this.updateDetailedReading(storeId, 'hasPhoto', true);
      this.updateDetailedReading(storeId, 'photoTimestamp', record.capturedAt);

      // --- 🤖 LEITURA AUTOMÁTICA DO MEDIDOR POR FOTO (1º QWEN 3.8 27B GROQ -> 2º GEMINI FALLBACK) ---
      if (typeof navigator !== 'undefined' && navigator.onLine && this.indexedDb.isOnline()) {
        this.isReadingOcr.set(storeId);
        this.ocrCurrentModelLabel.set('Qwen 3.8 27B (Groq)');
        try {
          const ocrResult = await this.geminiService.extractMeterReading(compressedBase64, type);
          if (ocrResult.success && ocrResult.reading !== null) {
            // Preenche automaticamente o campo de leitura com o valor extraído pela IA
            this.updateDetailedReading(storeId, 'reading', ocrResult.reading);

            // Atualiza também o registro fotográfico com a nova leitura
            record.readingValue = ocrResult.reading;
            await this.indexedDb.saveMeterPhoto(record);
            if (this.activePhotoRecord()?.storeId === storeId) {
              this.activePhotoRecord.set({ ...record });
            }

            const modelDesc = ocrResult.fallbackUsed 
              ? '🤖 Gemini 3.8 Flash (Fallback)' 
              : ocrResult.provider === 'qwen' 
                ? '⚡ Qwen 3.8 27B (Groq)' 
                : '🤖 Gemini 3.8 Flash';

            this.ocrFeedback.update(prev => ({
              ...prev,
              [storeId]: {
                success: true,
                message: `${modelDesc}: Leitura ${ocrResult.reading} preenchida automaticamente!`,
                reading: ocrResult.reading,
                confidence: ocrResult.confidence,
                explanation: ocrResult.explanation,
                provider: ocrResult.provider,
                modelName: ocrResult.modelName,
                fallbackUsed: ocrResult.fallbackUsed
              }
            }));
          } else {
            this.ocrFeedback.update(prev => ({
              ...prev,
              [storeId]: {
                success: false,
                message: ocrResult.explanation || ocrResult.error || 'A IA não identificou com nitidez os números do visor. Você pode digitar manualmente.',
                confidence: ocrResult.confidence,
                provider: ocrResult.provider,
                modelName: ocrResult.modelName
              }
            }));
          }
        } catch (ocrErr: any) {
          console.error('Falha no pipeline de OCR do medidor:', ocrErr);
        } finally {
          this.isReadingOcr.set(null);
        }
      } else {
        this.ocrFeedback.update(prev => ({
          ...prev,
          [storeId]: {
            success: true,
            message: 'Foto salva no IndexedDB! Em modo offline, digite a leitura manualmente.',
            confidence: 'medium',
            provider: 'none',
            modelName: 'Offline IndexedDB'
          }
        }));
      }

    } catch (err) {
      console.error('Erro ao processar foto:', err);
    } finally {
      this.isCapturingPhoto.set(null);
      input.value = '';
    }
  }

  async runOcrOnPhoto(storeId: string, forceProvider?: 'qwen' | 'gemini') {
    const photo = this.meterPhotos()[storeId];
    if (!photo) return;
    this.isReadingOcr.set(storeId);
    this.ocrCurrentModelLabel.set(
      forceProvider === 'gemini' 
        ? 'Gemini 3.8 Flash' 
        : forceProvider === 'qwen' 
          ? 'Qwen 3.8 27B (Groq)' 
          : 'Qwen 3.8 27B (Groq) + Gemini Fallback'
    );

    try {
      const ocrResult = await this.geminiService.extractMeterReading(
        photo.photoDataUrl, 
        this.utilityType(),
        forceProvider
      );

      if (ocrResult.success && ocrResult.reading !== null) {
        this.updateDetailedReading(storeId, 'reading', ocrResult.reading);
        photo.readingValue = ocrResult.reading;
        await this.indexedDb.saveMeterPhoto(photo);
        if (this.activePhotoRecord()?.storeId === storeId) {
          this.activePhotoRecord.set({ ...photo });
        }

        const modelLabel = ocrResult.fallbackUsed 
          ? '🤖 Gemini 3.8 Flash (Fallback)' 
          : ocrResult.provider === 'qwen' 
            ? '⚡ Qwen 3.8 27B (Groq)' 
            : '🤖 Gemini 3.8 Flash';

        this.ocrFeedback.update(prev => ({
          ...prev,
          [storeId]: {
            success: true,
            message: `${modelLabel}: Leitura ${ocrResult.reading} detectada (${ocrResult.confidence === 'high' ? 'Alta Confiança' : 'Média'})!`,
            reading: ocrResult.reading,
            confidence: ocrResult.confidence,
            explanation: ocrResult.explanation,
            provider: ocrResult.provider,
            modelName: ocrResult.modelName,
            fallbackUsed: ocrResult.fallbackUsed
          }
        }));
      } else {
        this.ocrFeedback.update(prev => ({
          ...prev,
          [storeId]: {
            success: false,
            message: ocrResult.explanation || ocrResult.error || 'Não foi possível detectar os dígitos do mostrador nesta foto.',
            confidence: ocrResult.confidence,
            provider: ocrResult.provider,
            modelName: ocrResult.modelName
          }
        }));
      }
    } catch (err: any) {
      this.ocrFeedback.update(prev => ({
        ...prev,
        [storeId]: {
          success: false,
          message: 'Erro na comunicação com o serviço de IA para leitura.',
          provider: 'none',
          modelName: 'Error'
        }
      }));
    } finally {
      this.isReadingOcr.set(null);
    }
  }

  dismissOcrFeedback(storeId: string) {
    this.ocrFeedback.update(prev => {
      const next = { ...prev };
      delete next[storeId];
      return next;
    });
  }

  openPhotoViewer(storeId: string) {
    const photo = this.meterPhotos()[storeId];
    if (photo) {
      this.activePhotoRecord.set(photo);
      this.showPhotoModal.set(true);
    } else {
      const type = this.utilityType();
      const month = this.selectedMonth();
      this.indexedDb.getMeterPhoto(type, month, storeId).then(rec => {
        if (rec) {
          this.meterPhotos.update(prev => ({ ...prev, [storeId]: rec }));
          this.activePhotoRecord.set(rec);
          this.showPhotoModal.set(true);
        }
      });
    }
  }

  closePhotoViewer() {
    this.showPhotoModal.set(false);
    this.activePhotoRecord.set(null);
  }

  async removePhoto(storeId: string) {
    if (typeof window !== 'undefined' && !confirm('Deseja realmente remover esta foto de evidência do IndexedDB?')) {
      return;
    }
    const type = this.utilityType();
    const month = this.selectedMonth();
    await this.indexedDb.deleteMeterPhoto(type, month, storeId);
    this.meterPhotos.update(prev => {
      const copy = { ...prev };
      delete copy[storeId];
      return copy;
    });
    this.updateDetailedReading(storeId, 'hasPhoto', false);
    this.closePhotoViewer();
  }

  downloadActivePhoto() {
    const photo = this.activePhotoRecord();
    if (!photo || typeof document === 'undefined') return;
    const a = document.createElement('a');
    a.href = photo.photoDataUrl;
    a.download = `Evidencia_Medidor_${photo.type.toUpperCase()}_${photo.month}_${photo.luc}.jpg`;
    a.click();
  }

  onPasteCell(event: ClipboardEvent, startStoreId: string, field: keyof StoreReading) {
      if (!this.authService.canEditReadings()) return;
      if (this.authService.isTech() && field !== 'reading') return;

      const text = event.clipboardData?.getData('text') || '';
      
      // If the text contains newlines, or multiple lines, it's a list from Excel/Sheets
      if (text.includes('\n') || text.includes('\r')) {
          event.preventDefault(); // Prevent pasting all rows into a single cell

          // Convert into string array
          const rawLines = text.split(/\r?\n/).map(line => line.trim());
          // Filter out last line if it's empty, common on copy-paste
          const valList = rawLines.filter((l, i) => l !== '' || i < rawLines.length - 1);
          if (valList.length === 0) return;

          const dataList = this.tableData();
          const startIndex = dataList.findIndex(item => item.storeId === startStoreId);
          if (startIndex === -1) return;

          const type = this.utilityType();

          this.readings.update(curr => {
              const map = new Map(curr[type] as Map<string, StoreReading>);
              
              valList.forEach((line, i) => {
                  const targetIndex = startIndex + i;
                  if (targetIndex >= dataList.length) return;

                  const targetStoreId = dataList[targetIndex].storeId;
                  const currentData = map.get(targetStoreId) || this.createDefaultReading();
                  
                  // In case they copied a table, take the first column value
                  const cellStr = line.split('\t')[0]?.trim() || '';
                  if (cellStr === '') return;

                  // Parse Brazilian/international numbers correctly:
                  // Handles thousand separators "." and decimal commas ","
                  let cleanVal = cellStr;
                  if (cellStr.includes(',') && cellStr.includes('.')) {
                     // e.g., "1.234,56" -> "1234.56"
                     cleanVal = cellStr.replace(/\./g, '').replace(',', '.');
                  } else if (cellStr.includes(',')) {
                     // e.g., "1234,56" -> "1234.56"
                     cleanVal = cellStr.replace(',', '.');
                  }

                  const numVal = parseFloat(cleanVal);
                  if (!isNaN(numVal)) {
                      const newData: StoreReading = { ...currentData, [field]: numVal };
                      map.set(targetStoreId, newData);
                  }
              });

              return { ...curr, [type]: map };
          });
      }
  }

  // ---

  totalDistributedConsumption = computed(() => {
    return this.tableData().reduce((acc, item) => acc + item.consumption, 0);
  });

  totalDistributedCost = computed(() => {
    return this.tableData().reduce((acc, item) => acc + item.cost, 0);
  });

  setAirConditioning(val: any) {
      if (!this.authService.canConfigureBill()) return;
      const num = Number(val);
      const safeVal = isNaN(num) ? 0 : num;
      if (this.utilityType() === 'luz') this.luzAC.set(safeVal);
      else if (this.utilityType() === 'agua') this.aguaAC.set(safeVal);
  }

  airConditioningConsumption = computed(() => this.currentACConsumption());

  airConditioningCost = computed(() => {
     return this.airConditioningConsumption() * this.calculatedUnitPrice();
  });

  commonAreaConsumption = computed(() => {
     const total = this.totalConsumption();
     const tenants = this.totalDistributedConsumption();
     const ac = this.airConditioningConsumption();
     return total - tenants - ac; 
  });

  commonAreaCost = computed(() => {
     return this.commonAreaCost ? this.commonAreaConsumption() * this.calculatedUnitPrice() : 0;
  });

  getPercentage(cost: number) {
    if (this.totalBillAmount() === 0) return '0.0';
    return ((cost / this.totalBillAmount()) * 100).toFixed(2);
  }

  canAnalyze() {
    return this.totalBillAmount() > 0 && this.totalDistributedConsumption() > 0;
  }

  // --- EXCEL EXPORT (RATEIO COMPLETO PARA HISTÓRICO) ---
  exportToExcel() {
    this.isExportingExcel.set(true);
    try {
      const type = this.utilityType();
      const label = type === 'luz' ? 'Luz' : type === 'agua' ? 'Agua' : 'Gas';
      const inputCons = type === 'luz' 
        ? this.luzConsumption() 
        : (type === 'agua' ? this.aguaTotalReading() : this.gasTotalReading());

      this.exportService.exportCalculatorToExcel({
        utilityType: type,
        utilityLabel: label,
        unit: this.getUnit(),
        month: this.selectedMonth(),
        unitPrice: this.calculatedUnitPrice(),
        totalBill: this.totalBillAmount(),
        totalConsumption: this.totalConsumption(),
        totalDistributedCost: this.totalDistributedCost(),
        totalStoreConsumption: this.totalDistributedConsumption(),
        costItems: this.currentCostItems(),
        consumptionInput: inputCons,
        tableData: this.tableData()
      });
    } catch (err) {
      console.error('Erro ao exportar rateio para Excel:', err);
    } finally {
      this.isExportingExcel.set(false);
    }
  }
}