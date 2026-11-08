import { StoreImage } from '../../shared/store-image/store-image';
import { CatalogFilters } from '../../shared/catalog-filters/catalog-filters';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Product } from '../../data/product.model';
import { ProductService } from '../../data/product.service';
import { defaultSiteSettings, SiteSettings } from '../../data/site-settings.model';
import { SiteSettingsService } from '../../data/site-settings.service';
import { SideNav } from '../../shared/side-nav/side-nav';

@Component({
  selector: 'app-clothing-page',
  standalone: true,
  imports: [StoreImage, CommonModule, RouterLink, SideNav, CatalogFilters],
  templateUrl: './clothing.html',
  styleUrls: ['./clothing.css', '../shoes/shoes.css']
})
export class ClothingPage implements OnInit {
  settings: SiteSettings = structuredClone(defaultSiteSettings);
  get clothingCategory() { return this.settings.categories.find(category => category.name === 'Clothing'); }
  products: Product[] = [];
  error = '';

  constructor(
    private readonly siteSettings: SiteSettingsService,
    private readonly productService: ProductService,
    private readonly changeDetector: ChangeDetectorRef
  ) {}

  async ngOnInit(): Promise<void> {
    try {
      const [settings, products] = await Promise.all([this.siteSettings.getSettings(), this.productService.getProducts()]);
      this.settings = settings;
      this.products = products.filter(product => product.categoria === this.clothingCategory?.name);
    } catch {
      this.error = 'Could not load clothing collection.';
    } finally {
      this.changeDetector.markForCheck();
    }
  }

  productSlug(product: Product): string {
    return this.productService.slugFor(product);
  }

  formatPrice(price?: number): string {
    return this.productService.formatPrice(price);
  }

  categoryImageUrl(image = ''): string {
    return image.startsWith('assets/') ? `/${image}` : `/assets/images/${image}`;
  }
}
