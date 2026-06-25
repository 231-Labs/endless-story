/**
 * EMERGENT RELATIONSHIPS — evolve a scene's directed relationship tones FROM the
 * POV prose this tick produced, and write them back to the on-chain graph.
 *
 * This is the OBSERVATORY-ONLY counterpart to genesis relationship assessment
 * (runner `relationship-assess` + `assessRelationshipsAction`). Those judge ties
 * from the cast's PUBLIC DESCRIPTIONS at mint time and never read play. This one
 * does the opposite: it reads ONLY what just happened on stage (each participant's
 * POV of THIS event), and asks the LLM how each directed tie A→B should now read.
 *
 * Why it lives in the harness layer (not the production tick loop): it is an
 * EXPERIMENT to show that「感情」is an emergent relationship property, not a
 * contested resource. The narrative observatory runner calls it after each tick;
 * the production tick-loop is untouched.
 *
 * ── DIRECTIONAL by design ──────────────────────────────────────────────────────
 * On chain a `RelationshipSeeded` event is UNDIRECTED (a pair-level {A,B,tone}),
 * and `aggregatePairs`/`fetchOnChainEdgesFrom` read it symmetrically. To let one
 * side's feeling diverge from the other's (孟→文 romance while 文→孟 tension) we:
 *   1. seed each evolved tie ORDERED — characterA = the FEELER, characterB = the
 *      target — directly (NOT via applyRelationshipTiesAction, which idempotent-
 *      skips any pair that already has an edge, so tones could never move);
 *   2. read the evolution back DIRECTION-AWARE (`directedOutgoingEdges`), counting
 *      only events whose characterA is the source. Repeats deepen weight; the
 *      newest seed for a directed pair wins the tone — so a tie can climb
 *      (romance ×1 → ×2 → ×3) or flip (acquaintance → tension) tick over tick.
 */

import { Transaction } from '@mysten/sui/transactions';
import {
    ENDLESS_STORY_DEPLOYMENT,
    makeSuiClient,
    read,
    tx as endlessTx,
} from '@endless-story/sdk';
import type { RelationshipTone } from '@endless-story/shared';
import { text as llmText } from '@endless-story/llm';
import { getAdminContext } from '@/lib/chain/admin-signer';
import {
    isMemoryConfigured,
    rememberForCharacter,
} from '@/lib/chain/memory';
import { resolveNetwork } from '@/lib/chain/network';

const TONES: RelationshipTone[] = [
    'romance',
    'affection',
    'mentorship',
    'rivalry',
    'wary',
    'tension',
    'estrangement',
    'acquaintance',
    'neutral',
];
const TONE_SET = new Set<string>(TONES);

const TONE_ZH: Record<RelationshipTone, string> = {
    romance: '戀慕',
    affection: '親近',
    mentorship: '師徒',
    rivalry: '競爭',
    wary: '戒備',
    tension: '緊張',
    estrangement: '隔閡',
    acquaintance: '故舊',
    neutral: '平淡',
};

/** Chinese label for a tone (for the evolution-graph printout). */
export function toneZh(tone: RelationshipTone): string {
    return TONE_ZH[tone] ?? TONE_ZH.neutral;
}

/** Reverse map: Chinese label → enum, so a GLM reply of 「競爭」 isn't dropped to neutral. */
const ZH_TO_TONE = new Map<string, RelationshipTone>(
    (Object.entries(TONE_ZH) as [RelationshipTone, string][]).map(([en, zh]) => [zh, en]),
);

/** Accept the enum ('rivalry') OR its Chinese label ('競爭'); fall back to neutral. */
function coerceTone(raw: string): RelationshipTone {
    const t = raw.trim();
    const lower = t.toLowerCase();
    if (TONE_SET.has(lower)) return lower as RelationshipTone;
    return ZH_TO_TONE.get(t) ?? 'neutral';
}

/** One participant of the event this tick + the POV prose they wrote about it. */
export interface ScenePovInput {
    characterId: string;
    name: string;
    /** This character's POV chapter for THIS event (what they said / felt / did). */
    pov: string;
}

