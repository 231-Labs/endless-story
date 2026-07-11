/**
 * AGENT-SEASON · HTML READER (戲折 version) — built DIRECTLY from the SeasonResult
 * so every run can emit a readable report.html next to report.md (no markdown
 * re-parsing). 序章 → 卷/日 (woven public chapters + collapsible 私/床 + 修羅場 +
 * 了斷) → 大會串首演 → 可審票房台帳 → Showrunner 判準. Light=paper, dark=lacquer.
 */

import type { SeasonResult, SceneRecord } from './round.ts';
import type { Char } from './world.ts';

export interface HtmlOpts {
    title: string;
    subtitle: string;
    centralQuestion: string;
    deadlineLine: string;
    prologue: string[];
    cast: Char[];
}

const esc = (s: string): string =>
    String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const JUAN = ['卷一', '卷二', '卷三', '卷四', '卷五', '卷六', '卷七', '卷八'];

function paragraphs(chapter: string): string[] {
    return chapter
        .split(/\n+/)
        .map((s) => s.trim())
        .filter(Boolean);
}

/** `showInner` surfaces each beat's 內心一句 as a subtle 〔心〕 line under the spoken/
 *  acted line — the emotional transition a reader otherwise never sees (private/床/
 *  修羅場 scenes). Public woven prose keeps interiority folded away. */
function beatsHtml(scene: SceneRecord, showInner = false): string {
    return scene.beats
        .map((b) => {
            const spoken = `<p><b>${esc(b.name)}</b>${esc(b.text)}</p>`;
            const inner = showInner && b.inner ? `<p class="inner">〔心〕${esc(b.inner)}</p>` : '';
            return spoken + inner;
        })
        .join('');
}

/**
 * A private/床/修羅場 scene. If it carries a woven `.chapter`, that prose is the PRIMARY
 * readable text (styled like the public 章回 — indented paragraphs), with the raw beats
 * (incl. 〔心〕 interiority) tucked into a collapsible 分鏡 underneath. No `.chapter` →
 * fall back to the raw-beats display. Keeps the 私/床 tag + 修羅場 styling. GENERAL —
 * participants + venue come from the record, no name-casing.
 */
function privateSceneHtml(scene: SceneRecord): string {
    const shura = !!scene.discovery;
    const bed = scene.consummate;
    const tag = shura ? '修羅場' : bed ? '私 · 床' : '私';
    const tagCls = shura ? 'ptag zhu' : bed ? 'ptag bed' : 'ptag';
    const wrapCls = shura ? 'privscene shura' : bed ? 'privscene bed' : 'privscene';
    const joiner = shura ? '、' : '×';
    const head = `<div class="priv-head"><span class="${tagCls}">${tag}</span>${esc(scene.venue)}　${esc(scene.participants.join(joiner))}</div>`;
    if (scene.chapter) {
        const prose = paragraphs(scene.chapter).map((p) => `<p class="prose">${esc(p)}</p>`).join('');
        const board = `<details class="storyboard"><summary>分鏡 · ${scene.beats.length} 拍</summary><div class="beats">${beatsHtml(scene, true)}</div></details>`;
        return `<div class="${wrapCls}">${head}${prose}${board}</div>`;
    }
    // No woven chapter → the original raw-beats display (fallback).
    return `<div class="${wrapCls}">${head}<div class="beats">${beatsHtml(scene, true)}</div></div>`;
}

/**
 * The 時辰's DECISIONS, in the order the characters made them (PASS A) — each person's
 * move (from → to) plus their own reason for it (the plan), and who they set out to
 * engage. Rendered as a collapsible block ABOVE the woven prose so a reader sees the
 * 先後: who decided what and why, THEN what actually played out. GENERAL — every field
 * comes from the placement record, nothing name-cased.
 */
function decisionsHtml(placements: SeasonResult['rounds'][number]['placements']): string {
    if (!placements?.length) return '';
    const rows = placements
        .filter((p) => p.plan)
        .map((p) => {
            const move = p.from === p.to ? esc(p.to) : `${esc(p.from)} → ${esc(p.to)}`;
            const intent = p.interactIntent
                ? `<span class="dec-intent">要找 ${esc(p.interactIntent.target)}：${esc(p.interactIntent.intent)}</span>`
                : '';
            return `<li><div class="dec-head"><span class="dec-who">${esc(p.char)}</span><span class="dec-move">${move}</span></div><div class="dec-why">${esc(p.plan)}</div>${intent}</li>`;
        })
        .join('');
    if (!rows) return '';
    return `<details class="decisions"><summary>本時辰 · 各人的決定與去向</summary><ol class="dec-list">${rows}</ol></details>`;
}

