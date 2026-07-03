/**
 * §4d.1 centrality thread-selector (治漂移) — the EMERGENT guard against the urgency drift.
 *
 * The runner's default `selectContention` sorts open contentions by tension and stages the
 * HIGHEST (most urgent/frustrated). Validated failure mode (§2.30 / riche-arc-resolve): the
 * most concrete/urgent thread (帳→入股→分紅…) hijacks the story and starves the emotional core
 * (柳生春 go-or-stay). Fix: pick by CENTRALITY ("which thread is the heart of this story")
 * instead of urgency. Decouple A/B/C proved it — urgency starved the romance 5/5, centrality /
 * blend held it 5/5.
 *
 * ── 寫死自檢 (why this is emergent, not a secret shortcut) ──────────────────────────
 *   Tempting shortcuts I did NOT take:
 *     ✗ boost the 情/affection row's score in the sort (hardcode 情 > 錢)
 *     ✗ give each row an author-assigned "centrality weight"
 *     ✗ order by root/label (romance/money/bond) — a domain-specific priority
 *   The emergent rule instead:
 *     · the selector judges "the story's heart" from each row's HUMAN INCIDENT FRAMING ALONE
 *       (`framingForStatement(...).label`, the very text POV reads) — NO tension number, NO
 *       root/priority tag leaks in, so it is domain-blind and portable to any story.
 *     · it ONLY picks; it never writes the scene or decides the outcome.
 *     · it falls back to the deterministic tension-sort on any failure, and is flag-gated —
 *       so it is safe, reversible, and adds nothing hardcoded to the world's priorities.
 */

import { text as llmText } from '@endless-story/llm';
import { framingForStatement, selectContention, type TensionRow } from './event-planner';

type Selected = ReturnType<typeof selectContention>;

// Validated §2.30 prompts. The selector is told plainly: only PICK, don't write, don't decide
// the ending — and judge the HEART, not the urgency.
const PROMPT: Record<'centrality' | 'blend', string> = {
    centrality:
        '你是世界的敘事調度（你只**挑**線、不寫戲、不決定結局）。下面是當前所有未了的線。挑出**對這個故事最要緊、最是情感核心、推進它最能成就一段好看的連續人戲**的一條，當下一場戲的焦點。**不是看哪條最急、最可操作，是看哪條是這故事真正的心。**',
    blend:
        '你是世界的敘事調度（你只**挑**線、不寫戲、不決定結局）。挑下一場戲的焦點：**以情感核心、故事的心為主**，但別讓真正火燒眉毛的事徹底爛掉。挑那條最能服務「一個持續好看的故事」的線。',
};

function parseObj(raw: string): Record<string, unknown> | null {
    const blocks = raw.match(/\{[\s\S]*?\}/g);
    if (!blocks?.length) return null;
    for (let i = blocks.length - 1; i >= 0; i -= 1) {
        try {
            return JSON.parse(blocks[i]) as Record<string, unknown>;
        } catch {
            /* try an earlier block */
        }
    }
    return null;
}

/**
 * Pick which contention to stage this tick BY CENTRALITY (the story's heart), not urgency.
 * Domain-blind (judges from incident framings only), variety-preserving, and safe: returns
 * the deterministic `selectContention` result on 0/1 candidates or any LLM failure.
 */
export async function selectContentionByCentrality(
    rows: ReadonlyArray<TensionRow>,
    recentKeys: ReadonlyArray<string> = [],
    opts: { mode?: 'centrality' | 'blend'; model?: string } = {},
): Promise<Selected> {
    const fallback = (): Selected => selectContention(rows, recentKeys);
    if (rows.length <= 1) return fallback();

    // Variety first (mirror selectContention): prefer rows whose template wasn't just used,
    // so the focus rotates rather than re-staging the same incident every tick.
    const recent = new Set(recentKeys);
    const fresh = rows.filter((r) => !recent.has(r.statement || framingForStatement(r.statement).templateId));
    const pool = fresh.length > 0 ? fresh : [...rows];
    if (pool.length <= 1) {
        const only = pool[0];
        return { ...framingForStatement(only.statement), statement: only.statement };
    }

    // Domain-blind candidate list: human incident framing ONLY (no tension, no root label).
    const cands = pool.map((r, i) => ({ id: String(i), row: r, label: framingForStatement(r.statement).label }));
    const list = cands.map((c) => `[${c.id}] ${c.label}`).join('\n');

    try {
        const client = llmText.createTextClient({ kind: 'primary' });
        const model = opts.model ?? client.defaultModel;
        const sys = `${PROMPT[opts.mode ?? 'blend']}\n只輸出 JSON：{"pick":"線的代號(數字)","reason":"一句為何挑它"}。不要 markdown。`;
        const res = await client.chat({
            model,
            system: sys,
            messages: [{ role: 'user', content: `當前未了的線：\n${list}\n\n挑一條。` }],
            maxTokens: 120,
            temperature: 0.6,
        });
        const o = parseObj(res.text);
        const pick = typeof o?.pick === 'string' || typeof o?.pick === 'number' ? String(o.pick).replace(/[^0-9]/g, '') : '';
        const chosen = cands.find((c) => c.id === pick)?.row ?? pool[0];
        const reason = typeof o?.reason === 'string' ? o.reason : '';
        console.log(`[centrality] 挑〔${framingForStatement(chosen.statement).label}〕${reason ? `← ${reason}` : ''}  (候選 ${cands.length})`);
        return { ...framingForStatement(chosen.statement), statement: chosen.statement };
    } catch {
        return fallback();
    }
}
