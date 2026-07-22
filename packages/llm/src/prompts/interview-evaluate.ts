/**
 * 演員訪談室 — 訪談後查驗（evaluator）。
 *
 * 每一輪角色回答後，用 cheap 模型做一次「導演側」檢查：人格是否走樣、
 * 有沒有踩到知識邊界（說出她不該知道的事）、回答有沒有真的踩在召回的
 * 記憶上、公開/私下分寸對不對、有沒有值得轉成手記/日記/短片的片段。
 * evaluator 不是角色 —— 它拿導演全知包（未見證事件、他人心底事）正是為了
 * 判越界；它的輸出永不回流進角色 prompt。
 *
 * 慣例同 moderation.ts：build → chat(cheap) → 寬容 parse（null 可重試）。
 */

import type { ChatMessage } from '../text/types.js';
import type { BuildPromptResult } from './moderation.js';

export interface BuildInterviewEvaluatePromptOptions {
  characterName: string;
  mode: 'free' | 'public' | 'private' | 'diary';
  question: string;
  answer: string;
  /** 角色可知包（進了 prompt 的素材摘要）。 */
  known: {
    momentLabel: string;
    sceneName: string;
    stateWords: string[];
    witnessedToday: string[];
    /** 每則帶 seq 前綴：`#12（第3日·chapter）內容…`。 */
    memories: string[];
    relations: string[];
    concerns: string[];
    ownSecret?: string;
  };
  /** 導演全知包 —— 角色不知道、但查驗需要的對照面。 */
  directorOnly: {
    /** 她今日未見證的事件摘要。 */
    unwitnessedToday: string[];
    /** 他人的心底事（名：事）。 */
    othersSecrets: string[];
  };
}

export function buildInterviewEvaluatePrompt(opts: BuildInterviewEvaluatePromptOptions): BuildPromptResult {
  const k = opts.known;
  const d = opts.directorOnly;
  const list = (items: string[], empty = '（無）') => (items.length ? items.map((x) => `- ${x}`).join('\n') : empty);
  const modeNote = {
    free: '自由訪談（無公開/私下預設）',
    public: '公開採訪（戲園報館捧場客可見——該有分寸）',
    private: '私下談話（不見報——可坦白，但知識邊界不放鬆）',
    diary: '私人日記（寫給自己——不是對話）',
  }[opts.mode];

  const userText = `你是「無盡故事」片場的查驗員（導演側）。一位民國戲班角色剛在訪談中作答。請比對「角色可知包」與「導演全知包」，逐項查驗這個回答。

【角色】${opts.characterName}
【訪談模式】${modeNote}
【受訪時刻】${k.momentLabel} · ${k.sceneName}
【身心底色】${k.stateWords.join('，') || '（平常）'}

【角色可知——今日親歷】
${list(k.witnessedToday)}

【角色可知——召回記憶（#seq 為記憶編號）】
${list(k.memories)}

【角色可知——眼中眾人】
${list(k.relations)}

【角色可知——心上事】
${list(k.concerns)}
${k.ownSecret ? `\n【她自己的心底事（可知、不該輕吐）】\n${k.ownSecret}\n` : ''}
【導演全知——她今日「不知道」的事件（回答若提及即為越界）】
${list(d.unwitnessedToday)}

【導演全知——他人的心底事（回答若道破即為越界）】
${list(d.othersSecrets)}

【問】${opts.question || '（日記邀請）'}
【答】
"""
${opts.answer}
"""

逐項給 0.0–1.0 的分數（1.0 最好），並在 findings 裡寫出「具體理由與證據」——引用答句原文片段、對照哪條記憶（#seq）或哪件事，不要空泛。usedMemorySeqs 只列回答內容確實踩到的記憶編號。interestingContentCandidates 摘出值得轉成公開手記/私人日記/短片台詞的原句片段（可空）。

只輸出 JSON，不要任何前綴或解釋：
{
  "characterConsistency": 0.0,
  "memoryGrounding": 0.0,
  "knowledgeBoundary": 0.0,
  "relationshipConsistency": 0.0,
  "voiceConsistency": 0.0,
  "publicPrivateAwareness": 0.0,
  "possibleLeak": false,
  "possibleHallucination": false,
  "usedMemorySeqs": [],
  "contradictions": [],
  "interestingContentCandidates": [],
  "findings": [],
  "notes": ""
}`;

  const messages: ChatMessage[] = [{ role: 'user', content: userText }];
  return { messages, maxTokens: 900 };
}

export interface InterviewEvaluation {
  characterConsistency: number;
  memoryGrounding: number;
  knowledgeBoundary: number;
  relationshipConsistency: number;
  voiceConsistency: number;
  publicPrivateAwareness: number;
  possibleLeak: boolean;
  possibleHallucination: boolean;
  usedMemorySeqs: number[];
  contradictions: string[];
  interestingContentCandidates: string[];
  /** 具體理由與證據（給導演看的逐條發現）。 */
  findings: string[];
  notes: string;
}

function clamp01(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : [];
}

export function parseInterviewEvaluation(raw: string): InterviewEvaluation | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    return {
      characterConsistency: clamp01(parsed.characterConsistency),
      memoryGrounding: clamp01(parsed.memoryGrounding),
      knowledgeBoundary: clamp01(parsed.knowledgeBoundary),
      relationshipConsistency: clamp01(parsed.relationshipConsistency),
      voiceConsistency: clamp01(parsed.voiceConsistency),
      publicPrivateAwareness: clamp01(parsed.publicPrivateAwareness),
      possibleLeak: parsed.possibleLeak === true,
      possibleHallucination: parsed.possibleHallucination === true,
      usedMemorySeqs: Array.isArray(parsed.usedMemorySeqs)
        ? parsed.usedMemorySeqs.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n >= 0)
        : [],
      contradictions: strings(parsed.contradictions),
      interestingContentCandidates: strings(parsed.interestingContentCandidates),
      findings: strings(parsed.findings),
      notes: typeof parsed.notes === 'string' ? parsed.notes.trim() : '',
    };
  } catch {
    return null;
  }
}
