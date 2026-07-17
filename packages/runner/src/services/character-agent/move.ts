/**
 * Character Agent — MOVE step (autonomous movement).
 *
 * Between ticks an idle character decides whether to stay or walk to another
 * scene, conditioned on its PLAN (where it's trying to get) + who/what is in
 * each reachable scene. This is the second half of the character action
 * space (docs/narrative/NARRATIVE_AGENTS.md §2): play-a-card + move. A character chasing
 * a co-star slot will drift toward that character's scene.
 *
 * Pure LLM (cheap tier — per character per tick). The web action reads the
 * scenes + does the move_character tx. Output is clamped to a reachable
 * scene id, so a stray hallucination just becomes "stay".
 */

import { text as llmText } from '@endless-story/llm';
import { roleHint } from '@endless-story/shared';
import { parseMove } from './parse.js';
import { movePronounFromBody, sanitizeMoveReason } from './move-guard.js';
export { sanitizeMoveReason } from './move-guard.js';

export interface MovePresentCharacter {
    id: string;
    name: string;
    role: string;
    bodyFact?: string;
}

export interface MovePresentPeer extends MovePresentCharacter {
    /** How the MOVER feels toward this person, in the mover's own words (their own
     *  side of the relationship graph — never the reverse edge). Lets movement be
     *  relationship-aware: seek the beloved, avoid the rival. */
    tieToward?: string;
}

export interface MoveSceneOption {
    sceneId: string;
    name: string;
    description?: string;
    /** Characters currently in this scene (for social pull). */
    presentCharacters: MovePresentCharacter[] | MovePresentPeer[];
    /** Legacy alias; callers should prefer presentCharacters. */
    presentNames?: string[];
    /** Privacy level of the scene. ≥3 = a private home: visiting uninvited at
     *  night is a real transgression with consequences (D — the LLM weighs it). */
    privacyLevel?: number;
    /** If this scene is someone's private home, their name — so the mover can
     *  reason about whether they'd dare enter it (and whether the owner is alone). */
    homeOfName?: string;
    /** Personal anchors are prompt-visible affordances, never engine routing. */
    isHome?: boolean;
    isWork?: boolean;
}

/** A live longing the mover carries — the ache that MIGHT move their feet at
 *  night, against propriety, if it is ripe enough (D: the want engine supplies
 *  the internal pressure; the LLM decides whether to act on it). */
export interface MoveHeartLongish {
    desc: string;
    towardName?: string;
    /** How overwhelming it is right now — 'breaking' means it can barely be held. */
    ripe?: 'idle' | 'pressing' | 'edge' | 'breaking';
}

export interface MoveDecideInput {
    name: string;
    role: string;
    bodyFact?: string;
    /** Current plan text (N6) — the lever for goal-directed movement. */
    planHint?: string;
    /** Objective facts that entered canon this tick (arrival, alarm, deadline).
     * This is a percept, not an instruction: the character may answer it, flee,
     * or stay, but cannot be unaware of a public event they witnessed. */
    currentSituation?: string;
    currentSceneName: string;
    /** Scenes the character could walk to (current scene excluded). */
    options: MoveSceneOption[];
    /** Clock label, e.g. '日午' / '入夜'. Night raises the propriety bar. */
    clock?: string;
    /** True at night: most people rest; seeking someone out (especially into a
     *  private room) is significant and may be seen. Default is to go home / stay. */
    isNight?: boolean;
    /** The mover's strongest unmet longings right now — the pull that can, when
     *  ripe, outweigh propriety and send them to someone's door despite the risk. */
    heart?: MoveHeartLongish[];
}

export interface MoveDecideResult {
    move: boolean;
    /** Target scene id — one of options[].sceneId, or undefined when staying. */
    targetSceneId?: string;
    reason?: string;
}

export function buildSystemPrompt(isNight?: boolean): string {
    const base = [
        '你是一個戲園角色,此刻不在戲中,可以選擇**留在原地**或**走到另一個場景**。',
        '',
        '**鐵則**:',
        '1. **用你的目標、心事與人際決定要不要走、走去哪** —— 想搭上/親近某人就往那人所在處去;想避開誰就遠離。心裡放不下的那個人、那件事,才是移動的真正理由。',
        '2. 不是每刻都要走。沒有理由就**留下**(move=false)。無謂亂走不可信。',
        '3. 只能走到「可去的場景」清單裡的其中一個;不能發明場景。',
        '4. reason 用第一人稱、≤30 字,寫出你**為什麼**走(或留)。',
        '5. 若提到別人，姓名與第三人稱必須照場景清單的正式資料；不可改名、倒字或把女兒身寫成「他」。',
        '6. 一律使用繁體中文（臺灣用字），不可混入簡體字。',
    ];
    if (isNight) {
        base.push(
            '',
            '**入夜了**:戲散人乏,多數人各自歸房歇息。這時候**專程去找一個人,尤其踏進人家的私宅**,是件有分量的事——',
            '- 除非你心裡那樁念想已經壓不住,值得擔那個險,否則你會回自己住處、或安於原地。',
            '- 深夜擅入私宅會被人撞見、會有後果(閒話、翻臉、規矩)。要去,是因為你**認了那個後果**也要去,不是隨意。',
            '- 若那處是別人的私宅、而你與其中人並無深交或情分,你**不會**貿然踏入。',
            '預設是歇息(回家或留下);唯有心之所繫、且此刻再難按捺,才動身。',
        );
    }
    base.push(
        '',
        '**輸出**:嚴格只輸出一個 JSON 物件,例如',
        '`{"move": true, "targetSceneId": "0x123…", "reason": "我得去後台找那位花旦,搭檔位不能斷"}`',
        '或 `{"move": false, "reason": "戲還沒散,我守在後台"}`。不要 markdown、不要多餘文字。',
    );
    return base.join('\n');
}

