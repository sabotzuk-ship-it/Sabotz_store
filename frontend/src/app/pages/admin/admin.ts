import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AdminAuthService } from '../../data/admin-auth.service';
import { Product } from '../../data/product.model';
import { ProductService } from '../../data/product.service';

@Component({
  selector: 'app-admin-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './admin.html',
  styleUrl: './admin.css'
})
export class AdminPage implements OnInit, OnDestroy {
  loggedIn = false;
  checkingSession = true;
  loginInProgress = false;
  busy = false;
  username = '';
  password = '';
  loginError = '';
  loadError = '';
  products: Product[] = [];
  savedPhotos: string[] = [];
  imageFiles: File[] = [];
  imagePreviews: string[] = [];
  selectedPreviewIndex = 0;
  editingId = '';
  form = this.emptyForm();

  constructor(
    private readonly auth: AdminAuthService,
    private readonly productService: ProductService,
    private readonly changeDetector: ChangeDetectorRef
  ) {}

  async ngOnInit(): Promise<void> {
    try {
      const authenticated = await this.auth.checkSession();
      if (!this.loginInProgress) this.loggedIn = authenticated;
      if (this.loggedIn) await this.loadProducts();
    } catch {
      this.loadError = 'Server unavailable. Check that npm start is running.';
    } finally {
      this.checkingSession = false;
      this.changeDetector.markForCheck();
    }
  }

  async login(): Promise<void> {
    this.loginInProgress = true;
    this.busy = true;
    this.loginError = '';
    try {
      await this.auth.login(this.username.trim(), this.password);
      this.password = '';
      this.loggedIn = true;
      await this.loadProducts();
    } catch (error) {
      this.loginError = error instanceof Error ? error.message : 'Could not sign in.';
    } finally {
      this.loginInProgress = false;
      this.busy = false;
      this.changeDetector.markForCheck();
    }
  }

  async logout(): Promise<void> {
    try {
      await this.auth.logout();
    } finally {
      this.loggedIn = false;
      this.products = [];
      this.cancelEdit();
      this.changeDetector.markForCheck();
    }
  }

  ngOnDestroy(): void {
    this.releaseImagePreviews();
  }

