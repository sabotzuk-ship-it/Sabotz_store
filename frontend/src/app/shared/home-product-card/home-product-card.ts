import { StoreImage } from '../store-image/store-image';
import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Product } from '../../data/product.model';
import { ProductService } from '../../data/product.service';

@Component({
  selector: 'app-home-product-card',
  standalone: true,
  imports: [StoreImage, RouterLink],
  templateUrl: './home-product-card.html',
  styleUrl: './home-product-card.css'
})
export class HomeProductCard {
  @Input({ required: true }) product!: Product;
  constructor(private readonly products: ProductService) {}
  productSlug(product: Product): string { return this.products.slugFor(product); }
  formatPrice(price?: number): string { return this.products.formatPrice(price); }
}
