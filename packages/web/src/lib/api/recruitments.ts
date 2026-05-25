import type { Recruitment } from '@endless-story/shared';
import { getRecruitmentById } from '@/mocks/recruitments';
import { getStoreRecruitment, listOpenStoreRecruitments } from '@/lib/actions/recruitments-store';

/**
 * Recruitments API — facade that reads from the admin-editable JSON store
 * (`web/data/recruitments.json`). The store seeds itself from the mock list
 * on first read, so dev runs already have content.
 *
 * No more USE_MOCK gating: the JSON store IS the source. The mock acts as
 * initial seed only.
 */

export async function listOpenRecruitments(): Promise<Recruitment[]> {
  return listOpenStoreRecruitments();
}

export async function getRecruitment(id: string): Promise<Recruitment | null> {
  const fromStore = await getStoreRecruitment(id);
  if (fromStore) return fromStore;
  // Fallback to mock for static / test ids that aren't in the store.
  return getRecruitmentById(id) ?? null;
}
