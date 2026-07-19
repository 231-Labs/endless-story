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
import type { SeasonEconomyData } from './core/season-economy.ts';
import type { Production } from './core/production.ts';
import type { WorldClock } from './ports.ts';
import { bondsFromJSON, bondsToJSON, type BondGraph } from './core/bond-graph.ts';

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
    /** Private inner-life secret — grows wants, colours beats, never shown to
     *  others. A LIVING thing under the relationship fallback: nightly 心事自改
     *  may move the heart when something真的落地 (evolveSecret). */
    secret?: string;
    /** The IMMUTABLE canon seed of the secret (bedrock facts of the past).
     *  Evolution moves the HEART, never the history — the guard that stopped
     *  a 六七年 entanglement drifting to 十年 on the web path. */
    secretSeed?: string;
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
    /** STANDING DAILY PLAN (N6) — the character's evolving 「我想要什麼、接下來
     *  怎麼走」: 長期目標／眼下打算／未竟之事, regenerated each night by planDay
     *  and injected into next-day movement + beats. Only real (LLM) runs write it;
     *  optional & backward-compatible with snapshots predating planning. */
    plan?: string;
    /** Per-part-of-day livelihood duty (行當專屬), resolved at seed time from the
     *  frame's occupationDuties keyed by this character's role. At a duty part the
     *  character is on-post (歌女入夜唱堂會、記者深宵趕稿、班主坐鎮後台) — a stronger
     *  pull than the generic work/home rhythm. Optional & backward-compatible. */
    duties?: Array<{ part: string; sceneId: string; duty: boolean; note?: string }>;
}

