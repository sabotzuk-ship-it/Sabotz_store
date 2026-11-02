import { Injectable } from '@angular/core';
import { defaultSiteSettings, SiteSettings } from './site-settings.model';

@Injectable({ providedIn: 'root' })
export class SiteSettingsService {
  async getSettings(): Promise<SiteSettings> {
    const response = await fetch('/api/site-settings', { cache: 'no-store' });
    const body = await response.json().catch(() => ({})) as SiteSettings & { error?: string };
    if (!response.ok) throw new Error(body.error || 'Could not load site settings.');
    return body;
  }

  async saveSettings(settings: SiteSettings): Promise<SiteSettings> {
    const response = await fetch('/api/admin/site-settings', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify(settings)
    });
    const body = await response.json().catch(() => ({})) as SiteSettings & { error?: string };
    if (!response.ok) throw new Error(body.error || 'Could not save site settings.');
    return body;
  }
}
