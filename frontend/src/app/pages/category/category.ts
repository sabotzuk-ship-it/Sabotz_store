import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Product } from '../../data/product.model';
import { ProductService } from '../../data/product.service';
import { defaultSiteSettings, SiteSettings, StoreCategory } from '../../data/site-settings.model';
import { SiteSettingsService } from '../../data/site-settings.service';
import { SideNav } from '../../shared/side-nav/side-nav';

@Component({
  selector: 'app-category-page',
  standalone: true,
  imports: [CommonModule, RouterLink, SideNav],
  templateUrl: './category.html',
  styleUrls: ['./category.css', '../shoes/shoes.css']
})
export class CategoryPage implements OnInit {
  settings: SiteSettings = structuredClone(defaultSiteSettings);
  category?: StoreCategory;
  products: Product[] = [];
  error = '';

  constructor(
    private readonly route: ActivatedRoute,
    private readonly siteSettings: SiteSettingsService,
    private readonly productService: ProductService,
    private readonly changeDetector: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.route.paramMap.subscribe(params => void this.load(params.get('id') ?? ''));
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

  private async load(id: string): Promise<void> {
    this.error = '';
    try {
      const [settings, products] = await Promise.all([this.siteSettings.getSettings(), this.productService.getProducts()]);
      this.settings = settings;
      this.category = settings.categories.find(category => category.id === id);
      this.products = products.filter(product => product.categoria === this.category?.name);
      if (!this.category) this.error = 'Category not found.';
    } catch {
      this.error = 'Could not load this category.';
    } finally {
      this.changeDetector.markForCheck();
    }
  }
}
