/**
 * MATERIALIZE — grow the world from what gets mentioned.
 *
 * proposal / governance / POV keep naming people and places that don't exist yet
 * (張老爺, 城東李府, 李員外). The wrong fix is to抹掉 them or坍縮 the proposal to self;
 * the right one — toward a world with no NPCs — is to let每個被提及 half-exist. This infers
 * a plausible DORMANT entity (a person or a place) from the mention + its context, tags it
 * dormant + which kind of saga it should belong to, and leaves it asleep until someone
 * actually goes to it, at which point it's activated into a full autonomous character.
 *
 * So a mention is never a hole in the world — it's a seed. Pure LLM (cheap tier).
 */

import { text as llmText } from '@endless-story/llm';

export type DormantKind = 'character' | 'scene';

export interface MaterializeInput {
    /** The not-yet-existing name that was mentioned. */
    mention: string;
    /** Who said it, in what situation (so the inference stays grounded). */
    context: string;
    /** Optional nudge; the model also decides on its own. */
    kindHint?: DormantKind;
}

export interface DormantEntity {
    name: string;
    kind: DormantKind;
    dormant: true;
    /** character: 身份/行當; scene: 留空. */
    role?: string;
    /** One-line小傳/描述, grounded in the mention context. */
    brief?: string;
    /** character: relation to the mention's situation (老主顧 / 舊交情…). */
    relation?: string;
    /** Which kind of saga should own it once活了 (江湖人物 / 霞飛路某店 / 某府…). */
    homeSagaHint?: string;
    /** scene: 地點類型 (宅邸 / 店鋪 / 茶樓…). */
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
    const blocks = raw.match(/\{[\s\S]*?\}(?=[^}]*$)/g) ?? raw.match(/\{[\s\S]*\}/g);
    if (!blocks?.length) return null;
    for (let i = blocks.length - 1; i >= 0; i--) {
        try {
            const o = JSON.parse(blocks[i]) as Record<string, unknown>;
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
        } catch {
            /* try an earlier block */
        }
    }
    return null;
}

/**
 * Infer a dormant entity from a mention. No-throw: on miss, returns a bare dormant stub
 * (the name still half-exists) rather than dropping the mention into a hole.
 */
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
            maxTokens: 320,
            temperature: 0.7,
        });
        return (
            parseEntity(res.text, input.mention) ?? {
                name: input.mention.slice(0, 40),
                kind: input.kindHint ?? 'character',
                dormant: true,
            }
        );
    } catch {
        return { name: input.mention.slice(0, 40), kind: input.kindHint ?? 'character', dormant: true };
    }
}
