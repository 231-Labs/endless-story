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
    /**
     * MUTABLE SELF-MODEL (CHARACTER_LIFECYCLE §3, L3) — the character's CURRENT
     * durable sense of who they are: a few self-facts (「我是坤生，女兒身扮小生」).
     * ALWAYS injected, NEVER recalled. This is the eviction fix: identity lives
     * here, current and un-evictable, so recency decay can't push it out of the
     * recall top-K. OVERWRITE-latest (§2.52 insight may update it), never appended.
     */
    coreIdentity: string[];
    /**
     * The character's CURRENT one-line view of each significant other, keyed by
     * that other's characterId: 「舊情人，如今我只欠她一句交代」. Updated by OVERWRITE
     * each night (latest-wins) — a changed relationship (lover → 兩清) REPLACES the
     * line, so there is never the stale + new pair append-only episodic memory
     * would accumulate. Sits ALONGSIDE the mechanical `edges` tone graph (which
     * drives routing/welcome); this is the narrative current-state, always
     * injected into the acting character's prompts, never in the recall lottery.
     */
    relationshipView: Record<string, string>;
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
/** L3 identity is a small, un-evictable working set (CHARACTER_LIFECYCLE §3): a
 *  handful of self-facts, merged when full — never an ever-growing list. */
const CORE_IDENTITY_CAP = 6;

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

    // ── mutable self-model (latest-wins; never recalled) ───────────────────────
    /** OVERWRITE `fromId`'s current one-line view of `toId` (latest-wins). Empty
     *  line clears it. This is the whole point: a changed relationship replaces
     *  the line rather than accumulating a stale + new pair. */
    setRelationshipView(fromId: string, toId: string, line: string): void {
        const m = this.castById(fromId);
        if (!m) return;
        const trimmed = line.trim();
        if (trimmed) m.relationshipView[toId] = trimmed;
        else delete m.relationshipView[toId];
    }

    /** `fromId`'s current view of `toId`, or undefined. */
    relationshipView(fromId: string, toId: string): string | undefined {
        return this.castById(fromId)?.relationshipView[toId];
    }

    /** Replace a character's durable identity facts wholesale. */
    setCoreIdentity(id: string, lines: string[]): void {
        const m = this.castById(id);
        if (m) m.coreIdentity = lines.map((l) => l.trim()).filter(Boolean).slice(0, CORE_IDENTITY_CAP);
    }

    /** Merge a durable identity insight (§2.52) — dedup, capped. Newest kept. */
    addCoreIdentity(id: string, line: string): void {
        const m = this.castById(id);
        const trimmed = line.trim();
        if (!m || !trimmed || m.coreIdentity.includes(trimmed)) return;
        m.coreIdentity.push(trimmed);
        while (m.coreIdentity.length > CORE_IDENTITY_CAP) m.coreIdentity.shift();
    }

    /**
     * The ALWAYS-AVAILABLE self-model injection block for an acting character:
     * durable identity + the current one-line view of each significant other.
     * `presentIds` scopes it to who is in the room (beats — anti-omniscience);
     * omit it for a personal planning call (chooseAction) where the character may
     * reason about someone not present. Reads only the mutable self-model, never
     * recall — so it is current and un-evictable by definition. '' when empty.
     */
    selfModelBlock(actingId: string, presentIds?: string[]): string {
        const m = this.castById(actingId);
        if (!m) return '';
        const out: string[] = [];
        if (m.coreIdentity.length) {
            out.push('【你恆常記得自己是誰（底色，不必回想，永遠在）】');
            for (const f of m.coreIdentity) out.push(`· ${f}`);
        }
        const others = Object.keys(m.relationshipView).filter(
            (oid) => oid !== actingId && (!presentIds || presentIds.includes(oid)),
        );
        if (others.length) {
            out.push('【你此刻心裡對這些人的看法（當下的、最新的，不是舊帳）】');
            for (const oid of others) out.push(`· ${this.nameById(oid)}：${m.relationshipView[oid]}`);
        }
        return out.join('\n');
    }

    /**
     * Per-present-other tie lines for the scene-beat channel: the character's
     * CURRENT relationship view (rich, latest-wins) when they hold one, else the
     * mechanical edge tone as a fallback. Keyed by the other's characterId — the
     * shape `SceneLoopCastMember.ties` expects. Only ever this character's OWN
     * feeling (never the reverse edge — no omniscience).
     */
    selfTies(actingId: string, presentIds: string[]): Record<string, string> {
        const ties: Record<string, string> = {};
        for (const oid of presentIds) {
            if (oid === actingId) continue;
            const view = this.relationshipView(actingId, oid);
            if (view) ties[oid] = view;
            else {
                const tone = this.data.edges[actingId]?.[oid]?.tone;
                if (tone) ties[oid] = `你對TA：${tone}`;
            }
        }
        return ties;
    }

    /** Persona with the durable identity facts prepended — the always-on identity
     *  channel for the beat prompt (which renders `你就是<name>。<persona>`). */
    beatPersona(id: string): string {
        const m = this.castById(id);
        if (!m) return '';
        return m.coreIdentity.length ? `${m.coreIdentity.join('；')}。${m.persona}` : m.persona;
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
        const data = JSON.parse(raw) as WorldStateData;
        // Normalize the self-model fields so a snapshot written before this layer
        // (or with the keys JSON-omitted when empty) restores to a valid shape.
        for (const m of data.cast) {
            if (!Array.isArray(m.coreIdentity)) m.coreIdentity = [];
            if (!m.relationshipView || typeof m.relationshipView !== 'object') m.relationshipView = {};
        }
        return new WorldState(data);
    }
}
