/**
 * Character Agent — GOVERNANCE step (班主經營決策).
 *
 * The ARC was the one place the director still「編劇」: it kept an external arc plan and
 * decided which big show to stage, despite its own brief saying「你佈局,角色顯形」. This
 * moves that decision INTO the world: the 班主 (a character) reads the troupe's state +
 * what each member is pushing for + their standing/交情, and decides — on their OWN —
 * which way the troupe goes (排大戲搏名 / 接活賺錢 / 守成過冬). Social capital weights the
 * proposals (a 台柱's word carries; someone close to the 班主 gets a few more degrees of
 * trust) but the 班主 has the final call. ARC then emerges from this社會 decision, not a
 * director push.
 *
 * Pure LLM. The proposals + standing are supplied by the caller (later: characters
 * propose autonomously, standing comes from the relationship graph).
 */

import { text as llmText } from '@endless-story/llm';
import { roleHint } from '@endless-story/shared';

export interface GovernanceProposal {
    /** Who is pushing this. */
    proposer: string;
    proposerRole: string;
    /** What they want the troupe to do. */
    text: string;
    /** Their weight in the room — 行當份量 + 跟班主的交情 (from the relationship graph). */
    standing: string;
}

export interface DecideGovernanceInput {
    /** The 班主 making the call. */
    manager: string;
    managerRole: string;
    sagaName: string;
    /** Troupe state: 金庫 / 名聲 / 班底 / 時節 — the material reality the call must fit. */
    troupeState: string;
    /** What the members are pushing for, each with their standing. */
    proposals: GovernanceProposal[];
}

export interface GovernanceResult {
    /** The direction the 班主 sets (one line). */
    direction: string;
    /** Whose proposal was adopted, a blend, or 「自主」 (the 班主's own read). */
    adopted: string;
    /** How they weighed the people + the troupe (first-person, short). */
    reasoning: string;
}

export function buildSystemPrompt(input: DecideGovernanceInput): string {
    return [
        `你是戲班「${input.sagaName}」的班主${input.manager}。這幾日你要為整個戲班定個方向——`,
        '是排一齣大戲搏個名聲、接幾場活兒賺錢過冬、還是守著本分先撐過這個坎。',
        '',
        '底下班裡幾位各有各的提議。你聽他們的，但**最後是你拍板**：',
        '- 你既要顧戲班的家底、名聲、班底湊不湊得齊、時節撐不撐得住，',
        '- 也要掂量各人在班裡的份量和你跟他們的交情——台柱的話有份量，跟你貼心的人你會多信幾分；',
        '  可你也不能讓誰把你架空，份量輕的人說對了你也該聽。',
        '',
        '**鐵則**:',
        '1. 你是班主，從**戲班整體的存續與前途**定方向，不是只順著某一個人。',
        '2. 按各人的份量與交情權衡他們的提議，但你有最終決定權——可採納某人、折衷兩家、或都不採，照你自己的盤算走。',
        '3. 第一人稱，像個管著一班人吃穿的當家人，不是泛泛口號、不是現代詞。',
        '',
        '**輸出**:嚴格只輸出一個 JSON 物件，例如',
        '`{"direction":"先接兩場堂會把炭火錢張羅出來，開春名聲穩了再排大戲","adopted":"折衷蘇映雪與柳生春","reasoning":"映雪要搏名我懂，可金庫見底，這個冬天先得活下去；生春接活穩妥，但大戲的種子我記下了"}`',
        '不要 markdown、不要多餘文字。',
    ].join('\n');
}

export function buildUserPrompt(input: DecideGovernanceInput): string {
    const proposals = input.proposals
        .map(
            (p, i) =>
                `${i + 1}. ${p.proposer}（${p.proposerRole}）提議:${p.text}\n` +
                `   〔他在班裡的份量／你與他的交情〕${p.standing}`,
        )
        .join('\n');
    return [
        `# 你是誰`,
        `- 班主:${input.manager}（${input.managerRole}）`,
        `- 行當聲口:${roleHint(input.managerRole)}`,
        `\n## 戲班近況（你定方向必須貼著的實情）`,
        input.troupeState,
        `\n## 班裡各人的提議（聽，但份量與交情你自己掂）`,
        proposals,
        '',
        '此刻,為戲班定個方向。輸出你的決定(JSON)。',
    ]
        .filter((s) => s !== '')
        .join('\n');
}

function parseGovernance(raw: string): GovernanceResult | null {
    const blocks = raw.match(/\{[\s\S]*?\}(?=[^}]*$)/g) ?? raw.match(/\{[\s\S]*\}/g);
    if (!blocks?.length) return null;
    for (let i = blocks.length - 1; i >= 0; i--) {
        try {
            const o = JSON.parse(blocks[i]) as Partial<GovernanceResult>;
            if (typeof o.direction === 'string' && o.direction.trim()) {
                return {
                    direction: o.direction.trim().slice(0, 160),
                    adopted: typeof o.adopted === 'string' ? o.adopted.trim().slice(0, 60) : '自主',
                    reasoning: typeof o.reasoning === 'string' ? o.reasoning.trim().slice(0, 220) : '',
                };
            }
        } catch {
            /* try an earlier block */
        }
    }
    return null;
}

/**
 * Decide the troupe's direction. No-throw: a parse miss / model error reads as 守成
 * (hold steady) rather than forcing a risky move — inaction is the safe default for a
 * 班主 who can't make up their mind.
 */
export async function decideGovernanceAction(
    input: DecideGovernanceInput,
    opts?: { model?: string },
): Promise<GovernanceResult> {
    try {
        const llm = llmText.createTextClient({ kind: 'cheap' });
        const res = await llm.chat({
            model: opts?.model ?? llm.defaultModel,
            system: buildSystemPrompt(input),
            messages: [{ role: 'user', content: buildUserPrompt(input) }],
            maxTokens: 400,
            temperature: 0.8,
        });
        return (
            parseGovernance(res.text) ?? {
                direction: '先守成，撐過這陣子再說',
                adopted: '自主',
                reasoning: '（一時拿不定，先穩住）',
            }
        );
    } catch {
        return { direction: '先守成，撐過這陣子再說', adopted: '自主', reasoning: '' };
    }
}
