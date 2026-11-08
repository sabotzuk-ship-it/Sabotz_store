import { DOCUMENT } from '@angular/common';
import { computed, inject, Injectable, OnDestroy, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';

interface VisitorState {
  entered: boolean;
  tracking: boolean;
  welcomeEnabled: boolean;
}

interface PageView {
  viewId: string;
  path: string;
  milliseconds: number;
  visibleSince?: number;
}

@Injectable({ providedIn: 'root' })
export class VisitorAccessService implements OnDestroy {
  private readonly document = inject(DOCUMENT);
  private readonly router = inject(Router);
  private readonly path = signal('');
  private view?: PageView;
  private readonly navigation = this.router.events.subscribe(event => {
    if (event instanceof NavigationEnd) {
      const wasAdmin = this.isAdmin();
      this.path.set(event.urlAfterRedirects.split(/[?#]/, 1)[0]);
      if (wasAdmin && !this.isAdmin()) void this.load();
      else this.updateView();
    }
  });
  private readonly heartbeat = setInterval(() => {
    if (!this.document.hidden) this.flush();
  }, 15_000);

  readonly state = signal<VisitorState | null>(null);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly isAdmin = computed(() => this.path() === '/admin');
  readonly isStore = computed(() => Boolean(this.path()) && !this.isAdmin());

  constructor() {
    this.document.addEventListener('visibilitychange', this.onVisibility);
    this.document.defaultView?.addEventListener('pagehide', this.pauseView);
    this.document.defaultView?.addEventListener('pageshow', this.onVisibility);
    void this.load();
  }

  async load(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const response = await fetch('/api/visitors/session', { cache: 'no-store', signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error();
      this.state.set(await response.json() as VisitorState);
      this.updateView();
    } catch {
      this.error.set('Could not connect to the store. Please try again.');
    } finally {
      this.busy.set(false);
    }
  }

  async enter(email: string | null, tracking: boolean): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      this.flush();
      const response = await this.post('/api/visitors/entry', { email, tracking });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not open the store.');
      this.view = undefined;
      this.state.set(result as VisitorState);
      this.updateView();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Could not open the store.');
    } finally {
      this.busy.set(false);
    }
  }

  async stopTracking(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.view = undefined;
    try {
      const response = await this.post('/api/visitors/stop-tracking', {});
      if (!response.ok) throw new Error();
      this.state.update(value => value && { ...value, tracking: false });
    } catch {
      this.error.set('Could not save your privacy choice. Please try again.');
    } finally {
      this.busy.set(false);
    }
  }

  private updateView(): void {
    const path = this.path();
    if (this.view?.path === path) return;
    this.flush();
    this.view = undefined;
    if (!path || this.isAdmin() || !this.state()?.tracking) return;
    const viewId = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
    this.view = { viewId, path, milliseconds: 0 };
    this.onVisibility();
    this.flush();
  }

  private readonly pauseView = (): void => {
    this.flush();
    if (this.view) this.view.visibleSince = undefined;
  };

  private readonly onVisibility = (): void => {
    if (this.document.hidden) this.pauseView();
    else if (this.view && this.view.visibleSince === undefined) this.view.visibleSince = performance.now();
  };

  private flush(): void {
    const view = this.view;
    if (!view) return;
    if (view.visibleSince !== undefined) {
      const now = performance.now();
      view.milliseconds += now - view.visibleSince;
      view.visibleSince = now;
    }
    void this.post('/api/visitors/view', {
      viewId: view.viewId, path: view.path, seconds: Math.min(1800, Math.floor(view.milliseconds / 1000))
    }, true).catch(() => {});
  }

  private post(url: string, body: object, keepalive = false): Promise<Response> {
    return fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify(body), keepalive, signal: keepalive ? undefined : AbortSignal.timeout(8000)
    });
  }

  ngOnDestroy(): void {
    this.navigation.unsubscribe();
    clearInterval(this.heartbeat);
    this.document.removeEventListener('visibilitychange', this.onVisibility);
    this.document.defaultView?.removeEventListener('pagehide', this.pauseView);
    this.document.defaultView?.removeEventListener('pageshow', this.onVisibility);
  }
}
