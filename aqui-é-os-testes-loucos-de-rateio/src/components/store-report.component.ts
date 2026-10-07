import { Component, ElementRef, ViewChild, afterNextRender, inject, signal, effect, computed, untracked } from '@angular/core';
import { CommonModule, CurrencyPipe, DecimalPipe } from '@angular/common';
import * as d3 from 'd3';
import { StoreService, Store } from '../services/store.service';
import { HistoryService } from '../services/history.service';
import { ReportExportService } from '../services/report-export.service';
import { IndexedDbService, MeterPhotoRecord } from '../services/indexed-db.service';

type UtilityType = 'luz' | 'agua' | 'gas';
type StatusFilter = 'active' | 'inactive' | 'alert' | 'all';

export interface MonthlyChartItem {
  key: string;
  monthLabel: string;
  consumption: number;
  cost: number;
  unitPrice: number;
  totalBill: number;
  pctBill: number;
  hasData: boolean;
  diffFromAvgPct: number;
  momDiffPct: number | null;
  alertLevel: 'critical' | 'warning' | 'drop' | 'normal';
  photo?: MeterPhotoRecord | null;
}

export interface StoreAlertInfo {
  hasAlert: boolean;
  severity: 'critical' | 'warning' | 'drop' | 'normal';
  badgeText: string;
  diffAvgPct: number;
  momPct: number | null;
  latestConsumption: number;
  avgConsumption: number;
}

