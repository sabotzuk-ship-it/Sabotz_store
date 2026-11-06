import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { defaultSiteSettings, SiteSettings } from '../../data/site-settings.model';
import { SiteSettingsService } from '../../data/site-settings.service';
import { SocialLinks } from '../social-links/social-links';

@Component({
  selector: 'app-side-nav',
  standalone: true,
  imports: [CommonModule, RouterLink, SocialLinks],
  templateUrl: './side-nav.html',
  styleUrl: './side-nav.css'
})
export class SideNav implements OnInit {
  open = false;

  settings: SiteSettings = structuredClone(defaultSiteSettings);

  constructor(private readonly siteSettings: SiteSettingsService, private readonly changeDetector: ChangeDetectorRef) {}

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