function renderBody(r: SeasonResult, o: HtmlOpts): string {
    const P: string[] = [];
    P.push('<article class="scroll">');

    // cover
    P.push('<header class="cover">');
    P.push('<div class="seal">春</div>');
    P.push(`<h1 class="title">${esc(o.title)}</h1>`);
    P.push(`<p class="subtitle">${esc(o.subtitle)}</p>`);
    P.push(`<div class="thesis"><span class="lbl">立局人命題</span>${esc(o.centralQuestion)}</div>`);
    P.push(`<div class="deadline"><span class="dot"></span>${esc(o.deadlineLine)}</div>`);
    P.push('<div class="cast"><span class="lbl">角色</span><ul>');
    for (const c of o.cast) P.push(`<li><b>${esc(c.name)}</b><span>${esc(c.role)}</span></li>`);
    P.push('</ul></div>');
    P.push('</header>');

    // prologue
    if (o.prologue.length) {
        P.push('<section class="prologue"><div class="chap-mark">序</div><h2>序章</h2>');
        for (const para of o.prologue) P.push(`<p>${esc(para)}</p>`);
        P.push('</section>');
    }

    // days
    const byDay = new Map<number, typeof r.rounds>();
    const dayOrder: number[] = [];
    for (const rd of r.rounds) {
        if (!byDay.has(rd.day)) {
            byDay.set(rd.day, []);
            dayOrder.push(rd.day);
        }
        byDay.get(rd.day)!.push(rd);
    }
    dayOrder.forEach((day, di) => {
        P.push(`<section class="day"><div class="day-head"><span class="juan">${JUAN[di] ?? `第${day}日`}</span><h2>第${day}日</h2></div>`);
        for (const rd of byDay.get(day)!) {
            const privates = rd.scenes.filter((s) => s.isPrivate && !s.discovery);
            const discoveries = rd.scenes.filter((s) => s.discovery);
            const resolves = rd.scenes.flatMap((s) => s.resolved);
            const has = rd.chapter || privates.length || discoveries.length || resolves.length;
            if (!has && !rd.fastForward) continue;
            P.push('<div class="hour">');
            P.push(`<div class="hour-label">第${rd.day}日·${esc(rd.part)}${rd.night ? '（入夜）' : ''}</div>`);
            if (!rd.fastForward) P.push(decisionsHtml(rd.placements));
            if (rd.fastForward && rd.passLine) P.push(`<p class="ff">${esc(rd.passLine)}</p>`);
            if (rd.chapter) for (const para of paragraphs(rd.chapter)) P.push(`<p class="prose">${esc(para)}</p>`);
            // Private/床 scenes: woven 章回 primary, raw beats collapsible under (分鏡).
            for (const pv of privates) P.push(privateSceneHtml(pv));
            // 修羅場 scenes: same treatment, 修羅場 styling preserved.
            for (const dv of discoveries) P.push(privateSceneHtml(dv));
            for (const rv of resolves) {
                const head = rv.split('｜')[0].replace(/；/g, ' · ');
                P.push(`<p class="resolve"><span class="rtag">了斷</span>${esc(head)}</p>`);
            }
            P.push('</div>');
        }
        P.push('</section>');
    });

    // 各人視角 — the narrative-SUBJECTIVE layer: each character's per-day first-person
    // stream, kept beside (not replacing) the objective 時辰 章回 above. A reader can
    // follow one character's own (possibly biased) account of the same days.
    const povIds = o.cast.filter((c) => (r.povReflections?.[c.id]?.length ?? 0) > 0);
    if (povIds.length) {
        P.push('<section class="pov"><div class="chap-mark">誌</div><h2>各人視角</h2>');
        P.push('<p class="note">同一段日子，各人心裡是另一本帳。以下是各角色逐日的第一人稱自述（主觀、或有偏頗），與上面客觀的時辰章回並存——讀者可只跟著一個人走。</p>');
        for (const c of povIds) {
            const rows = r.povReflections[c.id];
            P.push(
                `<details class="povblock"><summary><span class="povname">${esc(c.name)} 的帳</span><span class="povrole">${esc(c.role)}</span></summary><div class="povstream">`,
            );
            for (const row of rows) P.push(`<p class="povday"><span class="povd">第${row.day}日</span>${esc(row.text)}</p>`);
            P.push('</div></details>');
        }
        P.push('</section>');
    }

    // finale — production + premiere
    P.push('<section class="finale"><div class="chap-mark">終</div><h2>大會串 · 首演</h2>');
    const play = r.play;
    P.push(`<p class="prod">戲碼《${esc(play.title || '未定')}》 · 狀態 ${esc(play.state)} · 選角 ${esc(play.cast.join('、'))}</p>`);
    if (play.scriptFragments.length) P.push(`<p class="prod">劇本片段：${esc(play.scriptFragments[0])}</p>`);
    if (r.premiere) {
        P.push('<div class="premiere"><div class="ptag gold">獻演</div>');
        P.push(beatsHtml(r.premiere));
        P.push('</div>');
    }
    P.push('</section>');

    // box office
    if (r.boxOffice) {
        const bo = r.boxOffice;
        P.push('<section class="box"><h2>票房 · 可審加總</h2>');
        P.push('<p class="note">數字永不由 LLM 決定。willingness = 0.4·warmth + 0.3·repute + 0.3·quality；購票(willingness&gt;0)、回訪(&gt;0.6)。好票房是本季努力賺來的。</p>');
        P.push(`<p class="prod">票房總計 <b>${bo.total}</b>（購票 ${bo.ticketBuyers} 人、回訪 ${bo.repeats} 次） · 戲之品相 ${bo.quality.toFixed(2)} · 班之名望 ${bo.repute.toFixed(2)}</p>`);
        P.push('<div class="tblwrap"><table><thead><tr><th>觀眾</th><th>類</th><th>warmth</th><th>repute</th><th>quality</th><th>willingness</th><th>購票</th><th>回訪</th></tr></thead><tbody>');
        for (const row of bo.rows) {
            P.push(
                `<tr><td class="aud">${esc(row.name)}</td><td class="kind">${esc(row.kind)}</td><td>${row.warmth.toFixed(2)}</td><td>${row.repute.toFixed(2)}</td><td>${row.quality.toFixed(2)}</td><td class="will">${row.willingness.toFixed(2)}</td><td class="tick">${row.bought ? '✓' : ''}</td><td class="tick">${row.repeat ? '✓' : ''}</td></tr>`,
            );
        }
        P.push('</tbody></table></div>');
        P.push(`<p class="prod">驅動品相（ability × effort）：${esc(bo.drivers.map((d) => `${d.name}(${d.ability}×${d.effort}=${d.contribution.toFixed(2)})`).join('　'))}</p>`);
        P.push('</section>');
    }

    // 修羅場 summary (if any legitimate discoveries fired)
    if (r.discoveries.length) {
        P.push('<section class="box"><h2>排他 · 撞破修羅場</h2>');
        P.push('<p class="note">撞破只在有情之人「真的走進那個房間」時才發生（感知靠在場、非全知）。撞破成戲、關係邊隨夜裡自我覆寫改寫。</p>');
        for (const d of r.discoveries)
            P.push(`<p class="prod">第${Math.floor(d.tick / 6) + 1}日·${esc(d.part)}：${esc(d.discoverer)} ${d.brokeIn ? '破門闖進撞破' : '撞破'} ${esc(d.pair[0])}×${esc(d.pair[1])} @ ${esc(d.venue)}</p>`);
        P.push('</section>');
    }

    // verdict
    P.push('<section class="verdict"><h2>Showrunner · 收尾判準</h2>');
    P.push(`<div class="badge ${r.showrunnerVerdict.passed ? 'pass' : 'fail'}">${r.showrunnerVerdict.passed ? 'PASS ✓' : 'FAIL ✕'}</div>`);
    P.push('<p class="razor-line">razor：劇本&gt;0 ∧ 選角≥2 ∧ 排練投入≥門檻 ∧ 已在大會串演出。</p>');
    for (const reason of r.showrunnerVerdict.reasons) P.push(`<p class="razor-item">${esc(reason)}</p>`);
    P.push('</section>');

    P.push('<footer class="colophon">春雪社重啟戲箱 · 由兩個自治 agent（立局人 · 舞台監督 · 角色 · 說書人 · 畫師）在本地跑出。角色的意義由自己書寫，數字由引擎裁定。</footer>');
    P.push('</article>');
    return P.join('\n');
}