@Component({
  selector: 'app-store-report',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, DecimalPipe],
  template: `
    <div class="space-y-6 animate-fade-in pb-12">
      
      <!-- Top Store Selector & Filter Card -->
      <div class="bg-white dark:bg-slate-900 p-5 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 space-y-4 transition-colors">
        
        <!-- Header & Status Tabs -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 class="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <span class="text-xl">🏪</span> Relatório Individual por Loja
            </h2>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Pesquise pelo nome, código LUC ou contrato e identifique anomalias de consumo
            </p>
          </div>

          <!-- Status Filter Tabs -->
          <div class="flex flex-wrap items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl self-start sm:self-auto">
            <button 
              type="button"
              (click)="setStatusFilter('active')"
              [class]="statusFilter() === 'active' 
                ? 'bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-300 shadow-xs font-bold' 
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 font-medium'"
              class="px-3 py-1.5 text-xs rounded-lg transition-all flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>Ativas ({{ activeCount() }})</span>
            </button>

            <!-- Alert filter button -->
            <button 
              type="button"
              (click)="setStatusFilter('alert')"
              [class]="statusFilter() === 'alert' 
                ? 'bg-rose-600 text-white shadow-xs font-bold' 
                : alertCount() > 0 
                  ? 'text-rose-700 dark:text-rose-400 hover:text-rose-900 bg-rose-50/80 dark:bg-rose-950/40 font-bold border border-rose-200 dark:border-rose-800' 
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 font-medium'"
              class="px-3 py-1.5 text-xs rounded-lg transition-all flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full" [class]="statusFilter() === 'alert' ? 'bg-white' : alertCount() > 0 ? 'bg-rose-500 animate-pulse' : 'bg-slate-300'"></span>
              <span>⚠️ Com Alertas ({{ alertCount() }})</span>
            </button>

            <button 
              type="button"
              (click)="setStatusFilter('inactive')"
              [class]="statusFilter() === 'inactive' 
                ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 shadow-xs font-bold' 
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 font-medium'"
              class="px-3 py-1.5 text-xs rounded-lg transition-all flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-slate-400"></span>
              <span>Inativas ({{ inactiveCount() }})</span>
            </button>

            <button 
              type="button"
              (click)="setStatusFilter('all')"
              [class]="statusFilter() === 'all' 
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs font-bold' 
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 font-medium'"
              class="px-3 py-1.5 text-xs rounded-lg transition-all flex items-center gap-1.5">
              <span>Todas ({{ totalCount() }})</span>
            </button>
          </div>
        </div>

        <!-- Search Input & Quick Controls Row -->
        <div class="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
          
          <!-- Text Input to search and filter stores by Name, LUC or Contrato -->
          <div class="relative flex-1">
            <div class="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
              </svg>
            </div>
            
            <input 
              type="text" 
              [value]="searchQuery()" 
              (input)="onSearchInput($event)"
              (focus)="isDropdownOpen.set(true)"
              placeholder="Escreva a loja (nome, LUC ou contrato: ex: Madeiro, 1020, 444)..." 
              class="w-full pl-10 pr-24 py-2.5 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100/60 dark:hover:bg-slate-750 focus:bg-white dark:focus:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:border-slate-400 dark:focus:border-slate-500 text-slate-800 dark:text-slate-100 text-sm rounded-xl outline-none transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500 font-medium"
            />

            <!-- Clear & Count indicator -->
            <div class="absolute inset-y-0 right-0 pr-2.5 flex items-center gap-1.5">
              @if (searchQuery()) {
                <button 
                  type="button" 
                  (click)="clearSearch()" 
                  title="Limpar busca"
                  class="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-md hover:bg-slate-200/60 dark:hover:bg-slate-700 transition-colors">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                  </svg>
                </button>
              }
              <button 
                type="button" 
                (click)="toggleDropdown()"
                class="px-2 py-1 text-xs font-semibold bg-slate-200/80 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-650 text-slate-700 dark:text-slate-200 rounded-lg flex items-center gap-1 transition-colors"
                title="Abrir/Fechar lista suspensa">
                <span>{{ filteredStores().length }}</span>
                <span class="text-[10px]">{{ isDropdownOpen() ? '▲' : '▼' }}</span>
              </button>
            </div>

            <!-- Floating Searchable Dropdown List -->
            @if (isDropdownOpen()) {
              <div class="absolute z-40 left-0 right-0 mt-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl overflow-hidden max-h-80 flex flex-col">
                <div class="p-2 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
                  <span>{{ filteredStores().length }} loja(s) encontrada(s)</span>
                  <button type="button" (click)="isDropdownOpen.set(false)" class="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 font-semibold text-xs">
                    ✕ Fechar
                  </button>
                </div>
                
                <div class="overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 flex-1">
                  @for (store of filteredStores(); track store.id) {
                    <div 
                      (click)="selectStore(store.id)" 
                      [class.bg-teal-50]="store.id === selectedStoreId()"
                      [class.dark:bg-teal-950/40]="store.id === selectedStoreId()"
                      [class.border-l-4]="store.id === selectedStoreId()"
                      [class.border-l-teal-600]="store.id === selectedStoreId()"
                      class="p-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer transition-colors flex items-center justify-between gap-3 text-left">
                      
                      <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-2">
                          <span class="font-bold text-slate-800 dark:text-slate-100 text-sm truncate">{{ store.name }}</span>
                          @if (store.active === false) {
                            <span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">Inativa</span>
                          } @else {
                            <span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">Ativa</span>
                          }

                          <!-- Alert badge in dropdown list item -->
                          @if (storeAlertsMap()[store.id]; as alert) {
                            @if (alert.hasAlert) {
                              <span class="px-1.5 py-0.5 rounded text-[10px] font-bold border flex items-center gap-0.5"
                                [class]="alert.severity === 'critical' ? 'bg-rose-100 text-rose-800 border-rose-300' : alert.severity === 'warning' ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-sky-100 text-sky-800 border-sky-300'">
                                <span>{{ alert.badgeText }}</span>
                              </span>
                            }
                          }
                        </div>
                        <div class="flex items-center gap-2 mt-1 text-xs text-slate-500 dark:text-slate-400 font-mono">
                          <span class="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-700 dark:text-slate-300 font-semibold">LUC: {{ store.luc }}</span>
                          @if (store.contrato) {
                            <span>•</span>
                            <span class="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-700 dark:text-slate-300">Contrato: {{ store.contrato }}</span>
                          }
                          @if (store.deactivatedAt) {
                            <span>•</span>
                            <span class="text-slate-400 dark:text-slate-500 text-[11px]">Desativada em: {{ store.deactivatedAt }}</span>
                          }
                        </div>
                      </div>

                      <div class="flex items-center gap-1 text-xs shrink-0">
                        @if (store.usesLuz) { <span title="Usa Luz">⚡</span> }
                        @if (store.usesAgua) { <span title="Usa Água">💧</span> }
                        @if (store.usesGas) { <span title="Usa Gás">🔥</span> }
                        @if (store.id === selectedStoreId()) {
                          <span class="text-teal-600 font-bold ml-2">✓ Selecionada</span>
                        }
                      </div>

                    </div>
                  } @empty {
                    <div class="p-6 text-center text-slate-400 text-xs italic">
                      Nenhuma loja encontrada para o filtro atual.
                      @if (searchQuery()) {
                        <div class="mt-2">
                          <button (click)="clearSearch()" class="text-teal-600 font-semibold underline">
                            Limpar busca "{{ searchQuery() }}"
                          </button>
                        </div>
                      }
                    </div>
                  }
                </div>
              </div>
            }
          </div>

          <!-- Quick Navigation Previous / Next Store -->
          <div class="flex items-center gap-1.5 shrink-0">
            <button 
              type="button"
              (click)="selectPreviousStore()" 
              [disabled]="currentStoreIndex() <= 0"
              title="Loja Anterior na lista"
              class="px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 disabled:opacity-40 disabled:pointer-events-none border border-slate-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1">
              <span>◀</span>
              <span class="hidden sm:inline">Anterior</span>
            </button>

            <!-- Store index counter -->
            <div class="px-2.5 py-2 text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-200 rounded-xl whitespace-nowrap">
              @if (filteredStores().length > 0 && currentStoreIndex() >= 0) {
                <span>{{ currentStoreIndex() + 1 }} de {{ filteredStores().length }}</span>
              } @else {
                <span>0 lojas</span>
              }
            </div>

            <button 
              type="button"
              (click)="selectNextStore()" 
              [disabled]="currentStoreIndex() >= filteredStores().length - 1 || currentStoreIndex() < 0"
              title="Próxima Loja na lista"
              class="px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 disabled:opacity-40 disabled:pointer-events-none border border-slate-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1">
              <span class="hidden sm:inline">Próxima</span>
              <span>▶</span>
            </button>
          </div>

          <!-- Utility Filter Checkbox -->
          <div class="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl shrink-0">
            <input 
              type="checkbox" 
              id="filterByUtility" 
              [checked]="onlyWithUtility()" 
              (change)="toggleOnlyWithUtility()"
              class="rounded text-teal-600 focus:ring-teal-500 cursor-pointer"
            />
            <label for="filterByUtility" class="text-xs font-semibold text-slate-700 cursor-pointer select-none">
              Apenas com {{ getUtilityLabel() }}
            </label>
          </div>

        </div>

      </div>

      <!-- Controls Panel (Utility, Period Selection & Export Actions) -->
      <div class="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
        <div class="grid grid-cols-1 md:grid-cols-4 gap-5 items-end">

          <!-- Utility Selector -->
          <div class="flex flex-col">
            <label class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1">
              <span>🔌</span> Utilidade / Consumo
            </label>
            <div class="flex bg-slate-100 p-1 rounded-xl w-full">
              <button (click)="setUtility('luz')" 
                [class]="selectedUtility() === 'luz' ? 'bg-white text-amber-600 shadow-sm font-bold' : 'text-slate-500 hover:text-slate-800 font-semibold'"
                class="flex-1 py-2 rounded-lg text-xs transition-all flex items-center justify-center gap-1">
                ⚡ Luz
              </button>
              <button (click)="setUtility('agua')" 
                [class]="selectedUtility() === 'agua' ? 'bg-white text-blue-600 shadow-sm font-bold' : 'text-slate-500 hover:text-slate-800 font-semibold'"
                class="flex-1 py-2 rounded-lg text-xs transition-all flex items-center justify-center gap-1">
                💧 Água
              </button>
              <button (click)="setUtility('gas')" 
                [class]="selectedUtility() === 'gas' ? 'bg-white text-red-600 shadow-sm font-bold' : 'text-slate-500 hover:text-slate-800 font-semibold'"
                class="flex-1 py-2 rounded-lg text-xs transition-all flex items-center justify-center gap-1">
                🔥 Gás
              </button>
            </div>
          </div>

          <!-- Start Month Selector -->
          <div class="flex flex-col">
            <label class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1">
              <span>📅</span> Período Inicial (De)
            </label>
            <select 
              [value]="startPeriod()" 
              (change)="setStartPeriod($any($event.target).value)"
              class="bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-xl focus:ring-2 focus:ring-slate-400 p-2.5 font-semibold w-full outline-none">
              @for (period of availablePeriodsList(); track period) {
                <option [value]="period">{{ formatMonthLabel(period) }}</option>
              }
            </select>
          </div>

          <!-- End Month Selector -->
          <div class="flex flex-col">
            <label class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1">
              <span>📅</span> Período Final (Até)
            </label>
            <select 
              [value]="endPeriod()" 
              (change)="setEndPeriod($any($event.target).value)"
              class="bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-xl focus:ring-2 focus:ring-slate-400 p-2.5 font-semibold w-full outline-none">
              @for (period of filteredEndPeriods(); track period) {
                <option [value]="period">{{ formatMonthLabel(period) }}</option>
              }
            </select>
          </div>

          <!-- Export Actions -->
          <div class="flex flex-col">
            <label class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1">
              <span>📤</span> Exportar para o Lojista
            </label>
            <div class="flex items-center gap-2 w-full">
              <!-- Export PDF Button -->
              <button 
                type="button"
                (click)="exportPdf()" 
                [disabled]="isExportingPdf() || chartData().length === 0"
                class="flex-1 py-2.5 px-3 bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
                title="Exportar relatório completo com gráficos e tabelas em PDF">
                @if (isExportingPdf()) {
                  <span class="animate-spin text-xs">⏳</span>
                  <span class="text-[11px]">Gerando...</span>
                } @else {
                  <span>📄</span>
                  <span>PDF</span>
                }
              </button>

              <!-- Export Excel Button -->
              <button 
                type="button"
                (click)="exportExcel()" 
                [disabled]="isExportingExcel() || chartData().length === 0"
                class="flex-1 py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
                title="Exportar planilha detalhada com fórmulas e diagnósticos em Excel (.xlsx)">
                @if (isExportingExcel()) {
                  <span class="animate-spin text-xs">⏳</span>
                  <span class="text-[11px]">Gerando...</span>
                } @else {
                  <span>📊</span>
                  <span>Excel</span>
                }
              </button>
            </div>
          </div>

        </div>
      </div>

      <!-- Selected Store Badge & Details -->
      @if (selectedStore(); as store) {
        <div class="bg-white px-5 py-3.5 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-lg bg-slate-900 text-white flex items-center justify-center font-bold text-sm">
              {{ store.name.substring(0, 2).toUpperCase() }}
            </div>
            <div>
              <div class="flex items-center gap-2">
                <h3 class="font-bold text-slate-800 text-base leading-tight">{{ store.name }}</h3>
                @if (store.active === false) {
                  <span class="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-300">
                    ○ Inativa {{ store.deactivatedAt ? '(' + store.deactivatedAt + ')' : '' }}
                  </span>
                } @else {
                  <span class="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                    ● Ativa
                  </span>
                }
              </div>
              <div class="flex flex-wrap items-center gap-2 text-xs font-mono mt-1">
                <span class="bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-semibold border border-slate-200">LUC: {{ store.luc }}</span>
                <span class="text-slate-300">•</span>
                <span class="text-slate-600 bg-slate-50 px-2 py-0.5 rounded border border-slate-200 font-semibold">
                  Contrato: {{ store.contrato || 'Não informado' }}
                </span>
                @if (store.deactivationReason) {
                  <span class="text-slate-300">•</span>
                  <span class="text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 text-[11px]">
                    {{ store.deactivationReason }}
                  </span>
                }
              </div>
            </div>
          </div>

          <div class="flex items-center gap-2 text-xs">
            <span class="text-slate-400 font-medium">Serviços habilitados:</span>
            <span class="px-2 py-0.5 rounded text-[11px] font-bold" [class]="store.usesLuz ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-400 line-through'">⚡ Luz</span>
            <span class="px-2 py-0.5 rounded text-[11px] font-bold" [class]="store.usesAgua ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-400 line-through'">💧 Água</span>
            <span class="px-2 py-0.5 rounded text-[11px] font-bold" [class]="store.usesGas ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-400 line-through'">🔥 Gás</span>
          </div>
        </div>
      }

      <!-- Warning if selected store doesn't use the selected utility -->
      @if (selectedStore() && !doesStoreUseUtility()) {
        <div class="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-xl text-sm flex items-center gap-2">
          <span>⚠️</span>
          <span>A loja <strong>{{ selectedStore()?.name }}</strong> não está configurada para ratear <strong>{{ getUtilityLabel() }}</strong>. Os dados mostrados abaixo podem ser inexistentes ou nulos.</span>
        </div>
      }

      <!-- HERO BANNER: Sistema de Alertas Visuais e Diagnóstico de Consumo -->
      @if (selectedStore() && doesStoreUseUtility()) {
        @if (storeDiagnostic(); as diag) {
          @if (diag.hasAlert) {
            <!-- Alerta Crítico ou de Atenção Ativo -->
            <div class="p-5 rounded-2xl border shadow-sm transition-all"
              [class]="diag.severity === 'critical' 
                ? 'bg-rose-50/90 border-rose-300 text-rose-950' 
                : diag.severity === 'warning' 
                  ? 'bg-amber-50/90 border-amber-300 text-amber-950'
                  : 'bg-sky-50/90 border-sky-300 text-sky-950'">
              
              <div class="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-4 border-b"
                [class]="diag.severity === 'critical' ? 'border-rose-200' : diag.severity === 'warning' ? 'border-amber-200' : 'border-sky-200'">
                
                <div class="flex items-center gap-3">
                  <div class="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shadow-xs"
                    [class]="diag.severity === 'critical' ? 'bg-rose-600 text-white' : diag.severity === 'warning' ? 'bg-amber-500 text-white' : 'bg-sky-600 text-white'">
                    @if (diag.severity === 'critical') { 🚨 }
                    @else if (diag.severity === 'warning') { ⚠️ }
                    @else { 📉 }
                  </div>
                  <div>
                    <div class="flex items-center gap-2">
                      <span class="px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider"
                        [class]="diag.severity === 'critical' ? 'bg-rose-200 text-rose-900' : diag.severity === 'warning' ? 'bg-amber-200 text-amber-900' : 'bg-sky-200 text-sky-900'">
                        {{ diag.badgeTitle }}
                      </span>
                      <span class="text-xs font-semibold opacity-75">Diagnóstico Automático ({{ diag.latestMonthLabel }})</span>
                    </div>
                    <h4 class="text-base font-bold mt-0.5 leading-snug">{{ diag.title }}</h4>
                  </div>
                </div>

                <div class="text-xs font-medium px-3 py-1.5 rounded-xl bg-white/70 border backdrop-blur-xs flex items-center gap-2 self-stretch lg:self-auto justify-between lg:justify-start"
                  [class]="diag.severity === 'critical' ? 'border-rose-200 text-rose-800' : diag.severity === 'warning' ? 'border-amber-200 text-amber-800' : 'border-sky-200 text-sky-800'">
                  <span>Mês de Referência:</span>
                  <span class="font-bold">{{ diag.latestMonthLabel }}</span>
                </div>
              </div>

              <!-- Comparative Metric Badges Grid -->
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 my-4">
                <div class="bg-white/80 p-3 rounded-xl border border-black/5 shadow-2xs">
                  <div class="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Último Consumo</div>
                  <div class="text-lg font-black text-slate-900 mt-0.5">
                    {{ diag.latestConsumption | number:'1.0-2' }} <span class="text-xs font-normal text-slate-500">{{ getUnit() }}</span>
                  </div>
                  <div class="text-[10px] text-slate-400 mt-0.5">{{ diag.latestMonthLabel }}</div>
                </div>

                <div class="bg-white/80 p-3 rounded-xl border border-black/5 shadow-2xs">
                  <div class="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Média Histórica</div>
                  <div class="text-lg font-black text-slate-700 mt-0.5">
                    {{ diag.avgConsumption | number:'1.0-2' }} <span class="text-xs font-normal text-slate-500">{{ getUnit() }}</span>
                  </div>
                  <div class="text-[10px] text-slate-400 mt-0.5">Média da loja no shopping</div>
                </div>

                <div class="bg-white/80 p-3 rounded-xl border border-black/5 shadow-2xs">
                  <div class="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Desvio vs Média</div>
                  <div class="text-lg font-black mt-0.5 flex items-center gap-1"
                    [class]="diag.diffAvgPct > 0 ? (diag.diffAvgPct >= 40 ? 'text-rose-600' : 'text-amber-600') : 'text-sky-600'">
                    <span>{{ diag.diffAvgPct > 0 ? '+' : '' }}{{ diag.diffAvgPct | number:'1.1-1' }}%</span>
                    <span class="text-sm">{{ diag.diffAvgPct > 0 ? '🔺' : '🔻' }}</span>
                  </div>
                  <div class="text-[10px] text-slate-400 mt-0.5">Variação da média</div>
                </div>

                <div class="bg-white/80 p-3 rounded-xl border border-black/5 shadow-2xs">
                  <div class="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Salto MoM</div>
                  <div class="text-lg font-black mt-0.5 flex items-center gap-1"
                    [class]="diag.momDiffPct !== null ? (diag.momDiffPct > 0 ? (diag.momDiffPct >= 40 ? 'text-rose-600' : 'text-amber-600') : 'text-sky-600') : 'text-slate-400'">
                    @if (diag.momDiffPct !== null) {
                      <span>{{ diag.momDiffPct > 0 ? '+' : '' }}{{ diag.momDiffPct | number:'1.1-1' }}%</span>
                      <span class="text-sm">{{ diag.momDiffPct > 0 ? '🔺' : '🔻' }}</span>
                    } @else {
                      <span>—</span>
                    }
                  </div>
                  <div class="text-[10px] text-slate-400 mt-0.5">Vs mês anterior</div>
                </div>
              </div>

              <!-- Actionable Technical Recommendation -->
              <div class="bg-white/90 p-3.5 rounded-xl border flex items-start gap-3 text-xs leading-relaxed"
                [class]="diag.severity === 'critical' ? 'border-rose-200 text-rose-900' : diag.severity === 'warning' ? 'border-amber-200 text-amber-900' : 'border-sky-200 text-sky-900'">
                <span class="text-base shrink-0">💡</span>
                <div>
                  <strong class="font-bold">Recomendação da Equipe de Operações:</strong>
                  <span class="ml-1">{{ diag.recommendation }}</span>
                </div>
              </div>

            </div>
          } @else {
            <!-- Consumo Estável / Normal -->
            <div class="p-4 rounded-xl border border-emerald-200 bg-emerald-50/70 text-emerald-950 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
              <div class="flex items-center gap-3">
                <div class="w-9 h-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-sm shrink-0">
                  ✓
                </div>
                <div>
                  <h4 class="font-bold text-sm text-emerald-900 flex items-center gap-2">
                    <span>Consumo Estável e Regular</span>
                    <span class="px-2 py-0.2 rounded-full text-[10px] font-black bg-emerald-200 text-emerald-800">NORMAL</span>
                  </h4>
                  <p class="text-xs text-emerald-800 mt-0.5">
                    O consumo mais recente (<strong>{{ diag.latestConsumption | number:'1.0-2' }} {{ getUnit() }}</strong> em {{ diag.latestMonthLabel }}) varia apenas 
                    <strong>{{ diag.diffAvgPct > 0 ? '+' : '' }}{{ diag.diffAvgPct | number:'1.1-1' }}%</strong> em relação à média histórica ({{ diag.avgConsumption | number:'1.0-2' }} {{ getUnit() }}).
                  </p>
                </div>
              </div>
              <div class="text-[11px] font-semibold text-emerald-700 bg-white/80 px-2.5 py-1 rounded-lg border border-emerald-200 whitespace-nowrap self-end sm:self-auto">
                Sem desvios atípicos
              </div>
            </div>
          }
        }
      }

      <!-- Performance Cards Grid -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
        
        <!-- Quantity Card -->
        <div class="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
          <div class="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1 flex justify-between items-center">
            <span>Consumo Acumulado</span>
            <span class="text-slate-300">📈</span>
          </div>
          <div class="text-3xl font-extrabold" [class]="getUtilityColorText()">
            {{ metrics().totalConsumption | number:'1.0-2' }} <span class="text-xs font-semibold text-slate-400">{{ getUnit() }}</span>
          </div>
          <div class="text-xs text-slate-400 mt-2">No período selecionado</div>
        </div>

        <!-- Medium Quantity Card -->
        <div class="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
          <div class="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1 flex justify-between items-center">
            <span>Média Histórica</span>
            <span class="text-slate-300">📊</span>
          </div>
          <div class="text-3xl font-extrabold text-slate-700">
            {{ metrics().avgConsumption | number:'1.0-2' }} <span class="text-xs font-semibold text-slate-400">{{ getUnit() }}</span>
          </div>
          <div class="text-xs text-slate-400 mt-2">Base de referência da loja</div>
        </div>

        <!-- Costs Card -->
        <div class="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
          <div class="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1 flex justify-between items-center">
            <span>Valor Total Pago</span>
            <span class="text-green-500">💰</span>
          </div>
          <div class="text-3xl font-extrabold text-slate-800">
            {{ metrics().totalCost | currency:'BRL':'symbol':'1.2-2' }}
          </div>
          <div class="text-xs text-slate-400 mt-2">Rateio proporcional total</div>
        </div>

        <!-- Medium Costs Card -->
        <div class="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
          <div class="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1 flex justify-between items-center">
            <span>Gasto Médio Mensal</span>
            <span class="text-slate-300">📉</span>
          </div>
          <div class="text-3xl font-extrabold text-slate-600">
            {{ metrics().avgCost | currency:'BRL':'symbol':'1.2-2' }}
          </div>
          <div class="text-xs text-slate-400 mt-2">Por mês com leitura</div>
        </div>

      </div>

      <!-- Charts Section (Dynamically updated via D3) -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        <!-- Consumption Chart Card -->
        <div class="bg-white p-6 rounded-2xl shadow-md border border-slate-100 flex flex-col">
          <div class="flex justify-between items-center mb-6">
            <div>
              <h3 class="text-lg font-bold text-slate-800 flex items-center gap-2">
                <span class="w-2.5 h-6 rounded bg-slate-400" [class]="getUtilityColorBg()"></span>
                Histórico de Consumo ({{ getUnit() }})
              </h3>
              <p class="text-xs text-slate-400 mt-0.5">Pontos com anel colorido indicam desvios da média</p>
            </div>
            <div class="flex items-center gap-2 text-[11px] font-medium text-slate-500">
              <span class="inline-block w-3 h-0.5 border-t-2 border-dashed border-slate-400"></span>
              <span>Linha de Média</span>
            </div>
          </div>

          <div class="relative w-full h-80 bg-slate-50/50 rounded-2xl border border-slate-100/40 flex items-center justify-center overflow-hidden">
            @if (chartData().length === 0) {
              <div class="text-slate-400 text-sm italic py-12 flex flex-col items-center gap-2">
                <span>📭</span>
                <span>Nenhum consumo registrado neste período</span>
              </div>
            }
            <div #consumptionChartContainer class="w-full h-full"></div>
          </div>
        </div>

        <!-- Cost Chart Card -->
        <div class="bg-white p-6 rounded-2xl shadow-md border border-slate-100 flex flex-col">
          <div class="flex justify-between items-center mb-6">
            <div>
              <h3 class="text-lg font-bold text-slate-800 flex items-center gap-2">
                <span class="w-2.5 h-6 rounded bg-emerald-500"></span>
                Histórico de Custo (R$)
              </h3>
              <p class="text-xs text-slate-400 mt-0.5">Valor faturado proporcional ao consumo</p>
            </div>
            <span class="text-xs font-medium text-slate-400">valor proporcional</span>
          </div>

          <div class="relative w-full h-80 bg-slate-50/50 rounded-2xl border border-slate-100/40 flex items-center justify-center overflow-hidden">
            @if (chartData().length === 0) {
              <div class="text-slate-400 text-sm italic py-12 flex flex-col items-center gap-2">
                <span>📭</span>
                <span>Nenhum gasto registrado neste período</span>
              </div>
            }
            <div #costChartContainer class="w-full h-full"></div>
          </div>
        </div>

      </div>

      <!-- Detailed Report Table com Destaques Visuais de Alertas -->
      <div class="bg-white p-6 rounded-2xl shadow-md border border-slate-100">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h3 class="text-lg font-bold text-slate-800">Detalhamento por Mês & Diagnóstico</h3>
            <p class="text-xs text-slate-500 mt-0.5">
              Valores acompanhados de comparação com a média histórica e variações mês a mês (MoM)
            </p>
          </div>
          
          <!-- Legend of alert badges -->
          <div class="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-500">
            <span class="px-2 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-200">🚨 Crítico (≥+40%)</span>
            <span class="px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">⚠️ Elevado (≥+20%)</span>
            <span class="px-2 py-0.5 rounded bg-sky-100 text-sky-800 border border-sky-200">📉 Queda Forte (≤-25%)</span>
            <span class="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">✓ Estável</span>
          </div>
        </div>
        
        <div class="overflow-x-auto rounded-xl border border-slate-200">
          <table class="w-full text-left text-sm border-collapse">
            <thead class="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 text-xs uppercase tracking-wider">
              <tr>
                <th class="p-3.5 pl-6">Mês Relevante</th>
                <th class="p-3.5 text-right">Consumo da Loja</th>
                <th class="p-3.5 text-center">Desvio da Média</th>
                <th class="p-3.5 text-center">Variação MoM</th>
                <th class="p-3.5 text-right">Preço Unitário</th>
                <th class="p-3.5 text-right">Valor Pago (Est.)</th>
                <th class="p-3.5 text-center">Diagnóstico</th>
                <th class="p-3.5 text-center">Evidência Fotográfica</th>
                <th class="p-3.5 text-right pr-6">Fatura (%)</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 text-slate-600">
              @for (item of chartData(); track item.key) {
                <tr [class]="item.alertLevel === 'critical' 
                  ? 'bg-rose-50/60 hover:bg-rose-50 font-medium' 
                  : item.alertLevel === 'warning' 
                    ? 'bg-amber-50/40 hover:bg-amber-50' 
                    : item.alertLevel === 'drop'
                      ? 'bg-sky-50/30 hover:bg-sky-50'
                      : 'hover:bg-slate-50 transition-colors'">
                  
                  <!-- Month -->
                  <td class="p-3.5 pl-6 font-bold text-slate-800 whitespace-nowrap">
                    <div class="flex items-center gap-2">
                      @if (item.alertLevel === 'critical') {
                        <span class="text-rose-600 text-sm">🚨</span>
                      } @else if (item.alertLevel === 'warning') {
                        <span class="text-amber-500 text-sm">⚠️</span>
                      } @else if (item.alertLevel === 'drop') {
                        <span class="text-sky-500 text-sm">📉</span>
                      }
                      <span>{{ item.monthLabel }}</span>
                    </div>
                  </td>

                  <!-- Consumption -->
                  <td class="p-3.5 text-right font-mono font-bold text-slate-800 whitespace-nowrap">
                    {{ item.consumption | number:'1.0-2' }} <span class="text-xs font-normal text-slate-400">{{ getUnit() }}</span>
                  </td>

                  <!-- Variance vs Historical Average -->
                  <td class="p-3.5 text-center whitespace-nowrap">
                    <span class="px-2 py-0.5 rounded-full text-xs font-bold inline-flex items-center gap-1 font-mono"
                      [class]="item.diffFromAvgPct >= 40 
                        ? 'bg-rose-100 text-rose-800 border border-rose-300' 
                        : item.diffFromAvgPct >= 20 
                          ? 'bg-amber-100 text-amber-800 border border-amber-300' 
                          : item.diffFromAvgPct <= -25 
                            ? 'bg-sky-100 text-sky-800 border border-sky-300' 
                            : 'bg-slate-100 text-slate-700'">
                      <span>{{ item.diffFromAvgPct > 0 ? '+' : '' }}{{ item.diffFromAvgPct | number:'1.0-1' }}%</span>
                      @if (item.diffFromAvgPct > 15) { <span>🔺</span> }
                      @else if (item.diffFromAvgPct < -15) { <span>🔻</span> }
                    </span>
                  </td>

                  <!-- MoM Change -->
                  <td class="p-3.5 text-center whitespace-nowrap font-mono text-xs">
                    @if (item.momDiffPct !== null) {
                      <span class="px-2 py-0.5 rounded font-bold"
                        [class]="item.momDiffPct >= 40 
                          ? 'bg-rose-100 text-rose-700' 
                          : item.momDiffPct >= 20 
                            ? 'bg-amber-100 text-amber-700' 
                            : item.momDiffPct <= -30 
                              ? 'bg-sky-100 text-sky-700' 
                              : 'text-slate-600'">
                        {{ item.momDiffPct > 0 ? '+' : '' }}{{ item.momDiffPct | number:'1.1-1' }}%
                      </span>
                    } @else {
                      <span class="text-slate-300 font-normal">—</span>
                    }
                  </td>

                  <!-- Unit Price -->
                  <td class="p-3.5 text-right font-mono text-slate-400 whitespace-nowrap">
                    {{ item.unitPrice | currency:'BRL':'symbol':'1.4-4' }}
                  </td>

                  <!-- Cost -->
                  <td class="p-3.5 text-right font-bold text-slate-800 whitespace-nowrap">
                    {{ item.cost | currency:'BRL' }}
                  </td>

                  <!-- Alert Badge -->
                  <td class="p-3.5 text-center whitespace-nowrap">
                    @if (item.alertLevel === 'critical') {
                      <span class="px-2.5 py-1 rounded-full text-[11px] font-black bg-rose-600 text-white shadow-2xs">
                        🚨 Salto Crítico
                      </span>
                    } @else if (item.alertLevel === 'warning') {
                      <span class="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500 text-white shadow-2xs">
                        ⚠️ Acima da Média
                      </span>
                    } @else if (item.alertLevel === 'drop') {
                      <span class="px-2.5 py-1 rounded-full text-[11px] font-bold bg-sky-600 text-white shadow-2xs">
                        📉 Queda Atípica
                      </span>
                    } @else {
                      <span class="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                        ✓ Padrão Normal
                      </span>
                    }
                  </td>

                  <!-- Evidência Fotográfica do Medidor (IndexedDB) -->
                  <td class="p-3.5 text-center whitespace-nowrap">
                    @if (item.photo) {
                      <button type="button" 
                        (click)="openPhotoViewer(item.photo)" 
                        class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 text-xs font-bold transition-all shadow-2xs cursor-pointer active:scale-95"
                        title="Ver comprovante fotográfico gravado no IndexedDB">
                        <img [src]="item.photo.photoDataUrl" 
                             alt="Comprovante" 
                             class="w-5 h-5 rounded object-cover border border-teal-400">
                        <span>📷 Ver Foto</span>
                      </button>
                    } @else {
                      <span class="text-xs text-slate-300 font-mono">—</span>
                    }
                  </td>

                  <!-- Pct in bill -->
                  <td class="p-3.5 text-right pr-6 whitespace-nowrap">
                    <div class="flex items-center justify-end gap-2">
                      <span class="text-xs text-slate-500 font-medium">{{ item.pctBill | number:'1.1-1' }}%</span>
                      <div class="w-14 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                        <div class="h-1.5 rounded-full" [class]="getUtilityColorBg()" [style.width.%]="item.pctBill"></div>
                      </div>
                    </div>
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="9" class="p-8 text-center text-slate-400 italic">
                    Nenhum lançamento encontrado para a loja e utilidade selecionadas no período.
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      <!-- MODAL DE VISUALIZAÇÃO DE COMPROVANTE FOTOGRÁFICO DO MEDIDOR (IndexedDB) -->
      @if (showPhotoModal() && activeReportPhoto(); as photo) {
        <div class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
          <div class="absolute inset-0 bg-black/85 backdrop-blur-sm" (click)="closePhotoViewer()"></div>
          <div class="bg-white rounded-2xl shadow-2xl overflow-hidden w-full max-w-lg relative z-10 max-h-[92vh] flex flex-col border border-slate-700 animate-fade-in">
            <div class="bg-slate-900 text-white p-3.5 sm:p-4 flex justify-between items-center border-b border-slate-800">
              <div class="flex items-center gap-2.5">
                <span class="text-xs font-mono font-extrabold bg-teal-500 text-slate-950 px-2 py-0.5 rounded shadow-2xs">
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
            <div class="flex-1 bg-slate-950 flex items-center justify-center overflow-hidden relative min-h-[260px] max-h-[58vh]">
              <img [src]="photo.photoDataUrl" 
                   alt="Foto do Medidor" 
                   class="max-w-full max-h-[58vh] object-contain select-none">
              <div class="absolute top-3 left-3 bg-slate-900/85 backdrop-blur-md text-white px-2.5 py-1 rounded-lg text-xs font-mono border border-slate-700 flex items-center gap-1.5 shadow-md">
                <span class="text-teal-400 font-bold">🔢 Leitura Registrada:</span>
                <strong class="text-white">{{ photo.readingValue || 0 }}</strong>
              </div>
            </div>
            <div class="p-3.5 sm:p-4 bg-slate-50 border-t border-slate-200 flex flex-col gap-2.5">
              <div class="flex justify-between items-center text-xs text-slate-600">
                <span class="flex items-center gap-1">
                  <span>📅 Capturada em:</span>
                  <strong class="font-mono text-slate-800">{{ photo.capturedAt | date:'dd/MM/yyyy HH:mm:ss' }}</strong>
                </span>
                <span class="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-300">
                  ✓ Comprovante IndexedDB
                </span>
              </div>
              <div class="flex items-center gap-2 pt-1">
                <button type="button" 
                  (click)="downloadActivePhoto()" 
                  class="flex-1 py-2.5 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 shadow-xs cursor-pointer">
                  <span>⬇️ Baixar Foto Comprovante</span>
                </button>
                <button type="button" 
                  (click)="closePhotoViewer()" 
                  class="py-2.5 px-4 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-bold transition-colors cursor-pointer">
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      }

    </div>
  `,
  styles: [`
    @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
    .animate-fade-in { animation: fadeIn 0.4s ease-out; }
  `]
})
export class StoreReportComponent {
  storeService = inject(StoreService);
  historyService = inject(HistoryService);
  exportService = inject(ReportExportService);
  indexedDb = inject(IndexedDbService);

