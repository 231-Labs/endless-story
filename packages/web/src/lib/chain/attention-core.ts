/**
 * Attention coupling (Stage 2) — make parallel events pull on each other through
 * a character's FINITE attention (pure; no chain, no I/O).
 *
 * The live drama model relaxes each desire's satisfaction independently (see
 * drama-core / drama.ts: the on-chain SUPPLY moves, the off-chain DEMAND only
 * feels it). So two concurrent events that share no resource — 爭灌錄權 vs
 * 爭某人的愛 — don't influence each other at all. But a person torn between two
 * ambitions CAN'T fully chase both: pursuing one starves the attention the other
 * needed. That trade-off is the "柳生春時刻" — and the live ledger dropped it
 * (drama-core.ts:290, it only lives in the offline sim).
 *
 * This re-introduces it as a pure overlay on the off-chain DEMAND signal (the
 * tension rows that steer selection + the spine), WITHOUT touching the
 * verifiable on-chain beat: each character funds only their top `focus` desires;
 * every further desire is NEGLECTED and aches MORE, the deeper down the stack it
 * sits. Aggregate that across the cast and the neglected axis's total tension
 * rises → selection/​spine swing toward it next → the two events visibly pull on
 * each other through the people they share. Off-chain steering, not conservation.
 *
 * Flag-gated (`attentionBudget` tick input); identity transform when off. Pure +
 * unit-tested (`attention-core.test.ts`).
 */

export interface AttentionRow {
    characterId: string;
    /** the desire statement (carries the contested axis). */
    statement: string;
    /** 0..1 unmet-ness. */
    tension: number;
    /** any extra fields are preserved untouched. */
    [k: string]: unknown;
}

export interface AttentionOptions {
    /** how many desires a character can fully fund per tick (default 1). */
    focus?: number;
    /** how hard each rank past `focus` aches (default 0.35 per extra rank). */
    spill?: number;
}

/**
 * Amplify the tension of each character's NEGLECTED desires (those ranked beyond
 * `focus`), so a character spread across many wants carries more residual ache
 * than one with a single want. Funded (top `focus`) desires pass through
 * unchanged; rank i ≥ focus is scaled by `1 + spill·(i − focus + 1)`, clamped to
 * 1. Preserves row identity + any extra fields; returns a new array (input
 * untouched). With `focus ≥` a character's desire count, it's the identity.
 */
export function coupleAttention<T extends AttentionRow>(
    rows: ReadonlyArray<T>,
    opts: AttentionOptions = {},
): T[] {
    const focus = Math.max(1, Math.floor(opts.focus ?? 1));
    const spill = Math.max(0, opts.spill ?? 0.35);

    // group row indices by character, preserving order
    const byChar = new Map<string, number[]>();
    rows.forEach((r, i) => {
        const arr = byChar.get(r.characterId);
        if (arr) arr.push(i);
        else byChar.set(r.characterId, [i]);
    });

    const out = rows.map((r) => ({ ...r }));
    for (const idxs of byChar.values()) {
        if (idxs.length <= focus) continue; // fully funded → no neglect
        // rank this character's desires by tension desc; index in ranking = rank
        const ranked = [...idxs].sort((a, b) => rows[b].tension - rows[a].tension);
        for (let rank = focus; rank < ranked.length; rank++) {
            const i = ranked[rank];
            const factor = 1 + spill * (rank - focus + 1);
            out[i].tension = Math.min(1, rows[i].tension * factor);
        }
    }
    return out as T[];
}
