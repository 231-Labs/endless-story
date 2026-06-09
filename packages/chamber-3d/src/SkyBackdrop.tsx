'use client';

import { useMemo } from 'react';
import { BackSide, CanvasTexture, SRGBColorSpace } from 'three';
import type { ChamberEnvironment } from './types.js';

/**
 * A large painted backdrop — a 青綠山水 (blue-green landscape) tinted by
 * time-of-day / weather, with layered 远山, soft mist and a 瓦浪 roof-ridge
 * silhouette. The dreamy, airy reference look (山东卫视 stage). The floating
 * 樓閣 sits in front of it; the 月洞門 frames a slice.
 */
interface SkyStops {
  top: string;
  mid: string;
  horizon: string;
  far: string; // far mountains (lightest)
  near: string; // near mountains (deepest 青綠)
  ridge: string; // 瓦浪 roof-ridge
  stars: boolean;
  moon: boolean;
}

const SKY: Record<string, SkyStops> = {
  // bright 青綠山水 — the reference look
  day: {
    top: '#cfe8e6', mid: '#a9d6d2', horizon: '#e6f1ec',
    far: '#9fc6bf', near: '#5f9e92', ridge: '#3f7a72', stars: false, moon: false,
  },
  dawn: {
    top: '#bcd9dd', mid: '#d9b6ac', horizon: '#f3dcc6',
    far: '#a9c2c0', near: '#6f9a93', ridge: '#4a7a78', stars: false, moon: false,
  },
  dusk: {
    top: '#3a3a64', mid: '#7a6a86', horizon: '#d9b48a',
    far: '#6a7e86', near: '#445e62', ridge: '#33454a', stars: true, moon: true,
  },
  night: {
    top: '#0c1430', mid: '#1c2c4a', horizon: '#33506a',
    far: '#2a4452', near: '#1a2e3a', ridge: '#12222a', stars: true, moon: true,
  },
};

function paintSky(env: ChamberEnvironment): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 1280;
  c.height = 640;
  const g = c.getContext('2d')!;
  const s = SKY[env.timeOfDay] ?? SKY.day;
  const snow = env.weather === 'snow';
  const mist = env.weather === 'mist' || env.weather === 'snow';

  const grad = g.createLinearGradient(0, 0, 0, c.height);
  grad.addColorStop(0, s.top);
  grad.addColorStop(0.5, s.mid);
  grad.addColorStop(1, snow ? '#eef4f2' : s.horizon);
  g.fillStyle = grad;
  g.fillRect(0, 0, c.width, c.height);

  if (s.moon) {
    const mx = c.width * 0.72, my = c.height * 0.26;
    const halo = g.createRadialGradient(mx, my, 8, mx, my, 110);
    halo.addColorStop(0, 'rgba(255,250,235,0.9)');
    halo.addColorStop(0.3, 'rgba(255,245,220,0.4)');
    halo.addColorStop(1, 'rgba(255,245,220,0)');
    g.fillStyle = halo;
    g.fillRect(mx - 110, my - 110, 220, 220);
    g.fillStyle = 'rgba(255,252,240,0.95)';
    g.beginPath();
    g.arc(mx, my, 30, 0, Math.PI * 2);
    g.fill();
  }
  if (s.stars) {
    g.fillStyle = 'rgba(255,255,255,0.8)';
    for (let i = 0; i < 160; i++) {
      const x = (i * 9277) % c.width;
      const y = (i * 6151) % Math.floor(c.height * 0.5);
      g.globalAlpha = 0.25 + ((i * 7) % 7) / 12;
      g.beginPath();
      g.arc(x, y, ((i * 13) % 10) / 10 + 0.2, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  }

  // 瓦浪 roof-ridge silhouette arcing across the upper-mid (reference motif)
  const ridgeY = c.height * 0.34;
  g.strokeStyle = s.ridge;
  g.lineWidth = 14;
  g.globalAlpha = 0.85;
  g.beginPath();
  g.moveTo(0, ridgeY);
  for (let x = 0; x <= c.width; x += 40) {
    g.lineTo(x, ridgeY - Math.sin(x * 0.006) * 70);
  }
  g.stroke();
  g.globalAlpha = 1;

  // layered 青綠 mountains (far → near, atmospheric)
  const range = (baseY: number, amp: number, color: string, alpha: number, soft: number) => {
    g.globalAlpha = alpha;
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(0, c.height);
    g.lineTo(0, baseY);
    for (let x = 0; x <= c.width; x += 56) {
      const y = baseY - Math.sin(x * (0.004 + soft) + baseY) * amp - ((x * 11) % amp);
      g.quadraticCurveTo(x - 28, y + amp * 0.4, x, y);
    }
    g.lineTo(c.width, c.height);
    g.closePath();
    g.fill();
    g.globalAlpha = 1;
  };
  range(c.height * 0.5, 34, s.far, 0.5, 0.002);
  range(c.height * 0.62, 48, s.near, 0.7, 0.0035);
  range(c.height * 0.74, 64, s.ridge, 0.9, 0.005);

  // soft mist band
  if (mist || true) {
    const haze = g.createLinearGradient(0, c.height * 0.38, 0, c.height);
    haze.addColorStop(0, 'rgba(244,249,247,0)');
    haze.addColorStop(1, snow ? 'rgba(240,246,244,0.6)' : 'rgba(232,242,240,0.45)');
    g.fillStyle = haze;
    g.fillRect(0, c.height * 0.38, c.width, c.height * 0.62);
  }

  return c;
}

export function SkyBackdrop({ env }: { env: ChamberEnvironment }) {
  const texture = useMemo(() => {
    const tex = new CanvasTexture(paintSky(env));
    tex.colorSpace = SRGBColorSpace;
    return tex;
  }, [env.timeOfDay, env.weather]);

  return (
    <mesh scale={[-1, 1, 1]}>
      <sphereGeometry args={[60, 40, 24]} />
      <meshBasicMaterial map={texture} side={BackSide} fog={false} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}
