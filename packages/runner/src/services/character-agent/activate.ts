/**
 * ACTIVATE — wake a dormant character into a full one, mint-style.
 *
 * materialize seeds a dormant entity from a mention (a 代稱 + inferred身份 + the creator's
 * seed memories, e.g. 春雪社 wrote「李老闆 偷偷傾慕班主田巧雲」). When it's sold and the buyer
 * picks a home saga (say 碼頭商會), this activates it: gives a proper 有名有姓 real name,
 * fleshes it into a living person OF that saga (身份/性子/模樣 + a life of memories), and
 * crucially **keeps and continues the creator's seed memories** — those are the character's
 * root. So 李老闆 becomes 碼頭商會 的米糧商 yet still碰著那點對田巧雲的念想 — and that念想 is
 * a CROSS-SAGA relationship edge (李@碼頭商會 → 田@春雪社). Memory is the root; it doesn't
 * break across sagas.
 *
 * Pure LLM. The dormant stub + seed memories + home saga come from the caller (later: the
 * sale/escrow flow). Returns the activated character; the 鏈上 mint writes the real name.
 */

import { text as llmText } from '@endless-story/llm';
import type { DormantEntity } from './materialize.js';

export interface ActivateInput {
    /** The dormant stub from materialize (代稱 + inferred身份). */
    dormant: DormantEntity;
    /** Memories the creator wrote in (春雪社視角:愛看戲、傾慕班主…) — the root, must survive. */
    seedMemories: string[];
    /** The home saga the buyer assigns it to. */
    homeSaga: {
        name: string;
        /** what kind of world this saga is — so the character grows INTO it. */
        nature: string;
    };
}

export interface ActivatedCharacter {
    /** Proper 有名有姓 name (the 代稱 is replaced; 鏈上 mint records this). */
    realName: string;
    /** Role within the home saga. */
    role: string;
    /** Distilled本色/性子. */
    persona: string;
    /** Plain physical description. */
    physicalFacts: string;
    /** A life of memories — childhood / 家世 / 營生 / 癖好 — that INCLUDES and continues the seeds. */
    memories: string[];
}

export function buildSystemPrompt(): string {
    return [
        '一個休眠的角色要被激活、託管進一個 saga 開始活動了。你的任務:給他一個**有名有姓的真名**，',
        '把他豐厚成一個活生生的人——他在這個 saga 裡的身份、性子、模樣，以及一串他此生的記憶。',
        '',
        '**鐵則**:',
        '1. **取真名**:他原本只有個代稱，現在給他正經的姓名(姓+名，像那個世界的人會有的名字，不要再叫「某老闆」「某老闆娘」)。',
        '2. **接住既有的根**:他被創建時就有的身份與記憶(下方「既有的根」)，**必須保留、延續、不可矛盾、不可洗掉**——',
        '   尤其那些念想與牽掛(例如他心裡惦記著的某個人)，激活後依舊在，只是長進了新的人生裡。那是他的根。',
        '3. **長進新 saga**:在這個 saga(見其性質)裡，他是誰、做什麼營生、什麼性子、什麼模樣。',
        '   寫一串他此生的記憶(童年/家世/營生/癖好/牽掛)，其中**自然包含並延續**「既有的根」裡那些念想。',
        '4. 第一人稱不要，客觀的角色檔口吻；不要現代詞。',
        '',
        '**輸出**:嚴格只一個 JSON 物件:',
        '`{"realName":"李茂松","role":"碼頭商會的米糧商","persona":"...","physicalFacts":"...","memories":["...","...心裡始終擱著春雪社那位田班主..."]}`',
        '`memories` 給 4–6 條，其中至少一條是延續「既有的根」的念想。不要 markdown、不要多餘文字。',
    ].join('\n');
}

export function buildUserPrompt(input: ActivateInput): string {
    const stub = input.dormant;
    const idLine = stub.kind === 'scene' ? `（地點，不該走這條激活）` : `身份雛形:${stub.role ?? '（未定）'}`;
    return [
        `# 休眠角色`,
        `- 代稱:「${stub.name}」`,
        `- ${idLine}`,
        stub.brief ? `- 小傳:${stub.brief}` : '',
        stub.relation ? `- 被創建時的關係:${stub.relation}` : '',
        `\n# 既有的根（創建者寫進去的記憶，激活後必須保留並延續）`,
        input.seedMemories.map((m, i) => `${i + 1}. ${m}`).join('\n'),
        `\n# 託管進的 saga`,
        `- 名稱:${input.homeSaga.name}`,
        `- 性質:${input.homeSaga.nature}`,
        '',
        '請把他激活成這個 saga 裡一個有名有姓、活生生的人(JSON)。',
    ]
        .filter((s) => s !== '')
        .join('\n');
}

function parseActivated(raw: string, fallbackName: string): ActivatedCharacter | null {
    const blocks = raw.match(/\{[\s\S]*?\}(?=[^}]*$)/g) ?? raw.match(/\{[\s\S]*\}/g);
    if (!blocks?.length) return null;
    for (let i = blocks.length - 1; i >= 0; i--) {
        try {
            const o = JSON.parse(blocks[i]) as Record<string, unknown>;
            const realName = typeof o.realName === 'string' && o.realName.trim() ? o.realName.trim() : '';
            if (!realName) continue;
            const str = (v: unknown, n = 220) =>
                typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : '';
            const memories = Array.isArray(o.memories)
                ? o.memories.filter((m): m is string => typeof m === 'string' && m.trim().length > 0).map((m) => m.trim().slice(0, 220)).slice(0, 8)
                : [];
            return {
                realName: realName.slice(0, 24),
                role: str(o.role, 60),
                persona: str(o.persona),
                physicalFacts: str(o.physicalFacts),
                memories,
            };
        } catch {
            /* try an earlier block */
        }
    }
    return null;
}

/** Wake a dormant character into a full one. No-throw: on miss, returns a thin activation
 *  carrying the seed memories forward so the root is never lost. */
export async function activateDormant(
    input: ActivateInput,
    opts?: { model?: string },
): Promise<ActivatedCharacter> {
    try {
        const llm = llmText.createTextClient({ kind: 'cheap' });
        const res = await llm.chat({
            model: opts?.model ?? llm.defaultModel,
            system: buildSystemPrompt(),
            messages: [{ role: 'user', content: buildUserPrompt(input) }],
            maxTokens: 700,
            temperature: 0.8,
        });
        return (
            parseActivated(res.text, input.dormant.name) ?? {
                realName: input.dormant.name.slice(0, 24),
                role: input.dormant.role ?? input.homeSaga.name,
                persona: input.dormant.brief ?? '',
                physicalFacts: '',
                memories: [...input.seedMemories],
            }
        );
    } catch {
        return {
            realName: input.dormant.name.slice(0, 24),
            role: input.dormant.role ?? input.homeSaga.name,
            persona: input.dormant.brief ?? '',
            physicalFacts: '',
            memories: [...input.seedMemories],
        };
    }
}
