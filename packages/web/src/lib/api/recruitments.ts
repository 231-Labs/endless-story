import type { Recruitment } from '@endless-story/shared';
import { getStoreRecruitment, listOpenStoreRecruitments } from '@/lib/actions/recruitments-store';

/**
 * Recruitments API — facade over the admin-edited JSON store
 * (`web/data/recruitments.json`).
 *
 * The store starts EMPTY on fresh install. Admin populates it via:
 *   - /admin/deploy ③ button (batch open 5 preset 行當)
 *   - /admin/recruitments (manual CRUD)
 *
 * Seed data lives in `lib/recruitment-seeds.ts`.
 */

export async function listOpenRecruitments(): Promise<Recruitment[]> {
  return listOpenStoreRecruitments();
}

export async function getRecruitment(id: string): Promise<Recruitment | null> {
  return getStoreRecruitment(id);
}
