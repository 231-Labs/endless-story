/**
 * Character Agent — GOVERNANCE step: the troupe manager (班主) reads troupe state +
 * member proposals weighted by standing, and sets the troupe direction itself, so the
 * arc emerges from a social decision instead of a director push. Pure LLM.
 */

import { text as llmText } from '@endless-story/llm';
import { roleHint, type RelationshipTone } from '@endless-story/shared';
import { extractJsonLoose, wasTruncated } from '../../infra/json-loose.ts';

export interface GovernanceProposal {
    proposer: string;
    proposerRole: string;
    text: string;
    /** Weight in the room: role stature + rapport with the manager (relationship graph). */
    standing: string;
}

export interface DecideGovernanceInput {
    manager: string;
    managerRole: string;
    sagaName: string;
    /** Material troupe state (treasury / reputation / roster / season). */
    troupeState: string;
    proposals: GovernanceProposal[];
}

export interface GovernanceResult {
    direction: string;
    /** Whose proposal was adopted, a blend, or 「自主」 (the manager's own read). */
    adopted: string;
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

function parseGovernance(raw: string, manager: string): GovernanceResult | null {
    const o = extractJsonLoose(raw);
    if (wasTruncated(o)) {
        console.warn(`[governance] 回話被剪斷，已撿回可用的部分（班主 ${manager}）`);
    }
    if (typeof o?.direction !== 'string' || !o.direction.trim()) return null;
    return {
        direction: o.direction.trim().slice(0, 160),
        adopted: typeof o.adopted === 'string' ? o.adopted.trim().slice(0, 60) : '自主',
        reasoning: typeof o.reasoning === 'string' ? o.reasoning.trim().slice(0, 220) : '',
    };
}

/** No-throw: a parse miss / model error reads as hold-steady (守成), the safe default. */
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
            // direction ≤160 字、adopted ≤60 字、reasoning ≤220 字，合起來近四百個
            // 中文字；一字常吃一到兩個 token，400 連 direction 都寫不完。
            maxTokens: 1000,
            temperature: 0.8,
        });
        const parsed = parseGovernance(res.text, input.manager);
        if (!parsed) {
            // 「守成」是拿不到答案時補的殼，不是班主定的方向——不喊就看不出差別。
            console.warn(
                `[governance] ${input.manager} 沒能定出方向，退回守成（回話開頭：${res.text.slice(0, 120).replace(/\s+/g, ' ')}）`,
            );
        }
        return (
            parsed ?? {
                direction: '先守成，撐過這陣子再說',
                adopted: '自主',
                reasoning: '（一時拿不定，先穩住）',
            }
        );
    } catch {
        return { direction: '先守成，撐過這陣子再說', adopted: '自主', reasoning: '' };
    }
}

/* Standing derived from the social graph: role decides stature, the manager's directed
 * bond (tone + cooled weight from directedOutgoingEdges) decides rapport. */

/** Manager's directed bond toward a proposer. */
export interface ManagerBond {
    tone: RelationshipTone;
    /** Cooled weight; higher = more salient. */
    weight: number;
}

const ROLE_WEIGHT: Record<string, string> = {
    花旦: '班裡挑大梁的台柱，份量最重',
    青衣: '班裡挑大梁的台柱，份量最重',
    小生: '當紅的角兒，台下目光多，份量重',
    老生: '當紅的角兒，台下目光多，份量重',
    武生: '當紅的角兒，台下目光多，份量重',
    刀馬旦: '能挑場面的角兒，份量不輕',
    老旦: '資歷深的角兒，說話有份量',
    丑: '插科打諢的角兒，份量輕',
    樂師: '伴奏的，份量輕',
};

function roleWeightPhrase(role: string): string {
    return ROLE_WEIGHT[role] ?? '班裡尋常一員，份量平平';
}

function rapportPhrase(bond?: ManagerBond): string {
    if (!bond || bond.weight < 0.35) return ''; // cooled too far: no rapport to speak of
    const strong = bond.weight >= 1.2;
    switch (bond.tone) {
        case 'romance':
        case 'affection':
            return strong ? '與你最貼心，你聽得進他的話' : '與你有幾分情份';
        case 'mentorship':
            return '你看重的，師徒情份還在';
        case 'rivalry':
            return '與你暗暗較著勁，他的話你掂量著聽';
        case 'tension':
            return strong ? '近來與你起了不小的摩擦，話打了折' : '與你有些不對付';
        case 'wary':
            return '你對他存著戒心，話聽著留三分';
        case 'estrangement':
            return '與你生分了，他的話你未必聽得進';
        default:
            return '';
    }
}

/** Standing = role stature + the manager's directed bond. */
export function buildStanding(proposerRole: string, managerBond?: ManagerBond): string {
    const weight = roleWeightPhrase(proposerRole);
    const rapport = rapportPhrase(managerBond);
    return rapport ? `${weight}；${rapport}` : weight;
}
