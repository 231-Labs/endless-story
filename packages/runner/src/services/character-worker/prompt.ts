/**
 * Character POV chapter — prompt builder.
 *
 * POV here means "a short literary scene told through this character's
 * limited perception", not a mirror-facing reflection. Reflection prompts live
 * in `reflection-trigger`; chapter prose should have scene, pressure, gesture,
 * and subtext.
 *
 * `triggerNarrative` is the runner-supplied "what just happened" line
 * (e.g. "saga director opened storylet confession_after_show in the backstage
 * dressing room, involving you and Lin"). The character LLM treats this as ground truth and turns it
 * into one concrete moment, without recapping it like a report.
 */

import { craftGuardrail, roleHint } from '@endless-story/shared';
import { type SagaSoul, buildSagaSoulBlock } from './saga-soul.js';

export type { SagaSoul } from './saga-soul.js';

export interface CharacterSnapshot {
    id: string;
    name: string;
    role: string;
    gender: string;
    ageYears: number;
    sagaName: string;
    sceneName?: string;
    /** Plain physical description (chain `physical_facts`). */
    physicalFacts: string;
    /** Chain attributes: appearance / constitution / acuity / disposition. */
    attributes: {
        appearance?: number;
        constitution?: number;
        acuity?: number;
        disposition?: number;
    };
}

export interface PovPromptInput {
    character: CharacterSnapshot;
    /** Storyteller-supplied "what just happened" line. */
    triggerNarrative: string;
    /** Optional: 1-3 short memory snippets (last reflections / past POV
     *  chapter excerpts) for continuity. Pass empty for first chapter. */
    recentMemorySnippets: string[];
    /** Optional: owner-injected dream text (R5). One per chapter max.
     *  When set, prompt explicitly asks LLM to weave it in. */
    dreamFragment?: string;
    /** Optional: subjective relationship memories + public director ties.
     *  Colours how she narrates others in the scene. */
    relationshipHints?: string[];
    /** Optional: public saga roster lines. Not private feeling. */
    rosterContext?: string[];
    /** Optional: current plan (N6) — her goal + intent. Gives the monologue
     *  forward tension (what she's reaching for), not just present sensation. */
    planHint?: string;
    /** Optional: drama-engine tension (DR-6) — her dominant unmet desire over a
     *  scarce on-chain resource. Lets the monologue ache for what she lacks. */
    dramaHint?: string;
    /** Optional: OBJECTIVE same-scene beats this tick — the observable acts of
     *  OTHER characters in this character's scene (talk lines, arrivals/exits,
     *  card plays). Every same-scene POV gets the SAME list, so their angles
     *  complement (interpret the same facts) rather than contradict (invent
     *  who-did-what). Private observations are deliberately excluded. */
    sceneBeats?: string[];
}

/** Chapter mode — swaps only the framing; the no-fabrication / identity / pronoun
 *  iron rules + voice apply to all. `pov` = event-anchored serial chapter;
 *  `genesis` = the character's first "入世序章" (front door, no 承上, leans on life
 *  memories for thickness); `encounter` = quiet two-person 關係戲/溫情 (no competition). */
export type ChapterMode = 'pov' | 'genesis' | 'encounter';

