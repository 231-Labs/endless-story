/**
 * 中途入場 — mid-run cast join, the fifth idle-time edit surface (物界抽屜
 * 「人」頁). Same first-principles rule as world-config: idle only, mutate
 * through the engine's own invariants (`joinCastMember`), snapshot
 * immediately — a join is a durable world fact, never a prompt whisper.
 *
 * Three strokes per join:
 *   1. `joinCastMember` — the engine adds the member (validated, no past);
 *   2. genesis memories → LocalRecall（kind 'genesis'，落款當日）;
 *   3. 到場天時 — a scheduled world event at the CURRENT tick announcing the
 *      arrival, witnessed by everyone, so incumbents learn it structurally
 *      (not by operator whisper). Wants grow on the next daytime tick's
 *      genesis phase; bonds/acquaintance start stranger by design.
 */

import { randomUUID } from 'node:crypto';
import { joinCastMember } from '@endless-story/engine';
import { labManager } from './manager';
import { recallFor } from './memories';
import { openWorldForEdit } from './world-config';

export interface JoinCastSpec {
    name: string;
    description: string;
    secret?: string;
    gender?: string;
    ageYears?: number;
    role?: string;
    /** Scene NAMES（與 seed 同口徑）。 */
    homeScene: string;
    workScene: string;
    arrivalScene?: string;
    /** 初始記憶（以角色第二人稱「你…」寫最順），逐條種入 recall。 */
    memories?: string[];
    /** 到場一筆（天時事件文案）；空則自動撰一句。 */
    arrivalNote?: string;
}

export interface JoinCastResult {
    id: string;
    name: string;
    arrivalSceneName: string;
    memoriesSeeded: number;
}

export async function joinCastToRun(runId: string, spec: JoinCastSpec): Promise<JoinCastResult> {
    labManager().assertIdle(runId);
    const { world, persist } = openWorldForEdit(runId);
    const w = world.data;

    const member = joinCastMember(world, {
        name: spec.name,
        description: spec.description,
        secret: spec.secret,
        gender: spec.gender,
        ageYears: spec.ageYears,
        role: spec.role,
        home_scene: spec.homeScene,
        work_scene: spec.workScene,
        arrival_scene: spec.arrivalScene,
    });

    // 到場天時 —— 下一拍開拍即入正典，眾人皆聞（含新人自己：她親歷了自己的到場）。
    const arrivalSceneId = w.roster[member.id];
    const arrivalSceneName = world.sceneNameById(arrivalSceneId);
    const text = spec.arrivalNote?.trim()
        || `${member.name}${member.role ? `（${member.role}）` : ''}到了${arrivalSceneName}，一身風塵未卸。`;
    (w.scheduledEvents ??= []).push({
        id: `lab-join-${randomUUID()}`,
        atTick: w.clock.currentTick,
        sceneId: arrivalSceneId,
        text,
        visibility: 'public',
        witnessIds: w.cast.map((m) => m.id),
    });

    persist();

    // 記憶種入走這一卷唯一的 recall 實例（與「憶」頁同一條紀律）。
    const { recall } = recallFor(runId);
    let seeded = 0;
    for (const memory of spec.memories ?? []) {
        const text = memory.trim();
        if (!text) continue;
        await recall.remember(member.id, text, { kind: 'genesis', importance: 7, day: w.clock.day });
        seeded++;
    }

    return { id: member.id, name: member.name, arrivalSceneName, memoriesSeeded: seeded };
}
