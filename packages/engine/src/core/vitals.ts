/**
 * 生命體徵 — the four numbers that tell you whether a world is a story or a
 * treadmill. Pure, deterministic, and computed from the tick's own material.
 *
 * The last run looked healthy scene by scene and was dead at the macro scale, and
 * none of the existing diagnostics could say so. These four can:
 *
 *   1. 不可逆事件數 — how many things happened this tick that cannot be undone.
 *      A tick with zero is a tick the world could have skipped. (13 ticks with
 *      11 of them flagged non-episodes was the symptom; this is the measurement.)
 *   2. want resolved 率 — the story's heartbeat. 58 live / 4 resolved is a
 *      landfill, not a want system.
 *   3. 場景熵 — how spread out the cast is, and how many of them are doing the
 *      SAME thing in the same place. The 糖粥 attractor (8 of 12 characters
 *      planning the same errand on one night tick) is exactly this number
 *      collapsing.
 *   4. 迴圈偵測 — the same character repeating the same action across ticks.
 *
 * The convergence detector works on TEXT, because that is where the failure
 * lived: the attractor showed up in twelve 「眼下打算」 lines, not in any
 * structured field. It is a diagnostic, never a gate — nothing in the engine
 * branches on these numbers, so a noisy token can mislead a reader but can never
 * change the world.
 */

import { resolvedRate } from './want-lifecycle.ts';
import type { WorldState } from '../world-state.ts';

/** How many ticks of history the loop detector keeps. Long enough to see a
 *  three-tick rut, short enough to stay cheap in the snapshot. */
export const VITALS_WINDOW_TICKS = 8;
/** A token shared by this many distinct characters within one tick is a
 *  convergence — the whole cast pulling toward one errand. */
export const CONVERGENCE_MIN_CHARACTERS = 3;
/** A character repeating one token across this many distinct ticks is in a loop. */
export const LOOP_MIN_TICKS = 3;
/** Cap on how many findings each detector reports — a diagnostic, not a dump. */
const REPORT_CAP = 5;

export interface VitalsSample {
    characterId: string;
    /** whatever this character externalised on this tick: beat text, 心下, plan. */
    text: string;
    /** the scene they were in, for the entropy half. */
    sceneId?: string;
}

export interface ConvergenceFinding {
    /** the shared phrase (「糖粥」). */
    token: string;
    characterIds: string[];
    count: number;
}

export interface LoopFinding {
    characterId: string;
    token: string;
    /** distinct ticks within the window where this character produced it. */
    ticks: number;
}

export interface TickVitals {
    day: number;
    tick: number;
    /** 1. how many irreversible facts landed this tick. */
    irreversible: number;
    /** 2a. wants that have genuinely been answered, cumulative. */
    wantsResolved: number;
    /** 2b. wants still on the board. */
    wantsLive: number;
    /** 2c. resolved ÷ (all wants that ever left the board). 0 = nothing lands. */
    resolvedRate: number;
    /** resolutions that happened on THIS tick (the sharp version of the rate). */
    resolvedThisTick: number;
    /** 3a. normalized Shannon entropy of acting characters over scenes.
     *  1 = perfectly spread, 0 = everyone in one room. -1 = nobody acted. */
    sceneEntropy: number;
    /** 3b. the biggest single-scene cluster of acting characters. */
    sceneCrowdPeak: number;
    /** 3c. cast all reaching for the same thing at once. */
    convergence: ConvergenceFinding[];
    /** 4. characters stuck repeating themselves across the window. */
    loops: LoopFinding[];
    /** 文風趨同 — phrases most of the cast has settled into (「聲氣」×13). A prose
     *  problem, not a world problem, and invisible until it was split out of the
     *  convergence list where it read as grammar noise. */
    styleTics: ConvergenceFinding[];
    /** how many characters produced material this tick (the denominator). */
    actorCount: number;
}

// ── token extraction ────────────────────────────────────────────────────────

