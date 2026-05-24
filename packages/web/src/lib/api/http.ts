import { getApiBaseUrl } from './config';

/**
 * 後端 endpoints 的薄 fetch wrapper。
 *
 * 用法（在 facade method 內）：
 *   if (USE_MOCK) return mockImpl();
 *   return httpGet<Saga[]>('/sagas');
 *
 * 設計：
 *   - 統一 baseUrl 從 config.getApiBaseUrl()
 *   - 統一錯誤 — non-2xx 直接 throw ApiError
 *   - 不做 runtime validation（TS type 信任後端契約）
 *   - 預設 cache: 'no-store' — facade 通常拉動態資料；caller 需要 cache 自己包
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
  /** 是否啟用 Next.js fetch cache。預設 'no-store'（每次 fresh） */
  cache?: RequestCache;
  /** Next.js revalidate 秒數 */
  revalidate?: number;
  /** 額外 headers */
  headers?: Record<string, string>;
  /** Query params — 自動編碼到 URL */
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

/**
 * Phase 1 (now) stub — 給尚未實作的 endpoint，會 throw clear error。
 * 等 backend ready 後刪除此 helper 並讓 facade 直接呼叫對應 httpGet/Post。
 */
export function notImplemented(endpoint: string): never {
  throw new ApiError(
    501,
    endpoint,
    'Backend endpoint not implemented yet — switch NEXT_PUBLIC_DATA_SOURCE=mock or implement this endpoint.'
  );
}
