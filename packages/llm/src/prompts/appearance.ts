/**
 * Appearance distillation prompt — turns a character's public profile into a
 * rich 形貌 description (face / build / bearing / distinguishing marks): the
 * prose caption for their anchor portrait. Web-action level prompt (mirrors
 * persona/character), fed to `TextClient.chat`; `parseAppearanceResponse`
 * decodes the JSON output.
 *
 * The on-chain `physical_facts` only carries gender/age/body(enum) — this fills
 * the gap with a vivid, on-register paragraph that reads alongside the 形貌
 * images. Re-distillable on portrait evolution (the look changes over time).
 */
import type { BuildPromptResult } from './moderation.js';

export interface BuildAppearancePromptOptions {
  name: string;
  role: string;
  gender: string;
  ageYears: number;
  /** on-chain body word (瘦削/豐潤/粗壯/孱弱/勻稱) or a richer string. */
  physicalFacts: string;
  description: string;
  /** on-chain 外貌 trait 0-100, if known — steers how striking the face reads. */
  appearance?: number;
}

export interface DistilledAppearance {
  description: string;
}

const SYSTEM = `你是「無盡故事」說書平台的角色形貌畫師。給你一個戲曲角色的公開設定，寫一段「卸了戲妝、台下素顏」的形貌描述 — 讓讀者在腦中看見這個人。

要點：
- 寫**面容、身形、辨識特徵（痣／疤／手勢習慣／常服）、台下氣質**，2~4 句，凝練不堆砌。
- 必須與「性別・年齡・體態・外貌值」一致：體態詞（瘦削/豐潤/粗壯/孱弱/勻稱）要寫進去；外貌值高就讓人記得住、低則清淡，不要把每個人都寫成美人。
- 民國上海梨園的語感；**素顏**，不寫戲妝/頭面/水袖/油彩（那是上了戲才有）。
- 用這個角色自己的氣質寫，避免「眉清目秀」「英俊瀟灑」這類通用空話。
- 只輸出 JSON，不要任何解釋或 markdown。`;

export function buildAppearancePrompt(opts: BuildAppearancePromptOptions): BuildPromptResult {
  const lookHint =
    typeof opts.appearance === 'number'
      ? opts.appearance >= 80
        ? '（外貌值偏高：讓人一眼記住的臉）'
        : opts.appearance <= 30
          ? '（外貌值偏低：眉眼清淡、不搶眼）'
          : ''
      : '';
  const user = `角色設定：
名：${opts.name}
行當：${opts.role}
性別：${opts.gender}・年齡：${opts.ageYears}
體態：${opts.physicalFacts}${lookHint}
敘述：${opts.description}

輸出 JSON，嚴格格式：
{"description":"…（2~4 句形貌）"}`;
  return {
    system: SYSTEM,
    messages: [{ role: 'user', content: user }],
    maxTokens: 600,
  };
}

/** Parse the model's JSON (tolerant of ```json fences / surrounding prose). null if malformed. */
export function parseAppearanceResponse(text: string): DistilledAppearance | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const obj = JSON.parse(text.slice(start, end + 1)) as Partial<DistilledAppearance>;
    const description = typeof obj.description === 'string' ? obj.description.trim() : '';
    if (!description) return null;
    return { description };
  } catch {
    return null;
  }
}
