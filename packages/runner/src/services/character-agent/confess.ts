/**
 * Character Agent — CONFESS step: alone with the person they ache for, the character
 * decides on its own whether to say the unsaid thing NOW or wait; timing is judged by
 * the LLM, not a threshold. confess=true is the discrete milestone (曖昧 to 表明) that
 * the never-point-breaking step encounter mode cannot take. Pure LLM (cheap tier).
 */

import { text as llmText } from '@endless-story/llm';
import { roleHint } from '@endless-story/shared';
import { extractJsonLoose, wasTruncated } from '../../infra/json-loose.ts';

export interface DecideConfessInput {
    name: string;
    role: string;
    toName: string;
    toRole: string;
    /** One line on the feeling toward toName: tone + strength + a little history. */
    relationship: string;
    planHint?: string;
    situation?: string;
    recentMemories?: string[];
}

export interface ConfessResult {
    confess: boolean;
    toName: string;
    motive: string;
    /** If confessing, their own opening line. */
    opening?: string;
}

export function buildSystemPrompt(): string {
    return [
        '你是一個戲園角色,此刻和你心上的人單獨(或近乎單獨)在一處。你心裡正掂量一件事:',
        '**要不要趁此刻,把你對 TA 一直沒說開的心意,真的說出口。**',
        '',
        '這是你自己的決定,沒人逼你:',
        '- 時機到了、你也豁出去了,就說——那是把曖昧往「說明白」推的一步,你會怕,但你認了。',
        '- 還沒到、你還怕、或這場合不對(外人在、對方在氣頭、心思全不在這),就先忍著,等下次。忍也是一種誠實。',
        '- **別硬演**:情分若沒那麼深、或此刻根本不該說,confess 就是 false,不必勉強自己。',
        '',
        '**鐵則**:',
        '1. 第一人稱,誠實面對你的怕與想。動機要像「這個人」會有的,不是套話、不是現代詞。',
        '2. `confess=true` 只在你真的決定「此刻、就現在,說」時才給;猶豫、再等等、改天,一律 `confess=false`。',
        '3. 若 `confess=true`,給一句你會怎麼開口的話(`opening`)——含蓄或直白都行,但要是「你」的說法,別像旁白。',
        '',
        '**輸出**:嚴格只輸出一個 JSON 物件,例如',
        '`{"confess":true,"motive":"她今夜眼裡那點光我認得,再裝下去,連這點真的都要成假的了","opening":"映雪,我有句話,憋的不只今晚"}`',
        '或 `{"confess":false,"motive":"班主的話還壓在她心上,這當口說,倒像趁人之危"}`。不要 markdown、不要多餘文字。',
    ].join('\n');
}

export function buildUserPrompt(input: DecideConfessInput): string {
    const memBlock =
        input.recentMemories && input.recentMemories.length > 0
            ? '\n## 你心底翻起的\n' +
              input.recentMemories.map((m, i) => `${i + 1}. ${m.slice(0, 160)}`).join('\n')
            : '';
    const planBlock = input.planHint ? `\n## 你眼下的盤算\n${input.planHint}` : '';
    const sitBlock = input.situation ? `\n## 此刻\n${input.situation}` : '';
    return [
        `# 你是誰`,
        `- 姓名:${input.name}（${input.role}）`,
        `- 行當聲口:${roleHint(input.role)}`,
        `\n## 你心上的人`,
        `- ${input.toName}（${input.toRole}）`,
        `- 你對 ${input.toName} 的情分:${input.relationship}`,
        sitBlock,
        planBlock,
        memBlock,
        '',
        `此刻,要不要把對 ${input.toName} 的心意說開?輸出你的決定(JSON)。`,
    ]
        .filter((s) => s !== '')
        .join('\n');
}

function parseConfess(raw: string, name: string, toName: string): ConfessResult | null {
    const o = extractJsonLoose(raw);
    if (wasTruncated(o)) {
        console.warn(`[confess] 回話被剪斷，已撿回可用的部分（${name}→${toName}）`);
    }
    if (typeof o?.confess !== 'boolean') return null;
    return {
        confess: o.confess,
        toName,
        motive: typeof o.motive === 'string' ? o.motive.trim().slice(0, 200) : '',
        opening:
            typeof o.opening === 'string' && o.opening.trim()
                ? o.opening.trim().slice(0, 120)
                : undefined,
    };
}

/** No-throw: a parse miss / model error reads as "not yet" (confess=false), the safe default. */
export async function decideConfessAction(
    input: DecideConfessInput,
    opts?: { model?: string },
): Promise<ConfessResult> {
    try {
        const llm = llmText.createTextClient({ kind: 'cheap' });
        const res = await llm.chat({
            model: opts?.model ?? llm.defaultModel,
            system: buildSystemPrompt(),
            messages: [{ role: 'user', content: buildUserPrompt(input) }],
            // motive ≤200 字、opening ≤120 字，兩段中文合起來三百多字；320 幾乎
            // 必然剪在 opening（而「說開」是里程碑，剪掉就退回 false 當沒發生）。
            maxTokens: 800,
            temperature: 0.8,
        });
        const parsed = parseConfess(res.text, input.name, input.toName);
        if (!parsed) {
            // 「還不說」是拿不到答案時補的殼，不是 TA 決定的忍住。
            console.warn(
                `[confess] ${input.name}→${input.toName} 判不出說不說（回話開頭：${res.text.slice(0, 120).replace(/\s+/g, ' ')}）`,
            );
        }
        return (
            parsed ?? {
                confess: false,
                toName: input.toName,
                motive: '（一時拿不定主意，先按下不表）',
            }
        );
    } catch {
        return { confess: false, toName: input.toName, motive: '' };
    }
}