export interface SceneInfo {
    id: string;
    name: string;
    description?: string;
    /** 0 public … 5 fully private. ≥3 ⇒ a private home. */
    privacyLevel: number;
    /** Maximum simultaneous roster size. Explicit world physics, with preset
     * defaults derived from privacy when older snapshots omit it. */
    capacity?: number;
    /** The DISTRICT this scene belongs to (preset location_index) — scenes with
     * the same index are one place / a few steps apart; different indices are a
     * real cross-town journey. Drives movement time-cost + roadside 路遇.
     * Optional & backward-compatible: absent ⇒ no grouping (flat/uniform). */
    locationIndex?: number;
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

/** Where an object first entered the world — provenance for cross-run and
 * cross-generation tracing (a prop can drift across parallel worlds and one day
 * become an exhibited heirloom). Optional & backward-compatible with snapshots
 * predating object provenance; stamped once at creation and never mutated. */
export interface WorldObjectOrigin {
    /** Lab run the object was born in (undefined for engine-seeded season objects,
     *  which the lab layer may backfill). */
    runId?: string;
    /** 1-indexed narrative day at creation. */
    day: number;
    /** Monotonic tick at creation. */
    tick: number;
    /** Season frame (authored slug id) vs placed via the lab UI. */
    source: 'season' | 'lab';
}

/** Objective, versioned physical state. Character memories may disagree with
 * this record; only a validated beat effect may mutate it. */
export interface WorldObject {
    id: string;
    label: string;
    aliases: string[];
    sceneId: string;
    portable: boolean;
    visibility: 'visible' | 'hidden' | 'destroyed';
    /** Object id for a registered container, otherwise an in-scene container label. */
    container?: string;
    /** Character currently carrying it. Structured ownership makes the object
     * follow roster movement; `container` remains the prose-facing placement. */
    carriedBy?: string;
    state?: string;
    version: number;
    /** Characters who know a hidden object's current placement. */
    knownBy: string[];
    /** Birth provenance (stable across forks/resume; never renumbered). */
    origin?: WorldObjectOrigin;
}

/**
 * A DELIBERATE SPOKEN prayer a character voiced at a physical temple (神明 前) —
 * 角色真的來求、對神明說出口的話. This is NOT an internal unspoken want (that is a
 * `Want`, aggregated on the 願榜); a Prayer is the spoken utterance itself,
 * collected on the 願牆. `text` is the spoken line; `wantDesc`/`layer`/`target`
 * carry the 心願 that drove it. Optional & backward-compatible (a world with no
 * temple never records one). */
export interface Prayer {
    id: string;
    characterId: string;
    name: string;
    /** Narrative day + monotonic tick the prayer was spoken. */
    day: number;
    tick: number;
    /** Part-of-day label (清晨/黃昏/…) — when it was spoken. */
    clock?: string;
    /** The temple scene the prayer was spoken at. */
    sceneId: string;
    sceneName: string;
    /** The SPOKEN prayer, addressed to 神明 (first-person, in-character). */
    text: string;
    /** The underlying 心願 that drove the prayer (the want's own words). */
    wantDesc?: string;
    layer?: string;
    /** Optional target character id/name the underlying want ached toward. */
    target?: string;
}

/** A clock-bound fact injected by the world, not authored by a character. The
 * event becomes canon exactly once when `atTick` is reached and is delivered to
 * the named witnesses before they choose where to go. */
export interface ScheduledWorldEvent {
    id: string;
    atTick: number;
    sceneId: string;
    clock?: string;
    text: string;
    visibility: 'public' | 'private';
    witnessIds: string[];
}

/** The fully-serializable world. */
export interface WorldStateData {
    sagaId: string;
    /** Saga premise (world facts that set want resistance). */
    sagaPremise: string;
    /** Canon honorifics facts (稱謂鐵則) — threaded into every scene beat. */
    etiquette?: string;
    /** Structural relationship fallback (b)+(a1): seeded canon-pair views +
     *  nightly self-model consolidation. Flag lives in the world so resume
     *  keeps the run's wiring; validated on long seasons before default-on. */
    relationshipFallback?: boolean;
    cast: CastMember[];
    scenes: SceneInfo[];
    /** characterId → current sceneId. */
    roster: Record<string, string>;
    /** Last tick of an intentional agent move. Optional for snapshots predating
     * the single autonomous movement channel. Also marks "arrived this tick" for
     * the night deliberate-encounter rule. */
    lastMovedTickByChar?: Record<string, number>;
    /** characterId → tick until which a cross-district traveller rests (books the
     * movement time-cost). Only far trips set it; same-district hops stay free.
     * Optional & backward-compatible with snapshots predating distance-cost. */
    restUntilTickByChar?: Record<string, number>;
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
        /** relationshipFallback only: actor → co-present other → today's scene
         *  lines between them, feeding the nightly self-model consolidation. */
        interactions?: Record<string, Record<string, string[]>>;
        /** relationshipFallback only: actor → others a want aimed at them
         *  resolved with today (the latest-wins overwrite trigger). */
        resolvedWith?: Record<string, string[]>;
        /** relationshipFallback only: actor → what真的落地 today (resolved-want
         *  notes) — the nightly 心事自改 trigger; empty day = secret unchanged. */
        landedByChar?: Record<string, string[]>;
    };
    contestedResources: ContestedResource[];
    /** Optional for backward-compatible restore of snapshots predating physics. */
    objects?: WorldObject[];
    /** Optional for snapshots predating machine-readable season clocks. */
    scheduledEvents?: ScheduledWorldEvent[];
    deliveredScheduledEventIds?: string[];
    /** Season money physics (accounts/contracts/ledger); optional for worlds
     * and snapshots predating the economy layer. Persisted with the world so
     * snapshot/restore/rollback carry the ledger atomically. */
    economy?: SeasonEconomyData;
    /** 劇本產出 flag: when on, the tick runs the emergent-production action layer
     *  (characters may spend a tick's action proposing/joining/writing/rehearsing
     *  a play). Off by default — like relationshipFallback, the wiring lives in
     *  the world so resume keeps it, and it's validated before any default-on. */
    emergentProduction?: boolean;
    /** The single in-progress (or premiered) production, when the flag is on.
     *  Persisted with the world so snapshot/restore carries the accumulator. */
    production?: Production;
    /** 班主叫的排戲: the day's called rehearsal (day + 戲碼 + venue). Set at day
     *  start by the 班主's decideRehearsal; the afternoon movement phase pulls the
     *  troupe players to `venueSceneId` so bankRehearsalAttendance banks the roster
     *  (box-office quality) and, with emergentProduction, their rehearse accrues
     *  effort. Optional & backward-compatible with snapshots predating it. */
    rehearsalCall?: { day: number; title: string; venueSceneId: string };
    /** The NUMERIC relationship underlay (bond-graph.ts): directed bond edges
     *  `from→to` with a current value + historical peak. Optional & backward-
     *  compatible — absent on snapshots predating the bond layer; lazily seeded
     *  from canon once per world (empty edges ⇒ stays []). Serialized shape is
     *  `bondsToJSON(g)`. */
    bonds?: Array<{ k: string; v: number; peak: number }>;
    /** Pairs the world has recognised as 相許 (established lovers), each a sorted
     *  `[a,b].sort().join('|')` key. Old lovers renegotiate nothing: an
     *  established night pair opens the intimacy register directly. Optional &
     *  backward-compatible (absent ⇒ nobody established yet). */
    establishedPairs?: string[];
    /** 願牆 — the spoken prayers characters have voiced at a temple (神明 前),
     *  newest appended last. Distinct from `wants` (the internal 心事 on the
     *  願榜): a Prayer is 對神明說出口的話. Optional & backward-compatible — a world
     *  with no temple scene never records one, so `restore` restoring an absent
     *  field leaves the 願牆 empty. */
    prayers?: Prayer[];
}

