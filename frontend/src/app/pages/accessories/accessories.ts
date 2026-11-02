import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Product } from '../../data/product.model';
import { ProductService } from '../../data/product.service';
import { SideNav } from '../../shared/side-nav/side-nav';

@Component({
  selector: 'app-accessories-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, SideNav],
  templateUrl: './accessories.html',
  styleUrl: '../shoes/shoes.css'
})
export class AccessoriesPage implements OnInit {
  products: Product[] = [];
  search = '';
  error = '';

  constructor(
    private readonly productService: ProductService,
    private readonly changeDetector: ChangeDetectorRef
  ) {}

  async ngOnInit(): Promise<void> {
    try {
      this.products = (await this.productService.getProducts()).filter(product => product.categoria === 'Accessories');
    } catch {
      this.error = 'Could not load catalogue.';
    } finally {
      this.changeDetector.markForCheck();
    }
  }

  get visibleProducts(): Product[] {
    const term = this.search.trim().toLowerCase();
    return this.products.filter(product => product.nome.toLowerCase().includes(term) || product.marca.toLowerCase().includes(term));
  }

  productSlug(product: Product): string {
    return this.productService.slugFor(product);
  }

  formatPrice(price?: number): string {
    return this.productService.formatPrice(price);
  }
}
