'use client';

import { useMemo } from 'react';
import { BackSide, CanvasTexture, SRGBColorSpace } from 'three';

/**
 * 藏閣穹頂 — the vault is made of darkness and light, not architecture.
 * Day (明閣): a 青綠山水 fairyland — mineral blue-green ranges floating in
 * rice-paper mist under a pale gold sun, cloud bands drifting between peaks.
 * Night (月宮): a deep ink sky with a full moon, a faint 銀河, layered
 * mountain silhouettes rimmed in moonlight — pieces read as a constellation.
 */

/** deterministic pseudo-random in [0,1) — same dome every visit. */
function rnd(i: number, salt = 0): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** one soft-edged mountain range across the full width. */
function paintRange(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  baseY: number,
  amp: number,
  color: string,
  alpha: number,
  seed: number,
) {
  g.globalAlpha = alpha;
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(0, h);
  g.lineTo(0, baseY);
  const step = 64;
  for (let x = 0; x <= w; x += step) {
    const t = x / w;
    const y =
      baseY -
      Math.sin(t * Math.PI * (3 + seed)) * amp * 0.5 -
      Math.sin(t * Math.PI * (7 + seed * 2) + seed) * amp * 0.3 -
      rnd(Math.floor(x / step), seed) * amp * 0.45;
    g.quadraticCurveTo(x - step / 2, y + amp * 0.3, x, y);
  }
  g.lineTo(w, h);
  g.closePath();
  g.fill();
  g.globalAlpha = 1;
}

/** a horizontal mist band (留白) that dissolves the range below it. */
function paintMistBand(
  g: CanvasRenderingContext2D,
  w: number,
  y: number,
  thickness: number,
  color: string,
  alpha: number,
) {
  const band = g.createLinearGradient(0, y - thickness / 2, 0, y + thickness / 2);
  band.addColorStop(0, `rgba(${color},0)`);
  band.addColorStop(0.5, `rgba(${color},${alpha})`);
  band.addColorStop(1, `rgba(${color},0)`);
  g.fillStyle = band;
  g.fillRect(0, y - thickness / 2, w, thickness);
}

