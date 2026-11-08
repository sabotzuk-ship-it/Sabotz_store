import { StoreImage } from '../../shared/store-image/store-image';
import { HomeProductCard } from '../../shared/home-product-card/home-product-card';
import { HomeSelection } from './selection/home-selection';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SiteSettingsService } from '../../data/site-settings.service';
import { defaultSiteSettings, SiteSettings } from '../../data/site-settings.model';
import { SideNav } from '../../shared/side-nav/side-nav';
import { Product } from '../../data/product.model';
import { ProductService } from '../../data/product.service';
import { SocialLinks } from '../../shared/social-links/social-links';
import { ContactStrip } from '../../shared/contact-strip/contact-strip';

@Component({
  selector: 'app-home-page',
  standalone: true,
  imports: [StoreImage, CommonModule, RouterLink, SideNav, HomeProductCard, HomeSelection, SocialLinks, ContactStrip],
  templateUrl: './home.html',
  styleUrl: './home.css'
})
export class HomePage implements OnInit {
  settings: SiteSettings = structuredClone(defaultSiteSettings);
  products: Product[] = [];
  productsLoading = true;
  productsError = '';
  readonly year = new Date().getFullYear();
  readonly categoryCoverSizes = '(max-width: 600px) calc(100vw - 36px), 350px';
  // The 3:2 shoes photo is scaled to cover the card height before its sides are cropped.
  readonly shoesCoverSizes = '(max-width: 600px) max(510px, calc(100vw - 36px)), (max-width: 849px) 540px, 720px';

  constructor(
    private readonly siteSettings: SiteSettingsService,
    private readonly productService: ProductService,
    private readonly changeDetector: ChangeDetectorRef
  ) {}

  get availableProducts(): Product[] {
    const availableCategories = new Set(this.settings.categories.filter(category => !category.comingSoon).map(category => category.name));
    return this.products.filter(product => availableCategories.has(product.categoria));
  }

  get latestProducts(): Product[] {
    // The API stores new products at the start of the catalogue.
    return this.availableProducts.slice(0, 4);
  }

  get selectedProducts(): Product[] {
    // Initial editorial selection; missing or unpublished products are omitted.
    const slugs = ['jordan-olive', 'glasses-oakley-purple', 'air-force-1-burgundy'];
    return slugs.flatMap(slug => {
      const product = this.availableProducts.find(item => this.productService.slugFor(item) === slug);
      return product ? [product] : [];
    });
  }

  categoryImageUrl(image: string): string {
    return image.startsWith('assets/') ? `/${image}` : `/assets/images/${image}`;
  }

  async ngOnInit(): Promise<void> {
    try {
      const [settings, products] = await Promise.allSettled([
        this.siteSettings.getSettings(),
        this.productService.getProducts()
      ]);
      if (settings.status === 'fulfilled') this.settings = settings.value;
      if (products.status === 'fulfilled') this.products = products.value;
      else this.productsError = 'The collection is temporarily unavailable. Please try again shortly.';
    } finally {
      this.productsLoading = false;
      this.changeDetector.markForCheck();
    }
  }
}
