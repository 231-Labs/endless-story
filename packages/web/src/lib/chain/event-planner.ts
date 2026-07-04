/**
 * Event planner — pure contention selection + framing (no chain, no I/O).
 *
 * Today the autonomous loop frames each tick's storylet from the single highest
 * drama tension. Because the soft storylet never *resolves*, the contested
 * resource never changes hands, so the top tension is static and every tick
 * re-opens the SAME contention (the "always the recording slot" bug — see
 * docs/narrative/EVENT_LIFECYCLE.md §1). This module breaks that loop two ways:
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

/**
 * Experiment-only framing override (drama-effect lab). When set, it REPLACES the
 * `label` of every framing this module returns (the templateId — which the spine's
 * settlement matchers key on — is left intact). The drama-effect experiment runner
 * (`experiments/run-experiment.ts`) installs it from `ExperimentConfig.framingOverride`
 * so an owner can re-color the same stake's incident prose; production never sets it.
 * Module-level (not env) so it can carry interpolated `{target}` text per run.
 */
let _framingOverride: string | null = null;

/** Install (or clear with `null`) the experiment framing override. */
export function setFramingOverride(label: string | null): void {
    _framingOverride = label && label.trim() ? label.trim() : null;
}

/** Saga-tier framing labels, keyed by contention kind. `{who}` interpolates the
 *  affection target. Engine defaults below are the 梨園 set; a story preset's
 *  `saga.narrative.framings` replaces individual entries (installed at tick
 *  start by narrative-profile). Labels only — templateIds stay engine-owned so
 *  spine settlement keys hold. */
export type FramingCatalog = Partial<Record<'spotlight' | 'recording' | 'partnership' | 'affection' | 'generic', string>>;

const DEFAULT_FRAMINGS: Required<FramingCatalog> = {
    spotlight: '今晚誰壓軸、誰站台心的暗潮浮上了檯面',
    recording: '首張唱片該由誰來灌，成了繞不開的話題',
    partnership: '誰與誰搭戲的盤算，在這一場裡較上了勁',
    // Gazes ON the beloved, feelings under the surface — a contest wording here
    // makes evolve read only rivalry/tension, so 戀慕 needs this shape.
    affection: '誰也沒說破，可這一場裡，好幾道目光都繞著{who}打轉，各自藏著沒出口的心事',
    generic: '一樁懸而未決的較量，在這一場裡發酵',
};

let _framingCatalog: Required<FramingCatalog> = DEFAULT_FRAMINGS;

/** Install saga framing labels (merged over engine defaults); `null` resets. */
export function setFramingCatalog(catalog: FramingCatalog | null): void {
    _framingCatalog = catalog ? { ...DEFAULT_FRAMINGS, ...catalog } : DEFAULT_FRAMINGS;
}

/** Map a drama desire statement to a discrete incident framing. Built-in slots
 *  win first (hand-authored framing); a director-created slot is then recovered
 *  structurally so its templateId stays coherent; everything else is generic. */
export function framingForStatement(statement?: string): ContentionFraming {
    if (_framingOverride) {
        // templateId stays coherent so settlement still ties tension to its resource.
        const base = framingTemplateOnly(statement ?? '');
        return { templateId: base, label: _framingOverride };
    }
    const s = statement ?? '';
    if (s.includes('頭牌') || s.includes('spotlight'))
        return { templateId: 'contention:spotlight', label: _framingCatalog.spotlight };
    if (s.includes('唱片') || s.includes('recording') || s.includes('灌錄'))
        return { templateId: 'contention:recording', label: _framingCatalog.recording };
    if (s.includes('搭戲') || s.includes('partnership'))
        return { templateId: 'contention:partnership', label: _framingCatalog.partnership };
    // 「傾心於X」 is the desireStatementFor(affection:X) token; templateId keyword
    // must stay `affection` so settlement matches the affection:X resource.
    if (s.includes('傾心') || s.includes('傾慕') || s.includes('affection')) {
        const m = /傾[心慕]於\s*([^\s，。、]+)/.exec(s);
        const who = m?.[1]?.trim();
        return {
            templateId: 'contention:affection',
            label: _framingCatalog.affection.replaceAll('{who}', who ?? '那個人'),
        };
    }
    const director = parseDirectorContention(s);
    if (director) return director;
    return { templateId: 'storylet:tension', label: _framingCatalog.generic };
}

/** The templateId `framingForStatement` would pick, WITHOUT the override — used by the
 *  override path so settlement keys (`contention:<kind>`) stay coherent even when the
 *  human label is replaced. Mirrors the keyword order in `framingForStatement`. */
function framingTemplateOnly(s: string): string {
    if (s.includes('頭牌') || s.includes('spotlight')) return 'contention:spotlight';
    if (s.includes('唱片') || s.includes('recording') || s.includes('灌錄')) return 'contention:recording';
    if (s.includes('搭戲') || s.includes('partnership')) return 'contention:partnership';
    if (s.includes('傾心') || s.includes('傾慕') || s.includes('affection')) return 'contention:affection';
    const director = parseDirectorContention(s);
    if (director) return director.templateId;
    return 'storylet:tension';
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
    recentKeys: ReadonlyArray<string> = [],
): SelectedContention {
    if (rows.length === 0) return { ...framingForStatement(undefined) };
    const sorted = [...rows].sort((a, b) => b.tension - a.tension);
    const recent = new Set(recentKeys);

    for (const row of sorted) {
        const framing = framingForStatement(row.statement);
        // Variety key = the STATEMENT (carries the target), NOT the kind-level templateId —
        // otherwise 傾心柳 and 傾心蘇 share `contention:affection` and never rotate. templateId
        // stays kind-level so the spine's settlement matcher still ties tension to its resource.
        const varietyKey = row.statement || framing.templateId;
        if (!recent.has(varietyKey)) {
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
