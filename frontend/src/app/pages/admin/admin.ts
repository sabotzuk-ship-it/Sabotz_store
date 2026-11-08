import { StoreImage } from '../../shared/store-image/store-image';
import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AdminAuthService } from '../../data/admin-auth.service';
import { CustomerOrder } from '../../data/order.model';
import { Product } from '../../data/product.model';
import { ProductService } from '../../data/product.service';
import { StoreCategory, SiteSettings, defaultSiteSettings } from '../../data/site-settings.model';
import { SiteSettingsService } from '../../data/site-settings.service';
import { VisitorReport } from './visitor-report/visitor-report';

@Component({
  selector: 'app-admin-page',
  standalone: true,
  imports: [StoreImage, CommonModule, FormsModule, RouterLink, VisitorReport],
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
  ordersError = '';
  settingsError = '';
  settingsSaved = false;
  categoryPendingDelete?: StoreCategory;
  settings: SiteSettings = structuredClone(defaultSiteSettings);
  newCategory: { name: string; subtitle: string; image: string; comingSoon: boolean; imageFile?: File; imagePreview?: string } = {
    name: '', subtitle: '', image: 'accessories.jpg', comingSoon: true
  };
  products: Product[] = [];
  catalogueCategory = '';
  catalogueSearch = '';
  orders: CustomerOrder[] = [];
  activeSection: 'products' | 'orders' | 'settings' | 'visitors' = 'products';
  photos: { url: string; file?: File }[] = [];
  selectedPreviewIndex = 0;
  private draggedPhotoIndex: number | null = null;
  photoDropIndex: number | null = null;
  editingId = '';
  form = this.emptyForm();

  constructor(
    private readonly auth: AdminAuthService,
    private readonly productService: ProductService,
    private readonly siteSettings: SiteSettingsService,
    private readonly changeDetector: ChangeDetectorRef
  ) {}

  async ngOnInit(): Promise<void> {
    try {
      const authenticated = await this.auth.checkSession();
      if (!this.loginInProgress) this.loggedIn = authenticated;
      if (this.loggedIn) await Promise.all([this.loadProducts(), this.loadOrders(), this.loadSiteSettings()]);
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
      await Promise.all([this.loadProducts(), this.loadOrders(), this.loadSiteSettings()]);
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
      this.orders = [];
      this.releaseCategoryPreviews();
      this.settings = structuredClone(defaultSiteSettings);
      this.cancelEdit();
      this.changeDetector.markForCheck();
    }
  }

  ngOnDestroy(): void {
    this.releaseImagePreviews();
    this.releaseCategoryPreviews();
  }

  photoUrl(photo: string): string {
    return /^https?:\/\//i.test(photo) || photo.startsWith('/') ? photo : `/${photo}`;
  }

  get catalogueProducts(): Product[] {
    const search = this.catalogueSearch.trim().toLowerCase();
    return this.products.filter(product =>
      (!this.catalogueCategory || product.categoria === this.catalogueCategory) &&
      (product.nome.toLowerCase().includes(search) || product.marca.toLowerCase().includes(search))
    );
  }

  get selectedPreview(): string | undefined {
    const photo = this.photos[this.selectedPreviewIndex];
    return photo ? this.photoPreview(photo) : undefined;
  }

  photoPreview(photo: { url: string; file?: File }): string {
    return photo.file ? photo.url : this.photoUrl(photo.url);
  }

  get previewPrice(): string {
    const amount = this.form.price;
    return amount !== null && Number.isFinite(amount)
      ? this.productService.formatPrice(amount)
      : 'Price on request';
  }

  selectPreview(index: number): void {
    this.selectedPreviewIndex = index;
  }

  removeImage(index: number): void {
    if (this.busy || !this.photos[index]) return;
    const currentSelection = this.selectedPreviewIndex;
    const [photo] = this.photos.splice(index, 1);
    if (photo.file) URL.revokeObjectURL(photo.url);
    if (index < currentSelection) this.selectedPreviewIndex = currentSelection - 1;
    else if (index === currentSelection) this.selectedPreviewIndex = Math.min(index, Math.max(0, this.photos.length - 1));
    this.changeDetector.markForCheck();
  }

  moveSelectedPhoto(direction: -1 | 1): void {
    this.movePhoto(this.selectedPreviewIndex, this.selectedPreviewIndex + direction);
  }

  startPhotoDrag(event: DragEvent, index: number): void {
    if (this.busy || !event.dataTransfer) {
      event.preventDefault();
      return;
    }
    this.draggedPhotoIndex = index;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(index));
  }

  dragOverPhoto(event: DragEvent, index: number): void {
    if (this.busy || this.draggedPhotoIndex === null) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    this.photoDropIndex = index;
  }

  dropPhoto(event: DragEvent, index: number): void {
    if (this.draggedPhotoIndex === null) return;
    event.preventDefault();
    this.movePhoto(this.draggedPhotoIndex, index);
    this.endPhotoDrag();
  }

  endPhotoDrag(): void {
    this.draggedPhotoIndex = null;
    this.photoDropIndex = null;
  }

  private movePhoto(from: number, to: number): void {
    if (this.busy || !this.photos[from] || !this.photos[to]) return;
    const [photo] = this.photos.splice(from, 1);
    this.photos.splice(to, 0, photo);
    this.selectedPreviewIndex = to;
  }

  formatPrice(price?: number): string {
    return this.productService.formatPrice(price);
  }

  formatOrderDate(date: string): string {
    const parsed = new Date(date);
    return Number.isNaN(parsed.getTime()) ? date : new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(parsed);
  }

  categoryLabel(category: StoreCategory): string {
    return category.title;
  }

  categoryImageUrl(image: string): string {
    return image.startsWith('assets/') ? `/${image}` : `/assets/images/${image}`;
  }

  categoryHasProducts(category: StoreCategory): boolean {
    return this.products.some(product => product.categoria === category.name);
  }

  categoryProductCount(category: StoreCategory): number {
    return this.products.filter(product => product.categoria === category.name).length;
  }

  selectNewCategoryImage(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!this.isSupportedImage(file) || file.size > 5 * 1024 * 1024) {
      this.settingsError = 'Choose a JPG, PNG, WebP or GIF image up to 5 MB.';
      return;
    }
    if (this.newCategory.imagePreview) URL.revokeObjectURL(this.newCategory.imagePreview);
    this.newCategory.imageFile = file;
    this.newCategory.imagePreview = URL.createObjectURL(file);
    this.settingsError = '';
  }

  selectCategoryImage(event: Event, category: StoreCategory): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!this.isSupportedImage(file) || file.size > 5 * 1024 * 1024) {
      this.settingsError = 'Choose a JPG, PNG, WebP or GIF image up to 5 MB.';
      return;
    }
    if (category.imagePreview) URL.revokeObjectURL(category.imagePreview);
    category.imageFile = file;
    category.imagePreview = URL.createObjectURL(file);
    this.settingsSaved = false;
    this.settingsError = '';
  }

  addCategory(): void {
    const name = this.newCategory.name.trim();
    const slug = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!name || !slug) {
      this.settingsError = 'Enter a valid category name.';
      return;
    }
    if (this.settings.categories.some(category => category.name.toLowerCase() === name.toLowerCase() || category.id === slug)) {
      this.settingsError = 'A category with this name already exists.';
      return;
    }
    if (this.settings.categories.length >= 12) {
      this.settingsError = 'You can have up to 12 categories.';
      return;
    }
    const title = name.toUpperCase();
    this.settings.categories = [...this.settings.categories, {
      id: slug,
      name,
      title,
      subtitle: this.newCategory.subtitle.trim() || `EXPLORE ${title}`,
      image: this.newCategory.image,
      comingSoon: this.newCategory.comingSoon,
      imageFile: this.newCategory.imageFile,
      imagePreview: this.newCategory.imagePreview
    }];
    this.newCategory = { name: '', subtitle: '', image: 'accessories.jpg', comingSoon: true };
    this.settingsSaved = false;
    this.settingsError = '';
  }

  removeCategory(category: StoreCategory): void {
    if (this.categoryHasProducts(category)) {
      this.settingsError = `First move or delete the products in category ${category.name}.`;
      return;
    }
    this.categoryPendingDelete = category;
  }

  cancelCategoryDelete(): void {
    this.categoryPendingDelete = undefined;
  }

  confirmCategoryDelete(): void {
    const category = this.categoryPendingDelete;
    if (!category) return;
    if (category.imagePreview) URL.revokeObjectURL(category.imagePreview);
    this.settings.categories = this.settings.categories.filter(item => item.id !== category.id);
    this.categoryPendingDelete = undefined;
    this.settingsSaved = false;
    this.settingsError = '';
  }

  async saveSiteSettings(): Promise<void> {
    this.busy = true;
    this.settingsError = '';
    this.settingsSaved = false;
    try {
      const categories = this.settings.categories;
      const files = categories.flatMap(category => category.imageFile ? [category.imageFile] : []);
      const uploadedImages = files.length ? await this.productService.uploadProductImages(files) : [];
      let uploadIndex = 0;
      const settingsToSave: SiteSettings = {
        categories: categories.map(category => ({
          id: category.id,
          name: category.name,
          title: category.title,
          subtitle: category.subtitle,
          image: category.imageFile ? uploadedImages[uploadIndex++] : category.image,
          comingSoon: category.comingSoon
        }))
      };
      const savedSettings = await this.siteSettings.saveSettings(settingsToSave);
      categories.forEach(category => {
        if (category.imagePreview) URL.revokeObjectURL(category.imagePreview);
      });
      this.settings = savedSettings;
      this.settingsSaved = true;
    } catch (error) {
      this.settingsError = error instanceof Error ? error.message : 'Could not save site settings.';
    } finally {
      this.busy = false;
      this.changeDetector.markForCheck();
    }
  }

  selectImages(event: Event): void {
    const input = event.target as HTMLInputElement;
    const incoming = Array.from(input.files ?? []);
    input.value = '';
    if (this.busy) return;
    const availableSlots = Math.max(0, 20 - this.photos.length);
    const accepted = incoming.filter(file => this.isSupportedImage(file) && file.size <= 5 * 1024 * 1024);
    const selected = accepted.slice(0, availableSlots);

    if (accepted.length !== incoming.length) {
      this.loadError = 'Use JPG, PNG, WebP or GIF files up to 5 MB each.';
    } else if (selected.length !== incoming.length) {
      this.loadError = 'Each product can have up to 20 photos.';
    } else {
      this.loadError = '';
    }

    if (selected.length) {
      this.selectedPreviewIndex = this.photos.length;
      this.photos.push(...selected.map(file => ({ file, url: URL.createObjectURL(file) })));
    }
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
      price: product.preco ?? null
    };
    this.photos = product.fotos.map(url => ({ url }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async save(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.loadError = '';
    try {
      if (!this.form.name.trim() || !this.form.brand.trim()) {
        throw new Error('Enter the product name and brand.');
      }

      if (!this.photos.length) throw new Error('Add at least one product photo.');
      const files = this.photos.flatMap(photo => photo.file ? [photo.file] : []);
      if (files.length) {
        const uploaded = await this.productService.uploadProductImages(files);
        if (uploaded.length !== files.length) throw new Error('Some photos could not be uploaded. Please try again.');
        let index = 0;
        this.photos = this.photos.map(photo => {
          if (!photo.file) return photo;
          URL.revokeObjectURL(photo.url);
          return { url: uploaded[index++] };
        });
      }

      const product: Omit<Product, 'pagina'> = {
        id: this.editingId,
        nome: this.form.name.trim(),
        marca: this.form.brand.trim(),
        categoria: this.form.category,
        status: this.form.status.trim(),
        preco: this.form.price === null ? undefined : Number(this.form.price),
        fotos: this.photos.map(photo => photo.url)
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
    if (!window.confirm(`Delete ${product.nome}?`)) return;
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

  async loadOrders(): Promise<void> {
    try {
      const response = await fetch('/api/admin/orders', { credentials: 'same-origin', cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not load customer orders.');
      this.orders = (Array.isArray(body) ? body : []) as CustomerOrder[];
      this.ordersError = '';
    } catch (error) {
      this.ordersError = error instanceof Error ? error.message : 'Could not load customer orders.';
    } finally {
      this.changeDetector.markForCheck();
    }
  }

  private async loadSiteSettings(): Promise<void> {
    try {
      this.settings = await this.siteSettings.getSettings();
      this.settingsError = '';
    } catch (error) {
      this.settingsError = error instanceof Error ? error.message : 'Could not load site settings.';
    } finally {
      this.changeDetector.markForCheck();
    }
  }

  private releaseCategoryPreviews(): void {
    this.settings.categories.forEach(category => {
      if (category.imagePreview) URL.revokeObjectURL(category.imagePreview);
    });
    if (this.newCategory.imagePreview) URL.revokeObjectURL(this.newCategory.imagePreview);
  }

  private emptyForm() {
    return { name: '', brand: '', status: 'GALLERY PREVIEW', category: 'Shoes', price: null as number | null };
  }

  private isSupportedImage(file: File): boolean {
    return ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type);
  }

  private clearSelectedImages(): void {
    this.endPhotoDrag();
    this.releaseImagePreviews();
    this.photos = [];
  }

  private releaseImagePreviews(): void {
    for (const photo of this.photos) {
      if (photo.file) URL.revokeObjectURL(photo.url);
    }
  }
}