  // Meter Evidence Photos (IndexedDB)
  reportPhotos = signal<Record<string, MeterPhotoRecord>>({});
  activeReportPhoto = signal<MeterPhotoRecord | null>(null);
  showPhotoModal = signal<boolean>(false);

  @ViewChild('consumptionChartContainer') consumptionChartRef!: ElementRef;
  @ViewChild('costChartContainer') costChartRef!: ElementRef;

  // Active inputs
  selectedStoreId = signal<string>('');
  selectedUtility = signal<UtilityType>('luz');
  startPeriod = signal<string>('');
  endPeriod = signal<string>('');

  // Export loading states
  isExportingPdf = signal<boolean>(false);
  isExportingExcel = signal<boolean>(false);

  // Search & Filter state
  searchQuery = signal<string>('');
  statusFilter = signal<StatusFilter>('active');
  onlyWithUtility = signal<boolean>(false);
  isDropdownOpen = signal<boolean>(false);

  viewReady = signal(false);

  // Counts
  totalCount = computed(() => this.storeService.stores().length);
  activeCount = computed(() => this.storeService.stores().filter(s => s.active !== false).length);
  inactiveCount = computed(() => this.storeService.stores().filter(s => s.active === false).length);

  // Global Alerts Map for all stores based on the currently selected utility
  storeAlertsMap = computed<Record<string, StoreAlertInfo>>(() => {
    const allData = this.historyService.getAllData();
    const utility = this.selectedUtility();
    const periods = this.availablePeriodsList();
    const stores = this.storeService.stores();
    const map: Record<string, StoreAlertInfo> = {};

    for (const store of stores) {
      // Gather active consumption data across periods
      const values: { period: string; val: number }[] = [];
      for (const p of periods) {
        const bill = allData[`${utility}_${p}`];
        if (bill && bill.readings && bill.readings[store.id] !== undefined) {
          const r: any = bill.readings[store.id];
          let val = 0;
          if (typeof r === 'object') {
            val = r.calculatedConsumption ?? r.consumption ?? 0;
          } else if (typeof r === 'number') {
            val = r;
          }
          if (val > 0) {
            values.push({ period: p, val });
          }
        }
      }

      if (values.length < 2) {
        map[store.id] = {
          hasAlert: false,
          severity: 'normal',
          badgeText: '',
          diffAvgPct: 0,
          momPct: null,
          latestConsumption: values.length === 1 ? values[0].val : 0,
          avgConsumption: values.length === 1 ? values[0].val : 0
        };
        continue;
      }

      const sum = values.reduce((acc, v) => acc + v.val, 0);
      const avg = sum / values.length;
      const latest = values[values.length - 1].val;
      const prev = values[values.length - 2].val;

      const diffAvgPct = avg > 0 ? ((latest - avg) / avg) * 100 : 0;
      const momPct = prev > 0 ? ((latest - prev) / prev) * 100 : 0;

      let hasAlert = false;
      let severity: 'critical' | 'warning' | 'drop' | 'normal' = 'normal';
      let badgeText = '';

      if (diffAvgPct >= 40 || momPct >= 50) {
        hasAlert = true;
        severity = 'critical';
        badgeText = diffAvgPct >= 40 ? `🚨 +${Math.round(diffAvgPct)}% vs Média` : `🚨 Salto +${Math.round(momPct)}%`;
      } else if (diffAvgPct >= 20 || momPct >= 30) {
        hasAlert = true;
        severity = 'warning';
        badgeText = diffAvgPct >= 20 ? `⚠️ +${Math.round(diffAvgPct)}% Média` : `⚠️ Salto +${Math.round(momPct)}%`;
      } else if (diffAvgPct <= -35 || momPct <= -40) {
        hasAlert = true;
        severity = 'drop';
        badgeText = `📉 Queda ${Math.round(diffAvgPct)}%`;
      }

      map[store.id] = {
        hasAlert,
        severity,
        badgeText,
        diffAvgPct,
        momPct,
        latestConsumption: latest,
        avgConsumption: avg
      };
    }

    return map;
  });

