/**
 * AGENT-SEASON · FOLLOW-HTML — the 追角 reading surface over season report.md.
 * ============================================================================
 * The raw report is an engineering transcript (placements, tools, wages inline);
 * the STORY is buried in three registers that are all already there:
 *   · 正史 — each scene's woven 章回 (or its beats when no weave),
 *   · 鏡頭 — each character's first-person POV 帳 (the appendix, day-keyed),
 *   · 骨架 — 了結 (resolutions), 床/修羅場 marks, the finale.
 * This tool re-renders those as one continuous reader in the 追角 v2 idiom:
 * 時刻卡 (venue-art scene cards, 正史 spine), each day closed by that day's POV
 * diaries, per-day 前情 recap, and a 只看TA lens filtering scenes+diaries.
 *
 * Usage:
 *   tsx follow-html.ts <out.html> <w1-report.md> [<w2-report.md> ...] [--art <dir>]
 * Later report files continue the day numbering (a chained season reads as one
 * run). --art points at a dir of `<venue>.jpg` images (pre-downscaled); each is
 * embedded ONCE as a data URI and reused by every scene at that venue.
 * Pure read-only over report.md; no LLM, no network.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

interface Scene {
    venue: string;
    isPrivate: boolean;
    bed: boolean;
    discovery: boolean;
    participants: string[];
    chapter: string[];
    beats: Array<{ name: string; text: string; inner?: string }>;
    resolved: string[];
    /** 追角 lens: viewer name → the scene retold through their eyes. */
    pov: Record<string, string[]>;
    part: string;
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
        let povViewer: string | null = null;
        for (const l of lines) {
            const sc = l.match(/^ {2}- \*\*場景 @ ([^*]+?)\*\*((?:（私）|〔床〕|〔修羅場〕)*)：(.+)$/);
            if (sc) {
                povViewer = null;
                cur = {
                    venue: sc[1].trim(),
                    isPrivate: sc[2].includes('（私）'),
                    bed: sc[2].includes('〔床〕'),
                    discovery: sc[2].includes('〔修羅場〕'),
                    participants: sc[3].split('×').map((s) => s.trim()),
                    chapter: [],
                    beats: [],
                    resolved: [],
                    pov: {},
                    part: round.part,
                };
                round.scenes.push(cur);
                mode = 'none';
                continue;
            }
            if (/^ {2}- \*\*章回（織回）\*\*：/.test(l)) {
                cur = null;
                povViewer = null;
                mode = 'roundChapter';
                continue;
            }
            if (/^ {4}- \*\*章回（此場織回）\*\*：/.test(l)) {
                povViewer = null;
                mode = 'sceneChapter';
                continue;
            }
            if (/^ {4}- 分鏡（/.test(l)) {
                mode = 'none';
                continue;
            }
            const povHead = l.match(/^ {4}- \*\*(.+?)眼中（追角）\*\*：/);
            if (povHead && cur) {
                mode = 'none';
                povViewer = povHead[1];
                cur.pov[povViewer] = [];
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
                    const text = beat[2].replace(new RegExp(`^${beat[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[:：]\\s*`), '');
                    cur.beats.push({ name: beat[1], text });
                } else if (/^〔心〕/.test(t) && cur?.beats.length) {
                    cur.beats[cur.beats.length - 1].inner = t.replace(/^〔心〕/, '');
                } else if (povViewer && cur && cur.pov[povViewer]) {
                    cur.pov[povViewer].push(t);
                } else if (mode === 'sceneChapter' && cur) {
                    cur.chapter.push(t);
                } else if (mode === 'roundChapter') {
                    round.chapter.push(t);
                }
            }
        }
        rounds.push(round);
    }
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
const PART_MARK: Record<string, string> = { 清晨: '晨', 日午: '午', 晡時: '晡', 黃昏: '昏', 入夜: '夜', 深宵: '宵' };

