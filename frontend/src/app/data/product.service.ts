import { Injectable } from '@angular/core';
import { Product, ProductPresentation } from './product.model';

const presentations: Record<string, ProductPresentation> = {
  'jordan-olive': { collection: 'JORDAN COLLECTION', description: 'Gallery preview featuring a low-top sneaker design in black, white and olive tones. Explore the images to view the design from different angles.' },
  'reverse-mocha': { collection: 'JORDAN COLLECTION', description: 'Low-top sneaker design featuring brown, white and cream tones. Select a photo to explore different angles.' },
  'jordan-travis-pink': { collection: 'JORDAN COLLECTION', description: 'Gallery preview featuring a low-top sneaker design in pink, white and cream tones. Explore the images to view the design from different angles.' },
  'air-force-1-13': { collection: 'NIKE AIR FORCE 1 COLLECTION', description: 'Gallery preview featuring a low-top sneaker design in black and grey tones with glossy details. Explore the images to view the design from different angles.' },
  'air-force-1-burgundy': { collection: 'AIR FORCE  COLLECTION', description: 'Gallery preview featuring a low-top sneaker design in deep burgundy tones with glossy panels and gold accents. Explore the images to view the design from different angles.' },
  'air-max-95-neon': { collection: 'JORDAN COLLECTION', description: 'Gallery preview featuring an Air Max 95 design in grey, black and neon green tones with visible Air cushioning. Explore the images to view the design from different angles.' },
  'air-max-95-red': { collection: 'NIKE AIR MAX 95 COLLECTION', description: 'Gallery preview featuring an Air Max 95 design in white, grey, black and red tones with visible Air cushioning. Explore the images to view the design from different angles.' }
};

@Injectable({ providedIn: 'root' })
export class ProductService {
  private catalogPromise?: Promise<Product[]>;

  formatPrice(price?: number): string {
    if (price === undefined || !Number.isFinite(price)) return '';
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR' }).format(price);
  }

  getProducts(): Promise<Product[]> {
    if (!this.catalogPromise) this.catalogPromise = this.request<Product[]>('/api/products');
    return this.catalogPromise;
  }

  async getProduct(slug: string): Promise<Product | undefined> {
    return (await this.getProducts()).find(product => this.slugFor(product) === slug);
  }

  presentationFor(slug: string, brand = 'NIKE'): ProductPresentation {
    return presentations[slug] ?? {
      collection: `${brand.toUpperCase()} COLLECTION`,
      description: 'Explore the product gallery to view this design from different angles.'
    };
  }

  slugFor(product: Product): string {
    return product.pagina.replace(/^products\//, '').replace(/\.html$/, '');
  }

  async saveProduct(product: Product, isEditing: boolean): Promise<Product[]> {
    const endpoint = isEditing ? `/api/admin/products/${encodeURIComponent(product.id)}` : '/api/admin/products';
    const savedProducts = await this.request<Product[]>(endpoint, {
      method: isEditing ? 'PUT' : 'POST',
      headers: this.mutationHeaders(),
      body: JSON.stringify(product)
    });
    this.catalogPromise = Promise.resolve(savedProducts);
    return savedProducts;
  }

  async uploadProductImages(files: File[]): Promise<string[]> {
    const formData = new FormData();
    files.forEach(file => formData.append('images', file));
    const response = await fetch('/api/admin/uploads', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
      body: formData,
      signal: AbortSignal.timeout(30000)
    });
    const result = await response.json().catch(() => ({})) as { fotos?: string[]; error?: string };
    if (!response.ok) throw new Error(result.error || 'Could not upload product images.');
    return result.fotos ?? [];
  }

  async removeProduct(id: string): Promise<Product[]> {
    const products = await this.request<Product[]>(`/api/admin/products/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: this.mutationHeaders()
    });
    this.catalogPromise = Promise.resolve(products);
    return products;
  }

  mutationHeaders(): Record<string, string> {
    return { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
  }

  private async request<T>(url: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(url, {
      ...init,
      credentials: 'same-origin',
      signal: AbortSignal.timeout(10000)
    });
    const body = await response.json().catch(() => ({})) as { error?: string } & T;
    if (!response.ok) throw new Error(body.error || 'The request could not be completed.');
    return body as T;
  }
}