  // Count of stores with active alerts
  alertCount = computed(() => {
    const map = this.storeAlertsMap();
    return Object.values(map).filter(a => a.hasAlert).length;
  });

  // Grouped stores for selector
  activeStoresList = computed(() => this.storeService.stores().filter(s => s.active !== false));
  inactiveStoresList = computed(() => this.storeService.stores().filter(s => s.active === false));

  // Dynamic filtered stores based on statusFilter, onlyWithUtility and searchQuery
  filteredStores = computed(() => {
    let list = this.storeService.stores();

    // 1. Status / Alert Filter
    const status = this.statusFilter();
    if (status === 'active') {
      list = list.filter(s => s.active !== false);
    } else if (status === 'inactive') {
      list = list.filter(s => s.active === false);
    } else if (status === 'alert') {
      const alertMap = this.storeAlertsMap();
      list = list.filter(s => alertMap[s.id]?.hasAlert);
    }

    // 2. Filter by Utility
    if (this.onlyWithUtility()) {
      const util = this.selectedUtility();
      list = list.filter(s => {
        if (util === 'luz') return s.usesLuz;
        if (util === 'agua') return s.usesAgua;
        if (util === 'gas') return s.usesGas;
        return true;
      });
    }

    // 3. Search Query (Name, LUC, Contrato)
    const query = this.searchQuery().trim().toLowerCase();
    if (query) {
      list = list.filter(s => 
        s.name.toLowerCase().includes(query) ||
        s.luc.toLowerCase().includes(query) ||
        (s.contrato && s.contrato.toLowerCase().includes(query))
      );
    }

    return list;
  });

