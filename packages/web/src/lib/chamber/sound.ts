'use client';

/**
 * 古琴 pluck — synthesised with Karplus-Strong (no audio asset needed), so the
 * chamber can ring a soft harmonic on reveal / regeneration. Browsers gate
 * AudioContext behind a user gesture: call `unlockAudio()` from a pointer/click
 * handler first; `playPluck` silently no-ops until unlocked.
 */

let ctx: AudioContext | null = null;
let unlocked = false;

export function unlockAudio(): void {
  if (typeof window === 'undefined') return;
  try {
    ctx = ctx ?? new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    unlocked = true;
  } catch {
    // no audio — fine
  }
}

export function audioUnlocked(): boolean {
  return unlocked && !!ctx && ctx.state === 'running';
}

/** One plucked-string note (Karplus-Strong), freq in Hz. */
export function playPluck(freq = 220, gainLevel = 0.12, delaySec = 0): void {
  if (!audioUnlocked() || !ctx) return;
  try {
    const sr = ctx.sampleRate;
    const dur = 2.2;
    const buf = ctx.createBuffer(1, Math.floor(sr * dur), sr);
    const data = buf.getChannelData(0);
    const N = Math.max(2, Math.round(sr / freq));
    const ring = new Float32Array(N);
    for (let i = 0; i < N; i++) ring[i] = Math.random() * 2 - 1;
    let idx = 0;
    for (let i = 0; i < data.length; i++) {
      const next = (idx + 1) % N;
      ring[idx] = (ring[idx] + ring[next]) * 0.4985; // string decay
      data[i] = ring[idx];
      idx = next;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.value = gainLevel;
    src.connect(gain).connect(ctx.destination);
    src.start(ctx.currentTime + delaySec);
  } catch {
    // never let audio break the page
  }
}

/** 泛音二聲 — a gentle two-note motif for "the painting is ready". */
export function playRevealMotif(): void {
  playPluck(196.0, 0.11, 0); // G3
  playPluck(293.7, 0.09, 0.28); // D4 (fifth above)
}
