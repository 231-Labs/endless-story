/**
 * 復活 — cast-state.json → world.json converter.
 *
 * The agent-season harness saves per-window `cast-state.json`: each member's
 * evolved secret, relationshipViews (keyed by NAME), coreIdentity, full want
 * ledger, fatigue/hunger, plus establishedPairs. This converter rebuilds a
 * REAL lab run from it: base world seeded from the story preset (scenes,
 * anchors, genesis memories), then the saved state overlaid by name-match.
 *
 * Honest mapping notes (what carries, what doesn't):
 *   · wants carry verbatim (name→id remapped; negative bornTick = "born
 *     before this season", the decay math is relative so that is valid)
 *   · relationshipViews / coreIdentity / secret carry verbatim
 *   · establishedPairs → warm 戀慕 edges both ways (the welcome-gate signal)
 *   · fatigue/hunger carry; harness-only fields (health/money/seasonsLived)
 *     have no WorldState home and are recorded in the run note instead
 *   · cast members in the preset but absent from the state stay preset-fresh
 */

import * as path from 'node:path';
import {
    LocalRecall,
    buildWorldState,
    seedGenesisMemories,
    type Want,
} from '@endless-story/engine';
import { readSeedRaw } from './seeds';
import { createRun } from './store';
import { runDir } from './paths';
import { writeRunStatus } from './store';
import type { LabLlmMode, LabRunMeta } from './types';

interface CastStateMember {
    relationshipViews?: Record<string, string>;
    wants?: Array<Record<string, unknown>>;
    coreIdentity?: string[];
    secret?: string;
    fatigue?: number;
    hunger?: number;
    health?: number;
    money?: number;
    seasonsLived?: number;
}

export interface CastStateFile {
    version?: number;
    savedTick?: number;
    establishedPairs?: string[];
    cast: Record<string, CastStateMember>;
}

export interface ReviveInput {
    castState: CastStateFile;
    title: string;
    /** Story preset supplying scenes/anchors/genesis memories. */
    presetId?: string;
    llm?: LabLlmMode;
    /** Where the cast state came from (for the run note). */
    sourceLabel?: string;
}