  // Current store index inside filteredStores
  currentStoreIndex = computed(() => {
    const currentId = this.selectedStoreId();
    const list = this.filteredStores();
    return list.findIndex(s => s.id === currentId);
  });

  // Auto-populated periods derived from history as well as mock buffer
  availablePeriodsList = computed(() => {
    const allData = this.historyService.getAllData();
    const monthSet = new Set<string>();

    // Scan keys (format e.g.: "luz_2026-02")
    Object.keys(allData).forEach(key => {
       const parts = key.split('_');
       if (parts.length === 2 && parts[1].length === 7) {
          monthSet.add(parts[1]);
       }
    });

    // If empty, generate the 12 most recent months up to current system date to avoid empty lists
    if (monthSet.size < 6) {
       const now = new Date();
       for (let i = 11; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const yyyy = d.getFullYear();
          const mm = (d.getMonth() + 1).toString().padStart(2, '0');
          monthSet.add(`${yyyy}-${mm}`);
       }
    }

    return Array.from(monthSet).sort();
  });

  // End period must be chronologically >= start period
  filteredEndPeriods = computed(() => {
    const start = this.startPeriod();
    const list = this.availablePeriodsList();
    if (!start) return list;
    return list.filter(p => p >= start);
  });

  // Active Store object
  selectedStore = computed(() => {
    const id = this.selectedStoreId();
    return this.storeService.stores().find(s => s.id === id) || null;
  });

