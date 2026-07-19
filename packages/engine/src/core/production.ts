/**
 * 劇本產出 / emergent play-production — pure, seed-agnostic, deterministic.
 *
 * Characters spend ticks on a collaborative creative work: someone proposes a
 * new play, others join, one adds script fragments, the rest rehearse. Effort
 * is a DETERMINISTIC per-contributor accumulator (no LLM, no RNG — auditable);
 * the work premieres when the razor holds: it has a script, real collaborators,
 * and enough rehearsal banked.
 *
 * This is the engine-core distillation of the dormant harnesses
 * (experiments/agent-season/production.ts's Play + showrunner.ts's razor). The
 * seed-hardcoded pieces those carried — a per-name ABILITY table, Chinese-opera
 * REPERTOIRE templates, occupation/venue gates — are deliberately LEFT OUT: they
 * pin one saga into the core. Here quality is plain accumulated effort, and WHO
 * produces is decided per-tick by the character's own chooseAction self-tag
 * (the existing SceneAgentPort seam), so the mechanism fits any story.
 *
 * The tick routes a character's self-tagged action kind into these mutators;
 * nothing here calls an agent or touches the clock. One production per run
 * (Model-1 semantics): once premiered it stays premiered.
 */

export type ProductionStatus = 'proposed' | 'scripted' | 'rehearsing' | 'premiered';

export interface Production {
    /** The work's name (best-effort; defaults to a generic 新戲 when none given). */
    title: string;
    status: ProductionStatus;
    /** Who first proposed it. */
    initiatorId: string;
    /** Every character who has contributed (proposed / joined / composed / rehearsed). */
    contributors: string[];
    /** charId → accumulated rehearsal effort (deterministic integer). */
    effort: Record<string, number>;
    /** Opening lines / script fragments accrued as the work takes shape. */
    scriptFragments: string[];
    /** 1-indexed narrative day the work began. */
    startedDay: number;
    /** Day it premiered, once it does. */
    premieredDay?: number;
    /** Human-readable lifecycle log (proposal, fragments, premiere). */
    timeline: string[];
}

export const PRODUCTION = {
    /** Total effort across all contributors before the work may premiere. */
    rehearsalThreshold: 4,
    /** Distinct contributors required for a real collaborative production. */
    minContributors: 2,
} as const;

/** Begin a new production (status 'proposed'). */
export function startProduction(title: string, initiatorId: string, day: number): Production {
    return {
        title: title.trim() || '新戲',
        status: 'proposed',
        initiatorId,
        contributors: [initiatorId],
        effort: {},
        scriptFragments: [],
        startedDay: day,
        timeline: [`第${day}日：${title.trim() || '新戲'} 立項`],
    };
}

/** Idempotently record a contributor; promotes to 'rehearsing' once enough
 *  distinct hands have joined (a real collaboration, not one person's daydream). */
export function ensureContributor(p: Production, charId: string): void {
    if (!p.contributors.includes(charId)) p.contributors.push(charId);
    maybeRehearsing(p);
}

/** Add a script fragment; advances 'proposed' → 'scripted' on the first one. */
export function addScriptFragment(p: Production, charId: string, fragment: string): void {
    ensureContributor(p, charId);
    const line = fragment.trim();
    if (line) p.scriptFragments.push(line);
    if (p.status === 'proposed') p.status = 'scripted';
}

/** Bank deterministic rehearsal effort for one contributor (default +1). */
export function accumulateEffort(p: Production, charId: string, amount = 1): void {
    ensureContributor(p, charId);
    p.effort[charId] = (p.effort[charId] ?? 0) + amount;
    maybeRehearsing(p);
}

/** Total banked effort across everyone. */
export function totalEffort(p: Production): number {
    return Object.values(p.effort).reduce((sum, n) => sum + n, 0);
}

/** The razor: a scripted work, real collaborators, and enough rehearsal banked —
 *  and not already premiered. Purely mechanical, so a premiere is auditable. */
export function canPremiere(p: Production): boolean {
    return (
        p.status !== 'premiered' &&
        p.scriptFragments.length > 0 &&
        p.contributors.length >= PRODUCTION.minContributors &&
        totalEffort(p) >= PRODUCTION.rehearsalThreshold
    );
}

/** Mark the work premiered (once). Quality is plain accumulated effort. */
export function markPremiered(p: Production, day: number): void {
    if (p.status === 'premiered') return;
    p.status = 'premiered';
    p.premieredDay = day;
    p.timeline.push(`第${day}日：${p.title} 首演（積功 ${totalEffort(p)}、成之者 ${p.contributors.length} 人）`);
}

/** One-line state for the chooseAction playSummary + the tick report. */
export function productionSummary(p: Production): string {
    if (p.status === 'premiered') return `《${p.title}》已於第${p.premieredDay}日首演`;
    return `《${p.title}》製作中（${p.status}；戲文 ${p.scriptFragments.length} 段、成之者 ${p.contributors.length} 人、積功 ${totalEffort(p)}／${PRODUCTION.rehearsalThreshold}）`;
}

function maybeRehearsing(p: Production): void {
    if (p.status !== 'premiered' && p.contributors.length >= PRODUCTION.minContributors && p.scriptFragments.length > 0) {
        if (p.status === 'scripted') p.status = 'rehearsing';
    }
}
