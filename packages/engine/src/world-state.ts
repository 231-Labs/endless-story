/**
 * WorldState — the whole living world of one saga, in one serializable object.
 *
 * Every tick ends with `snapshot(dir)`; a restart calls `restore(dir)` and
 * continues. This is the direct fix for the production failure diagnosed in
 * CHARACTER_LIFECYCLE §6(iii): the want ledger + day accumulator lived in
 * in-process Maps, so a restart dropped half a day of narrative. Here the entire
 * world — cast, positions, anchors, wants, relationship edges, clock, and the
 * day accumulator — is one JSON file.
 *
 * Pure data + I/O only; no LLM, no chain. The tick pipeline mutates it in place
 * and snapshots it.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Want } from './core/want-core.ts';
import type { WorldClock } from './ports.ts';

/** Daily-life state vector (§2.16); derived tint, persisted so a restart keeps
 *  the arc rather than resetting everyone to neutral. */
export interface StateVector {
    fatigue: number;
    hunger: number;
    mood: number;
}

export interface CastMember {
    id: string;
    name: string;
    /** Public persona / bio (POV-visible). */
    persona: string;
    /** Private inner-life secret — grows wants, colours beats, never shown to others. */
    secret?: string;
    gender?: string;
    age?: number;
    role?: string;
    state: StateVector;
}

export interface SceneInfo {
    id: string;
    name: string;
    /** 0 public … 5 fully private. ≥3 ⇒ a private home. */
    privacyLevel: number;
}

/** A directed relationship edge (from → to), tone + accumulated weight (§2.4). */
export interface RelationshipEdge {
    tone: string;
    weight: number;
}

export interface ContestedResource {
    label: string;
    statement?: string;
}

/** The fully-serializable world. */
export interface WorldStateData {
    sagaId: string;
    /** Saga premise (world facts that set want resistance). */
    sagaPremise: string;
    cast: CastMember[];
    scenes: SceneInfo[];
    /** characterId → current sceneId. */
    roster: Record<string, string>;
    /** characterId → home sceneId (night anchor). */
    homeByChar: Record<string, string>;
    /** characterId → work sceneId (day anchor). */
    workByChar: Record<string, string>;
    /** All wants of the cast (live + retired). */
    wants: Want[];
    /** Directed relationship graph: from → to → edge. */
    edges: Record<string, Record<string, RelationshipEdge>>;
    clock: WorldClock;
    /** Episode weaver accumulator for the current day. */
    dayAccum: {
        lines: string[];
        actorIds: string[];
        sceneIds: string[];
        povByName: Record<string, string>;
    };
    contestedResources: ContestedResource[];
}

const SNAPSHOT_FILE = 'world.json';

export class WorldState {
    data: WorldStateData;

    constructor(data: WorldStateData) {
        this.data = data;
    }

    // ── lookups ──────────────────────────────────────────────────────────────
    castById(id: string): CastMember | undefined {
        return this.data.cast.find((c) => c.id === id);
    }
    nameById(id: string): string {
        return this.castById(id)?.name ?? id.slice(0, 8);
    }
    roleById(id: string): string | undefined {
        return this.castById(id)?.role;
    }
    sceneById(id: string): SceneInfo | undefined {
        return this.data.scenes.find((s) => s.id === id);
    }
    sceneNameById(id: string): string {
        return this.sceneById(id)?.name ?? '戲班';
    }
    idByName(name: string): string | undefined {
        return this.data.cast.find((c) => c.name === name)?.id;
    }

    /** characterId → live wants of that character, hottest first. */
    liveWantsOf(id: string): Want[] {
        return this.data.wants
            .filter((w) => !w.retired && w.characterId === id)
            .sort((a, b) => b.weight * (1 - b.sat) - a.weight * (1 - a.sat));
    }

    /** Warm directed edge (0..1) — the night router's welcome gate. A default
     *  0.5 lets an authored pair form on day one; a warm/romance tone opens the
     *  door wider, a cold one shuts it. Deterministic, no LLM. */
    welcome(hostId: string, visitorId: string): number {
        const e = this.data.edges[hostId]?.[visitorId];
        if (!e) return 0.5;
        if (/戀|慕|愛|親|暖|友/.test(e.tone)) return Math.min(1, 0.7 + 0.1 * e.weight);
        if (/妒|怨|恨|冷|敵|競/.test(e.tone)) return Math.max(0, 0.2 - 0.05 * e.weight);
        return 0.5;
    }

    /** Record/strengthen a directed relationship edge (§2.4 accumulation). */
    setEdge(fromId: string, toId: string, tone: string): void {
        const row = (this.data.edges[fromId] ??= {});
        const cur = row[toId];
        row[toId] = cur && cur.tone === tone ? { tone, weight: cur.weight + 1 } : { tone, weight: (cur?.weight ?? 0) + 1 };
    }

    // ── persistence ──────────────────────────────────────────────────────────
    /** Write the whole world to `<dir>/world.json`. Called every tick. */
    snapshot(dir: string): void {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, SNAPSHOT_FILE), JSON.stringify(this.data, null, 1));
    }

    /** True if a snapshot exists at `dir`. */
    static exists(dir: string): boolean {
        return fs.existsSync(path.join(dir, SNAPSHOT_FILE));
    }

    /** Rebuild a world from `<dir>/world.json`. Throws loudly if absent/corrupt. */
    static restore(dir: string): WorldState {
        const p = path.join(dir, SNAPSHOT_FILE);
        const raw = fs.readFileSync(p, 'utf-8'); // throws if missing — loud by design
        return new WorldState(JSON.parse(raw) as WorldStateData);
    }
}
