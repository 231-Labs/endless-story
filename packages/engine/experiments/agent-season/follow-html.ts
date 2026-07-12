/**
 * AGENT-SEASON · FOLLOW-HTML — the 追角 reading surface over season report.md.
 * ============================================================================
 * The raw report is an engineering transcript (placements, tools, wages inline);
 * the STORY is buried in three registers that are all already there:
 *   · 正史 — each scene's woven 章回 (or its beats when no weave),
 *   · 鏡頭 — each character's first-person POV 帳 (the appendix, day-keyed),
 *   · 骨架 — 了結 (resolutions), 床/修羅場 marks, the finale.
 * This tool re-renders those as one continuous reader: days as chapters, scenes
 * as cards (織回 first, beats collapsible), each day closed by that day's POV
 * diaries, and a 只看TA lens that filters scenes+diaries to one character.
 *
 * Usage:  tsx follow-html.ts <out.html> <w1-report.md> [<w2-report.md> ...]
 * Later files continue the day numbering (a chained season reads as one run).
 * Pure read-only over report.md; no LLM, no network.
 */

import * as fs from 'node:fs';

interface Scene {
    venue: string;
    isPrivate: boolean;
    bed: boolean;
    discovery: boolean;
    participants: string[];
    chapter: string[];
    beats: Array<{ name: string; text: string; inner?: string }>;
    resolved: string[];
}
interface Round {
    day: number;
    part: string;
    scenes: Scene[];
    chapter: string[];
    passLine?: string;
}