export interface EvolveRelationshipsInput {
    /** Participants of one event this tick (≥2) and their POV prose. */
    participants: ScenePovInput[];
    /** Scene the event happened in (the seeded tie is anchored here). */
    sceneId: string;
    /** Optional incident framing/label so the LLM knows what the scene was about. */
    eventLabel?: string;
    /** Override LLM model. */
    model?: string;
}

export interface EvolveRelationshipsResult {
    /** Directed ties seeded this tick (characterA = feeler). */
    seeded: number;
    /** How many ties the LLM proposed before id/text validation. */
    proposed: number;
    skipReason?: 'too_few_participants' | 'no_pov' | 'no_ties';
    error?: string;
}

/* ── prompt ────────────────────────────────────────────────────────────────── */

function buildSystemPrompt(): string {
    const toneList = TONES.map((t) => `${TONE_ZH[t]}(${t})`).join('、');
    return [
        '你是一個 saga 的「關係觀測師」。剛剛在一場戲裡，幾個角色同台，各自留下了這場的內心',
        'POV（他們此刻的言行、念頭、看對方的眼光）。你的工作：只根據**這場戲裡實際發生的事**，',
        '判斷每一條**有向**關係 A→B（A 看 B）在這場之後該是什麼調性 —— 戀慕、情敵、緊張、',
        '戒備…從互動裡自己長出來，而不是誰去搶誰。',
        '',
        '**判準鐵則**：',
        '  · 只在 POV 裡有**實質依據**時才為某條 A→B 給出 tone（A 對 B 的態度在這場戲裡',
        '    真的動了：靠近、心動、扶持、默契、惺惺相惜、感激、信賴，或嫉妒、忌憚、起摩擦、生隙…）。',
        '    沒演到的關係**不要硬給**。寧缺勿濫。',
        '  · **底色偏暖**：尋常同台相處的常態是中性到溫暖。戒備/競爭/緊張這類提防的 tone，要 POV 裡',
        '    有**明確的**摩擦或敵意才給；別把平常的搭檔、照面、客套讀成處處設防。暖的關係（親近／',
        '    默契／傾慕／感激）只要有一點善意流露就給。同一場戲，暖的邊本該比冷的多。',
        '  · **有向、不對稱**：A→B 與 B→A 可以、也常常不同。甲對乙傾心，乙對甲未必，',
        '    甚至可能是戒備或競爭。各寫各的，依各自 POV 裡的眼光判斷。',
        '  · **看這場、不看人設**：只憑這場戲的 POV，不要援引你想像的舊事。是這一場讓關係',
        '    往這個方向走的。',
        '  · 一場戲通常 0–4 條有向關係就夠。完全沒有實質變化時輸出空陣列。',
        '',
        `**tone**：從固定詞表選一個最貼切的：${toneList}。`,
        '  「戀慕(romance)」=情意；「競爭(rivalry)」=情敵/較勁；「緊張(tension)」=這場起了摩擦；',
        '  「戒備(wary)」=防著對方；「親近(affection)」=親厚但非戀慕。',
        '',
        '**memory**：每條 A→B 寫一句 A 的第一人稱內心（約 20–60 字，這場戲讓 A 對 B 生出的念頭），',
        '  並在句中**至少點一次 B 的姓名**。這是 A 私下記住這場戲的方式。',
        '',
        '**輸出格式**：嚴格只輸出一個 JSON 物件，不要 markdown、不要前言：',
        '`{"edges":[{"from":"姓名","to":"姓名","tone":"romance","memory":"…","importance":7}]}`',
        'from / to 用下方名單裡的**姓名**（原樣，別用 id、別改寫）；edges 最多 8 條；沒有就 `{"edges":[]}`。',
    ].join('\n');
}

