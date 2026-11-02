import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SiteSettingsService } from '../../data/site-settings.service';
import { defaultSiteSettings, SiteSettings } from '../../data/site-settings.model';
import { SideNav } from '../../shared/side-nav/side-nav';

@Component({
  selector: 'app-home-page',
  standalone: true,
  imports: [CommonModule, RouterLink, SideNav],
  templateUrl: './home.html',
  styleUrl: './home.css'
})
export class HomePage implements OnInit {
  settings: SiteSettings = structuredClone(defaultSiteSettings);

  constructor(private readonly siteSettings: SiteSettingsService, private readonly changeDetector: ChangeDetectorRef) {}

  categoryImageUrl(image: string): string {
    return image.startsWith('assets/') ? `/${image}` : `/assets/images/${image}`;
  }

  async ngOnInit(): Promise<void> {
    try {
      this.settings = await this.siteSettings.getSettings();
    } catch {
      this.settings = structuredClone(defaultSiteSettings);
    } finally {
      this.changeDetector.markForCheck();
    }
  }
}