function parseReport(md: string, dayOffset: number): { rounds: Round[]; pov: Map<string, Map<number, string>> } {
    const rounds: Round[] = [];
    const blocks = md.split(/^### 時辰 /m).slice(1);
    for (const b of blocks) {
        const head = b.match(/^(\d+) · 第(\d+)日·([^（\n]+)/);
        if (!head) continue;
        const round: Round = { day: Number(head[2]) + dayOffset, part: head[3].trim(), scenes: [], chapter: [] };
        const ff = b.match(/\*\*過場（fast-forward）\*\*：(.+)/);
        if (ff) round.passLine = ff[1].trim();
        const lines = b.split('\n');
        let cur: Scene | null = null;
        let mode: 'none' | 'sceneChapter' | 'roundChapter' = 'none';
        for (const l of lines) {
            const sc = l.match(/^ {2}- \*\*場景 @ ([^*]+?)\*\*((?:（私）|〔床〕|〔修羅場〕)*)：(.+)$/);
            if (sc) {
                cur = {
                    venue: sc[1].trim(),
                    isPrivate: sc[2].includes('（私）'),
                    bed: sc[2].includes('〔床〕'),
                    discovery: sc[2].includes('〔修羅場〕'),
                    participants: sc[3].split('×').map((s) => s.trim()),
                    chapter: [],
                    beats: [],
                    resolved: [],
                };
                round.scenes.push(cur);
                mode = 'none';
                continue;
            }
            if (/^ {2}- \*\*章回（織回）\*\*：/.test(l)) {
                cur = null;
                mode = 'roundChapter';
                continue;
            }
            if (/^ {4}- \*\*章回（此場織回）\*\*：/.test(l)) {
                mode = 'sceneChapter';
                continue;
            }
            if (/^ {4}- 分鏡（/.test(l)) {
                mode = 'none';
                continue;
            }
            const res = l.match(/^ {4}- 了結：(.+)$/);
            if (res && cur) {
                cur.resolved.push(...res[1].split('；').map((s) => s.trim()).filter(Boolean));
                continue;
            }
            const q = l.match(/^ {4,}> (.+)$/);
            if (q) {
                const t = q[1];
                const beat = t.match(/^\*\*([^*]+)\*\*：(.+)$/);
                if (beat && cur && mode !== 'sceneChapter') {
                    // W1-era archives carry the model's self-name prefix (「金鳳：靠在…」)
                    // that newer runs strip at parse; strip it at render for old data.
                    const text = beat[2].replace(new RegExp(`^${beat[1].replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\s*[:：]\\s*`), '');
                    cur.beats.push({ name: beat[1], text });
                } else if (/^〔心〕/.test(t) && cur?.beats.length) {
                    cur.beats[cur.beats.length - 1].inner = t.replace(/^〔心〕/, '');
                } else if (mode === 'sceneChapter' && cur) {
                    cur.chapter.push(t);
                } else if (mode === 'roundChapter') {
                    round.chapter.push(t);
                }
            }
        }
        rounds.push(round);
    }
    // POV appendix: "### 名 的帳" then "- **第D日**：text"
    const pov = new Map<string, Map<number, string>>();
    const povSection = md.split(/^## 各人視角/m)[1];
    if (povSection) {
        for (const seg of povSection.split(/^### /m).slice(1)) {
            const name = seg.split('\n')[0].replace(/的帳.*$/, '').trim();
            if (!name || /^#/.test(name)) continue;
            const days = new Map<number, string>();
            for (const m of seg.matchAll(/^- \*\*第(\d+)日\*\*：(.+)$/gm)) days.set(Number(m[1]) + dayOffset, m[2]);
            if (days.size) pov.set(name, days);
        }
    }
    return { rounds, pov };
}

// ── render ────────────────────────────────────────────────────────────────────
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function render(rounds: Round[], pov: Map<string, Map<number, string>>, castNames: string[]): string {
    const days = [...new Set(rounds.map((r) => r.day))].sort((a, b) => a - b);
    const chips = castNames
        .map((n) => `<button class="chip" data-who="${esc(n)}" onclick="lens('${esc(n)}')">${esc(n)}</button>`)
        .join('');
    const daySections = days
        .map((d) => {
            const rs = rounds.filter((r) => r.day === d);
            const prevRes = rounds
                .filter((r) => r.day === d - 1)
                .flatMap((r) => r.scenes)
                .flatMap((s) => s.resolved)
                .map((x) => x.split('｜')[0]);
            const recap = prevRes.length
                ? `<div class="recap">前情：昨日了結——${prevRes.map((x) => esc(x)).join('；')}。</div>`
                : '';
            const body = rs
                .map((r) => {
                    const parts: string[] = [];
                    for (const s of r.scenes) {
                        const badge = `${s.discovery ? '<span class="badge shura">修羅場</span>' : ''}${s.bed ? '<span class="badge bed">床</span>' : ''}${s.isPrivate && !s.bed ? '<span class="badge priv">私</span>' : ''}`;
                        const prose = s.chapter.length
                            ? `<div class="prose">${s.chapter.map((p) => `<p>${esc(p)}</p>`).join('')}</div>`
                            : '';
                        const beats = s.beats.length
                            ? `<details${s.chapter.length ? '' : ' open'}><summary>分鏡 ${s.beats.length} 拍</summary>${s.beats
                                  .map(
                                      (b) =>
                                          `<p class="beat"><b>${esc(b.name)}</b>　${esc(b.text)}${b.inner ? `<span class="inner">〔心〕${esc(b.inner)}</span>` : ''}</p>`,
                                  )
                                  .join('')}</details>`
                            : '';
                        const res = s.resolved.length
                            ? `<div class="resolved">✦ ${s.resolved.map((x) => esc(x.split('｜')[0])).join('；')}</div>`
                            : '';
                        parts.push(
                            `<article class="scene" data-cast="${esc(s.participants.join('|'))}">` +
                                `<header><span class="who">${esc(s.participants.join(' × '))}</span><span class="where">${esc(s.venue)} · ${esc(r.part)}</span>${badge}</header>` +
                                prose +
                                beats +
                                res +
                                `</article>`,
                        );
                    }
                    if (r.chapter.length && !r.scenes.some((s) => s.chapter.length)) {
                        parts.push(`<article class="scene weave" data-cast=""><header><span class="where">${esc(r.part)} · 織回</span></header><div class="prose">${r.chapter.map((p) => `<p>${esc(p)}</p>`).join('')}</div></article>`);
                    }
                    return parts.join('');
                })
                .join('');
            const diaries = castNames
                .map((n) => {
                    const t = pov.get(n)?.get(d);
                    return t
                        ? `<article class="diary" data-cast="${esc(n)}"><header>🌙 ${esc(n)} 的深宵帳</header><p>${esc(t)}</p></article>`
                        : '';
                })
                .join('');
            return `<section class="day"><h2>第${d}日</h2>${recap}${body}${diaries || ''}</section>`;
        })
        .join('');

    return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>春雪社 · 十四日追角讀本</title>
<style>
:root{--bg:#ece2cf;--panel:#f6efe0;--panel2:#f1e8d5;--ink:#2b2119;--dim:#7a6b56;--zhu:#a5322a;--gold:#8f6f2c;--line:rgba(60,40,20,.16);--kai:"Kaiti SC","STKaiti","KaiTi","楷体","Noto Serif CJK TC",serif;--serif:"Songti SC","STSong","Songti TC","Noto Serif CJK TC","宋体",serif}
@media (prefers-color-scheme:dark){:root{--bg:#15110d;--panel:#1e1811;--panel2:#231b13;--ink:#ece0c6;--dim:#a08d70;--zhu:#d1614d;--gold:#c9a24c;--line:rgba(220,190,140,.16)}}
:root[data-theme="light"]{--bg:#ece2cf;--panel:#f6efe0;--panel2:#f1e8d5;--ink:#2b2119;--dim:#7a6b56;--zhu:#a5322a;--gold:#8f6f2c;--line:rgba(60,40,20,.16)}
:root[data-theme="dark"]{--bg:#15110d;--panel:#1e1811;--panel2:#231b13;--ink:#ece0c6;--dim:#a08d70;--zhu:#d1614d;--gold:#c9a24c;--line:rgba(220,190,140,.16)}
body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--serif);line-height:1.95}
.wrap{max-width:42em;margin:0 auto;padding:2rem 1.2rem 6rem}
h1{font-family:var(--kai);text-align:center;letter-spacing:.06em}
h2{font-family:var(--kai);color:var(--zhu);border-bottom:1px solid var(--line);padding-bottom:.3rem;margin-top:3rem}
.lens{position:sticky;top:0;z-index:9;background:color-mix(in srgb,var(--bg) 92%,transparent);backdrop-filter:blur(6px);padding:.6rem 0;display:flex;flex-wrap:wrap;gap:.4rem;border-bottom:1px solid var(--line)}
.chip{font-family:var(--kai);font-size:.95rem;padding:.15rem .7rem;border-radius:99px;border:1px solid var(--line);background:var(--panel);color:var(--ink);cursor:pointer}
.chip.on{background:var(--zhu);color:#f6efe0;border-color:var(--zhu)}
.recap{font-size:.9rem;color:var(--dim);border-left:3px solid var(--gold);padding:.2rem .8rem;margin:.8rem 0}
.scene,.diary{background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:1rem 1.2rem;margin:1rem 0}
.scene header,.diary header{display:flex;flex-wrap:wrap;gap:.6rem;align-items:baseline;font-family:var(--kai);margin-bottom:.4rem}
.scene .who{font-size:1.05rem;color:var(--zhu)}
.scene .where{color:var(--dim);font-size:.88rem}
.badge{font-size:.75rem;padding:0 .5rem;border-radius:3px;border:1px solid var(--line)}
.badge.shura{color:#f6efe0;background:var(--zhu);border-color:var(--zhu)}
.badge.bed{color:var(--zhu)}
.badge.priv{color:var(--dim)}
.prose p{margin:.5rem 0;text-indent:2em}
details{margin-top:.5rem;color:var(--dim)}
details summary{cursor:pointer;font-size:.88rem;font-family:var(--kai)}
.beat{margin:.4rem 0;font-size:.95rem}
.beat .inner{display:block;color:var(--dim);font-size:.88rem;padding-left:1em}
.resolved{margin-top:.6rem;font-family:var(--kai);color:var(--gold);font-size:.92rem}
.diary{background:var(--panel2);border-left:3px solid var(--gold)}
.diary p{margin:.2rem 0;font-size:.95rem}
.hidden{display:none}
.note{color:var(--dim);font-size:.85rem;text-align:center;margin-top:.6rem}
</style>
<div class="wrap">
<h1>春雪社 · 重啟戲箱</h1>
<p class="note">十四日連續長季 · 追角讀本 — 正史為脊椎，深宵帳為鏡頭；點一個名字，只看TA的戲與帳。</p>
<div class="lens"><button class="chip on" data-who="" onclick="lens('')">全本</button>${chips}</div>
${daySections}
</div>
<script>
function lens(who){
  document.querySelectorAll('.chip').forEach(c=>c.classList.toggle('on',c.dataset.who===who));
  document.querySelectorAll('.scene,.diary').forEach(el=>{
    const cast=(el.dataset.cast||'').split('|');
    el.classList.toggle('hidden', !!who && !cast.includes(who));
  });
}
</script>`;
}

// ── main ──────────────────────────────────────────────────────────────────────
const [outPath, ...reportPaths] = process.argv.slice(2);
if (!outPath || !reportPaths.length) {
    console.error('usage: tsx follow-html.ts <out.html> <report.md> [<report.md> ...]');
    process.exit(1);
}
const allRounds: Round[] = [];
const allPov = new Map<string, Map<number, string>>();
let offset = 0;
for (const p of reportPaths) {
    const { rounds, pov } = parseReport(fs.readFileSync(p, 'utf-8'), offset);
    allRounds.push(...rounds);
    for (const [name, days] of pov) {
        const t = allPov.get(name) ?? new Map<number, string>();
        for (const [d, txt] of days) t.set(d, txt);
        allPov.set(name, t);
    }
    offset = Math.max(offset, ...rounds.map((r) => r.day));
}
const castNames = [...new Set(allRounds.flatMap((r) => r.scenes.flatMap((s) => s.participants)).concat([...allPov.keys()]))];
fs.writeFileSync(outPath, render(allRounds, allPov, castNames));
console.log(`follow reader: ${outPath} (${allRounds.length} rounds, ${castNames.length} 人, days 1-${offset})`);
