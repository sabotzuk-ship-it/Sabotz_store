import { StoreImage } from '../../../shared/store-image/store-image';
import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { Product } from '../../../data/product.model';
import { HomeProductCard } from '../../../shared/home-product-card/home-product-card';

@Component({
  selector: 'app-home-selection',
  standalone: true,
  imports: [StoreImage, CommonModule, HomeProductCard],
  templateUrl: './home-selection.html',
  styleUrl: './home-selection.css'
})
export class HomeSelection {
  @Input({ required: true }) products: Product[] = [];
}