const RIPE_ZH: Record<string, string> = {
    idle: '淡淡的',
    pressing: '按得住、但常想起',
    edge: '快按不住了',
    breaking: '再壓就要溢出來了',
};

export function buildUserPrompt(input: MoveDecideInput): string {
    const opts = input.options
        .map((o) => {
            const peers = o.presentCharacters as MovePresentPeer[];
            const present = peers.length > 0
                ? peers
                      .map((p) => {
                          const role = p.role && p.role !== '—' ? `(${p.role})` : '';
                          const body = p.bodyFact ? `〔身:${p.bodyFact}｜代詞:${movePronounFromBody(p.bodyFact)}〕` : '';
                          const tie = p.tieToward ? `〔你對TA:${p.tieToward}〕` : '';
                          return `${p.name}${role}${body}${tie}`;
                      })
                      .join('、')
                : (o.presentNames ?? []).join('、');
            const who = present ? `在場:${present}` : '無人';
            // A private home the mover would be entering — surfaced so night
            // propriety is a real weight, not an invisible routing rule (D).
            const privacy =
                o.homeOfName
                    ? `〔${o.homeOfName}的私宅${peers.length <= 1 ? `,此刻${peers.length === 0 ? '無人' : '只TA一人'}` : ''}〕`
                    : (o.privacyLevel ?? 0) >= 3
                      ? '〔私密處〕'
                      : '';
            const desc = o.description ? ` —— ${o.description.slice(0, 40)}` : '';
            const anchors = [o.isHome ? '你的住處' : '', o.isWork ? '你的做活處' : '']
                .filter(Boolean)
                .map((label) => `〔${label}〕`)
                .join('');
            return `- sceneId=${o.sceneId} 「${o.name}」${anchors}${privacy}(${who})${desc}`;
        })
        .join('\n');
    const heart =
        input.heart && input.heart.length > 0
            ? input.heart
                  .map((h) => {
                      const to = h.towardName ? `(對象:${h.towardName})` : '';
                      const ripe = h.ripe ? `——此刻${RIPE_ZH[h.ripe] ?? ''}` : '';
                      return `- ${h.desc}${to}${ripe}`;
                  })
                  .join('\n')
            : '';
    return [
        `# 你是誰`,
        `- 姓名:${input.name}`,
        `- 行當:${input.role}`,
        input.bodyFact ? `- 身:${input.bodyFact}` : '',
        `- 行當聲口:${roleHint(input.role)}`,
        input.clock ? `- 此刻:${input.clock}` : '',
        input.currentSituation ? `\n## 剛剛發生的客觀事件\n${input.currentSituation}` : '',
        input.planHint ? `\n## 你的目標與打算\n${input.planHint}` : '',
        heart ? `\n## 你心裡放不下的事(這才是深夜動身的真正理由)\n${heart}` : '',
        '',
        `## 你此刻所在`,
        `「${input.currentSceneName}」`,
        '',
        `## 你可以走到的場景`,
        opts || '（無處可去）',
        '',
        input.isNight
            ? '入夜了。除非心裡那樁事已按不住、值得擔後果,否則回住處歇著或留在原地。請決定(JSON)。'
            : '請決定留下或移動(JSON)。',
    ]
        .filter((s) => s !== '')
        .join('\n');
}

export async function decideMove(
    input: MoveDecideInput,
    opts?: { model?: string },
): Promise<MoveDecideResult> {
    if (input.options.length === 0) return { move: false, reason: '無處可去' };

    const valid = new Set(input.options.map((o) => o.sceneId));
    const llm = llmText.createTextClient({ kind: 'cheap' });
    const model = opts?.model ?? llm.defaultModel;
    const res = await llm.chat({
        model,
        system: buildSystemPrompt(input.isNight),
        messages: [{ role: 'user', content: buildUserPrompt(input) }],
        maxTokens: 200,
        temperature: 0.8,
    });

    const parsed = parseMove(res.text);
    if (!parsed || !parsed.move || !parsed.targetSceneId || !valid.has(parsed.targetSceneId)) {
        return { move: false, reason: sanitizeMoveReason(parsed?.reason, input) };
    }
    return {
        move: true,
        targetSceneId: parsed.targetSceneId,
        reason: sanitizeMoveReason(parsed.reason, input, parsed.targetSceneId),
    };
}
