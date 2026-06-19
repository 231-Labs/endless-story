'use server';

/**
 * Casting options for the 指定選角 UI — the play's parts (from the repertoire)
 * + the live saga roster, so the admin can pin "X plays 許仙" before launching.
 * Only works for a SPECIFIC 戲碼 (when 班主自選, the play isn't known yet).
 */

import { ENDLESS_STORY_DEPLOYMENT } from '@endless-story/sdk';
import { resolvePlay } from '@endless-story/troupe';
import { buildSagaRoster } from '@/lib/chain/roster';

export interface CastingPart {
    partId: string;
    partName: string;
    hangdang: string;
    yinggong: string;
    roleGender: string;
}

export interface CastingCandidate {
    id: string;
    name: string;
    role: string;
    gender: string;
}

export interface ProductionCastingOptions {
    classicKey: string;
    title: string;
    parts: CastingPart[];
    roster: CastingCandidate[];
}

export async function getProductionCastingOptions(
    classicKey: string,
): Promise<ProductionCastingOptions | null> {
    if (!classicKey) return null; // 班主自選 → 戲碼未定，無法指定選角
    const play = resolvePlay(classicKey);
    const sagaId = ENDLESS_STORY_DEPLOYMENT.sagaId;
    const roster = sagaId ? await buildSagaRoster(sagaId).catch(() => []) : [];
    return {
        classicKey: play.key,
        title: play.title,
        parts: play.parts.map((p) => ({
            partId: p.partId,
            partName: p.partName,
            hangdang: p.hangdang,
            yinggong: p.yinggong,
            roleGender: p.roleGender,
        })),
        roster: roster.map((r) => ({ id: r.id, name: r.name, role: r.role, gender: r.gender })),
    };
}