/**
 * Grammar-ish CJK bigrams that carry no narrative content.
 *
 * DELIBERATELY SMALL, and no longer the main defence — see `ambientTokens`
 * below. A hand-curated stoplist cannot win this game: the first real run came
 * back reporting 「了一」×11 as the cast's great convergence, and adding 「了一」
 * would only have promoted 「收回」, then 「後日」, then 「聲氣」. Whack-a-mole on
 * function words is not a filter, it is a chore that silently degrades.
 */
const STOP_TOKENS = new Set([
    '自己', '一個', '什麼', '這個', '那個', '不是', '就是', '可以', '沒有', '知道',
    '起來', '出來', '過來', '下來', '一句', '一聲', '一眼', '一下', '這樣', '那樣',
    '如今', '今日', '明日', '心裡', '眼裡', '手裡', '不能', '不會', '只是', '還是',
    '因為', '所以', '但是', '然後', '於是', '一時', '一面', '半晌', '不肯', '不敢',
]);

const CJK = /[一-鿿]/;

/**
 * 虛字 — characters that make an n-gram grammar rather than content.
 *
 * The sliding 2/3-gram tokenizer has no word segmentation, so most of what it
 * produces is not words at all: sliding over 「…擱在妝臺上那疊散頁…」 yields
 * 「擱在」「上那」「的事」 alongside the one real word 「散頁」. Document frequency
 * cannot separate these — measured on a real 16-tick run, 「散頁」 (the season's
 * central object) sat at 24% and the fragment 「上那」 at 26%. Same band, opposite
 * meaning.
 *
 * So a token containing any of these is dropped outright. The set is deliberately
 * narrow: particles, aspect markers, copulas, pronouns, deictics, degree words,
 * coverbs, and the directional complements that only ever appear as complements.
 * Characters that are ambiguous in THIS world stay OUT of it on purpose —
 * 還 (還錢 vs 還是) because debt is a mechanic here, and 上／下／進／入 because
 * 上臺／下場／進城 are content in an opera world.
 *
 * Honest about its status: this is a heuristic tuned against one real run. It is
 * a DIAGNOSTIC filter — nothing in the engine branches on these numbers — so a
 * false negative costs a missed warning, never a broken world.
 */
const FUNCTION_CHARS = new Set(
    ('了的是在那這之其和與也都就又而但卻只才更最把被讓給從向對於跟個們什麼沒很再要會能可所以為已曾過著得地' +
     '今昨時候回來去底半我你妳他她它們').split(''),
);

const hasFunctionChar = (token: string): boolean => {
    for (const char of token) if (FUNCTION_CHARS.has(char)) return true;
    return false;
};

/**
 * Content n-grams (2 and 3 characters) from one passage. CJK only: the world's
 * prose is Chinese, and Latin tokens in it are ids or numbers that a diagnostic
 * should not cluster on. Runs are split on every non-CJK character so a token can
 * never straddle punctuation.
 */
export function contentTokens(text: string): Set<string> {
    const tokens = new Set<string>();
    let run = '';
    const flush = (): void => {
        if (run.length >= 2) {
            for (let size = 2; size <= 3; size++) {
                for (let i = 0; i + size <= run.length; i++) {
                    const token = run.slice(i, i + size);
                    if (!STOP_TOKENS.has(token) && !hasFunctionChar(token)) tokens.add(token);
                }
            }
        }
        run = '';
    };
    for (const char of text) {
        if (CJK.test(char)) run += char;
        else flush();
    }
    flush();
    return tokens;
}

/**
 * 語料底噪 — tokens that show up all over the window, and therefore cannot be
 * evidence that anything is happening RIGHT NOW.
 *
 * This is the self-maintaining replacement for a stoplist. 「了一」 appears in
 * nearly every beat this world has ever produced, so its document frequency is
 * near 1 and it is dropped without anybody having to think of it; 「糖粥」 appears
 * in a handful, so it survives and gets reported. Nothing needs updating when the
 * prose style changes — the baseline IS the prose.
 *
 * Measured against the WINDOW, never against the tick being judged: a genuine
 * convergence must not be allowed to serve as its own baseline (if the whole cast
 * says 糖粥 on this tick, 糖粥's frequency on this tick is exactly what we want to
 * report, not what we want to normalise away).
 */
