/**
 * 角色工件 — 日記與詩詞. The cheapest return-visit hook the world has, and the
 * one place where the SAME generated text is content facing outward and a PROP
 * facing inward.
 *
 * Two artifacts, two very different cadences, on purpose:
 *
 *   · 日記 — one per day, and ONLY for a 追蹤中 character. Raw material is that
 *     day's own beats plus the character's 心下/心事; one LLM call recombines
 *     them. Every claim must cite beat evidence, audited by the same
 *     `evidenceRefs` discipline the dossier already uses. That audit is not
 *     ceremony: the last run's dossier caught 白韻秋 with 24 圓 on the books
 *     while her 心事 spoke of 「省著手裡的七十圓」. A diary is a first-person
 *     document that reads as canon, so it is exactly the wrong place to let
 *     drift in. Unsupported claims are KEPT and FLAGGED, never silently cut —
 *     a flagged claim is a diagnosis; a dropped one is a cover-up.
 *
 *   · 詩詞 — occasion-triggered only (a tension peak, a 相許, a refusal, a
 *     parting). No daily quota, because scarcity is what makes a poem worth
 *     anything. A poem also has a body: the discarded draft becomes a WorldObject
 *     another character can pick up and read. 同一份生成物，對外是內容，對內是道具。
 *
 * This module is pure state + auditing. The LLM seats live on SceneAgentPort;
 * nothing here calls a model or touches the filesystem.
 */

import type { WorldState } from '../world-state.ts';
import { accountFace, formatMoney } from './season-economy.ts';
import { forcingLevel, tension, type Want } from './want-core.ts';

// ── evidence ────────────────────────────────────────────────────────────────

/** One citable beat from the artifact's own day. `ref` is the ONLY thing a claim
 *  may cite, and it is engine-minted — a model cannot invent a reference that
 *  resolves. */
export interface ArtifactEvidenceBeat {
    /** `beat:N` — stable within one day, in chronological order. */
    ref: string;
    day: number;
    tick: number;
    clock: string;
    sceneName: string;
    /** what this character objectively did/said. */
    text: string;
    /** their own 心下 for that beat (private, and the diary's real fuel). */
    inner?: string;
}

/** One assertion the artifact makes, with the beats it rests on. */
export interface ArtifactClaim {
    text: string;
    /** `beat:N` refs into the day's evidence. Empty = unsupported. */
    evidenceRefs: string[];
    /** why the audit flagged it, when it did. */
    auditNote?: string;
}

export interface DiaryArtifact {
    kind: 'diary';
    id: string;
    characterId: string;
    name: string;
    day: number;
    /** the prose the reader gets. */
    body: string;
    /** claims whose refs all resolved to real beats of this character's day. */
    claims: ArtifactClaim[];
    /** claims that did NOT survive the audit — kept for the diagnostics. */
    unsupportedClaims: ArtifactClaim[];
    /** how many beats were available as evidence (0 ⇒ a quiet day). */
    evidenceCount: number;
}

export type PoemOccasion = 'tension-peak' | 'betrothed' | 'refused' | 'parting' | 'reckoning';

export interface PoemArtifact {
    kind: 'poem';
    id: string;
    characterId: string;
    name: string;
    day: number;
    tick: number;
    occasion: PoemOccasion;
    title?: string;
    body: string;
    /** 寫廢的詩稿 — the WorldObject this draft became, once it was left somewhere. */
    propObjectId?: string;
    /** the want whose pressure produced it (audit trail for 「為什麼是今天」). */
    wantId?: string;
}

export type CharacterArtifact = DiaryArtifact | PoemArtifact;

// ── audit ───────────────────────────────────────────────────────────────────

/** A money figure written in the artifact, e.g. 「七十圓」/「24 圓」. Both Arabic and
 *  Chinese numerals are checked, because a model writing in-period prose uses
 *  both — and the observed drift (24 vs 七十) crossed exactly that boundary. */
const MONEY_PATTERN = /([0-9]+|[一二三四五六七八九十百千零兩]+)\s*圓/g;

const CHINESE_DIGITS: Record<string, number> = {
    零: 0, 一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
};

