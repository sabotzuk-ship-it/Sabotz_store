import { Injectable } from '@angular/core';
import { SiteSettings } from './site-settings.model';
import { readPublicStoreData } from './public-store-data';

@Injectable({ providedIn: 'root' })
export class SiteSettingsService {
  async getSettings(): Promise<SiteSettings> {
    const settings = await readPublicStoreData<SiteSettings>('/api/site-settings', '/data/site-settings.json');
    if (!Array.isArray(settings?.categories)) throw new Error('Invalid store settings.');
    return settings;
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
