import type { Saga, SagaLocation } from '@endless-story/shared';
import { getDemoSaga, locations, sagas } from '@/mocks/sagas';
import { USE_MOCK } from './config';
import { httpGet } from './http';

/**
 * Sagas + Locations API
 *
 * 後端對應 endpoints：
 *   GET  /sagas                  → Saga[]
 *   GET  /sagas/{id}             → Saga | 404
 *   GET  /sagas/current          → Saga    (預設 demo saga)
 *   GET  /locations              → SagaLocation[]
 *   GET  /locations/{id}         → SagaLocation | 404
 *
 * 後端應該：
 *   - Saga.castIds 跟 chain Saga.castIds 同步
 *   - Saga.sagaPrompts / revenueConfig / worldTime 由 saga server 維護
 *   - Locations 是 World 級資料，未來支援多 saga 共用
 */

export async function listSagas(): Promise<Saga[]> {
  if (USE_MOCK) return sagas;
  return httpGet<Saga[]>('/sagas');
}

export async function getSaga(id: string): Promise<Saga | null> {
  if (USE_MOCK) return sagas.find((s) => s.id === id) ?? null;
  try {
    return await httpGet<Saga>(`/sagas/${id}`);
  } catch {
    return null;
  }
}

export async function getCurrentSaga(): Promise<Saga> {
  if (USE_MOCK) return getDemoSaga();
  return httpGet<Saga>('/sagas/current');
}

export async function listLocations(): Promise<SagaLocation[]> {
  if (USE_MOCK) return locations;
  return httpGet<SagaLocation[]>('/locations');
}

export async function getLocation(id: string): Promise<SagaLocation | null> {
  if (USE_MOCK) return locations.find((l) => l.id === id) ?? null;
  try {
    return await httpGet<SagaLocation>(`/locations/${id}`);
  } catch {
    return null;
  }
}
