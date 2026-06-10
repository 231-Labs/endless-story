/**
 * Event-Chapter Compiler — pure weave logic (gate + user prompt + cut header).
 *
 * Deliberately free of runtime imports (only a type-only `SagaSoul`) so it runs
 * cleanly under `node --test` on TS source. The soul-dependent system prompt
 * lives in `prompt.ts`, which re-exports everything here.
 */

import type { SagaSoul } from '../character-worker/saga-soul.js';

export interface EventCutPov {
    characterId: string;
    characterName: string;
    /** Role / 行當 (e.g. 花旦) — colours how the narrator frames this angle. */
    role?: string;
    /** Clean POV prose (provenance header already stripped). */
    body: string;
}

export interface EventCutContext {
    sagaName: string;
    soul?: SagaSoul;
    /** 1-indexed narrative day. */
    day?: number;
    sceneName?: string;
    /** Human-readable incident framing (storylet label). */
    eventLabel?: string;
    /** The POVs to weave (already gated to ≥2 by the caller). */
    povs: EventCutPov[];
}

/** Minimum POVs for a cut. 1 POV stays a per-character feed item (no weave). */
export const MIN_POVS_FOR_CUT = 2;

/** Gate: an event is worth weaving only when ≥2 characters left a POV of it. */
export function shouldWeave(povs: ReadonlyArray<EventCutPov>): boolean {
    return countDistinctVoices(povs) >= MIN_POVS_FOR_CUT;
}

/** Distinct character voices among the POVs (dedupes accidental repeats). */
export function countDistinctVoices(povs: ReadonlyArray<EventCutPov>): number {
    return new Set(povs.filter((p) => p.body.trim()).map((p) => p.characterId)).size;
}

export function buildUserPrompt(ctx: EventCutContext): string {
    const head: string[] = ['# 事件框架（客觀事實，不可違背）', `- 戲班：${ctx.sagaName}`];
    if (ctx.day != null) head.push(`- 第 ${ctx.day} 日`);
    if (ctx.sceneName) head.push(`- 場景：${ctx.sceneName}`);
    if (ctx.eventLabel) head.push(`- 這樁事：${ctx.eventLabel}`);
    head.push(
        `- 在場：${ctx.povs.map((p) => `${p.characterName}${p.role ? `（${p.role}）` : ''}`).join('、')}`,
    );

    const povBlocks = ctx.povs
        .filter((p) => p.body.trim())
        .map(
            (p, i) =>
                `## 視角 ${i + 1}：${p.characterName}${p.role ? `（${p.role}）` : ''}\n${p.body.trim()}`,
        )
        .join('\n\n');

    return [
        head.join('\n'),
        '',
        '# 各角色 POV（原料，把它們織成一回）',
        povBlocks,
        '',
        '請輸出這一回的完整 markdown。',
    ].join('\n');
}

/* ── cut provenance header ──────────────────────────────────────────────
 * Mirrors web's chapter-provenance.ts (POV uses `es:prov`; a cut uses
 * `es:cut`). Rides inside the SAME immutable blob that commitment::commit
 * anchors, so the cut→event link is itself chain-verifiable. Readers strip it
 * before rendering and surface eventTx as a "verify on chain" line. */

export interface EventCutHeader {
    v: 1;
    kind: 'event_cut';
    /** tx digest of the on-chain event this cut narrates — the proof. */
    eventTx?: string;
    eventLabel?: string;
    sceneId?: string;
    sceneName?: string;
    day?: number;
    /** Characters whose POVs were woven in. */
    povCharacterIds: string[];
    /** Source POV Walrus blob ids (when known) — lets a reader open each angle. */
    sourcePovBlobIds?: string[];
}

const CUT_RE = /^<!--es:cut\s+(\{[\s\S]*?\})\s*-->\s*/;

export function embedCutHeader(prose: string, header: EventCutHeader): string {
    return `<!--es:cut ${JSON.stringify(header)}-->\n\n${prose}`;
}

export function parseCutHeader(content: string): { header?: EventCutHeader; body: string } {
    const m = content.match(CUT_RE);
    if (!m) return { body: content };
    try {
        return { header: JSON.parse(m[1]) as EventCutHeader, body: content.slice(m[0].length) };
    } catch {
        return { body: content };
    }
}
