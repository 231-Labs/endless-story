/**
 * Public character tags — short on-chain labels that describe how strangers
 * would socially read a newly minted character.
 *
 * These are public identity/status labels, not private memories:
 *   - good: visible traits, training background, social style, literacy
 *   - bad: secret lineage, future achievements, relationship claims
 */

import type { BuildPromptResult } from './moderation.js';
import type { CharacterCandidate, RolledAttribute } from './character.js';

export interface BuildPublicTagsPromptOptions {
  candidate: CharacterCandidate;
  rolledValues: RolledAttribute[];
  recruitmentSpecialty?: string;
  recruitmentIntent?: string;
  fallbackTags?: string[];
}

export interface PublicTagsResult {
  tags: string[];
}

export function buildPublicTagsPrompt(opts: BuildPublicTagsPromptOptions): BuildPromptResult {
  const specialty = opts.recruitmentSpecialty?.trim() || '（未指定）';
  const intent = opts.recruitmentIntent?.trim() || '（未指定）';
  const rolledLine = opts.rolledValues.map((t) => `${t.label}=${t.value}`).join('，');
  const fallbackLine =
    opts.fallbackTags && opts.fallbackTags.length > 0
      ? opts.fallbackTags.join('、')
      : '（無）';

  const userText = `你是「無盡故事」的梨園檔案編修。角色剛透過 UI mint 入班，系統已經知道其行當、公開背景與擲出的能力值。

你的任務：替這個角色補 2-4 個「公開社會標籤」。這些標籤會寫上鏈，代表陌生人第一眼或聽聞名聲時，會怎麼把此人放進社會與梨園秩序裡。

【行當 / 職缺】
${specialty}

【徵召定位】
${intent}

【角色公開檔案】
姓名：${opts.candidate.name}
性別：${opts.candidate.physicalFacts.gender}
年齡：${opts.candidate.physicalFacts.age}
體態：${opts.candidate.physicalFacts.body}
描述：
"""
${opts.candidate.description}
"""

【已擲出的能力值】
${rolledLine}

【系統已推得的 fallback，可參考但不要照抄過量】
${fallbackLine}

標籤規則：
- 繁體中文，每個 2-6 字
- 只寫「外人可見 / 可傳聞」的社會觀感、身段、門路、聲名
- 不寫秘密身世、內心獨白、CP 關係、未來成就、絕對評價
- 不要輸出 role: 開頭的行當標籤；行當由系統另外補
- 不要標點、空格、冒號、斜線
- 可帶一點缺陷或危險感，但不要把人扁平成悲情設定

可用語感例子：麗質天生、台緣出眾、武場底子、筋骨清健、眉目機敏、心性沉著、性情難馴、摩登新派、文墨清通、交際伶俐、弓弦老到。

只輸出 JSON，不要任何前綴或解釋：
{"tags":["...","..."]}`;

  return {
    messages: [{ role: 'user', content: userText }],
    maxTokens: 360,
  };
}

export function parsePublicTags(text: string): PublicTagsResult | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(match[0]);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.tags)) return null;
  const tags = obj.tags
    .filter((v): v is string => typeof v === 'string')
    .map((v) => cleanSocialTag(v))
    .filter((v): v is string => Boolean(v));
  return { tags: Array.from(new Set(tags)).slice(0, 4) };
}

function cleanSocialTag(raw: string): string | null {
  const cleaned = raw
    .trim()
    .replace(/^#+/, '')
    .replace(/\s+/g, '')
    .replace(/[，、。；;：:|/\\()[\]{}"'`~!@#$%^&*_+=<>?？！,.-]/g, '');
  if (!cleaned) return null;
  if (cleaned.startsWith('role')) return null;
  if (cleaned.length < 2 || cleaned.length > 6) return null;
  return cleaned;
}
