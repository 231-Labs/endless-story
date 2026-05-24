/**
 * Facade data-source 配置。
 *
 * 環境變數：
 *   NEXT_PUBLIC_DATA_SOURCE = 'mock' | 'api'   (default: 'mock')
 *   NEXT_PUBLIC_API_BASE_URL = 'http://localhost:8787' (when source=api)
 *
 * 設計理念：
 *   - 'mock' = 直接讀 packages/web/src/mocks 內的常數（目前 demo 階段）
 *   - 'api'  = 透過 http.ts wrapper 呼叫 backend runner endpoints
 *
 * 每個 facade method 內部分派：
 *   if (USE_MOCK) return mockImpl(...);
 *   return httpGet(...);
 */
export type DataSource = 'mock' | 'api';

export function getDataSource(): DataSource {
  const v = process.env.NEXT_PUBLIC_DATA_SOURCE;
  return v === 'api' ? 'api' : 'mock';
}

export const USE_MOCK = getDataSource() === 'mock';

export function getApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8787';
}
