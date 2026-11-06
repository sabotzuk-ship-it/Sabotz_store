import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Product, ProductPresentation } from '../../data/product.model';
import { ProductService } from '../../data/product.service';
import { SideNav } from '../../shared/side-nav/side-nav';
import { SiteSettingsService } from '../../data/site-settings.service';
import { defaultSiteSettings } from '../../data/site-settings.model';
import { SocialLinks } from '../../shared/social-links/social-links';

@Component({
  selector: 'app-product-page',
  standalone: true,
  imports: [CommonModule, RouterLink, SideNav, SocialLinks],
  templateUrl: './product.html',
  styleUrl: './product.css'
})
export class ProductPage implements OnInit {
  product?: Product;
  presentation: ProductPresentation = { collection: '', description: '' };
  selectedIndex = 0;
  error = '';
  backLink: string[] = ['/collection'];
  backLabel = 'COLLECTION';

  constructor(
    private readonly route: ActivatedRoute,
    private readonly products: ProductService,
    private readonly siteSettings: SiteSettingsService,
    private readonly changeDetector: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.route.paramMap.subscribe(params => void this.load(params.get('slug') ?? ''));
  }

  get selectedPhoto(): string {
    return this.product?.fotos[this.selectedIndex] ?? '';
  }

  formatPrice(price?: number): string {
    return this.products.formatPrice(price);
  }

  private async load(slug: string): Promise<void> {
    try {
      const [product, settings] = await Promise.all([
        this.products.getProduct(slug),
        this.siteSettings.getSettings().catch(() => defaultSiteSettings)
      ]);
      this.product = product;
      const category = settings.categories.find(item => item.name === product?.categoria);
      this.backLink = category ? ['/categories', category.id] : ['/collection'];
      this.backLabel = category?.title || 'COLLECTION';
      this.presentation = this.products.presentationFor(slug, this.product?.marca);
      this.selectedIndex = 0;
      this.error = this.product ? '' : 'Product not found.';
    } catch {
      this.error = 'Could not load product.';
    } finally {
      this.changeDetector.markForCheck();
    }
  }
}