export const AMBIENT_DF = 0.35;
/** Below this much corpus, document frequency is noise — a two-sample window
 *  makes every token look either universal or unique. Under it, only the small
 *  explicit stoplist applies, which is the behaviour this had before. */
export const AMBIENT_MIN_SAMPLES = 12;

export function ambientTokens(
    window: ReadonlyArray<{ samples: ReadonlyArray<VitalsSample> }>,
): Set<string> {
    const documents = window.flatMap((frame) => [...frame.samples]);
    const ambient = new Set<string>();
    if (documents.length < AMBIENT_MIN_SAMPLES) return ambient;
    const documentFrequency = new Map<string, number>();
    for (const sample of documents) {
        for (const token of contentTokens(sample.text)) {
            documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
        }
    }
    const threshold = documents.length * AMBIENT_DF;
    for (const [token, count] of documentFrequency) {
        if (count >= threshold) ambient.add(token);
    }
    return ambient;
}

/**
 * 文風趨同 — the phrases the whole cast has settled into using.
 *
 * The ambient set is not just noise to discard: an ambient token that MOST OF THE
 * CAST shares is a real and otherwise-invisible finding. The first live run had
 * 「聲氣」 132 times across thirteen characters — twelve people who had each
 * quietly adopted the same narrator's tic — and it was buried under 「了一」 in
 * the convergence list, where it read as more grammar noise.
 *
 * Reported separately because it is a different failure from the 糖粥 attractor:
 * convergence is everyone WANTING the same thing, this is everyone WRITING the
 * same way. One is a world problem, the other is a prose problem.
 */
export function styleTicsOf(
    window: ReadonlyArray<{ samples: ReadonlyArray<VitalsSample> }>,
    ambient: ReadonlySet<string>,
): ConvergenceFinding[] {
    const byToken = new Map<string, Set<string>>();
    for (const frame of window) {
        for (const sample of frame.samples) {
            for (const token of contentTokens(sample.text)) {
                if (!ambient.has(token)) continue;
                (byToken.get(token) ?? byToken.set(token, new Set()).get(token)!).add(sample.characterId);
            }
        }
    }
    const castSize = new Set(window.flatMap((f) => f.samples.map((s) => s.characterId))).size;
    const floor = Math.max(CONVERGENCE_MIN_CHARACTERS, Math.ceil(castSize * 0.6));
    const findings: ConvergenceFinding[] = [];
    for (const [token, characters] of byToken) {
        if (characters.size < floor) continue;
        findings.push({ token, characterIds: [...characters].sort(), count: characters.size });
    }
    findings.sort((a, b) => b.count - a.count || b.token.length - a.token.length || a.token.localeCompare(b.token));
    return dropSubsumed(findings).slice(0, REPORT_CAP);
}

// ── the detectors ───────────────────────────────────────────────────────────

/**
 * 場景熵 — normalized Shannon entropy of the acting cast over scenes. A tick where
 * every actor is somewhere different scores 1; a tick where they all crowd one
 * room scores 0. Returns -1 when nobody acted, so a quiet tick is distinguishable
 * from a collapsed one (they are very different problems).
 */