export async function reviveFromCastState(input: ReviveInput): Promise<LabRunMeta> {
    const castState = input.castState;
    if (!castState?.cast || typeof castState.cast !== 'object') {
        throw new Error('cast-state.json has no cast map');
    }
    const presetId = input.presetId ?? 'spring-snow';
    let seedSource: 'builtin' | 'custom' = 'builtin';
    let raw;
    try {
        raw = readSeedRaw('builtin', presetId);
    } catch {
        raw = readSeedRaw('custom', presetId);
        seedSource = 'custom';
    }

    const world = buildWorldState(raw, presetId);
    const names = Object.keys(castState.cast);
    const matched: string[] = [];
    const unmatched: string[] = [];
    const renamed = new Map<string, string>();
    const skippedFields = new Set<string>();

    // Harness ↔ preset name drift happens (柳生春 vs 柳安春). Tolerate exactly
    // one differing character when the match is unambiguous; anything looser
    // would marry the wrong soul to a body.
    const resolveName = (name: string): string | undefined => {
        const direct = world.idByName(name);
        if (direct) return direct;
        const target = name.trim();
        const candidates = world.data.cast.filter((member) => {
            if (member.name.length !== target.length) return false;
            let diff = 0;
            for (let i = 0; i < target.length; i++) if (member.name[i] !== target[i]) diff += 1;
            return diff === 1;
        });
        if (candidates.length === 1) {
            renamed.set(name, candidates[0].name);
            return candidates[0].id;
        }
        return undefined;
    };

    for (const name of names) {
        const saved = castState.cast[name];
        const id = resolveName(name);
        if (!id) {
            unmatched.push(name);
            continue;
        }
        matched.push(name);
        const member = world.castById(id)!;
        if (saved.secret?.trim()) member.secret = saved.secret.trim(); // evolved heart; secretSeed stays the preset bedrock
        if (saved.coreIdentity?.length) member.coreIdentity = saved.coreIdentity.slice(0, 6);
        if (typeof saved.fatigue === 'number') member.state.fatigue = Math.min(1, Math.max(0, saved.fatigue));
        if (typeof saved.hunger === 'number') member.state.hunger = Math.min(1, Math.max(0, saved.hunger));
        for (const field of ['health', 'money', 'seasonsLived'] as const) {
            if (saved[field] != null) skippedFields.add(field);
        }
        for (const [otherName, view] of Object.entries(saved.relationshipViews ?? {})) {
            const otherId = resolveName(otherName);
            if (otherId && view.trim()) world.setRelationshipView(id, otherId, view.trim());
        }
        for (const want of saved.wants ?? []) {
            if (typeof want.desc !== 'string' || !want.desc) continue;
            const mapped: Want = {
                id: String(want.id ?? `revived-${world.data.wants.length}`),
                characterId: id,
                layer: String(want.layer ?? '心事'),
                desc: want.desc,
                target: typeof want.target === 'string' ? want.target : undefined,
                weight: Number(want.weight ?? 0.5),
                sat: Number(want.sat ?? 0.2),
                sat0: Number(want.sat0 ?? 0.2),
                resistance: Number(want.resistance ?? 3),
                heat: Number(want.heat ?? 0),
                frust: Number(want.frust ?? 0),
                recent: Number(want.recent ?? 0),
                retired: Boolean(want.retired),
                resolvedNote: typeof want.resolvedNote === 'string' ? want.resolvedNote : undefined,
                kind: want.kind === 'economic' ? 'economic' : 'narrative',
                source: (want.source as Want['source']) ?? 'genesis',
                bornTick: Number(want.bornTick ?? 0),
                resolvedTick: typeof want.resolvedTick === 'number' ? want.resolvedTick : undefined,
                resource: undefined, // reassessed against this run's stakes
            };
            world.data.wants.push(mapped);
        }
    }

    for (const pair of castState.establishedPairs ?? []) {
        const [a, b] = pair.split('|').map((n) => resolveName(n.trim()));
        if (a && b) {
            world.setEdge(a, b, '戀慕');
            world.setEdge(b, a, '戀慕');
        }
    }
    world.data.relationshipFallback = true;

    const noteParts = [
        `復活自 cast-state${input.sourceLabel ? `（${input.sourceLabel}）` : ''}`,
        `承接 ${matched.length} 名角`,
        renamed.size ? `改名承接：${[...renamed.entries()].map(([from, to]) => `${from}→${to}`).join('、')}` : '',
        unmatched.length ? `無主：${unmatched.join('、')}` : '',
        skippedFields.size ? `未承接欄位：${[...skippedFields].join('/')}（WorldState 無此屋）` : '',
        castState.savedTick != null ? `原窗口至 tick ${castState.savedTick}；此卷自第 1 日重新起拍` : '',
    ].filter(Boolean);

    const meta = createRun({
        title: input.title,
        note: noteParts.join(' · '),
        config: {
            presetId,
            seedSource,
            llm: input.llm === 'real' ? 'real' : 'fake',
            relationshipFallback: true,
            ticksPerDay: 6,
            realEmbeddings: false,
        },
    });

    const out = runDir(meta.id);
    const recall = new LocalRecall(path.join(out, 'memory'), { embeddings: 'deterministic' });
    await seedGenesisMemories(raw, world, recall);
    world.snapshot(path.join(out, 'state'));
    writeRunStatus(meta.id, {
        day: world.data.clock.day,
        tick: world.data.clock.currentTick,
        partOfDay: world.data.clock.partOfDay,
        liveWants: world.data.wants.filter((w) => !w.retired).length,
        castCount: world.data.cast.length,
        sceneCount: world.data.scenes.length,
        eventsTotal: 0,
        updatedAt: new Date().toISOString(),
    });
    return meta;
}
