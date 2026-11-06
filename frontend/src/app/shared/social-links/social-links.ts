import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-social-links',
  standalone: true,
  templateUrl: './social-links.html',
  styleUrl: './social-links.css'
})
export class SocialLinks {
  @Input() compact = false;
  @Input() stacked = false;
}
