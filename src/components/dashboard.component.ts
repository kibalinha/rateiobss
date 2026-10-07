import { Component, ElementRef, ViewChild, afterNextRender, inject, signal, effect, computed, untracked } from '@angular/core';
import { CommonModule, CurrencyPipe, DecimalPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as d3 from 'd3';
import { StoreService } from '../services/store.service';
import { HistoryService, BillData } from '../services/history.service';

type UtilityType = 'luz' | 'agua' | 'gas';
type ViewMode = 'annual' | 'monthly';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, CurrencyPipe, DecimalPipe, DatePipe],
  template: `
    <div class="space-y-6 animate-fade-in">
      
      <!-- Controls Header -->
      <div class="flex flex-col xl:flex-row justify-between items-start xl:items-center bg-white dark:bg-slate-900 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 gap-4 transition-colors">
        
        <!-- Utility Tabs -->
        <div class="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg w-full xl:w-auto overflow-x-auto border border-slate-200 dark:border-slate-700">
          <button (click)="setUtility('luz')" 
            [class]="selectedUtility() === 'luz' ? 'bg-white dark:bg-slate-900 text-warning shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'"
            class="flex-1 xl:flex-none px-6 py-2 rounded-md text-sm font-bold transition-all flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer">
            <span>⚡</span> Luz
          </button>
          <button (click)="setUtility('agua')" 
            [class]="selectedUtility() === 'agua' ? 'bg-white dark:bg-slate-900 text-accent shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'"
            class="flex-1 xl:flex-none px-6 py-2 rounded-md text-sm font-bold transition-all flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer">
            <span>💧</span> Água
          </button>
          <button (click)="setUtility('gas')" 
            [class]="selectedUtility() === 'gas' ? 'bg-white dark:bg-slate-900 text-danger shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'"
            class="flex-1 xl:flex-none px-6 py-2 rounded-md text-sm font-bold transition-all flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer">
            <span>🔥</span> Gás
          </button>
        </div>

        <div class="flex flex-col sm:flex-row gap-4 w-full xl:w-auto">
          <!-- View Switcher -->
          <div class="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700">
             <button (click)="viewMode.set('annual')" 
                [class]="viewMode() === 'annual' ? 'bg-white dark:bg-slate-900 text-slate-800 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400'"
                class="px-4 py-2 rounded-md text-xs font-bold transition-all cursor-pointer">
                Anual
             </button>
             <button (click)="viewMode.set('monthly')" 
                [class]="viewMode() === 'monthly' ? 'bg-white dark:bg-slate-900 text-slate-800 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400'"
                class="px-4 py-2 rounded-md text-xs font-bold transition-all cursor-pointer">
                Mensal
             </button>
          </div>

          <!-- Time Selectors -->
          <div class="flex gap-2">
            @if (viewMode() === 'monthly') {
               <select [ngModel]="selectedMonthIndex()" (ngModelChange)="selectedMonthIndex.set(+$event)"
                  class="bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm rounded-lg focus:ring-slate-500 focus:border-slate-500 p-2 font-bold">
                  @for (m of monthsList; track $index) {
                     <option [value]="$index">{{ m }}</option>
                  }
               </select>
            }

            <select [ngModel]="selectedYear()" (ngModelChange)="selectedYear.set(+$event)" 
              class="bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm rounded-lg focus:ring-slate-500 focus:border-slate-500 p-2 font-bold min-w-[80px]">
              @for (year of availableYears(); track year) {
                <option [value]="year">{{ year }}</option>
              } @empty {
                 <option [value]="currentYear">{{ currentYear }}</option>
              }
            </select>
          </div>
        </div>
      </div>

      <!-- ANNUAL VIEW -->
      @if (viewMode() === 'annual') {
        <div class="grid grid-cols-1 md:grid-cols-4 gap-6 animate-fade-in">
          <!-- Total Cost Card -->
          <div class="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 relative overflow-hidden transition-colors">
            <div class="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Custo Total ({{ selectedYear() }})</div>
            <div class="text-3xl font-extrabold text-slate-800 dark:text-white tracking-tight">
              {{ annualMetrics().totalCost | currency:'BRL':'symbol':'1.0-0' }}
            </div>
            <div class="text-xs text-slate-400 mt-2">Acumulado Jan-Dez</div>
          </div>

          <!-- Consumption Card -->
          <div class="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 transition-colors">
             <div class="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Consumo Total</div>
             <div class="text-3xl font-extrabold" [class]="getUtilityColorText()">
               {{ annualMetrics().totalConsumption | number:'1.0-0' }} <span class="text-sm font-medium text-slate-400">{{ getUnit() }}</span>
             </div>
             <div class="text-xs text-slate-400 mt-2">Média: {{ annualMetrics().avgConsumption | number:'1.0-0' }} / mês</div>
          </div>

          <!-- Average Cost Card -->
          <div class="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 transition-colors">
             <div class="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Custo Médio Mensal</div>
             <div class="text-3xl font-extrabold text-slate-700 dark:text-slate-200">
               {{ annualMetrics().avgCost | currency:'BRL':'symbol':'1.0-0' }}
             </div>
             <div class="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 mt-4">
                <div class="h-1.5 rounded-full" [class]="getUtilityColorBg()" style="width: 65%"></div>
             </div>
          </div>

          <!-- Peak Month -->
          <div class="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 transition-colors">
             <div class="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Mês de Maior Gasto</div>
             <div class="text-2xl font-extrabold text-slate-800 dark:text-white">
               {{ annualMetrics().peakMonth }}
             </div>
             <div class="text-sm font-bold text-red-500 mt-1">
               {{ annualMetrics().peakCost | currency:'BRL' }}
             </div>
          </div>
        </div>

        <!-- Charts Area -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
          <!-- Evolution Chart -->
          <div class="lg:col-span-2 bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 transition-colors">
            <h3 class="text-lg font-bold text-slate-800 dark:text-white mb-6 flex items-center gap-2">
              <span class="w-2 h-6 rounded" [class]="getUtilityColorBg()"></span>
              Evolução Mensal de Custos
            </h3>
            <div class="relative w-full h-80 bg-slate-50 dark:bg-slate-950 rounded border border-slate-100 dark:border-slate-800 flex items-center justify-center overflow-hidden">
               @if (annualMetrics().totalCost === 0) {
                 <div class="text-slate-400 text-sm">Sem dados registrados para {{ selectedYear() }}</div>
               }
               <div #barChartContainer class="w-full h-full"></div>
            </div>
          </div>

          <!-- Top Stores Annual -->
          <div class="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col transition-colors">
            <h3 class="text-lg font-bold text-slate-800 dark:text-white mb-4">Ranking Anual (Estimado)</h3>
            <div class="flex-1 overflow-y-auto space-y-4 custom-scrollbar pr-2">
               @for (store of topStoresAnnual(); track store.name) {
                 <div class="relative">
                   <div class="flex justify-between items-end mb-1 text-sm">
                     <span class="font-bold text-slate-700 dark:text-slate-300 truncate w-32" [title]="store.name">{{ store.name }}</span>
                     <span class="font-mono font-bold text-slate-900 dark:text-white">{{ store.totalCost | currency:'BRL':'symbol':'1.0-0' }}</span>
                   </div>
                   <div class="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2">
                     <div class="h-2 rounded-full transition-all duration-500" 
                          [class]="getUtilityColorBg()"
                          [style.width.%]="(store.totalCost / maxStoreCostAnnual()) * 100"></div>
                   </div>
                 </div>
               } @empty {
                  <div class="text-center text-slate-400 py-10 italic text-sm">
                    Dados insuficientes para ranking.
                  </div>
               }
            </div>
          </div>
        </div>
      }

      <!-- MONTHLY VIEW -->
      @if (viewMode() === 'monthly') {
         <div class="animate-fade-in space-y-6">
            
            <!-- Monthly Header Stats -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
               <div class="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 border-l-4 transition-colors" [class.border-l-warning]="selectedUtility() === 'luz'" [class.border-l-accent]="selectedUtility() === 'agua'" [class.border-l-danger]="selectedUtility() === 'gas'">
                  <div class="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Fatura Total</div>
                  <div class="text-3xl font-extrabold text-slate-800 dark:text-white">
                     {{ monthlyMetrics().totalBill | currency:'BRL' }}
                  </div>
                  <div class="mt-2 text-xs flex gap-2">
                     <span class="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-slate-600 dark:text-slate-300 font-mono">
                        {{ monthlyMetrics().totalConsumption | number:'1.0-4' }} {{ getUnit() }}
                     </span>
                     <span class="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-slate-600 dark:text-slate-300 font-mono">
                        {{ monthlyMetrics().unitPrice | currency:'BRL':'symbol':'1.4-4' }}/{{ getUnit() }}
                     </span>
                  </div>
               </div>
               
               <div class="md:col-span-2 bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 transition-colors">
                  <h3 class="text-sm font-bold text-slate-700 dark:text-slate-200 mb-4">Distribuição do Custo</h3>
                  <div class="grid grid-cols-3 gap-4 text-center divide-x divide-slate-100 dark:divide-slate-800">
                     <div>
                        <div class="text-xs text-slate-500 dark:text-slate-400 uppercase">Lojistas</div>
                        <div class="text-xl font-bold text-slate-800 dark:text-white">{{ monthlyMetrics().tenantsCost | currency:'BRL' }}</div>
                        <div class="text-xs text-slate-400">{{ (monthlyMetrics().tenantsCost / monthlyMetrics().totalBill * 100) || 0 | number:'1.1-1' }}%</div>
                     </div>
                     <div>
                        <div class="text-xs text-slate-500 dark:text-slate-400 uppercase">Áreas Comuns</div>
                        <div class="text-xl font-bold text-slate-800 dark:text-white">{{ monthlyMetrics().commonAreaCost | currency:'BRL' }}</div>
                        <div class="text-xs text-slate-400">{{ (monthlyMetrics().commonAreaCost / monthlyMetrics().totalBill * 100) || 0 | number:'1.1-1' }}%</div>
                     </div>
                     <div>
                        <div class="text-xs text-slate-500 dark:text-slate-400 uppercase">Ar Cond.</div>
                        <div class="text-xl font-bold text-slate-800 dark:text-white">{{ monthlyMetrics().acCost | currency:'BRL' }}</div>
                        <div class="text-xs text-slate-400">{{ (monthlyMetrics().acCost / monthlyMetrics().totalBill * 100) || 0 | number:'1.1-1' }}%</div>
                     </div>
                  </div>
               </div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
               <!-- Pie Chart -->
               <div class="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 transition-colors">
                  <h3 class="text-lg font-bold text-slate-800 dark:text-white mb-6 text-center">Gráfico de Distribuição</h3>
                  <div class="relative w-full h-64 flex items-center justify-center">
                     @if (monthlyMetrics().totalBill === 0) {
                        <div class="text-slate-400 text-sm">Sem dados para este mês</div>
                     }
                     <div #pieChartContainer class="w-full h-full flex justify-center"></div>
                  </div>
                  <div class="flex justify-center gap-4 mt-4 text-xs font-medium text-slate-600 dark:text-slate-300">
                     <div class="flex items-center gap-1"><span class="w-3 h-3 rounded-full bg-emerald-500"></span> Lojistas</div>
                     <div class="flex items-center gap-1"><span class="w-3 h-3 rounded-full bg-slate-400"></span> Comum</div>
                     <div class="flex items-center gap-1"><span class="w-3 h-3 rounded-full bg-blue-400"></span> AC</div>
                  </div>
               </div>

               <!-- Detailed Store List for Month -->
               <div class="lg:col-span-2 bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col transition-colors">
                   <div class="flex justify-between items-center mb-4">
                      <h3 class="text-lg font-bold text-slate-800 dark:text-white">Detalhamento Lojistas ({{ monthsList[selectedMonthIndex()] }})</h3>
                   </div>
                   
                   <div class="overflow-x-auto">
                      <table class="w-full text-left text-sm border-collapse">
                         <thead class="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800">
                            <tr>
                               <th class="p-3 w-16">Rank</th>
                               <th class="p-3">Loja</th>
                               <th class="p-3 text-right">Consumo</th>
                               <th class="p-3 text-right">Custo</th>
                               <th class="p-3 text-right">% Total</th>
                            </tr>
                         </thead>
                         <tbody class="divide-y divide-slate-100 dark:divide-slate-850">
                            @for (store of monthlyTopStores(); track store.name; let i = $index) {
                               <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                  <td class="p-3 font-mono text-slate-400 text-xs">#{{ i + 1 }}</td>
                                  <td class="p-3 font-medium text-slate-800 dark:text-slate-200">{{ store.name }}</td>
                                  <td class="p-3 text-right font-mono text-slate-600 dark:text-slate-300">{{ store.consumption | number:'1.0-0' }}</td>
                                  <td class="p-3 text-right font-bold text-slate-800 dark:text-slate-100">{{ store.cost | currency:'BRL' }}</td>
                                  <td class="p-3 text-right">
                                     <div class="flex items-center justify-end gap-2">
                                        <span class="text-xs text-slate-500 dark:text-slate-400">{{ (store.cost / monthlyMetrics().totalBill * 100) | number:'1.1-1' }}%</span>
                                        <div class="w-16 bg-slate-100 dark:bg-slate-800 rounded-full h-1.5">
                                           <div class="h-1.5 rounded-full bg-slate-400 dark:bg-slate-500" [style.width.%]="(store.cost / monthlyMetrics().totalBill * 100)"></div>
                                        </div>
                                     </div>
                                  </td>
                               </tr>
                            } @empty {
                               <tr><td colspan="5" class="p-8 text-center text-slate-400 dark:text-slate-500 italic">Nenhum consumo registrado neste mês.</td></tr>
                            }
                         </tbody>
                      </table>
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
    .custom-scrollbar::-webkit-scrollbar { width: 4px; }
    .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
    .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 2px; }
  `]
})
export class DashboardComponent {
  storeService = inject(StoreService);
  historyService = inject(HistoryService);
  
