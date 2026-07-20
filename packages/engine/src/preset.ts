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
import type { RecallPort } from './ports.ts';
import { activePresetId, activeSeasonId, defaultSeasonsDir, defaultStoriesDir } from './workspace-paths.ts';
import { seedSeasonEconomy, type SeasonEconomyFrame } from './core/season-economy.ts';
import { seedHousing } from './core/housing.ts';
import { makeClock } from './adapters/local/clock.ts';
import {
    WorldState,
    type CastMember,
    type ContestedResource,
    type SceneInfo,
    type Skill,
    type WorldStateData,
} from './world-state.ts';

/** The slice of the preset shape the engine reads (the rest is chain-only). */
interface RawPreset {
    id: string;
    label?: string;
    saga?: {
        name?: string;
        description?: string;
        nature_prompt?: string;
        /** narrative.etiquette = canon honorifics facts (稱謂鐵則). */
        narrative?: { etiquette?: string };
    };
    /** Authored canon-pair one-line views (from → to, first person, ≤40字),
     *  derived from the cast's secrets. Seeded only when the relationship
     *  fallback wiring is enabled — the always-on structural bias. */
    relationship_views?: Array<{ from: string; to: string; view: string }>;
    drama_resources?: Array<{ label: string; statement?: string }>;
    scenes?: Array<{ name: string; description?: string; privacy?: number; capacity?: number; location_index?: number }>;
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
        /** Authored SKILLS — style-imparting capabilities (see `Skill`). Carried
         *  verbatim onto the CastMember; optional & backward-compatible. */
        skills?: Skill[];
    }>;
}

export interface SeasonFrame {
    id: string;
    title: string;
    centralQuestion: string;
    incitingIncident: string;
    deadline: string;
    stakes: string[];
    publicFacts: string[];
    contestedResources?: Array<{ label: string; statement?: string }>;
    openingScene?: string;
    initialObjects?: Array<{
        id: string;
        label: string;
        aliases?: string[];
        scene: string;
        portable?: boolean;
        visibility?: 'visible' | 'hidden';
        container?: string;
        state?: string;
        /** Omit for public props. Hidden biographical objects should name only
         * characters whose seed memories establish knowledge of them. */
        knownByNames?: string[];
    }>;
    /** Clock-bound world facts. `atTick` is relative to the fresh season start;
     * they enter canon before movement on that tick, so the deadline is an
     * affordance-changing event rather than decorative prompt prose. */
    scheduledEvents?: Array<{
        id: string;
        atTick: number;
        scene: string;
        clock?: string;
        text: string;
        visibility?: 'public' | 'private';
        witnessNames?: string[];
    }>;
    /** Season money physics: accounts, wages, priced affordances and structured
     * contracts. Seeded into WorldStateData.economy so a contract's advance is
     * real escrowed money, never a text-only prop. */
    economy?: SeasonEconomyFrame;
    /** role → per-part-of-day duty schedule (行當專屬節律). sceneName resolved to id
     * at seed time; a character whose role has no entry keeps the generic rhythm. */
    occupationDuties?: Record<string, Array<{ part: string; sceneName: string; duty?: boolean; note?: string }>>;
    /** 房產/租約 — 擁有權≠使用權 的開局配置; each private dwelling's 屋主 (deed) and
     * optional 租客 (lease: holds a physical key + standing use-right). Seeded so the
     * world begins housing-STABLE (everyone already housed; no money flows). */
    properties?: Array<{ scene: string; ownerNames: string[]; lease?: { tenantName: string; keyObjectId: string; keyLabel?: string; rentYuan?: number; rentDueDay?: number; rentLabel?: string } }>;
}

export { activePresetId, activeSeasonId, defaultSeasonsDir, defaultStoriesDir, labRoot, scriptsRoot } from './workspace-paths.ts';

/** Read + parse a preset JSON. Throws loudly if the file is missing. */
export function loadPresetFile(presetId: string, storiesDir?: string): RawPreset {
    const dir = storiesDir ?? defaultStoriesDir();
    const file = path.join(dir, `${presetId}.json`);
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as RawPreset; // throws if absent
}

export function loadSeasonFrameFile(seasonId: string, seasonsDir?: string): SeasonFrame {
    const dir = seasonsDir ?? defaultSeasonsDir();
    const file = path.join(dir, `${seasonId}.json`);
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as SeasonFrame;
}

/** Load the season named by `ES_ACTIVE_SEASON`, or the explicit id. */
export function loadSeasonFrame(seasonId?: string, seasonsDir?: string): SeasonFrame {
    const id = seasonId ?? activeSeasonId();
    if (!id) throw new Error('no season id: pass one or set ES_ACTIVE_SEASON');
    return loadSeasonFrameFile(id, seasonsDir);
}

/**
 * Add a season's public situation to the shared saga seed without rewriting
 * any character biography, secret or memory. The frame is world context, not
 * a prescribed outcome: it states the incident, clock and costs, then leaves
 * every response to the characters.
 */