  // Data matching the selected query, enriched with comparative variance and alert status
  chartData = computed<MonthlyChartItem[]>(() => {
    const store = this.selectedStore();
    if (!store) return [];

    const type = this.selectedUtility();
    const start = this.startPeriod();
    const end = this.endPeriod();
    if (!start || !end) return [];

    const allData = this.historyService.getAllData();
    const periodsInRange = this.availablePeriodsList().filter(p => p >= start && p <= end);

    const rawList = periodsInRange.map(period => {
      const key = `${type}_${period}`;
      const bill = allData[key];

      if (!bill) {
        return {
          key: period,
          monthLabel: this.formatMonthLabel(period),
          consumption: 0,
          cost: 0,
          unitPrice: 0,
          totalBill: 0,
          pctBill: 0,
          hasData: false
        };
      }

      // 1. Month total bill
      const totalBill = (bill.costItems || []).reduce((acc: number, item: any) => acc + (item.value || 0), 0);
      
      // 2. Month total consumption input by technicans/admin
      let totalConsumption = 0;
      if (type === 'luz') {
         const c = bill.consumptionInput || {};
         totalConsumption = (c.bss1||0) + (c.bss2||0) + (c.bss3||0) + (c.bss4||0);
      } else {
         totalConsumption = Number(bill.consumptionInput) || 0;
      }

      // 3. System-wide unit price
      const unitPrice = totalConsumption > 0 ? totalBill / totalConsumption : 0;

      // 4. Store specific consumption
      let storeConsumption = 0;
      if (bill.readings && bill.readings[store.id]) {
        const r: any = bill.readings[store.id];
        if (typeof r === 'object') {
          storeConsumption = r.calculatedConsumption ?? r.consumption ?? 0;
        } else if (typeof r === 'number') {
          storeConsumption = r;
        }
      }

      const storeCost = storeConsumption * unitPrice;
      const pctBill = totalBill > 0 ? (storeCost / totalBill) * 100 : 0;

      return {
        key: period,
        monthLabel: this.formatMonthLabel(period),
        consumption: storeConsumption,
        cost: storeCost,
        unitPrice,
        totalBill,
        pctBill,
        hasData: true,
        photo: this.reportPhotos()[period] || null
      };
    }).filter(d => d.hasData && d.consumption > 0);

    if (rawList.length === 0) return [];

    // Calculate store's average consumption in this historical window
    const totalCons = rawList.reduce((acc, d) => acc + d.consumption, 0);
    const storeAvg = totalCons / rawList.length;

    // Enrich with comparative MoM and variance vs average
    return rawList.map((item, idx) => {
      const diffFromAvgPct = storeAvg > 0 ? ((item.consumption - storeAvg) / storeAvg) * 100 : 0;
      
      let momDiffPct: number | null = null;
      if (idx > 0 && rawList[idx - 1].consumption > 0) {
        momDiffPct = ((item.consumption - rawList[idx - 1].consumption) / rawList[idx - 1].consumption) * 100;
      }

      let alertLevel: 'critical' | 'warning' | 'drop' | 'normal' = 'normal';
      if (diffFromAvgPct >= 40 || (momDiffPct !== null && momDiffPct >= 50)) {
        alertLevel = 'critical';
      } else if (diffFromAvgPct >= 20 || (momDiffPct !== null && momDiffPct >= 30)) {
        alertLevel = 'warning';
      } else if (diffFromAvgPct <= -35 || (momDiffPct !== null && momDiffPct <= -40)) {
        alertLevel = 'drop';
      }

      return {
        ...item,
        diffFromAvgPct,
        momDiffPct,
        alertLevel
      };
    });
  });

  // Calculate aggregated metrics
  metrics = computed(() => {
    const data = this.chartData();
    const totalConsumption = data.reduce((acc, d) => acc + d.consumption, 0);
    const totalCost = data.reduce((acc, d) => acc + d.cost, 0);
    const monthsCount = data.length || 1;

    return {
      totalConsumption,
      totalCost,
      avgConsumption: totalConsumption / monthsCount,
      avgCost: totalCost / monthsCount
    };
  });

  // Store Diagnostic computed specifically for the latest recorded period and historical baseline
  storeDiagnostic = computed(() => {
    const data = this.chartData();
    if (data.length === 0) return null;

    const latest = data[data.length - 1];
    const prev = data.length >= 2 ? data[data.length - 2] : null;
    const avg = this.metrics().avgConsumption;
    const utility = this.selectedUtility();

    const diffAvgPct = avg > 0 ? ((latest.consumption - avg) / avg) * 100 : 0;
    const momDiffPct = prev && prev.consumption > 0 ? ((latest.consumption - prev.consumption) / prev.consumption) * 100 : null;

    const hasAlert = latest.alertLevel !== 'normal';
    const severity = latest.alertLevel;

    let badgeTitle = 'Consumo Estável';
    let title = 'Consumo em Conformidade com o Histórico';
    let recommendation = 'Operação em conformidade com o perfil histórico do lojista no shopping.';

    if (severity === 'critical') {
      badgeTitle = 'Alerta Crítico: Sobrecarga';
      title = `Consumo Crítico: ${diffAvgPct > 0 ? '+' : ''}${diffAvgPct.toFixed(1)}% acima da média histórica`;
      if (utility === 'agua') {
        recommendation = 'Forte indício de vazamento contínuo em caixas acopladas, descargas Hydra desreguladas, torneiras abertas no período noturno ou tubulação rompida. Solicitar inspeção hidráulica urgente.';
      } else if (utility === 'luz') {
        recommendation = 'Salto atípico de energia: verificar se compressores/ar condicionado ficaram ligados ininterruptamente, termostatos descalibrados de câmaras frias ou acréscimo de máquinas elétricas sem aviso.';
      } else {
        recommendation = 'Pico perigoso de consumo de gás: vistoriar imediatamente tubulações de abastecimento, reguladores de pressão, chamas-piloto e equipamentos de cocção de alta potência.';
      }
    } else if (severity === 'warning') {
      badgeTitle = 'Atenção: Consumo Elevado';
      title = `Consumo Elevado: ${diffAvgPct > 0 ? '+' : ''}${diffAvgPct.toFixed(1)}% acima da média`;
      if (utility === 'agua') {
        recommendation = 'Aumento relevante de consumo hídrico: conferir possíveis pequenos vazamentos internos ou alteração de rotina de limpeza do lojista.';
      } else if (utility === 'luz') {
        recommendation = 'Consumo elétrico acima do habitual: checar horários de pico, vedação de refrigeradores e iluminação mantida ligada fora do expediente.';
      } else {
        recommendation = 'Aumento de gás acima do padrão: verificar se houve pico sazonal de clientes ou vazamento em válvulas de fechamento.';
      }
    } else if (severity === 'drop') {
      badgeTitle = 'Alerta: Queda Atípica';
      title = `Queda Expressiva: ${diffAvgPct.toFixed(1)}% em relação à média`;
      recommendation = 'Queda anômala de consumo: verificar com a equipe técnica se o medidor/hidrômetro parou de girar (travamento mecânico) ou se o lojista esteve fechado para reforma ou inventário.';
    }

    return {
      hasAlert,
      severity,
      badgeTitle,
      title,
      recommendation,
      latestMonthLabel: latest.monthLabel,
      prevMonthLabel: prev ? prev.monthLabel : '',
      latestConsumption: latest.consumption,
      avgConsumption: avg,
      diffAvgPct,
      momDiffPct
    };
  });

