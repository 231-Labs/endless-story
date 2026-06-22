/**
 * DRAMA-EFFECT ENGINE — self-contained HTML report.
 *
 * `renderReport(result)` returns a single HTML string with INLINE CSS + JS and NO CDN /
 * external library — an owner double-clicks the file and reads:
 *
 *   · header + config summary (what soil was seeded);
 *   · the directed RELATIONSHIP GRAPH per tick (inline SVG, circular layout, directed
 *     curved edges with arrowheads, tone-coloured, weight = stroke width) with a tick
 *     slider so you can scrub the evolution;
 *   · every tick's chapters (POV / 回 / 公報), collapsible, newlines preserved;
 *   · metrics: a tone-distribution bar + edge-count / recall sparklines over ticks.
 *
 * All geometry is computed here (node positions on a circle, quadratic edge curves,
 * arrowhead polygons) — no graph library. The SVGs are serialized into the page and a
 * tiny vanilla script toggles which tick is shown.
 */

import type {
    ExperimentResult,
    GraphSnapshot,
    TickRecord,
} from './types';
import type { RelationshipTone } from '@endless-story/shared';

/* ── tone → colour + Chinese label (mirrors relationship-evolve's TONE_ZH) ─────── */

const TONE_COLOR: Record<RelationshipTone, string> = {
    romance: '#ff6fa5', // 戀慕 — pink
    affection: '#ff9e54', // 親近 — orange
    rivalry: '#c0392b', // 競爭 — deep red
    tension: '#e6c025', // 緊張 — yellow
    wary: '#6b7f99', // 戒備 — slate blue-grey
    mentorship: '#7aa6c2', // 師徒 — muted blue
    estrangement: '#8a8f98', // 隔閡 — grey
    acquaintance: '#9aa0a6', // 故舊 — grey
    neutral: '#9aa0a6', // 平淡 — grey
};

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

const TONE_ORDER: RelationshipTone[] = [
    'romance',
    'affection',
    'mentorship',
    'rivalry',
    'tension',
    'wary',
    'estrangement',
    'acquaintance',
    'neutral',
];

function colorFor(tone: RelationshipTone): string {
    return TONE_COLOR[tone] ?? TONE_COLOR.neutral;
}

/* ── tiny html helpers ─────────────────────────────────────────────────────────── */

