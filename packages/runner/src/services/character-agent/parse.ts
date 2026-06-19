/**
 * Character Agent — pure LLM-output parsing + guardrails.
 *
 * Everything here is deterministic and side-effect free: extract the JSON
 * the model was told to emit, clamp/sanitize fields, and enforce the
 * identity-drift rules (a 花旦 must not plan like a 班主). Kept separate
 * from the decide* entry points (which call the LLM) so this layer is
 * directly unit-testable under `node --test` — see
 * packages/runner/test/character-agent-parse.test.ts.
 */

import type { SocialActionResult } from './social.js';

/* ── MOVE ───────────────────────────────────────────────────────────── */

export function parseMove(
    raw: string,
): { move?: boolean; targetSceneId?: string; reason?: string } | null {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
        const o = JSON.parse(m[0]) as {
            move?: boolean;
            targetSceneId?: string;
            reason?: string;
        };
        return o;
    } catch {
        return null;
    }
}

/* ── ACT (card play) ────────────────────────────────────────────────── */

export function parseDecision(
    raw: string,
): { catalogIndex: number; intent?: string; line?: string; reason?: string } | null {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
        const o = JSON.parse(m[0]) as {
            catalogIndex?: number | string;
            intent?: string;
            line?: string;
            reason?: string;
        };
        const ci = Number(o.catalogIndex);
        if (!Number.isFinite(ci)) return null;
        return {
            catalogIndex: ci,
            intent: o.intent,
            line: clamp(typeof o.line === 'string' ? o.line : undefined, 24),
            reason: o.reason,
        };
    } catch {
        return null;
    }
}

/* ── SOCIAL ─────────────────────────────────────────────────────────── */

const UNAUTHORIZED_SHARED_PAST_RE =
    /多年同門|舊情|舊愛|血緣|親兄|親弟|親姊|親妹|父女|母女|父子|母子|青梅竹馬|從小相識|一同長大|舊仇|宿怨|前世|拜過師|師徒舊恩/;
const UNSUPPORTED_HEAVY_MOTIF_RE =
    /跛|膝蓋|腿傷|舊傷|重病|病入膏肓|血跡|血污|棺材|屍|死人|死亡|巨債|玉鐲|信物|厚底靴/;

/** Drop memories that invent an unauthorized shared past or unsupported
 *  heavy motifs (injuries, debts, keepsakes) the scene gave no material for. */
export function sanitizeSocialMemory(text: string | undefined): string | undefined {
    if (!text) return undefined;
    if (!UNAUTHORIZED_SHARED_PAST_RE.test(text) && !UNSUPPORTED_HEAVY_MOTIF_RE.test(text)) {
        return text;
    }
    return undefined;
}

function clamp(text: string | undefined, max: number): string | undefined {
    const trimmed = text?.trim();
    if (!trimmed) return undefined;
    return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

export function parseSocial(raw: string): SocialActionResult | null {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
        const o = JSON.parse(m[0]) as {
            kind?: unknown;
            targetCharacterId?: unknown;
            line?: unknown;
            observation?: unknown;
            relationshipMemory?: unknown;
            reason?: unknown;
        };
        const kind =
            o.kind === 'talk' || o.kind === 'observe' || o.kind === 'idle'
                ? o.kind
                : 'idle';
        const observation = sanitizeSocialMemory(
            clamp(typeof o.observation === 'string' ? o.observation : undefined, 90),
        );
        const relationshipMemory = sanitizeSocialMemory(
            clamp(typeof o.relationshipMemory === 'string' ? o.relationshipMemory : undefined, 110),
        );
        const reason = sanitizeSocialMemory(
            clamp(typeof o.reason === 'string' ? o.reason : undefined, 50),
        );
        return {
            kind,
            targetCharacterId: typeof o.targetCharacterId === 'string' ? o.targetCharacterId : undefined,
            line: clamp(typeof o.line === 'string' ? o.line : undefined, 32),
            observation,
            relationshipMemory,
            reason,
        };
    } catch {
        return null;
    }
}

/* ── AID (give money) ───────────────────────────────────────────────── */

