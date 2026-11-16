import { Component, Input, OnChanges, signal } from '@angular/core';

@Component({
  selector: 'app-social-links',
  standalone: true,
  templateUrl: './social-links.html',
  styleUrl: './social-links.css'
})
export class SocialLinks implements OnChanges {
  @Input() compact = false;
  @Input() stacked = false;
  @Input() message = '';
  @Input() requireMessage = false;
  readonly copyStatus = signal('');

  ngOnChanges(): void {
    this.copyStatus.set('');
  }

  get whatsappHref(): string | null {
    if (this.requireMessage && !this.message) return null;
    const base = 'https://wa.me/447732267215';
    return this.message ? base + '?text=' + encodeURIComponent(this.message) : base;
  }

  get instagramHref(): string | null {
    return this.requireMessage && !this.message ? null : 'https://www.instagram.com/sabotz.clothing/';
  }

  async copyInstagramMessage(): Promise<void> {
    const message = this.message;
    if (!message) return;
    try {
      await navigator.clipboard.writeText(message);
      if (this.message === message) this.copyStatus.set('Message copied. Paste it into your Instagram DM.');
    } catch {
      if (this.message === message) this.copyStatus.set('Select and copy the message below, then paste it into your Instagram DM.');
    }
  }
}
