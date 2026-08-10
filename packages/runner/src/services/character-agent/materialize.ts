/**
 * MATERIALIZE — grow the world from mentions: infer a plausible DORMANT entity (person or
 * place) from a not-yet-existing name plus its context, asleep until someone reaches it
 * and it activates. A mention is a seed, never a hole. Pure LLM (cheap tier).
 */

import { text as llmText } from '@endless-story/llm';
import { extractJsonLoose, wasTruncated } from '../../infra/json-loose.ts';

export type DormantKind = 'character' | 'scene';

export interface MaterializeInput {
    mention: string;
    /** Who said it, in what situation (grounds the inference). */
    context: string;
    /** Optional nudge; the model still decides on its own. */
    kindHint?: DormantKind;
}

export interface DormantEntity {
    name: string;
    kind: DormantKind;
    dormant: true;
    /** character only. */
    role?: string;
    /** One-line brief, grounded in the mention context. */
    brief?: string;
    /** character only: relation to the mention's situation. */
    relation?: string;
    /** Which kind of saga should own it once activated. */
    homeSagaHint?: string;
    /** scene only. */
    sceneType?: string;
}

export function buildSystemPrompt(): string {
    return [
        '你是這個敘事世界的「在場記錄者」。剛才有人在盤算或對話裡，提到了一個目前還不存在於記錄裡的名字。',
        '你的任務**不是抹掉它**，而是讓它合理地「半存在」——根據被提到的上下文，推斷出一個說得通的實體',
        '（一個人，或一個地點），先記成一條「休眠」條目；等日後真有人去接觸它，再激活成完整的自治角色。',
        '',
        '**鐵則**:',
        '1. **緊貼上下文**推斷，不可矛盾。被提到「拿賬本去尋張老爺下定錢」→ 張老爺就該是個出得起定錢的恩客/富商。',
        '2. 判斷它是**人**(character)還是**地點**(scene)。',
        '3. 人:給 `role`(身份)、`brief`(一句小傳)、`relation`(與這樁情境的關係，如「春雪社的老主顧」)，',
        '   並推斷它**該歸哪一類 saga** 管(`homeSagaHint`，如「江湖人物(恩客/金主)」「霞飛路某店」「某府宅」)。',
        '4. 地點:給 `sceneType`(類型)、`brief`(一句描述)。',
        '5. **只**推斷被提到的這一個，不要順手發明額外的人或地點。客觀記錄口吻，不要第一人稱、不要現代詞。',
        '',
        '**輸出**:嚴格只一個 JSON 物件。',
        '人:`{"name":"張老爺","kind":"character","role":"前門大街的恩客富商","brief":"愛聽戲、出手闊綽的老主顧","relation":"春雪社的老主顧，肯為相熟戲班先付定錢","homeSagaHint":"江湖人物(恩客/金主)"}`',
        '地點:`{"name":"城東李府","kind":"scene","sceneType":"城東富戶宅邸","brief":"辦壽宴堂會、請得起整班戲的高門大院"}`',
        '不要 markdown、不要多餘文字。',
    ].join('\n');
}

export function buildUserPrompt(input: MaterializeInput): string {
    const hint = input.kindHint ? `\n（傾向是:${input.kindHint === 'character' ? '一個人' : '一個地點'}）` : '';
    return [
        `# 被提到、但還不存在的名字`,
        `「${input.mention}」`,
        `\n# 它是在這樣的上下文被提到的`,
        input.context,
        hint,
        '',
        '請推斷出這個休眠實體(JSON)。',
    ]
        .filter((s) => s !== '')
        .join('\n');
}

function parseEntity(raw: string, fallbackName: string): DormantEntity | null {
    const o = extractJsonLoose(raw);
    if (wasTruncated(o)) {
        console.warn(`[materialize] 回話被剪斷，已撿回可用的部分（${fallbackName}）`);
    }
    if (!o) return null;
    const name = typeof o.name === 'string' && o.name.trim() ? o.name.trim() : fallbackName;
    const kind: DormantKind = o.kind === 'scene' ? 'scene' : 'character';
    const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 160) : undefined);
    return {
        name: name.slice(0, 40),
        kind,
        dormant: true,
        role: str(o.role),
        brief: str(o.brief),
        relation: str(o.relation),
        homeSagaHint: str(o.homeSagaHint),
        sceneType: str(o.sceneType),
    };
}

/** No-throw: on miss, returns a bare dormant stub so the name still half-exists. */
export async function materializeMention(
    input: MaterializeInput,
    opts?: { model?: string },
): Promise<DormantEntity> {
    try {
        const llm = llmText.createTextClient({ kind: 'cheap' });
        const res = await llm.chat({
            model: opts?.model ?? llm.defaultModel,
            system: buildSystemPrompt(),
            messages: [{ role: 'user', content: buildUserPrompt(input) }],
            // role/brief/relation/homeSagaHint/sceneType 各可到 160 字，一個寫得
            // 認真的休眠實體上看八百個中文字；320 只夠寫到小傳一半，退回的裸殼
            // 等於這個名字白提了一次。
            maxTokens: 800,
            temperature: 0.7,
        });
        const entity = parseEntity(res.text, input.mention);
        if (!entity) {
            console.warn(
                `[materialize] 「${input.mention}」推不出實體，退回裸殼（回話開頭：${res.text.slice(0, 120).replace(/\s+/g, ' ')}）`,
            );
        }
        return (
            entity ?? {
                name: input.mention.slice(0, 40),
                kind: input.kindHint ?? 'character',
                dormant: true,
            }
        );
    } catch {
        return { name: input.mention.slice(0, 40), kind: input.kindHint ?? 'character', dormant: true };
    }
}
