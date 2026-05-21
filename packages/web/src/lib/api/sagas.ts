import type { Saga, SagaLocation } from '@endless-story/shared';
import { getDemoSaga, locations, sagas } from '@/mocks/sagas';

export async function listSagas(): Promise<Saga[]> {
  return sagas;
}

export async function getSaga(id: string): Promise<Saga | null> {
  return sagas.find((s) => s.id === id) ?? null;
}

export async function getCurrentSaga(): Promise<Saga> {
  return getDemoSaga();
}

export async function listLocations(): Promise<SagaLocation[]> {
  return locations;
}

export async function getLocation(id: string): Promise<SagaLocation | null> {
  return locations.find((l) => l.id === id) ?? null;
}