function buildUserPrompt(input: EvolveRelationshipsInput): string {
    const cast = input.participants
        .map((p) => `- ${p.name}`)
        .join('\n');
    const povBlocks = input.participants
        .map((p) =>
            [
                `### ${p.name}（id=${p.characterId}）這場的 POV`,
                p.pov.trim().slice(0, 1400) || '（無）',
            ].join('\n'),
        )
        .join('\n\n');
    return [
        input.eventLabel ? `# 這場戲\n${input.eventLabel}` : '# 這場戲',
        '',
        '## 同台角色（from/to 只能用這些姓名）',
        cast,
        '',
        '## 各人這場的 POV（判斷關係變化的唯一依據）',
        povBlocks,
        '',
        '## 本次要求',
        '只憑上面的 POV，判斷**這場之後**哪些有向關係 A→B 動了，給出 tone + 一句 A 的內心。',
        '有向不對稱；寧缺勿濫；最多 8 條；只輸出 JSON 物件。',
    ].join('\n');
}

/* ── inference ─────────────────────────────────────────────────────────────── */

interface EvolvedEdge {
    fromId: string;
    toId: string;
    fromName: string;
    toName: string;
    tone: RelationshipTone;
    memory: string;
    importance: number;
}

function parseEdges(
    raw: string,
    byName: Map<string, ScenePovInput>,
): EvolvedEdge[] {
    // Take the LAST balanced {...} block: a leaked <think> block can carry its own
    // braces, so the real JSON object is the final one.
    const blocks = raw.match(/\{[\s\S]*?\}(?=[^}]*$)/g) ?? raw.match(/\{[\s\S]*\}/g);
    if (!blocks || blocks.length === 0) return [];
    let parsed: { edges?: unknown } | null = null;
    for (let i = blocks.length - 1; i >= 0; i--) {
        try {
            parsed = JSON.parse(blocks[i]) as { edges?: unknown };
            if (Array.isArray(parsed.edges)) break;
        } catch {
            /* try an earlier block */
        }
    }
    if (!parsed || !Array.isArray(parsed.edges)) return [];

    const out: EvolvedEdge[] = [];
    const seen = new Set<string>();
    for (const item of parsed.edges) {
        if (!item || typeof item !== 'object') continue;
        const obj = item as Record<string, unknown>;
        // The LLM emits NAMES, not the long zero-padded fake ids — a `0x09…000000`
        // id makes GLM stop mid-token (finish=stop at 81ch). Map names back to ids.
        const fromName = typeof obj.from === 'string' ? obj.from.trim() : '';
        const toName = typeof obj.to === 'string' ? obj.to.trim() : '';
        if (!fromName || !toName || fromName === toName) continue;
        const fromP = byName.get(fromName);
        const toP = byName.get(toName);
        // Reject hallucinated names — only co-present participants are valid.
        if (!fromP || !toP) continue;
        const dirKey = `${fromP.characterId}->${toP.characterId}`;
        if (seen.has(dirKey)) continue;
        const memory = typeof obj.memory === 'string' ? obj.memory.trim() : '';
        if (!memory) continue;
        const tone: RelationshipTone = coerceTone(typeof obj.tone === 'string' ? obj.tone : '');
        seen.add(dirKey);
        out.push({
            fromId: fromP.characterId,
            toId: toP.characterId,
            fromName: fromP.name,
            toName: toP.name,
            tone,
            memory: memory.slice(0, 220),
            importance: clampImportance(Number(obj.importance ?? 6)),
        });
        if (out.length >= 8) break;
    }
    return out;
}

function clampImportance(n: number): number {
    if (!Number.isFinite(n)) return 6;
    return Math.max(1, Math.min(10, Math.round(n)));
}

/**
 * Read one event's POVs → LLM → directed tone edges → seed them on chain
 * (ordered: characterA = feeler) + write the feeler's private memory.
 *
 * Returns a no-throw result; relationships are additive, never load-bearing.
 */