function render(rounds: Round[], pov: Map<string, Map<number, string>>, castNames: string[], art: Map<string, string>): string {
    const days = [...new Set(rounds.map((r) => r.day))].sort((a, b) => a - b);
    // Each venue's art becomes ONE css class, reused by every card at that venue.
    const venueClass = new Map<string, string>();
    let artCss = '';
    let i = 0;
    for (const [venue, dataUri] of art) {
        const cls = `art${i++}`;
        venueClass.set(venue, cls);
        artCss += `.${cls}{background-image:linear-gradient(to top,rgba(20,12,6,.78) 0%,rgba(20,12,6,.28) 55%,rgba(20,12,6,.18) 100%),url(${dataUri});}\n`;
    }
    const chips = castNames
        .map((n) => `<button class="chip" data-who="${esc(n)}" onclick="lens('${esc(n)}')">${esc(n)}</button>`)
        .join('');
    const dayNav = days.map((d) => `<a class="dnav" href="#day${d}">${d}</a>`).join('');

    const daySections = days
        .map((d) => {
            const rs = rounds.filter((r) => r.day === d);
            const prevRes = rounds
                .filter((r) => r.day === d - 1)
                .flatMap((r) => r.scenes)
                .flatMap((s) => s.resolved)
                .map((x) => x.split('｜')[0]);
            const recap = prevRes.length
                ? `<div class="recap"><span class="recap-k">前情</span>${prevRes.map((x) => esc(x)).join('；')}。</div>`
                : '';
            const body = rs
                .map((r) => {
                    const parts: string[] = [];
                    for (const s of r.scenes) {
                        const cls = venueClass.get(s.venue);
                        const badge = `${s.discovery ? '<span class="badge shura">修羅場</span>' : ''}${s.bed ? '<span class="badge bed">床</span>' : ''}${s.isPrivate && !s.bed && !s.discovery ? '<span class="badge priv">私</span>' : ''}`;
                        const banner = `<header class="banner ${cls ?? 'noart'}">` +
                            `<div class="banner-top"><span class="tmark">${PART_MARK[r.part] ?? ''}</span><span class="where">${esc(s.venue)}</span>${badge}</div>` +
                            `<div class="who">${esc(s.participants.join('　×　'))}</div>` +
                            `</header>`;
                        const prose = s.chapter.length
                            ? `<div class="prose objective">${s.chapter.map((p) => `<p>${esc(p)}</p>`).join('')}</div>`
                            : '';
                        // 追角 lens versions: hidden until that viewer's lens is on.
                        const povDivs = Object.entries(s.pov)
                            .map(
                                ([viewer, paras]) =>
                                    `<div class="prose povtext hidden" data-viewer="${esc(viewer)}"><div class="povtag">${esc(viewer)}眼中的這一場</div>${paras.map((p) => `<p>${esc(p)}</p>`).join('')}</div>`,
                            )
                            .join('');
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
                        parts.push(`<article class="scene" data-cast="${esc(s.participants.join('|'))}">${banner}<div class="card-body">${povDivs}${prose}${beats}${res}</div></article>`);
                    }
                    if (r.chapter.length && !r.scenes.some((s) => s.chapter.length)) {
                        parts.push(
                            `<article class="scene weave" data-cast=""><header class="banner noart"><div class="banner-top"><span class="tmark">${PART_MARK[r.part] ?? ''}</span><span class="where">織回</span></div></header><div class="card-body"><div class="prose">${r.chapter.map((p) => `<p>${esc(p)}</p>`).join('')}</div></div></article>`,
                        );
                    }
                    return parts.join('');
                })
                .join('');
            const diaries = castNames
                .map((n) => {
                    const t = pov.get(n)?.get(d);
                    return t
                        ? `<article class="diary" data-cast="${esc(n)}"><header><span class="seal-dot"></span>${esc(n)} 的深宵帳</header><p>${esc(t)}</p></article>`
                        : '';
                })
                .join('');
            return `<section class="day" id="day${d}"><div class="day-head"><span class="day-num">第${d}日</span><span class="day-rule"></span></div>${recap}${body}${diaries || ''}</section>`;
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
body{margin:0;background:radial-gradient(120% 70% at 50% -10%,color-mix(in srgb,var(--gold) 9%,transparent),transparent 60%),var(--bg);color:var(--ink);font-family:var(--serif);line-height:1.95;-webkit-font-smoothing:antialiased}
.wrap{max-width:44em;margin:0 auto;padding:2.4rem 1.2rem 6rem}
.hero{text-align:center;margin-bottom:1.6rem}
.hero .seal{width:3.2rem;height:3.2rem;margin:0 auto 1rem;display:grid;place-items:center;background:var(--zhu);color:#f6efe0;font-family:var(--kai);font-size:1.7rem;border-radius:5px;transform:rotate(-2deg);box-shadow:0 2px 0 rgba(0,0,0,.15)}
h1{font-family:var(--kai);letter-spacing:.08em;margin:.2rem 0}
.sub{color:var(--dim);font-size:.92rem;max-width:30em;margin:0 auto}
.lens{position:sticky;top:0;z-index:9;background:color-mix(in srgb,var(--bg) 90%,transparent);backdrop-filter:blur(8px);padding:.55rem 0 .45rem;border-bottom:1px solid var(--line)}
.lens-row{display:flex;flex-wrap:wrap;gap:.4rem;align-items:center}
.chip{font-family:var(--kai);font-size:.95rem;padding:.12rem .7rem;border-radius:99px;border:1px solid var(--line);background:var(--panel);color:var(--ink);cursor:pointer;transition:all .15s}
.chip.on{background:var(--zhu);color:#f6efe0;border-color:var(--zhu)}
.dnav-row{display:flex;gap:.15rem;margin-top:.35rem;overflow-x:auto}
.dnav{font-size:.78rem;color:var(--dim);text-decoration:none;border:1px solid var(--line);border-radius:4px;min-width:1.7em;text-align:center;line-height:1.6}
.dnav:hover{color:var(--zhu);border-color:var(--zhu)}
.day-head{display:flex;align-items:center;gap:1rem;margin:3.2rem 0 .6rem}
.day-num{font-family:var(--kai);font-size:1.5rem;color:var(--zhu);white-space:nowrap}
.day-rule{flex:1;height:1px;background:linear-gradient(to right,var(--line),transparent)}
.recap{font-size:.88rem;color:var(--dim);border-left:3px solid var(--gold);padding:.15rem .8rem;margin:.7rem 0 1rem}
.recap-k{font-family:var(--kai);color:var(--gold);margin-right:.6em}
.scene,.diary{border:1px solid var(--line);border-radius:8px;margin:1.1rem 0;overflow:hidden;background:var(--panel)}
.banner{background-size:cover;background-position:center 35%;min-height:7.2rem;display:flex;flex-direction:column;justify-content:flex-end;padding:.7rem 1.1rem .55rem;color:#f4ead4;text-shadow:0 1px 3px rgba(0,0,0,.55)}
.banner.noart{background:linear-gradient(135deg,color-mix(in srgb,var(--zhu) 24%,var(--panel2)),var(--panel2));min-height:3.4rem;color:var(--ink);text-shadow:none}
.banner-top{display:flex;align-items:center;gap:.55rem;font-size:.85rem}
.tmark{font-family:var(--kai);border:1px solid currentColor;border-radius:50%;width:1.5em;height:1.5em;display:grid;place-items:center;opacity:.9}
.where{font-family:var(--kai);letter-spacing:.05em}
.who{font-family:var(--kai);font-size:1.25rem;letter-spacing:.04em;margin-top:.15rem}
.badge{font-size:.72rem;padding:0 .5rem;border-radius:3px;border:1px solid currentColor;font-family:var(--kai)}
.badge.shura{background:var(--zhu);border-color:var(--zhu);color:#f6efe0}
.card-body{padding:.8rem 1.2rem 1rem}
.prose p{margin:.55rem 0;text-indent:2em}
details{margin-top:.5rem;color:var(--dim)}
details summary{cursor:pointer;font-size:.86rem;font-family:var(--kai)}
.beat{margin:.45rem 0;font-size:.95rem}
.beat b{font-family:var(--kai);color:var(--zhu);font-weight:600}
.beat .inner{display:block;color:var(--dim);font-size:.86rem;padding-left:1.2em}
.resolved{margin-top:.7rem;font-family:var(--kai);color:var(--gold);font-size:.9rem;border-top:1px dashed var(--line);padding-top:.5rem}
.diary{background:var(--panel2);border-left:3px solid var(--gold);padding:1rem 1.2rem}
.diary header{font-family:var(--kai);display:flex;align-items:center;gap:.5rem;color:var(--gold);margin-bottom:.3rem}
.seal-dot{width:.6rem;height:.6rem;border-radius:2px;background:var(--zhu);transform:rotate(-4deg);display:inline-block}
.diary p{margin:.2rem 0;font-size:.95rem;font-family:var(--kai);line-height:2.05}
.povtext{border-left:3px solid var(--zhu);padding-left:.9rem;font-family:var(--kai)}
.povtag{font-family:var(--kai);color:var(--zhu);font-size:.85rem;margin-bottom:.2rem}
.hidden{display:none}
${artCss}
</style>
<div class="wrap">
<div class="hero"><div class="seal">雪</div><h1>春雪社 · 重啟戲箱</h1>
<p class="sub">十四日連續長季 · 追角讀本——正史為脊椎，深宵帳為鏡頭。點一個名字，只看TA的戲與帳；同一場戲，各人心裡各有一齣。</p></div>
<div class="lens"><div class="lens-row"><button class="chip on" data-who="" onclick="lens('')">全本</button>${chips}</div><div class="dnav-row">${dayNav}</div></div>
${daySections}
</div>
<script>
function lens(who){
  document.querySelectorAll('.chip').forEach(c=>c.classList.toggle('on',c.dataset.who===who));
  document.querySelectorAll('.scene,.diary').forEach(el=>{
    const cast=(el.dataset.cast||'').split('|');
    el.classList.toggle('hidden', !!who && !cast.includes(who));
  });
  // 追角: inside a visible scene, show the viewer's OWN version when it exists;
  // fall back to the objective prose otherwise.
  document.querySelectorAll('.scene').forEach(sc=>{
    const mine = who ? sc.querySelector('.povtext[data-viewer="'+who+'"]') : null;
    sc.querySelectorAll('.povtext').forEach(pv=>pv.classList.toggle('hidden', pv!==mine));
    const obj = sc.querySelector('.objective');
    if (obj) obj.classList.toggle('hidden', !!mine);
  });
}
</script>`;
}

// ── main ──────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const artIdx = argv.indexOf('--art');
const artDir = artIdx >= 0 ? argv.splice(artIdx, 2)[1] : null;
const [outPath, ...reportPaths] = argv;
if (!outPath || !reportPaths.length) {
    console.error('usage: tsx follow-html.ts <out.html> <report.md> [<report.md> ...] [--art <dir>]');
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
// venue art: only embed venues that actually host a scene (each image once).
const art = new Map<string, string>();
if (artDir) {
    const venuesUsed = new Set(allRounds.flatMap((r) => r.scenes.map((s) => s.venue)));
    for (const v of venuesUsed) {
        const f = path.join(artDir, `${v}.jpg`);
        if (fs.existsSync(f)) art.set(v, `data:image/jpeg;base64,${fs.readFileSync(f).toString('base64')}`);
    }
}
fs.writeFileSync(outPath, render(allRounds, allPov, castNames, art));
console.log(`follow reader: ${outPath} (${allRounds.length} rounds, ${castNames.length} 人, days 1-${offset}, art ${art.size} venues)`);
