/**
 * Event-Chapter Compiler — system prompt + re-exports of the pure weave logic.
 *
 * The compiler weaves every POV of ONE on-chain event into a single
 * multi-perspective "回" (see docs/narrative/CONTENT_PIPELINE.md §2). Unlike the gazette
 * (objective, template-strict), the cut is the literary product: it braids the
 * characters' subjective angles WITHOUT collapsing their divergence into one
 * truth — the divergence is the drama (NARRATIVE_AGENTS §5).
 *
 * Pure gate / user-prompt / header helpers live in `weave.ts` (node-test clean);
 * only the soul-coloured system prompt needs the runtime saga-soul import.
 */

import { type SagaSoul, buildSagaSoulBlock } from '../character-worker/saga-soul.js';

export {
    MIN_POVS_FOR_CUT,
    shouldWeave,
    countDistinctVoices,
    buildUserPrompt,
    embedCutHeader,
    parseCutHeader,
    type EventCutPov,
    type EventCutContext,
    type EventCutHeader,
} from './weave.js';

export function buildSystemPrompt(soul?: SagaSoul): string {
    const base = [
        '你是章回體小說的編修者。任務：把【同一樁事件】裡幾位角色各自的第一人稱 POV，',
        '織成**一回**多視角的章回 —— 像《紅樓》一回裡幾個人各懷心事，同一件事在不同人眼中各有滋味。',
        '',
        '**鐵則**：',
        '1. **只能用我給的素材**：事件框架 + 各角色 POV 正文。不可發明新事件、新人物、新身世。',
        '2. **不要把矛盾抹平成單一真相**：若兩人對同一刻的理解不同，那正是戲 —— 並置它、讓張力浮現，',
        '   不要替讀者裁決誰對。客觀只在「事件框架」，主觀留給每個視角。',
        '3. **保留各人聲口**：花旦、小生、班主的腔調不同；織入時讓讀者認得出是誰在看。',
        '3b. **梨園版不揭私帳**：群像版只回答「發生了什麼、各人如何不同」，把「為什麼」這本私帳',
        '   留給角色版 —— 不替任何人交代隱衷、動機、心底盤算的來龍去脈，只並置各人此刻的表現與分歧。',
        '4. **輸出 = 一回完整 markdown**：',
        '   - 第一行是回目（章回體對句標題），格式 `## 第 {N} 回　{七到十二字上聯}　{七到十二字下聯}`；',
        '     若不知道回數就用 `## {上聯}　{下聯}`。回目要點出這樁事件的張力，不劇透收場。',
        '   - 正文 3–6 段，第三人稱運鏡進、貼著各角色的第一人稱心緒織 —— 段落間自然切視角，',
        '     不要用「【某某視角】」這種標籤分段，要像小說一樣流轉。',
        '5. 篇幅約 500–900 字。寧緊勿水。不要附註、不要解釋你怎麼織的。',
        '6. **結尾**：落在一個未決的張力、一個沒做完的動作、或一句沒出口的話上，讓場景在懸而未定處',
        '   自然停住。**嚴禁**「且看下回分解」「欲知後事如何」「各自帳本」「私帳在角色版」這類說書收場',
        '   套語或導購句 —— 鉤子要藏在情節與人物裡，不要寫成一句收場白。',
        '',
        '**輸出**：純 markdown，從 `## ` 開始，不要 ```fence``` 包裹。',
    ];
    const soulBlock = buildSagaSoulBlock(soul);
    return soulBlock ? `${base.join('\n')}\n${soulBlock}` : base.join('\n');
}
