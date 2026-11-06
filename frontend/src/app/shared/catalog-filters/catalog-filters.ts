import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Product } from '../../data/product.model';

@Component({
  selector: 'app-catalog-filters',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './catalog-filters.html',
  styleUrl: './catalog-filters.css'
})
export class CatalogFilters implements OnChanges {
  @Input() products: Product[] = [];
  search = '';
  selectedBrands: string[] = [];

  ngOnChanges(): void {
    this.search = '';
    this.selectedBrands = [];
  }

  private brandKey(brand: string): string {
    return brand.trim().toLowerCase();
  }

  get brands(): { key: string; name: string; count: number }[] {
    const brands = new Map<string, { key: string; name: string; count: number }>();
    for (const product of this.products) {
      const key = this.brandKey(product.marca);
      if (!key) continue;
      const brand = brands.get(key);
      if (brand) brand.count++;
      else brands.set(key, { key, name: product.marca.trim(), count: 1 });
    }
    return [...brands.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  get visibleProducts(): Product[] {
    const term = this.search.trim().toLowerCase();
    return this.products.filter(product =>
      (!this.selectedBrands.length || this.selectedBrands.includes(this.brandKey(product.marca))) &&
      (!term || `${product.nome} ${product.marca}`.toLowerCase().includes(term))
    );
  }

  toggleBrand(key: string): void {
    this.selectedBrands = this.selectedBrands.includes(key)
      ? this.selectedBrands.filter(brand => brand !== key)
      : [...this.selectedBrands, key];
  }

  clear(): void {
    this.search = '';
    this.selectedBrands = [];
  }
}
