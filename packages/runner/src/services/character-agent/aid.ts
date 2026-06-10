/**
 * Character Agent — AID step (decideAid). Should I give some of my own money to someone?
 *
 * THE STANCE (owner's call): the JUDGMENT is the LLM's, not a hardcoded rule. The model weighs
 * the bond, the other's plight (real need vs mere want), and whether it can spare the coin —
 * and it may refuse. The deterministic layer (parse.ts) only enforces HARD safety: the
 * recipient must be a real on-screen peer (not self/unknown), and the amount can never exceed
 * the giver's funds (no overdraft — the on-chain transfer_between_characters / applyTransfer
 * primitive enforces the same). So the flow is the character's choice, but it can never be
 * impossible or self-destructive-by-accident.
 *
 * Mirror of decideSocialAction: build prompts → cheap LLM → parseAid → guard. The caller (GIVE
 * phase) submits the surviving decision through transfer_between_characters.
 */

import { text as llmText } from '@endless-story/llm';
import { roleHint } from '@endless-story/shared';
import { parseAid, clampAidAmount } from './parse.js';

export type AidMemo = 'gift' | 'patronage' | 'loan' | 'repay' | 'bribe' | 'tribute';
export type AidVitality = 'healthy' | 'strained' | 'failing';

/** A peer the character could aid — their visible plight + how the character sees them. */
export interface AidPeer {
    id: string;
    name: string;
    role: string;
    relation: 'ally' | 'neutral' | 'rival';
    /** human-readable visible distress, e.g. '面有菜色，再兩日恐斷炊' or '氣色尚穩'. */
    distress: string;
    /** rough days the peer can still self-fund (omit if unknown). */
    runwayDays?: number;
    /** one recalled impression of this peer, if any. */
    recentMemory?: string;
}

export interface AidActionInput {
    name: string;
    role: string;
    /** the character's own purse, ENDLESS. */
    funds: number;
    /** own daily cost, ENDLESS. */
    dailyCost: number;
    /** own runway in days (large = ample). */
    runwayDays: number;
    vitalityState: AidVitality;
    planHint?: string;
    peers: AidPeer[];
}

export interface AidActionResult {
    doAid: boolean;
    recipientId?: string;
    /** ENDLESS actually movable after the hard affordability clamp. */
    amount?: number;
    memo?: AidMemo;
    reason?: string;
}

export function buildSystemPrompt(): string {
    return [
        '你是戲園裡一個真實持有銀錢的角色。此刻你在盤算：要不要從自己的銀子裡，分一些給身邊某個人。',
        '這是你自己的銀子、你自己的判斷。沒有人規定你必須給，也沒有人規定你不能給。',
        '',
        '你要權衡：',
        '- 對方是真有急難（將斷炊、要病倒、撐不過幾日），還是只是想要、並非急需；',
        '- 你和他的交情（盟友／泛泛之交／有過節）；',
        '- 你自己撐不撐得住——給出去之後，自己還能活幾日；',
        '- 給，是結人情、報恩、包養、借貸、還債、還是收買；不給，也是一種選擇。',
        '',
        '**鐵則**：',
        '1. 不要無緣無故散財。對方氣色尚穩、銀錢無虞時，不必給。',
        '2. 不要把自己掏空。先顧自己活得下去；自己也快撐不住時，更該守住銀子。',
        '3. 你可以拒絕、可以只給一點、也可以傾力相助——分寸由你定。',
        '4. 仇家該不該救，由你權衡，不是非救不可。',
        '5. 金額以 ENDLESS 計，必須 ≤ 你現有的銀錢。',
        '',
        '**輸出**：嚴格只輸出 JSON 物件，例如',
        '`{"doAid":true,"recipientId":"0x…","amount":12,"memo":"patronage","reason":"她一場病就要斷炊，我與她搭戲多年，這點銀子接濟得起。"}`',
        '或 `{"doAid":false,"reason":"眾人氣色都還穩，此刻散財無謂，銀子先留著。"}`。',
        'memo ∈ gift｜patronage｜loan｜repay｜bribe｜tribute。reason ≤60 字。不要 markdown、不要多餘文字。',
    ].join('\n');
}

export function buildUserPrompt(input: AidActionInput): string {
    const peers = input.peers.length > 0
        ? input.peers
              .map((p) => {
                  const rel = p.relation === 'ally' ? '盟友' : p.relation === 'rival' ? '有過節' : '泛泛之交';
                  const runway = p.runwayDays != null ? `，約還能撐 ${p.runwayDays} 日` : '';
                  const mem = p.recentMemory ? `\n    （你記得：${p.recentMemory}）` : '';
                  return `- id=${p.id} 「${p.name}」（${p.role}；${rel}）：${p.distress}${runway}${mem}`;
              })
              .join('\n')
        : '（此刻身邊無人可接濟）';
    const planBlock = input.planHint ? `\n## 你此刻的打算\n${input.planHint}` : '';
    return [
        '# 你是誰',
        `- 姓名：${input.name}`,
        `- 行當：${input.role}`,
        `- 行當聲口：${roleHint(input.role)}`,
        '',
        '## 你的家底',
        `- 現銀：${input.funds} ENDLESS`,
        `- 每日開銷：${input.dailyCost} ENDLESS`,
        `- 自己約還能撐：${input.runwayDays >= 999 ? '無虞（入大於出）' : `${input.runwayDays} 日`}`,
        `- 氣血：${input.vitalityState === 'healthy' ? '尚穩' : input.vitalityState === 'strained' ? '見疲態' : '瀕危'}`,
        planBlock,
        '',
        '## 身邊的人',
        peers,
        '',
        '請判斷：要不要接濟、給誰、給多少、什麼名目（JSON）。',
    ]
        .filter((s) => s !== '')
        .join('\n');
}

export async function decideAidAction(
    input: AidActionInput,
    opts?: { model?: string },
): Promise<AidActionResult> {
    if (input.peers.length === 0) return { doAid: false, reason: '此刻無人可接濟' };
    if (input.funds <= 0) return { doAid: false, reason: '自己也是身無分文' };

    const byId = new Map(input.peers.map((p) => [p.id, p]));
    const llm = llmText.createTextClient({ kind: 'cheap' });
    const model = opts?.model ?? llm.defaultModel;
    const res = await llm.chat({
        model,
        system: buildSystemPrompt(),
        messages: [{ role: 'user', content: buildUserPrompt(input) }],
        maxTokens: 320,
        temperature: 0.6,
    });

    const parsed = parseAid(res.text);
    if (!parsed || !parsed.doAid) return { doAid: false, reason: parsed?.reason ?? '一念之間，按下不表' };

    // ── hard guards (NOT the judgment): recipient must be a real peer; no overdraft. ──
    const peer = parsed.recipientId ? byId.get(parsed.recipientId) : undefined;
    if (!peer) return { doAid: false, reason: '想接濟的人不在眼前' };
    const amount = clampAidAmount(parsed.amount, input.funds);
    if (amount <= 0) return { doAid: false, reason: '掂量之後，銀子實在勻不出來' };

    return { doAid: true, recipientId: peer.id, amount, memo: parsed.memo, reason: parsed.reason };
}
