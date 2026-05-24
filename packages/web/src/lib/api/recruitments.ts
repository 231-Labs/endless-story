import type { Recruitment } from '@endless-story/shared';
import { getRecruitmentById, listActiveRecruitments } from '@/mocks/recruitments';
import { USE_MOCK } from './config';
import { httpGet } from './http';

/**
 * Recruitments API
 *
 * 後端對應 endpoints：
 *   GET  /recruitments?status=open       → Recruitment[]
 *   GET  /recruitments/{id}              → Recruitment | 404
 *   POST /recruitments/{id}/voucher      → { voucherObjectId }   (擲牌、簽 mint voucher tx — 走 dapp-kit)
 *
 * Mint voucher 流程在前端走 dapp-kit，backend 只負責提供 recruitment metadata。
 */

export async function listOpenRecruitments(): Promise<Recruitment[]> {
  if (USE_MOCK) return listActiveRecruitments();
  return httpGet<Recruitment[]>('/recruitments', { query: { status: 'open' } });
}

export async function getRecruitment(id: string): Promise<Recruitment | null> {
  if (USE_MOCK) return getRecruitmentById(id) ?? null;
  try {
    return await httpGet<Recruitment>(`/recruitments/${id}`);
  } catch {
    return null;
  }
}
