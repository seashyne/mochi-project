// Parameterized HTTP client for Mochi API services

export interface ClientConfig {
  baseUrl: string;
  timeoutMs?: number;
  authToken?: string | null;
}

export class ApiClientError extends Error {
  public readonly status: number;
  public readonly details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.details = details;
  }
}

export function resolveDefaultApiUrl(): string {
  // Read Vite environment variable if available
  const envUrl = typeof import.meta !== 'undefined' && import.meta.env
    ? (import.meta.env.VITE_API_URL as string | undefined)
    : undefined;

  if (envUrl && envUrl.trim().length > 0) {
    return envUrl.trim().replace(/\/+$/, '');
  }

  // Staging / Production default on Lenout Cloudflare Workers infrastructure
  return 'https://api-game.lenout.com';
}

export class ApiClient {
  private baseUrl: string;
  private timeoutMs: number;
  private authToken: string | null = null;
  private onUnauthorizedHandler?: () => void;

  constructor(config?: Partial<ClientConfig>) {
    this.baseUrl = (config?.baseUrl || resolveDefaultApiUrl()).replace(/\/+$/, '');
    this.timeoutMs = config?.timeoutMs ?? 15000;
    this.authToken = config?.authToken ?? null;
  }

  public setOnUnauthorized(handler?: () => void): void {
    this.onUnauthorizedHandler = handler;
  }

  public setToken(token: string | null): void {
    this.authToken = token;
  }

  public getToken(): string | null {
    return this.authToken;
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  public setBaseUrl(url: string): void {
    this.baseUrl = url.replace(/\/+$/, '');
  }

  public async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const cleanPath = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = `${this.baseUrl}${cleanPath}`;

    const headers = new Headers(options.headers || {});
    if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }
    if (this.authToken && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${this.authToken}`);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal
      });

      if (!response.ok) {
        if (response.status === 401) {
          this.authToken = null;
          try {
            this.onUnauthorizedHandler?.();
          } catch {
            // Ignore error in callback
          }
        }
        let errorData: unknown;
        try {
          errorData = await response.json();
        } catch {
          errorData = await response.text();
        }
        const errorMsg =
          typeof errorData === 'object' && errorData !== null && 'error' in errorData
            ? String((errorData as { error: unknown }).error)
            : `API Request failed with status ${response.status}`;
        throw new ApiClientError(errorMsg, response.status, errorData);
      }

      // Handle 204 No Content
      if (response.status === 204) {
        return null as T;
      }

      return (await response.json()) as T;
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        throw err;
      }
      if (err instanceof Error && err.name === 'AbortError') {
        throw new ApiClientError(`Request timeout after ${this.timeoutMs}ms`, 408);
      }
      const message = err instanceof Error ? err.message : 'Unknown network error';
      throw new ApiClientError(message, 0);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  public get<T>(path: string, options?: RequestInit): Promise<T> {
    return this.request<T>(path, { ...options, method: 'GET' });
  }

  public post<T>(path: string, body?: unknown, options?: RequestInit): Promise<T> {
    return this.request<T>(path, {
      ...options,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined
    });
  }

  public put<T>(path: string, body?: unknown, options?: RequestInit): Promise<T> {
    return this.request<T>(path, {
      ...options,
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined
    });
  }

  public patch<T>(path: string, body?: unknown, options?: RequestInit): Promise<T> {
    return this.request<T>(path, {
      ...options,
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined
    });
  }

  public delete<T>(path: string, options?: RequestInit): Promise<T> {
    return this.request<T>(path, { ...options, method: 'DELETE' });
  }
}

export const defaultApiClient = new ApiClient();
