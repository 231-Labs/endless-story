// LLM slot-filler for the 戲妝 prompt (Hybrid mode): the panel stays simple
// (character + kind + a free-text occasion), and a cheap-tier model infers the
// dramaturgical slots the template needs — play / role-in-play / scene / pose /
// emotion — from the occasion + the character's 行當. This is what makes the
// builder 泛用: no hardcoded play, the model knows 賈寶玉→《紅樓夢》→大觀園.
//
// Best-effort: any failure (no key, bad JSON, empty) falls back to using the
// occasion text itself as the scene, so the render still proceeds.

import { createTextClient } from '@endless-story/llm/text';
import type { StageSlots } from '@/lib/stage-prompt';

/** Slots the LLM is allowed to infer. The deterministic ones (styleMode,
 *  roleType, makeup/headpiece/costume defaults) are NOT delegated. */
type CuratedSlots = Pick<
    StageSlots,
    'operaType' | 'playTitle' | 'roleName' | 'sceneDesc' | 'poseAction' | 'emotionDesc'
>;

export interface StageCuratorInput {
    /** Performing 行當 (反串 already resolved): 小生 / 花旦 / 淨…. */
    roleType: string;
    /** Free-text occasion from the admin, e.g. 「扮演少年賈寶玉，舉手投足盡顯風流」. */
    occasion?: string;
    gender?: string;
    ageYears?: number;
}

const SYSTEM = [
    '你是戲曲劇照美術指導。根據給定的「行當」與「情境補述」，推斷這張戲妝劇照的戲劇設定，只輸出 JSON。',
    '欄位：operaType（劇種，預設「京劇」，因為京劇油彩較濃）、playTitle（劇目名，不含書名號；無法判斷就省略）、',
    'roleName（在該劇中飾演的角色；無法判斷就省略）、sceneDesc（該角色此刻所在的戲中場景，具體但精簡，例如「大觀園亭台花影、綢緞帷幔」）、',
    'poseAction（身段動作，精簡）、emotionDesc（神情，精簡）。',
    '規則：只憑情境合理推斷，不要杜撰與情境矛盾的劇目；不確定的欄位直接省略，不要填空字串或「未知」。',
    '場景要貼合戲文與人物身分、能當背景，不要純白底、不要留白。只輸出 JSON，不要解釋。',
].join('');

/** Strip code fences / prose and parse the first JSON object. */
function parseJson(text: string): Record<string, unknown> | null {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
        const obj = JSON.parse(m[0]);
        return obj && typeof obj === 'object' ? (obj as Record<string, unknown>) : null;
    } catch {
        return null;
    }
}

function str(obj: Record<string, unknown>, key: string): string | undefined {
    const v = obj[key];
    if (typeof v !== 'string') return undefined;
    const t = v.trim();
    if (!t || /^(未知|無|none|n\/?a|unknown)$/i.test(t)) return undefined;
    return t;
}

/**
 * Infer the dramaturgical slots from the occasion. Never throws — on any failure
 * returns a minimal slot set (occasion as scene) so the caller can still render.
 */
export async function curateStageSlots(input: StageCuratorInput): Promise<CuratedSlots> {
    const fallback: CuratedSlots = {
        operaType: '京劇',
        sceneDesc: input.occasion?.trim() || undefined,
    };

    const userParts = [
        `行當：${input.roleType}`,
        input.gender ? `性別：${input.gender}` : '',
        input.ageYears ? `年齡：${input.ageYears}` : '',
        `情境補述：${input.occasion?.trim() || '（無，請依行當給一個合宜的戲齣與場景）'}`,
    ].filter(Boolean);

    try {
        const text = createTextClient({ kind: 'cheap' });
        const res = await text.chat({
            system: SYSTEM,
            messages: [{ role: 'user', content: userParts.join('\n') }],
            maxTokens: 400,
            temperature: 0.7,
        });
        const obj = parseJson(res.text);
        if (!obj) return fallback;
        return {
            operaType: str(obj, 'operaType') ?? '京劇',
            playTitle: str(obj, 'playTitle'),
            roleName: str(obj, 'roleName'),
            sceneDesc: str(obj, 'sceneDesc') ?? fallback.sceneDesc,
            poseAction: str(obj, 'poseAction'),
            emotionDesc: str(obj, 'emotionDesc'),
        };
    } catch {
        return fallback;
    }
}