/** 中文數字 → number, for the small figures a purse actually holds (≤ 千).
 *  Returns null for anything it cannot read confidently — an unreadable figure is
 *  never used to accuse a claim. */
export function readChineseNumber(raw: string): number | null {
    if (/^[0-9]+$/.test(raw)) return Number(raw);
    // Standard positional reading: `digit` is the pending numeral, `section` the
    // running value below 千. 「十二」 = 10 then +2 (NOT 10×10+2), which is why the
    // pending digit must be flushed by the unit rather than shifted into it.
    let total = 0;
    let section = 0;
    let digit = 0;
    let sawAny = false;
    for (const char of raw) {
        if (char in CHINESE_DIGITS) {
            digit = CHINESE_DIGITS[char];
            sawAny = true;
            continue;
        }
        if (char === '十' || char === '百') {
            section += (digit || 1) * (char === '十' ? 10 : 100);
            digit = 0;
            sawAny = true;
            continue;
        }
        if (char === '千') {
            total += ((digit || 1) + section) * 1000;
            section = 0;
            digit = 0;
            sawAny = true;
            continue;
        }
        return null; // an unexpected character — refuse to guess
    }
    const value = total + section + digit;
    return sawAny ? value : null;
}

export interface ClaimAuditResult {
    supported: ArtifactClaim[];
    unsupported: ArtifactClaim[];
}

/**
 * Audit claims against the day's beats. Two independent gates, and a claim must
 * pass BOTH:
 *
 *   1. REFERENCE — every `beat:N` it cites must exist in the evidence list, and
 *      it must cite at least one. A claim citing nothing is an assertion about
 *      the world with no basis in what happened.
 *   2. MONEY — any 圓 figure it names must appear in the evidence text OR equal
 *      the character's TRUE current purse. This is the drift gate: a diary is
 *      allowed to be biased, self-serving and wrong about other people's motives
 *      (that is the point of a first-person document), but it may not invent the
 *      ledger, because the ledger is objective world state that other mechanisms
 *      read.
 */
export function auditClaims(
    world: WorldState,
    characterId: string,
    claims: ReadonlyArray<ArtifactClaim>,
    evidence: ReadonlyArray<ArtifactEvidenceBeat>,
): ClaimAuditResult {
    const refs = new Set(evidence.map((beat) => beat.ref));
    const evidenceText = evidence.map((beat) => `${beat.text} ${beat.inner ?? ''}`).join(' ');
    const data = world.data.economy;
    const purse = data ? accountFace(world, characterId) : undefined;
    const trueYuan = purse && data ? Number(purse.available / BigInt(data.subunitsPerUnit)) : null;

    const supported: ArtifactClaim[] = [];
    const unsupported: ArtifactClaim[] = [];
    for (const claim of claims) {
        const cited = claim.evidenceRefs.filter((ref) => refs.has(ref));
        if (!cited.length) {
            unsupported.push({ ...claim, auditNote: claim.evidenceRefs.length ? '引用的 beat 不存在' : '沒有引用任何 beat 證據' });
            continue;
        }
        let moneyNote: string | undefined;
        for (const match of claim.text.matchAll(MONEY_PATTERN)) {
            const figure = readChineseNumber(match[1]);
            if (figure === null) continue;
            if (evidenceText.includes(match[0]) || evidenceText.includes(String(figure))) continue;
            if (trueYuan !== null && figure === trueYuan) continue;
            moneyNote = `帳面漂移：文中「${match[0]}」既不在當日 beat 裡，也不是本人此刻的現銀${
                trueYuan !== null && data ? `（${formatMoney(data, purse!.available)}）` : ''
            }`;
            break;
        }
        if (moneyNote) {
            unsupported.push({ ...claim, evidenceRefs: cited, auditNote: moneyNote });
            continue;
        }
        supported.push({ ...claim, evidenceRefs: cited });
    }
    return { supported, unsupported };
}

// ── persistence + query ─────────────────────────────────────────────────────

function artifactStore(world: WorldState): CharacterArtifact[] {
    return (world.data.artifacts ??= []);
}

