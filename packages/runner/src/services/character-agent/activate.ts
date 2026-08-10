/**
 * ACTIVATE — wake a dormant entity into a full character of its buyer-chosen home saga.
 * Invariant: the creator's seed memories must survive and continue; they are the root
 * and carry cross-saga relationship edges. Pure LLM; the on-chain mint writes the name.
 */

import { text as llmText } from '@endless-story/llm';
import type { DormantEntity } from './materialize.js';
import { extractJsonLoose, wasTruncated } from '../../infra/json-loose.ts';

export interface ActivateInput {
    dormant: DormantEntity;
    /** Creator-written memories: the root, must survive activation. */
    seedMemories: string[];
    homeSaga: {
        name: string;
        /** What kind of world this saga is. */
        nature: string;
    };
}

export interface ActivatedCharacter {
    /** Proper name replacing the placeholder; recorded by the on-chain mint. */
    realName: string;
    role: string;
    persona: string;
    physicalFacts: string;
    /** Must include and continue the seed memories. */
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
    const o = extractJsonLoose(raw);
    if (wasTruncated(o)) {
        console.warn(`[activate] 回話被剪斷，已撿回可用的部分（${fallbackName}）`);
    }
    const realName = typeof o?.realName === 'string' && o.realName.trim() ? o.realName.trim() : '';
    if (!realName) return null;
    const str = (v: unknown, n = 220) =>
        typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : '';
    const memories = Array.isArray(o!.memories)
        ? (o!.memories as unknown[]).filter((m): m is string => typeof m === 'string' && m.trim().length > 0).map((m) => m.trim().slice(0, 220)).slice(0, 8)
        : [];
    return {
        realName: realName.slice(0, 24),
        role: str(o!.role, 60),
        persona: str(o!.persona),
        physicalFacts: str(o!.physicalFacts),
        memories,
    };
}

/** No-throw: on miss, returns a thin activation carrying the seed memories forward. */
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
            // persona 與 physicalFacts 各可到 220 字，memories 收到八條、每條 220 字；
            // 一個真被寫滿的激活近兩千個中文字，700 連小傳都寫不完，退回的薄殼會把
            // 創建者寫進去的根原封不動端回去（看起來像激活成功，其實什麼都沒長）。
            maxTokens: 2000,
            temperature: 0.8,
        });
        const activated = parseActivated(res.text, input.dormant.name);
        if (!activated) {
            console.warn(
                `[activate] ${input.dormant.name} 沒能激活成人，退回薄殼（回話開頭：${res.text.slice(0, 120).replace(/\s+/g, ' ')}）`,
            );
        }
        return (
            activated ?? {
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