export async function evolveRelationshipsFromScene(
    input: EvolveRelationshipsInput,
): Promise<EvolveRelationshipsResult> {
    const participants = input.participants.filter((p) => p.characterId);
    if (participants.length < 2) {
        return { seeded: 0, proposed: 0, skipReason: 'too_few_participants' };
    }
    if (!participants.some((p) => p.pov && p.pov.trim())) {
        return { seeded: 0, proposed: 0, skipReason: 'no_pov' };
    }

    const d = ENDLESS_STORY_DEPLOYMENT;
    if (!d.packageId || !d.sagaId || !d.storytellerCapId) {
        return { seeded: 0, proposed: 0, error: 'saga 尚未種子化' };
    }

    // Key by NAME: the LLM references co-present characters by name (it can't copy
    // the long zero-padded fake ids), and observatory cast names are unique.
    const byName = new Map(participants.map((p) => [p.name, p]));

    let edges: EvolvedEdge[];
    try {
        const llm = llmText.createTextClient({ kind: 'primary' });
        const response = await llm.chat({
            model: input.model ?? llm.defaultModel,
            system: buildSystemPrompt(),
            messages: [
                {
                    role: 'user',
                    content: buildUserPrompt({ ...input, participants }),
                },
            ],
            maxTokens: 2200,
            temperature: 0.85,
        });
        edges = parseEdges(response.text, byName);
        if (process.env.ES_REL_DEBUG === '1') {
            console.log(
                `  [rel-evolve dbg] ${participants.length} POV → resp ${response.text.length}ch → ${edges.length} edge(s)` +
                    ` | head: ${response.text.slice(0, 260).replace(/\s+/g, ' ').trim()}`,
            );
        }
    } catch (err) {
        return { seeded: 0, proposed: 0, error: err instanceof Error ? err.message : String(err) };
    }

    if (edges.length === 0) {
        return { seeded: 0, proposed: 0, skipReason: 'no_ties' };
    }

    // Seed every directed edge — NO idempotency skip (the whole point is that a
    // tie can repeat to accumulate weight + flip tone over ticks). characterA is
    // the FEELER so direction-aware reads can tell A→B from B→A.
    const sceneId = input.sceneId || d.sceneIds[0];
    if (!sceneId) {
        return { seeded: 0, proposed: edges.length, error: '無可用 scene' };
    }
    try {
        const admin = getAdminContext();
        const tx = new Transaction();
        for (const e of edges) {
            tx.add(
                endlessTx.director.relationshipSeed({
                    cap: d.storytellerCapId,
                    saga: d.sagaId,
                    sceneId,
                    characterA: e.fromId,
                    characterB: e.toId,
                    tone: e.tone,
                }),
            );
        }
        const res = await admin.client.signAndExecuteTransaction({
            transaction: tx,
            signer: admin.signer,
            options: { showEffects: true },
        });
        if (res.effects?.status?.status !== 'success') {
            throw new Error(res.effects?.status?.error ?? 'relationship_seed 交易失敗');
        }
        await admin.client.waitForTransaction({ digest: res.digest });
    } catch (err) {
        return { seeded: 0, proposed: edges.length, error: err instanceof Error ? err.message : String(err) };
    }

    // Private one-sided memory: only the FEELER remembers their own read of the
    // scene. (Genesis writes symmetric memories; here each side's feeling is its
    // own, so the memory is directional too.) Best-effort; absence is not an error.
    if (isMemoryConfigured()) {
        for (const e of edges) {
            const text = `對「${e.toName}」：${e.memory}`;
            await rememberForCharacter(e.fromId, text, {
                kind: 'relationship',
                importance: e.importance,
            }).catch(() => false);
        }
    }

    return { seeded: edges.length, proposed: edges.length };
}

/* ── direction-aware read-back (for the evolution-graph printout) ───────────── */

export interface DirectedEdge {
    toId: string;
    toName: string;
    tone: RelationshipTone;
    /** repeat count — how many times this directed tie has been seeded (≈ weight). */
    weight: number;
}

