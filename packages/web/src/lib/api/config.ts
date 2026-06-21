/**
 * Facade data-source config.
 *
 * Env vars:
 *   NEXT_PUBLIC_DATA_SOURCE = 'mock' | 'api'   (default: 'mock')
 *   NEXT_PUBLIC_API_BASE_URL = 'http://localhost:8787' (when source=api)
 *
 * Design:
 *   - 'mock' = read constants directly from packages/web/src/mocks (current demo stage)
 *   - 'api'  = call backend runner endpoints via the http.ts wrapper
 *
 * Each facade method dispatches internally:
 *   if (USE_MOCK) return mockImpl(...);
 *   return httpGet(...);
 */
import { ENDLESS_STORY_DEPLOYMENT } from '@endless-story/sdk';

export type DataSource = 'mock' | 'api';

export function getDataSource(): DataSource {
  const v = process.env.NEXT_PUBLIC_DATA_SOURCE;
  return v === 'api' ? 'api' : 'mock';
}

export const USE_MOCK = getDataSource() === 'mock';

export function getApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8787';
}

/** True once a contract package id is set (i.e. a world has been deployed). */
export function isDeployed(): boolean {
  return ENDLESS_STORY_DEPLOYMENT.packageId.length > 0;
}