export function sceneEntropyOf(samples: ReadonlyArray<VitalsSample>): { entropy: number; crowdPeak: number } {
    const bySceneCount = new Map<string, number>();
    const seen = new Set<string>();
    for (const sample of samples) {
        if (!sample.sceneId || seen.has(sample.characterId)) continue;
        seen.add(sample.characterId);
        bySceneCount.set(sample.sceneId, (bySceneCount.get(sample.sceneId) ?? 0) + 1);
    }
    const total = [...bySceneCount.values()].reduce((sum, n) => sum + n, 0);
    if (total === 0) return { entropy: -1, crowdPeak: 0 };
    const crowdPeak = Math.max(...bySceneCount.values());
    if (bySceneCount.size <= 1) return { entropy: 0, crowdPeak };
    let h = 0;
    for (const n of bySceneCount.values()) {
        const p = n / total;
        h -= p * Math.log2(p);
    }
    const max = Math.log2(bySceneCount.size);
    return { entropy: max > 0 ? Number((h / max).toFixed(4)) : 0, crowdPeak };
}

/**
 * 收斂偵測 — phrases that at least CONVERGENCE_MIN_CHARACTERS distinct characters
 * reached for on the same tick. This is the 糖粥 detector: when a homogenizing
 * attractor takes hold, one token shows up in most of the cast's intentions at
 * once.
 */
export function convergenceOf(
    samples: ReadonlyArray<VitalsSample>,
    /** Corpus-level background chatter to ignore (see `ambientTokens`). Absent ⇒
     *  the small stoplist only, which is what this did before the filter existed. */
    ambient: ReadonlySet<string> = new Set(),
): ConvergenceFinding[] {
    const byToken = new Map<string, Set<string>>();
    for (const sample of samples) {
        for (const token of contentTokens(sample.text)) {
            if (ambient.has(token)) continue;
            (byToken.get(token) ?? byToken.set(token, new Set()).get(token)!).add(sample.characterId);
        }
    }
    const findings: ConvergenceFinding[] = [];
    for (const [token, characters] of byToken) {
        if (characters.size < CONVERGENCE_MIN_CHARACTERS) continue;
        findings.push({ token, characterIds: [...characters].sort(), count: characters.size });
    }
    // Longer tokens first at equal reach: 「糖粥」 beats 「一碗」 for the same count,
    // and a 3-gram that always co-occurs with its 2-gram is the better label.
    findings.sort((a, b) => b.count - a.count || b.token.length - a.token.length || a.token.localeCompare(b.token));
    return dropSubsumed(findings).slice(0, REPORT_CAP);
}

/** Drop a shorter token when a longer one reaches exactly the same characters —
 *  「糖粥」 and 「碗糖粥」 are one finding, not two. */
function dropSubsumed(findings: ConvergenceFinding[]): ConvergenceFinding[] {
    const kept: ConvergenceFinding[] = [];
    for (const finding of findings) {
        const redundant = kept.some(
            (prior) =>
                prior.count === finding.count &&
                (prior.token.includes(finding.token) || finding.token.includes(prior.token)),
        );
        if (!redundant) kept.push(finding);
    }
    return kept;
}

/**
 * 迴圈偵測 — a character producing the same phrase on LOOP_MIN_TICKS or more
 * distinct ticks inside the window. Not the same as convergence: this is one
 * person circling, and it is what a stuck want looks like from outside.
 */
export function loopsOf(
    window: ReadonlyArray<{ tick: number; samples: ReadonlyArray<VitalsSample> }>,
    /** Same corpus filter the convergence detector uses: a character "repeating"
     *  a phrase everybody uses every tick is not in a rut, they are speaking
     *  Chinese. 柳安春「了一」連 7 拍 was this exact false positive. */
    ambient: ReadonlySet<string> = new Set(),
): LoopFinding[] {
    const byChar = new Map<string, Map<string, Set<number>>>();
    for (const frame of window) {
        for (const sample of frame.samples) {
            const perChar = byChar.get(sample.characterId) ?? byChar.set(sample.characterId, new Map()).get(sample.characterId)!;
            for (const token of contentTokens(sample.text)) {
                if (ambient.has(token)) continue;
                (perChar.get(token) ?? perChar.set(token, new Set()).get(token)!).add(frame.tick);
            }
        }
    }
    const findings: LoopFinding[] = [];
    for (const [characterId, perChar] of byChar) {
        let best: LoopFinding | undefined;
        for (const [token, ticks] of perChar) {
            if (ticks.size < LOOP_MIN_TICKS) continue;
            if (!best || ticks.size > best.ticks || (ticks.size === best.ticks && token.length > best.token.length)) {
                best = { characterId, token, ticks: ticks.size };
            }
        }
        if (best) findings.push(best);
    }
    findings.sort((a, b) => b.ticks - a.ticks || a.characterId.localeCompare(b.characterId));
    return findings.slice(0, REPORT_CAP);
}

