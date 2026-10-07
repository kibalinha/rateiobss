import { Component, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { StoreService, Store, MonthlyImportResult } from '../services/store.service';
import { AuthService } from '../services/auth.service';

type TabType = 'luz' | 'agua' | 'gas';
type StatusFilter = 'all' | 'active' | 'inactive';

interface ParsedStoreRow {
  luc: string;
  contrato: string;
  name: string;
}

@Component({
  selector: 'app-store-manager',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="space-y-6">
      
      <!-- Utility Tabs & Action Bar -->
      <div class="bg-white dark:bg-slate-900 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4 transition-colors">
        <div class="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg w-full md:w-auto">
          <button (click)="setTab('luz')" 
            [class]="activeTab() === 'luz' ? 'bg-white dark:bg-slate-700 text-warning shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'"
            class="flex-1 md:flex-none px-6 py-2 rounded-md text-sm font-bold transition-all flex items-center justify-center gap-2 whitespace-nowrap">
            <span>⚡</span> Lojas de Luz
          </button>
          <button (click)="setTab('agua')" 
            [class]="activeTab() === 'agua' ? 'bg-white dark:bg-slate-700 text-accent shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'"
            class="flex-1 md:flex-none px-6 py-2 rounded-md text-sm font-bold transition-all flex items-center justify-center gap-2 whitespace-nowrap">
            <span>💧</span> Lojas de Água
          </button>
          <button (click)="setTab('gas')" 
            [class]="activeTab() === 'gas' ? 'bg-white dark:bg-slate-700 text-danger shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'"
            class="flex-1 md:flex-none px-6 py-2 rounded-md text-sm font-bold transition-all flex items-center justify-center gap-2 whitespace-nowrap">
            <span>🔥</span> Lojas de Gás
          </button>
        </div>

        @if (authService.canManageStores()) {
          <div class="flex gap-2 w-full md:w-auto">
            <!-- Botão Importar Planilha Mensal -->
            <button (click)="toggleImport()" 
              [class]="showImport() ? 'bg-teal-700 text-white shadow-sm' : 'bg-white dark:bg-slate-800 text-teal-700 dark:text-teal-400 border border-teal-300 dark:border-teal-700 hover:bg-teal-50 dark:hover:bg-slate-700'"
              class="flex-1 md:flex-none px-4 py-2 rounded-lg transition-colors font-semibold text-sm flex items-center justify-center gap-2 shadow-sm">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span>Subir Lista Mensal (LUC / Contrato)</span>
            </button>

            <!-- Botão Nova Loja -->
            <button (click)="toggleForm()" 
              [class]="showForm() ? 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200' : 'bg-slate-800 dark:bg-teal-600 text-white hover:bg-slate-700 dark:hover:bg-teal-500'"
              class="flex-1 md:flex-none px-4 py-2 rounded-lg transition-colors font-medium text-sm flex items-center justify-center gap-2">
              @if (showForm()) { Cancelar } @else { + Adicionar Loja }
            </button>
          </div>
        }
      </div>

      <div class="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-6 transition-colors">
        
        <!-- Header & Quick Filters -->
        <div class="mb-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
           <div>
             <h2 class="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <span class="w-2.5 h-6 rounded" [class]="getTabColor()"></span>
                Lojas de {{ getTabName() }}
                <span class="text-xs bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 rounded-full font-bold ml-1">
                  {{ activeCount() }} ativas
                </span>
                @if (inactiveCount() > 0) {
                  <span class="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded-full font-semibold">
                    {{ inactiveCount() }} inativas (histórico salvo)
                  </span>
                }
             </h2>
             <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Lojas com troca de contrato são inativadas automaticamente sem perder o histórico anterior.
             </p>
           </div>

           <div class="flex flex-col sm:flex-row items-center gap-3">
             <!-- Status Filter Pills -->
             <div class="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg text-xs font-semibold w-full sm:w-auto">
               <button (click)="statusFilter.set('active')"
                 [class]="statusFilter() === 'active' ? 'bg-white dark:bg-slate-700 text-emerald-800 dark:text-emerald-300 shadow-xs' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'"
                 class="flex-1 sm:flex-none px-3 py-1.5 rounded-md transition-all">
                 Ativas ({{ activeCount() }})
               </button>
               <button (click)="statusFilter.set('inactive')"
                 [class]="statusFilter() === 'inactive' ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 shadow-xs' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'"
                 class="flex-1 sm:flex-none px-3 py-1.5 rounded-md transition-all">
                 Inativas ({{ inactiveCount() }})
               </button>
               <button (click)="statusFilter.set('all')"
                 [class]="statusFilter() === 'all' ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 shadow-xs' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'"
                 class="flex-1 sm:flex-none px-3 py-1.5 rounded-md transition-all">
                 Todas ({{ totalUtilityCount() }})
               </button>
             </div>

             <!-- Busca Rápida -->
             <div class="w-full sm:w-64 relative">
               <input 
                 type="text" 
                 [ngModel]="searchTerm()" 
                 (ngModelChange)="searchTerm.set($event)"
                 placeholder="Buscar LUC, Contrato, Nome..."
                 class="w-full pl-8 pr-4 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-slate-400 outline-none bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:bg-white dark:focus:bg-slate-750 transition-all">
               <svg class="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
               </svg>
               @if (searchTerm()) {
                 <button (click)="searchTerm.set('')" class="absolute right-2.5 top-1.5 text-slate-400 hover:text-slate-600 text-xs">✕</button>
               }
             </div>
           </div>
        </div>

        <!-- FORMULÁRIO MANUAL -->
        @if (showForm()) {
          <div class="mb-8 p-5 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 animate-fade-in shadow-sm transition-colors">
            <div class="flex items-center justify-between mb-4 pb-2 border-b border-slate-200 dark:border-slate-700">
              <h3 class="font-bold text-slate-700 dark:text-slate-200 text-sm flex items-center gap-2">
                @if (editingId()) { ✏️ Editar Dados da Loja } @else { ➕ Cadastrar Nova Loja }
              </h3>
              @if (editingId()) {
                <button (click)="resetForm(); showForm.set(false)" class="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">Fechar</button>
              }
            </div>
            
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  LUC (Espaço da Loja) <span class="text-red-500">*</span>
                </label>
                <input 
                  type="text" 
                  [(ngModel)]="newLuc" 
                  class="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-accent focus:border-accent font-mono bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100" 
                  placeholder="Ex: 1020 ou L-101">
              </div>
              
              <div>
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Nº do Contrato
                </label>
                <input 
                  type="text" 
                  [(ngModel)]="newContrato" 
                  class="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-accent focus:border-accent font-mono bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100" 
                  placeholder="Ex: 333 ou 444">
              </div>

              <div>
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Nome da Loja / Lojista <span class="text-red-500">*</span>
                </label>
                <input 
                  type="text" 
                  [(ngModel)]="newStoreName" 
                  class="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-accent focus:border-accent bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100" 
                  placeholder="Ex: Burger King ou Madero">
              </div>
            </div>
            
            <div class="mt-4 pt-3 border-t border-slate-200 dark:border-slate-700 grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
              <div>
                <label class="block text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-2">Serviços Utilizados:</label>
                <div class="flex flex-wrap gap-2">
                    <label class="flex items-center gap-1.5 cursor-pointer bg-white dark:bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-warning hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors shadow-xs">
                      <input type="checkbox" [(ngModel)]="newUsesLuz" class="rounded text-warning focus:ring-warning">
                      <span class="text-xs font-bold text-slate-700 dark:text-slate-300">⚡ Luz</span>
                    </label>
                    <label class="flex items-center gap-1.5 cursor-pointer bg-white dark:bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-accent hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors shadow-xs">
                      <input type="checkbox" [(ngModel)]="newUsesAgua" class="rounded text-accent focus:ring-accent">
                      <span class="text-xs font-bold text-slate-700 dark:text-slate-300">💧 Água</span>
                    </label>
                    <label class="flex items-center gap-1.5 cursor-pointer bg-white dark:bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-danger hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors shadow-xs">
                      <input type="checkbox" [(ngModel)]="newUsesGas" class="rounded text-danger focus:ring-danger">
                      <span class="text-xs font-bold text-slate-700 dark:text-slate-300">🔥 Gás</span>
                    </label>
                </div>
              </div>

              <!-- Status Ativo Toggle -->
              <div>
                <label class="block text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-2">Situação no Rateio:</label>
                <label class="flex items-center gap-2 cursor-pointer bg-white dark:bg-slate-900 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 w-fit">
                  <input type="checkbox" [(ngModel)]="newIsActive" class="rounded text-emerald-600 focus:ring-emerald-500">
                  <span class="text-xs font-bold text-slate-700 dark:text-slate-300">
                    {{ newIsActive ? '● Loja Ativa no rateio' : '○ Loja Inativa (não receberá novos lançamentos)' }}
                  </span>
                </label>
              </div>
            </div>

            <div class="mt-4 pt-3 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2">
              <button (click)="showForm.set(false)" class="px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 text-sm font-semibold transition-colors">
                Cancelar
              </button>
              <button (click)="saveStore()" [disabled]="!isValid()" 
                class="px-6 py-2 bg-slate-900 dark:bg-teal-600 text-white rounded-lg hover:bg-slate-800 dark:hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-bold shadow-sm transition-all">
                @if (editingId()) { Salvar Alterações } @else { Cadastrar Loja }
              </button>
            </div>
          </div>
        }

        <!-- ÁREA DE IMPORTAÇÃO MENSAL INTELIGENTE -->
        @if (showImport()) {
          <div class="mb-8 p-5 bg-teal-50/70 rounded-xl border border-teal-200 animate-fade-in shadow-xs">
            <div class="flex justify-between items-start mb-3">
              <div>
                <h3 class="font-bold text-teal-900 text-base flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  Importação Mensal com Detecção Automática de Mudança de Lojas
                </h3>
                <p class="text-xs text-teal-700 mt-1">
                  Cole a lista mensal completa das lojas cadastradas (<strong>LUC</strong>, <strong>CONTRATO</strong> e <strong>NOME</strong>).
                  O sistema compara automaticamente com o shopping: se um mesmo LUC estiver com contrato ou lojista diferente, <strong>a loja antiga será inativada e a nova assumirá a partir deste mês</strong>, preservando todo o histórico anterior!
                </p>
              </div>
              <button (click)="showImport.set(false)" class="text-teal-400 hover:text-teal-600 font-bold text-lg p-1">✕</button>
            </div>

            <!-- Controles do Mês de Referência e Regra de Ausentes -->
            <div class="bg-white p-3.5 rounded-lg border border-teal-200 mb-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs">
              <div class="flex items-center gap-2">
                <label class="font-bold text-teal-900 whitespace-nowrap">📅 Mês de Vigência desta Lista:</label>
                <input 
                  type="month" 
                  [ngModel]="importReferenceMonth()" 
                  (ngModelChange)="importReferenceMonth.set($event)"
                  class="px-2.5 py-1.5 border border-teal-300 rounded font-bold text-teal-900 bg-teal-50/50 outline-none">
              </div>

              <label class="flex items-center gap-2 cursor-pointer font-medium text-teal-800">
                <input type="checkbox" [ngModel]="inactivateMissing()" (ngModelChange)="inactivateMissing.set($event)" class="rounded text-teal-600">
                <span>Inativar lojas ativas de {{ getTabName() }} que <strong>não constam</strong> nesta lista mensal</span>
              </label>
            </div>
            
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <!-- Área de Colagem -->
              <div class="flex flex-col">
                <div class="flex justify-between items-center mb-1.5">
                  <span class="text-xs font-bold text-teal-800 uppercase tracking-wide">Cole aqui os dados da sua planilha (Ctrl+V)</span>
                  <span class="text-[11px] text-teal-600">LUC [TAB] CONTRATO [TAB] NOME</span>
                </div>
                <textarea 
                  [ngModel]="importText()" 
                  (ngModelChange)="updateImportPreview($event)"
                  class="w-full h-64 p-3 border border-teal-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 font-mono text-xs bg-white shadow-inner resize-none" 
                  placeholder="1020	444	Madero&#10;1021	550	Renner&#10;1022	612	McDonalds"></textarea>
                
                <div class="mt-2 flex items-center justify-between text-xs text-teal-700">
                  <span>{{ parsedImportData().length }} linhas detectadas</span>
                  @if (importText()) {
                    <button (click)="clearImport()" class="text-teal-600 hover:text-teal-800 underline">Limpar texto</button>
                  }
                </div>
              </div>

              <!-- Pré-visualização e Análise Inteligente -->
              <div class="bg-white rounded-xl border border-teal-200 overflow-hidden flex flex-col h-80 shadow-xs">
                <div class="bg-teal-100/90 px-4 py-2.5 text-xs font-bold text-teal-900 flex justify-between items-center border-b border-teal-200">
                  <span>Diagnóstico da Importação Mensal</span>
                  @if (parsedImportData().length > 0) {
                    <button (click)="confirmMonthlyImport()" class="px-3.5 py-1.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors shadow-sm font-bold text-xs uppercase tracking-wide">
                      Confirmar Atualização
                    </button>
                  }
                </div>
                
                <div class="overflow-y-auto flex-1 p-3 space-y-3 custom-scrollbar text-xs">
                  @if (parsedImportData().length === 0) {
                    <div class="p-8 text-center text-slate-400 italic">
                      Cole a planilha acima para ver o diagnóstico automático de substituições...
                    </div>
                  } @else {
                    <!-- Summary Cards -->
                    <div class="grid grid-cols-3 gap-2 text-center">
                      <div class="p-2 rounded bg-emerald-50 border border-emerald-200">
                        <div class="text-[10px] uppercase font-bold text-emerald-700">Mantidas</div>
                        <div class="text-lg font-extrabold text-emerald-800">{{ importAnalysis().maintained.length }}</div>
                      </div>
                      <div class="p-2 rounded bg-amber-50 border border-amber-200">
                        <div class="text-[10px] uppercase font-bold text-amber-700">Substituições</div>
                        <div class="text-lg font-extrabold text-amber-800">{{ importAnalysis().replacements.length }}</div>
                      </div>
                      <div class="p-2 rounded bg-blue-50 border border-blue-200">
                        <div class="text-[10px] uppercase font-bold text-blue-700">Novas Lojas</div>
                        <div class="text-lg font-extrabold text-blue-800">{{ importAnalysis().brandNew.length }}</div>
                      </div>
                    </div>

                    <!-- Highlight Substituições Detectadas (o cerne do problema do usuário) -->
                    @if (importAnalysis().replacements.length > 0) {
                      <div class="p-3 bg-amber-50/90 rounded-lg border border-amber-300">
                        <div class="font-bold text-amber-900 flex items-center gap-1.5 mb-1.5">
                          <span>🔄</span>
                          <span>{{ importAnalysis().replacements.length }} Substituição(ões) no mesmo espaço (LUC):</span>
                        </div>
                        <div class="space-y-1.5">
                          @for (rep of importAnalysis().replacements; track rep.luc) {
                            <div class="bg-white p-2 rounded border border-amber-200 text-[11px] flex flex-col gap-0.5">
                              <div class="flex items-center justify-between font-mono">
                                <span class="font-bold text-slate-800">LUC: {{ rep.luc }}</span>
                                <span class="text-amber-700 font-semibold text-[10px] bg-amber-100 px-1.5 py-0.2 rounded">Mudança de Contrato</span>
                              </div>
                              <div class="flex items-center gap-1.5 text-slate-600">
                                <span class="text-red-600 line-through">Antiga: <strong>{{ rep.oldStore.name }}</strong> (Ctr: {{ rep.oldStore.contrato || '-' }})</span>
                                <span>➔</span>
                                <span class="text-emerald-700 font-bold">Nova: {{ rep.newName }} (Ctr: {{ rep.newContrato || '-' }})</span>
                              </div>
                              <span class="text-[10px] text-slate-400 italic">
                                * A loja {{ rep.oldStore.name }} será inativada mantendo todo o histórico até {{ importReferenceMonth() }}.
                              </span>
                            </div>
                          }
                        </div>
                      </div>
                    }

                    <!-- Lojas Ausentes a Inativar -->
                    @if (inactivateMissing() && importAnalysis().missingStores.length > 0) {
                      <div class="p-2.5 bg-slate-100 rounded-lg border border-slate-200 text-slate-700 text-[11px]">
                        <span class="font-bold text-slate-800">⚠️ {{ importAnalysis().missingStores.length }} lojas ativas não constam nesta lista</span> e serão inativadas em {{ importReferenceMonth() }} (histórico preservado).
                      </div>
                    }

                    <!-- Table Preview -->
                    <div class="rounded border border-slate-200 overflow-hidden">
                      <table class="w-full text-left border-collapse text-xs">
                        <thead class="bg-slate-50 sticky top-0 border-b border-slate-200">
                          <tr>
                            <th class="p-2 font-bold text-slate-700 w-20">LUC</th>
                            <th class="p-2 font-bold text-slate-700 w-24">Contrato</th>
                            <th class="p-2 font-bold text-slate-700">Nome da Loja</th>
                            <th class="p-2 font-bold text-slate-700 text-right">Ação</th>
                          </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100">
                          @for (item of parsedImportData(); track $index) {
                            @let rep = getReplacementForLuc(item.luc);
                            <tr class="hover:bg-slate-50" [class.bg-amber-50]="!!rep">
                              <td class="p-2 font-mono font-bold text-slate-700">{{ item.luc }}</td>
                              <td class="p-2 font-mono text-slate-600">{{ item.contrato || '-' }}</td>
                              <td class="p-2 text-slate-800 font-medium">{{ item.name }}</td>
                              <td class="p-2 text-right">
                                @if (rep) {
                                  <span class="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-bold">Substitui</span>
                                } @else {
                                  <span class="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-bold">Ativa</span>
                                }
                              </td>
                            </tr>
                          }
                        </tbody>
                      </table>
                    </div>
                  }
                </div>

                @if (parsedImportData().length > 0) {
                  <div class="p-2.5 bg-teal-50 border-t border-teal-100 text-[11px] text-teal-800 flex justify-between items-center px-4">
                    <span>Vigência: <strong>{{ importReferenceMonth() }}</strong> em <strong>{{ getTabName() }}</strong></span>
                    <button (click)="confirmMonthlyImport()" class="font-bold text-teal-800 hover:text-teal-900 underline">
                      Aplicar Atualizações Agora →
                    </button>
                  </div>
                }
              </div>
            </div>
          </div>
        }

        <!-- TABELA DE LOJAS -->
        <div class="overflow-x-auto rounded-lg border border-slate-100 dark:border-slate-800">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 text-xs uppercase tracking-wider font-semibold">
                <th class="p-3.5 pl-4 w-28">LUC</th>
                <th class="p-3.5 w-32">Contrato</th>
                <th class="p-3.5">Nome da Loja</th>
                <th class="p-3.5 text-center w-36">Situação</th>
                <th class="p-3.5 text-center w-36">Serviços</th>
                
                @if (authService.canManageStores()) {
                  <th class="p-3.5 pr-4 text-right w-44">Ações</th>
                }
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
              @for (store of filteredStores(); track store.id) {
                <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group" [class.bg-slate-50/50]="store.active === false" [class.dark:bg-slate-850/30]="store.active === false">
                  <td class="p-3.5 pl-4 font-mono font-bold text-slate-700 dark:text-slate-200">
                    <span class="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                      {{ store.luc }}
                    </span>
                  </td>
                  <td class="p-3.5 font-mono text-slate-600 dark:text-slate-400">
                    @if (store.contrato) {
                      <span class="text-xs bg-slate-50 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 font-semibold text-slate-700 dark:text-slate-300">
                        {{ store.contrato }}
                      </span>
                    } @else {
                      <span class="text-slate-300 dark:text-slate-600 text-xs italic">Não inf.</span>
                    }
                  </td>
                  <td class="p-3.5">
                    <div class="font-medium" [class.text-slate-800]="store.active !== false" [class.dark:text-slate-100]="store.active !== false" [class.text-slate-400]="store.active === false" [class.dark:text-slate-500]="store.active === false">
                      {{ store.name }}
                    </div>
                    @if (store.active === false && store.deactivationReason) {
                      <div class="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
                        ↳ {{ store.deactivationReason }}
                      </div>
                    }
                  </td>
                  
                  <!-- Situação (Ativa / Inativa) -->
                  <td class="p-3.5 text-center">
                    @if (store.active !== false) {
                      <span class="px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-xs font-bold border border-emerald-200 dark:border-emerald-800 inline-flex items-center gap-1.5">
                        <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                        Ativa
                      </span>
                    } @else {
                      <div class="inline-flex flex-col items-center">
                        <span class="px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs font-bold border border-slate-300 dark:border-slate-700 inline-flex items-center gap-1.5">
                          <span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                          Inativa
                        </span>
                        @if (store.deactivatedAt) {
                          <span class="text-[10px] text-slate-400 dark:text-slate-500 font-mono mt-0.5">Desde {{ store.deactivatedAt }}</span>
                        }
                      </div>
                    }
                  </td>

                  <!-- Serviços Habilitados -->
                  <td class="p-3.5 text-center">
                    <div class="flex justify-center gap-1 text-[11px] font-bold">
                      <span class="px-1.5 py-0.5 rounded" [class]="store.usesLuz ? 'bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-300 dark:text-slate-600'">⚡</span>
                      <span class="px-1.5 py-0.5 rounded" [class]="store.usesAgua ? 'bg-blue-100 dark:bg-blue-950/50 text-blue-800 dark:text-blue-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-300 dark:text-slate-600'">💧</span>
                      <span class="px-1.5 py-0.5 rounded" [class]="store.usesGas ? 'bg-red-100 dark:bg-red-950/50 text-red-800 dark:text-red-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-300 dark:text-slate-600'">🔥</span>
                    </div>
                  </td>
                  
                  @if (authService.canManageStores()) {
                    <td class="p-3.5 pr-4 text-right">
                      <div class="flex justify-end items-center gap-1.5">
                        <button (click)="editStore(store)" class="px-2.5 py-1 text-slate-600 dark:text-slate-300 hover:text-accent hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors text-xs font-semibold border border-slate-200 dark:border-slate-700">
                          Editar
                        </button>
                        
                        @if (store.active !== false) {
                          <button (click)="inactivateStore(store)" title="Inativar loja preservando histórico" class="px-2.5 py-1 text-amber-700 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30 rounded-md transition-colors text-xs font-semibold border border-amber-200 dark:border-amber-800">
                            Inativar
                          </button>
                        } @else {
                          <button (click)="reactivateStore(store)" title="Reativar loja no rateio" class="px-2.5 py-1 text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 rounded-md transition-colors text-xs font-semibold border border-emerald-200 dark:border-emerald-800">
                            Reativar
                          </button>
                        }

                        <button (click)="confirmRemoveStore(store)" title="Excluir permanentemente" class="p-1 text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded transition-colors text-xs">
                          ✕
                        </button>
                      </div>
                    </td>
                  }
                </tr>
              } @empty {
                <tr>
                  <td colspan="6" class="p-8 text-center text-slate-500 dark:text-slate-400 italic">
                    @if (searchTerm()) {
                      Nenhuma loja encontrada para o termo "{{ searchTerm() }}".
                    } @else if (statusFilter() === 'inactive') {
                      Nenhuma loja inativa cadastrada para {{ getTabName() }}.
                    } @else {
                      Nenhuma loja ativa cadastrada para {{ getTabName() }}. Clique em "+ Adicionar Loja" ou "Subir Lista Mensal".
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
  styles: [`
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-8px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .animate-fade-in {
      animation: fadeIn 0.25s ease-out;
    }
  `]
})
export class StoreManagerComponent {
  storeService = inject(StoreService);
  authService = inject(AuthService);
  
  activeTab = signal<TabType>('luz');
  statusFilter = signal<StatusFilter>('active');
  searchTerm = signal('');

  // Manual Form State
  showForm = signal(false);
  editingId = signal<string | null>(null);
  
  newLuc = '';
  newContrato = '';
  newStoreName = '';
  newIsActive = true;
  newUsesLuz = true;
  newUsesAgua = true;
  newUsesGas = false;

  // Monthly Import State
  showImport = signal(false);
  importText = signal('');
  parsedImportData = signal<ParsedStoreRow[]>([]);
  importReferenceMonth = signal<string>(new Date().toISOString().substring(0, 7));
  inactivateMissing = signal<boolean>(true);

  // Stores in active tab
  allTabStores = computed(() => {
     const type = this.activeTab();
     return this.storeService.storesByType(type, true)();
  });

  activeCount = computed(() => {
    return this.allTabStores().filter(s => s.active !== false).length;
  });

  inactiveCount = computed(() => {
    return this.allTabStores().filter(s => s.active === false).length;
  });

  totalUtilityCount = computed(() => {
    return this.allTabStores().length;
  });

  filteredStores = computed(() => {
     let list = this.allTabStores();
     const filter = this.statusFilter();

     if (filter === 'active') {
       list = list.filter(s => s.active !== false);
     } else if (filter === 'inactive') {
       list = list.filter(s => s.active === false);
     }

     const query = this.searchTerm().trim().toLowerCase();
     if (!query) return list;

     return list.filter(s => 
       s.luc.toLowerCase().includes(query) ||
       (s.contrato && s.contrato.toLowerCase().includes(query)) ||
       s.name.toLowerCase().includes(query)
     );
  });

  // Real-time analysis of the imported data compared with current active stores
  importAnalysis = computed(() => {
    const parsed = this.parsedImportData();
    const type = this.activeTab();
    const currentActive = this.allTabStores().filter(s => s.active !== false);

    const replacements: { luc: string; oldStore: Store; newName: string; newContrato: string }[] = [];
    const maintained: ParsedStoreRow[] = [];
    const brandNew: ParsedStoreRow[] = [];
    const importedLucs = new Set<string>();

    for (const item of parsed) {
      importedLucs.add(item.luc.toLowerCase());
      const match = currentActive.find(s => s.luc.toLowerCase() === item.luc.toLowerCase());

      if (match) {
        const itemCtr = item.contrato.trim();
        const matchCtr = (match.contrato || '').trim();
        const sameCtr = itemCtr && matchCtr && itemCtr.toLowerCase() === matchCtr.toLowerCase();
        const sameName = !itemCtr && !matchCtr && item.name.toLowerCase() === match.name.toLowerCase();

        if (sameCtr || sameName) {
          maintained.push(item);
        } else {
          // Replaced!
          replacements.push({
            luc: item.luc,
            oldStore: match,
            newName: item.name,
            newContrato: item.contrato
          });
        }
      } else {
        brandNew.push(item);
      }
    }

    const missingStores = currentActive.filter(s => !importedLucs.has(s.luc.toLowerCase()));

    return {
      replacements,
      maintained,
      brandNew,
      missingStores
    };
  });

  getReplacementForLuc(luc: string) {
    return this.importAnalysis().replacements.find(r => r.luc.toLowerCase() === luc.toLowerCase());
  }

  constructor() {
     // Reset form defaults when tab changes
     effect(() => {
         const tab = this.activeTab();
         this.newUsesLuz = tab === 'luz';
         this.newUsesAgua = tab === 'agua';
         this.newUsesGas = tab === 'gas';
     }, { allowSignalWrites: true });
  }

  setTab(tab: TabType) {
    this.activeTab.set(tab);
    this.showImport.set(false);
    this.showForm.set(false);
  }

  getTabName() {
    switch(this.activeTab()) {
      case 'luz': return 'Luz';
      case 'agua': return 'Água';
      case 'gas': return 'Gás';
    }
  }

  getTabColor() {
    switch(this.activeTab()) {
      case 'luz': return 'bg-warning';
      case 'agua': return 'bg-accent';
      case 'gas': return 'bg-danger';
    }
  }

  toggleForm() {
    if (!this.authService.canManageStores()) return;

    this.showImport.set(false);
    if (this.showForm()) {
        this.showForm.set(false);
        this.resetForm();
    } else {
        this.resetForm();
        this.showForm.set(true);
    }
  }

  toggleImport() {
    if (!this.authService.canManageStores()) return;

    this.showForm.set(false);
    this.showImport.update(v => !v);
    if (this.showImport()) {
      this.importText.set('');
      this.parsedImportData.set([]);
    }
  }

  clearImport() {
    this.importText.set('');
    this.parsedImportData.set([]);
  }

  resetForm() {
    this.newLuc = '';
    this.newContrato = '';
    this.newStoreName = '';
    this.newIsActive = true;
    
    const tab = this.activeTab();
    this.newUsesLuz = tab === 'luz';
    this.newUsesAgua = tab === 'agua';
    this.newUsesGas = tab === 'gas';
    
    this.editingId.set(null);
  }

  editStore(store: Store) {
    if (!this.authService.canManageStores()) return;

    this.showImport.set(false);
    this.newLuc = store.luc;
    this.newContrato = store.contrato || '';
    this.newStoreName = store.name;
    this.newIsActive = store.active !== false;
    this.newUsesLuz = store.usesLuz;
    this.newUsesAgua = store.usesAgua;
    this.newUsesGas = store.usesGas;
    this.editingId.set(store.id);
    this.showForm.set(true);
  }

  isValid() {
    return this.newLuc.trim() && this.newStoreName.trim();
  }

  saveStore() {
    if (this.isValid()) {
      const storePayload = {
        luc: this.newLuc.trim(),
        contrato: this.newContrato.trim(),
        name: this.newStoreName.trim(),
        active: this.newIsActive,
        usesLuz: this.newUsesLuz,
        usesAgua: this.newUsesAgua,
        usesGas: this.newUsesGas
      };

      if (this.editingId()) {
        this.storeService.updateStore({
            id: this.editingId()!,
            ...storePayload
        });
      } else {
        this.storeService.addStore(storePayload);
      }
      this.toggleForm();
    }
  }

  inactivateStore(store: Store) {
    if (confirm(`Deseja inativar a loja "${store.name}" (${store.luc})? O histórico de leituras e faturas anteriores permanecerá 100% preservado.`)) {
      this.storeService.toggleStoreActive(store.id, this.importReferenceMonth(), 'Inativada manualmente');
    }
  }

  reactivateStore(store: Store) {
    if (confirm(`Deseja reativar a loja "${store.name}" (${store.luc}) para o rateio?`)) {
      this.storeService.toggleStoreActive(store.id);
    }
  }

  confirmRemoveStore(store: Store) {
    if (confirm(`ATENÇÃO: A exclusão permanente apaga todos os registros desta loja. Se o objetivo é apenas registrar a saída do lojista, use o botão "Inativar" para manter o histórico.\n\nDeseja realmente excluir permanentemente a loja "${store.name}"?`)) {
      this.storeService.removeStore(store.id);
    }
  }

  // --- PARSE DA IMPORTAÇÃO (LUC, CONTRATO, NOME) ---

  updateImportPreview(text: string) {
    this.importText.set(text);
    
    if (!text.trim()) {
      this.parsedImportData.set([]);
      return;
    }

    const rows = text.split(/\r?\n/);
    const parsed: ParsedStoreRow[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i].trim();
      if (!row) continue;

      let parts: string[] = [];
      if (row.includes('\t')) {
        parts = row.split('\t');
      } else if (row.includes(';')) {
        parts = row.split(';');
      } else if (row.includes(',') && !row.includes('\t')) {
        parts = row.split(',');
      } else {
        parts = [row];
      }

      const cleanParts = parts.map(p => p.trim());

      const lower0 = cleanParts[0]?.toLowerCase() || '';
      const lower1 = cleanParts[1]?.toLowerCase() || '';
      const lower2 = cleanParts[2]?.toLowerCase() || '';

      const isHeader = (
        lower0.includes('luc') || lower0.includes('código') || lower0.includes('codigo')
      ) && (
        lower1.includes('contrato') || lower1.includes('nome') || lower2.includes('nome')
      );

      if (isHeader) continue;

      if (cleanParts.length >= 3) {
        const luc = cleanParts[0];
        const contrato = cleanParts[1];
        const name = cleanParts.slice(2).join(' ').trim();

        if (luc && name) {
          parsed.push({ luc, contrato, name });
        }
      } else if (cleanParts.length === 2) {
        const luc = cleanParts[0];
        const name = cleanParts[1];
        if (luc && name) {
          parsed.push({ luc, contrato: '', name });
        }
      }
    }
    
    this.parsedImportData.set(parsed);
  }

  confirmMonthlyImport() {
    const data = this.parsedImportData();
    const type = this.activeTab();
    const refMonth = this.importReferenceMonth();
    const inactivate = this.inactivateMissing();
    
    if (data.length === 0) return;

    const result = this.storeService.processMonthlyStoreImport(data, type, refMonth, inactivate);

    this.importText.set('');
    this.parsedImportData.set([]);
    this.showImport.set(false);

    let msg = `✅ Importação de ${this.getTabName()} concluída com sucesso para ${refMonth}!\n\n`;
    msg += `• Lojas mantidas ativas: ${result.maintainedCount}\n`;
    msg += `• Lojas novas criadas: ${result.newCount}\n`;

    if (result.replacements.length > 0) {
      msg += `\n🔄 ${result.replacements.length} Substituição(ões) efetuadas (lojas anteriores inativadas com histórico preservado):\n`;
      result.replacements.forEach(r => {
        msg += `  - LUC ${r.luc}: ${r.oldName} (Ctr: ${r.oldContrato || '-'}) ➔ Inativada | ${r.newName} (Ctr: ${r.newContrato || '-'}) ➔ Nova Ativa\n`;
      });
    }

    if (result.inactivatedMissing.length > 0) {
      msg += `\n⚠️ ${result.inactivatedMissing.length} loja(s) ausentes inativada(s):\n`;
      result.inactivatedMissing.forEach(m => {
        msg += `  - ${m.name} (${m.luc})\n`;
      });
    }

    alert(msg);
  }
}