export function applySeasonFrame(world: WorldState, frame: SeasonFrame): void {
    const block = [
        `【本季：${frame.title}】`,
        `中心問題：${frame.centralQuestion}`,
        `公開事件：${frame.incitingIncident}`,
        `期限：${frame.deadline}`,
        '已公開的世界事實：',
        ...frame.publicFacts.map((fact) => `- ${fact}`),
        '無法同時保全的代價：',
        ...frame.stakes.map((stake) => `- ${stake}`),
        '這些只是世界事實與壓力；沒有任何角色的選擇、台詞、感情或結局被預先決定。',
    ].join('\n');
    world.data.sagaPremise = `${world.data.sagaPremise}\n\n${block}`;

    const existing = new Set(world.data.contestedResources.map((resource) => resource.label));
    for (const resource of frame.contestedResources ?? []) {
        if (existing.has(resource.label)) continue;
        world.data.contestedResources.push({ ...resource });
        existing.add(resource.label);
    }

    appendMissingSeasonObjects(world, frame, false);

    const scheduled = (world.data.scheduledEvents ??= []);
    const scheduledIds = new Set(scheduled.map((event) => event.id));
    const seasonStartTick = world.data.clock.currentTick;
    for (const spec of frame.scheduledEvents ?? []) {
        if (scheduledIds.has(spec.id)) throw new Error(`duplicate scheduled event id: ${spec.id}`);
        if (!Number.isInteger(spec.atTick) || spec.atTick < 0) {
            throw new Error(`scheduled event ${spec.id} has invalid atTick: ${spec.atTick}`);
        }
        const scene = world.data.scenes.find((candidate) => candidate.name === spec.scene);
        if (!scene) throw new Error(`scheduled event ${spec.id} references unknown scene: ${spec.scene}`);
        const witnessIds = spec.witnessNames?.map((name) => {
            const id = world.idByName(name);
            if (!id) throw new Error(`scheduled event ${spec.id} references unknown witness: ${name}`);
            return id;
        }) ?? world.data.cast.map((member) => member.id);
        scheduled.push({
            id: spec.id,
            atTick: seasonStartTick + spec.atTick,
            sceneId: scene.id,
            clock: spec.clock,
            text: spec.text,
            visibility: spec.visibility ?? 'public',
            witnessIds,
        });
        scheduledIds.add(spec.id);
    }

    if (frame.economy && !world.data.economy) seedSeasonEconomy(world, frame.economy, frame.id);

    // 房產/租約/實體鑰匙: after the economy seed, record each private dwelling's deed
    // (擁有權) and hand any 租客 a standing key OBJECT (使用權). A housing-STABLE
    // opening — everyone already housed, no money moves (rent is a later stage).
    // Absent `properties` ⇒ no-op, so a world without deeds behaves exactly as today.
    if (frame.properties?.length) {
        seedHousing(
            world,
            frame.properties.map((p) => ({
                sceneName: p.scene,
                ownerNames: p.ownerNames,
                lease: p.lease && {
                    tenantName: p.lease.tenantName,
                    keyObjectId: p.lease.keyObjectId,
                    keyLabel: p.lease.keyLabel,
                    rentYuan: p.lease.rentYuan,
                    rentDueDay: p.lease.rentDueDay,
                    rentLabel: p.lease.rentLabel,
                },
            })),
        );
    }

    // 行當專屬節律: resolve each character's per-part-of-day duty from the frame's
    // role-keyed schedule. A duty names a venue the character is ON-POST at (歌女
    // 入夜唱堂會、記者深宵趕稿、班主坐鎮後台) — a stronger pull than the generic
    // work/home rhythm. Unknown scenes are skipped (a partial schedule still
    // seeds); an empty result leaves `duties` unset so snapshots stay clean.
    if (frame.occupationDuties) {
        for (const member of world.data.cast) {
            const sched = frame.occupationDuties[member.role ?? ''];
            if (!sched) continue;
            const duties = sched.flatMap((entry) => {
                const scene = world.data.scenes.find((candidate) => candidate.name === entry.sceneName);
                if (!scene) return [];
                return [{ part: entry.part, sceneId: scene.id, duty: entry.duty ?? true, note: entry.note }];
            });
            if (duties.length) member.duties = duties;
        }
    }
}