function esc(s: string): string {
    return String(s)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

/** weight → stroke width: ×1 thin → ×3+ thick (clamped). */
function strokeWidthFor(weight: number): number {
    return Math.min(7, 1.4 + (Math.max(1, weight) - 1) * 1.8);
}

/* ── relationship graph → inline SVG (circular layout, directed curved edges) ──── */

interface Pt {
    x: number;
    y: number;
}

function nodePositions(n: number, cx: number, cy: number, r: number): Pt[] {
    const pts: Pt[] = [];
    for (let i = 0; i < n; i++) {
        // start at the top (-90°) and go clockwise so the layout reads naturally.
        const a = -Math.PI / 2 + (i / Math.max(1, n)) * Math.PI * 2;
        pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    }
    return pts;
}

/**
 * Render one graph snapshot as an SVG fragment. Nodes sit on a circle; each directed
 * edge A→B is a quadratic curve bowed to one side (so A→B and B→A don't overlap),
 * coloured by tone, stroke-width by weight, ending in an arrowhead just shy of B.
 */
function renderGraphSvg(graph: GraphSnapshot, size = 520): string {
    const cx = size / 2;
    const cy = size / 2;
    const R = size / 2 - 64; // leave room for node labels
    const NODE_R = 7;
    const nodes = graph.nodes;
    const n = nodes.length;
    if (n === 0) {
        return `<svg viewBox="0 0 ${size} ${size}" class="graph" xmlns="http://www.w3.org/2000/svg"></svg>`;
    }
    const pos = nodePositions(n, cx, cy, R);
    const idx = new Map(nodes.map((nd, i) => [nd.id, i]));

    const edgeParts: string[] = [];
    for (const e of graph.edges) {
        const ai = idx.get(e.fromId);
        const bi = idx.get(e.toId);
        if (ai == null || bi == null || ai === bi) continue;
        const a = pos[ai];
        const b = pos[bi];
        const col = colorFor(e.tone);
        const sw = strokeWidthFor(e.weight);

        // Pull endpoints in to the node rim so the line/arrow doesn't dive under the dot.
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len;
        const uy = dy / len;
        const sx = a.x + ux * (NODE_R + 2);
        const sy = a.y + uy * (NODE_R + 2);
        const ex = b.x - ux * (NODE_R + 4);
        const ey = b.y - uy * (NODE_R + 4);

        // Control point: midpoint pushed perpendicular (left of A→B) so the two
        // directions of a pair bow apart. Perp of (ux,uy) is (uy,-ux).
        const mx = (sx + ex) / 2;
        const my = (sy + ey) / 2;
        const bow = Math.min(46, len * 0.18);
        const ctrlX = mx + uy * bow;
        const ctrlY = my - ux * bow;

        // Arrowhead at the end, oriented along the curve's final tangent (ctrl→end).
        const tx = ex - ctrlX;
        const ty = ey - ctrlY;
        const tlen = Math.hypot(tx, ty) || 1;
        const hx = tx / tlen;
        const hy = ty / tlen;
        const aw = 5 + sw * 0.6; // arrow half-width scales a little with weight
        const al = 11 + sw * 0.6;
        const tipX = ex;
        const tipY = ey;
        const baseX = ex - hx * al;
        const baseY = ey - hy * al;
        // perp for the two base corners
        const px = -hy;
        const py = hx;
        const c1x = baseX + px * aw;
        const c1y = baseY + py * aw;
        const c2x = baseX - px * aw;
        const c2y = baseY - py * aw;

        const title = `${esc(e.fromName)} → ${esc(e.toName)}：${TONE_ZH[e.tone] ?? e.tone}（${e.tone}）×${e.weight}`;
        edgeParts.push(
            `<g class="edge"><title>${title}</title>` +
                `<path d="M ${sx.toFixed(1)} ${sy.toFixed(1)} Q ${ctrlX.toFixed(1)} ${ctrlY.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}" ` +
                `fill="none" stroke="${col}" stroke-width="${sw.toFixed(1)}" stroke-linecap="round" opacity="0.85"/>` +
                `<polygon points="${tipX.toFixed(1)},${tipY.toFixed(1)} ${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)}" fill="${col}"/>` +
                `</g>`,
        );
    }

    const nodeParts: string[] = [];
    for (let i = 0; i < n; i++) {
        const p = pos[i];
        const nd = nodes[i];
        // label sits just outside the node, pushed radially out from centre.
        const ang = Math.atan2(p.y - cy, p.x - cx);
        const lx = p.x + Math.cos(ang) * 18;
        const ly = p.y + Math.sin(ang) * 18;
        const anchor = Math.cos(ang) > 0.25 ? 'start' : Math.cos(ang) < -0.25 ? 'end' : 'middle';
        nodeParts.push(
            `<g class="node">` +
                `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${NODE_R}" fill="#e9edf4" stroke="#3a4252" stroke-width="1.5"/>` +
                `<text x="${lx.toFixed(1)}" y="${(ly + 4).toFixed(1)}" text-anchor="${anchor}" class="nlabel">${esc(nd.name)}</text>` +
                `</g>`,
        );
    }

    return (
        `<svg viewBox="0 0 ${size} ${size}" class="graph" xmlns="http://www.w3.org/2000/svg">` +
        edgeParts.join('') +
        nodeParts.join('') +
        `</svg>`
    );
}

/* ── tone-distribution bar (final graph) ───────────────────────────────────────── */

function renderToneBar(graph: GraphSnapshot): string {
    const counts: Partial<Record<RelationshipTone, number>> = {};
    for (const e of graph.edges) counts[e.tone] = (counts[e.tone] ?? 0) + 1;
    const max = Math.max(1, ...Object.values(counts).map((v) => v ?? 0));
    const rows = TONE_ORDER.filter((t) => (counts[t] ?? 0) > 0).map((t) => {
        const c = counts[t] ?? 0;
        const w = (c / max) * 100;
        return (
            `<div class="bar-row">` +
            `<span class="bar-label">${TONE_ZH[t]}<i>${esc(t)}</i></span>` +
            `<span class="bar-track"><span class="bar-fill" style="width:${w.toFixed(0)}%;background:${colorFor(t)}"></span></span>` +
            `<span class="bar-val">${c}</span>` +
            `</div>`
        );
    });
    if (rows.length === 0) {
        return `<p class="muted">尚無任何有向關係（fake-LLM smoke 下這很正常 — 渲染管路已通；填 key 後真 LLM 會逐 tick 長出來）。</p>`;
    }
    return `<div class="bars">${rows.join('')}</div>`;
}

/* ── sparkline (edge-count / recall over ticks) ────────────────────────────────── */

function renderSparkline(values: number[], color: string, label: string): string {
    const w = 260;
    const h = 56;
    const pad = 6;
    const max = Math.max(1, ...values);
    const n = values.length;
    const pts = values.map((v, i) => {
        const x = n <= 1 ? pad : pad + (i / (n - 1)) * (w - 2 * pad);
        const y = h - pad - (v / max) * (h - 2 * pad);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const dots = values
        .map((v, i) => {
            const [x, y] = pts[i].split(',');
            return `<circle cx="${x}" cy="${y}" r="2.4" fill="${color}"><title>tick ${i + 1}: ${v}</title></circle>`;
        })
        .join('');
    return (
        `<figure class="spark">` +
        `<figcaption>${esc(label)} <span class="spark-last">peak ${max}</span></figcaption>` +
        `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">` +
        `<polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="2"/>` +
        dots +
        `</svg></figure>`
    );
}

/* ── chapters block (per tick, collapsible) ────────────────────────────────────── */

const KIND_ZH: Record<string, string> = { pov: 'POV', cut: '回', gazette: '公報' };

function renderChapters(tick: TickRecord): string {
    if (tick.chapters.length === 0) {
        return `<p class="muted">（這個 tick 沒有產出章回）</p>`;
    }
    return tick.chapters
        .map((ch) => {
            const kind = KIND_ZH[ch.kind] ?? ch.kind;
            const head = `〔${esc(kind)}〕${esc(ch.name)} · ${ch.body.length} 字`;
            return (
                `<details class="chapter">` +
                `<summary>${head}</summary>` +
                `<div class="chapter-body">${esc(ch.body)}</div>` +
                `</details>`
            );
        })
        .join('');
}

/* ── the page ──────────────────────────────────────────────────────────────────── */

export function renderReport(result: ExperimentResult): string {
    const { config, perTick, finalGraph, usedRealLLM } = result;

    // per-tick SVGs (one shown at a time; the slider toggles `data-active`).
    const tickPanels = perTick
        .map((t, i) => {
            const eventLine = t.events.length
                ? t.events.map((e) => `〔${esc(e.label)}〕[${esc(e.names.join('、'))}]`).join('　')
                : '（這個 tick 沒有開啟事件）';
            return (
                `<div class="tick-panel" data-tick="${i}"${i === perTick.length - 1 ? ' data-active="1"' : ''}>` +
                `<div class="graph-wrap">${renderGraphSvg(t.graph)}</div>` +
                `<div class="tick-meta">` +
                `<div class="event-line">${eventLine}</div>` +
                `<div class="tick-stats">關係邊 ${t.metrics.edgeCount}　·　本 tick 新種 ${t.metrics.seededThisTick}　·　recall ${t.metrics.recallHits}　·　weight 合計 ${t.metrics.weightSum}</div>` +
                `<div class="chapters">${renderChapters(t)}</div>` +
                `</div>` +
                `</div>`
            );
        })
        .join('');

    const edgeSeries = perTick.map((t) => t.metrics.edgeCount);
    const recallSeries = perTick.map((t) => t.metrics.recallHits);
    const weightSeries = perTick.map((t) => t.metrics.weightSum);

    const legend = TONE_ORDER.map(
        (t) =>
            `<span class="leg"><i style="background:${colorFor(t)}"></i>${TONE_ZH[t]}<em>${esc(t)}</em></span>`,
    ).join('');

    const stakeLine =
        `stake = <b>${esc(config.stake.kind)}</b> → cast[${config.stake.targetIndex}]` +
        `（容量 ${config.stake.capacity ?? 1}）　·　cast ${config.cast.count}　·　ticks ${config.ticks}` +
        `　·　settle <b>${esc(config.settle)}</b>` +
        (config.framingOverride ? `　·　framingOverride ✓` : '');

    const llmBadge = usedRealLLM
        ? `<span class="badge ok">REAL LLM</span>`
        : `<span class="badge warn">FAKE LLM（smoke — 渲染管路驗證；關係多為空）</span>`;

    return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>戲劇效果實驗 · ${esc(config.name)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 28px 22px 64px;
    font: 15px/1.7 -apple-system, "PingFang TC", "Noto Sans CJK TC", "Microsoft JhengHei", system-ui, sans-serif;
    color: #1d2330; background: #f5f6f9; max-width: 1080px; margin-inline: auto;
  }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h2 { font-size: 15px; letter-spacing: .04em; text-transform: uppercase; color: #5b6577; margin: 30px 0 12px; }
  .sub { color: #5b6577; margin: 0 0 16px; }
  .summary { background: #fff; border: 1px solid #e3e6ec; border-radius: 12px; padding: 14px 18px; margin: 14px 0 8px; }
  .summary .stake { font-size: 14px; color: #2a3142; }
  .badge { display: inline-block; font-size: 12px; font-weight: 700; padding: 2px 9px; border-radius: 999px; margin-left: 8px; vertical-align: middle; }
  .badge.ok { background: #e3f6ea; color: #1d7a45; }
  .badge.warn { background: #fdf0d8; color: #8a5a00; }
  .muted { color: #8a8f98; font-style: italic; }
  /* legend */
  .legend { display: flex; flex-wrap: wrap; gap: 6px 14px; margin: 6px 0 4px; font-size: 12.5px; color: #44495a; }
  .leg { display: inline-flex; align-items: center; gap: 5px; }
  .leg i { width: 12px; height: 12px; border-radius: 3px; display: inline-block; }
  .leg em { color: #9aa0a6; font-style: normal; font-size: 11px; }
  /* graph + tick switcher */
  .stage { background: #fff; border: 1px solid #e3e6ec; border-radius: 12px; padding: 16px 18px 22px; }
  .slider-row { display: flex; align-items: center; gap: 12px; margin: 4px 0 14px; }
  .slider-row input[type=range] { flex: 1; }
  .slider-row .now { font-weight: 700; min-width: 92px; }
  .tick-panel { display: none; }
  .tick-panel[data-active="1"] { display: grid; grid-template-columns: 540px 1fr; gap: 18px; align-items: start; }
  @media (max-width: 900px) { .tick-panel[data-active="1"] { grid-template-columns: 1fr; } }
  .graph-wrap { background: #fbfbfd; border: 1px solid #eceef3; border-radius: 10px; }
  svg.graph { width: 100%; height: auto; display: block; }
  .nlabel { font: 600 12.5px system-ui, sans-serif; fill: #2a3142; }
  .edge:hover path { opacity: 1; }
  .event-line { font-size: 13.5px; color: #3a4150; background: #f1f3f8; border-radius: 8px; padding: 7px 10px; margin-bottom: 8px; }
  .tick-stats { font-size: 12.5px; color: #5b6577; margin-bottom: 12px; }
  /* chapters */
  .chapter { border: 1px solid #e6e9ef; border-radius: 8px; margin: 6px 0; background: #fff; }
  .chapter > summary { cursor: pointer; padding: 8px 11px; font-weight: 600; font-size: 13.5px; color: #2a3142; list-style: none; }
  .chapter > summary::-webkit-details-marker { display: none; }
  .chapter > summary::before { content: "▸ "; color: #9aa0a6; }
  .chapter[open] > summary::before { content: "▾ "; }
  .chapter-body { white-space: pre-wrap; padding: 4px 13px 13px; color: #232a38; font-size: 14px; border-top: 1px solid #f0f2f6; }
  /* metrics */
  .metrics { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; align-items: start; }
  @media (max-width: 760px) { .metrics { grid-template-columns: 1fr; } }
  .panel { background: #fff; border: 1px solid #e3e6ec; border-radius: 12px; padding: 14px 16px; }
  .bars { display: flex; flex-direction: column; gap: 7px; }
  .bar-row { display: grid; grid-template-columns: 96px 1fr 28px; align-items: center; gap: 9px; font-size: 13px; }
  .bar-label i { color: #9aa0a6; font-style: normal; font-size: 11px; margin-left: 4px; }
  .bar-track { background: #eef0f5; border-radius: 6px; height: 12px; overflow: hidden; }
  .bar-fill { display: block; height: 100%; border-radius: 6px; }
  .bar-val { text-align: right; color: #5b6577; }
  .sparks { display: flex; flex-wrap: wrap; gap: 16px; }
  .spark { margin: 0; }
  .spark figcaption { font-size: 12.5px; color: #5b6577; margin-bottom: 2px; }
  .spark-last { color: #9aa0a6; }
  footer { margin-top: 34px; font-size: 12px; color: #9aa0a6; border-top: 1px solid #e3e6ec; padding-top: 12px; }
  code { background: #eceef3; padding: 1px 5px; border-radius: 4px; font-size: 12.5px; }
</style>
</head>
<body>
  <h1>戲劇效果實驗 · ${esc(config.name)} ${llmBadge}</h1>
  <p class="sub">${esc(config.description ?? '')}</p>

  <div class="summary">
    <div class="stake">${stakeLine}</div>
  </div>

  <h2>關係圖演化（有向 · circular layout）</h2>
  <div class="legend">${legend}</div>
  <div class="stage">
    <div class="slider-row">
      <button id="prev" type="button">◀</button>
      <input id="tick" type="range" min="0" max="${Math.max(0, perTick.length - 1)}" value="${Math.max(0, perTick.length - 1)}"/>
      <button id="next" type="button">▶</button>
      <span class="now" id="nowLabel">tick ${perTick.length}/${perTick.length}</span>
    </div>
    ${tickPanels || '<p class="muted">沒有 tick 資料。</p>'}
  </div>

  <h2>指標</h2>
  <div class="metrics">
    <div class="panel">
      <strong style="font-size:13.5px;color:#3a4150">最終 tone 分布（有向邊計數）</strong>
      ${renderToneBar(finalGraph)}
    </div>
    <div class="panel">
      <strong style="font-size:13.5px;color:#3a4150">隨 tick 變化</strong>
      <div class="sparks">
        ${renderSparkline(edgeSeries, '#c0392b', '關係邊數')}
        ${renderSparkline(weightSeries, '#ff6fa5', 'weight 合計')}
        ${renderSparkline(recallSeries, '#7aa6c2', 'recall hits')}
      </div>
    </div>
  </div>

  <footer>
    戲劇效果引擎 MVP · 由 <code>experiments/run-experiment.ts</code> 跑出、<code>experiments/render-report.ts</code> 渲染。
    ${usedRealLLM ? '真 LLM 跑出的關係由各角色 POV 演化而來。' : '本報告為 fake-LLM smoke：關係圖管路已驗證，填 key（ZAI/POE/ANTHROPIC + OPENAI）後重跑可看真關係。'}
  </footer>

<script>
(function () {
  var panels = Array.prototype.slice.call(document.querySelectorAll('.tick-panel'));
  var slider = document.getElementById('tick');
  var nowLabel = document.getElementById('nowLabel');
  var total = panels.length;
  function show(i) {
    i = Math.max(0, Math.min(total - 1, i));
    panels.forEach(function (p, j) {
      if (j === i) { p.setAttribute('data-active', '1'); }
      else { p.removeAttribute('data-active'); }
    });
    if (slider) slider.value = String(i);
    if (nowLabel) nowLabel.textContent = 'tick ' + (i + 1) + '/' + total;
  }
  if (slider) slider.addEventListener('input', function () { show(parseInt(slider.value, 10) || 0); });
  var prev = document.getElementById('prev');
  var next = document.getElementById('next');
  if (prev) prev.addEventListener('click', function () { show((parseInt(slider.value, 10) || 0) - 1); });
  if (next) next.addEventListener('click', function () { show((parseInt(slider.value, 10) || 0) + 1); });
  show(total - 1);
})();
</script>
</body>
</html>`;
}
