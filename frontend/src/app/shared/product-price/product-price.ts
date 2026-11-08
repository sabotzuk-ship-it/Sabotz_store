import { Component, computed, inject, input } from '@angular/core';
import { ProductService } from '../../data/product.service';

@Component({
  selector: 'app-product-price',
  template: `
    @if (salePrice(); as sale) {
      <del><span class="visually-hidden">Original price </span>{{ originalPrice() }}</del>
      <span><span class="visually-hidden">Sale price </span>{{ sale }}</span>
    } @else {
      {{ originalPrice() || fallback() }}
    }
  `,
  styles: `
    :host { display: inline-flex; flex-wrap: wrap; align-items: baseline; gap: .5em; }
    del { opacity: .7; font-size: .8em; font-weight: 400; }
    .visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  `
})
export class ProductPrice {
  private readonly products = inject(ProductService);
  readonly price = input<number | null>();
  readonly discount = input<number | null>();
  readonly fallback = input('');

  readonly originalPrice = computed(() => this.products.formatPrice(this.price() ?? undefined));
  readonly salePrice = computed(() => {
    const price = this.price();
    const discount = this.discount();
    if (!price || !discount || !Number.isInteger(discount) || discount < 1 || discount > 100) return '';
    const pence = Math.round(price * 100);
    const salePence = Math.round(pence * (100 - discount) / 100);
    return salePence < pence ? this.products.formatPrice(salePence / 100) : '';
  });
}
