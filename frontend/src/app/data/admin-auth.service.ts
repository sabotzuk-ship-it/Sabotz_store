import { Injectable } from '@angular/core';

interface ApiError {
  error?: string;
  authenticated?: boolean;
}

@Injectable({ providedIn: 'root' })
export class AdminAuthService {
  async checkSession(): Promise<boolean> {
    const response = await fetch('/api/admin/session', {
      credentials: 'same-origin',
      cache: 'no-store',
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) return false;
    return (await this.readSession(response))?.authenticated === true;
  }

  async login(username: string, password: string): Promise<void> {
    await this.request('/api/admin/login', true, {
      method: 'POST',
      headers: { ...this.jsonHeaders(), ...this.mutationHeaders() },
      body: JSON.stringify({ username, password })
    });
  }

  async logout(): Promise<void> {
    await this.request('/api/admin/logout', false, {
      method: 'POST',
      headers: this.mutationHeaders()
    });
  }

  private async request(url: string, authenticated: boolean, init: RequestInit): Promise<void> {
    const response = await fetch(url, {
      ...init,
      credentials: 'same-origin',
      signal: AbortSignal.timeout(10000)
    });
    const body = await this.readSession(response);
    if (!response.ok) throw new Error(body?.error || 'The request could not be completed.');
    if (body?.authenticated !== authenticated) throw new Error('The admin server is unavailable.');
  }

  private async readSession(response: Response): Promise<ApiError | null> {
    if (!response.headers.get('content-type')?.includes('application/json')) return null;
    return response.json().catch(() => null);
  }

  private jsonHeaders(): Record<string, string> {
    return { 'Content-Type': 'application/json' };
  }

  private mutationHeaders(): Record<string, string> {
    return { 'X-Requested-With': 'XMLHttpRequest' };
  }
}
