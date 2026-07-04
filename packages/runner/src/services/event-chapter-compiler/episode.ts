/**
 * Episode weaver — the storyteller compresses ONE narrative day's concurrent
 * scene exchanges into a single follow-along 回 (the subscription unit).
 * Presentation-layer only: it may compress, spotlight and end on a hook drawn
 * from tensions that ALREADY exist — it never decides what characters do next.
 */

import { text as llmText } from '@endless-story/llm';
import { buildSagaSoulBlock, type SagaSoul } from '../character-worker/saga-soul.js';

export interface ComposeEpisodeInput {
    /** Narrative day this episode covers. */
    day: number;
    /** The day's material: clock markers + `[場名] 名：一拍` beat lines, in order. */
    materialLines: string[];
    /** Live unresolved tensions (owner + want one-liners) the hook may draw from. */
    tensionLines?: string[];
    /** The day's first-person POV chapters (the subscriber product): the weaver
     *  paraphrases interiority freely but quotes at most two lines per character —
     *  the episode is the trailer, the POV serial is the paid full text. */
    povTexts?: Array<{ name: string; text: string }>;
    /** Canon honorifics facts; the weaver must not invert or invent kinship. */
    etiquette?: string;
    soul?: SagaSoul;
}

export function buildEpisodeSystemPrompt(soul?: SagaSoul, etiquette?: string): string {
    const base = [
        '你是說書人，寫今日的「一集」章回 —— 讀者每天回來追的就是這一篇。素材是一整天裡',
        '幾個場景各自發生的來回（依時辰排好）。',
        '',
        '**鐵則**：',
        '1. **只能用素材裡發生的事**：不發明新事件、新人物、新對白。',
        '2. **密度**：戲劇處寫細（關鍵來回可引原話）、過場一句帶過、瑣碎的併掉。',
        '   一天壓成一集，不是流水帳。',
        '3. **併發用「與此同時／那廂」轉場**；時辰推移要讓讀者感覺到日影在走。',
        '4. **回目**：第一行 `## {七到十二字上聯}　{七到十二字下聯}`，點出今日最要緊的張力，不劇透結局。',
        '5. **內心戲**：各人的【心聲】素材可自由化用 —— 用你自己的話把心緒織進場面（誰的眼',
        '   在躲、哪句話嚥了回去），讓讀者貼著人心走；但**逐字引用心聲原句每人至多兩句** ——',
        '   完整的第一人稱心聲是各角色自己的連載，你只給引子。',
        '6. **收尾要有鉤子**：從【懸著的事】裡挑一縷今日確實被撩動的，收在一個未決的動作、',
        '   一句沒出口的話、或一個誰也沒接的眼神上。**嚴禁**「且看下回分解」「欲知後事如何」',
        '   之類說書套語 —— 鉤子藏在情節與人物裡，不是收場白。',
        '7. 篇幅 1200–1800 字，密度優先：厚在心緒與張力，不是流水帳。純 markdown，從 `## ` 開始，不要 ```fence```。',
        etiquette ? `8. 【稱謂鐵則】${etiquette}——輩分與稱呼不可顛倒、不可自創。` : '',
    ];
    const lines = base.filter(Boolean);
    const soulBlock = buildSagaSoulBlock(soul);
    return soulBlock ? `${lines.join('\n')}\n${soulBlock}` : lines.join('\n');
}

export async function composeEpisode(input: ComposeEpisodeInput): Promise<string | null> {
    if (input.materialLines.length === 0) return null;
    try {
        const client = llmText.createTextClient({ kind: 'primary' });
        const tension = input.tensionLines?.length
            ? `\n\n【懸著的事（鉤子只能從這裡挑）】\n${input.tensionLines.join('\n')}`
            : '';
        const povs = input.povTexts?.length
            ? `\n\n【各人心聲（化用為主，逐字引用每人至多兩句）】\n${input.povTexts
                  .map((p) => `— ${p.name} —\n${p.text}`)
                  .join('\n\n')}`
            : '';
        const res = await client.chat({
            model: client.defaultModel,
            system: buildEpisodeSystemPrompt(input.soul, input.etiquette),
            messages: [
                {
                    role: 'user',
                    content: `【第 ${input.day} 日的素材】\n${input.materialLines.join('\n')}${povs}${tension}`,
                },
            ],
            maxTokens: 2600,
            temperature: 0.85,
        });
        const text = res.text?.trim();
        return text && text.startsWith('##') ? text : text ? `## 第 ${input.day} 日\n\n${text}` : null;
    } catch (err) {
        console.warn('[episode] compose failed:', err instanceof Error ? err.message : err);
        return null;
    }
}