  constructor() {
    // Select first store when listed
    effect(() => {
      const list = this.storeService.stores();
      if (list.length > 0 && !this.selectedStoreId()) {
         untracked(() => {
           // Prefer an active store first
           const firstActive = list.find(s => s.active !== false);
           this.selectedStoreId.set(firstActive ? firstActive.id : list[0].id);
         });
      }
    });

    // Preset period choices
    effect(() => {
      const periods = this.availablePeriodsList();
      if (periods.length > 0) {
        untracked(() => {
          if (!this.startPeriod()) {
             // 6 months ago or the first one
             const initialIdx = Math.max(0, periods.length - 6);
             this.startPeriod.set(periods[initialIdx]);
          }
          if (!this.endPeriod()) {
             this.endPeriod.set(periods[periods.length - 1]);
          }
        });
      }
    });

    // Reactive photo evidence loader for active store & utility from IndexedDB
    effect(() => {
      const storeId = this.selectedStoreId();
      const util = this.selectedUtility();
      if (storeId) {
        this.loadStorePhotos(util, storeId);
      } else {
        this.reportPhotos.set({});
      }
    });

    afterNextRender(() => {
      this.viewReady.set(true);

      // Handle window resize dynamically to refresh D3 containers nicely
      window.addEventListener('resize', this.onResize);
    });

    // Watch values to redraw charts in untracked timer
    effect(() => {
      const ready = this.viewReady();
      if (!ready) return;

      // Track dependencies
      this.selectedStoreId();
      this.selectedUtility();
      this.startPeriod();
      this.endPeriod();
      this.chartData();

      untracked(() => {
        setTimeout(() => {
          this.renderConsumptionChart();
          this.renderCostChart();
        }, 50);
      });
    });
  }

  onResize = () => {
    if (this.viewReady()) {
      this.renderConsumptionChart();
      this.renderCostChart();
    }
  };

  // --- PHOTO EVIDENCE HELPERS (IndexedDB) ---
  async loadStorePhotos(type: string, storeId: string) {
    try {
      const photos = await this.indexedDb.getMeterPhotosForStore(type, storeId);
      this.reportPhotos.set(photos);
    } catch (err) {
      console.warn('Erro ao carregar fotos do IndexedDB no relatório:', err);
      this.reportPhotos.set({});
    }
  }

  openPhotoViewer(photo: MeterPhotoRecord) {
    this.activeReportPhoto.set(photo);
    this.showPhotoModal.set(true);
  }

  closePhotoViewer() {
    this.showPhotoModal.set(false);
    this.activeReportPhoto.set(null);
  }

  downloadActivePhoto() {
    const photo = this.activeReportPhoto();
    if (!photo || typeof document === 'undefined') return;
    const a = document.createElement('a');
    a.href = photo.photoDataUrl;
    a.download = `Comprovante_Medidor_${photo.type.toUpperCase()}_${photo.month}_${photo.luc}.jpg`;
    a.click();
  }

  // Filter actions
  setStatusFilter(filter: StatusFilter) {
    this.statusFilter.set(filter);
    
    // If the currently selected store is not in the newly filtered list, optionally select the first one
    const currentList = this.filteredStores();
    if (currentList.length > 0 && !currentList.some(s => s.id === this.selectedStoreId())) {
      this.selectedStoreId.set(currentList[0].id);
    }
  }

  onSearchInput(event: Event) {
    const val = (event.target as HTMLInputElement).value;
    this.searchQuery.set(val);
    this.isDropdownOpen.set(true);
  }

  clearSearch() {
    this.searchQuery.set('');
  }

  toggleDropdown() {
    this.isDropdownOpen.update(v => !v);
  }

  selectStore(id: string) {
    this.selectedStoreId.set(id);
    this.isDropdownOpen.set(false);
  }

  selectPreviousStore() {
    const list = this.filteredStores();
    const idx = this.currentStoreIndex();
    if (idx > 0) {
      this.selectedStoreId.set(list[idx - 1].id);
    }
  }

  selectNextStore() {
    const list = this.filteredStores();
    const idx = this.currentStoreIndex();
    if (idx >= 0 && idx < list.length - 1) {
      this.selectedStoreId.set(list[idx + 1].id);
    }
  }

  toggleOnlyWithUtility() {
    this.onlyWithUtility.update(v => !v);
    const list = this.filteredStores();
    if (list.length > 0 && !list.some(s => s.id === this.selectedStoreId())) {
      this.selectedStoreId.set(list[0].id);
    }
  }

  setUtility(type: UtilityType) {
    this.selectedUtility.set(type);
    if (this.onlyWithUtility() || this.statusFilter() === 'alert') {
      const list = this.filteredStores();
      if (list.length > 0 && !list.some(s => s.id === this.selectedStoreId())) {
        this.selectedStoreId.set(list[0].id);
      }
    }
  }

  setStartPeriod(period: string) {
    this.startPeriod.set(period);
    // If end period is before new start period, push it forward
    if (this.endPeriod() < period) {
       this.endPeriod.set(period);
    }
  }

  setEndPeriod(period: string) {
    this.endPeriod.set(period);
  }

  doesStoreUseUtility(): boolean {
    const store = this.selectedStore();
    if (!store) return false;
    const type = this.selectedUtility();
    if (type === 'luz') return store.usesLuz;
    if (type === 'agua') return store.usesAgua;
    if (type === 'gas') return store.usesGas;
    return false;
  }

  getUtilityLabel(): string {
    const type = this.selectedUtility();
    return type === 'luz' ? 'Energia/Luz' : type === 'agua' ? 'Água' : 'Gás';
  }

  getUnit(): string {
     return this.selectedUtility() === 'luz' ? 'kWh' : 'm³';
  }

  getUtilityColorBg() {
    switch(this.selectedUtility()) {
      case 'luz': return 'bg-amber-500';
      case 'agua': return 'bg-blue-500';
      case 'gas': return 'bg-red-500';
    }
  }

  getUtilityColorText() {
    switch(this.selectedUtility()) {
      case 'luz': return 'text-amber-600';
      case 'agua': return 'text-blue-600';
      case 'gas': return 'text-red-600';
    }
  }

  formatMonthLabel(yyyy_mm: string): string {
    const parts = yyyy_mm.split('-');
    if (parts.length !== 2) return yyyy_mm;
    const [year, month] = parts;
    const monthNames = [
      'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
      'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
    ];
    const monthIdx = parseInt(month, 10) - 1;
    return `${monthNames[monthIdx]} / ${year}`;
  }

  // --- EXPORT FUNCTIONALITIES (EXCEL & PDF) ---

  exportExcel() {
    const store = this.selectedStore();
    if (!store) return;

    this.isExportingExcel.set(true);
    try {
      this.exportService.exportToExcel(
        store,
        this.getUtilityLabel(),
        this.getUnit(),
        this.startPeriod(),
        this.endPeriod(),
        this.chartData(),
        this.metrics(),
        this.storeDiagnostic()
      );
    } catch (err) {
      console.error('Erro ao exportar Excel:', err);
    } finally {
      this.isExportingExcel.set(false);
    }
  }

  async exportPdf() {
    const store = this.selectedStore();
    if (!store) return;

    this.isExportingPdf.set(true);
    try {
      const consumptionSvg = this.consumptionChartRef?.nativeElement?.querySelector('svg') as SVGElement | undefined;
      const costSvg = this.costChartRef?.nativeElement?.querySelector('svg') as SVGElement | undefined;

      await this.exportService.exportToPdf(
        store,
        this.getUtilityLabel(),
        this.getUnit(),
        this.startPeriod(),
        this.endPeriod(),
        this.chartData(),
        this.metrics(),
        this.storeDiagnostic(),
        consumptionSvg,
        costSvg
      );
    } catch (err) {
      console.error('Erro ao exportar PDF:', err);
    } finally {
      this.isExportingPdf.set(false);
    }
  }

  // --- D3 CHART DRAW RANGE COM LINHA DE MÉDIA E PONTOS DE ALERTA ---