// Shared across all modes: the guardrails that keep prose grounded + in-character.
const IRON_RULES = [
    '**敘事鐵則**：',
    '1. **第一人稱限定視角**。可以寫「我」，但不要每段都用「我心裡／我感到／我忽然」開頭。讀者只能知道此人看見、聽見、猜到、誤會到的事。',
    '2. **寫一個可拍的場面，不寫一份心情報告**。每章至少要有：一個具體空間、一件可觸摸的小物或身體細節、一個正在發生的外部動作。',
    '3. **不要把材料改寫成摘要**。只取其中最能刺到此人的一瞬，讓它在場面裡發酵。',
    '4. **情緒要有節制**。強烈情緒只能透過停頓、閃避、錯看、手上小動作、對別人的一句話露出來；避免連續使用「崩潰、撕裂、瘋狂、命運、燃燒、痛到不能呼吸」這類大詞。',
    '5. **不要濫用回憶**。記憶片段只挑一條化成比喻、動作或一句未說出口的話；不要逐條複述，不要把章回寫成回憶錄。',
    '6. **對白只能引用客觀台詞，不可自創**。引號內任何人說出口的話，只能逐字引用「本場此刻」列出的台詞，或材料裡寫明「你方才說過」的話。**嚴禁憑空捏造任何人(包括你自己)說出口的新對白**。沒有可引用的台詞時，就不要寫對白，改用動作、神色、未說出口的心聲。',
    '7. **不得發明重大新事實**：不可突然死亡、成親、揭露血緣、改寫事件結果。可以補小型生活細節，如茶盞、袖口、台階、燈影、誰移開眼。',
    '8. **身份不得漂移**。若身份欄沒有寫「班主／師父／名角／跛足／重病／新來」，就不得自稱或暗示自己是那些身份。行當是「—」時，只當作戲班中一名未明確行當的人，不要自行升格成班主或核心權力者。',
    '9. **舞台中心不是管理權力**。花旦/小生/名角可以被人爭搭檔、在意壓軸與台下目光；但除非行當或公開名冊明寫「班主/老板/東家」，不可寫成能決定誰紅誰涼、管束全班。',
    '10. **身體缺陷與秘密物件要有來源**。不得憑空寫跛腿、棺材、屍首、血跡、重病、私藏玉鐲、巨額債務等強設定；除非材料、記憶、外形欄明確提供。',
    '11. **同場客觀事實不可改寫**。若「本場此刻」列出了同場其他人剛剛的動作或話語，那是已發生的事實：你可以寫你如何看見、誤讀、回應，但不可寫成「沒發生」、「相反地發生」、或「換成別人做」。',
];
const VOICE = [
    '**聲音與質地**：',
    '- 風格是民初梨園小說：舊白話為主，可有少量文言意象；不要現代網文腔、心理諮商腔、設定說明書腔。',
    '- 角色扁平時，寧可低調寫觀察、身段、職業習慣與眼前利害，不要硬灌劇烈人格創傷。',
    '- 讓每個角色的行當、年紀、身體狀況、機敏程度改變句子的速度與注意力：花旦看妝面與目光，小生看身位與輸贏，樂師先聽聲，班主先看秩序。',
    '- 禁用廉價黑化意象：不要用「像屍首／棺材／血跡／殺氣騰騰／命都押上」來製造重量。若要沉重，用一個準確的小動作代替。',
    '- 結尾要留一個未解的小鉤子或轉身，不要總結人生道理，不要「於是我明白了」。',
];

export function buildSystemPrompt(soul?: SagaSoul, mode: ChapterMode = 'pov'): string {
    let base: string[];
    if (mode === 'genesis') {
        base = [
            '你是一位連載小說家，為一個角色寫整本角色連載的**第一篇·入世序章**——讀者認識這個人的前門。',
            '**不是設定條列、不是人物介紹。**寫一個具體的此刻場景（散戲後的空台、初到戲班那夜、第一次照面…）。',
            '',
            ...IRON_RULES,
            '',
            '**入世序章專則**：',
            '- 這是第一篇，**沒有「承上」**；但要在動作與停頓裡讓讀者看見：你是誰、你揣著什麼放不下的事（私帳揭一角、不全盤托出）、你在這班裡守著或圖著什麼。',
            '- **動用你的長期記憶把人寫厚**：材料會給你這個人此生的記憶（童年、家世、癖好、舊情、不只工作）。化用其中一兩條當血肉，讓讀者覺得這是一個活過的人，不是一份職務說明。',
            '- 結尾把那個將至的風聲（材料給的【將至的引線】，若有）輕輕帶到心上——此刻還沒爭、沒輸贏，只是平衡將破的前一刻。',
            '',
            ...VOICE,
            '',
            '**篇幅與格式**：600–1000 中文字，4–6 段。純散文，直接進正文，不要標題、不要「以下是」。',
        ];
    } else if (mode === 'encounter') {
        base = [
            '你是一位連載小說家，寫一回「關係戲／溫情」——兩個人之間一種難以言喻、擺在檯面下誰也不先點破的張力。',
            '張力的性質見材料【這份關係】（可能是愛而不得、後輩追慕前輩的蒼涼、舊怨未了）。這不是競爭、沒有輸贏。',
            '',
            ...IRON_RULES,
            '',
            '**關係戲專則**：',
            '- 全程一件具體的瑣事（繫水袖、收靠旗、卸妝、擦一隻舊錶、分一盞茶），真正的張力在動作底下走。',
            '- 靠潛台詞、停頓、欲言又止、一個多停的眼神、一次該收回卻沒收回的手——**不要直白點破**。',
            '- 這一回結束時，兩人之間「那層沒說破的東西」要有一個極輕微的移動：近一寸、或更怕一分、或第一次都意識到卻又一起繞開。',
            '- 私帳（材料給的）揭一角；對白只引材料給的，不可把那層關係直接說破。',
            '',
            ...VOICE,
            '',
            '**篇幅與格式**：700–1100 中文字，純散文，直接進正文，不要標題。',
        ];
    } else {
        base = [
            '你是一位連載小說家，正在為「無盡故事」寫一小節角色 POV 章回。',
            'POV 的意思是：鏡頭、感官、誤解與判斷都綁在這個角色身上；它不是反思、不是日記、不是情緒摘要。',
            '',
            ...IRON_RULES,
            '',
            '**連載推進（每回必做）**：這是連載章回，不是孤立場景；一回讀完，必須有東西動了。',
            '- **承上**：開頭用一兩句勾連上一回留下的懸念或餘味，讓老讀者立刻接上，不要從零起手。',
            '- **推進**：讓主角經歷事件材料裡的轉折、做出或承受一個選擇、付出代價——這個角色或他的處境，結尾必須和開頭不一樣。',
            '- **啟下**：結尾的鉤子要是這一回的後果催生出的新問題，而不是無關的小轉身或人生感悟。',
            '',
            ...VOICE,
            '',
            '**篇幅與格式**：',
            '- 450–900 個中文字，3–6 個自然段。短句與長句交錯，讓它像小說頁面，不像 prompt 產物。',
            '- 純散文。不要 markdown 標題、不要分段標號、不要前言「以下是」。直接進入正文。',
        ];
    }
    // Layer this saga's tonal DNA on top of the genre baseline.
    const soulBlock = buildSagaSoulBlock(soul);
    return soulBlock ? `${base.join('\n')}\n${soulBlock}` : base.join('\n');
}