// ── the rolling window (persisted with the world) ───────────────────────────

/** Push this tick's material into the world's rolling window, trimmed to
 *  VITALS_WINDOW_TICKS. Carried by snapshot/restore so a resumed run keeps its
 *  loop history instead of forgetting every rut at every restart. */
export function pushVitalsWindow(
    world: WorldState,
    frame: { day: number; tick: number; samples: VitalsSample[] },
): void {
    const window = (world.data.vitalsWindow ??= []);
    const existing = window.findIndex((row) => row.tick === frame.tick);
    if (existing >= 0) window[existing] = frame;
    else window.push(frame);
    if (window.length > VITALS_WINDOW_TICKS) window.splice(0, window.length - VITALS_WINDOW_TICKS);
}

/**
 * Compute the tick's vitals. `irreversible` and `resolvedThisTick` are counted by
 * the caller (only the tick knows what it actually committed); everything else is
 * derived from world state and the rolling window.
 */
export function computeTickVitals(
    world: WorldState,
    req: { day: number; tick: number; samples: VitalsSample[]; irreversible: number; resolvedThisTick: number },
): TickVitals {
    const heartbeat = resolvedRate(world.data.wants);
    const { entropy, crowdPeak } = sceneEntropyOf(req.samples);
    // The baseline is the WINDOW — this tick's own material must not normalise
    // away the very convergence we are trying to catch.
    const window = world.data.vitalsWindow ?? [];
    const ambient = ambientTokens(window);
    return {
        day: req.day,
        tick: req.tick,
        irreversible: req.irreversible,
        wantsResolved: heartbeat.resolved,
        wantsLive: heartbeat.live,
        resolvedRate: Number(heartbeat.rate.toFixed(4)),
        resolvedThisTick: req.resolvedThisTick,
        sceneEntropy: entropy,
        sceneCrowdPeak: crowdPeak,
        convergence: convergenceOf(req.samples, ambient),
        loops: loopsOf(window, ambient),
        styleTics: styleTicsOf(window, ambient),
        actorCount: new Set(req.samples.map((sample) => sample.characterId)).size,
    };
}

/** One-line rendering for the engine log and the diagnostics export. */
export function describeVitals(world: WorldState, vitals: TickVitals): string {
    const parts = [
        `不可逆 ${vitals.irreversible}`,
        `resolved ${vitals.resolvedThisTick}（累計 ${vitals.wantsResolved}／活 ${vitals.wantsLive}／率 ${(vitals.resolvedRate * 100).toFixed(0)}%）`,
        vitals.sceneEntropy < 0 ? '場景熵 —（無人行動）' : `場景熵 ${vitals.sceneEntropy.toFixed(2)}（最擠一場 ${vitals.sceneCrowdPeak} 人）`,
    ];
    if (vitals.convergence.length) {
        parts.push(`收斂：${vitals.convergence.map((row) => `「${row.token}」×${row.count}`).join('、')}`);
    }
    if (vitals.loops.length) {
        parts.push(`迴圈：${vitals.loops.map((row) => `${world.nameById(row.characterId)}「${row.token}」${row.ticks}拍`).join('、')}`);
    }
    if (vitals.styleTics.length) {
        parts.push(`文風趨同：${vitals.styleTics.map((row) => `「${row.token}」×${row.count}`).join('、')}`);
    }
    return parts.join(' · ');
}