  @ViewChild('barChartContainer') barChartRef!: ElementRef;
  @ViewChild('pieChartContainer') pieChartRef!: ElementRef;

  // State
  selectedUtility = signal<UtilityType>('luz');
  viewMode = signal<ViewMode>('annual');
  viewReady = signal(false); // Flag for DOM readiness
  
  currentYear = new Date().getFullYear();
  selectedYear = signal<number>(this.currentYear);
  selectedMonthIndex = signal<number>(new Date().getMonth()); // 0-11

  monthsList = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

  // --- 1. Available Years Detection ---
  availableYears = computed(() => {
    const allData = this.historyService.getAllData();
    const years = new Set<number>();
    
    // Default current year
    years.add(this.currentYear);

    // Scan all keys (e.g., "luz_2026-02")
    Object.keys(allData).forEach(key => {
       const parts = key.split('_'); // ['luz', '2026-02']
       if (parts.length === 2) {
          const datePart = parts[1]; // '2026-02'
          const year = parseInt(datePart.split('-')[0]);
          if (!isNaN(year)) {
             years.add(year);
          }
       }
    });

    return Array.from(years).sort((a, b) => b - a); // Descending
  });

  // --- 2. Data Processing ---

  // Raw Annual Data (for charts)
  annualData = computed(() => {
    const year = this.selectedYear();
    const type = this.selectedUtility();
    const allData = this.historyService.getAllData();
    
    return Array.from({ length: 12 }, (_, i) => {
      const monthStr = (i + 1).toString().padStart(2, '0');
      const key = `${type}_${year}-${monthStr}`;
      const bill = allData[key];

      if (!bill) {
        return { monthIndex: i, label: this.monthsList[i], cost: 0, consumption: 0, hasData: false };
      }

      // Re-calculate Total Bill from Cost Items
      const totalCost = (bill.costItems || []).reduce((acc: number, item: any) => acc + (item.value || 0), 0);
      
      let consumption = 0;
      if (type === 'luz') {
         const c = bill.consumptionInput || {};
         consumption = (c.bss1||0) + (c.bss2||0) + (c.bss3||0) + (c.bss4||0);
      } else {
         consumption = Number(bill.consumptionInput) || 0;
      }

      return { 
        monthIndex: i, 
        label: this.monthsList[i], 
        cost: totalCost, 
        consumption: consumption,
        hasData: true 
      };
    });
  });

