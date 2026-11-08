import { Directive, Input, OnChanges } from '@angular/core';

@Directive({
  selector: 'img[storeImage]',
  standalone: true,
  host: {
    '[attr.src]': 'src',
    '[attr.srcset]': 'srcset',
    '[attr.sizes]': 'storeImageSizes || null',
    '(error)': 'useOriginal()'
  }
})
export class StoreImage implements OnChanges {
  @Input({ required: true }) storeImage = '';
  @Input() storeImageSizes = '';
  @Input() storeImageWidth = 480;
  @Input() storeImageDetail = false;
  private fallback = false;

  ngOnChanges(): void {
    this.fallback = false;
  }

  get src(): string | null {
    if (!this.storeImage) return null;
    return this.canOptimize ? this.optimized(this.storeImageWidth) : this.storeImage;
  }

  get srcset(): string | null {
    if (!this.canOptimize || !this.storeImageSizes) return null;
    const widths = this.storeImageDetail ? [800, 1280, 1920] : [480, 800, 1280];
    return widths.map(width => `${this.optimized(width)} ${width}w`).join(', ');
  }

  useOriginal(): void {
    this.fallback = true;
  }

  private get canOptimize(): boolean {
    return !this.fallback && /^\/?assets\/images\/.*\.(?:jpe?g|png|webp)$/i.test(this.storeImage);
  }

  private optimized(width: number): string {
    return `/api/images/${width}?path=${encodeURIComponent(this.storeImage.replace(/^\//, ''))}&v=2`;
  }
}
