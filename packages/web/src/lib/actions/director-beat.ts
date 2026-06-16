'use server';

/**
 * Director beat (Step 2) — the SAGA-PUBLIC crisis broadcast.
 *
 * The director declares "what's in the air right now" (百代逼宮 / 班主出事 …); it
 * lands in every character's objective 當下處境 next tick (via perceive), so the
 * cast actually KNOWS the crisis instead of it being a write-only signal nobody read.
 * Public by construction — for pressure aimed at ONE character/faction use inject_dream
 * (a private memory), which never enters anyone else's Situation.
 */

import { ENDLESS_STORY_DEPLOYMENT } from '@endless-story/sdk';
import { setDirectorBeat, clearDirectorBeat, getDirectorBeat } from './tick-phases/perceive';

export interface DirectorBeat {
    text: string;
    phase?: string;
}

export async function setDirectorBeatAction(
    text: string,
    phase?: string,
): Promise<{ ok: boolean; beat?: DirectorBeat; error?: string }> {
    const sagaId = ENDLESS_STORY_DEPLOYMENT.sagaId;
    if (!sagaId) return { ok: false, error: 'saga 尚未種子化' };
    if (!text.trim()) return { ok: false, error: '危機內容不可為空' };
    setDirectorBeat(sagaId, text, phase?.trim() || undefined);
    return { ok: true, beat: getDirectorBeat(sagaId) };
}

export async function clearDirectorBeatAction(): Promise<{ ok: boolean }> {
    const sagaId = ENDLESS_STORY_DEPLOYMENT.sagaId;
    if (sagaId) clearDirectorBeat(sagaId);
    return { ok: true };
}

export async function getDirectorBeatAction(): Promise<DirectorBeat | null> {
    const sagaId = ENDLESS_STORY_DEPLOYMENT.sagaId;
    return sagaId ? getDirectorBeat(sagaId) ?? null : null;
}
