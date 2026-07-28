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
import { activeDeckId, activePresetId, activeSeasonId, defaultDecksDir, defaultSeasonsDir, defaultStoriesDir } from './workspace-paths.ts';
import { seedSeasonEconomy, type SeasonEconomyFrame } from './core/season-economy.ts';
import { seedSecretLedger } from './core/secret-ledger.ts';
import type { EventDeck } from './core/event-deck.ts';
import { seedHousing } from './core/housing.ts';
import { seedRenown } from './core/renown.ts';
import { makeClock } from './adapters/local/clock.ts';
import { bondsToJSON, seedBond } from './core/bond-graph.ts';
import {
    WorldState,
    type CastMember,
    type ContestedResource,
    type SceneInfo,
    type SceneCapability,
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
    /** Explicit numeric relationship underlay for STRICT; names resolve at seed. */
    bonds?: Array<{ from: string; to: string; value: number }>;
    /** Explicit unordered 相許 pairs for STRICT. */
    established_pairs?: Array<[string, string]>;
    drama_resources?: Array<{ label: string; statement?: string }>;
    scenes?: Array<{
        name: string;
        description?: string;
        privacy?: number;
        capacity?: number;
        location_index?: number;
        capabilities?: SceneCapability[];
    }>;
    founding_cast?: Array<{
        name: string;
        ageYears?: number;
        gender?: string;
        role?: string;
        publicly_recognizable?: boolean;
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
        /** Finite authored mechanism state. Free-text `state` remains display
         * text and a legacy fallback only while STRICT is off. */
        stateTags?: string[];
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
    /** 相識分寸 (subjective acquaintance): when true, the RUN harness (lab manager /
     * CLI) turns on `world.data.subjectiveNaming` and seeds the acquaintance map for
     * this season — characters refer to each other at their own resolution of
     * acquaintance (不識／認姓／識全名). Read at the run layer AFTER cast/edges/views are
     * seeded, NOT inside `applySeasonFrame`, so a world built directly from a frame
     * (engine tests) stays flag-off / byte-identical. Absent ⇒ off. */
    subjectiveNaming?: boolean;
    /** 劇本產出 — a season whose 命題 IS the making of a play declares it needs the
     *  emergent-production layer, rather than the operator having to remember a
     *  flag. Read at the RUN layer (CLI / lab manager) after the world is built,
     *  exactly like `subjectiveNaming`. Absent ⇒ off, as before. */
    emergentProduction?: boolean;
    /** 口碑 — per-character seed of PUBLIC 名頭 (renown) + PRIVATE 自視 (self-regard),
     * keyed by character name. Each value is 0..1; `self` may DIVERGE from `renown`
     * (當紅卻怕不夠好). A name absent here takes a ROLE-based default (see
     * `core/renown.ts`); seeded idempotently by `applySeasonFrame` (only sets what is
     * still undefined, so a resumed world keeps its earned values). Optional &
     * backward-compatible. */
    renown?: Record<string, { renown?: number; self?: number }>;
}

export { activeDeckId, activePresetId, activeSeasonId, defaultDecksDir, defaultSeasonsDir, defaultStoriesDir, labRoot, scriptsRoot } from './workspace-paths.ts';

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

// ── 事件牌組 (deck loading + validation) ───────────────────────────────────────

/**
 * Load and VALIDATE an event deck. The deck is authored data an operator edits by
 * hand, so every structural mistake must be caught here, loudly, at load time —
 * not discovered halfway through a run when a card refuses to resolve.
 *
 * Deliberately strict about the two things that would let the director escape
 * their box: duplicate card ids (which would make the director log ambiguous) and
 * `cast-enter` effects naming a newcomer the deck never declared (which would be
 * the model inventing a character).
 */
export function loadEventDeckFile(deckId: string, decksDir?: string): EventDeck {
    const dir = decksDir ?? defaultDecksDir();
    const file = path.join(dir, `${deckId}.json`);
    const deck = JSON.parse(fs.readFileSync(file, 'utf-8')) as EventDeck;
    validateEventDeck(deck);
    return deck;
}

/** Load the deck named by `ES_ACTIVE_DECK`, or the explicit id. */
export function loadEventDeck(deckId?: string, decksDir?: string): EventDeck {
    const id = deckId ?? activeDeckId();
    if (!id) throw new Error('no deck id: pass one or set ES_ACTIVE_DECK');
    return loadEventDeckFile(id, decksDir);
}

/** Structural validation. Throws on the first real problem, listing all of them. */
export function validateEventDeck(deck: EventDeck): void {
    const problems: string[] = [];
    if (!deck.id?.trim()) problems.push('deck 缺 id');
    if (!Array.isArray(deck.cards) || !deck.cards.length) problems.push('deck 沒有任何 card');
    const seen = new Set<string>();
    const newcomerIds = new Set((deck.newcomers ?? []).map((row) => row.id));
    const secretIds = new Set((deck.secrets ?? []).map((row) => row.id));
    for (const card of deck.cards ?? []) {
        if (!card.id?.trim()) problems.push('有一張 card 缺 id');
        else if (seen.has(card.id)) problems.push(`card id 重複：${card.id}`);
        else seen.add(card.id);
        if (!card.label?.trim()) problems.push(`card ${card.id} 缺 label（卡面）`);
        if (!card.targeting?.mode) problems.push(`card ${card.id} 缺 targeting.mode`);
        if (card.targeting?.mode === 'named' && !card.targeting.names?.length) {
            problems.push(`card ${card.id} 是 named 卻沒點名`);
        }
        if (card.targeting?.mode === 'director-pick' && !(card.targeting.pickCount >= 1)) {
            problems.push(`card ${card.id} 是 director-pick 卻沒說挑幾個`);
        }
        if (!card.effects?.length) problems.push(`card ${card.id} 沒有任何 effect`);
        for (const part of card.trigger?.atParts ?? []) {
            if (!Number.isInteger(part) || part < 0 || part > 5) {
                problems.push(`card ${card.id} 的 atParts 有非法時辰索引：${part}（須為 0–5）`);
            }
        }
        if (card.mustLand && !card.trigger?.onDays?.length && card.trigger?.everyDays === undefined) {
            problems.push(`card ${card.id} 標了 mustLand 卻沒有到日之依據（onDays 或 everyDays）`);
        }
        for (const effect of card.effects ?? []) {
            if (effect.kind === 'cast-enter' && !newcomerIds.has(effect.newcomerId)) {
                problems.push(`card ${card.id} 的 cast-enter 指向牌組未宣告的人選：${effect.newcomerId}`);
            }
            if ((effect.kind === 'leak-secret' || effect.kind === 'publish-secret') && !secretIds.has(effect.secretId)) {
                problems.push(`card ${card.id} 的 ${effect.kind} 指向牌組未宣告的秘密：${effect.secretId}`);
            }
        }
    }
    // 世情動作 — validated on the same terms as a card, because it IS a card in
    // every respect except who is allowed to play it. `cast-enter` is the one
    // effect no act may carry: a character conjuring a person into the world is
    // the one authority even the director does not have.
    const actIds = new Set<string>();
    for (const act of deck.acts ?? []) {
        if (!act.id?.trim()) problems.push('有一個 act 缺 id');
        else if (actIds.has(act.id)) problems.push(`act id 重複：${act.id}`);
        else actIds.add(act.id);
        if (seen.has(act.id)) problems.push(`act id 與 card id 撞了：${act.id}（同一本 log，id 不能共用）`);
        if (!act.label?.trim()) problems.push(`act ${act.id} 缺 label（卡面）`);
        if (!act.effects?.length) problems.push(`act ${act.id} 沒有任何 effect`);
        for (const effect of act.effects ?? []) {
            if (effect.kind === 'cast-enter') {
                problems.push(`act ${act.id} 不得帶 cast-enter：招人進班不是角色能做的事`);
            }
            if ((effect.kind === 'leak-secret' || effect.kind === 'publish-secret') && !secretIds.has(effect.secretId)) {
                problems.push(`act ${act.id} 的 ${effect.kind} 指向牌組未宣告的秘密：${effect.secretId}`);
            }
            if (effect.kind === 'standing' && !effect.tone?.trim()) {
                problems.push(`act ${act.id} 的 standing 沒有 tone（人心轉向總得有句話）`);
            }
        }
        // 對人做的事沒有對象就永遠不會亮牌 —— 那是作者的筆誤，不是世界的狀態。
        if (act.needsTarget === false && act.effects?.some((effect) =>
            (effect.kind === 'standing' && (effect.from === 'targets' || effect.toward === 'targets')) ||
            effect.kind === 'cast-exit',
        )) {
            problems.push(`act ${act.id} 沒有對象，卻帶著只對對象生效的後果`);
        }
    }
    // A card's `standing` effect has no actor to resolve, so it may not name one.
    for (const card of deck.cards ?? []) {
        for (const effect of card.effects ?? []) {
            if (effect.kind === 'standing' && (effect.from === 'actor' || effect.toward === 'actor')) {
                problems.push(`card ${card.id} 的 standing 用了 'actor'，但事件卡沒有行為人（那是世情動作的欄位）`);
            }
            if ((effect.kind === 'renown' || effect.kind === 'self-regard') && effect.on && effect.on !== 'targets') {
                problems.push(`card ${card.id} 的 ${effect.kind}.on 用了 '${effect.on}'，但事件卡沒有行為人`);
            }
        }
    }
    if (problems.length) throw new Error(`[deck] ${deck.id ?? '(無 id)'} 不合格：\n- ${problems.join('\n- ')}`);
}

/**
 * Attach a deck's authored secrets to a world. Idempotent by secret id, so
 * re-attaching on resume is safe. Records `deckId` for provenance; the deck
 * itself is never persisted into the world (it is data on disk, and a run must
 * not carry a stale copy of it).
 */
export function attachEventDeck(world: WorldState, deck: EventDeck): number {
    world.data.deckId = deck.id;
    return seedSecretLedger(world, deck.secrets ?? []);
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

    // 口碑: seed each member's PUBLIC 名頭 + PRIVATE 自視 from the frame's optional
    // name-keyed table (else a role default). Idempotent per field — a resumed world
    // keeps values already earned on the box office. renown is NOT money; this
    // touches no ledger and leaves `auditSeasonEconomy` untouched.
    seedRenown(world, frame.renown);
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
            ...(world.data.strictStructured && spec.stateTags?.length
                ? { stateTags: [...new Set(spec.stateTags)] }
                : {}),
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

// ── 中途入場（mid-run cast join） ────────────────────────────────────────────

/** 舊誼 —— a joiner's pre-existing tie to someone ALREADY in the cast. Both
 *  halves are authored subjectivity (never derived), matching the founding
 *  `relationship_views` discipline: the view is what the joiner FEELS, not
 *  objective truth. Warmth seeds the bond graph both ways (a shared past is a
 *  symmetric starting temperature; asymmetry grows in play). */
export interface JoinCastTie {
    /** 對象之名 —— 須已在卷中（按名解析）。 */
    target: string;
    /** 關係語（新人 → 對象的 edge tone），如 師姐／舊識／恩客。 */
    tone?: string;
    /** Structured welcome/routing disposition; STRICT never derives it from tone. */
    disposition?: 'warm' | 'neutral' | 'cold';
    /** 對象 → 新人的關係語；不給則不種（對方未必這樣看）。 */
    toneBack?: string;
    /** 新人「我看TA」一句話。 */
    view?: string;
    /** 對象「TA看我」一句話；不給則不種。 */
    viewBack?: string;
    /** 情分溫度 0..1，雙向同值種入 bond graph；不給則只靠 tone 的 welcome 檔位。 */
    warmth?: number;
}

export interface JoinCastInput {
    name: string;
    /** Public persona (same semantics as founding `description`). */
    description: string;
    /** Private inner life; empty = none (secretSeed mirrors it, as at founding). */
    secret?: string;
    gender?: string;
    ageYears?: number;
    role?: string;
    skills?: Array<{ name: string; kind: string; style: string; level?: number; note?: string }>;
    /** Scene NAMES (as authored), resolved against the live world. */
    home_scene: string;
    work_scene: string;
    /** Where they stand the moment they arrive; defaults to work_scene. */
    arrival_scene?: string;
    /** 帶舊誼入卷 —— 對既在卷中人的既有關係；不給＝與眾人皆為陌生人。 */
    ties?: JoinCastTie[];
}

/**
 * 中途入場 — add one character to a LIVE world, between ticks. Mirrors the
 * founding-cast construction exactly (persona/secret/secretSeed/distilled
 * core identity/state defaults), so a joiner is indistinguishable from a
 * founder except for having no past:
 *   · no wants — the next daytime tick's genesis phase derives them
 *     (`deriveGenesisWants` tops up any member without genesis wants);
 *   · no bonds/edges/views — stranger to everyone until scenes say otherwise;
 *   · no acquaintance entries — under subjective naming that reads as 面生
 *     (the co-worker seeding ran at world start and is never re-run).
 * Pure state mutation, zero I/O: genesis memories are the caller's job
 * (`recall.remember(kind:'genesis')`), as is announcing the arrival as a
 * scheduled world event so co-present witnesses learn it structurally.
 */
export function joinCastMember(world: WorldState, input: JoinCastInput): CastMember {
    const w = world.data;
    const name = input.name.trim();
    if (!name) throw new Error('[join] 入場之人要有名字');
    if (world.idByName(name)) throw new Error(`[join] 已有同名之人在卷中：${name}`);
    if (!input.description.trim()) throw new Error(`[join] ${name} 要有身分描述（persona）`);

    const sceneIdByName = new Map(w.scenes.map((s) => [s.name, s.id]));
    const resolveScene = (sceneName: string | undefined, field: string): string => {
        if (!sceneName) throw new Error(`[join] ${name} 缺 ${field}`);
        const id = sceneIdByName.get(sceneName);
        if (!id) throw new Error(`[join] ${name} 的 ${field}「${sceneName}」不在此卷場景之列`);
        return id;
    };

    // Validate EVERYTHING before touching the world — a refused join must
    // leave the cast/roster byte-identical (no half-added member).
    const homeId = resolveScene(input.home_scene, 'home_scene');
    const workId = resolveScene(input.work_scene, 'work_scene');
    const arrivalId = resolveScene(input.arrival_scene ?? input.work_scene, 'arrival_scene');
    const ties = (input.ties ?? []).map((tie) => {
        const targetId = world.idByName(tie.target.trim());
        if (!targetId) throw new Error(`[join] ${name} 的舊誼對象「${tie.target}」不在卷中`);
        if (tie.warmth !== undefined && !(tie.warmth >= 0 && tie.warmth <= 1)) {
            throw new Error(`[join] ${name} 對「${tie.target}」的情分溫度須在 0–1 之間`);
        }
        return { ...tie, targetId };
    });

    // Next free founding-style id — cast only ever grows, so `c${length}` is
    // free unless a fork/migration left a gap; bump until vacant to be safe.
    let index = w.cast.length;
    while (world.castById(`c${index}`)) index += 1;
    const id = `c${index}`;

    const member: CastMember = {
        id,
        name,
        persona: input.description.trim(),
        secret: input.secret?.trim() || '',
        secretSeed: input.secret?.trim() || '',
        gender: input.gender,
        age: input.ageYears,
        role: input.role,
        state: { fatigue: 0.3, hunger: 0.2, mood: 0 },
        coreIdentity: distillIdentity(name, input.role, input.description),
        relationshipView: {},
        ...(input.skills?.length ? { skills: input.skills } : {}),
    };
    w.cast.push(member);
    w.homeByChar[id] = homeId;
    w.workByChar[id] = workId;
    w.roster[id] = arrivalId;

    // 舊誼落帳 —— 與 founding 的 seedRelationshipViews/seedBond 同一套素材面：
    // edge tone（結構化 tie，beat prompt 的「你對TA」提示之源）、我看TA一句話、
    // 雙向情分溫度；相識分寸下兩造互識全名（帶著過去的人不會面生）。
    if (ties.length) {
        const graph = world.bondGraph();
        for (const tie of ties) {
            if (tie.tone?.trim()) {
                world.setEdge(
                    id,
                    tie.targetId,
                    tie.tone.trim(),
                    tie.disposition,
                );
            }
            if (tie.toneBack?.trim()) world.setEdge(tie.targetId, id, tie.toneBack.trim());
            if (tie.view?.trim()) world.setRelationshipView(id, tie.targetId, tie.view.trim());
            if (tie.viewBack?.trim()) world.setRelationshipView(tie.targetId, id, tie.viewBack.trim());
            if (tie.warmth !== undefined) {
                seedBond(graph, id, tie.targetId, tie.warmth);
                seedBond(graph, tie.targetId, id, tie.warmth);
            }
            if (w.subjectiveNaming) {
                world.setAcquaint(id, tie.targetId, 'named');
                world.setAcquaint(tie.targetId, id, 'named');
            }
        }
        world.setBonds(graph);
    }
    return member;
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
export function buildWorldState(
    raw: RawPreset,
    sagaId = raw.id,
    ticksPerDay = 6,
    opts: { strictStructured?: boolean } = {},
): WorldState {
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
            ...(opts.strictStructured && s.capabilities
                ? { capabilities: [...new Set(s.capabilities)] }
                : {}),
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
            ...(opts.strictStructured &&
            c.publicly_recognizable !== undefined
                ? { publiclyRecognizable: c.publicly_recognizable }
                : {}),
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

    const explicitBonds = new Map();
    const establishedPairs = new Set<string>();
    if (opts.strictStructured) {
        const idByName = new Map(cast.map((member) => [member.name, member.id]));
        for (const bond of raw.bonds ?? []) {
            const from = idByName.get(bond.from);
            const to = idByName.get(bond.to);
            if (!from || !to) {
                throw new Error(
                    `[preset] bond references unknown cast: ${bond.from} -> ${bond.to}`,
                );
            }
            if (!(bond.value >= 0 && bond.value <= 1)) {
                throw new Error(
                    `[preset] bond ${bond.from} -> ${bond.to} must be 0..1`,
                );
            }
            seedBond(explicitBonds, from, to, bond.value);
        }
        for (const pair of raw.established_pairs ?? []) {
            const a = idByName.get(pair[0]);
            const b = idByName.get(pair[1]);
            if (!a || !b) {
                throw new Error(
                    `[preset] established pair references unknown cast: ${pair.join(' / ')}`,
                );
            }
            establishedPairs.add([a, b].sort().join('|'));
        }
    }

    const data: WorldStateData = {
        sagaId,
        sagaPremise: premise,
        ...(opts.strictStructured ? { strictStructured: true } : {}),
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
        ...(opts.strictStructured
            ? {
                  bonds: bondsToJSON(explicitBonds),
                  establishedPairs: [...establishedPairs],
              }
            : {}),
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
    opts: {
        storiesDir?: string;
        sagaId?: string;
        ticksPerDay?: number;
        strictStructured?: boolean;
    } = {},
): Promise<{ world: WorldState; raw: RawPreset; seeded: number }> {
    const raw = loadPresetFile(presetId, opts.storiesDir);
    const world = buildWorldState(
        raw,
        opts.sagaId ?? presetId,
        opts.ticksPerDay,
        { strictStructured: opts.strictStructured },
    );
    const seeded = await seedGenesisMemories(raw, world, recall);
    return { world, raw, seeded };
}

export type { RawPreset };