/**
 * Outgoing edges FROM a character, DIRECTION-AWARE: only `RelationshipSeeded`
 * events whose character_a is this character count as its outgoing feeling.
 * Newest seed wins the tone, repeats add weight. Unlike `fetchOnChainEdgesFrom`
 * (which is undirected/symmetric), this lets 孟→文 diverge from 文→孟 so the
 * observatory can print true asymmetric evolution.
 *
 * `nameOf` resolves target ids to names (the harness passes its fake roster).
 */
/* ── cooling engine ─────────────────────────────────────────────────────────────
 * A tie's weight is no longer a raw repeat count (append-only ⇒ only ever grows ⇒
 * every relationship trends to romance and the graph saturates). Instead each seeding
 * contributes a TIME-DECAYED boost: a tie reaffirmed THIS tick counts full; one last
 * touched N ticks ago counts 0.5^(N/halfLife). Sum over a directed pair's seedings =
 * its current strength. Stop reaffirming a tie and it cools; let it fall below
 * `minStrength` and it FADES OUT of the graph entirely (drops off the read). This is
 * the down-force the model was missing — relationships now ebb, not just accrue.
 *
 * `provenance` (per-trigger accrual rates) layers on top of this later; the decay is
 * the foundation. Pure + exported so it can be unit-tested without an LLM or a chain. */
export interface RelEventLite {
    characterA: string;
    characterB: string;
    tone: string;
    /** Tick the tie was seeded on (harness encodes this in the event's seededAtMs). */
    tick: number;
}

/** Ticks for an un-reaffirmed tie to halve in strength. */
export const DECAY_HALF_LIFE = 2;
/** Strength below which a directed tie has cooled off the graph (faded out). */
export const DECAY_MIN_STRENGTH = 0.35;

export function aggregateDecayedOutgoing(
    events: RelEventLite[], // newest-first
    sourceId: string,
    nowTick: number,
    opts?: { halfLife?: number; minStrength?: number },
): DirectedEdge[] {
    const halfLife = opts?.halfLife ?? DECAY_HALF_LIFE;
    const minStrength = opts?.minStrength ?? DECAY_MIN_STRENGTH;
    // newest-first ⇒ the first seeding seen for a pair sets its (latest) tone.
    const byTarget = new Map<string, { toId: string; tone: RelationshipTone; strength: number }>();
    for (const ev of events) {
        if (ev.characterA !== sourceId) continue; // outgoing only
        const toId = ev.characterB;
        if (!toId || toId === sourceId) continue;
        const age = Math.max(0, nowTick - ev.tick);
        const boost = Math.pow(0.5, age / halfLife);
        const existing = byTarget.get(toId);
        if (existing) {
            existing.strength += boost;
        } else {
            byTarget.set(toId, { toId, tone: coerceTone(ev.tone), strength: boost });
        }
    }
    const out: DirectedEdge[] = [];
    for (const e of byTarget.values()) {
        if (e.strength < minStrength) continue; // cooled off the graph
        out.push({ toId: e.toId, toName: '', tone: e.tone, weight: e.strength });
    }
    return out.sort((a, b) => b.weight - a.weight);
}

export async function directedOutgoingEdges(
    characterId: string,
    nameOf: (id: string) => string,
): Promise<DirectedEdge[]> {
    const pkg = ENDLESS_STORY_DEPLOYMENT.packageId;
    if (!pkg) return [];
    const client = makeSuiClient({ network: resolveNetwork() });
    const summaries = await read.director
        .listRelationshipEvents(client, pkg, { maxEvents: 1000 })
        .catch(() => []);
    // In the harness, seededAtMs carries the seed TICK (see full-tick-fake-chain).
    const events: RelEventLite[] = summaries.map((s) => ({
        characterA: s.characterA,
        characterB: s.characterB,
        tone: s.tone,
        tick: Number(s.seededAtMs) || 0,
    }));
    // "Now" = the most recent tick any tie was seeded on; ages are measured back from it.
    const nowTick = events.reduce((m, e) => Math.max(m, e.tick), 0);
    return aggregateDecayedOutgoing(events, characterId, nowTick).map((e) => ({
        ...e,
        toName: nameOf(e.toId),
    }));
}