function appendMissingSeasonObjects(world: WorldState, frame: SeasonFrame, tolerateExisting: boolean): number {
    const objects = (world.data.objects ??= []);
    const knownIds = new Set(objects.map((object) => object.id));
    const allCharacters = world.data.cast.map((member) => member.id);
    let added = 0;
    for (const spec of frame.initialObjects ?? []) {
        if (knownIds.has(spec.id)) {
            if (tolerateExisting) continue;
            throw new Error(`duplicate season object id: ${spec.id}`);
        }
        const scene = world.data.scenes.find((candidate) => candidate.name === spec.scene);
        if (!scene) throw new Error(`season object ${spec.id} references unknown scene: ${spec.scene}`);
        const knownBy = spec.knownByNames?.map((name) => {
            const id = world.idByName(name);
            if (!id) throw new Error(`season object ${spec.id} references unknown knower: ${name}`);
            return id;
        }) ?? allCharacters;
        objects.push({
            id: spec.id,
            label: spec.label,
            aliases: [...new Set([spec.label, ...(spec.aliases ?? [])])],
            sceneId: scene.id,
            portable: spec.portable !== false,
            visibility: spec.visibility ?? 'visible',
            container: spec.container,
            state: spec.state,
            version: 0,
            knownBy: [...new Set(knownBy)],
            // provenance stamped at seed/reconcile time (deterministic from the clock)
            origin: { day: world.data.clock.day, tick: world.data.clock.currentTick, source: 'season' },
        });
        knownIds.add(spec.id);
        added += 1;
    }
    return added;
}

/** Idempotent resume migration. It only appends newly declared objects and
 * never overwrites a prop that characters have already moved or changed. */
export function reconcileSeasonObjects(world: WorldState, frame: SeasonFrame): number {
    return appendMissingSeasonObjects(world, frame, true);
}

/** Deterministic identity distillation for the durable self-model: 「我是<name>，
 *  <行當>」 + the bio's first clause (kept short). No LLM — nightly §2.52 insight
 *  and explicit canon seeding refine it later. */
function distillIdentity(name: string, role: string | undefined, description: string): string[] {
    const facts: string[] = [`我是${name}${role ? `，${role}` : ''}`];
    const firstClause = description.split(/[。；;\n]/)[0]?.trim();
    if (firstClause && firstClause.length <= 40 && firstClause !== description.trim()) facts.push(firstClause);
    return facts;
}

/**
 * Seed each character's CURRENT relationship view from the seeded canon edges,
 * as a first-person one-liner. This is the initial mutable self-model for the
 * relationship channel; nightly consolidation OVERWRITES it as relationships
 * change. Call AFTER the harness has seeded its `setEdge` canon. `overrides`
 * lets a harness pin richer authored lines (柳→金鳳 debt, 柳→蘇 暗戀, …) that a
 * bare tone token can't carry. Keyed [fromName, toName] → line.
 */
export function seedRelationshipViews(
    world: WorldState,
    overrides: Array<{ from: string; to: string; view: string }> = [],
): number {
    let seeded = 0;
    // 1) derive a plain line from every canon edge tone.
    for (const [fromId, row] of Object.entries(world.data.edges)) {
        for (const [toId, edge] of Object.entries(row)) {
            world.setRelationshipView(fromId, toId, `${edge.tone}（${world.nameById(toId)}）`);
            seeded++;
        }
    }
    // 2) pin the authored canon lines on top (latest-wins).
    for (const o of overrides) {
        const fromId = world.idByName(o.from);
        const toId = world.idByName(o.to);
        if (fromId && toId) {
            world.setRelationshipView(fromId, toId, o.view);
            seeded++;
        }
    }
    return seeded;
}

/** Build a fresh WorldState from a parsed preset (pure; no I/O, no recall). */
export function buildWorldState(raw: RawPreset, sagaId = raw.id, ticksPerDay = 6): WorldState {
    const scenes: SceneInfo[] = (raw.scenes ?? []).map((s, i) => {
        const privacyLevel = s.privacy ?? 0;
        const capacity = s.capacity ?? (privacyLevel >= 3 ? 2 : privacyLevel >= 2 ? 4 : 8);
        if (!Number.isInteger(capacity) || capacity < 1) {
            throw new Error(`[preset] scene "${s.name}" has invalid capacity: ${capacity}`);
        }
        return {
            id: `s${i}`,
            name: s.name,
            description: s.description,
            privacyLevel,
            capacity,
            // The preset groups scenes under locations (location_index) — the
            // generic "district" a scene belongs to. Carried so the tick can tell
            // a few-steps hop (same district) from a real cross-town journey
            // (movement time-cost + roadside 路遇). Optional: seeds/snapshots
            // without it fall back to the flat, uniform-cooldown behaviour.
            ...(Number.isInteger(s.location_index) ? { locationIndex: s.location_index } : {}),
        };
    });
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
            secretSeed: c.secret,
            gender: c.gender,
            age: c.ageYears,
            role: c.role,
            state: { fatigue: 0.3, hunger: 0.2, mood: 0 },
            // Seed the durable self-model from persona: name + 行當 + the first
            // clause of the bio as a deterministic identity distillation (no LLM).
            // relationshipView starts empty; the seeded relationship canon (edges)
            // fills it via `seedRelationshipViews`, and nightly consolidation
            // overwrites it thereafter.
            coreIdentity: distillIdentity(c.name, c.role, c.description),
            relationshipView: {},
            // Authored skills carried verbatim (omit the field when none, so a
            // skill-less preset produces a skill-less — unchanged — CastMember).
            ...(c.skills?.length ? { skills: c.skills } : {}),
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
        etiquette: raw.saga?.narrative?.etiquette,
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
        objects: [],
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