/** Store an artifact, replacing any prior artifact with the same id (a re-run of
 *  the same day's diary overwrites rather than duplicating). */
export function recordArtifact(world: WorldState, artifact: CharacterArtifact): CharacterArtifact {
    const store = artifactStore(world);
    const index = store.findIndex((row) => row.id === artifact.id);
    if (index >= 0) store[index] = artifact;
    else store.push(artifact);
    return artifact;
}

/** 按角色與日期查詢 — the query the reading surfaces need. All filters are
 *  optional and AND-ed; results stay in insertion (chronological) order. */
export function artifactsOf(
    world: WorldState,
    filter: { characterId?: string; day?: number; kind?: CharacterArtifact['kind'] } = {},
): CharacterArtifact[] {
    return artifactStore(world).filter(
        (artifact) =>
            (filter.characterId === undefined || artifact.characterId === filter.characterId) &&
            (filter.day === undefined || artifact.day === filter.day) &&
            (filter.kind === undefined || artifact.kind === filter.kind),
    );
}

/** Stable, replay-safe id: one diary per character per day, poems numbered
 *  within the day so two occasions never collide. */
export function diaryId(characterId: string, day: number): string {
    return `diary:${characterId}:d${day}`;
}
export function poemId(world: WorldState, characterId: string, day: number): string {
    const taken = artifactsOf(world, { characterId, day, kind: 'poem' }).length;
    return `poem:${characterId}:d${day}:${taken}`;
}

// ── 詩詞的場合 (occasion triggers) ────────────────────────────────────────────

/** 詩不日課 — at most one poem per character per this many days, on top of the
 *  occasion gate. A poem that arrives on schedule is a diary. */
export const POEM_COOLDOWN_DAYS = 3;
/** A want must be burning this hot before a peak counts as an occasion. */
export const POEM_TENSION_PEAK = 0.72;

export interface PoemOccasionHit {
    characterId: string;
    occasion: PoemOccasion;
    /** the want (or the other party) the occasion turns on. */
    want?: Want;
    otherId?: string;
}

/**
 * Which characters have an OCCASION for a poem right now. Pure, deterministic,
 * and deliberately narrow — this is the scarcity gate, and it answers only
 * 「今天有沒有值得寫的事」, never 「該寫什麼」.
 *
 * `signals` carries the tick's own events (a pair that just became 相許, a
 * departure, a reckoning), because those are facts the caller knows and the
 * world state alone does not distinguish from yesterday's.
 */
export function poemOccasions(
    world: WorldState,
    req: {
        day: number;
        candidateIds: ReadonlyArray<string>;
        signals?: {
            betrothedPairs?: Array<[string, string]>;
            partedIds?: string[];
            reckonedIds?: string[];
            refusedWantIds?: string[];
        };
    },
): PoemOccasionHit[] {
    const hits: PoemOccasionHit[] = [];
    const seen = new Set<string>();
    const cooldownOk = (characterId: string): boolean => {
        const last = world.data.poemDayByChar?.[characterId];
        return last === undefined || req.day - last >= POEM_COOLDOWN_DAYS;
    };
    const push = (hit: PoemOccasionHit): void => {
        if (seen.has(hit.characterId) || !req.candidateIds.includes(hit.characterId) || !cooldownOk(hit.characterId)) return;
        seen.add(hit.characterId);
        hits.push(hit);
    };

    // 相許 — the one occasion that never needs justifying.
    for (const [a, b] of req.signals?.betrothedPairs ?? []) {
        push({ characterId: a, occasion: 'betrothed', otherId: b });
        push({ characterId: b, occasion: 'betrothed', otherId: a });
    }
    // 被拒 — a love want that just foreclosed.
    for (const wantId of req.signals?.refusedWantIds ?? []) {
        const want = world.data.wants.find((row) => row.id === wantId);
        if (want) push({ characterId: want.characterId, occasion: 'refused', want, ...(want.target ? { otherId: want.target } : {}) });
    }
    // 送別 — somebody they knew left the board.
    for (const characterId of req.signals?.partedIds ?? []) push({ characterId, occasion: 'parting' });
    // 結帳之後 — the reckoning left a mark.
    for (const characterId of req.signals?.reckonedIds ?? []) push({ characterId, occasion: 'reckoning' });
    // 張力尖峰 — a want at breaking point, hot enough to demand words.
    for (const characterId of req.candidateIds) {
        let peak: Want | undefined;
        for (const want of world.data.wants) {
            if (want.retired || want.characterId !== characterId) continue;
            if (!peak || tension(want) > tension(peak)) peak = want;
        }
        if (!peak || tension(peak) < POEM_TENSION_PEAK) continue;
        if (forcingLevel(peak) !== 'breaking' && forcingLevel(peak) !== 'edge') continue;
        push({ characterId, occasion: 'tension-peak', want: peak });
    }
    return hits;
}