export function buildUserPrompt(input: PovPromptInput): string {
    const { character, triggerNarrative, recentMemorySnippets, dreamFragment } = input;
    const craftBlock = buildCraftDirective(character);
    const safeMemorySnippets = filterPovMemorySnippets(recentMemorySnippets, character);
    const memBlock =
        safeMemorySnippets.length > 0
            ? '\n## 可用記憶材料（只可取一兩個細節，化入場面；不可逐條複述）\n' +
              safeMemorySnippets
                  .slice(0, 5)
                  .map((m, i) => `${i + 1}. ${m.slice(0, 220)}${m.length > 220 ? '…' : ''}`)
                  .join('\n')
            : '';
    const relBlock =
        input.relationshipHints && input.relationshipHints.length > 0
            ? '\n## 關係壓力（讓它影響你看誰、避開誰、對誰說半句話）\n' +
              input.relationshipHints.map((r) => `- ${r}`).join('\n')
            : '';
    const rosterBlock =
        input.rosterContext && input.rosterContext.length > 0
            ? '\n## 同 saga 公開名冊（公開身份與所在；不代表你私下熟識）\n' +
              input.rosterContext.map((r) => `- ${r}`).join('\n')
            : '';
    const planBlock = input.planHint
        ? `\n## 當下目標（讓場面有方向，不要直接宣告）\n${input.planHint}`
        : '';
    const dramaBlock = input.dramaHint
        ? `\n## 稀缺張力（讓它變成行動或視線，不要變成喊口號）\n${input.dramaHint}`
        : '';
    const dreamBlock = dreamFragment
        ? `\n## 夢境片段（必須取其中一個意象，變成場面裡的感官錨點）\n${dreamFragment}`
        : '';
    const sceneBeatsBlock =
        input.sceneBeats && input.sceneBeats.length > 0
            ? '\n## 本場此刻（客觀事實 — 同場其他人剛剛的舉動，你必須認帳，只可詮釋、不可改寫）\n' +
              input.sceneBeats.slice(0, 8).map((b) => `- ${b}`).join('\n')
            : '';
    return [
        `# 你的身份`,
        `- 姓名：${character.name}`,
        `- 行當：${character.role}`,
        `- 性別：${character.gender} · 年齡：${character.ageYears}`,
        `- 外形：${character.physicalFacts}`,
        attrLine(character.attributes),
        `- 所屬：${character.sagaName}${character.sceneName ? ` · 在 ${character.sceneName}` : ''}`,
        `- 行當聲口：${roleHint(character.role)}`,
        (() => {
            const guard = craftGuardrail(character.role);
            return guard ? `- 行當守門（讀者看不到、別寫進正文）：${guard}` : '';
        })(),
        craftBlock,
        memBlock,
        rosterBlock,
        relBlock,
        planBlock,
        dramaBlock,
        dreamBlock,
        sceneBeatsBlock,
        '',
        '## 事件材料（這是背景，不是正文摘要）',
        triggerNarrative,
        '',
        '請把上述材料寫成一小節角色限定視角小說。不要寫反思；不要解釋你如何寫作；直接輸出正文。',
    ]
        .filter((s) => s !== '')
        .join('\n');
}

