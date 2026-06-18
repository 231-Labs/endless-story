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

    // ── storyteller-chapter enrichment (all optional, append-only) ────────────
    /**
     * 'overview' = 綜觀版: a wider recap of an arc that has NOT cleanly resolved
     * (the anti-stuck path); 'progressed' = a focused next chapter on a real turn.
     * Shapes the closing instruction. Absent ⇒ the legacy single-event weave.
     */
    mode?: 'progressed' | 'overview';
    /** Daily observations the cast made (who was present, the stakes, the news). */
    observations?: string[];
    /** Inner lines behind card plays — what a character thought/said as they acted. */
    intents?: Array<{ name: string; line: string }>;
    /** Recalled past memories that deepen motivation / continuity. */
    recalled?: Array<{ name: string; text: string }>;
    /** The previous chapter's summary — the "已說過，勿重述" guard. */
    prevSummary?: string;
    /**
     * Story-bible continuity (承先啟後) — makes this read as the next movement of
     * one novel, not an isolated recap. Shape mirrors story-bible.ContinuityContext.
     */
    continuity?: {
        /** Story so far. */
        synopsis?: string;
        /** Unresolved threads relevant to this cast, "title：state". */
        openThreads?: string[];
        /** Hooks the previous chapter left dangling — pay ≥1 off. */
        hooks?: string[];
        /** This cast's current arcs. */
        castArcs?: Array<{ name: string; state: string }>;
    };
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

    const sections: string[] = [head.join('\n'), ''];

    // 承先 — the story bible comes FIRST so the writer treats it as the spine: this
    // chapter is the next movement of an ongoing novel, not a standalone recap.
    const cont = ctx.continuity;
    if (cont && (cont.synopsis || cont.openThreads?.length || cont.hooks?.length || cont.castArcs?.length)) {
        sections.push('# 故事總綱（承先：這是連載小說的下一回，接著往下寫，別從頭講起）');
        if (cont.synopsis) sections.push(`故事至此：${cont.synopsis}`);
        if (cont.castArcs?.length) {
            sections.push('在場角色此刻：');
            sections.push(cont.castArcs.map((a) => `- ${a.name}：${a.state}`).join('\n'));
        }
        if (cont.openThreads?.length) {
            sections.push('未了的線（挑一條推進）：');
            sections.push(cont.openThreads.map((t) => `- ${t}`).join('\n'));
        }
        if (cont.hooks?.length) {
            sections.push('上一回留下的鉤子（至少接一個）：');
            sections.push(cont.hooks.map((h) => `- ${h}`).join('\n'));
        }
        sections.push('');
    }

    // The "已說過" guard goes near the top so the model treats it as a hard
    // constraint: build FORWARD from here, don't re-narrate what's settled.
    if (ctx.prevSummary?.trim()) {
        sections.push(
            '# 前情（已寫過，切勿重述，只接著往下推進）',
            ctx.prevSummary.trim(),
            '',
        );
    }

    sections.push('# 各角色 POV（原料，把它們織成一回）', povBlocks, '');

    // Enrichment: everything the cast also knows. Append-only so the legacy
    // single-event weave (no enrichment) renders byte-for-byte as before.
    if (ctx.observations?.length) {
        sections.push(
            '# 旁觀與日常（補充客觀事實，可化作場景與過場，不必逐條照搬）',
            ctx.observations.map((o) => `- ${o.trim()}`).join('\n'),
            '',
        );
    }
    if (ctx.intents?.length) {
        sections.push(
            '# 出牌時的心跡（角色為何這麼做——可化作一兩句內心或台詞）',
            ctx.intents.map((it) => `- ${it.name}：${it.line.trim()}`).join('\n'),
            '',
        );
    }
    if (ctx.recalled?.length) {
        sections.push(
            '# 舊事（人物心裡記得的，拿來深化動機，別當新事件寫）',
            ctx.recalled.map((r) => `- ${r.name}：${r.text.trim()}`).join('\n'),
            '',
        );
    }

    sections.push(
        ctx.mode === 'overview'
            ? '請把以上素材織成一回「綜觀版」章回：用一個說書人的眼睛，把這條線這幾日累積的動作與心思收束成一篇有來龍去脈的完整 markdown（不是流水帳，挑出真正要緊的轉折來寫）。'
            : '請輸出這一回的完整 markdown。',
    );
    // 啟後 — only when we're writing inside an ongoing novel (continuity present).
    if (cont && (cont.synopsis || cont.openThreads?.length || cont.hooks?.length)) {
        sections.push(
            '寫作要求：接續前文語氣與未了的線（承先），呼應前面提過的人事細節（callback）；' +
                '推進其中至少一條線，並在結尾留下一個讓人想追下一回的鉤子（啟後）。' +
                '它要像長篇小說的一個章節，不是獨立的事件報導。',
        );
    }

    return sections.join('\n');
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
