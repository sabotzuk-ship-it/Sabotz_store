import { Injectable } from '@angular/core';

interface ApiError {
  error?: string;
}

@Injectable({ providedIn: 'root' })
export class AdminAuthService {
  async checkSession(): Promise<boolean> {
    const response = await fetch('/api/admin/session', {
      credentials: 'same-origin',
      signal: AbortSignal.timeout(10000)
    });
    return response.ok;
  }

  async login(username: string, password: string): Promise<void> {
    await this.request('/api/admin/login', {
      method: 'POST',
      headers: { ...this.jsonHeaders(), ...this.mutationHeaders() },
      body: JSON.stringify({ username, password })
    });
  }

  async logout(): Promise<void> {
    await this.request('/api/admin/logout', {
      method: 'POST',
      headers: this.mutationHeaders()
    });
  }

  private async request(url: string, init: RequestInit): Promise<void> {
    const response = await fetch(url, {
      ...init,
      credentials: 'same-origin',
      signal: AbortSignal.timeout(10000)
    });
    const body = await response.json().catch(() => ({})) as ApiError;
    if (!response.ok) throw new Error(body.error || 'The request could not be completed.');
  }

  private jsonHeaders(): Record<string, string> {
    return { 'Content-Type': 'application/json' };
  }

  private mutationHeaders(): Record<string, string> {
    return { 'X-Requested-With': 'XMLHttpRequest' };
  }
}