function buildCraftDirective(character: CharacterSnapshot): string {
    const seed = hashString(`${character.id}:${character.name}:${character.role}`);
    const openingLens = [
        '以一件可觸摸的小物開場：袖口、茶盞、簪釵、票紙、戲箱、槍桿、琴弦都可以；讓手先說話。',
        '以聲音開場：隔壁一句唱腔、木板響、雨聲、鑼鼓餘音、有人壓低的咳嗽；先聽見，再看見。',
        '以光與空間開場：燈影、台口、後台窄廊、鏡面、窗格；讓角色的位置透露其處境。',
        '以身體微感開場：粉黏在頸側、衣料勒住、肩背發緊、喉頭發乾；不要誇張，只寫一處。',
        '以別人的一個小動作開場：避開目光、放慢步子、收住半句話；讓角色先誤讀它。',
        '以移動開場：從台口退回、穿過後廊、繞過桌角、跨過箱籠；讓章回有一個方向。',
    ][seed % 6];
    const narrativeMove = [
        '中段安排一個小阻礙，讓角色不得不做選擇：沉默、伸手、退半步、說一句不完整的話。',
        '中段讓角色看見一個人，卻真正寫的是自己不願承認的欲望。',
        '中段放一個短對白或未出口的稱呼，讓關係變緊，不要讓人物直接表白。',
        '中段讓記憶只閃一下，像錯落的燈，不要進入長篇追憶。',
        '中段把注意力轉到一個職業細節：身段、調門、妝面、站位、台下眼色。',
    ][Math.floor(seed / 7) % 5];
    const attributePressure = attributeDirective(character.attributes);
    return [
        '',
        '## 本章工法（為了避免每個 POV 長得一樣，請嚴格遵守）',
        `- 開場鏡頭：${openingLens}`,
        `- 場面推進：${narrativeMove}`,
        `- 角色質地：${attributePressure}`,
    ].join('\n');
}

function filterPovMemorySnippets(snippets: string[], character: CharacterSnapshot): string[] {
    return snippets.filter((snippet) => findUngroundedHeavyMotifs(snippet, character).length === 0);
}

export function findUngroundedHeavyMotifs(text: string, character: CharacterSnapshot): string[] {
    const identityText = [
        character.role,
        character.physicalFacts,
        character.sceneName,
    ].join(' ');
    return HEAVY_MOTIFS.filter((word) => text.includes(word) && !identityText.includes(word));
}

const HEAVY_MOTIFS = [
    '跛',
    '厚底靴',
    '膝蓋',
    '藥酒',
    '跌打',
    '舊傷',
    '燒刀子',
    '擋酒',
    '拿命',
    '腿彎',
    '腳下一軟',
    '腳趾頭',
    '這條腿',
    '棺',
    '屍',
    '死人',
    '血跡',
    '殺氣',
    '煞氣',
    '殺人',
    '靈堂',
    '紙紮',
];

function attributeDirective(a: CharacterSnapshot['attributes']): string {
    const notes: string[] = [];
    if ((a.acuity ?? 0) >= 75) notes.push('會先注意細節與破綻');
    if ((a.disposition ?? 0) >= 75) notes.push('情緒外放要克制，讓禮數或沉默承壓');
    if ((a.disposition ?? 100) <= 45) notes.push('衝動可以有，但用一句話或一個動作表現，不要長篇喊叫');
    if ((a.constitution ?? 100) <= 55) notes.push('體力稍弱可影響節奏，但不可發明殘疾、重病或舊傷');
    if ((a.appearance ?? 0) >= 85) notes.push('知道目光會落在自己身上，但不要自戀式自述');
    return notes.length > 0 ? notes.join('；') : '設定不完整時，採低調寫法：先寫眼前物與行當習慣，再讓情緒慢慢浮出';
}

function hashString(text: string): number {
    let h = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

function attrLine(a: CharacterSnapshot['attributes']): string {
    const parts: string[] = [];
    if (a.appearance != null) parts.push(`外貌 ${a.appearance}`);
    if (a.constitution != null) parts.push(`筋骨 ${a.constitution}`);
    if (a.acuity != null) parts.push(`機敏 ${a.acuity}`);
    if (a.disposition != null) parts.push(`心性 ${a.disposition}`);
    if (parts.length === 0) return '';
    return `- 屬性：${parts.join(' · ')}`;
}
