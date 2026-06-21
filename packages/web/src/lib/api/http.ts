import { getApiBaseUrl } from './config';

/**
 * Thin fetch wrapper for backend endpoints.
 *
 * Usage (inside a facade method):
 *   if (USE_MOCK) return mockImpl();
 *   return httpGet<Saga[]>('/sagas');
 *
 * Design:
 *   - baseUrl unified via config.getApiBaseUrl()
 *   - errors unified — non-2xx throws ApiError
 *   - no runtime validation (trust the backend contract via TS types)
 *   - cache defaults to 'no-store' — facades usually pull dynamic data; callers wrap their own cache
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly endpoint: string,
    message: string
  ) {
    super(`[${status}] ${endpoint}: ${message}`);
    this.name = 'ApiError';
  }
}

interface HttpOptions {
  /** Whether to enable the Next.js fetch cache. Defaults to 'no-store' (fresh each time). */
  cache?: RequestCache;
  /** Next.js revalidate seconds. */
  revalidate?: number;
  /** Extra headers. */
  headers?: Record<string, string>;
  /** Query params — auto-encoded into the URL. */
  query?: Record<string, string | number | boolean | undefined | null>;
}

function buildUrl(endpoint: string, query?: HttpOptions['query']): string {
  const base = getApiBaseUrl().replace(/\/$/, '');
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  let url = `${base}${path}`;
  if (query) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v == null) continue;
      params.set(k, String(v));
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }
  return url;
}

async function parseOrThrow<T>(res: Response, endpoint: string): Promise<T> {
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const body = await res.text();
      if (body) msg = body.slice(0, 300);
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, endpoint, msg);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function httpGet<T>(endpoint: string, opts: HttpOptions = {}): Promise<T> {
  const url = buildUrl(endpoint, opts.query);
  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json', ...(opts.headers ?? {}) },
    cache: opts.cache ?? 'no-store',
    next: opts.revalidate != null ? { revalidate: opts.revalidate } : undefined,
  });
  return parseOrThrow<T>(res, endpoint);
}

export async function httpPost<T>(
  endpoint: string,
  body: unknown,
  opts: HttpOptions = {}
): Promise<T> {
  const url = buildUrl(endpoint, opts.query);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(opts.headers ?? {}),
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  return parseOrThrow<T>(res, endpoint);
}

export async function httpDelete<T>(endpoint: string, opts: HttpOptions = {}): Promise<T> {
  const url = buildUrl(endpoint, opts.query);
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { Accept: 'application/json', ...(opts.headers ?? {}) },
    cache: 'no-store',
  });
  return parseOrThrow<T>(res, endpoint);
}
