import type { Recruitment } from '@endless-story/shared';
import { getRecruitmentById, listActiveRecruitments } from '@/mocks/recruitments';

export async function listOpenRecruitments(): Promise<Recruitment[]> {
  return listActiveRecruitments();
}

export async function getRecruitment(id: string): Promise<Recruitment | null> {
  return getRecruitmentById(id) ?? null;
}
