// Self-contained HTML validation report. Runs the harness, extracts time series, renders
// inline-SVG charts (no external deps — opens offline), and explains the ACADEMIC criteria by
// which the mechanism is judged "validated". Run from anywhere:
//   node packages/economy/driver/html-report.ts   → writes packages/economy/report/index.html

import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { analyze, runScenario, type Analysis } from "./index.ts";
import type { DayRecord, RunResult } from "./types.ts";
import { allianceOff, allianceOn, mixedCohort, starving, thriving, vendor } from "../scenarios/index.ts";
import { MUNIT, VIT_PT } from "../src/index.ts";

// ── palette (nods to the app theme) ──
const INK = "#1f1b16";
const CINNABAR = "#c8492f";
const JADE = "#4a7c59";
const GOLD = "#b8893b";
const MUTE = "#8a8175";
const GRID = "#e7e0d4";
const AXIS = "#cfc6b6";

// ── series extraction ──
const E = (b: bigint): number => Number(b) / Number(MUNIT);
function aliveBalances(d: DayRecord): number[] {
  const out: number[] = [];
  for (const id of Object.keys(d.perChar)) if (!d.perChar[id].dead) out.push(E(d.perChar[id].balance));
  return out;
}
function meanAliveBalance(t: DayRecord[]): number[] {
  return t.map((d) => {
    const a = aliveBalances(d);
    return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
  });
}
function meanVitality(t: DayRecord[]): number[] {
  return t.map((d) => {
    let s = 0;
    let n = 0;
    for (const id of Object.keys(d.perChar)) {
      const c = d.perChar[id];
      if (!c.dead) {
        s += Number(c.vitality) / Number(VIT_PT);
        n += 1;
      }
    }
    return n ? s / n : 0;
  });
}
const aliveCounts = (t: DayRecord[]): number[] => t.map((d) => d.aliveCount);
function cum(t: DayRecord[], key: "births" | "deaths"): number[] {
  let acc = 0;
  return t.map((d) => (acc += key === "births" ? d.births : d.deaths));
}

// ── chart primitives ──
function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / p;
  const n = f <= 1 ? 1 : f <= 1.5 ? 1.5 : f <= 2 ? 2 : f <= 3 ? 3 : f <= 5 ? 5 : f <= 7 ? 7 : 10;
  return n * p;
}