  annualMetrics = computed(() => {
    const data = this.annualData();
    const totalCost = data.reduce((acc, m) => acc + m.cost, 0);
    const totalConsumption = data.reduce((acc, m) => acc + m.consumption, 0);
    const monthsWithData = data.filter(m => m.hasData).length || 1;
    
    const peak = data.reduce((prev, current) => (prev.cost > current.cost) ? prev : current, { label: '-', cost: 0 });

    return {
      totalCost,
      totalConsumption,
      avgCost: totalCost / monthsWithData,
      avgConsumption: totalConsumption / monthsWithData,
      peakMonth: peak.label,
      peakCost: peak.cost
    };
  });

  // Detailed Metrics for the Selected Month (Pie Chart & Table)
  monthlyMetrics = computed(() => {
    const year = this.selectedYear();
    const month = this.selectedMonthIndex() + 1;
    const monthStr = month.toString().padStart(2, '0');
    const type = this.selectedUtility();
    
    const key = `${type}_${year}-${monthStr}`;
    const bill = this.historyService.getBill(type, `${year}-${monthStr}`);
    
    if (!bill) {
       return { totalBill: 0, totalConsumption: 0, unitPrice: 0, tenantsCost: 0, commonAreaCost: 0, acCost: 0 };
    }

    // 1. Total Bill
    const totalBill = (bill.costItems || []).reduce((acc: number, item: any) => acc + (item.value || 0), 0);
    
    // 2. Total Input Consumption
    let totalConsumption = 0;
    if (type === 'luz') {
       const c = bill.consumptionInput || {};
       totalConsumption = (c.bss1||0) + (c.bss2||0) + (c.bss3||0) + (c.bss4||0);
    } else {
       totalConsumption = Number(bill.consumptionInput) || 0;
    }

    // 3. Unit Price
    const unitPrice = totalConsumption > 0 ? totalBill / totalConsumption : 0;

    // 4. AC Consumption
    const acConsumption = bill.acInput || 0;
    const acCost = acConsumption * unitPrice;

    // 5. Tenants Consumption (Estimate from Readings)
    let tenantsConsumption = 0;
    if (bill.readings) {
       Object.values(bill.readings).forEach((r: any) => {
           // Use calculatedConsumption if saved (BillCalculator updates this now)
           if (typeof r === 'object' && r.calculatedConsumption) {
               tenantsConsumption += r.calculatedConsumption;
           } else if (typeof r === 'object' && r.consumption) { 
               tenantsConsumption += r.consumption;
           }
       });
    }

    // Common Area = Total - Tenants - AC
    // Use Math.max(0, ...) to avoid negative if data is inconsistent
    const commonAreaConsumption = Math.max(0, totalConsumption - tenantsConsumption - acConsumption);
    
    const tenantsCost = tenantsConsumption * unitPrice;
    const commonAreaCost = commonAreaConsumption * unitPrice;

    return {
       totalBill,
       totalConsumption,
       unitPrice,
       tenantsCost,
       commonAreaCost,
       acCost
    };
  });