export function renderSeasonHtml(result: SeasonResult, opts: HtmlOpts): string {
    return `<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(opts.title)}</title>
<style>${CSS}</style></head><body>
${renderBody(result, opts)}
</body></html>`;
}

const CSS = `
:root{--bg:#ece2cf;--panel:#f6efe0;--panel2:#f1e8d5;--ink:#2b2119;--dim:#7a6b56;--zhu:#a5322a;--zhu-soft:#b9564a;--gold:#8f6f2c;--gold-bright:#a9852f;--line:rgba(60,40,20,.16);--line-soft:rgba(60,40,20,.09);--serif:"Songti SC","STSong","Songti TC","Noto Serif CJK TC","宋体",serif;--kai:"Kaiti SC","STKaiti","KaiTi","楷体","Noto Serif CJK TC",serif;--sans:"PingFang SC","Hiragino Sans GB","Microsoft YaHei",system-ui,sans-serif;}
@media (prefers-color-scheme:dark){:root{--bg:#15110d;--panel:#1e1811;--panel2:#231b13;--ink:#ece0c6;--dim:#a08d70;--zhu:#d1614d;--zhu-soft:#c9705e;--gold:#c9a24c;--gold-bright:#d8b25c;--line:rgba(220,190,140,.16);--line-soft:rgba(220,190,140,.08);}}
:root[data-theme="light"]{--bg:#ece2cf;--panel:#f6efe0;--panel2:#f1e8d5;--ink:#2b2119;--dim:#7a6b56;--zhu:#a5322a;--gold:#8f6f2c;--gold-bright:#a9852f;--line:rgba(60,40,20,.16);--line-soft:rgba(60,40,20,.09);}
:root[data-theme="dark"]{--bg:#15110d;--panel:#1e1811;--panel2:#231b13;--ink:#ece0c6;--dim:#a08d70;--zhu:#d1614d;--gold:#c9a24c;--gold-bright:#d8b25c;--line:rgba(220,190,140,.16);--line-soft:rgba(220,190,140,.08);}
*{box-sizing:border-box}
body{margin:0;background:radial-gradient(120% 80% at 50% -10%,color-mix(in srgb,var(--gold) 8%,transparent),transparent 60%),var(--bg);color:var(--ink);font-family:var(--serif);line-height:1.95;-webkit-font-smoothing:antialiased;}
.scroll{max-width:44em;margin:0 auto;padding:clamp(1.1rem,4vw,3rem) clamp(1rem,4vw,2rem) 5rem;}
h1,h2{font-family:var(--kai);font-weight:600;text-wrap:balance;letter-spacing:.02em;}
p{margin:0 0 .5rem}
.cover{text-align:center;padding:2rem 0 2.4rem;border-bottom:1px solid var(--line);}
.seal{width:3.4rem;height:3.4rem;margin:0 auto 1.2rem;display:grid;place-items:center;background:var(--zhu);color:#f6efe0;font-family:var(--kai);font-size:1.8rem;border-radius:5px;box-shadow:0 2px 0 rgba(0,0,0,.15);transform:rotate(-2deg)}
.title{font-size:clamp(2.1rem,7vw,3.2rem);margin:.2rem 0 .5rem;color:var(--ink)}
.subtitle{font-family:var(--sans);font-size:.82rem;letter-spacing:.14em;color:var(--dim);margin-bottom:1.6rem}
.thesis{background:var(--panel);border:1px solid var(--line);border-left:3px solid var(--zhu);border-radius:4px;padding:.9rem 1.1rem;text-align:left;font-size:1.02rem;margin:0 auto 1rem;max-width:34em}
.thesis .lbl,.cast .lbl{display:block;font-family:var(--sans);font-size:.66rem;letter-spacing:.2em;color:var(--zhu);margin-bottom:.35rem}
.deadline{font-family:var(--sans);font-size:.8rem;color:var(--dim);max-width:34em;margin:0 auto 1.4rem;display:flex;gap:.5rem;align-items:baseline;justify-content:center;line-height:1.6}
.deadline .dot{width:.5rem;height:.5rem;border-radius:50%;background:var(--zhu);flex:none;transform:translateY(1px)}
.cast{max-width:34em;margin:0 auto;text-align:left}
.cast ul{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(9.5em,1fr));gap:.4rem .9rem}
.cast li{display:flex;flex-direction:column;padding:.35rem 0;border-bottom:1px dotted var(--line-soft)}
.cast li b{font-family:var(--kai);font-size:1.05rem}
.cast li span{font-family:var(--sans);font-size:.72rem;color:var(--dim)}
.chap-mark{font-family:var(--kai);color:var(--zhu);font-size:1.5rem;text-align:center;margin-top:2.2rem}
.prologue,.finale{padding:1rem 0 1.4rem}
.prologue h2,.finale h2{text-align:center;font-size:1.7rem;margin:.1rem 0 1.2rem;color:var(--zhu)}
.prologue p{text-indent:2em;text-align:justify;margin-bottom:.7rem}
.day{margin-top:2.6rem}
.day-head{display:flex;align-items:center;gap:1rem;margin-bottom:1.3rem}
.day-head:before,.day-head:after{content:"";height:1px;background:var(--line);flex:1}
.juan{font-family:var(--kai);color:var(--gold);font-size:.95rem;letter-spacing:.35em;padding-left:.35em}
.day-head h2{font-size:1.35rem;margin:0;white-space:nowrap}
.hour{margin:0 0 1.5rem;padding-left:1rem;border-left:2px solid var(--line-soft)}
.hour-label{font-family:var(--sans);font-size:.7rem;letter-spacing:.16em;color:var(--gold);margin-bottom:.55rem}
.ff{color:var(--dim);font-style:italic;text-align:center;font-size:.92rem;margin:.2rem 0}
.prose{text-indent:2em;text-align:justify;margin-bottom:.6rem}
/* 時辰 decisions: who moved where and why (PASS A), collapsed above the woven prose. */
details.decisions{margin:0 0 .7rem;border:1px solid var(--line-soft);border-radius:5px;background:var(--panel);overflow:hidden}
details.decisions>summary{cursor:pointer;list-style:none;padding:.32rem .7rem;font-family:var(--sans);font-size:.66rem;letter-spacing:.14em;color:var(--dim);user-select:none}
details.decisions>summary::-webkit-details-marker{display:none}
details.decisions>summary:before{content:"◷ ";color:var(--gold)}
details.decisions[open]>summary{border-bottom:1px solid var(--line-soft)}
ol.dec-list{list-style:none;margin:0;padding:.4rem .8rem .5rem;counter-reset:dec}
ol.dec-list li{padding:.4rem 0;border-bottom:1px dotted var(--line-soft)}
ol.dec-list li:last-child{border-bottom:none}
.dec-head{display:flex;gap:.6rem;align-items:baseline;counter-increment:dec}
.dec-head:before{content:counter(dec);font-family:var(--sans);font-size:.62rem;color:var(--gold);flex:none;min-width:1.1em;text-align:right}
.dec-who{font-family:var(--kai);font-size:1rem;color:var(--ink)}
.dec-move{font-family:var(--sans);font-size:.72rem;color:var(--dim)}
.dec-why{font-family:var(--serif);font-size:.9rem;color:var(--ink);opacity:.86;margin:.1rem 0 0 1.7em;line-height:1.7}
.dec-intent{display:block;font-family:var(--sans);font-size:.7rem;color:var(--zhu-soft,var(--zhu));margin:.15rem 0 0 1.7em}
/* private/床/修羅場 scene: woven 章回 primary + collapsible 分鏡 (raw beats) under it. */
.privscene{margin:.9rem 0 1.2rem;padding-left:1rem;border-left:2px solid var(--line-soft)}
.privscene.bed{border-left-color:color-mix(in srgb,var(--zhu) 45%,var(--line))}
.privscene.shura{border-left-color:color-mix(in srgb,var(--zhu) 72%,var(--line))}
.priv-head{font-family:var(--kai);font-size:.98rem;color:var(--ink);margin-bottom:.5rem;display:flex;align-items:center;gap:.6rem}
details.storyboard{margin:.55rem 0 .2rem;border:1px solid var(--line-soft);border-radius:5px;background:var(--panel);overflow:hidden}
details.storyboard summary{cursor:pointer;list-style:none;padding:.4rem .75rem;font-family:var(--sans);font-size:.68rem;letter-spacing:.12em;color:var(--dim);user-select:none;display:flex;align-items:center;gap:.5rem}
details.storyboard summary::-webkit-details-marker{display:none}
details.storyboard summary:after{content:"展開 ▾";margin-left:auto;font-size:.62rem;letter-spacing:.1em}
details.storyboard[open] summary{border-bottom:1px solid var(--line-soft)}
details.storyboard[open] summary:after{content:"收合 ▴"}
.ptag{font-family:var(--sans);font-size:.62rem;letter-spacing:.12em;background:var(--dim);color:var(--bg);padding:.12rem .45rem;border-radius:3px;flex:none}
.ptag.bed{background:var(--zhu)}
.ptag.gold{background:var(--gold)}.ptag.zhu{background:var(--zhu)}
.beats{padding:.2rem .9rem 1rem}
.beats p,.premiere p{margin:.55rem 0;text-align:justify}
.beats b,.premiere b{font-family:var(--kai);color:var(--zhu-soft);margin-right:.5em}
.beats .inner{margin:-.25rem 0 .55rem 1.4em;font-size:.86rem;font-style:italic;color:var(--dim);opacity:.85;text-align:justify}
.beats .inner:before{content:"";display:inline-block}
.pov{margin-top:2.6rem}
.pov h2{text-align:center;font-size:1.6rem;color:var(--gold);margin:.1rem 0 1rem}
details.povblock{margin:.7rem 0;border:1px solid var(--line);border-left:3px solid var(--gold);border-radius:5px;background:var(--panel);overflow:hidden}
details.povblock summary{cursor:pointer;list-style:none;padding:.55rem .8rem;font-family:var(--kai);font-size:1.02rem;display:flex;align-items:center;gap:.7rem;user-select:none}
details.povblock summary::-webkit-details-marker{display:none}
details.povblock summary:after{content:"展開 ▾";margin-left:auto;font-family:var(--sans);font-size:.66rem;color:var(--dim);letter-spacing:.1em}
details.povblock[open] summary:after{content:"收合 ▴"}
.povname{color:var(--zhu-soft)}
.povrole{font-family:var(--sans);font-size:.7rem;color:var(--dim)}
.povstream{padding:.3rem .95rem 1rem}
.povday{margin:.5rem 0;text-align:justify;text-indent:0}
.povd{font-family:var(--sans);font-size:.66rem;letter-spacing:.12em;color:var(--gold);background:color-mix(in srgb,var(--gold) 12%,transparent);padding:.08rem .45rem;border-radius:3px;margin-right:.6em;white-space:nowrap}
.resolve{margin:.6rem 0;font-size:.98rem}
.rtag{font-family:var(--sans);font-size:.62rem;letter-spacing:.14em;color:#f6efe0;background:var(--gold);padding:.1rem .5rem;border-radius:3px;margin-right:.6em;vertical-align:.12em}
.finale h2{color:var(--zhu)}
.prod{font-family:var(--sans);font-size:.86rem;color:var(--dim);margin:.3rem 0;line-height:1.7}
.premiere{background:var(--panel2);border:1px solid var(--line);border-top:3px solid var(--gold);border-radius:5px;padding:.9rem 1.1rem;margin:1rem 0}
.premiere .ptag{display:inline-block;margin-bottom:.4rem}
.box{margin-top:2.6rem;padding-top:1.6rem;border-top:1px solid var(--line)}
.box h2,.verdict h2{font-size:1.5rem;color:var(--zhu);text-align:center;margin-bottom:.8rem}
.note{font-family:var(--sans);font-size:.76rem;color:var(--dim);text-align:center;max-width:32em;margin:0 auto 1.1rem;line-height:1.7}
.tblwrap{overflow-x:auto}
table{border-collapse:collapse;width:100%;font-family:var(--sans);font-size:.82rem;font-variant-numeric:tabular-nums}
th,td{padding:.45rem .5rem;border-bottom:1px solid var(--line-soft);text-align:right}
th{font-size:.66rem;letter-spacing:.08em;color:var(--dim);border-bottom:1px solid var(--line);font-weight:600}
td.aud,th:first-child{text-align:left;font-family:var(--serif);font-size:.92rem}
td.kind{text-align:left;font-size:.66rem;color:var(--dim)}
td.will{color:var(--zhu);font-weight:600}
td.tick{color:var(--gold-bright);text-align:center}
.verdict{margin-top:2.2rem;text-align:center}
.badge{display:inline-block;font-family:var(--kai);font-size:1.15rem;letter-spacing:.1em;padding:.35rem 1.2rem;border-radius:5px;margin:.3rem 0 .8rem}
.badge.pass{background:var(--gold);color:#1a1206;box-shadow:0 2px 0 rgba(0,0,0,.18)}
.badge.fail{background:var(--zhu);color:#f6efe0}
.razor-line{font-family:var(--sans);font-size:.78rem;color:var(--dim);margin-bottom:.8rem}
.razor-item{font-family:var(--sans);font-size:.82rem;color:var(--ink);margin:.2rem 0}
.colophon{margin-top:3rem;padding-top:1.4rem;border-top:1px solid var(--line);font-family:var(--sans);font-size:.72rem;color:var(--dim);text-align:center;line-height:1.8}
`;
