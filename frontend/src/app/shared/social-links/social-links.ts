import { Component, Input, OnChanges } from '@angular/core';

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
  copyStatus = '';

  ngOnChanges(): void {
    this.copyStatus = '';
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
      if (this.message === message) this.copyStatus = 'Message copied. Paste it into your Instagram DM.';
    } catch {
      if (this.message === message) this.copyStatus = 'Copy the message below and paste it into your Instagram DM.';
    }
  }
}
