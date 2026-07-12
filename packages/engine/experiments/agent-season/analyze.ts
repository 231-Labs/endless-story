/**
 * AGENT-SEASON · COLLAPSE ANALYZER — mechanical narrative-health metrics.
 * ============================================================================
 * Reads a season's report.md and prints per-day indicators that expose the
 * classic long-run collapses BEFORE a human reads 300 chapters:
 *   · scene volume + venue diversity per day (metronome / world-goes-quiet),
 *   · relationship-view overwrites per day (relationship freeze),
 *   · want resolutions per day (arc starvation vs churn),
 *   · PROSE REPETITION: per-day woven-chapter 5-gram overlap against ALL prior
 *     days (the 複讀機 signal — a rising curve = the writer is looping), plus
 *     the top cross-day repeated phrases so the loop is nameable.
 *
 * Usage: tsx experiments/agent-season/analyze.ts <outDir-with-report.md>
 * Pure read-only; no LLM, no network.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const dir = process.argv[2];
if (!dir) {
    console.error('usage: tsx analyze.ts <season outDir>');
    process.exit(1);
}
const md = fs.readFileSync(path.join(dir, 'report.md'), 'utf-8');

// ── parse the 時辰 transcript ────────────────────────────────────────────────
interface Round {
    day: number;
    part: string;
    fastForward: boolean;
    venues: string[];
    sceneCount: number;
    bedScenes: number;
    discoveries: number;
    resolved: number;
    consolidations: number;
    chapterText: string;
}

const rounds: Round[] = [];
{
    const blocks = md.split(/^### 時辰 /m).slice(1);
    for (const b of blocks) {
        const head = b.match(/^(\d+) · 第(\d+)日·([^（\n]+)/);
        if (!head) continue;
        const day = Number(head[2]);
        const part = head[3].trim();
        const fastForward = /\*\*過場（fast-forward）\*\*/.test(b);
        const venues = [...b.matchAll(/\*\*場景 @ ([^*〔（(]+?)\*\*/g)].map((m) => m[1].trim());
        const bedScenes = (b.match(/〔床〕/g) ?? []).length;
        const discoveries = (b.match(/〔修羅場〕/g) ?? []).length;
        const resolved = (b.match(/- 了結：/g) ?? []).length;
        const consolidations = (b.match(/\*\*深宵覆蓋 · /g) ?? []).length;
        // woven prose = every "> " quoted line that is NOT a beat line (beats start "> **名**：")
        const chapterText = b
            .split('\n')
            .filter((l) => /^\s*> /.test(l) && !/^\s*> \*\*/.test(l) && !/^\s*> 〔心〕/.test(l))
            .map((l) => l.replace(/^\s*> /, ''))
            .join('');
        rounds.push({ day, part, fastForward, venues, sceneCount: venues.length, bedScenes, discoveries, resolved, consolidations, chapterText });
    }
}
const days = [...new Set(rounds.map((r) => r.day))].sort((a, b) => a - b);

// ── per-day mechanical indicators ────────────────────────────────────────────
console.log('day | scenes | venues(distinct) | 床 | 修羅場 | 了結 | 深宵覆蓋 | prose(chars)');
console.log('----|--------|------------------|----|--------|------|----------|------------');
const dayProse = new Map<number, string>();
for (const d of days) {
    const rs = rounds.filter((r) => r.day === d);
    const venues = new Set(rs.flatMap((r) => r.venues));
    const prose = rs.map((r) => r.chapterText).join('');
    dayProse.set(d, prose);
    console.log(
        `${String(d).padStart(3)} | ${String(rs.reduce((a, r) => a + r.sceneCount, 0)).padStart(6)} | ${String(venues.size).padStart(16)} | ${String(rs.reduce((a, r) => a + r.bedScenes, 0)).padStart(2)} | ${String(rs.reduce((a, r) => a + r.discoveries, 0)).padStart(6)} | ${String(rs.reduce((a, r) => a + r.resolved, 0)).padStart(4)} | ${String(rs.reduce((a, r) => a + r.consolidations, 0)).padStart(8)} | ${prose.length}`,
    );
}

// ── prose repetition: 5-gram overlap of each day vs ALL PRIOR days ───────────
function grams(s: string, n = 5): Set<string> {
    const clean = s.replace(/[\s「」『』，。！？；：、—…·()（）]/g, '');
    const out = new Set<string>();
    for (let i = 0; i + n <= clean.length; i++) out.add(clean.slice(i, i + n));
    return out;
}
console.log('\nprose repetition (5-gram overlap vs all PRIOR days — rising = 複讀機):');
const seen = new Set<string>();
const gramOwners = new Map<string, number>(); // gram → first day
for (const d of days) {
    const g = grams(dayProse.get(d) ?? '');
    if (!g.size) {
        console.log(`  day ${d}: (no prose)`);
        continue;
    }
    let hit = 0;
    for (const x of g) if (seen.has(x)) hit += 1;
    const pct = Math.round((hit / g.size) * 100);
    console.log(`  day ${d}: ${pct}% of ${g.size} grams already written on a prior day`);
    for (const x of g) {
        if (!seen.has(x)) {
            seen.add(x);
            gramOwners.set(x, d);
        }
    }
}

// ── the nameable loops: longest phrases repeated across ≥3 distinct days ─────
console.log('\ntop cross-day repeated phrases (8-grams seen on ≥3 days):');
const phraseDays = new Map<string, Set<number>>();
for (const d of days) {
    for (const x of grams(dayProse.get(d) ?? '', 8)) {
        let s = phraseDays.get(x);
        if (!s) phraseDays.set(x, (s = new Set()));
        s.add(d);
    }
}
const repeated = [...phraseDays.entries()]
    .filter(([, s]) => s.size >= 3)
    .sort((a, b) => b[1].size - a[1].size);
// de-overlap: skip a phrase contained in an already-printed longer context
const printed: string[] = [];
for (const [phrase, ds] of repeated) {
    if (printed.some((p) => p.includes(phrase) || phrase.includes(p))) continue;
    printed.push(phrase);
    console.log(`  「${phrase}」 × ${ds.size} 天 (${[...ds].join(',')})`);
    if (printed.length >= 15) break;
}
if (!printed.length) console.log('  （無 — 沒有任何 8 字片語跨 3 天重複）');