  // Helper to filter stores by utility flag
  getRelevantStores() {
    const all = this.storeService.stores();
    const type = this.selectedUtility();
    return all.filter(s => {
      if (type === 'luz') return s.usesLuz;
      if (type === 'agua') return s.usesAgua;
      if (type === 'gas') return s.usesGas;
      return false;
    });
  }

  monthlyTopStores = computed(() => {
     const data = this.monthlyMetrics();
     if (data.totalBill === 0) return [];
     
     const year = this.selectedYear();
     const monthStr = (this.selectedMonthIndex() + 1).toString().padStart(2, '0');
     const type = this.selectedUtility();
     const bill = this.historyService.getBill(type, `${year}-${monthStr}`);
     
     // Only consider relevant stores for this utility
     const stores = this.getRelevantStores();

     if (!bill || !bill.readings) return [];

     return stores.map(store => {
         const r: any = bill.readings[store.id];
         let cons = 0;
         if (r && typeof r === 'object' && r.calculatedConsumption) cons = r.calculatedConsumption;
         
         return {
            name: store.name,
            consumption: cons,
            cost: cons * data.unitPrice
         };
     })
     .filter(s => s.cost > 0)
     .sort((a, b) => b.cost - a.cost);
  });

  topStoresAnnual = computed(() => {
     // Aggregate all months
     const year = this.selectedYear();
     const type = this.selectedUtility();
     const allData = this.historyService.getAllData();
     const storeMap = new Map<string, number>(); // Name -> Cost

     // Only init active stores in map
     const relevantStores = this.getRelevantStores();
     relevantStores.forEach(s => storeMap.set(s.name, 0));

     for(let i=1; i<=12; i++) {
        const key = `${type}_${year}-${i.toString().padStart(2, '0')}`;
        const bill = allData[key];
        if (bill) {
           // Calculate unit price for that month
           const totalBill = (bill.costItems || []).reduce((acc:any, x:any) => acc + (x.value||0), 0);
           let totalCons = 0;
           if (type==='luz') {
              const c:any = bill.consumptionInput||{};
              totalCons = (c.bss1||0)+(c.bss2||0)+(c.bss3||0)+(c.bss4||0);
           } else {
              totalCons = Number(bill.consumptionInput)||0;
           }
           const price = totalCons > 0 ? totalBill/totalCons : 0;

           if (bill.readings) {
              relevantStores.forEach(s => {
                 const r:any = bill.readings[s.id];
                 let cons = 0;
                 if(r && typeof r === 'object' && r.calculatedConsumption) cons = r.calculatedConsumption;
                 
                 const current = storeMap.get(s.name) || 0;
                 storeMap.set(s.name, current + (cons * price));
              });
           }
        }
     }

     return Array.from(storeMap.entries())
        .map(([name, totalCost]) => ({ name, totalCost }))
        .filter(s => s.totalCost > 0)
        .sort((a,b) => b.totalCost - a.totalCost)
        .slice(0, 10);
  });

