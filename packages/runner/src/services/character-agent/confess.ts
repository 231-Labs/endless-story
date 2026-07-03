/**
 * Character Agent — CONFESS step.
 *
 * The missing verb. plan-selfdrive showed an unblocked plan grows the WISH to confirm
 * a feeling ("探她今夜心裡可有我", "把話說半開") but has no action to execute it, so it
 * stalls at lingering. This is that action: given a character alone (or nearly) with the
 * person they ache for, it decides — on its OWN — whether to actually say the unsaid
 * thing NOW, or hold it for another time. The point is that it can choose to WAIT: a
 * strong romance edge is necessary but not sufficient; timing, the other's mood, whether
 * an outsider is present all matter, and judging that is the LLM's, not a threshold's.
 *
 * confess=true is the discrete MILESTONE that turns 曖昧 into 表明 — the step encounter
 * mode (written to never point-break) structurally cannot take. Pure LLM (cheap tier).
 */

import { text as llmText } from '@endless-story/llm';
import { roleHint } from '@endless-story/shared';

export interface DecideConfessInput {
    name: string;
    role: string;
    toName: string;
    toRole: string;
    /** One line on the feeling toward toName — tone + strength + a little history. */
    relationship: string;
    /** The character's current plan hint (may already carry a relational intent). */
    planHint?: string;
    /** Right-now situation: are they alone, is an outsider present, what just happened. */
    situation?: string;
    /** A memory or two (old-flame, last scene) for texture. */
    recentMemories?: string[];
}

export interface ConfessResult {
    confess: boolean;
    toName: string;
    /** First-person interior: why say it now, or why hold it. */
    motive: string;
    /** If confessing, one line of how they open their mouth — their own phrasing. */
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

function parseConfess(raw: string, toName: string): ConfessResult | null {
    // Take the last balanced {...} (a leaked think block can carry its own braces).
    const blocks = raw.match(/\{[\s\S]*?\}(?=[^}]*$)/g) ?? raw.match(/\{[\s\S]*\}/g);
    if (!blocks?.length) return null;
    for (let i = blocks.length - 1; i >= 0; i--) {
        try {
            const o = JSON.parse(blocks[i]) as Partial<ConfessResult>;
            if (typeof o.confess === 'boolean') {
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
        } catch {
            /* try an earlier block */
        }
    }
    return null;
}

/**
 * Decide whether to confess NOW. No-throw: a parse miss / model error reads as "not yet"
 * (confess=false) rather than forcing a confession — silence is the safe default.
 */
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
            maxTokens: 320,
            temperature: 0.8,
        });
        return (
            parseConfess(res.text, input.toName) ?? {
                confess: false,
                toName: input.toName,
                motive: '（一時拿不定主意，先按下不表）',
            }
        );
    } catch {
        return { confess: false, toName: input.toName, motive: '' };
    }
}
