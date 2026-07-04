/**
 * §4d.2 arc convergence (validated §2.31): central-question derivation, adversarial
 * irreversibility judge, and context-fed aftermath. The forcing deadline is deliberately
 * NOT here — callers must derive it from real converging world-pressure, never a timer.
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
    /** Emergent go/stay-type central question. */
    question: string;
    /** Cast name whose irreversible decision it hangs on. */
    centralCharName: string;
}

/**
 * Derive the arc's central question + character from the staged framing + cast.
 * Judges only — never decides the answer or writes the scene. Null on failure
 * (caller skips opening an arc this tick).
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
    /** Answered IRREVERSIBLY this beat? Default false. */
    answered: boolean;
    /** Free-form answer; '' when not answered. */
    answer: string;
    why: string;
}

/**
 * Adversarial irreversibility judge (§2.31): domain-blind, never prefers an outcome,
 * default FALSE — stalls don't count, only a walk-no-return action. Returns
 * `{ answered:false }` on any LLM failure (the arc just stays open).
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
    /** The new arc's central question (fresh, not the old one). */
    question: string;
    /** One-line opening situation. */
    seed: string;
    /** Characters involved (free-form). */
    chars: string;
}

/**
 * Spawn the aftermath arc (§2.31) from the REAL answer + settling beat — context-fed,
 * never a template. Null on failure (the arc simply retires with no follow-up).
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
