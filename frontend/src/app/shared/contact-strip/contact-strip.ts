import { Component } from '@angular/core';
import { SocialLinks } from '../social-links/social-links';

@Component({
  selector: 'app-contact-strip',
  standalone: true,
  imports: [SocialLinks],
  templateUrl: './contact-strip.html',
  styleUrl: './contact-strip.css'
})
export class ContactStrip {}
