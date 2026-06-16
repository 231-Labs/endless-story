/**
 * The 琴師's craft — DETERMINISTIC, not LLM. A composer picks a 板式 by the
 * scene's mood and emits a real, human-playable SCORE: a 简谱 line + note list
 * + articulation, plus a Standard MIDI File. The artifact is a composition you
 * can read and play (guitar, erhu, anything) — audio synthesis is just one
 * optional renderer of it, never the source of truth.
 *
 * No Math.random (runs must be reproducible); variation is seeded off the
 * composer's id + skill.
 */

import type { Mood, NoteEvent, Score } from './types.ts';

// 简谱 octave marks (combining dots): low = below, high = above.
const LOW = '̣';
const HIGH = '̇';

// 简谱 degree (1..7) -> semitones above the tonic "1" (do).
const SEMI: Record<number, number> = { 1: 0, 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 11 };

interface Tone {
  deg: number;
  /** octave relative to mid: -1 low, 0 mid, +1 high. */
  oct: number;
  beats: number;
  tech?: string;
}

interface Banshi {
  banshi: string;
  mode: string;
  keyForPlayer: string;
  tempoBpm: number;
  /** MIDI pitch of 简谱 "1" (do). 60 = C4. */
  tonicMidi: number;
  phrase: Tone[];
}

/**
 * A tiny 板式 library keyed by dramatic mood. These are illustrative skeletons
 * (real 京劇 has dozens of 板式 × 行當 register), but each is a singable,
 * playable pentatonic phrase in an idiomatic mode.
 */
const BANSHI: Record<Mood, Banshi> = {
  // 反二黃 — the canonical 悲涼/哀傷 板式 (《李陵碑》《哭靈牌》). 羽調式, lands on 6.
  sorrow: {
    banshi: '二黃·反調 慢板（反二黃）',
    mode: '羽調式（la 為主音，聽感如小調）',
    keyForPlayer: '1=C → 主音落 6(la=A)，吉他當 Am 彈',
    tempoBpm: 48,
    tonicMidi: 60,
    phrase: [
      { deg: 6, oct: -1, beats: 1 }, { deg: 1, oct: 0, beats: 1 }, { deg: 2, oct: 0, beats: 2 },
      { deg: 3, oct: 0, beats: 1, tech: '下滑音 ↘' }, { deg: 2, oct: 0, beats: 1 }, { deg: 1, oct: 0, beats: 1 }, { deg: 6, oct: -1, beats: 1, tech: '揉弦 ~' },
      { deg: 5, oct: -1, beats: 1 }, { deg: 6, oct: -1, beats: 1 }, { deg: 1, oct: 0, beats: 1 }, { deg: 6, oct: -1, beats: 1 },
      { deg: 5, oct: -1, beats: 4, tech: '回滑收尾 微顫' },
    ],
  },
  // 反二黃 slow, more wistful — 思念.
  longing: {
    banshi: '二黃 慢板',
    mode: '商調式（re 為主音）',
    keyForPlayer: '1=G，吉他可capo對應 Em 感',
    tempoBpm: 54,
    tonicMidi: 67,
    phrase: [
      { deg: 2, oct: 0, beats: 2 }, { deg: 3, oct: 0, beats: 1 }, { deg: 5, oct: 0, beats: 1 },
      { deg: 6, oct: 0, beats: 2, tech: '揉弦 ~' }, { deg: 5, oct: 0, beats: 1 }, { deg: 3, oct: 0, beats: 1 },
      { deg: 2, oct: 0, beats: 1 }, { deg: 1, oct: 0, beats: 1 }, { deg: 2, oct: 0, beats: 2, tech: '收 微滑' },
    ],
  },
  // 西皮 流水/快板 — agitation / urgency.
  tense: {
    banshi: '西皮 流水',
    mode: '宮調式（do 為主音）',
    keyForPlayer: '1=D，吉他當 D 調快板',
    tempoBpm: 138,
    tonicMidi: 62,
    phrase: [
      { deg: 5, oct: 0, beats: 0.5 }, { deg: 6, oct: 0, beats: 0.5 }, { deg: 1, oct: 1, beats: 0.5 }, { deg: 6, oct: 0, beats: 0.5 },
      { deg: 5, oct: 0, beats: 0.5 }, { deg: 3, oct: 0, beats: 0.5 }, { deg: 5, oct: 0, beats: 1, tech: '頓弓' },
      { deg: 2, oct: 0, beats: 0.5 }, { deg: 1, oct: 0, beats: 0.5 }, { deg: 2, oct: 0, beats: 0.5 }, { deg: 3, oct: 0, beats: 0.5 }, { deg: 5, oct: 0, beats: 1 },
    ],
  },
  wrath: {
    banshi: '西皮 導板/快板',
    mode: '宮調式（do 為主音）',
    keyForPlayer: '1=D，剛勁高亢',
    tempoBpm: 152,
    tonicMidi: 62,
    phrase: [
      { deg: 1, oct: 1, beats: 1, tech: '炸音 重起' }, { deg: 6, oct: 0, beats: 0.5 }, { deg: 5, oct: 0, beats: 0.5 },
      { deg: 3, oct: 0, beats: 1 }, { deg: 5, oct: 0, beats: 0.5 }, { deg: 6, oct: 0, beats: 0.5 }, { deg: 1, oct: 1, beats: 1, tech: '挑弓' },
    ],
  },
  // 西皮 原板 — bright, settled.
  joy: {
    banshi: '西皮 原板',
    mode: '宮調式（do 為主音）',
    keyForPlayer: '1=D，明亮平穩',
    tempoBpm: 84,
    tonicMidi: 62,
    phrase: [
      { deg: 1, oct: 0, beats: 1 }, { deg: 2, oct: 0, beats: 1 }, { deg: 3, oct: 0, beats: 1 }, { deg: 5, oct: 0, beats: 1 },
      { deg: 6, oct: 0, beats: 2, tech: '小滑' }, { deg: 5, oct: 0, beats: 1 }, { deg: 3, oct: 0, beats: 1 },
    ],
  },
  serene: {
    banshi: '二黃 原板',
    mode: '徵調式（sol 為主音）',
    keyForPlayer: '1=C，舒緩',
    tempoBpm: 66,
    tonicMidi: 60,
    phrase: [
      { deg: 5, oct: 0, beats: 2 }, { deg: 6, oct: 0, beats: 1 }, { deg: 5, oct: 0, beats: 1 },
      { deg: 3, oct: 0, beats: 1 }, { deg: 2, oct: 0, beats: 1 }, { deg: 1, oct: 0, beats: 2, tech: '收' },
    ],
  },
};

function simpleHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function toneToJianpu(t: Tone): string {
  const mark = t.oct < 0 ? LOW : t.oct > 0 ? HIGH : '';
  const head = String(t.deg) + mark;
  // sustain shown as trailing dashes (one per extra beat).
  const extra = Math.max(0, Math.round(t.beats) - 1);
  return head + ' —'.repeat(extra);
}

/**
 * Compose a score for a scene. Deterministic: the 板式 comes from the mood; a
 * high-唱腔/作曲 composer earns a 拖腔 tail (extra ornament), seeded off id so
 * two composers phrase the same mood a little differently.
 */
export function compose(args: {
  sceneId: string;
  sceneTitle: string;
  mood: Mood;
  composerId: string;
  composerName: string;
  composerSkill: number;
}): Score {
  const tpl = BANSHI[args.mood];
  const tones: Tone[] = [...tpl.phrase];

  // 拖腔: a skilled composer extends the cadence with an ornamental tail.
  if (args.composerSkill >= 75) {
    const seed = simpleHash(args.composerId + args.sceneId);
    const last = tones[tones.length - 1];
    const neighbour = (seed % 2 === 0 ? -1 : 1);
    const ornamentDeg = Math.min(7, Math.max(1, last.deg + neighbour));
    tones.splice(tones.length - 1, 0, { deg: ornamentDeg, oct: last.oct, beats: 1, tech: '拖腔 加花' });
  }

  const notes: NoteEvent[] = tones.map((t) => ({
    degree: String(t.deg) + (t.oct < 0 ? LOW : t.oct > 0 ? HIGH : ''),
    midi: tpl.tonicMidi + SEMI[t.deg] + 12 * t.oct,
    beats: t.beats,
  }));

  const jianpu = tones.map(toneToJianpu).join('  ');
  const articulation = tones
    .filter((t) => t.tech)
    .map((t) => ({ at: String(t.deg) + (t.oct < 0 ? LOW : t.oct > 0 ? HIGH : ''), tech: t.tech! }));

  return {
    forSceneId: args.sceneId,
    title: `${args.sceneTitle}·過門`,
    banshi: tpl.banshi,
    mode: tpl.mode,
    keyForPlayer: tpl.keyForPlayer,
    tempoBpm: tpl.tempoBpm,
    jianpu,
    notes,
    articulation,
    composerId: args.composerId,
    composerName: args.composerName,
  };
}

// ── Standard MIDI File (format 0) writer — zero deps ──────────────
function vlq(n: number): number[] {
  const out = [n & 0x7f];
  let v = n >> 7;
  while (v > 0) {
    out.unshift((v & 0x7f) | 0x80);
    v >>= 7;
  }
  return out;
}
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const be16 = (n: number) => [(n >>> 8) & 255, n & 255];

/**
 * Render a score's note list to a .mid byte array. GM program 110 = "Fiddle",
 * the closest General-MIDI patch to a 胡琴 (and an honest stand-in — a real
 * sampled 京胡 library is the production-grade renderer).
 */
export function scoreToMidi(score: Score): Uint8Array {
  const TPQ = 480;
  const track: number[] = [];
  const usPerQuarter = Math.round(60_000_000 / score.tempoBpm);
  track.push(0x00, 0xff, 0x51, 0x03, (usPerQuarter >>> 16) & 255, (usPerQuarter >>> 8) & 255, usPerQuarter & 255);
  track.push(0x00, 0xc0, 110); // program change → Fiddle
  for (const n of score.notes) {
    const dur = Math.max(1, Math.round(n.beats * TPQ));
    track.push(0x00, 0x90, n.midi & 127, 84); // note on
    track.push(...vlq(dur), 0x80, n.midi & 127, 0); // note off
  }
  track.push(0x00, 0xff, 0x2f, 0x00); // end of track
  const trackChunk = [0x4d, 0x54, 0x72, 0x6b, ...be32(track.length), ...track];
  const header = [0x4d, 0x54, 0x68, 0x64, ...be32(6), ...be16(0), ...be16(1), ...be16(TPQ)];
  return Uint8Array.from([...header, ...trackChunk]);
}
