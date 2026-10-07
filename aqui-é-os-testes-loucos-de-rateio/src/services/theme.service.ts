import { Injectable, signal, effect } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private readonly STORAGE_KEY = 'shop_rateio_theme';
  readonly isDarkMode = signal<boolean>(false);

  constructor() {
    this.initTheme();

    // Reactive effect to keep document element class and meta tags in sync
    effect(() => {
      const dark = this.isDarkMode();
      if (typeof document !== 'undefined') {
        if (dark) {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }

        try {
          localStorage.setItem(this.STORAGE_KEY, dark ? 'dark' : 'light');
        } catch {
          // ignore storage quota issues
        }

        // Keep browser toolbar matching theme (safe for OLEDs & mobile status bar)
        const metaTheme = document.querySelector('meta[name="theme-color"]');
        if (metaTheme) {
          metaTheme.setAttribute('content', dark ? '#020617' : '#0f172a');
        }
      }
    });
  }

  private initTheme() {
    if (typeof window === 'undefined') return;
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (saved) {
        const isDark = saved === 'dark';
        this.isDarkMode.set(isDark);
        if (isDark && typeof document !== 'undefined') {
          document.documentElement.classList.add('dark');
        }
      } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        this.isDarkMode.set(true);
        if (typeof document !== 'undefined') {
          document.documentElement.classList.add('dark');
        }
      }
    } catch {
      this.isDarkMode.set(false);
    }
  }

  toggleTheme() {
    this.isDarkMode.update(v => !v);
  }

  setDarkMode(val: boolean) {
    this.isDarkMode.set(val);
  }
}
