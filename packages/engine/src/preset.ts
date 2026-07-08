/**
 * Preset loader — turn a story preset JSON (packages/cli/scripts/stories/*.json)
 * into a fresh WorldState, and seed each character's genesis memories into a
 * RecallPort at world creation.
 *
 * The preset carries authored canon: cast (persona + secret + memories +
 * home/work scene), scenes (with privacy), saga premise, contested stakes. The
 * engine consumes exactly the fields it needs and ignores the chain-only rest.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RecallPort } from './ports.ts';
import { makeClock } from './adapters/local/clock.ts';
import {
    WorldState,
    type CastMember,
    type ContestedResource,
    type SceneInfo,
    type WorldStateData,
} from './world-state.ts';

/** The slice of the preset shape the engine reads (the rest is chain-only). */
interface RawPreset {
    id: string;
    label?: string;
    saga?: { name?: string; description?: string; nature_prompt?: string };
    drama_resources?: Array<{ label: string; statement?: string }>;
    scenes?: Array<{ name: string; privacy?: number }>;
    founding_cast?: Array<{
        name: string;
        ageYears?: number;
        gender?: string;
        role?: string;
        description: string;
        secret?: string;
        memories?: string[];
        work_scene?: string;
        home_scene?: string;
    }>;
}

/** Default location of the shared story presets, relative to this module. */
function defaultStoriesDir(): string {
    return path.resolve(fileURLToPath(import.meta.url), '../../../cli/scripts/stories');
}

/** Read + parse a preset JSON. Throws loudly if the file is missing. */
export function loadPresetFile(presetId: string, storiesDir?: string): RawPreset {
    const dir = storiesDir ?? defaultStoriesDir();
    const file = path.join(dir, `${presetId}.json`);
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as RawPreset; // throws if absent
}

/** Build a fresh WorldState from a parsed preset (pure; no I/O, no recall). */
export function buildWorldState(raw: RawPreset, sagaId = raw.id, ticksPerDay = 6): WorldState {
    const scenes: SceneInfo[] = (raw.scenes ?? []).map((s, i) => ({
        id: `s${i}`,
        name: s.name,
        privacyLevel: s.privacy ?? 0,
    }));
    const sceneIdByName = new Map(scenes.map((s) => [s.name, s.id]));
    const resolveScene = (name: string | undefined, who: string, field: string): string => {
        if (!name) throw new Error(`[preset] ${who} has no ${field}`);
        const id = sceneIdByName.get(name);
        if (!id) throw new Error(`[preset] ${who}'s ${field} "${name}" is not a scene in this preset`);
        return id;
    };

    const cast: CastMember[] = [];
    const roster: Record<string, string> = {};
    const homeByChar: Record<string, string> = {};
    const workByChar: Record<string, string> = {};
    (raw.founding_cast ?? []).forEach((c, i) => {
        const id = `c${i}`;
        cast.push({
            id,
            name: c.name,
            persona: c.description,
            secret: c.secret,
            gender: c.gender,
            age: c.ageYears,
            role: c.role,
            state: { fatigue: 0.3, hunger: 0.2, mood: 0 },
        });
        const work = resolveScene(c.work_scene, c.name, 'work_scene');
        homeByChar[id] = resolveScene(c.home_scene, c.name, 'home_scene');
        workByChar[id] = work;
        roster[id] = work; // the day starts at one's 崗位 (G11)
    });

    const contestedResources: ContestedResource[] = (raw.drama_resources ?? []).map((r) => ({
        label: r.label,
        statement: r.statement,
    }));

    const premise = [raw.saga?.description, raw.saga?.nature_prompt].filter(Boolean).join('\n');

    const data: WorldStateData = {
        sagaId,
        sagaPremise: premise,
        cast,
        scenes,
        roster,
        homeByChar,
        workByChar,
        wants: [],
        edges: {},
        clock: makeClock(ticksPerDay, 0),
        dayAccum: { lines: [], actorIds: [], sceneIds: [], povByName: {} },
        contestedResources,
    };
    return new WorldState(data);
}

/** Seed every character's authored genesis memories into recall (day 1, high
 *  importance so they surface early). Returns the count seeded. */
export async function seedGenesisMemories(
    raw: RawPreset,
    world: WorldState,
    recall: RecallPort,
): Promise<number> {
    let seeded = 0;
    for (const c of raw.founding_cast ?? []) {
        const id = world.idByName(c.name);
        if (!id) continue;
        for (const mem of c.memories ?? []) {
            await recall.remember(id, mem, { kind: 'genesis', importance: 7, day: 1 });
            seeded++;
        }
    }
    return seeded;
}

/** Convenience: load + build + seed in one call. */
export async function createWorldFromPreset(
    presetId: string,
    recall: RecallPort,
    opts: { storiesDir?: string; sagaId?: string; ticksPerDay?: number } = {},
): Promise<{ world: WorldState; raw: RawPreset; seeded: number }> {
    const raw = loadPresetFile(presetId, opts.storiesDir);
    const world = buildWorldState(raw, opts.sagaId ?? presetId, opts.ticksPerDay);
    const seeded = await seedGenesisMemories(raw, world, recall);
    return { world, raw, seeded };
}

export type { RawPreset };
