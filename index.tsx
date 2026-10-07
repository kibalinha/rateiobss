import { bootstrapApplication } from '@angular/platform-browser';
import { provideZonelessChangeDetection } from '@angular/core';
import { AppComponent } from './src/app.component';
import { AuthService } from './src/services/auth.service';
import { NavigationService } from './src/services/navigation.service';
import { ThemeService } from './src/services/theme.service';
import { IndexedDbService } from './src/services/indexed-db.service';
import { GeminiService } from './src/services/gemini.service';
import { StoreService } from './src/services/store.service';
import { HistoryService } from './src/services/history.service';
import { ReportExportService } from './src/services/report-export.service';

bootstrapApplication(AppComponent, {
  providers: [
    provideZonelessChangeDetection(),
    AuthService,
    NavigationService,
    ThemeService,
    IndexedDbService,
    GeminiService,
    StoreService,
    HistoryService,
    ReportExportService
  ]
}).catch(err => console.error(err));
