import type { Saga } from '@endless-story/shared';
import { sagas, getDemoSaga } from '@/mocks/sagas';

export async function listSagas(): Promise<Saga[]> {
  return sagas;
}

export async function getSaga(id: string): Promise<Saga | null> {
  return sagas.find((s) => s.id === id) ?? null;
}

export async function getCurrentSaga(): Promise<Saga> {
  return getDemoSaga();
}
