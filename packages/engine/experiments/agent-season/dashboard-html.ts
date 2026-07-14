/**
 * AGENT-SEASON · CHARACTER DASHBOARD — the GAME lens (not the novel lens).
 * ============================================================================
 * Per character: what they CARE about (live wants), what they are SCHEMING
 * (小算盤), how their unspoken matter moved (心事自改 chain), and WHERE they
 * went every 時辰 with their own plan line. Parsed from report.md +
 * console.log + cast-state.json — no LLM.
 *
 *   tsx experiments/agent-season/dashboard-html.ts <out.html> <runDir>
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const [outPath, runDir] = process.argv.slice(2);
if (!outPath || !runDir) {
    console.error('usage: tsx dashboard-html.ts <out.html> <runDir>');
    process.exit(1);
}

const report = fs.readFileSync(path.join(runDir, 'report.md'), 'utf-8');
const console_ = fs.readFileSync(path.join(runDir, 'console.log'), 'utf-8');
const snap = JSON.parse(fs.readFileSync(path.join(runDir, 'cast-state.json'), 'utf-8')) as {
    cast: Record<string, { wants: Array<{ desc: string; retired?: boolean; kind: string }>; secret?: string; scheme?: string | null; health?: number; money?: number; craft?: number }>;
};

// ── parse per-時辰 placements from the report ──
interface Move { tick: number; label: string; from: string; to: string; plan?: string; act?: string }
const moves = new Map<string, Move[]>();
const sections = report.split(/^### 時辰 (\d+) · (.+)$/m);
for (let i = 1; i + 2 < sections.length + 1 && i + 2 <= sections.length; i += 3) {
    const tick = Number(sections[i]);
    const label = (sections[i + 1] ?? '').replace(/（.*/, '');
    const body = sections[i + 2] ?? '';
    const re = /^ {2}- \*\*(.+?)\*\*（(.+?)→(.+?)）｜tools: (.+)$/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body))) {
        const [, name, from, to, tools] = m;
        const tail = body.slice(m.index + m[0].length, m.index + m[0].length + 800);
        const plan = /^\s+- 計劃：(.+)$/m.exec(tail)?.[1];
        const act = /interact\((.+?)\)/.exec(tools)?.[1]?.replace('｜', '——');
        const arr = moves.get(name) ?? [];
        arr.push({ tick, label, from, to, plan, act });
        moves.set(name, arr);
    }
}

// ── 心事自改 chains from console ──
const secretChains = new Map<string, string[]>();
for (const m of console_.matchAll(/〔心事自改〕(.+?)：(.+)/g)) {
    const arr = secretChains.get(m[1]) ?? [];
    arr.push(m[2]);
    secretChains.set(m[1], arr);
}
// ── 盤算 lines from console (S4+) ──
const schemes = new Map<string, string[]>();
for (const m of console_.matchAll(/〔盤算〕(.+?)：(.+)/g)) {
    const arr = schemes.get(m[1]) ?? [];
    arr.push(m[2]);
    schemes.set(m[1], arr);
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const names = [...moves.keys()];
const panels = names
    .map((name) => {
        const st = snap.cast[name];
        const wants = (st?.wants ?? []).filter((w) => !w.retired && w.kind === 'narrative').map((w) => w.desc);
        const chain = secretChains.get(name) ?? [];
        const sch = st?.scheme ?? schemes.get(name)?.slice(-1)[0];
        const rows = (moves.get(name) ?? [])
            .map(
                (mv) => `<tr><td class="t">${esc(mv.label)}</td><td class="v">${esc(mv.from === mv.to ? mv.to : `${mv.from} → ${mv.to}`)}</td><td class="p">${esc(mv.act ? `找${mv.act}` : mv.plan ? mv.plan.slice(0, 80) : '')}</td></tr>`,
            )
            .join('\n');
        return `
<details class="char">
<summary><b>${esc(name)}</b><span class="meta">血 ${st?.health?.toFixed(2) ?? '—'} · 錢 ${st?.money ?? '—'} · 手感 ${st?.craft?.toFixed(2) ?? '—'}</span></summary>
<div class="grid">
<div class="col">
<h4>在意（季末活 want）</h4>
<ul>${wants.map((w) => `<li>${esc(w)}</li>`).join('') || '<li class="dim">（心無掛記）</li>'}</ul>
${sch ? `<h4>小算盤</h4><p class="scheme">${esc(sch)}</p>` : ''}
<h4>心事軌跡</h4>
<ol class="chain">${chain.map((c) => `<li>${esc(c)}</li>`).join('') || '<li class="dim">（未曾自改）</li>'}</ol>
</div>
<div class="col">
<h4>行蹤（每時辰）</h4>
<table><thead><tr><th>時辰</th><th>在哪</th><th>幹嘛（TA自己的話）</th></tr></thead><tbody>${rows}</tbody></table>
</div>
</div>
</details>`;
    })
    .join('\n');

const html = `<title>春雪社 · 角色儀表板</title>
<style>
body{font-family:ui-serif,serif;max-width:1100px;margin:0 auto;padding:1rem;line-height:1.7}
.char{border:1px solid rgba(128,96,64,.35);border-radius:10px;margin:.8rem 0;padding:.4rem .9rem}
summary{cursor:pointer;font-size:1.1rem;padding:.4rem 0}
.meta{float:right;font-size:.85rem;opacity:.7}
.grid{display:grid;grid-template-columns:1fr 1.4fr;gap:1rem}
@media(max-width:800px){.grid{grid-template-columns:1fr}}
h4{margin:.6rem 0 .2rem;font-size:.9rem;opacity:.75}
ul,ol{margin:.2rem 0;padding-left:1.2em}
table{width:100%;border-collapse:collapse;font-size:.85rem}
td,th{border-bottom:1px solid rgba(128,128,128,.25);padding:.25rem .4rem;text-align:left;vertical-align:top}
td.t{white-space:nowrap;opacity:.7}td.v{white-space:nowrap}
.chain li{margin:.3rem 0;font-size:.88rem}
.scheme{background:rgba(200,160,60,.12);padding:.4rem .6rem;border-radius:6px;font-size:.9rem}
.dim{opacity:.5}
</style>
<h1>春雪社 · 角色儀表板</h1>
<p>遊戲鏡頭：每個人此刻在意什麼、打什麼算盤、心事怎麼走過來、每個時辰去了哪在幹嘛（全部是TA們自己的話，機械抽取零改寫）。</p>
${panels}`;
fs.writeFileSync(outPath, html);
console.log(`dashboard: ${outPath} (${names.length} 人)`);
