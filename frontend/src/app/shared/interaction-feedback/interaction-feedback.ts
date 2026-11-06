import { DOCUMENT } from '@angular/common';
import { Directive, Inject, NgZone, OnDestroy } from '@angular/core';

/** Delegated feedback also covers controls added after a route or filter change. */
@Directive({ selector: '[appInteractionFeedback]', standalone: true })
export class InteractionFeedback implements OnDestroy {
  private pressed?: Element;
  private started = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private readonly selector = 'a[href], button:not(:disabled), summary, input[type="submit"], input[type="button"]';

  private readonly down = (event: PointerEvent): void => {
    if (!event.isPrimary || event.button !== 0) return;
    const target = event.target instanceof Element ? event.target.closest(this.selector) : null;
    if (!target || target.matches('.menu-backdrop, [aria-disabled="true"], :disabled')) return;
    this.reset();
    this.pressed = target;
    this.started = Date.now();
    target.classList.add('soft-pressed');
  };

  private readonly up = (): void => {
    if (!this.pressed) return;
    // A brief minimum duration makes quick taps visible without delaying navigation.
    this.timer = setTimeout(() => this.reset(), Math.max(0, 170 - (Date.now() - this.started)));
  };

  private readonly cancel = (): void => this.reset();

  constructor(@Inject(DOCUMENT) private readonly document: Document, zone: NgZone) {
    zone.runOutsideAngular(() => {
      document.addEventListener('pointerdown', this.down, { passive: true, capture: true });
      document.addEventListener('pointerup', this.up, { passive: true, capture: true });
      document.addEventListener('pointercancel', this.cancel, { passive: true, capture: true });
      document.defaultView?.addEventListener('blur', this.cancel);
    });
  }

  private reset(): void {
    clearTimeout(this.timer);
    this.pressed?.classList.remove('soft-pressed');
    this.pressed = undefined;
    this.timer = undefined;
  }

  ngOnDestroy(): void {
    this.reset();
    this.document.removeEventListener('pointerdown', this.down, true);
    this.document.removeEventListener('pointerup', this.up, true);
    this.document.removeEventListener('pointercancel', this.cancel, true);
    this.document.defaultView?.removeEventListener('blur', this.cancel);
  }
}
