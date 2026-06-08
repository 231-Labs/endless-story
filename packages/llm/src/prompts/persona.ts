/**
 * Persona distillation prompt — turns a character's public profile into the structural
 * "who they are off-stage": axes / mannerisms / boundaries. Web-action level
 * prompt (mirrors moderation/character), fed to `TextClient.chat`; `parsePersonaResponse`
 * decodes the JSON output.
 */
import type { BuildPromptResult } from './moderation.js';

export interface BuildPersonaPromptOptions {
  name: string;
  role: string;
  gender: string;
  ageYears: number;
  physicalFacts: string;
  description: string;
  /** optional: the character's first few genesis memories, for richer distillation. */
  genesisMemories?: string[];
}

export interface DistilledPersona {
  axes: string[];
  mannerisms: string[];
  boundaries: string[];
}

const SYSTEM = `你是「無盡故事」說書平台的角色心理蒸餾師。給你一個戲曲角色的公開設定，蒸餾出他「卸了妝、出了戲以後」不會丟掉的結構性本色，分三類：
- axes(軸)：不變的傾向、底層動機。
- mannerisms(腔)：辨識他的方式 — 說話與行事的調。
- boundaries(界)：不肯退的線 — 碰了會炸的點。
每類給 2~4 個凝練的短語(不是整段)，用這個角色自己的氣質寫，避免通用形容詞。只輸出 JSON，不要任何解釋或 markdown。`;

export function buildPersonaPrompt(opts: BuildPersonaPromptOptions): BuildPromptResult {
  const mem =
    opts.genesisMemories && opts.genesisMemories.length
      ? `\n他最初的幾段記憶：\n${opts.genesisMemories.map((m) => `- ${m}`).join('\n')}\n`
      : '';
  const user = `角色設定：
名：${opts.name}
行當：${opts.role}
性別：${opts.gender}・年齡：${opts.ageYears}
外貌：${opts.physicalFacts}
敘述：${opts.description}
${mem}
輸出 JSON，嚴格格式：
{"axes":["…","…"],"mannerisms":["…","…"],"boundaries":["…","…"]}`;
  return {
    system: SYSTEM,
    messages: [{ role: 'user', content: user }],
    maxTokens: 900,
  };
}

/** Parse the model's JSON (tolerant of ```json fences / surrounding prose). null if malformed. */
export function parsePersonaResponse(text: string): DistilledPersona | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const obj = JSON.parse(text.slice(start, end + 1)) as Partial<DistilledPersona>;
    const arr = (v: unknown): string[] =>
      Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean).slice(0, 4) : [];
    const axes = arr(obj.axes);
    const mannerisms = arr(obj.mannerisms);
    const boundaries = arr(obj.boundaries);
    if (!axes.length && !mannerisms.length && !boundaries.length) return null;
    return { axes, mannerisms, boundaries };
  } catch {
    return null;
  }
}