/** flat drifting cloud strokes (橫雲) — a few long soft ellipses. */
function paintCloudBands(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  color: string,
  count: number,
  yMin: number,
  yMax: number,
  alpha: number,
) {
  for (let i = 0; i < count; i++) {
    const cx = rnd(i, 5) * w;
    const cy = h * (yMin + rnd(i, 9) * (yMax - yMin));
    const cw = w * (0.1 + rnd(i, 13) * 0.16);
    const ch = cw * (0.05 + rnd(i, 17) * 0.035);
    const grad = g.createRadialGradient(cx, cy, 1, cx, cy, cw);
    grad.addColorStop(0, `rgba(${color},${alpha * (0.5 + rnd(i, 21) * 0.5)})`);
    grad.addColorStop(1, `rgba(${color},0)`);
    g.fillStyle = grad;
    g.save();
    g.translate(cx, cy);
    g.scale(1, ch / cw);
    g.beginPath();
    g.arc(0, 0, cw, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
}

/**
 * 水鄉天際線 — a low cluster of tiled roofs with 馬頭牆 stepped gables and a
 * tiny arch bridge, drawn as one silhouette riding the horizon. `windows`
 * scatters a few warm lit windows (night).
 */
function paintWaterTown(
  g: CanvasRenderingContext2D,
  cx: number,
  baseY: number,
  s: number,
  color: string,
  alpha: number,
  windows: boolean,
) {
  g.globalAlpha = alpha;
  g.fillStyle = color;
  const houses = [
    { dx: -150, w: 64, h: 46 },
    { dx: -84, w: 78, h: 62 },
    { dx: 0, w: 70, h: 50 },
    { dx: 66, w: 84, h: 68 },
    { dx: 148, w: 60, h: 44 },
  ];
  for (const hs of houses) {
    const x = cx + hs.dx * s;
    const w = hs.w * s;
    const h = hs.h * s;
    // body
    g.fillRect(x - w / 2, baseY - h, w, h);
    // pitched roof
    g.beginPath();
    g.moveTo(x - w / 2 - 6 * s, baseY - h);
    g.lineTo(x, baseY - h - 20 * s);
    g.lineTo(x + w / 2 + 6 * s, baseY - h);
    g.closePath();
    g.fill();
    // 馬頭牆 stepped gables on both sides
    for (const side of [-1, 1]) {
      g.fillRect(x + side * (w / 2 - 5 * s), baseY - h - 12 * s, 10 * s, 12 * s);
      g.fillRect(x + side * (w / 2 - 14 * s), baseY - h - 20 * s, 11 * s, 8 * s);
    }
  }
  // tiny arch bridge off to the right of the cluster
  g.beginPath();
  g.moveTo(cx + 200 * s, baseY);
  g.quadraticCurveTo(cx + 232 * s, baseY - 34 * s, cx + 264 * s, baseY);
  g.lineTo(cx + 264 * s, baseY - 3 * s);
  g.quadraticCurveTo(cx + 232 * s, baseY - 40 * s, cx + 200 * s, baseY - 3 * s);
  g.closePath();
  g.fill();
  g.globalAlpha = 1;
  if (windows) {
    g.fillStyle = 'rgba(255,192,110,0.75)';
    for (let i = 0; i < 7; i++) {
      const hs = houses[i % houses.length];
      g.fillRect(
        cx + hs.dx * s + (rnd(i, 91) - 0.5) * hs.w * 0.5 * s,
        baseY - hs.h * s * (0.3 + rnd(i, 93) * 0.4),
        3.2 * s,
        4.5 * s,
      );
    }
  }
}

function paintDay(g: CanvasRenderingContext2D, W: number, H: number) {
  // 宣紙青空 — celadon sky washing down into warm rice paper
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#bcd9cc');
  grad.addColorStop(0.38, '#c8e0d2');
  grad.addColorStop(0.62, '#ddE3cc');
  grad.addColorStop(0.84, '#e4dcc2');
  grad.addColorStop(1, '#d8caab');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);

  // 金烏 — a gold sun with a warm mineral halo (泥金)
  const sx = W * 0.66;
  const sy = H * 0.28;
  const halo = g.createRadialGradient(sx, sy, 10, sx, sy, H * 0.5);
  halo.addColorStop(0, 'rgba(250,224,150,0.9)');
  halo.addColorStop(0.22, 'rgba(246,214,138,0.38)');
  halo.addColorStop(0.55, 'rgba(244,214,150,0.14)');
  halo.addColorStop(1, 'rgba(244,214,150,0)');
  g.fillStyle = halo;
  g.fillRect(sx - H * 0.5, sy - H * 0.5, H, H);
  const sun = g.createRadialGradient(sx - 14, sy - 14, 4, sx, sy, H * 0.052);
  sun.addColorStop(0, '#fdf3d0');
  sun.addColorStop(0.7, '#f3d488');
  sun.addColorStop(1, '#e4b95e');
  g.fillStyle = sun;
  g.beginPath();
  g.arc(sx, sy, H * 0.052, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(196,152,70,0.65)';
  g.lineWidth = 3;
  g.beginPath();
  g.arc(sx, sy, H * 0.052, 0, Math.PI * 2);
  g.stroke();

  // high thin cloud bands above the ranges
  paintCloudBands(g, W, H, '253,254,251', 14, 0.1, 0.44, 0.85);

  // 千里江山 — mineral blue-green ranges, far → near, mist between
  paintRange(g, W, H, H * 0.52, H * 0.06, '#9cc3ae', 0.75, 1);
  paintMistBand(g, W, H * 0.55, H * 0.1, '244,247,240', 0.75);
  paintRange(g, W, H, H * 0.6, H * 0.085, '#6fa590', 0.85, 2);
  paintMistBand(g, W, H * 0.65, H * 0.12, '242,245,236', 0.8);
  paintRange(g, W, H, H * 0.7, H * 0.105, '#417d70', 0.9, 3);
  paintMistBand(g, W, H * 0.77, H * 0.13, '240,242,230', 0.85);
  paintRange(g, W, H, H * 0.82, H * 0.12, '#2c5d54', 0.95, 4);

  // 遠閣 — a tiny pagoda silhouette riding the middle range
  const px = W * 0.335;
  const py = H * 0.585;
  g.fillStyle = 'rgba(42,78,70,0.85)';
  const tiers = 3;
  for (let i = 0; i < tiers; i++) {
    const tw = 46 - i * 11;
    const ty = py - i * 22;
    g.beginPath();
    g.moveTo(px - tw, ty);
    g.quadraticCurveTo(px, ty - 13, px + tw, ty);
    g.lineTo(px + tw * 0.6, ty - 15);
    g.lineTo(px - tw * 0.6, ty - 15);
    g.closePath();
    g.fill();
    g.fillRect(px - tw * 0.52, ty - 21, tw * 1.04, 7);
  }
  g.fillRect(px - 2.5, py - tiers * 22 - 12, 5, 13);

  // 水鄉 rooftops hugging the waterline below the ranges (two clusters
  // at different azimuths so some roofs are visible from any orbit angle)
  paintWaterTown(g, W * 0.13, H * 0.665, 1.1, 'rgba(52,82,76,0.6)', 0.75, false);
  paintWaterTown(g, W * 0.52, H * 0.69, 0.8, 'rgba(46,74,68,0.55)', 0.7, false);
  paintWaterTown(g, W * 0.87, H * 0.675, 1.0, 'rgba(52,82,76,0.6)', 0.72, false);

  // 歸鶴 — a small flight of cranes, three brush strokes each
  g.strokeStyle = 'rgba(74,84,78,0.55)';
  g.lineWidth = 2.4;
  g.lineCap = 'round';
  const flock: [number, number, number][] = [
    [W * 0.34, H * 0.27, 1],
    [W * 0.375, H * 0.245, 0.8],
    [W * 0.41, H * 0.275, 0.9],
    [W * 0.45, H * 0.235, 0.7],
  ];
  for (const [bx, by, s] of flock) {
    const ww = 12 * s;
    g.beginPath();
    g.moveTo(bx - ww, by - ww * 0.35);
    g.quadraticCurveTo(bx - ww * 0.3, by + ww * 0.25, bx, by);
    g.quadraticCurveTo(bx + ww * 0.3, by + ww * 0.25, bx + ww, by - ww * 0.35);
    g.stroke();
  }

  // ground haze — everything dissolves into paper below the ranges
  const haze = g.createLinearGradient(0, H * 0.8, 0, H);
  haze.addColorStop(0, 'rgba(238,233,214,0)');
  haze.addColorStop(1, 'rgba(238,233,214,0.9)');
  g.fillStyle = haze;
  g.fillRect(0, H * 0.8, W, H * 0.2);
}

function paintNight(g: CanvasRenderingContext2D, W: number, H: number) {
  // 墨色夜空 — ink blue deepening overhead
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#04060e');
  grad.addColorStop(0.45, '#091126');
  grad.addColorStop(0.72, '#14233c');
  grad.addColorStop(0.9, '#0d1a2c');
  grad.addColorStop(1, '#091320');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);

  // 銀河 — a faint diagonal river of light
  g.save();
  g.translate(W * 0.32, H * 0.3);
  g.rotate(-0.5);
  const milky = g.createLinearGradient(0, -H * 0.09, 0, H * 0.09);
  milky.addColorStop(0, 'rgba(150,170,210,0)');
  milky.addColorStop(0.5, 'rgba(168,186,222,0.1)');
  milky.addColorStop(1, 'rgba(150,170,210,0)');
  g.fillStyle = milky;
  g.fillRect(-W * 0.7, -H * 0.09, W * 1.4, H * 0.18);
  g.restore();
  for (let i = 0; i < 150; i++) {
    const t = rnd(i, 31) * 2 - 1;
    const x = W * 0.32 + t * W * 0.55 - rnd(i, 33) * 30;
    const y = H * 0.3 - Math.tan(-0.5) * t * W * 0.5 + (rnd(i, 37) - 0.5) * H * 0.13;
    if (y < 0 || y > H * 0.7) continue;
    g.globalAlpha = 0.06 + rnd(i, 41) * 0.16;
    g.fillStyle = '#c8d6ee';
    g.beginPath();
    g.arc(x, y, rnd(i, 43) * 0.9 + 0.3, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;

  // 星子 — layered stars, a few bright ones with a cross of light
  for (let i = 0; i < 240; i++) {
    const x = rnd(i, 51) * W;
    const y = rnd(i, 53) * H * 0.66;
    const r = rnd(i, 57) * 1.15 + 0.25;
    g.globalAlpha = 0.2 + rnd(i, 59) * 0.6;
    g.fillStyle = i % 7 === 0 ? '#fdf6e0' : '#dde8fa';
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  for (let i = 0; i < 7; i++) {
    const x = rnd(i, 61) * W;
    const y = rnd(i, 67) * H * 0.5;
    const s = 4 + rnd(i, 71) * 5;
    const glow = g.createRadialGradient(x, y, 0, x, y, s * 2.4);
    glow.addColorStop(0, 'rgba(240,246,255,0.9)');
    glow.addColorStop(1, 'rgba(240,246,255,0)');
    g.fillStyle = glow;
    g.fillRect(x - s * 2.4, y - s * 2.4, s * 4.8, s * 4.8);
    g.strokeStyle = 'rgba(235,242,255,0.7)';
    g.lineWidth = 0.9;
    g.beginPath();
    g.moveTo(x - s, y);
    g.lineTo(x + s, y);
    g.moveTo(x, y - s);
    g.lineTo(x, y + s);
    g.stroke();
  }

  // 一輪滿月 — big, quiet, with a layered halo and faint maria
  const mx = W * 0.68;
  const my = H * 0.33;
  const mr = H * 0.085;
  const halo = g.createRadialGradient(mx, my, mr * 0.5, mx, my, mr * 6);
  halo.addColorStop(0, 'rgba(255,250,232,0.5)');
  halo.addColorStop(0.18, 'rgba(240,240,225,0.16)');
  halo.addColorStop(0.5, 'rgba(210,222,238,0.07)');
  halo.addColorStop(1, 'rgba(210,222,238,0)');
  g.fillStyle = halo;
  g.fillRect(mx - mr * 6, my - mr * 6, mr * 12, mr * 12);
  const moon = g.createRadialGradient(mx - mr * 0.3, my - mr * 0.3, mr * 0.1, mx, my, mr);
  moon.addColorStop(0, '#fffdf4');
  moon.addColorStop(0.75, '#f7f0da');
  moon.addColorStop(1, '#e8e0c6');
  g.fillStyle = moon;
  g.beginPath();
  g.arc(mx, my, mr, 0, Math.PI * 2);
  g.fill();
  // faint moon maria
  g.globalAlpha = 0.1;
  g.fillStyle = '#a8a284';
  for (let i = 0; i < 6; i++) {
    g.beginPath();
    g.arc(
      mx + (rnd(i, 81) - 0.5) * mr * 1.1,
      my + (rnd(i, 83) - 0.5) * mr * 1.1,
      mr * (0.12 + rnd(i, 87) * 0.22),
      0,
      Math.PI * 2,
    );
    g.fill();
  }
  g.globalAlpha = 1;

  // 夜雲 — thin wisps crossing near the moon
  paintCloudBands(g, W, H, '188,204,228', 5, 0.2, 0.4, 0.1);
  paintCloudBands(g, W, H, '164,182,210', 4, 0.42, 0.58, 0.08);

  // 遠山剪影 — ink silhouettes with a cold moonlit rim
  paintRange(g, W, H, H * 0.66, H * 0.05, '#182a3c', 0.65, 2);
  paintMistBand(g, W, H * 0.7, H * 0.09, '150,175,205', 0.1);
  paintRange(g, W, H, H * 0.74, H * 0.075, '#101e2e', 0.85, 3);
  paintMistBand(g, W, H * 0.8, H * 0.1, '140,165,195', 0.08);
  paintRange(g, W, H, H * 0.84, H * 0.1, '#0a1420', 0.95, 5);

  // 水鄉夜泊 — sleeping rooftops at the waterline, a few windows still lit
  paintWaterTown(g, W * 0.13, H * 0.875, 1.1, '#060c14', 0.95, true);
  paintWaterTown(g, W * 0.5, H * 0.89, 0.75, '#050a12', 0.9, true);
  paintWaterTown(g, W * 0.86, H * 0.88, 1.0, '#060c14', 0.95, true);

  // water-dark base
  const base = g.createLinearGradient(0, H * 0.86, 0, H);
  base.addColorStop(0, 'rgba(8,14,22,0)');
  base.addColorStop(1, 'rgba(6,10,17,0.9)');
  g.fillStyle = base;
  g.fillRect(0, H * 0.86, W, H * 0.14);
}

function paintVault(tone: 'night' | 'day'): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = 1024;
  const g = c.getContext('2d')!;
  if (tone === 'day') paintDay(g, c.width, c.height);
  else paintNight(g, c.width, c.height);
  return c;
}

export function VaultBackdrop({ tone = 'night' }: { tone?: 'night' | 'day' }) {
  const texture = useMemo(() => {
    const tex = new CanvasTexture(paintVault(tone));
    tex.colorSpace = SRGBColorSpace;
    return tex;
  }, [tone]);

  return (
    <mesh scale={[-1, 1, 1]}>
      <sphereGeometry args={[60, 40, 24]} />
      <meshBasicMaterial map={texture} side={BackSide} fog={false} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}
