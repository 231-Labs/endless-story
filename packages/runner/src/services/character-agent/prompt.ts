/**
 * Character Agent — DECIDE step prompt (N1).
 *
 * The character, in an event, chooses which card from their dealt hand to
 * play. The choice is conditioned on persona + role voice + RECALLED
 * MEMORIES — so a war-scarred reporter and a brash 武小生 dealt the same
 * hand play differently. This is the believable-agent core: memory →
 * choice, not RNG.
 */

import { roleHint } from '@endless-story/shared';

export interface HandCard {
    /** Index into the on-chain catalog (what submit_action takes). */
    catalogIndex: number;
    label: string;
    /** Coarse intent class (event.move taxonomy). */
    intent: string;
}

export interface DecideInput {
    name: string;
    role: string;
    physicalFacts: string;
    sagaName: string;
    /** Event the character is in. */
    eventTitle: string;
    eventSummary: string;
    /** The character's dealt hand (1+ cards to choose among). */
    hand: HandCard[];
    /** MemWal-recalled memories (three-factor) — the lever for "past shapes choice". */
    recalledMemories: string[];
    /** Director-seeded relationships (N3) — who she's tied to + how. Shapes
     *  who she protects, attacks, or hesitates against. */
    relationshipHints?: string[];
    /** Current plan (N6) — long-term goal + intent + subgoals. Makes the card
     *  serve her goal, not just react to the scene. */
    planHint?: string;
    /** Drama-engine tension (DR-6) — her dominant UNMET desire over a scarce,
     *  contested resource, derived deterministically from the on-chain ledger.
     *  Pushes the choice toward what she lacks + aches for, not just the scene. */
    dramaHint?: string;
}

export function buildSystemPrompt(): string {
    return [
        '你是一個戲園角色,此刻**身在一場戲(事件)裡**,要從手裡的牌選一張打出去 —— 這代表你這一刻的行動。',
        '',
        '**鐵則**:',
        '1. **用你的記憶與性格決定**,不是隨機。同樣的牌,有戰場創傷的人跟天不怕的人會打不同張。',
        '2. 你的**行當聲口 + 過往記憶**是選擇的依據:怕的人會避、倔的人會攻、心裡有結的人會在關鍵時刻僵住或失常。',
        '3. 只能從「你的手牌」裡選,不能發明手牌沒有的動作。',
        '4. `intent` 用第一人稱、≤40 字,寫出你**為什麼**這樣做(讓記憶/性格的影子透出來),不要只複述牌名。',
        '',
        '**輸出**:嚴格只輸出一個 JSON 物件,例如',
        '`{"catalogIndex": 2, "intent": "我退後半步,手按住袖中舊傷 —— 這種場面我見得太多了", "reason": "受戰場記憶影響,避戰"}`',
        '不要 markdown、不要多餘文字。catalogIndex 必須是手牌列出的其中一個。',
    ].join('\n');
}

export function buildUserPrompt(input: DecideInput): string {
    const memBlock =
        input.recalledMemories.length > 0
            ? '\n## 你心底翻起的記憶(讓它們影響你的選擇)\n' +
              input.recalledMemories.map((m, i) => `${i + 1}. ${m.slice(0, 160)}`).join('\n')
            : '\n## 你心底翻起的記憶\n（此刻沒有特別浮現的記憶）';
    const relBlock =
        input.relationshipHints && input.relationshipHints.length > 0
            ? '\n## 你與在場人的牽絆(影響你護誰、攻誰、對誰猶豫)\n' +
              input.relationshipHints.map((r) => `- ${r}`).join('\n')
            : '';
    const planBlock = input.planHint
        ? `\n## 你心裡的目標與打算(讓這張牌為你的目標服務)\n${input.planHint}`
        : '';
    const dramaBlock = input.dramaHint
        ? `\n## 你此刻的渴與不甘(稀缺之物落在誰手裡 —— 讓這份張力推著你出牌)\n${input.dramaHint}`
        : '';
    const handBlock = input.hand
        .map((c) => `- catalogIndex=${c.catalogIndex} · 「${c.label}」(${c.intent})`)
        .join('\n');
    return [
        `# 你是誰`,
        `- 姓名:${input.name}`,
        `- 行當:${input.role}`,
        `- 行當聲口:${roleHint(input.role)}`,
        `- 外形:${input.physicalFacts}`,
        `- 所屬:${input.sagaName}`,
        memBlock,
        relBlock,
        planBlock,
        dramaBlock,
        '',
        `## 此刻這場戲`,
        `《${input.eventTitle}》— ${input.eventSummary}`,
        '',
        `## 你的手牌(只能選其一)`,
        handBlock,
        '',
        '請輸出你要打的牌(JSON)。',
    ].join('\n');
}
