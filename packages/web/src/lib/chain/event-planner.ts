/**
 * Event planner — pure contention selection + framing (no chain, no I/O).
 * `selectContention` rotates the staged contention (anti-repeat) instead of locking
 * onto the static top tension; `framingForStatement` maps a desire statement to its
 * incident framing. See docs/narrative/EVENT_LIFECYCLE.md.
 */

export interface ContentionFraming {
    /** e.g. 'contention:recording'. */
    templateId: string;
    /** Human incident framing fed into involved characters' POV. */
    label: string;
}

export interface TensionRow {
    statement: string;
    /** 0..1; higher = more unmet. */
    tension: number;
}

export interface SelectedContention extends ContentionFraming {
    /** Statement that drove the pick. */
    statement?: string;
}

/**
 * Recover `<kind>` from a director-authored 爭得「<kind>:<display>」 statement so the
 * templateId stays `contention:<kind>` — the keyword the spine's settlement matchers
 * key on. Null for built-in / unlabelled statements.
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
 * Experiment-only label override (drama-effect lab): replaces every returned `label`
 * but never the templateId, so settlement keys hold. Production never sets it.
 */
let _framingOverride: string | null = null;

/** Install (or clear with `null`) the experiment framing override. */
export function setFramingOverride(label: string | null): void {
    _framingOverride = label && label.trim() ? label.trim() : null;
}

/** Saga-tier framing labels by contention kind; `{who}` interpolates the affection
 *  target. Labels only — templateIds stay engine-owned so spine settlement keys hold. */
export type FramingCatalog = Partial<Record<'spotlight' | 'recording' | 'partnership' | 'affection' | 'generic', string>>;

const DEFAULT_FRAMINGS: Required<FramingCatalog> = {
    spotlight: '今晚誰壓軸、誰站台心的暗潮浮上了檯面',
    recording: '首張唱片該由誰來灌，成了繞不開的話題',
    partnership: '誰與誰搭戲的盤算，在這一場裡較上了勁',
    // Contest wording here would make evolve read only rivalry/tension; 戀慕 needs this shape.
    affection: '誰也沒說破，可這一場裡，好幾道目光都繞著{who}打轉，各自藏著沒出口的心事',
    generic: '一樁懸而未決的較量，在這一場裡發酵',
};

let _framingCatalog: Required<FramingCatalog> = DEFAULT_FRAMINGS;

/** Install saga framing labels (merged over engine defaults); `null` resets. */
export function setFramingCatalog(catalog: FramingCatalog | null): void {
    _framingCatalog = catalog ? { ...DEFAULT_FRAMINGS, ...catalog } : DEFAULT_FRAMINGS;
}

/** Map a desire statement to its incident framing: built-ins first, then director
 *  slots, else generic. */
export function framingForStatement(statement?: string): ContentionFraming {
    if (_framingOverride) {
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
    // 「傾心於X」 comes from desireStatementFor(affection:X); the keyword must stay
    // `affection` so settlement matches the affection:X resource.
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

/** templateId without the override, mirroring framingForStatement's keyword order,
 *  so settlement keys stay coherent when the label is replaced. */
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
 * Stage the highest tension whose variety key isn't recent; falls back to the global
 * top when everything is recent, so the world never stalls.
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
        // Variety key = the STATEMENT (carries the target), not the kind-level templateId —
        // otherwise 傾心柳 and 傾心蘇 share `contention:affection` and never rotate.
        const varietyKey = row.statement || framing.templateId;
        if (!recent.has(varietyKey)) {
            return { ...framing, statement: row.statement };
        }
    }
    const top = sorted[0];
    return { ...framingForStatement(top.statement), statement: top.statement };
}

/** Bounded newest-first recent-history push. */
export function pushRecentTemplate(
    recent: ReadonlyArray<string>,
    templateId: string,
    keep = 2,
): string[] {
    return [templateId, ...recent.filter((t) => t !== templateId)].slice(0, keep);
}
