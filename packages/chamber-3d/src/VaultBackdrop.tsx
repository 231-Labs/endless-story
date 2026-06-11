'use client';

import { useMemo } from 'react';
import { BackSide, CanvasTexture, SRGBColorSpace } from 'three';

/**
 * 藏閣穹頂 — the vault is made of darkness and light, not architecture:
 * a near-black ink dome with a faint cold horizon glow and sparse dust.
 * Collected pieces (each in its own light) read as a constellation against it.
 */
function paintVault(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const g = c.getContext('2d')!;

  const grad = g.createLinearGradient(0, 0, 0, c.height);
  grad.addColorStop(0, '#04050a');
  grad.addColorStop(0.55, '#0a0d14');
  grad.addColorStop(0.82, '#141a24');
  grad.addColorStop(1, '#0c1018');
  g.fillStyle = grad;
  g.fillRect(0, 0, c.width, c.height);

  // faint cold horizon band
  const band = g.createLinearGradient(0, c.height * 0.72, 0, c.height * 0.95);
  band.addColorStop(0, 'rgba(70,92,112,0)');
  band.addColorStop(0.5, 'rgba(70,92,112,0.22)');
  band.addColorStop(1, 'rgba(70,92,112,0)');
  g.fillStyle = band;
  g.fillRect(0, c.height * 0.72, c.width, c.height * 0.23);

  // sparse dust
  g.fillStyle = 'rgba(220,228,236,0.7)';
  for (let i = 0; i < 90; i++) {
    const x = (i * 9277) % c.width;
    const y = (i * 6151) % Math.floor(c.height * 0.6);
    g.globalAlpha = 0.12 + ((i * 7) % 6) / 24;
    g.beginPath();
    g.arc(x, y, ((i * 13) % 8) / 10 + 0.2, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;

  return c;
}

export function VaultBackdrop() {
  const texture = useMemo(() => {
    const tex = new CanvasTexture(paintVault());
    tex.colorSpace = SRGBColorSpace;
    return tex;
  }, []);

  return (
    <mesh scale={[-1, 1, 1]}>
      <sphereGeometry args={[60, 40, 24]} />
      <meshBasicMaterial map={texture} side={BackSide} fog={false} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}