  get previewImages(): string[] {
    const savedPhotos = this.savedPhotos
      .map(photo => /^https?:\/\//i.test(photo) || photo.startsWith('/') ? photo : `/${photo}`);
    return [...savedPhotos, ...this.imagePreviews];
  }

  get selectedPreview(): string | undefined {
    return this.previewImages[this.selectedPreviewIndex] ?? this.previewImages[0];
  }

  get previewPrice(): string {
    const amount = this.form.price;
    return amount !== null && Number.isFinite(amount)
      ? this.productService.formatPrice(amount)
      : 'Preço a definir';
  }

  selectPreview(index: number): void {
    this.selectedPreviewIndex = index;
  }

  removeImage(index: number): void {
    const currentSelection = this.selectedPreviewIndex;
    if (index < this.savedPhotos.length) {
      this.savedPhotos.splice(index, 1);
    } else {
      const fileIndex = index - this.savedPhotos.length;
      const preview = this.imagePreviews[fileIndex];
      if (preview) URL.revokeObjectURL(preview);
      this.imagePreviews.splice(fileIndex, 1);
      this.imageFiles.splice(fileIndex, 1);
    }
    if (index < currentSelection) this.selectedPreviewIndex = currentSelection - 1;
    else if (index === currentSelection) this.selectedPreviewIndex = Math.min(index, Math.max(0, this.previewImages.length - 1));
    this.changeDetector.markForCheck();
  }

  formatPrice(price?: number): string {
    return this.productService.formatPrice(price);
  }

  selectImages(event: Event): void {
    const input = event.target as HTMLInputElement;
    const incoming = Array.from(input.files ?? []);
    input.value = '';
    const savedCount = this.savedPhotos.length;
    const availableSlots = Math.max(0, 20 - savedCount - this.imageFiles.length);
    const accepted = incoming.filter(file => this.isSupportedImage(file) && file.size <= 5 * 1024 * 1024);
    const selected = accepted.slice(0, availableSlots);

    if (accepted.length !== incoming.length) {
      this.loadError = 'Use arquivos JPG, PNG, WebP ou GIF de até 5 MB cada.';
    } else if (selected.length !== incoming.length) {
      this.loadError = 'Cada produto pode ter no máximo 20 fotos.';
    } else {
      this.loadError = '';
    }

    this.imageFiles = [...this.imageFiles, ...selected];
    this.imagePreviews = [...this.imagePreviews, ...selected.map(file => URL.createObjectURL(file))];
    this.selectedPreviewIndex = Math.max(0, this.previewImages.length - selected.length);
    this.changeDetector.markForCheck();
  }

  edit(product: Product): void {
    this.clearSelectedImages();
    this.selectedPreviewIndex = 0;
    this.editingId = product.id;
    this.form = {
      name: product.nome,
      brand: product.marca,
      status: product.status,
      category: product.categoria,
      price: product.preco ?? null,
      slug: this.productService.slugFor(product)
    };
    this.savedPhotos = [...product.fotos];
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async save(): Promise<void> {
    this.busy = true;
    this.loadError = '';
    try {
      if (!this.form.name.trim() || !this.form.brand.trim() || !this.form.slug.trim()) {
        throw new Error('Preencha nome, marca e slug do produto.');
      }

      if (this.imageFiles.length) {
        const uploaded = await this.productService.uploadProductImages(this.imageFiles);
        this.savedPhotos = [...this.savedPhotos, ...uploaded];
        this.clearSelectedImages();
      }

      if (!this.savedPhotos.length) throw new Error('Adicione pelo menos uma foto ao produto.');

      const product: Product = {
        id: this.editingId,
        nome: this.form.name.trim(),
        marca: this.form.brand.trim(),
        categoria: this.form.category,
        status: this.form.status.trim(),
        preco: this.form.price === null ? undefined : Number(this.form.price),
        fotos: [...this.savedPhotos],
        pagina: `products/${this.form.slug.trim().toLowerCase()}.html`
      };
      this.products = await this.productService.saveProduct(product, Boolean(this.editingId));
      this.cancelEdit();
    } catch (error) {
      this.loadError = error instanceof Error ? error.message : 'Could not save the product.';
    } finally {
      this.busy = false;
      this.changeDetector.markForCheck();
    }
  }

  async remove(product: Product): Promise<void> {
    if (!window.confirm(`Excluir ${product.nome}?`)) return;
    this.busy = true;
    this.loadError = '';
    try {
      this.products = await this.productService.removeProduct(product.id);
    } catch (error) {
      this.loadError = error instanceof Error ? error.message : 'Could not delete the product.';
    } finally {
      this.busy = false;
      this.changeDetector.markForCheck();
    }
  }

  cancelEdit(): void {
    this.editingId = '';
    this.savedPhotos = [];
    this.clearSelectedImages();
    this.form = this.emptyForm();
    this.selectedPreviewIndex = 0;
  }

  private async loadProducts(): Promise<void> {
    try {
      this.products = await this.productService.getProducts();
      this.loadError = '';
    } catch (error) {
      this.loadError = error instanceof Error ? error.message : 'Could not load the product catalogue.';
    } finally {
      this.changeDetector.markForCheck();
    }
  }

  private emptyForm() {
    return { name: '', brand: '', status: 'GALLERY PREVIEW', category: 'Shoes', price: null as number | null, slug: '' };
  }

  private isSupportedImage(file: File): boolean {
    return ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type);
  }

  private clearSelectedImages(): void {
    this.releaseImagePreviews();
    this.imageFiles = [];
    this.imagePreviews = [];
  }

  private releaseImagePreviews(): void {
    this.imagePreviews.forEach(url => URL.revokeObjectURL(url));
  }
}
