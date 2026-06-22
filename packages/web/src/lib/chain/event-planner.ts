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

/**
 * Director-authored resources (EVENT_LIFECYCLE Phase 3 / `resource-proposal.ts`)
 * surface as `爭得「<kind>:<display>」` desire statements. Recover the structural
 * `<kind>` so the templateId stays `contention:<kind>` — that keyword is what the
 * spine's `resourceForContention` / `chooseSettlementWinner` match against the
 * resource label + tension statement, so a runtime-instantiated slot settles
 * exactly like the built-ins. Returns null for built-in / unlabelled statements.
 */
export function parseDirectorContention(statement?: string): ContentionFraming | null {
    const m = /「([a-z][a-z0-9-]{1,20}):([^」]+)」/.exec(statement ?? '');
    if (!m) return null;
    const [, kind, display] = m;
    return {
        templateId: `contention:${kind}`,
        label: `圍繞「${display.trim()}」的爭奪，在這一場裡浮上了檯面`,
    };
}

/** Map a drama desire statement to a discrete incident framing. Built-in slots
 *  win first (hand-authored framing); a director-created slot is then recovered
 *  structurally so its templateId stays coherent; everything else is generic. */
export function framingForStatement(statement?: string): ContentionFraming {
    const s = statement ?? '';
    if (s.includes('頭牌') || s.includes('spotlight'))
        return { templateId: 'contention:spotlight', label: '今晚誰壓軸、誰站台心的暗潮浮上了檯面' };
    if (s.includes('唱片') || s.includes('recording') || s.includes('灌錄'))
        return { templateId: 'contention:recording', label: '首張唱片該由誰來灌，成了繞不開的話題' };
    if (s.includes('搭戲') || s.includes('partnership'))
        return { templateId: 'contention:partnership', label: '誰與誰搭戲的盤算，在這一場裡較上了勁' };
    // 感情爭奪：「傾心於X」是 desireStatementFor(affection:X) 的語義 token。在這裡認回
    // contention:affection（templateId keyword=affection，settlement 才對得上 affection:X
    // 資源），並給一句清楚的中文 framing——這正是 llmFraming 關掉時 POV 直接讀到的衝突描述，
    // 必須讓 LLM 一眼看出這是「爭某人的情意」而非英文 slug 或被 strip 的人名。「傾」涵蓋
    // 傾心/傾慕等措辭，'affection' 保險認 ascii 形式。
    if (s.includes('傾心') || s.includes('傾慕') || s.includes('affection')) {
        const m = /傾[心慕]於\s*([^\s，。、]+)/.exec(s);
        const who = m?.[1]?.trim();
        return {
            templateId: 'contention:affection',
            // 傾心、藏情、暗戀 — NOT 「贏得/角力」(those made the LLM play it as a contest →
            // evolve only ever read rivalry/tension). This framing puts gazes ON the
            // beloved with feelings kept under the surface, so 戀慕 has room to surface.
            label: who
                ? `誰也沒說破，可這一場裡，好幾道目光都繞著${who}打轉，各自藏著沒出口的心事`
                : '誰也沒說破，可這一場裡，好幾道目光都繞著那個人打轉，各自藏著沒出口的心事',
        };
    }
    const director = parseDirectorContention(s);
    if (director) return director;
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