type AidMemo = 'gift' | 'patronage' | 'loan' | 'repay' | 'bribe' | 'tribute';
type AidManner = 'direct' | 'disguised' | 'via-proxy' | 'as-loan' | 'as-repay';
const AID_MEMOS = new Set<AidMemo>(['gift', 'patronage', 'loan', 'repay', 'bribe', 'tribute']);
const AID_MANNERS = new Set<AidManner>(['direct', 'disguised', 'via-proxy', 'as-loan', 'as-repay']);

export interface ParsedAidGift {
    recipientId?: string;
    amount?: number;
    memo: AidMemo;
    manner?: AidManner;
    line?: string;
    reason?: string;
}

function parseOneGift(o: Record<string, unknown>): ParsedAidGift {
    const memoRaw = typeof o.memo === 'string' ? (o.memo as AidMemo) : ('' as AidMemo);
    const mannerRaw = typeof o.manner === 'string' ? (o.manner as AidManner) : undefined;
    return {
        recipientId: typeof o.recipientId === 'string' ? o.recipientId : undefined,
        amount: o.amount != null && Number.isFinite(Number(o.amount)) ? Number(o.amount) : undefined,
        memo: AID_MEMOS.has(memoRaw) ? memoRaw : 'gift',
        manner: mannerRaw && AID_MANNERS.has(mannerRaw) ? mannerRaw : undefined,
        line: clamp(typeof o.line === 'string' ? o.line : undefined, 28),
        reason: clamp(typeof o.reason === 'string' ? o.reason : undefined, 60),
    };
}

/**
 * Parse the aid decision (multi-recipient). The model owns whom / how much / what name / how;
 * this layer only shapes types and defaults an unknown memo to 'gift'. Recipient validity and
 * the no-overdraft clamp are enforced by finalizeAid (aid-prompt.ts) against the real peers.
 * Accepts the canonical `{ gifts: [...] }` shape, and tolerates a bare single-gift object.
 */
export function parseAid(raw: string): { gifts: ParsedAidGift[]; reason?: string } | null {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
        const o = JSON.parse(m[0]) as Record<string, unknown>;
        const reason = clamp(typeof o.reason === 'string' ? o.reason : undefined, 60);
        if (Array.isArray(o.gifts)) {
            const gifts = o.gifts
                .filter((g): g is Record<string, unknown> => !!g && typeof g === 'object')
                .map(parseOneGift);
            return { gifts, reason };
        }
        // tolerate a single-gift object (model dropped the array) or an explicit no-aid.
        if (o.doAid === false || (o.recipientId == null && o.amount == null)) return { gifts: [], reason };
        return { gifts: [parseOneGift(o)], reason };
    } catch {
        return null;
    }
}

/* ── ASK (request money) ────────────────────────────────────────────── */

const ASK_KINDS = new Set(['loan', 'plea', 'patronage']);

/** Parse the ask decision. The model owns whether / whom / how much / how; this only shapes
 *  types and defaults an unknown kind to 'plea'. Target validity is enforced by finalizeAsk. */
export function parseAsk(
    raw: string,
): {
    doAsk: boolean;
    targetId?: string;
    amount?: number;
    kind?: 'loan' | 'plea' | 'patronage';
    line?: string;
    reason?: string;
} | null {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
        const o = JSON.parse(m[0]) as Record<string, unknown>;
        const kindRaw = typeof o.kind === 'string' ? o.kind : '';
        return {
            doAsk: o.doAsk === true,
            targetId: typeof o.targetId === 'string' ? o.targetId : undefined,
            amount: o.amount != null && Number.isFinite(Number(o.amount)) ? Number(o.amount) : undefined,
            kind: (ASK_KINDS.has(kindRaw) ? kindRaw : 'plea') as 'loan' | 'plea' | 'patronage',
            line: clamp(typeof o.line === 'string' ? o.line : undefined, 28),
            reason: clamp(typeof o.reason === 'string' ? o.reason : undefined, 60),
        };
    } catch {
        return null;
    }
}

/* ── PLAN ───────────────────────────────────────────────────────────── */

