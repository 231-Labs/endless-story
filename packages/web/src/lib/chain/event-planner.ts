/**
 * Event planner — pure contention selection + framing (no chain, no I/O).
 *
 * Today the autonomous loop frames each tick's storylet from the single highest
 * drama tension. Because the soft storylet never *resolves*, the contested
 * resource never changes hands, so the top tension is static and every tick
 * re-opens the SAME contention (the "always the recording slot" bug — see
 * docs/EVENT_LIFECYCLE.md §1). This module breaks that loop two ways:
 *
 *   1. `selectContention` sorts ALL tension rows globally and picks the highest
 *      whose framing template was NOT used in the last few ticks — so the world
 *      rotates through spotlight / recording / partnership instead of locking on
 *      one. (The real fix — settling the resource so demand moves — is the
 *      multi-tick event spine in EVENT_LIFECYCLE §3; this is the deterministic
 *      selection brain that spine reuses.)
 *   2. `framingForStatement` maps a desire statement → the incident framing.
 *
 * Pure + unit-tested (`event-planner.test.ts`).
 */

export interface ContentionFraming {
    /** open_storylet / budget-event template id (e.g. 'contention:recording'). */
    templateId: string;
    /** human incident framing fed into involved characters' POV. */
    label: string;
}

export interface TensionRow {
    statement: string;
    /** 0..1 tension fraction (higher = more unmet). */
    tension: number;
}

export interface SelectedContention extends ContentionFraming {
    /** the statement that drove the pick (for logging / provenance). */
    statement?: string;
}

/** Map a drama desire statement to a discrete incident framing. */
export function framingForStatement(statement?: string): ContentionFraming {
    const s = statement ?? '';
    if (s.includes('頭牌') || s.includes('spotlight'))
        return { templateId: 'contention:spotlight', label: '今晚誰壓軸、誰站台心的暗潮浮上了檯面' };
    if (s.includes('唱片') || s.includes('recording') || s.includes('灌錄'))
        return { templateId: 'contention:recording', label: '首張唱片該由誰來灌，成了繞不開的話題' };
    if (s.includes('搭戲') || s.includes('partnership'))
        return { templateId: 'contention:partnership', label: '誰與誰搭戲的盤算，在這一場裡較上了勁' };
    return { templateId: 'storylet:tension', label: '一樁懸而未決的較量，在這一場裡發酵' };
}

/**
 * Choose which contention to stage this tick. Sorts every tension row globally
 * (highest unmet first) and returns the framing of the highest whose template
 * was NOT used in `recentTemplateIds`. Falls back to the global top when every
 * candidate template is recent (so the world never stalls for lack of variety).
 *
 * @param rows tension rows (any order; sorted internally)
 * @param recentTemplateIds template ids used in the last few ticks, most-recent-first
 */
export function selectContention(
    rows: ReadonlyArray<TensionRow>,
    recentTemplateIds: ReadonlyArray<string> = [],
): SelectedContention {
    if (rows.length === 0) return { ...framingForStatement(undefined) };
    const sorted = [...rows].sort((a, b) => b.tension - a.tension);
    const recent = new Set(recentTemplateIds);

    for (const row of sorted) {
        const framing = framingForStatement(row.statement);
        if (!recent.has(framing.templateId)) {
            return { ...framing, statement: row.statement };
        }
    }
    // Every candidate's template is recent — take the global top anyway.
    const top = sorted[0];
    return { ...framingForStatement(top.statement), statement: top.statement };
}

/** Append a just-used template id to a bounded recent-history list (newest first). */
export function pushRecentTemplate(
    recent: ReadonlyArray<string>,
    templateId: string,
    keep = 2,
): string[] {
    return [templateId, ...recent.filter((t) => t !== templateId)].slice(0, keep);
}