/** Stamp the cooldown. Called only after a poem actually materialised. */
export function markPoemWritten(world: WorldState, characterId: string, day: number): void {
    (world.data.poemDayByChar ??= {})[characterId] = day;
}

// ── 工件回流世界 (the artifact as a prop) ──────────────────────────────────────

/** 寫廢的詩稿 — a poem left behind becomes a real, portable, readable object in
 *  the scene the writer was standing in. Another character finding it can carry
 *  it, hide it, or hand it to exactly the wrong person. Returns the object id, or
 *  undefined when the world carries no object physics. */
export function spawnPoemProp(
    world: WorldState,
    poem: PoemArtifact,
    opts: { sceneId?: string; hidden?: boolean } = {},
): string | undefined {
    const sceneId = opts.sceneId ?? world.data.roster[poem.characterId];
    if (!sceneId) return undefined;
    const objects = (world.data.objects ??= []);
    const objectId = `poem-draft-${poem.id.replace(/[:]/g, '-')}`;
    if (objects.some((object) => object.id === objectId)) return objectId;
    const firstLine = poem.body.split('\n').map((line) => line.trim()).find(Boolean) ?? '（墨已乾，字看不全）';
    objects.push({
        id: objectId,
        label: '一張寫廢的詩稿',
        aliases: ['詩稿', '廢稿', '一張紙'],
        sceneId,
        portable: true,
        visibility: opts.hidden ? 'hidden' : 'visible',
        state: `字跡未乾，起首一句：「${firstLine}」——沒有落款`,
        version: 1,
        // A hidden draft is known only to whoever hid it; a dropped one is in plain
        // sight and needs no knower list.
        knownBy: opts.hidden ? [poem.characterId] : [],
        origin: { day: poem.day, tick: poem.tick, source: 'lab' },
    });
    poem.propObjectId = objectId;
    return objectId;
}

/**
 * 見報／傳閱 — the outward face. An artifact by a press-role character (or one an
 * operator chooses to circulate) becomes a public world percept: the report being
 * printed IS a world event, not a side channel. Returns the percept for the
 * caller to schedule, or undefined when the artifact should stay private.
 */
export function circulateArtifact(
    world: WorldState,
    artifact: CharacterArtifact,
    req: { nowTick: number; sceneName?: string; force?: boolean },
): { id: string; sceneId: string; text: string; visibility: 'public'; witnessIds: string[] } | undefined {
    const role = world.castById(artifact.characterId)?.role;
    const isPress = !!role && ['記者', '主筆', '編輯', '報館'].some((needle) => role.includes(needle));
    if (!isPress && !req.force) return undefined;
    const scene =
        (req.sceneName ? world.data.scenes.find((s) => s.name === req.sceneName) : undefined) ??
        world.data.scenes.find((s) => s.name === world.data.economy?.noticeSceneName) ??
        world.data.scenes[0];
    if (!scene) return undefined;
    const excerpt = artifact.body.split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 2).join(' ');
    const text =
        artifact.kind === 'diary'
            ? `${artifact.name}的稿子見了報：${excerpt}`
            : `有人把${artifact.name}的詩抄了出去，前街傳閱：${excerpt}`;
    return {
        id: `artifact-${artifact.id.replace(/[:]/g, '-')}-t${req.nowTick}`,
        sceneId: scene.id,
        text,
        visibility: 'public',
        witnessIds: world.data.cast.map((member) => member.id),
    };
}