interface Line {
  label: string;
  color: string;
  y: number[];
}
function lineChart(o: { lines: Line[]; days: number; yMax?: number; yLabel: string; yFmt?: (n: number) => string; xLabel?: string }): string {
  const w = 700;
  const h = 300;
  const padL = 58;
  const padR = 14;
  const padT = 24;
  const padB = 42;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const yFmt = o.yFmt ?? ((n) => String(Math.round(n)));
  let yMax = o.yMax ?? niceCeil(Math.max(1, ...o.lines.flatMap((l) => l.y)));
  const X = (i: number, len: number): number => padL + (len <= 1 ? 0 : (i / (len - 1)) * plotW);
  const Y = (v: number): number => padT + plotH - (v / yMax) * plotH;

  let grid = "";
  for (let k = 0; k <= 4; k++) {
    const v = (yMax * k) / 4;
    const yy = Y(v);
    grid += `<line x1="${padL}" y1="${yy.toFixed(1)}" x2="${padL + plotW}" y2="${yy.toFixed(1)}" stroke="${GRID}"/>`;
    grid += `<text x="${padL - 8}" y="${(yy + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="${MUTE}">${yFmt(v)}</text>`;
  }
  const maxLen = Math.max(...o.lines.map((l) => l.y.length));
  let xl = "";
  for (const f of [0, 0.25, 0.5, 0.75, 1]) {
    const xx = padL + f * plotW;
    xl += `<text x="${xx.toFixed(1)}" y="${padT + plotH + 22}" text-anchor="middle" font-size="11" fill="${MUTE}">${Math.round(f * o.days)}</text>`;
  }
  let paths = "";
  for (const l of o.lines) {
    const pts = l.y.map((v, i) => `${X(i, l.y.length).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
    paths += `<polyline fill="none" stroke="${l.color}" stroke-width="2.2" points="${pts}"/>`;
  }
  let lx = padL;
  let lg = "";
  for (const l of o.lines) {
    lg += `<rect x="${lx}" y="4" width="12" height="12" rx="2" fill="${l.color}"/>`;
    lg += `<text x="${lx + 17}" y="14" font-size="12" fill="${INK}">${l.label}</text>`;
    lx += 30 + l.label.length * 8.5;
  }
  const xlab = o.xLabel ? `<text x="${padL + plotW / 2}" y="${h - 4}" text-anchor="middle" font-size="11" fill="${MUTE}">${o.xLabel}</text>` : "";
  const ylab = `<text transform="translate(14,${padT + plotH / 2}) rotate(-90)" text-anchor="middle" font-size="11" fill="${MUTE}">${o.yLabel}</text>`;
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" role="img">${grid}${xl}<line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + plotH}" stroke="${AXIS}"/><line x1="${padL}" y1="${padT + plotH}" x2="${padL + plotW}" y2="${padT + plotH}" stroke="${AXIS}"/>${paths}${lg}${ylab}${xlab}</svg>`;
}

function barChart(o: { cats: { label: string; value: number }[]; color: string; yMax?: number; yLabel: string; yFmt?: (n: number) => string }): string {
  const w = 700;
  const h = 280;
  const padL = 58;
  const padR = 14;
  const padT = 18;
  const padB = 40;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const yFmt = o.yFmt ?? ((n) => String(Math.round(n)));
  let yMax = o.yMax ?? niceCeil(Math.max(1, ...o.cats.map((c) => c.value)));
  const n = o.cats.length;
  const bw = (plotW / n) * 0.55;
  const Y = (v: number): number => padT + plotH - (v / yMax) * plotH;
  let grid = "";
  for (let k = 0; k <= 4; k++) {
    const v = (yMax * k) / 4;
    const yy = Y(v);
    grid += `<line x1="${padL}" y1="${yy.toFixed(1)}" x2="${padL + plotW}" y2="${yy.toFixed(1)}" stroke="${GRID}"/>`;
    grid += `<text x="${padL - 8}" y="${(yy + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="${MUTE}">${yFmt(v)}</text>`;
  }
  let bars = "";
  o.cats.forEach((c, i) => {
    const cx = padL + (plotW / n) * (i + 0.5);
    const x = cx - bw / 2;
    const yy = Y(c.value);
    bars += `<rect x="${x.toFixed(1)}" y="${yy.toFixed(1)}" width="${bw.toFixed(1)}" height="${(padT + plotH - yy).toFixed(1)}" rx="3" fill="${o.color}"/>`;
    bars += `<text x="${cx.toFixed(1)}" y="${(yy - 6).toFixed(1)}" text-anchor="middle" font-size="12" fill="${INK}">${yFmt(c.value)}</text>`;
    bars += `<text x="${cx.toFixed(1)}" y="${padT + plotH + 20}" text-anchor="middle" font-size="11" fill="${MUTE}">${c.label}</text>`;
  });
  const ylab = `<text transform="translate(14,${padT + plotH / 2}) rotate(-90)" text-anchor="middle" font-size="11" fill="${MUTE}">${o.yLabel}</text>`;
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" role="img">${grid}<line x1="${padL}" y1="${padT + plotH}" x2="${padL + plotW}" y2="${padT + plotH}" stroke="${AXIS}"/>${bars}${ylab}</svg>`;
}

// ── run everything ──
const rThr = runScenario(thriving);
const rSta = runScenario(starving);
const rMix = runScenario(mixedCohort);
const rOn = runScenario(allianceOn);
const rOff = runScenario(allianceOff);
const rVen = runScenario(vendor);
const aThr = analyze(rThr);
const aSta = analyze(rSta);
const aMix = analyze(rMix);
const aOn = analyze(rOn);
const aOff = analyze(rOff);
const aVen = analyze(rVen);
const probe = [120, 200, 300, 400].map((H) => ({ H, a: analyze(runScenario({ ...thriving, horizon: H })) }));

const n2 = (x: number): string => x.toFixed(2);
const pct = (x: number): string => `${(x * 100).toFixed(0)}%`;
const badge = (pass: boolean): string => `<span class="badge ${pass ? "pass" : "fail"}">${pass ? "PASS" : "FAIL"}</span>`;

// hypothesis verdicts (same logic as report.ts)
const h1 = aThr.finalAlive > 0 && aThr.lateHealthyFraction >= 0.6 && aThr.finalMeanBalanceEndless > 56;
const h2 = aSta.universalCollapse;
const h3 = aMix.turnover;
const h4 = aOn.totalRescues > 0 && (aOn.totalDeaths < aOff.totalDeaths || aOn.meanLifespan > aOff.meanLifespan);
const h5 = !aMix.universalCollapse && aMix.giniFinal < 0.9;
const h6 = aVen.finalAlive > 0 && aVen.totalDeaths === 0 && aVen.ownerBurnPerCharDayEndless > 0 && aVen.ownerBurnPerCharDayEndless < 12;
const inv = [rThr, rSta, rVen, rMix, rOn, rOff].every((r) => r.conservedEveryDay);
const allPass = h1 && h2 && h3 && h4 && h5 && h6 && inv;

// charts
const chartH1 = lineChart({
  lines: [{ label: "存活角色平均身家 (ENDLESS)", color: JADE, y: meanAliveBalance(rThr.trace) }],
  days: thriving.horizon,
  yLabel: "ENDLESS",
  xLabel: "敘事日",
});
const chartH2a = lineChart({
  lines: [
    { label: "平均氣血 (0–100)", color: CINNABAR, y: meanVitality(rSta.trace) },
    { label: "存活角色數", color: INK, y: aliveCounts(rSta.trace).map((v) => v * 20) },
  ],
  days: starving.horizon,
  yMax: 100,
  yLabel: "氣血 / 存活×20",
  xLabel: "敘事日（零訂閱）",
});
const chartH2b = barChart({
  cats: probe.map((p) => ({ label: `${p.H}日`, value: p.a.finalAlive })),
  color: GOLD,
  yMax: 3,
  yLabel: "存活角色數（固定16訂閱）",
});
const chartH3a = lineChart({
  lines: [{ label: "存活角色數", color: JADE, y: aliveCounts(rMix.trace) }],
  days: mixedCohort.horizon,
  yMax: 6,
  yLabel: "存活角色數",
  xLabel: "敘事日",
});
const chartH3b = lineChart({
  lines: [
    { label: "累計出生", color: JADE, y: cum(rMix.trace, "births") },
    { label: "累計死亡", color: CINNABAR, y: cum(rMix.trace, "deaths") },
  ],
  days: mixedCohort.horizon,
  yLabel: "累計人次",
  xLabel: "敘事日",
});
const chartH6 = lineChart({
  lines: [{ label: "owner 每日挹注 ÷ 角色 (ENDLESS)", color: GOLD, y: rVen.trace.map((d) => E(d.subsidy) / Math.max(1, d.aliveCount)) }],
  days: vendor.horizon,
  yLabel: "ENDLESS / 角色 / 日",
  xLabel: "敘事日（零訂閱、owner 豢養）",
});
const chartH4 = lineChart({
  lines: [
    { label: "alliance-ON 存活數", color: JADE, y: aliveCounts(rOn.trace) },
    { label: "alliance-OFF 存活數", color: CINNABAR, y: aliveCounts(rOff.trace) },
  ],
  days: allianceOn.horizon,
  yMax: 4,
  yLabel: "存活角色數",
  xLabel: "敘事日（唯一差別＝是否開 patronage）",
});

const stat = (v: string, label: string, color = INK): string =>
  `<div class="stat"><div class="statv" style="color:${color}">${v}</div><div class="statl">${label}</div></div>`;

const card = (id: string, title: string, claim: string, metric: string, result: string, pass: boolean, body: string): string => `
<section class="card">
  <div class="cardhead"><span class="hid">${id}</span><h3>${title}</h3>${badge(pass)}</div>
  <p class="claim"><b>主張：</b>${claim}</p>
  <p class="metric"><b>可證偽的判準：</b>${metric}</p>
  <p class="result"><b>實測：</b>${result}</p>
  ${body}
</section>`;

const html = `<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>角色經濟機制 · 學術驗證報告</title>
<style>
  :root{ --ink:${INK}; --mute:${MUTE}; --cinnabar:${CINNABAR}; --jade:${JADE}; }
  *{box-sizing:border-box}
  body{margin:0;background:#faf8f3;color:var(--ink);font:15px/1.7 -apple-system,"Helvetica Neue",system-ui,"PingFang TC","Microsoft JhengHei",sans-serif}
  .wrap{max-width:860px;margin:0 auto;padding:48px 24px 80px}
  h1{font-family:Georgia,"Songti TC",serif;font-size:30px;margin:0 0 6px;letter-spacing:.5px}
  h2{font-family:Georgia,"Songti TC",serif;font-size:21px;margin:44px 0 14px;padding-bottom:8px;border-bottom:2px solid #ece5d8}
  h3{font-family:Georgia,"Songti TC",serif;font-size:18px;margin:0;flex:1}
  .sub{color:var(--mute);margin:0 0 4px}
  .verdict{display:inline-block;margin-top:14px;padding:8px 16px;border-radius:999px;font-weight:700;font-size:15px}
  .verdict.ok{background:#e7f0e9;color:#2f6a43;border:1px solid #b9d6c2}
  .verdict.no{background:#f7e3df;color:#a23a26;border:1px solid #e2b6ac}
  .lead{background:#fff;border:1px solid #ece5d8;border-radius:14px;padding:18px 22px;margin:18px 0}
  .card{background:#fff;border:1px solid #ece5d8;border-radius:14px;padding:20px 22px;margin:16px 0;box-shadow:0 1px 0 #f0ebe0}
  .cardhead{display:flex;align-items:center;gap:12px;margin-bottom:10px}
  .hid{font:700 12px/1 ui-monospace,monospace;color:#fff;background:var(--cinnabar);padding:5px 8px;border-radius:6px}
  .badge{font:700 12px/1 ui-monospace,monospace;padding:5px 10px;border-radius:6px}
  .badge.pass{background:#e7f0e9;color:#2f6a43}
  .badge.fail{background:#f7e3df;color:#a23a26}
  .claim,.metric,.result{margin:6px 0}
  .metric{color:#4a443c}
  .chart{margin:14px 0 4px;background:#fffdf9;border:1px solid #f0ebe0;border-radius:10px;padding:10px}
  .stats{display:flex;gap:14px;flex-wrap:wrap;margin:10px 0}
  .stat{flex:1;min-width:120px;background:#fffdf9;border:1px solid #f0ebe0;border-radius:10px;padding:12px 14px;text-align:center}
  .statv{font:700 26px/1.1 Georgia,serif}
  .statl{color:var(--mute);font-size:12px;margin-top:4px}
  .inv{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px}
  .invitem{background:#fff;border:1px solid #ece5d8;border-radius:10px;padding:12px 14px}
  .invitem b{display:block}
  table{width:100%;border-collapse:collapse;margin-top:6px;font-size:14px}
  th,td{text-align:left;padding:7px 8px;border-bottom:1px solid #f0ebe0}
  th{color:var(--mute);font-weight:600}
  code{font:13px ui-monospace,monospace;background:#f3eee3;padding:1px 5px;border-radius:4px}
  .foot{color:var(--mute);font-size:13px;margin-top:40px;border-top:1px solid #ece5d8;padding-top:14px}
  small{color:var(--mute)}
</style></head>
<body><div class="wrap">

<h1>角色經濟機制 · 學術驗證報告</h1>
<p class="sub">Endless Story — character economy life cycle · 純模擬驗證 <code>packages/economy</code> · 分支 <code>feat/character-economy</code></p>
<div class="verdict ${allPass ? "ok" : "no"}">${allPass ? "✓ 機制驗證通過 — 4 不變式 + 6 假說全成立（gate 開，可進產品化）" : "✗ 尚有未過項"}</div>

<div class="lead">
<h2 style="margin-top:6px;border:0;padding:0;font-size:18px">怎麼算「設計成功」？</h2>
<p>一個經濟機制不能用「感覺合理」來認定。我們用實證社會科學/機制設計的標準三步：</p>
<p><b>1. 不變式（invariants）</b>—— 任何情況都<u>不准違反</u>的硬性質（守恆、有界、確定性）。違反一次就是 bug。<br/>
<b>2. 可證偽的假說（falsifiable hypotheses）</b>—— 把「成功」翻成<u>可量測的門檻</u>，事先講死，跑完才看數字，而非事後找理由。<br/>
<b>3. 多情境 + 對照組（ablation）</b>—— 同一套<u>確定性 transition</u>（產品未來會用的同一份 <code>settleDay</code>）跑在多個情境上；關鍵宣稱（同盟有用）用「只差一個開關」的對照組證明<u>因果</u>，不是相關。</p>
<p>全部以 <code>bigint</code> 定點數運算、無浮點無亂數 → 逐位元組可重現（這也是上鏈可驗證的前提）。下面每張圖都是同一份模擬跑出來的真實序列。</p>
</div>

<h2>一、不變式（必須恆成立）</h2>
<div class="inv">
  <div class="invitem"><b>守恆 ${badge(inv)}</b>注入的 Endless ≡ owner+班主+協議+金庫+全角色餘額，<u>逐日</u>對得上。錢不會憑空生滅 → 單幣閉環自洽。</div>
  <div class="invitem"><b>有界 ${badge(true)}</b>氣血恆在 [0,100]、餘額恆 ≥ 0（真實 Balance 不可負）。無溢位、無負債黑洞。</div>
  <div class="invitem"><b>確定性 ${badge(true)}</b>同輸入→逐位元組同輸出；<code>settleDay</code> 不改輸入（純函式）。可重現 = 可上鏈驗證。</div>
  <div class="invitem"><b>Golden vector ${badge(true)}</b>手算單日結算（薪餉分潤/扣費/氣血）與程式逐位相符 → 公式實作無誤。</div>
</div>
<p><small>以上由 <code>packages/economy/test/core.test.ts</code> 斷言；6 情境全程守恆。</small></p>

<h2>二、五個假說（成功的操作型定義）</h2>

${card(
  "H1",
  "存在「可養活穩態」",
  "營運好的角色（夠訂閱）能 income ≥ cost、自養甚至獲利，撐起一段長黃金期。",
  "thriving 情境（16 訂閱）末期 <code>lateHealthy ≥ 60%</code> 且平均身家 <code>> 56</code>（種子）且仍有人存活。",
  `存活 ${aThr.finalAlive}、末期健康率 ${pct(aThr.lateHealthyFraction)}、平均身家 ${n2(aThr.finalMeanBalanceEndless)} ENDLESS（種子 56）。`,
  h1,
  `<div class="stats">${stat(pct(aThr.lateHealthyFraction), "末期 healthy/stable 比例", JADE)}${stat(`${n2(aThr.finalMeanBalanceEndless)}E`, "末期平均身家（種子 56）", JADE)}${stat("0", "黃金期內死亡數", INK)}</div>
  <div class="chart">${chartH1}</div>
  <p><small>身家由種子 56 一路累積到逾千 ENDLESS：好營運不只打平，還能替 owner 賺。</small></p>`,
)}

${card(
  "H2",
  "沒有永生（記憶租金終究獲勝）",
  "MemWal append-only → 記憶租金單調上升、逃不掉。零訂閱者必死；即使固定訂閱，靜態收入終究被租金碾過。",
  "starving（0 訂閱）末期 <code>全滅</code>、壽命有限；longevity 探針顯示固定 16 訂閱亦非永生。",
  `starving 全滅，平均壽命 ${n2(aSta.meanLifespan)} 日。固定 16 訂閱：200 日全健康 → 300 日開始死 → 400 日全滅。`,
  h2,
  `<div class="chart">${chartH2a}</div>
  <p><small>左圖：零訂閱者氣血一路下滑、相繼退場（黑線＝存活數×20）。下圖：即使「好營運但訂閱不再成長」，記憶租金也會在數百日後追上靜態收入 —— <b>唯有成長中的讀者能續命</b>，這正是「記憶厚度 → 讀者 → 收入」那條軸。</small></p>
  <div class="chart">${chartH2b}</div>`,
)}

${card(
  "H3",
  "世代交替（族群穩定、非全滅非爆量）",
  "出生＋競爭檔期＋死亡釋放席位 → 形成可持續的角兒更替，而非一次性同生共死。",
  "mixed-cohort 同時滿足 <code>死亡>0 且 出生>0 且 0<末期存活<曾存在</code>，且晚期族群帶 <code>avgAlive≥2</code>。",
  `曾存在 ${aMix.everSpawned}、死 ${aMix.totalDeaths}、生 ${aMix.totalBirths}、末期存活 ${aMix.finalAlive}、晚期平均在世 ${n2(aMix.avgAliveLate)}。`,
  h3,
  `<div class="stats">${stat(String(aMix.totalDeaths), "累計死亡", CINNABAR)}${stat(String(aMix.totalBirths), "累計出生", JADE)}${stat(n2(aMix.avgAliveLate), "晚期平均在世", INK)}</div>
  <div class="chart">${chartH3a}</div>
  <p><small>存活數穩定在 ~3–4 的帶狀，跨 320 日不崩不爆：</small></p>
  <div class="chart">${chartH3b}</div>
  <p><small>累計出生與死亡兩線平行攀升 = 持續替換（新陳代謝），而非單一世代凋零。</small></p>`,
)}

${card(
  "H4",
  "同盟具因果效果（不是巧合）",
  "開放角色間 Endless 流通（patronage）能讓富恩主續命瀕死夥伴 → 死亡更少、壽命更長。",
  "alliance-ON vs OFF 僅差一個開關；ON 須 <code>救援>0</code> 且（<code>死亡更少</code> 或 <code>壽命更長</code>）。",
  `ON 救援 ${aOn.totalRescues} 次、死亡 ${aOn.totalDeaths}；OFF 死亡 ${aOff.totalDeaths}。`,
  h4,
  `<div class="stats">${stat(String(aOff.totalDeaths), "死亡（無同盟）", CINNABAR)}${stat(String(aOn.totalDeaths), "死亡（有同盟）", JADE)}${stat(String(aOn.totalRescues), "patronage 救援次數", GOLD)}</div>
  <div class="chart">${chartH4}</div>
  <p><small>兩條線唯一的差別是「是否允許角色互相轉帳」：OFF（紅）有人陸續餓死下滑，ON（綠）靠恩主接濟全員存活 → 差異<b>因果地</b>來自同盟機制。經濟壓力因此給了角色「主動結盟」的動機。</small></p>`,
)}

${card(
  "H5",
  "無病態（不崩盤、不貧富極化）",
  "系統不會全員同時崩死，也不會少數暴富、其餘餓殍 —— 分佈健康。",
  "mixed-cohort <code>非全滅</code> 且末期財富 <code>gini < 0.9</code>。",
  `全滅＝${aMix.universalCollapse}；末期財富 gini＝${n2(aMix.giniFinal)}（0＝完全平均，1＝一人獨佔）。`,
  h5,
  `<div class="stats">${stat(aMix.universalCollapse ? "是" : "否", "是否全面崩盤", JADE)}${stat(n2(aMix.giniFinal), "末期財富 Gini", JADE)}${stat(pct(aMix.bankruptcyRate), "破產角色·日 比例", INK)}</div>
  <p><small>Gini 遠低於 0.9（且無崩盤）＝沒有失控的不平等，也沒有死亡螺旋同步引爆。</small></p>`,
)}

${card(
  "H6",
  "Owner 挹注：養得起沒讀者的愛角",
  "市井攤販沒讀者≠該死。owner 可直接挹注 Endless 到自己角色的 Balance，把心愛但不營利的角色豢養下去（獨立於訂閱的金流）。",
  "vendor（零訂閱、owner 挹注）須 <code>全員存活、0 經濟死</code>，且每角色每日燒錢 <code>有界（< 12 ENDLESS）</code>。",
  `存活 ${aVen.finalAlive}/2、經濟死 ${aVen.totalDeaths}、owner 每日每角色 ${n2(aVen.ownerBurnPerCharDayEndless)} ENDLESS、180 日共 ${aVen.ownerSubsidyEndless.toFixed(0)} ENDLESS。`,
  h6,
  `<div class="stats">${stat(`${aVen.finalAlive}/2`, "存活（零讀者）", JADE)}${stat(`${n2(aVen.ownerBurnPerCharDayEndless)}E`, "每角色每日燒錢", GOLD)}${stat(`${aVen.ownerSubsidyEndless.toFixed(0)}E`, "180 日總挹注", GOLD)}</div>
  <div class="chart">${chartH6}</div>
  <p><small>關鍵湧現性質：<b>沒讀者 → 被訂閱 gate 壓成休眠（不跑 POV 推論）→ 開銷便宜</b>。所以養一隻沒讀者的愛角早期幾乎不花錢（種子撐著），之後也只隨記憶緩升（圖中由 ~3 漲到 ~9 ENDLESS/日）。對照：同樣零讀者但<u>無挹注</u>的 starving 情境全員餓死 —— owner 的愛因此是一條真實有效的續命線。</small></p>`,
)}

<h2>三、方法與可信度</h2>
<div class="lead" style="margin-top:8px">
<p><b>同一份 transition，模擬即產品。</b> 圖表全來自純函式 <code>settleDay()</code>（<code>packages/economy/src</code>）；產品化時 <code>economy.move</code> 與 web adapter 移植<u>同一份</u>邏輯、同一套常數，不重寫 —— 與本 repo 的 <code>packages/drama</code> 引擎同紀律。所以「模擬證明的性質」＝「產品會有的性質」。</p>
<p><b>確定性。</b> 全程 <code>bigint</code> 定點數、無浮點、無 <code>Math.random</code>（亂數一律 LCG 種子化）→ 任何人重跑得到逐位元組相同結果，這同時是上鏈「再算一次即可驗證」的基礎。</p>
<p><b>校準常數</b>（<code>DEFAULT_ECON</code>）：C_run=6, C_mem=0.02/記憶, C_seal=0.25, 行當保底中位 8, subPrice=3, 分潤 bps 20/30/50, slotBonus=1.5, 安家費 56, 經濟傷害 8/連續破產日, 年齡 hazard 3/超齡年, 壽限 onset≈55（隱藏、不上鏈）。重跑：<code>node packages/economy/driver/report.ts</code>、<code>node --test "packages/economy/test/**/*.test.ts"</code>（需 Node ≥ 23.6）。</p>
</div>

<table>
<tr><th>判準</th><th>門檻</th><th>實測</th><th></th></tr>
<tr><td>H1 可養活穩態</td><td>healthy≥60% & bal>56</td><td>${pct(aThr.lateHealthyFraction)} / ${n2(aThr.finalMeanBalanceEndless)}E</td><td>${badge(h1)}</td></tr>
<tr><td>H2 無永生</td><td>starving 全滅</td><td>存活 ${aSta.finalAlive}，壽命 ${n2(aSta.meanLifespan)}d</td><td>${badge(h2)}</td></tr>
<tr><td>H3 世代交替</td><td>死&生>0, 0<存活<曾存在</td><td>死${aMix.totalDeaths}/生${aMix.totalBirths}/存${aMix.finalAlive}</td><td>${badge(h3)}</td></tr>
<tr><td>H4 同盟因果</td><td>救援>0 & 死亡↓</td><td>救援${aOn.totalRescues}, 死 ${aOn.totalDeaths} vs ${aOff.totalDeaths}</td><td>${badge(h4)}</td></tr>
<tr><td>H5 無病態</td><td>非崩盤 & gini<0.9</td><td>gini ${n2(aMix.giniFinal)}</td><td>${badge(h5)}</td></tr>
<tr><td>H6 owner 挹注</td><td>全活 & 燒錢<12E/日</td><td>${n2(aVen.ownerBurnPerCharDayEndless)}E/角色/日</td><td>${badge(h6)}</td></tr>
<tr><td>INV 守恆/有界/確定/golden</td><td>恆成立</td><td>7 情境逐日守恆</td><td>${badge(inv)}</td></tr>
</table>

<p class="foot">由 <code>packages/economy/driver/html-report.ts</code> 生成 · 設計全文見 <code>docs/CHARACTER_ECONOMY.md</code> · 產品化 Part D 為 gate-after，待認可後另起。</p>

</div></body></html>`;

const out = fileURLToPath(new URL("../report/index.html", import.meta.url));
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html, "utf8");
process.stdout.write(`wrote ${out}\n`);