  renderConsumptionChart() {
    if (!this.consumptionChartRef) return;
    const element = this.consumptionChartRef.nativeElement;
    d3.select(element).selectAll('*').remove();

    const data = this.chartData();
    if (data.length === 0) return;

    const margin = { top: 30, right: 30, bottom: 40, left: 55 };
    const width = element.clientWidth - margin.left - margin.right;
    const height = element.clientHeight - margin.top - margin.bottom;

    if (width <= 0 || height <= 0) return;

    const svg = d3.select(element)
      .append('svg')
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // X axis
    const x = d3.scalePoint()
      .range([0, width])
      .domain(data.map(d => d.monthLabel))
      .padding(0.4);

    svg.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x))
      .selectAll('text')
      .style('opacity', 0.6)
      .style('font-size', '10px')
      .style('font-weight', 'medium');

    // Y Axis
    const maxVal = d3.max(data, d => d.consumption) as number || 100;
    const y = d3.scaleLinear()
      .domain([0, maxVal * 1.2])
      .range([height, 0]);

    svg.append('g')
      .call(d3.axisLeft(y).ticks(5).tickFormat(d => `${d}`))
      .selectAll('text')
      .style('opacity', 0.6)
      .style('font-size', '10px');

    // Horizontal grids
    svg.append('g')
      .attr('class', 'grid')
      .attr('opacity', 0.08)
      .call(d3.axisLeft(y).tickSize(-width).tickFormat(() => ''));

    // Historical Average Reference Line
    const avg = this.metrics().avgConsumption;
    if (avg > 0 && avg < maxVal * 1.2) {
      const avgY = y(avg);
      svg.append('line')
        .attr('x1', 0)
        .attr('x2', width)
        .attr('y1', avgY)
        .attr('y2', avgY)
        .attr('stroke', '#64748b')
        .attr('stroke-dasharray', '5,4')
        .attr('stroke-width', 1.5)
        .attr('opacity', 0.7);

      svg.append('text')
        .attr('x', width)
        .attr('y', avgY - 6)
        .attr('text-anchor', 'end')
        .text(`Média: ${avg.toFixed(1)} ${this.getUnit()}`)
        .style('font-size', '10px')
        .style('font-weight', 'bold')
        .style('fill', '#64748b');
    }

    // Curve Path (Area representing consumption)
    const area = d3.area<MonthlyChartItem>()
      .x(d => x(d.monthLabel)!)
      .y0(height)
      .y1(d => y(d.consumption))
      .curve(d3.curveMonotoneX);

    // Color code based on utility selection
    let gradientStart = '#f59e0b'; // warning
    let gradientStop = '#ffffff';

    if (this.selectedUtility() === 'agua') {
      gradientStart = '#3b82f6';
    } else if (this.selectedUtility() === 'gas') {
      gradientStart = '#ef4444';
    }

    // Gradient creator
    const defs = svg.append('defs');
    const linearGradient = defs.append('linearGradient')
      .attr('id', 'consumption-grad')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '0%')
      .attr('y2', '100%');

    linearGradient.append('stop')
      .attr('offset', '0%')
      .attr('stop-color', gradientStart)
      .attr('stop-opacity', 0.45);

    linearGradient.append('stop')
      .attr('offset', '100%')
      .attr('stop-color', gradientStop)
      .attr('stop-opacity', 0.0);

    // Render Area
    svg.append('path')
      .datum(data)
      .attr('fill', 'url(#consumption-grad)')
      .attr('d', area);

    // Redraw the line over the area
    const line = d3.line<MonthlyChartItem>()
      .x(d => x(d.monthLabel)!)
      .y(d => y(d.consumption))
      .curve(d3.curveMonotoneX);

    svg.append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', gradientStart)
      .attr('stroke-width', 2.5)
      .attr('d', line);

    // Outer Warning/Alert Rings for anomalous data points
    svg.selectAll('.alertRing')
      .data(data.filter(d => d.alertLevel === 'critical' || d.alertLevel === 'warning'))
      .enter()
      .append('circle')
      .attr('cx', d => x(d.monthLabel)!)
      .attr('cy', d => y(d.consumption)!)
      .attr('r', 9)
      .attr('fill', 'none')
      .attr('stroke', d => d.alertLevel === 'critical' ? '#e11d48' : '#f59e0b')
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '3,2')
      .attr('opacity', 0.85);

    const self = this;

    // Circle Dots on data points with alert highlights
    svg.selectAll('.dataPoint')
      .data(data)
      .enter()
      .append('circle')
      .attr('cx', d => x(d.monthLabel)!)
      .attr('cy', d => y(d.consumption)!)
      .attr('r', d => d.alertLevel === 'critical' ? 6 : 4.5)
      .attr('fill', d => d.alertLevel === 'critical' ? '#e11d48' : d.alertLevel === 'warning' ? '#f59e0b' : '#ffffff')
      .attr('stroke', d => d.alertLevel === 'critical' ? '#9f1239' : gradientStart)
      .attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .on('mouseover', function(e, d) {
         d3.select(this).attr('r', 7.5);
         
         const tipText = `${d.consumption.toFixed(1)} ${self.getUnit()} (${d.diffFromAvgPct >= 0 ? '+' : ''}${d.diffFromAvgPct.toFixed(0)}% vs média)`;
         svg.append('text')
           .attr('id', `ctooltip-${d.key}`)
           .attr('x', x(d.monthLabel)!)
           .attr('y', y(d.consumption) - 14)
           .attr('text-anchor', 'middle')
           .text(tipText)
           .style('font-size', '11px')
           .style('font-weight', 'bold')
           .style('fill', d.alertLevel === 'critical' ? '#e11d48' : '#334155');
      })
      .on('mouseout', function(e, d) {
         d3.select(this).attr('r', d.alertLevel === 'critical' ? 6 : 4.5);
         d3.select(`#ctooltip-${d.key}`).remove();
      });

    // Top value text on vertices
    if (data.length <= 12) {
      svg.selectAll('.text-value')
        .data(data)
        .enter()
        .append('text')
        .attr('x', d => x(d.monthLabel)!)
        .attr('y', d => y(d.consumption) - 9)
        .attr('text-anchor', 'middle')
        .text(d => `${Math.round(d.consumption)}`)
        .style('font-size', '9px')
        .style('font-weight', 'bold')
        .style('fill', d => d.alertLevel === 'critical' ? '#e11d48' : '#64748b');
    }
  }

  renderCostChart() {
    if (!this.costChartRef) return;
    const element = this.costChartRef.nativeElement;
    d3.select(element).selectAll('*').remove();

    const data = this.chartData();
    if (data.length === 0) return;

    const margin = { top: 30, right: 30, bottom: 40, left: 60 };
    const width = element.clientWidth - margin.left - margin.right;
    const height = element.clientHeight - margin.top - margin.bottom;

    if (width <= 0 || height <= 0) return;

    const svg = d3.select(element)
      .append('svg')
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // X Axis
    const x = d3.scaleBand()
      .range([0, width])
      .domain(data.map(d => d.monthLabel))
      .padding(0.35);

    svg.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x))
      .selectAll('text')
      .style('opacity', 0.6)
      .style('font-size', '10px');

    // Y Axis
    const maxVal = d3.max(data, d => d.cost) as number || 1000;
    const y = d3.scaleLinear()
      .domain([0, maxVal * 1.15])
      .range([height, 0]);

    svg.append('g')
      .call(d3.axisLeft(y).ticks(5).tickFormat(d => `R$${d}`))
      .selectAll('text')
      .style('opacity', 0.6)
      .style('font-size', '10px');

    // Horizontal Grid
    svg.append('g')
      .attr('class', 'grid')
      .attr('opacity', 0.08)
      .call(d3.axisLeft(y).tickSize(-width).tickFormat(() => ''));

    // Draw Bar chart with pleasant rounded bars
    svg.selectAll('mybar')
      .data(data)
      .enter()
      .append('rect')
      .attr('x', d => x(d.monthLabel)!)
      .attr('y', d => y(d.cost))
      .attr('width', x.bandwidth())
      .attr('height', d => height - y(d.cost))
      .attr('fill', '#10b981')
      .attr('rx', 4)
      .attr('opacity', 0.8)
      .on('mouseover', function() {
         d3.select(this)
           .transition()
           .duration(150)
           .attr('opacity', 1.0);
      })
      .on('mouseout', function() {
         d3.select(this)
           .transition()
           .duration(150)
           .attr('opacity', 0.8);
      });

    // Top values text
    svg.selectAll('.text-cost-val')
      .data(data)
      .enter()
      .append('text')
      .attr('x', d => x(d.monthLabel)! + x.bandwidth() / 2)
      .attr('y', d => y(d.cost) - 8)
      .attr('text-anchor', 'middle')
      .text(d => `R$${Math.round(d.cost)}`)
      .style('font-size', '9px')
      .style('font-weight', 'bold')
      .style('fill', '#475569');
  }
}
