import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Product } from '../../data/product.model';
import { ProductService } from '../../data/product.service';
import { SideNav } from '../../shared/side-nav/side-nav';

@Component({
  selector: 'app-shoes-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, SideNav],
  templateUrl: './shoes.html',
  styleUrl: './shoes.css'
})
export class ShoesPage implements OnInit {
  products: Product[] = [];
  selectedBrand = 'all';
  search = '';
  error = '';

  constructor(
    private readonly productService: ProductService,
    private readonly changeDetector: ChangeDetectorRef
  ) {}

  async ngOnInit(): Promise<void> {
    try {
      this.products = (await this.productService.getProducts()).filter(product => product.categoria === 'Shoes');
    } catch {
      this.error = 'Could not load catalogue.';
    } finally {
      this.changeDetector.markForCheck();
    }
  }

  get visibleProducts(): Product[] {
    const term = this.search.trim().toLowerCase();
    return this.products.filter(product => {
      const matchesBrand = this.selectedBrand === 'all' || product.marca.toLowerCase() === this.selectedBrand;
      const matchesSearch = product.nome.toLowerCase().includes(term) || product.marca.toLowerCase().includes(term);
      return matchesBrand && matchesSearch;
    });
  }

  productSlug(product: Product): string {
    return this.productService.slugFor(product);
  }

  formatPrice(price?: number): string {
    return this.productService.formatPrice(price);
  }
}
