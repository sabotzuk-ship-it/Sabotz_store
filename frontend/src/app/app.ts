import { DOCUMENT } from '@angular/common';
import { Component, computed, effect, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterOutlet } from '@angular/router';
import { InteractionFeedback } from './shared/interaction-feedback/interaction-feedback';
import { VisitorAccessService } from './data/visitor-access.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, FormsModule],
  hostDirectives: [InteractionFeedback],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  readonly access = inject(VisitorAccessService);
  private readonly document = inject(DOCUMENT);
  private readonly welcome = viewChild<ElementRef<HTMLDialogElement>>('welcome');
  private readonly dismissed = signal(this.wasDismissed('sabotz-welcome-dismissed'));
  private readonly cookieDismissed = signal(this.wasDismissed('sabotz-cookie-choice-made'));
  private readonly showChoices = signal(false);
  private readonly showWelcome = computed(() => {
    const state = this.access.state();
    return this.access.isStore() && Boolean(state && !state.entered && !this.dismissed());
  });
  readonly showCookieBanner = computed(() => this.access.isStore() && !this.showWelcome() &&
    (this.showChoices() || Boolean(this.access.state() && !this.access.state()?.tracking && !this.cookieDismissed())));
  email = '';

  constructor() {
    effect(() => {
      const dialog = this.welcome()?.nativeElement;
      const show = this.showWelcome();
      if (show && dialog && !dialog.open) dialog.showModal();
      else if (!show && dialog?.open) dialog.close();
    });
  }

  async enter(): Promise<void> {
    await this.access.enter(this.email, false);
    if (!this.access.error() && this.access.state()?.entered) {
      this.email = '';
      this.dismiss();
    }
  }

  openChoices(): void {
    this.showChoices.set(true);
    if (!this.access.state()) void this.access.load();
  }

  openWelcome(): void {
    this.dismissed.set(false);
  }

  async acceptCookies(): Promise<void> {
    if (!this.access.state()?.tracking) await this.access.enter(null, true);
    if (!this.access.error() && this.access.state()?.tracking) this.dismissCookies();
  }

  async rejectCookies(): Promise<void> {
    if (this.access.state()?.tracking) await this.access.stopTracking();
    if (!this.access.state()?.tracking) this.dismissCookies();
  }

  dismiss(event?: Event): void {
    event?.preventDefault();
    this.dismissed.set(true);
    this.rememberDismissal('sabotz-welcome-dismissed');
  }

  private dismissCookies(): void {
    this.cookieDismissed.set(true);
    this.showChoices.set(false);
    this.rememberDismissal('sabotz-cookie-choice-made');
  }

  private rememberDismissal(key: string): void {
    try { this.document.defaultView?.sessionStorage.setItem(key, '1'); } catch { /* Browsing still works when storage is unavailable. */ }
  }

  private wasDismissed(key: string): boolean {
    try { return this.document.defaultView?.sessionStorage.getItem(key) === '1'; }
    catch { return false; }
  }
}
