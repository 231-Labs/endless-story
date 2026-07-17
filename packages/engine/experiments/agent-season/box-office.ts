/**
 * AGENT-SEASON · BOX OFFICE — a DETERMINISTIC, auditable sum (§4 hard rule).
 * ============================================================================
 * The box-office NUMBER is NEVER produced by the LLM. It is a確定性 formula over
 * audited inputs (warmth from the relationship graph, repute + quality from the
 * production accumulators). The LLM may only write audience-reaction PROSE elsewhere;
 * it never touches a number here.
 *
 *   willingness(a) = 0.4·warmth(a→troupe/柳) + 0.3·repute(troupe) + 0.3·quality(play)
 *   quality(play)  = Σ over cast_i of ability_i · rehearsalEffort_i  (normalised 0..1)
 *   box_office     = Σ_a [ 1 if willingness>0 ] + [ repeatBonus(=1) if willingness>θ ]
 *
 * Math.random is BANNED here — a random box office would be non-reproducible and
 * un-auditable. Every materialized 散客's warmth is INDEX-DERIVED (a fixed constant),
 * and the cast audience's warmth is read from its want-graph weight toward the troupe.
 */

import type { Char } from './world.ts';
import { type Play, playQuality, qualityDrivers } from './production.ts';

export const BOX_OFFICE = {
    /** willingness weights (§4 verbatim). */
    w1: 0.4, // warmth
    w2: 0.3, // repute
    w3: 0.3, // quality
    /** repeat-visit threshold θ. */
    theta: 0.6,
    /** one ticket per willing audience. */
    ticket: 1,
    /** bonus attendance for an audience over θ. */
    repeatBonus: 1,
} as const;

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);
const round2 = (n: number): number => Math.round(n * 100) / 100;

export interface BoxOfficeRow {
    id: string;
    name: string;
    kind: 'cast' | 'materialized';
    warmth: number;
    repute: number;
    quality: number;
    willingness: number;
    bought: boolean;
    repeat: boolean;
    note: string;
}

export interface BoxOffice {
    total: number;
    ticketBuyers: number;
    repeats: number;
    quality: number;
    repute: number;
    rows: BoxOfficeRow[];
    drivers: Array<{ id: string; name: string; ability: number; effort: number; contribution: number }>;
}

/**
 * MATERIALIZED 散客 — the collective "world watching". Deterministic, index-derived
 * warmth toward the troupe/柳 (NO Math.random). Higher index = cooler house.
 */
interface Materialized {
    id: string;
    name: string;
    note: string;
}
const MATERIALIZED: Materialized[] = [
    { id: '秦秀娥', name: '老戲迷秦秀娥', note: '看了三十年戲的老票友，認角不認班，衝著台上那口氣來' },
    { id: '會樂里堂子客', name: '會樂里堂子客', note: '霞飛路上捧場的恩客，圖個名頭與熱鬧' },
    { id: '洋行職員', name: '洋行職員', note: '新派青年，看戲圖個體面與新鮮' },
    { id: '報館先生', name: '報館先生', note: '寫戲評的報人，冷眼多過捧場，難討好' },
];
/** index-derived warmth: 0.78, 0.64, 0.50, 0.36 (cooler as the index grows). */
const materializedWarmth = (index: number): number => round2(clamp01(0.78 - 0.14 * index));

/** Cast audience (白韻秋) warmth is READ FROM THE RELATIONSHIP GRAPH: its strongest
 *  want-weight aimed at the troupe/柳 → a warm house. Auditable, no constant. */
function castWarmth(a: Char, playCast: string[]): number {
    let best = 0;
    for (const w of a.wants) {
        if (w.retired || !w.target) continue;
        if (w.target === '柳安春' || playCast.includes(w.target)) best = Math.max(best, w.weight);
    }
    return round2(clamp01(0.4 + 0.6 * best));
}

/**
 * Compute the deterministic box office for a premiered play. `cast` is the full
 * world cast (to locate the cast audience member, 白韻秋).
 */
export function computeBoxOffice(play: Play, cast: Char[], leadCraft = 1): BoxOffice {
    // The night's QUALITY is rehearsal × the leads' actual hands (craft) — a
    // premiere led by someone who spent the day in bed pays for it here. The
    // deterministic economy stops being blind to performance.
    const quality = round2(playQuality(play) * (0.4 + 0.6 * leadCraft));
    const repute = round2(play.repute);
    const rows: BoxOfficeRow[] = [];

    const willingnessOf = (warmth: number): number =>
        round2(BOX_OFFICE.w1 * warmth + BOX_OFFICE.w2 * repute + BOX_OFFICE.w3 * quality);

    // 白韻秋 — the cast audience who comes for 柳 (warmth from her want graph).
    const bai = cast.find((c) => c.id === '白韻秋');
    if (bai) {
        const warmth = castWarmth(bai, play.cast);
        const willingness = willingnessOf(warmth);
        rows.push({
            id: bai.id,
            name: bai.name,
            kind: 'cast',
            warmth,
            repute,
            quality,
            willingness,
            bought: willingness > 0,
            repeat: willingness > BOX_OFFICE.theta,
            note: '為柳而來的恩客（暖度取自她的心事圖）',
        });
    }

    // materialized 散客 — index-derived warmth.
    MATERIALIZED.forEach((m, i) => {
        const warmth = materializedWarmth(i);
        const willingness = willingnessOf(warmth);
        rows.push({
            id: m.id,
            name: m.name,
            kind: 'materialized',
            warmth,
            repute,
            quality,
            willingness,
            bought: willingness > 0,
            repeat: willingness > BOX_OFFICE.theta,
            note: m.note,
        });
    });

    let total = 0;
    let ticketBuyers = 0;
    let repeats = 0;
    for (const r of rows) {
        if (r.bought) {
            total += BOX_OFFICE.ticket;
            ticketBuyers += 1;
        }
        if (r.repeat) {
            total += BOX_OFFICE.repeatBonus;
            repeats += 1;
        }
    }

    const drivers = qualityDrivers(play)
        .slice(0, 3)
        .map((d) => ({ ...d, name: d.id, ability: round2(d.ability), effort: round2(d.effort), contribution: round2(d.contribution) }));

    return { total, ticketBuyers, repeats, quality, repute, rows, drivers };
}