  maxStoreCostAnnual = computed(() => {
     const max = Math.max(...this.topStoresAnnual().map(s => s.totalCost));
     return max > 0 ? max : 1;
  });

  constructor() {
    afterNextRender(() => {
      this.viewReady.set(true);
    });

    // EFFECT registered in Injection Context (Constructor)
    effect(() => {
       const ready = this.viewReady();
       if (!ready) return;

       // Register signal dependencies
       const mode = this.viewMode();
       this.selectedYear();
       this.selectedMonthIndex();
       this.selectedUtility();
       this.annualData();
       this.monthlyMetrics();

       // Execute rendering logic without creating new signal dependencies
       untracked(() => {
          setTimeout(() => {
              if (mode === 'annual') this.renderBarChart();
              else this.renderPieChart();
          }, 0);
       });
    });
  }

  setUtility(type: UtilityType) {
    this.selectedUtility.set(type);
  }

  getUtilityColorBg() {
    switch(this.selectedUtility()) {
      case 'luz': return 'bg-warning';
      case 'agua': return 'bg-accent';
      case 'gas': return 'bg-danger';
    }
  }
  
  getUtilityColorText() {
    switch(this.selectedUtility()) {
      case 'luz': return 'text-warning';
      case 'agua': return 'text-accent';
      case 'gas': return 'text-danger';
    }
  }

