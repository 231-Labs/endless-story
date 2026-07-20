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

/**
 * A SKILL — a style-imparting capability that gives a character a distinctive
 * STYLE of conduct and output. This is the character-SKILL framework's data
 * atom: pure authored data, gathered by `core/skills.ts` and injected at
 * matching HANG POINTS (the first being the scene beat). A new skill is just
 * data; a new hang point is one gather call.
 */
export interface Skill {
    /** The skill's name (悲工, 辛辣文筆, 識人眼, 圓場話, 一副好嗓…). */
    name: string;
    /** The DOMAIN this skill colours — a free-text tag (like a want `layer`)
     *  that hang points match against. Canonical: 談(speech/conduct)、風(bearing/
     *  處世)、唱(perform/sing)、身(stage movement)、文(writing)、眼(reading people)、
     *  手(craft). Free-text — new kinds are allowed. */
    kind: string;
    /** A short PROSE descriptor of the style this skill imparts (「悲切，以情帶聲，
     *  一句三嘆」「筆鋒辛辣，一針見血」). This is the ONLY part injected into a prompt
     *  at a matching hang point — never a number. */
    style: string;
    /** Optional 1–5 proficiency: display + tie-break only, NEVER a hard gate. */
    level?: number;
    /** Optional free note (provenance, caveats) — display only. */
    note?: string;
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
    /** The character's SKILLS — style-imparting capabilities that give distinctive
     *  conduct + output (see `Skill`). OPTIONAL & backward-compatible: a character
     *  with no skills reads exactly as before, and snapshots predating skills
     *  restore fine (the field is simply absent). Carried by snapshot/restore as
     *  plain JSON. */
    skills?: Skill[];
    /** 口碑・名頭 (renown) — the PUBLIC street-verdict on this person's standing,
     *  0..1, observable by ALL (名滿上海／名頭黯淡). This is DISTINCT from the private
     *  `bondGraph`/`edges` (personal feeling one soul holds toward another): renown
     *  is what the whole town would say of them. Accrues over a season on the
     *  box-office (滿座長臉、停鑼折面子). Optional & backward-compatible: absent ⇒ a
     *  neutral baseline (`renownOf` ⇒ 0.5). Plain JSON, carried by snapshot/restore. */
    renown?: number;
    /** 自視・自估 (self-regard) — how this person PRIVATELY rates their OWN standing,
     *  0..1. It may DIVERGE from `renown`: a 當紅卻怕不夠好 star carries high renown
     *  and low self-regard; a nobody may think the world owes them their due. Only
     *  ever surfaced to the character themselves (the inner voice), never to others.
     *  Optional & backward-compatible: absent ⇒ falls back to `renownOf` (they rate
     *  themselves as the street does). Plain JSON, carried by snapshot/restore. */
    selfRegard?: number;
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

/**
 * 相識分寸 (subjective acquaintance) — how well a PERCEIVER knows a TARGET, and
 * so how they refer to them:
 *   'stranger'   不識      — trade + appearance, no name（「一個賣生煎的漢子」）。
 *   'acquainted' 認得·知姓 — surname + honorific（「趙師傅」「殷婆婆」），或無姓者以行當代稱。
 *   'named'      識全名    — the full name（「趙阿福」）。
 * SUBJECTIVE: this shapes ONLY what a CHARACTER perceives (their percept/prompt
 * inputs). Authorial narration stays omniscient — `nameById` everywhere in the
 * 述 (day accumulator, weaver, scene-record, logs).
 */
export type AcquaintLevel = 'stranger' | 'acquainted' | 'named';

/** Monotonic order for `setAcquaint`: a level may only ever RISE, never fall. */
const ACQUAINT_RANK: Record<AcquaintLevel, number> = { stranger: 0, acquainted: 1, named: 2 };
/** 老 threshold（歲）for the 老丈／婆婆 person-words + elder honorific. */
const ELDER_AGE = 60;

/** role → 行當 trade-noun（…的）for the不識／認姓稱謂. The built-in v1 map; a season
 *  frame override map is NOT required for v1. Fallback: the raw role string. */
const TRADE_NOUN: Record<string, string> = {
    小販: '賣吃食的', 花婆: '賣花的', 記者: '報館的', 歌女: '堂子的',
    班主: '班主', 衣箱: '管箱的',
    花旦: '戲班的', 小生: '戲班的', 刀馬旦: '戲班的', 丑: '戲班的',
};
/** roles whose gender-neutral surname suffix stands on its own（沈班主／趙班主）. */
const ROLE_SUFFIX: Record<string, string> = { 班主: '班主' };
/** 男 tradesman roles addressed 師傅（擔販／手藝人），else 先生（報人／文墨／台上人）. */
const TRADESMAN_ROLES = new Set(['小販', '衣箱', '花婆']);
/** 女 artisan roles addressed 師傅（管箱的 等），else 姑娘. */
const ARTISAN_ROLES = new Set(['衣箱', '花婆']);

/** A real, addressable surname exists when the name is ≥3字（民國全名如殷阿婆／趙阿福／
 *  方競西）; 2字的藝名（金鳳／連翹）算無姓，認姓層以行當代稱。Deterministic v1 heuristic. */
function hasSurname(name: string): boolean {
    return [...name].length >= 3;
}
function surnameOf(name: string): string {
    return [...name][0] ?? name;
}
/** gender(+age) → a person-word for a nameless reference（漢子／姑娘／老丈／婆婆）. */
function personWord(gender?: string, age?: number): string {
    const old = typeof age === 'number' && age >= ELDER_AGE;
    if (gender === '男') return old ? '老丈' : '漢子';
    if (gender === '女') return old ? '婆婆' : '姑娘';
    return '人';
}
/** surname + honorific for the 認得·知姓 level：趙師傅／殷婆婆／方先生／沈班主／唐師傅. */
function surnameHonorific(name: string, role?: string, gender?: string, age?: number): string {
    const surname = surnameOf(name);
    const suffix = role ? ROLE_SUFFIX[role] : undefined;
    if (suffix) return `${surname}${suffix}`; // gender-neutral（班主）
    const old = typeof age === 'number' && age >= ELDER_AGE;
    if (gender === '男') return `${surname}${role && TRADESMAN_ROLES.has(role) ? '師傅' : '先生'}`;
    if (gender === '女') {
        if (old) return `${surname}婆婆`;
        return `${surname}${role && ARTISAN_ROLES.has(role) ? '師傅' : '姑娘'}`;
    }
    return `${surname}師傅`; // 身不詳 — neutral respectful fallback
}
/** 不識 rendering：trade + person-word（一個賣花的婆婆），或無行當者以面生代之（一位面生的姑娘）. */
function strangerDescriptor(role?: string, gender?: string, age?: number): string {
    const pw = personWord(gender, age);
    const trade = role ? TRADE_NOUN[role] : undefined;
    return trade ? `一個${trade}${pw}` : `一位面生的${pw}`;
}

/** Clamp a 0..1 vector value (renown / self-regard). */
function clamp01(v: number): number {
    return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** 口碑・名頭 descriptor — the PUBLIC verdict rendered as a street-word, for percepts
 *  (never a number in a prompt). Thresholds descend 0.8／0.6／0.4／0.2. Pure. */
export function renownLabel(v: number): string {
    if (v >= 0.8) return '名滿上海';
    if (v >= 0.6) return '名頭正盛';
    if (v >= 0.4) return '小有名氣';
    if (v >= 0.2) return '無甚名氣';
    return '名頭黯淡';
}

/** 自視・自估 descriptor — the INNER voice (how they rate their own斤兩), for the
 *  acting character's self-model only. Same thresholds as `renownLabel`; a famous-
 *  but-insecure star reads 名頭正盛 outside yet 心裡發虛 within. Pure. */
export function selfRegardLabel(v: number): string {
    if (v >= 0.8) return '自負得很';
    if (v >= 0.6) return '頗自許';
    if (v >= 0.4) return '尚算託底';
    if (v >= 0.2) return '心裡不踏實';
    return '心裡發虛';
}

/** 訪問權限 key kind: a 半永久 standing key (self-let-in) vs a 一次性 one-time pass
 *  (led in once, consumed on entry). */
export type AccessGrantKind = 'standing' | 'oneTime';

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
    /** The sceneId this object UNLOCKS — a key OBJECT names its lock (使用權 made
     *  physical: 一把帶在身上的門鑰 vs the abstract grant in `accessGrants`).
     *  Optional & backward-compatible — most objects are not keys; it is seeded
     *  now (housing) and consumed by later stages. Plain JSON, so snapshot/restore
     *  already carry it. */
    keyFor?: string;
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
    /** 相識分寸 (subjective acquaintance) master flag. Absent/false ⇒ the feature
     *  is OFF ⇒ `perceivedName` === `nameById` and `acquaintLevel` === 'named'
     *  everywhere — the ENTIRE engine is byte-identical to a world without this
     *  layer (the backward-compat guarantee). Like relationshipFallback the wiring
     *  lives in the world so resume keeps it; carried verbatim by snapshot/restore. */
    subjectiveNaming?: boolean;
    /** perceiverId → targetId → how well the perceiver knows the target. Only
     *  meaningful when `subjectiveNaming` is on. An absent map, or an unrecorded
     *  pair, ⇒ 'stranger'（不識）; a perceiver's view of THEMSELVES ⇒ always 'named'.
     *  Seeded once by `seedAcquaintance` and raised (monotonically) by the tick's
     *  co-presence / interaction hooks. Carried verbatim by snapshot/restore. */
    acquaintance?: Record<string, Record<string, AcquaintLevel>>;
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
    /** 資助搭救 — giverId → narrative day on which they last ran the aid decision.
     * Bounds the mechanism to ONE aid decision per giver per day (a giver does not
     * re-canvass the room for the needy every daytime tick). Optional & backward-
     * compatible; carried verbatim by snapshot/restore. */
    aidGivenTodayByChar?: Record<string, number>;
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
    /** 叩門夜訪 flag: when on, a ripe 愛/虧欠 want may walk to its target's door at
     *  night — the target home ALONE in a private scene — and KNOCK (求見). No
     *  bypass: entry is the OCCUPANT's one-time 放行 (decideAdmit → grantAccess
     *  oneTime, consumed on entry), never the visitor's ardor; a shut door is also
     *  an answer. Off by default; the wiring lives in the world so resume keeps
     *  it. (Key name kept from the earlier 登門修好 iteration for manifest compat.) */
    reconcileVisit?: boolean;
    /** 借賒有據 flag: when on, the credit verbs are live — 同場可開口告借
     *  （borrow：錢動之前出借的人先點頭 via decideLend，婉拒也是一句回答）、
     *  repay 還帳沖銷欠條、允賒的食擔可賒帳（記成真 bill 帳期，到期照例催討）；
     *  欠條過期自會生怨（settle spawns 虧欠/催討 wants）。Off by default; the
     *  wiring lives in the world so resume keeps it. */
    creditVerbs?: boolean;
    /** 尋人有路 flag: when on, a `seek_person` open action RECORDS a persistent
     *  尋人掛心 (`seeking`) that ROUTES at movement time as a soft pull only —
     *  同場即了、私處且候、三日不遇日結時擱下（記成當事人私有一筆）。Off by
     *  default; like reconcileVisit the wiring lives in the world so resume
     *  keeps it, and with the flag off the deterministic path (including the
     *  FakeSceneAgent's pinned seek_person actions) stays byte-identical. */
    seekRouting?: boolean;
    /** 願望流水號 —— 世界自帶的 want id 序號（快照隨行）。id 由此而出，
     *  同種子重跑 byte-identical；缺席（舊卷）時 newWant 退回舊式 wall-clock id。 */
    wantSeq?: number;
    /** 尋人掛心 — a declared seek_person intention that persists across ticks
     *  until met/expired: actorId → the sought targetId + the tick the intention
     *  was declared. Optional & absent-by-default so snapshots predating it (and
     *  worlds that never seek) restore/serialize untouched. */
    seeking?: Record<string, { targetId: string; sinceTick: number }>;
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
    /** 擁有權 / 地契: sceneId → the OWNER characterId(s) of a private dwelling.
     *  DISTINCT from dwelling: a 租客 lives in (homeByChar) a scene they do NOT own;
     *  the 屋主 owns it whether they live there or not. When a scene has an explicit
     *  deed here, THIS is authoritative for `ownersOf`; absent ⇒ fall back to the
     *  homeByChar derivation (backward-compat). Optional & carried verbatim by
     *  snapshot/restore (plain JSON). */
    propertyOwners?: Record<string, string[]>;
    /** 租約登記: sceneId → 屋主/租客 (+ the rent bill id if the lease bears rent).
     *  Ties deed (擁有權) + use-right (使用權/門鑰) + rent together, so eviction (逐客)
     *  can end all three at once and the UI can surface 收租. DISTINCT from the
     *  economy's `tenancies` move-in scaffolding (a granted-but-not-yet-lived lease
     *  object) — do not conflate them. Optional & backward-compatible: absent ⇒ a
     *  world with no registered leases (behaves exactly as before). Carried verbatim
     *  by snapshot/restore (plain JSON). */
    leases?: Record<string, { ownerId: string; tenantId: string; rentBillId?: string }>;
    /** 訪問權限 — the space access-grant table: per PRIVATE scene (privacyLevel ≥ 3
     *  with an owner), the guests who hold a key. `standing` = 半永久 key-holders
     *  (old lovers, the 師姐, the 金主 — let themselves in), `oneTime` = 一次性
     *  pass-holders (a tentative suitor / a summoned guest — led in ONCE, the pass
     *  consumed on entry). Keyed by sceneId. Optional & backward-compatible: an
     *  absent table is lazily seeded from the warmth gate + canon 相許 (§2.96), so a
     *  world predating this layer behaves the same on day 1; a public world has no
     *  entry at all. Carried verbatim by snapshot/restore (plain JSON). */
    accessGrants?: Record<string, { standing: string[]; oneTime: string[] }>;
    /** true once the one-time social access seed (§2.96) has run; separates
     *  'never seeded' from 'seeded then persisted' now that the housing seed may
     *  pre-populate `accessGrants` (tenant keys) at frame-apply time — so the §2.96
     *  guard can no longer key off `accessGrants === undefined`. Optional &
     *  backward-compatible: an OLD snapshot with `accessGrants` defined but this
     *  field absent was already seeded under the undefined-guard regime, so
     *  `restore` migrates it to `true` (must NOT re-seed). */
    accessSeeded?: boolean;
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
                // 相識分寸: the carrier is named as the VIEWER (characterId) knows them;
                // flag-off ⇒ perceivedName === nameById (byte-identical). A non-cast
                // viewer（'__reviewer__'）stays omniscient inside perceivedName.
                const carried = object.carriedBy ? `，由${this.perceivedName(characterId, object.carriedBy)}隨身攜帶` : '';
                const placement = object.container ? `，在${this.objectById(object.container)?.label ?? object.container}內` : '';
                const hidden = object.visibility === 'hidden' ? '【隱藏；未公開前，旁人只能看見你的外在動作】' : '';
                // 實體鑰匙: a key OBJECT carries a use-right you may hand over — annotate
                // so the acting character knows交手即授、交還屋主即收回. Only for keyFor
                // objects; a non-key world's hint stays byte-identical.
                const keyNote = object.keyFor
                    ? `（此乃「${this.sceneNameById(object.keyFor)}」的門鑰；交到誰手裡，誰便可自行進出，交還屋主便是收回）`
                    : '';
                return `- ${object.id}＝${object.label}${hidden}${carried}${placement}${object.state ? `，狀態：${object.state}` : ''}${keyNote}`;
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

    // ── 口碑 / 自視 (public renown + private self-regard) ──────────────────────
    /** This character's PUBLIC 口碑・名頭, 0..1. Absent (never seeded, or a world
     *  predating the layer) ⇒ 0.5, a neutral baseline. */
    renownOf(id: string): number {
        return this.castById(id)?.renown ?? 0.5;
    }
    /** This character's PRIVATE 自視・自估, 0..1. Absent ⇒ falls back to `renownOf`
     *  (they rate themselves as the street does — until something moves it). */
    selfRegardOf(id: string): number {
        return this.castById(id)?.selfRegard ?? this.renownOf(id);
    }
    /** Nudge PUBLIC renown by `delta`, clamped 0..1. No-op on an unknown id.
     *  Reads through `renownOf`, so a never-seeded member moves from the 0.5 base. */
    /** 下一個 want id —— 世界自帶序號，確定性、快照隨行（w1, w2, …）。舊式
     *  wall-clock id 必含 '-'，新式不含，永不相撞。 */
    nextWantId(): string {
        this.data.wantSeq = (this.data.wantSeq ?? 0) + 1;
        return `w${this.data.wantSeq}`;
    }

    bumpRenown(id: string, delta: number): void {
        const m = this.castById(id);
        if (!m) return;
        m.renown = clamp01(this.renownOf(id) + delta);
    }
    /** Nudge PRIVATE self-regard by `delta`, clamped 0..1. No-op on an unknown id.
     *  Reads through `selfRegardOf`, so an unset self-regard moves from renown. */
    bumpSelfRegard(id: string, delta: number): void {
        const m = this.castById(id);
        if (!m) return;
        m.selfRegard = clamp01(this.selfRegardOf(id) + delta);
    }

    // ── 相識分寸 (subjective acquaintance) ──────────────────────────────────────
    /** How well `perceiverId` knows `targetId`. Self ⇒ always 'named'; flag off ⇒
     *  'named' (so `perceivedName` === `nameById`); else the recorded level, or
     *  'stranger' for an absent/unrecorded pair. */
    acquaintLevel(perceiverId: string, targetId: string): AcquaintLevel {
        if (perceiverId === targetId) return 'named';
        if (!this.data.subjectiveNaming) return 'named';
        return this.data.acquaintance?.[perceiverId]?.[targetId] ?? 'stranger';
    }

    /** Raise `perceiverId`'s acquaintance with `targetId` to `level` — MONOTONIC
     *  (named > acquainted > stranger; never downgrades), idempotent, lazily
     *  creating the map only when the level actually rises. Self is a no-op
     *  (implicitly always 'named'). */
    setAcquaint(perceiverId: string, targetId: string, level: AcquaintLevel): void {
        if (perceiverId === targetId) return;
        const cur = this.data.acquaintance?.[perceiverId]?.[targetId] ?? 'stranger';
        if (ACQUAINT_RANK[level] <= ACQUAINT_RANK[cur]) return; // never downgrade / idempotent
        const table = (this.data.acquaintance ??= {});
        const row = (table[perceiverId] ??= {});
        row[targetId] = level;
    }

    /** How `perceiverId` REFERS to `targetId`, at their acquaintance resolution:
     *  self / flag-off / 'named' ⇒ the full `nameById`; 'acquainted' ⇒ surname +
     *  honorific（趙師傅／殷婆婆），or a行當 descriptor（堂子的）when the target has no
     *  real surname; 'stranger' ⇒ a trade + appearance descriptor（一個賣花的婆婆）.
     *  A non-cast perceiver（如 '__reviewer__'）is authorial ⇒ always omniscient. */
    perceivedName(perceiverId: string, targetId: string): string {
        if (perceiverId === targetId || !this.data.subjectiveNaming) return this.nameById(targetId);
        if (!this.castById(perceiverId)) return this.nameById(targetId); // authorial / synthetic
        const level = this.acquaintLevel(perceiverId, targetId);
        if (level === 'named') return this.nameById(targetId);
        const t = this.castById(targetId);
        if (!t) return this.nameById(targetId); // robustness — unknown target
        if (level === 'acquainted') {
            return hasSurname(t.name)
                ? surnameHonorific(t.name, t.role, t.gender, t.age)
                : TRADE_NOUN[t.role ?? ''] ?? t.role ?? '人'; // 無姓藝名 → 行當代稱（堂子的）
        }
        return strangerDescriptor(t.role, t.gender, t.age); // 不識
    }

    /** Resolve an `addressed` display string — which may be a perceived name
     *  (knownAs) — back to a co-present target id, from the SPEAKER's POV. Tries an
     *  exact canonical-name match first（identical to `idByName`, so flag-off is
     *  byte-identical）; only when the flag is on does it additionally match each
     *  candidate's perceived name. Keeps addressing round-trip-safe. */
    resolveAddressed(speakerId: string, addressed: string, candidateIds: string[]): string | undefined {
        const direct = this.idByName(addressed);
        if (direct) return direct;
        if (!this.data.subjectiveNaming) return undefined;
        for (const tid of candidateIds) {
            if (tid === speakerId) continue;
            const known = this.perceivedName(speakerId, tid);
            if (addressed === known || addressed.includes(known)) return tid;
        }
        return undefined;
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
            // 相識分寸: refer to each other as the acting character KNOWS them;
            // flag-off ⇒ perceivedName === nameById (byte-identical).
            for (const oid of others) out.push(`· ${this.perceivedName(actingId, oid)}：${m.relationshipView[oid]}`);
        }
        // 自視: the PRIVATE inner reckoning of one's own斤兩 — only ever shown to the
        // acting character (self), never to others. Only when it has been seeded/moved
        // (undefined ⇒ nothing to say); a famous-but-insecure star reads 心裡發虛 here.
        if (m.selfRegard !== undefined) {
            out.push(`【你心裡掂量自己的斤兩：${selfRegardLabel(m.selfRegard)}。】`);
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

    // ── 訪問權限 (space access grants) ──────────────────────────────────────────
    /** The OWNERS of a scene — 擁有權, deed-first. A scene with privacyLevel < 3 (or
     *  none) is PUBLIC/unowned (empty list ⇒ free to enter). Otherwise: if an
     *  explicit deed exists in `propertyOwners` (after filtering to ids that resolve
     *  in the cast) and is non-empty, THAT wins — so a 屋主 who does not live here
     *  still owns it, and a 租客 who lives here does NOT. Absent (or all-unresolved)
     *  deed ⇒ fall back to the homeByChar derivation (unchanged for worlds without
     *  deeds): characters whose home is this scene. */
    ownersOf(sceneId: string): string[] {
        const scene = this.sceneById(sceneId);
        if (!scene || scene.privacyLevel < 3) return [];
        const deed = this.data.propertyOwners?.[sceneId];
        if (deed) {
            const resolved = deed.filter((id) => this.castById(id));
            if (resolved.length) return resolved; // the deed is authoritative
        }
        return Object.entries(this.data.homeByChar)
            .filter(([, home]) => home === sceneId)
            .map(([id]) => id);
    }

    /** The scenes `charId` holds the deed to (擁有權), deed-aware via `ownersOf`.
     *  Covers an owner-occupied home AND any rental they own but do not live in —
     *  exactly the set an owner may 換鎖/逐客 on. Unchanged for deedless worlds (the
     *  homeByChar fallback still resolves the owner of their own home). */
    ownedScenesBy(charId: string): string[] {
        return this.data.scenes.filter((s) => this.ownersOf(s.id).includes(charId)).map((s) => s.id);
    }

    /** 收租 — the registered leases whose 屋主 is `ownerId` (UI read helper): each a
     *  rental this character is the landlord of, with the tenant and (if the lease
     *  bears rent) the rent bill id. Empty when the world carries no leases. */
    rentalsBy(ownerId: string): Array<{ sceneId: string; tenantId: string; rentBillId?: string }> {
        const out: Array<{ sceneId: string; tenantId: string; rentBillId?: string }> = [];
        for (const [sceneId, lease] of Object.entries(this.data.leases ?? {})) {
            if (lease.ownerId === ownerId) out.push({ sceneId, tenantId: lease.tenantId, rentBillId: lease.rentBillId });
        }
        return out;
    }

    /** May `charId` enter `sceneId`? PUBLIC (no owner / privacyLevel < 3) ⇒ true;
     *  an OWNER ⇒ true; a standing OR one-time key-holder ⇒ true; else false. Does
     *  NOT consume a one-time pass — that is `consumeOneTime`, called on real entry. */
    canEnter(charId: string, sceneId: string): boolean {
        const owners = this.ownersOf(sceneId);
        if (owners.length === 0) return true; // public / unowned
        if (owners.includes(charId)) return true; // owner
        const rec = this.data.accessGrants?.[sceneId];
        if (!rec) return false;
        return rec.standing.includes(charId) || rec.oneTime.includes(charId);
    }

    /** 授權 — grant `guestId` a key to `sceneId` (idempotent). Never grants to an
     *  owner/self or a public scene (no-op). Granting `standing` drops any redundant
     *  `oneTime` (a permanent key supersedes a single pass); granting `oneTime` when
     *  the guest already holds standing is a no-op (canEnter already admits them). */
    grantAccess(sceneId: string, guestId: string, kind: AccessGrantKind): void {
        const owners = this.ownersOf(sceneId);
        if (owners.length === 0 || owners.includes(guestId)) return; // public or self/owner
        const table = (this.data.accessGrants ??= {});
        const rec = (table[sceneId] ??= { standing: [], oneTime: [] });
        if (kind === 'standing') {
            if (!rec.standing.includes(guestId)) rec.standing.push(guestId);
            rec.oneTime = rec.oneTime.filter((id) => id !== guestId); // standing supersedes a pass
        } else {
            if (rec.standing.includes(guestId)) return; // already a permanent key-holder
            if (!rec.oneTime.includes(guestId)) rec.oneTime.push(guestId);
        }
    }

    /** 撤銷／換鎖 — revoke `guestId`'s key to `sceneId`, dropping it from BOTH sets. */
    revokeAccess(sceneId: string, guestId: string): void {
        const rec = this.data.accessGrants?.[sceneId];
        if (!rec) return;
        rec.standing = rec.standing.filter((id) => id !== guestId);
        rec.oneTime = rec.oneTime.filter((id) => id !== guestId);
    }

    /** Consume `guestId`'s ONE-TIME pass to `sceneId` on entry: if they held a
     *  one-time pass (and are not an owner / standing key-holder), remove it and
     *  return true (the pass was used up). Owners and standing holders consume
     *  nothing (return false) — their access is durable. */
    consumeOneTime(sceneId: string, guestId: string): boolean {
        const rec = this.data.accessGrants?.[sceneId];
        if (!rec) return false;
        if (this.ownersOf(sceneId).includes(guestId)) return false; // owner — durable
        if (rec.standing.includes(guestId)) return false; // standing — durable
        if (!rec.oneTime.includes(guestId)) return false; // held no pass
        rec.oneTime = rec.oneTime.filter((id) => id !== guestId);
        return true;
    }

    /** The private scenes `charId` may enter as a GUEST (holds a key, not owner),
     *  each tagged with the kind of key. UI read helper (內頁 持鑰). */
    keysHeldBy(charId: string): Array<{ sceneId: string; kind: AccessGrantKind }> {
        const out: Array<{ sceneId: string; kind: AccessGrantKind }> = [];
        for (const [sceneId, rec] of Object.entries(this.data.accessGrants ?? {})) {
            if (this.ownersOf(sceneId).includes(charId)) continue; // an owner is not a guest key-holder
            if (rec.standing.includes(charId)) out.push({ sceneId, kind: 'standing' });
            else if (rec.oneTime.includes(charId)) out.push({ sceneId, kind: 'oneTime' });
        }
        return out;
    }

    /** Who holds a key to `sceneId`, each tagged standing/oneTime (standing wins
     *  when both are somehow present). UI read helper (內頁 持鑰). */
    keyHoldersOf(sceneId: string): Array<{ charId: string; kind: AccessGrantKind }> {
        const rec = this.data.accessGrants?.[sceneId];
        if (!rec) return [];
        const out: Array<{ charId: string; kind: AccessGrantKind }> = [];
        for (const id of rec.standing) out.push({ charId: id, kind: 'standing' });
        for (const id of rec.oneTime) if (!rec.standing.includes(id)) out.push({ charId: id, kind: 'oneTime' });
        return out;
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
        // A snapshot written under the old undefined-guard regime carries
        // `accessGrants` but no `accessSeeded`: it was ALREADY seeded (§2.96), so
        // mark it so — otherwise the housing-era guard would re-seed and un-revoke
        // any souring-revoked keys. A fresh, never-seeded world has neither field.
        if (data.accessGrants !== undefined && data.accessSeeded === undefined) data.accessSeeded = true;
        return new WorldState(data);
    }
}
