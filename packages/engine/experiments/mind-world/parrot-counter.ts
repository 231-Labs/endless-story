/**
 * PARROT COUNTER — do lived memories get re-said, or quoted?
 * ============================================================================
 * HYPOTHESIS (user, 2026-07-15): a memory the mind actually LIVED gets
 * re-verbalized in fresh words when it surfaces; a memory that was HANDED to it
 * as text can only be quoted, because there is no experience to re-say from.
 *
 * CONTROLLED BY CONSTRUCTION: both memory groups sit in the SAME system prompt,
 * in the SAME runs, under the SAME model. The only difference is provenance:
 *   A · authored  — canon-seed.ts, verbatim from spring-snow.json (never lived)
 *   B · lived     — memories-huileli.json, distilled BY the mind from a real
 *                   interlude season it played out
 *
 * METRIC (mechanical, no judgement): longest common substring (LCS) between each
 * memory and the generated text. In CJK a run of >= 8 identical characters is a
 * quote, not a coincidence. Reported per group, normalised by memory length.
 *
 * CONFOUND WORTH NAMING: the lived memories are in the MODEL's own idiom (it
 * wrote them), the authored ones in the user's. That biases TOWARD the lived
 * group being easier to reproduce verbatim — so a lower parrot rate for lived
 * memories is a result against the confound, not with it.
 *
 *   pnpm exec tsx experiments/mind-world/parrot-counter.ts <出檔.md> [更多檔...]
 */
import * as fs from 'node:fs';
import { CANON } from '../agent-season/canon-seed.ts';

const FILES = process.argv.slice(2);
const NAMES = ['柳生春', '金鳳'];
const EXTRA_PATH = process.env.MW_EXTRA_MEMORIES ?? '';

/** Longest common substring length (chars) — the quote-detector. */
function lcs(a: string, b: string): { len: number; text: string } {
    if (!a || !b) return { len: 0, text: '' };
    let prev = new Uint32Array(b.length + 1);
    let best = 0, bestEnd = 0;
    for (let i = 1; i <= a.length; i++) {
        const cur = new Uint32Array(b.length + 1);
        for (let j = 1; j <= b.length; j++) {
            if (a[i - 1] === b[j - 1]) {
                cur[j] = prev[j - 1] + 1;
                if (cur[j] > best) { best = cur[j]; bestEnd = i; }
            }
        }
        prev = cur;
    }
    return { len: best, text: a.slice(bestEnd - best, bestEnd) };
}

/** Strip punctuation/whitespace so a "quote" means real content, not 、。 runs. */
const norm = (s: string): string => s.replace(/[\s\p{P}\p{S}]/gu, '');

interface Row { group: string; name: string; mem: string; memLen: number; run: number; quote: string; invoked: boolean; hits: number }

/** Function-word bigrams carry no evidence of invocation. */
const STOP = /[的了是我你她他們這那就也都很不沒在有一個和跟把被上下去來說著過要會能對還又才只沒]/;
/** Distinctive bigrams = content-bearing, both chars non-stop. */
function rareBigrams(s: string): Set<string> {
    const out = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) {
        const b = s.slice(i, i + 2);
        if (!STOP.test(b[0]) && !STOP.test(b[1])) out.add(b);
    }
    return out;
}
/** INVOCATION GATE: the memory is "in play" only if the text reuses >= 2 of its
 *  distinctive bigrams. Without this the metric confuses "never came up" with
 *  "came up and was re-said in fresh words" — the whole question. */
const INVOKE_MIN = 2;

function analyse(file: string): Row[] {
    const out = norm(fs.readFileSync(file, 'utf-8'));
    const extra: Record<string, Array<string | { text: string }>> = EXTRA_PATH
        ? JSON.parse(fs.readFileSync(EXTRA_PATH, 'utf-8'))
        : {};
    const rows: Row[] = [];
    const add = (group: string, n: string, raw: string): void => {
        const t = norm(raw);
        const r = lcs(t, out);
        let hits = 0;
        for (const b of rareBigrams(t)) if (out.includes(b)) hits++;
        rows.push({
            group, name: n, mem: raw.slice(0, 24), memLen: t.length,
            run: r.len, quote: r.text, hits, invoked: hits >= INVOKE_MIN,
        });
    };
    for (const n of NAMES) {
        for (const m of CANON[n]?.memories ?? []) add('A·發下去', n, m.text);
        for (const e of extra[n] ?? []) add('B·活過的', n, typeof e === 'string' ? e : e.text);
    }
    return rows;
}

const QUOTE = 8; // >= 8 identical CJK chars = a quote
/** ONLY invoked memories are comparable: an un-recalled memory is silent, not
 *  "re-said". Reports both so the gate's effect is visible, never hidden. */
function report(label: string, rows: Row[]): void {
    for (const g of ['A·發下去', 'B·活過的']) {
        const all = rows.filter((r) => r.group === g);
        const rs = all.filter((r) => r.invoked);
        if (!all.length) continue;
        if (!rs.length) { console.log(`  ${g}｜被召喚 0/${all.length} — 無可比對`); continue; }
        const runs = rs.map((r) => r.run);
        const mean = runs.reduce((a, b) => a + b, 0) / rs.length;
        const quoted = rs.filter((r) => r.run >= QUOTE);
        const meanShare = rs.map((r) => r.run / r.memLen).reduce((a, b) => a + b, 0) / rs.length;
        console.log(
            `  ${g}｜被召喚 ${rs.length}/${all.length}｜召喚後：平均最長run=${mean.toFixed(1)}字  ` +
                `≥${QUOTE}字逐字=${quoted.length}/${rs.length} (${((quoted.length / rs.length) * 100).toFixed(0)}%)  ` +
                `佔記憶長度=${(meanShare * 100).toFixed(1)}%  最長=${Math.max(...runs)}字`,
        );
        const top = [...rs].sort((a, b) => b.run - a.run).slice(0, 2).filter((r) => r.run >= QUOTE);
        for (const t of top) console.log(`      └ ${t.name}「${t.quote}」(${t.run}字) ← ${t.mem}…`);
    }
}

const all: Row[] = [];
for (const f of FILES) {
    const rows = analyse(f);
    all.push(...rows);
    console.log(`\n■ ${f.split('/').pop()}`);
    report(f, rows);
}
if (FILES.length > 1) {
    console.log(`\n${'═'.repeat(64)}\n■ 全部合計`);
    report('all', all);
}