  getUnit() {
     return this.selectedUtility() === 'luz' ? 'kWh' : 'm³';
  }

  // --- D3 CHART RENDERING ---
  
  renderBarChart() {
    if (!this.barChartRef) return;
    const data = this.annualData();
    const element = this.barChartRef.nativeElement;
    
    d3.select(element).selectAll('*').remove();

    const margin = { top: 20, right: 20, bottom: 30, left: 50 };
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
      .domain(data.map(d => d.label))
      .padding(0.3);

    svg.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x))
      .selectAll("text")
      .style("opacity", 0.6)
      .style("font-size", "10px");

    // Y Axis
    const maxVal = d3.max(data, (d:any) => d.cost) as number || 1000;
    const y = d3.scaleLinear()
      .domain([0, maxVal * 1.1])
      .range([height, 0]);

    svg.append('g')
      .call(d3.axisLeft(y).ticks(5).tickFormat((d: any) => `R$${d/1000}k`))
      .selectAll("text")
      .style("opacity", 0.6)
      .style("font-size", "10px");

    // Grid
    svg.append('g')
      .attr('class', 'grid')
      .attr('opacity', 0.1)
      .call(d3.axisLeft(y).tickSize(-width).tickFormat(() => ''));

    let barColor = '#f59e0b'; // Luz
    if (this.selectedUtility() === 'agua') barColor = '#3b82f6';
    if (this.selectedUtility() === 'gas') barColor = '#ef4444';

    svg.selectAll('mybar')
      .data(data)
      .enter()
      .append('rect')
      .attr('x', (d:any) => x(d.label)!)
      .attr('y', (d:any) => y(d.cost))
      .attr('width', x.bandwidth())
      .attr('height', (d:any) => height - y(d.cost))
      .attr('fill', barColor)
      .attr('rx', 4)
      .attr('opacity', 0.8)
      .on('mouseover', function() { d3.select(this).attr('opacity', 1); })
      .on('mouseout', function() { d3.select(this).attr('opacity', 0.8); });
      
    // Labels
    svg.selectAll('.text')
      .data(data)
      .enter()
      .append('text')
      .attr('x', (d: any) => x(d.label)! + x.bandwidth() / 2)
      .attr('y', (d: any) => y(d.cost) - 5)
      .attr('text-anchor', 'middle')
      .text((d: any) => d.cost > 0 ? (d.cost/1000).toFixed(1) + 'k' : '')
      .style("font-size", "10px")
      .style("fill", "#64748b");
  }

  renderPieChart() {
    if (!this.pieChartRef) return;
    const element = this.pieChartRef.nativeElement;
    d3.select(element).selectAll('*').remove();
    
    const m = this.monthlyMetrics();
    // Data for Pie
    const data = [
       { label: 'Lojistas', value: m.tenantsCost, color: '#10b981' }, // Success/Green
       { label: 'Comum', value: m.commonAreaCost, color: '#94a3b8' }, // Slate
       { label: 'AC', value: m.acCost, color: '#60a5fa' } // Blue
    ].filter(d => d.value > 0);

    const width = 250;
    const height = 250;
    const margin = 20;

    if (data.length === 0) return;

    const radius = Math.min(width, height) / 2 - margin;

    const svg = d3.select(element)
      .append("svg")
      .attr("width", width)
      .attr("height", height)
      .append("g")
      .attr("transform", `translate(${width/2},${height/2})`);

    const pie = d3.pie<any>().value(d => d.value).sort(null);
    const data_ready = pie(data);

    const arc = d3.arc<any>().innerRadius(radius * 0.5).outerRadius(radius * 0.8); // Donut
    const arcHover = d3.arc<any>().innerRadius(radius * 0.5).outerRadius(radius * 0.9);

    svg.selectAll('allSlices')
      .data(data_ready)
      .enter()
      .append('path')
      .attr('d', arc)
      .attr('fill', d => d.data.color)
      .attr("stroke", "white")
      .style("stroke-width", "2px")
      .style("opacity", 0.9)
      .on('mouseover', function(e, d) {
         d3.select(this).transition().duration(200).attr('d', arcHover);
      })
      .on('mouseout', function(e, d) {
         d3.select(this).transition().duration(200).attr('d', arc);
      });

    // Center Text (Total)
    svg.append("text")
       .attr("text-anchor", "middle")
       .attr("dy", "-0.2em")
       .text("Total")
       .style("font-size", "10px")
       .style("fill", "#94a3b8")
       .style("text-transform", "uppercase");
    
    svg.append("text")
       .attr("text-anchor", "middle")
       .attr("dy", "1em")
       .text(`R$ ${(m.totalBill/1000).toFixed(1)}k`)
       .style("font-size", "14px")
       .style("font-weight", "bold")
       .style("fill", "#334155");
  }
}