const SNAPSHOT_FILE = 'world.json';
/** L3 identity is a small, un-evictable working set (CHARACTER_LIFECYCLE §3): a
 *  handful of self-facts, merged when full — never an ever-growing list. */
const CORE_IDENTITY_CAP = 6;

export class WorldState {
    data: WorldStateData;

    constructor(data: WorldStateData) {
        this.data = data;
        this.normalizeLegacyCarriers();
    }

    /** Backward-compatible migration for snapshots that recorded
     * `江聞鶴懷中` only as prose. The frozen beat already established carriage;
     * this derives the missing structure without inventing a new event. */
    private normalizeLegacyCarriers(): void {
        // worlds predating 心事自改: the current secret IS the bedrock seed
        for (const member of this.data.cast) {
            if (member.secret && !member.secretSeed) member.secretSeed = member.secret;
        }
        for (const object of this.data.objects ?? []) {
            if (object.carriedBy || !object.container || object.visibility === 'destroyed') continue;
            if (!/懷|袖|手中|身上|兜|袋/.test(object.container)) continue;
            const carrier = this.data.cast.find((member) => object.container!.includes(member.name));
            if (!carrier) continue;
            object.carriedBy = carrier.id;
            object.sceneId = this.data.roster[carrier.id] ?? object.sceneId;
        }
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

    // ── spatial (district grouping — movement time-cost + 路遇) ─────────────────
    /** The district a scene sits in, or undefined when the seed carries no
     *  location grouping (older snapshots / seeds without location_index). */
    districtOf(sceneId: string): number | undefined {
        return this.sceneById(sceneId)?.locationIndex;
    }
    /** True only when BOTH scenes carry a district and it's the same one — a
     *  few-steps hop. Undefined districts are treated as far (cross-town), so a
     *  seed without grouping keeps the old flat, uniform-cost behaviour. */
    sameDistrict(a: string, b: string): boolean {
        const da = this.districtOf(a);
        const db = this.districtOf(b);
        return da !== undefined && db !== undefined && da === db;
    }
    /** Tri-state for prompt legibility: true = same district, false = a real
     *  cross-town trip, undefined = the seed carries no grouping (so don't mark
     *  distance at all). */
    nearby(a: string, b: string): boolean | undefined {
        const da = this.districtOf(a);
        const db = this.districtOf(b);
        if (da === undefined || db === undefined) return undefined;
        return da === db;
    }
    /** The public "front" of a district — its lowest-privacy scene (ties: lowest
     *  id) — the throat a traveller passes through leaving or entering. undefined
     *  when the district has no scene. Deterministic. */
    districtGate(locationIndex: number): string | undefined {
        let best: SceneInfo | undefined;
        for (const scene of this.data.scenes) {
            if (scene.locationIndex !== locationIndex) continue;
            if (
                !best ||
                scene.privacyLevel < best.privacyLevel ||
                (scene.privacyLevel === best.privacyLevel && scene.id < best.id)
            ) {
                best = scene;
            }
        }
        return best?.id;
    }
    /** The scenes a cross-district traveller passes on the road: the origin
     *  district's gate, then the destination district's gate — the endpoints and
     *  any duplicate removed. EMPTY for a same-district hop (no road to walk).
     *  These are exactly where a roadside 路遇 can waylay the traveller. */
    transitWaypoints(fromSceneId: string, toSceneId: string): string[] {
        if (this.sameDistrict(fromSceneId, toSceneId)) return [];
        const fromDistrict = this.districtOf(fromSceneId);
        const toDistrict = this.districtOf(toSceneId);
        const seen = new Set<string>([fromSceneId, toSceneId]);
        const out: string[] = [];
        for (const district of [fromDistrict, toDistrict]) {
            if (district === undefined) continue;
            const gate = this.districtGate(district);
            if (gate && !seen.has(gate)) {
                seen.add(gate);
                out.push(gate);
            }
        }
        return out;
    }

    objectById(id: string): WorldObject | undefined {
        return (this.data.objects ?? []).find((object) => object.id === id);
    }

    private containerOpen(object: WorldObject): boolean {
        if (!object.container) return true;
        const parent = this.objectById(object.container);
        if (!parent) return true;
        return parent.visibility !== 'destroyed' && parent.state !== 'closed' && this.containerOpen(parent);
    }

    objectAccessibleTo(object: WorldObject, characterId: string, sceneId: string): boolean {
        if (object.visibility === 'destroyed' || object.sceneId !== sceneId || !this.containerOpen(object)) return false;
        if (object.carriedBy && object.carriedBy !== characterId && object.visibility !== 'visible') return false;
        return object.visibility === 'visible' || object.knownBy.includes(characterId);
    }

    /** The only roster mutation entry point inside the engine. Carried objects
     * move atomically with their carrier, so positions cannot diverge. */
    moveCharacter(characterId: string, sceneId: string): void {
        this.data.roster[characterId] = sceneId;
        for (const object of this.data.objects ?? []) {
            if (object.carriedBy === characterId && object.visibility !== 'destroyed') object.sceneId = sceneId;
        }
    }

    accessibleObjects(characterId: string, sceneId: string): WorldObject[] {
        return (this.data.objects ?? []).filter((object) => this.objectAccessibleTo(object, characterId, sceneId));
    }

    /** Actor-specific physical affordances. Public knowledge is deliberately not
     * included: remembering an object elsewhere does not put it in this room. */
    physicalHint(characterId: string, sceneId: string): string {
        const objects = this.accessibleObjects(characterId, sceneId);
        if (!objects.length) return '本場沒有可觸碰的登記物件。知道別處有某物，不等於眼前有它；只能在話裡提及。';
        return [
            '本場可觸碰的登記物件（id 是物理提交用，不必說出口）：',
            ...objects.map((object) => {
                const carried = object.carriedBy ? `，由${this.nameById(object.carriedBy)}隨身攜帶` : '';
                const placement = object.container ? `，在${this.objectById(object.container)?.label ?? object.container}內` : '';
                const hidden = object.visibility === 'hidden' ? '【隱藏；未公開前，旁人只能看見你的外在動作】' : '';
                return `- ${object.id}＝${object.label}${hidden}${carried}${placement}${object.state ? `，狀態：${object.state}` : ''}`;
            }),
            '除此清單外，記憶裡的物件只可在話裡或心裡提及，不可看見、指向或觸碰。',
        ].join('\n');
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

    // ── bonds (numeric relationship underlay) + 相許 milestone ──────────────────
    /** Canonical, order-independent key for an unordered pair. */
    pairKey(a: string, b: string): string {
        return [a, b].sort().join('|');
    }
    /** True once this pair has been recognised as 相許 (either direction marks it —
     *  old lovers). Reads the persisted set; absent ⇒ false. */
    isEstablished(a: string, b: string): boolean {
        return (this.data.establishedPairs ?? []).includes(this.pairKey(a, b));
    }
    /** Record this pair as 相許 (idempotent). */
    addEstablished(a: string, b: string): void {
        const key = this.pairKey(a, b);
        const set = (this.data.establishedPairs ??= []);
        if (!set.includes(key)) set.push(key);
    }
    // ── 願牆 (spoken prayers at a temple) ──────────────────────────────────────
    /** Record one spoken prayer onto the 願牆 (append-only; lazily created). */
    addPrayer(prayer: Prayer): void {
        (this.data.prayers ??= []).push(prayer);
    }
    /** Has this character already voiced a prayer today? The once-per-day bound
     *  that keeps a temple from flooding — a prayer is a deliberate visit, not a
     *  reflex. Absent 願牆 ⇒ false. */
    prayedToday(characterId: string, day: number): boolean {
        return (this.data.prayers ?? []).some((p) => p.characterId === characterId && p.day === day);
    }

    /** Rebuild the working bond graph from the persisted rows (empty ⇒ empty Map). */
    bondGraph(): BondGraph {
        return bondsFromJSON(this.data.bonds);
    }
    /** Persist a working bond graph back onto the world (snapshot serializes it). */
    setBonds(g: BondGraph): void {
        this.data.bonds = bondsToJSON(g);
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
        if (!Array.isArray(data.objects)) data.objects = [];
        return new WorldState(data);
    }
}
