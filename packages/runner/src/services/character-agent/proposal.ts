/**
 * Character Agent — PROPOSE step: a character voices one free-text thing they want to
 * make happen. Only the SCOPE is typed (self / pair / troupe = who must approve), routing
 * to the existing confess-shaped or governance-shaped approval paths. Silence is valid.
 * Pure LLM (cheap tier).
 */

import { text as llmText } from '@endless-story/llm';
import { roleHint } from '@endless-story/shared';

/** Who has to say yes: all the system needs to route a proposal. */
export type ProposalScope = 'self' | 'pair' | 'troupe';

export interface DecideProposalInput {
    name: string;
    role: string;
    sagaName: string;
    planHint?: string;
    /** Standing feelings toward co-present others. */
    relationshipPressure?: string[];
    troupeState?: string;
    situation?: string;
    recentMemories?: string[];
}

export interface ProposalResult {
    hasProposal: boolean;
    /** Free text, deliberately untyped. */
    proposal?: string;
    scope?: ProposalScope;
    /** People the proposal touches (for pair/troupe). */
    targets?: string[];
    motive?: string;
}

const SCOPES = new Set<ProposalScope>(['self', 'pair', 'troupe']);

export function buildSystemPrompt(): string {
    return [
        '你是戲園裡一個自治的角色。此刻你心裡也許有一件「想促成的事」——**不限是什麼**:',
        '可能想排一齣戲、想約某人出城走走看場燈、想跟誰把話說開、想搬去與誰同住、想為戲班接個活兒、',
        '想歇兩天緩口氣、想跟鬧翻的人賠個不是…也可能此刻你並沒有特別想提的,那也行。',
        '',
        '從你眼下的盤算、心裡的牽掛、戲班的近況、此刻的處境,**自然地**生出一件你真想促成的事(或沒有)。',
        '',
        '**鐵則**:',
        '1. 真的從「你這個人、此刻」長出來,要具體、像活人會起的念頭,不是泛泛口號。沒想到就老實 `hasProposal:false`。',
        '2. 標出這件事**牽涉誰、誰得點頭**——這叫 scope:',
        '   · `self`:你自己就能做的(歇著、偷偷練一齣)——不必誰同意;',
        '   · `pair`:牽涉**某一個人**(約他出遊、想同住、把話說開、向誰賠不是)——得**那個人**點頭;',
        '   · `troupe`:**整個戲班**的事(排大戲、接堂會、添行頭)——得**班主**拍板。',
        '3. 牽涉他人(pair/troupe)就把是誰列進 `targets`。',
        '4. 第一人稱、不要現代詞。',
        '',
        '**輸出**:嚴格只一個 JSON 物件。有提議:',
        '`{"hasProposal":true,"proposal":"我想趁這幾日約映雪出城看一回燈","scope":"pair","targets":["蘇映雪"],"motive":"連日都在戲裡,我想同她在戲外頭待一會兒"}`',
        '沒有就 `{"hasProposal":false}`。不要 markdown、不要多餘文字。',
    ].join('\n');
}

export function buildUserPrompt(input: DecideProposalInput): string {
    const planBlock = input.planHint ? `\n## 你眼下的盤算\n${input.planHint}` : '';
    const relBlock =
        input.relationshipPressure && input.relationshipPressure.length > 0
            ? '\n## 你心裡的牽掛\n' + input.relationshipPressure.map((r) => `- ${r}`).join('\n')
            : '';
    const stateBlock = input.troupeState ? `\n## 戲班近況\n${input.troupeState}` : '';
    const sitBlock = input.situation ? `\n## 此刻\n${input.situation}` : '';
    const memBlock =
        input.recentMemories && input.recentMemories.length > 0
            ? '\n## 你心底翻起的\n' + input.recentMemories.map((m, i) => `${i + 1}. ${m.slice(0, 150)}`).join('\n')
            : '';
    return [
        `# 你是誰`,
        `- 姓名:${input.name}（${input.role}）`,
        `- 行當聲口:${roleHint(input.role)}`,
        `- 所屬:${input.sagaName}`,
        planBlock,
        relBlock,
        stateBlock,
        sitBlock,
        memBlock,
        '',
        '此刻,你有沒有一件想促成的事?輸出你的提議(JSON)。',
    ]
        .filter((s) => s !== '')
        .join('\n');
}

function parseProposal(raw: string): ProposalResult | null {
    const blocks = raw.match(/\{[\s\S]*?\}(?=[^}]*$)/g) ?? raw.match(/\{[\s\S]*\}/g);
    if (!blocks?.length) return null;
    for (let i = blocks.length - 1; i >= 0; i--) {
        try {
            const o = JSON.parse(blocks[i]) as Record<string, unknown>;
            if (typeof o.hasProposal !== 'boolean') continue;
            if (!o.hasProposal) return { hasProposal: false };
            const proposal = typeof o.proposal === 'string' ? o.proposal.trim() : '';
            if (!proposal) continue;
            const scope = SCOPES.has(o.scope as ProposalScope) ? (o.scope as ProposalScope) : 'self';
            const targets = Array.isArray(o.targets)
                ? o.targets.filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
                : [];
            return {
                hasProposal: true,
                proposal: proposal.slice(0, 160),
                scope,
                targets,
                motive: typeof o.motive === 'string' ? o.motive.trim().slice(0, 160) : '',
            };
        } catch {
            /* try an earlier block */
        }
    }
    return null;
}

/** No-throw: a miss reads as "nothing to propose" rather than inventing one. */
export async function decideProposalAction(
    input: DecideProposalInput,
    opts?: { model?: string },
): Promise<ProposalResult> {
    try {
        const llm = llmText.createTextClient({ kind: 'cheap' });
        const res = await llm.chat({
            model: opts?.model ?? llm.defaultModel,
            system: buildSystemPrompt(),
            messages: [{ role: 'user', content: buildUserPrompt(input) }],
            maxTokens: 320,
            temperature: 0.85,
        });
        return parseProposal(res.text) ?? { hasProposal: false };
    } catch {
        return { hasProposal: false };
    }
}
