import { CommonModule } from '@angular/common';
import { Component, computed, Input, OnInit, signal } from '@angular/core';
import { Product } from '../../../data/product.model';

import { StoreCategory } from '../../../data/site-settings.model';
import { StoreImage } from '../../../shared/store-image/store-image';

interface PageStats {
  path: string;
  views: number;
  averageSeconds: number;
}

interface VisitorReportData {
  totals: { entries: number; emails: number; tracked: number };
  pages: PageStats[];
  products: PageStats[];
  productsByTime: PageStats[];
  recent: {
    id: string;
    email: string;
    enteredAt: number;
    tracking: boolean;
    journey: { path: string; openedAt: number; seconds: number }[];
  }[];
}

@Component({
  selector: 'app-visitor-report',
  standalone: true,
  imports: [CommonModule, StoreImage],
  templateUrl: './visitor-report.html',
  styleUrl: './visitor-report.css'
})
export class VisitorReport implements OnInit {
  @Input() products: Product[] = [];
  @Input() categories: StoreCategory[] = [];
  readonly report = signal<VisitorReportData | null>(null);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly order = signal<'views' | 'time'>('views');
  readonly rankedProducts = computed(() => (this.order() === 'time' ? this.report()?.productsByTime : this.report()?.products) ?? []);

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const response = await fetch('/api/admin/visitors', { cache: 'no-store', signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error();
      this.report.set(await response.json() as VisitorReportData);
    } catch {
      this.error.set('Could not load visitor activity.');
    } finally {
      this.busy.set(false);
    }
  }

  pageLabel(path: string): string {
    if (path === '/') return 'Home';
    if (path === '/collection') return 'All pieces';
    if (path.startsWith('/products/')) {
      return this.productFor(path)?.nome ?? path.slice('/products/'.length);
    }
    const categoryId = path.replace(/^\/(?:categories\/)?/, '');
    return this.categories.find(category => category.id === categoryId)?.name ?? path;
  }

  productFor(path: string): Product | undefined {
    const slug = path.slice('/products/'.length);
    return this.products.find(product => product.pagina.replace(/^products\//, '').replace(/\.html$/, '') === slug);
  }

  formatTime(seconds: number): string {
    return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  }
}
