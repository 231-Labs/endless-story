/**
 * §4d.2 arc convergence — central question + irreversibility judge + context-fed aftermath.
 * The engine that turns a centrality-held thread from a STANDOFF into a TURNING POINT that
 * changes the characters and RETIRES, spawning a fresh arc so the world keeps living.
 *
 * Validated in `arc-question-retire-selfdrive.ts` (§2.31): with an explicit central question
 * + escalating forcing + an adversarial irreversibility judge, a vacillating thread (柳生春
 * packs/unpacks the 布包 forever) converges to a character-grounded, irreversible answer,
 * retires, and its aftermath spawns a NEW arc with its own question. Control (no forcing) =
 * the §2.30 vacillation.
 *
 * This module holds the two UNAMBIGUOUSLY emergent pieces — the judge and the aftermath.
 * The FORCING (deadline) is deliberately NOT here: it must be derived from real converging
 * world-pressure by the caller (see 寫死自檢 below), never a tick counter.
 *
 * ── 寫死自檢 (why this is emergent, not a secret shortcut) ──────────────────────────
 *   ✗ hardcode the answer (「柳會留」)          → the judge NEVER prefers an outcome; it only
 *                                                 asks "is it irreversibly answered?" (走 OR 留
 *                                                 both count), default FALSE.
 *   ✗ a director timer ("tick 5 = decide")     → NOT in this module. The forcing deadline must
 *                                                 emerge from converging pressure (白 actually
 *                                                 leaving, 田's real contract deadline, 金鳳's
 *                                                 real intrusion) — wired by the caller from
 *                                                 world-state, never a counter. 🔴 highest risk.
 *   ✗ count "心裡決定但沒做" as answered         → the judge is adversarial: 收拾布包／先讓我唱完／
 *                                                 明天再說／心裡決定但沒做 ALL count as NOT answered;
 *                                                 only a walk-no-return ACTION does.
 *   ✗ template the aftermath ("在一起→吃醋")     → the aftermath is fed the REAL answer + beat and
 *                                                 grows a new question from that context.
 */

import { text as llmText } from '@endless-story/llm';

function parseObj(raw: string): Record<string, unknown> | null {
    const blocks = raw.match(/\{[\s\S]*?\}/g);
    if (!blocks?.length) return null;
    for (let i = blocks.length - 1; i >= 0; i -= 1) {
        try {
            return JSON.parse(blocks[i]) as Record<string, unknown>;
        } catch {
            /* try earlier */
        }
    }
    return null;
}
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

export interface DerivedArc {
    /** The central go/stay-type question this arc turns on (emergent, not authored). */
    question: string;
    /** Whose irreversible decision it hangs on — a name from the cast. */
    centralCharName: string;
}

/**
 * Derive the arc's central question + central character from the staged contention framing (what
 * centrality judged to be the story's heart) and the cast. Emergent: the model INTERPRETS the live
 * situation into a binary "會不會 / 走還是留 / 認還是不認" question and whose one irreversible decision
 * it hangs on. It does NOT decide the answer, write the scene, or use any authored priority.
 * Returns null on failure (caller just skips opening an arc this tick).
 */
export async function deriveArc(
    framingLabel: string,
    castNames: readonly string[],
    opts: { model?: string } = {},
): Promise<DerivedArc | null> {
    if (castNames.length === 0) return null;
    const sys =
        '下面是這一場戲此刻的焦點，和在場的人。判斷這條線真正的**中心問題**：一個「會不會／走還是留／認還是不認／散還是不散」這類、**答了就有不可逆轉折**的二選一問題；以及這問題**懸在誰的一個不可逆決定上**。' +
        '你只判斷，不寫戲、不替他決定答案。中心角色必須是在場名單裡的人。\n' +
        '輸出 JSON：{"question":"中心問題(一句)","who":"中心角色的名字"}。不要 markdown。';
    try {
        const client = llmText.createTextClient({ kind: 'primary' });
        const res = await client.chat({
            model: opts.model ?? client.defaultModel,
            system: sys,
            messages: [{ role: 'user', content: `焦點：${framingLabel}\n在場：${castNames.join('、')}\n\n判斷中心問題與中心角色。` }],
            maxTokens: 160,
            temperature: 0.5,
        });
        const o = parseObj(res.text) ?? {};
        const question = str(o.question);
        const who = str(o.who);
        const centralCharName = castNames.find((n) => who.includes(n) || n.includes(who)) ?? '';
        if (!question || !centralCharName) return null;
        return { question, centralCharName };
    } catch {
        return null;
    }
}

