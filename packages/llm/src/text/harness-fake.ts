/**
 * DECOUPLED HARNESS — zero-network fake `TextClient` (test-only, ES_HARNESS=1).
 *
 * Returns plausible markdown WITHOUT any provider call, so the real runner / tick
 * loop can run end-to-end with no LLM network dependency. The point of the harness
 * is to study the runner's MECHANISM under an ideal (non-rate-limited) chain, so
 * the prose only needs to be the right SHAPE and LENGTH for downstream gates
 * (chapter length thresholds, "≥2 voices" cut gates, gazette anchoring) to behave
 * like production — it is deliberately not creative.
 *
 * Classification is coarse and prompt-content based:
 *   · plan      — short single line (planning step asks for a one-line goal).
 *   · pov       — one ~700–1000 字 chapter (the per-character POV worker).
 *   · cut       — a multi-POV woven 回 (event-chapter compile).
 *   · gazette   — the day's objective 公報.
 *   · decision  — a terse answer for cheap-kind callers (framing / propose / moderate).
 */

import type { ChatMessage, ChatRequest, ChatResponse, TextClient } from './types.js';

const LOREM_ZH = [
  '燈火在簾後晃了一晃，照得人影忽長忽短。',
  '他沒有立刻答話，只把手裡的東西又攥緊了些。',
  '外頭的雨還在下，檐角的水珠一顆顆墜進石階的舊痕裡。',
  '這話聽著平常，落在此刻卻像一根針，輕輕挑開了什麼。',
  '她抬眼看了過來，那目光裡有探究，也有一點不肯先讓的倔。',
  '空氣裡浮著一股舊木與冷茶的味道，是這屋子待久了才聞得出的底色。',
  '誰都明白爭的是什麼，可誰都先不肯把那兩個字說出口。',
  '一炷香的工夫過去，局面沒散，反倒把人心裡的算盤撥得更響了。',
];

function flatten(messages: ChatMessage[]): string {
  return messages
    .map((m) => (typeof m.content === 'string' ? m.content : m.content.map((p) => ('text' in p ? p.text : '')).join(' ')))
    .join('\n');
}

type Shape = 'plan' | 'pov' | 'cut' | 'gazette' | 'decision';

function classify(req: ChatRequest, system: string, body: string): Shape {
  const all = `${system}\n${body}`;
  // The cut compile hands MANY labelled POV bodies + asks for one woven 回.
  if (/合本|綜述|多視角|各視角|這一回|織|weave|回[：:]/.test(all) && req.maxTokens >= 1200) return 'cut';
  if (/公報|本日|今日要聞|說書人.*公報|gazette|邸報/.test(all)) return 'gazette';
  // Planning step asks for a short standing goal / one-line plan.
  if (/長期目標|standing goal|一句|一行|計畫|打算|目標.*一/.test(all) && req.maxTokens <= 600) return 'plan';
  // A creative-length single-character chapter.
  if (req.maxTokens >= 1200) return 'pov';
  return 'decision';
}

function paras(seed: number, count: number): string {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const a = LOREM_ZH[(seed + i) % LOREM_ZH.length];
    const b = LOREM_ZH[(seed + i + 3) % LOREM_ZH.length];
    const c = LOREM_ZH[(seed + i + 5) % LOREM_ZH.length];
    out.push(`${a}${b}${c}`);
  }
  return out.join('\n\n');
}

let seq = 0;

function generate(shape: Shape, body: string): string {
  const seed = (body.length + seq++) % LOREM_ZH.length;
  switch (shape) {
    case 'plan':
      // One short line — the plan step parses the first sentence as the goal.
      return '守住眼下這個位置，看準時機再爭那一步，不輕易把底牌亮出去。';
    case 'gazette':
      return [
        '## 本日公報',
        '',
        paras(seed, 2),
        '',
        '日內各場略有摩擦，未見大的傾覆；幾處舊怨仍在水面下湧動，待後話分解。',
      ].join('\n');
    case 'cut':
      // A woven multi-POV 回 — long enough to clear the cut length gate.
      return [
        '## 這一回',
        '',
        paras(seed, 4),
        '',
        '### 各人各心',
        '',
        paras(seed + 2, 3),
        '',
        '一局既了，輸的未必認輸，贏的也未必安穩，故事只是又翻過了一頁。',
      ].join('\n');
    case 'pov':
      // ~700–1000 字 single-character chapter (4–6 段) to match the real spec.
      return [paras(seed, 3), paras(seed + 4, 3)].join('\n\n');
    case 'decision':
    default:
      // Terse — cheap-kind callers (framing / moderation / propose) parse a short answer.
      return '爭一處搭檔的名分';
  }
}

export function makeHarnessTextClient(kind: 'primary' | 'cheap'): TextClient {
  const defaultModel = kind === 'cheap' ? 'harness-fake-cheap' : 'harness-fake-primary';
  return {
    provider: 'anthropic',
    defaultModel,
    async chat(req): Promise<ChatResponse> {
      const messages = req.messages ?? [];
      const system = req.system ?? '';
      const body = flatten(messages);
      const full: ChatRequest = { ...req, model: req.model ?? defaultModel };
      const shape = classify(full, system, body);
      const text = generate(shape, body);
      return {
        text,
        model: defaultModel,
        provider: 'anthropic',
        usage: { inputTokens: body.length, outputTokens: text.length },
      };
    },
  };
}
