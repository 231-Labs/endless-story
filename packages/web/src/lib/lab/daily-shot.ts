/**
 * 今日主鏡 — one curated 20–90s clip per day/round on a run.
 * Stored at runs/<id>/editorial/daily-shot.json. Never produced by the tick loop.
 */

import * as path from 'node:path';
import { assertSafeId, readJson, runDir, writeJsonAtomic } from './paths';

export interface DailyShotPromptAfter {
    /** Follow 柳安春 (or focus character) into the world. */
    followFocus: string;
    /** Open reading / dossier for what happened before. */
    readBefore: string;
    /** Return to multi-location world panorama. */
    backToWorld: string;
}

export interface DailyShot {
    id: string;
    day: number;
    tick?: number;
    title: string;
    caption?: string;
    posterUrl?: string;
    /** Empty / missing = poster-only theater (still ok). */
    videoUrl?: string;
    durationSeconds?: number;
    aspect?: '16/9' | '9/16' | '1/1' | '4/3' | '3/4';
    sceneId?: string;
    sceneName?: string;
    locationId?: string;
    locationName?: string;
    focusCharacterId?: string;
    focusCharacterName?: string;
    dossierSlug?: string;
    promptAfter?: DailyShotPromptAfter;
    updatedAt: string;
}

const DEFAULT_PROMPTS: DailyShotPromptAfter = {
    followFocus: '從柳安春視角繼續',
    readBefore: '查看此事之前發生了什麼',
    backToWorld: '回到今日世界',
};

export function dailyShotPath(runId: string): string {
    return path.join(runDir(assertSafeId(runId, 'run id')), 'editorial', 'daily-shot.json');
}

export function readDailyShot(runId: string): DailyShot | null {
    const shot = readJson<DailyShot>(dailyShotPath(runId));
    if (!shot) return null;
    return {
        ...shot,
        promptAfter: {
            followFocus: shot.promptAfter?.followFocus || DEFAULT_PROMPTS.followFocus,
            readBefore: shot.promptAfter?.readBefore || DEFAULT_PROMPTS.readBefore,
            backToWorld: shot.promptAfter?.backToWorld || DEFAULT_PROMPTS.backToWorld,
        },
    };
}

export function writeDailyShot(runId: string, shot: Omit<DailyShot, 'updatedAt'> & { updatedAt?: string }): DailyShot {
    const next: DailyShot = {
        ...shot,
        promptAfter: {
            followFocus: shot.promptAfter?.followFocus || DEFAULT_PROMPTS.followFocus,
            readBefore: shot.promptAfter?.readBefore || DEFAULT_PROMPTS.readBefore,
            backToWorld: shot.promptAfter?.backToWorld || DEFAULT_PROMPTS.backToWorld,
        },
        updatedAt: shot.updatedAt ?? new Date().toISOString(),
    };
    writeJsonAtomic(dailyShotPath(runId), next);
    return next;
}