export interface ArcVerdict {
    /** Was the central question answered IRREVERSIBLY this beat? Default false. */
    answered: boolean;
    /** The answer if any (free-form, e.g. 走/留/在一起/散了); '' when not answered. */
    answer: string;
    /** One-line reason. */
    why: string;
}

/**
 * Adversarial irreversibility judge (§2.31). Domain-blind: it does NOT prefer an outcome,
 * it only decides whether `beat` gave the central `question` a walk-no-return answer.
 * Default FALSE — a stall (收拾布包／先讓我唱完／明天再說／只是心裡決定) is NOT an answer.
 * Returns `{ answered:false }` on any LLM failure (safe: the arc just stays open).
 */
export async function judgeArcAnswered(
    question: string,
    beat: string,
    opts: { model?: string } = {},
): Promise<ArcVerdict> {
    const sys =
        `你是中立裁判，只判一件事：下面這一拍，是否**不可逆地**回答了中心問題「${question}」。\n` +
        '**默認 answered=false。** 只有角色真做了一個**走不回頭的動作**才算 true。' +
        '**「收拾東西又抓回來、伸手又推、先讓我做完某事、明天再說、心裡決定了卻沒做出來」全部算沒答（false）。**' +
        '你不偏好任何一種答案，只判「有沒有不可逆地答」。\n' +
        '輸出 JSON：{"answered":true/false,"answer":"答案(沒答填:無)","why":"一句"}。不要 markdown。';
    try {
        const client = llmText.createTextClient({ kind: 'primary' });
        const res = await client.chat({
            model: opts.model ?? client.defaultModel,
            system: sys,
            messages: [{ role: 'user', content: `這一拍：${beat}` }],
            maxTokens: 140,
            temperature: 0.2,
        });
        const o = parseObj(res.text) ?? {};
        const answer = str(o.answer);
        return {
            answered: o.answered === true,
            answer: answer === '無' ? '' : answer,
            why: str(o.why),
        };
    } catch {
        return { answered: false, answer: '', why: '' };
    }
}

export interface ArcAftermath {
    /** The new arc's central question (a fresh go/stay-type tension, NOT the old one). */
    question: string;
    /** One-line opening situation for the new arc. */
    seed: string;
    /** Characters involved (free-form). */
    chars: string;
}

/**
 * Spawn the aftermath arc (§2.31) from the REAL resolution — the answer + the beat that
 * settled it. Context-fed (never a template): the new central question grows out of what
 * actually happened, so the world keeps living with a fresh, grounded tension. Returns null
 * on failure (safe: the arc simply retires with no follow-up this tick).
 */
export async function spawnArcAftermath(
    question: string,
    answer: string,
    beat: string,
    opts: { model?: string } = {},
): Promise<ArcAftermath | null> {
    const sys =
        `一條線的中心問題「${question}」被不可逆地答了：**${answer}**（${beat}）。這條線了結、**退役**了。\n` +
        '但世界繼續——這個**真實結果**自然牽出一條新的、有它自己中心問題的線（別重述舊問題，要從這個結果長出來）。\n' +
        '輸出 JSON：{"question":"新線的中心問題(一句)","seed":"新線的開場處境(一句)","chars":"涉及角色"}。不要 markdown。';
    try {
        const client = llmText.createTextClient({ kind: 'primary' });
        const res = await client.chat({
            model: opts.model ?? client.defaultModel,
            system: sys,
            messages: [{ role: 'user', content: '牽出後續線。' }],
            maxTokens: 200,
            temperature: 0.8,
        });
        const o = parseObj(res.text) ?? {};
        const question2 = str(o.question);
        if (!question2) return null;
        return { question: question2, seed: str(o.seed), chars: str(o.chars) };
    } catch {
        return null;
    }
}