export function parsePlan(
    raw: string,
): { longTermGoal?: string; dailyPlanHint?: string; openSubgoals?: string[] } | null {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
        const o = JSON.parse(m[0]) as {
            longTermGoal?: string;
            dailyPlanHint?: string;
            openSubgoals?: string[];
        };
        if (!o || (typeof o.longTermGoal !== 'string' && typeof o.dailyPlanHint !== 'string')) {
            return null;
        }
        return o;
    } catch {
        return null;
    }
}

// Detect USURPATION (claiming/seizing the troupe master's authority), NOT mere
// mention of one. A minor role naturally plans AROUND the boss — 求賞識、怕當家、
// 等東家發月錢 — and that is in-character, not drift. The old guard matched the
// bare nouns (班主/老闆/當家/東家…), so any plan that so much as named the boss got
// its whole plan replaced by a role template (the "常常 fallback 成這種" you saw).
// Now we anchor authority nouns to a seize/replace verb, and bound the wildcards
// to a single clause ([^ ], since `joined` glues fields with spaces) so they
// can't span two unrelated clauses (e.g. 「被人敲打 … 接住主角」).
export function hasAuthorityDrift(text: string): boolean {
    return /掌控全班|管住全班|捏在手心|讓誰紅誰就紅|讓誰涼誰就涼|自立門戶|自己當家|當家作主|(?:當上|坐上|做上|頂替|取代|扳倒|架空|自封|自任)[^ ]{0,6}(?:班主|老闆|老板|當家|東家|掌事)|(?:做|當)[^ ]{0,5}的(?:班主|老闆|老板|當家|東家)|(?:班主|老闆|老板|當家|東家|掌事)[^ ]{0,2}(?:位子|位置|寶座)|敲打[^ ]{0,6}(?:角|新人|新來|後輩|師弟)|整治[^ ]{0,6}(?:新人|新來|後輩)|新來[^ ]{0,5}安分/.test(
        text,
    );
}

/** Would this plan over-reach into authority its role doesn't have? Mirrors the
 *  gate inside sanitizePlanForRole (班主 is never drift) so the PLAN repair loop
 *  and the last-resort template agree on what counts as drift. Pure — kept here
 *  with the regex so callers don't pull in the LLM client just to ask. */
export function driftsForRole(
    role: string,
    cand: { longTermGoal: string; dailyPlanHint: string; openSubgoals: string[] },
): boolean {
    if (role.includes('班主')) return false;
    return hasAuthorityDrift([cand.longTermGoal, cand.dailyPlanHint, ...cand.openSubgoals].join(' '));
}

/** Non-班主 roles must not plan like the troupe master. On drift, replace the
 *  whole plan with a role-appropriate fallback instead of patching wording. */
export function sanitizePlanForRole(
    character: { name: string; role: string },
    plan: { longTermGoal: string; dailyPlanHint: string; openSubgoals: string[] },
): { longTermGoal: string; dailyPlanHint: string; openSubgoals: string[] } {
    if (character.role.includes('班主')) return plan;
    const joined = [plan.longTermGoal, plan.dailyPlanHint, ...plan.openSubgoals].join(' ');
    if (!hasAuthorityDrift(joined)) return plan;
    if (/花旦|青衣|旦|名伶|坤伶/.test(character.role)) {
        return {
            longTermGoal: `我要把${character.name}這個花旦名號唱到台下人人記得`,
            dailyPlanHint: '先穩住今日妝面、身段與下一折戲的搭檔分寸',
            openSubgoals: ['看清誰在爭搭檔位', '別讓旁人的目光亂了自己的身段'],
        };
    }
    if (/小生|武生/.test(character.role)) {
        return {
            longTermGoal: `我要在這戲班站穩${character.role}的位置`,
            dailyPlanHint: '先把今日要接的戲與身段磨穩',
            openSubgoals: ['看清誰在爭同一個台口', '別把急切露得太白'],
        };
    }
    return {
        longTermGoal: `我要以${character.role && character.role !== '—' ? character.role : '自己的本事'}在這戲班站住腳`,
        dailyPlanHint: '先把眼前這場戲做穩，不讓旁人看出破綻',
        openSubgoals: ['留意同場人物的眼色', '守住自己的分寸'],
    };
}
