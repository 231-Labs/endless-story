/**
 * Scene record — the 屬地客觀章回 (objective scene chapter).
 *
 * The §2.14 / §2.24 承重牆: before each character writes a SUBJECTIVE POV of a tick,
 * the world writes ONE OBJECTIVE record of what physically happened in that scene —
 * who was present (authoritative, from the chain roster), what observable actions and
 * spoken lines occurred. NO interiority, NO motive, NO memory: those belong to each POV.
 *
 * This record is then fed as the shared `sceneBeats` to every co-present character's POV
 * worker (whose rule 11 already enforces 「同場客觀事實不可改寫」). The effect: every POV
 * INTERPRETS the same physical facts instead of each confabulating its own — so the cast
 * can no longer disagree on who-was-where (e.g. 田巧雲 narrating herself into two rooms at
 * once). The SUBJECTIVE register difference (端莊者藏 / 老司機寫) is preserved — only the
 * objective frame converges.
 *
 * Pure LLM (cheap tier — it's a factual record, not creative writing). Deterministic
 * `presentNames` is the load-bearing fact; the prose only narrates it.
 */

import { text as llmText } from '@endless-story/llm';

export interface SceneRecordInput {
    /** Scene display name. */
    sceneName: string;
    /** Authoritative present cast (chain roster) — the load-bearing fact; the record
     *  may name ONLY these and must not add/drop anyone. */
    presentNames: string[];
    /** The director's event/beat label for this scene this tick, if any. */
    eventLabel?: string;
    /** Observable action beats already resolved this tick (moves / spoken lines /
     *  card plays). May be empty — then the record is just the standing tableau. */
    beats: string[];
}

function buildSystemPrompt(): string {
    return [
        '你是這個世界的**場記**。把此刻這個場景裡發生的事，用客觀第三人稱寫成一段「發生了什麼」的記錄。',
        '',
        '**鐵則**：',
        '1. 只寫**看得見、聽得見**的：誰在場、誰穿什麼、站或坐在哪、手邊或桌上有什麼明顯物件、誰做了什麼動作、說了什麼話、場面如何。',
        '2. **釘住現場的物理錨點**：當下這一刻各人的衣著、站位、彼此的相對位置、明顯的道具，簡短帶到即可（不鋪張、不抒情）。這一段是後面每個人視角共用的「物理底本」，他們會照你寫的現場去敘述，所以同一場裡誰穿什麼、誰站哪、桌上有什麼，由你這裡定下，不容各 POV 各自亂編。',
        '3. **絕不寫任何人的內心、動機、感受、回憶、打算**——那是各人 POV 自己的事，場記不碰。衣著站位是看得見的事實，可寫；心裡怎麼想，不可寫。',
        '4. **在場名單是鐵的事實**：只寫名單上列出的人在場；不可讓沒列出的人出現，也不可把在場的人寫成離開或不在。',
        '5. 只記**已經發生**的事與**當下看得見的場面**。沒發生的事別補，未交代的別替它下定論（不要寫「什麼都沒發生」「不過如此」這類收束判斷）。',
        '6. 不要懸念鉤子、不要評論、不要文采堆砌。像一個誠實的旁觀者在記事。',
        '7. 120–260 中文字，舊白話，直接進正文，不要標題、不要「以下是」。',
    ].join('\n');
}

function buildUserPrompt(input: SceneRecordInput): string {
    const present = input.presentNames.length ? input.presentNames.join('、') : '無人';
    const beatsBlock = input.beats.length
        ? `## 這一刻已發生的可觀察舉動（按此寫，別漏別改）\n${input.beats.map((b) => `- ${b}`).join('\n')}`
        : '## 這一刻已發生的可觀察舉動\n（沒有明確的動作或台詞，只是這幾人此刻同在一處——就寫這個靜止的場面：誰在哪、各自手上正做著什麼看得見的事。）';
    return [
        `## 場景\n${input.sceneName}`,
        `## 在場（鐵的事實，只此數人，不增不減）\n${present}`,
        input.eventLabel ? `## 這一刻的由頭（背景，別當成內心）\n${input.eventLabel}` : '',
        beatsBlock,
        '',
        '寫這一刻的客觀場記。',
    ]
        .filter((s) => s !== '')
        .join('\n\n');
}

/**
 * Compose the objective scene record. Returns the record text, or '' on failure
 * (caller falls back to the raw per-actor beats — non-fatal).
 */
export async function composeSceneRecord(
    input: SceneRecordInput,
    opts?: { model?: string },
): Promise<string> {
    if (input.presentNames.length === 0) return '';
    const llm = llmText.createTextClient({ kind: 'cheap' });
    const model = opts?.model ?? llm.defaultModel;
    try {
        const res = await llm.chat({
            model,
            system: buildSystemPrompt(),
            messages: [{ role: 'user', content: buildUserPrompt(input) }],
            maxTokens: 600,
            temperature: 0.5,
        });
        return res.text.trim();
    } catch {
        return '';
    }
}
