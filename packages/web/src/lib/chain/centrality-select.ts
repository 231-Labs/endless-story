/**
 * §4d.1 centrality thread-selector — stages the contention that is the story's HEART,
 * not the most urgent (§2.30: urgency starves the emotional core). Judges from human
 * incident framings alone (no tension/root leaks in, so domain-blind), only picks, and
 * falls back to the deterministic tension-sort on any failure.
 */

import { text as llmText } from '@endless-story/llm';
import { framingForStatement, selectContention, type TensionRow } from './event-planner';

type Selected = ReturnType<typeof selectContention>;

// Validated §2.30 prompts: only PICK, judge the heart, never write or decide the ending.
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
 * Pick the staged contention by centrality, not urgency. Falls back to the
 * deterministic `selectContention` on 0/1 candidates or any LLM failure.
 */
export async function selectContentionByCentrality(
    rows: ReadonlyArray<TensionRow>,
    recentKeys: ReadonlyArray<string> = [],
    opts: { mode?: 'centrality' | 'blend'; model?: string } = {},
): Promise<Selected> {
    const fallback = (): Selected => selectContention(rows, recentKeys);
    if (rows.length <= 1) return fallback();

    // Variety first (mirrors selectContention): skip recently-used rows so focus rotates.
    const recent = new Set(recentKeys);
    const fresh = rows.filter((r) => !recent.has(r.statement || framingForStatement(r.statement).templateId));
    const pool = fresh.length > 0 ? fresh : [...rows];
    if (pool.length <= 1) {
        const only = pool[0];
        return { ...framingForStatement(only.statement), statement: only.statement };
    }

    // Candidates carry the human framing only — no tension, no root label.
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
