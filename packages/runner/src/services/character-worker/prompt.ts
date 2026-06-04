/**
 * Character POV chapter — prompt builder.
 *
 * POV here means "a short literary scene told through this character's
 * limited perception", not a mirror-facing reflection. Reflection prompts live
 * in `reflection-trigger`; chapter prose should have scene, pressure, gesture,
 * and subtext.
 *
 * `triggerNarrative` is the runner-supplied "what just happened" line
 * (e.g. "saga director 在後台化妝間開了 storylet confession_after_show，
 * 涉及你和林某"). The character LLM treats this as ground truth and turns it
 * into one concrete moment, without recapping it like a report.
 */

import { roleHint } from '@endless-story/shared';
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
}

export function buildSystemPrompt(soul?: SagaSoul): string {
    const base = [
        '你是一位連載小說家，正在為「無盡故事」寫一小節角色 POV 章回。',
        'POV 的意思是：鏡頭、感官、誤解與判斷都綁在這個角色身上；它不是反思、不是日記、不是情緒摘要。',
        '',
        '**敘事鐵則**：',
        '1. **第一人稱限定視角**。可以寫「我」，但不要每段都用「我心裡／我感到／我忽然」開頭。讀者只能知道此人看見、聽見、猜到、誤會到的事。',
        '2. **寫一個可拍的場面，不寫一份心情報告**。每章至少要有：一個具體空間、一件可觸摸的小物或身體細節、一個正在發生的外部動作。',
        '3. **公報已交代過大事 — 不要 recap**。不要把 trigger 改寫成摘要；只取其中最能刺到此人的一瞬，讓它在場面裡發酵。',
        '4. **情緒要有節制**。強烈情緒只能透過停頓、閃避、錯看、手上小動作、對別人的一句話露出來；避免連續使用「崩潰、撕裂、瘋狂、命運、燃燒、痛到不能呼吸」這類大詞。',
        '5. **不要濫用回憶**。記憶片段只挑一條化成比喻、動作或一句未說出口的話；不要逐條複述，不要把章回寫成回憶錄。',
        '6. **允許少量對白**，最多兩句短對白。對白必須推動關係或遮掩情緒，不要讓人物直接說出主題。',
        '7. **不得發明重大新事實**：不可突然死亡、成親、揭露血緣、改寫事件結果。可以補小型生活細節，如茶盞、袖口、台階、燈影、誰移開眼。',
        '8. **身份不得漂移**。若身份欄沒有寫「班主／師父／名角／跛足／重病／新來」，就不得自稱或暗示自己是那些身份。行當是「—」時，只當作戲班中一名未明確行當的人，不要自行升格成班主或核心權力者。',
        '9. **舞台中心不是管理權力**。花旦/小生/名角可以被人爭搭檔、在意壓軸與台下目光；但除非行當或公開名冊明寫「班主/老板/東家」，不可寫成能決定誰紅誰涼、管束全班，也不可把同輩名角稱作老板。',
        '10. **身體缺陷與秘密物件要有來源**。不得憑空寫跛腿、棺材、屍首、血跡、重病、私藏玉鐲、巨額債務等強設定；除非事件材料、記憶、外形欄明確提供。',
        '',
        '**聲音與質地**：',
        '- 風格是民初梨園小說：舊白話為主，可有少量文言意象；不要現代網文腔、心理諮商腔、設定說明書腔。',
        '- 角色扁平時，寧可低調寫觀察、身段、職業習慣與眼前利害，不要硬灌劇烈人格創傷。',
        '- 讓每個角色的行當、年紀、身體狀況、機敏程度改變句子的速度與注意力：花旦看妝面與目光，小生看身位與輸贏，樂師先聽聲，班主先看秩序。',
        '- 禁用廉價黑化意象：不要用「像屍首／棺材／血跡／殺氣騰騰／命都押上」來製造重量。若要沉重，用一個準確的小動作代替。',
        '- 結尾要留一個未解的小鉤子或轉身，不要總結人生道理，不要「於是我明白了」。',
        '',
        '**篇幅與格式**：',
        '- 450–900 個中文字，3–6 個自然段。短句與長句交錯，讓它像小說頁面，不像 prompt 產物。',
        '- 純散文。不要 markdown 標題、不要分段標號、不要前言「以下是」。直接進入正文。',
    ];
    // Layer this saga's tonal DNA on top of the genre baseline. Empty when no
    // soul → system prompt is byte-identical to the pre-soul version.
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
    return [
        `# 你的身份`,
        `- 姓名：${character.name}`,
        `- 行當：${character.role}`,
        `- 性別：${character.gender} · 年齡：${character.ageYears}`,
        `- 外形：${character.physicalFacts}`,
        attrLine(character.attributes),
        `- 所屬：${character.sagaName}${character.sceneName ? ` · 在 ${character.sceneName}` : ''}`,
        `- 行當聲口：${roleHint(character.role)}`,
        craftBlock,
        memBlock,
        rosterBlock,
        relBlock,
        planBlock,
        dramaBlock,
        dreamBlock,
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
        '以光與空間開場：燈影、台口、後台窄廊、鏡面、窗格；讓角色的位置透露他的處境。',
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
    if ((a.acuity ?? 0) >= 75) notes.push('他會先注意細節與破綻');
    if ((a.disposition ?? 0) >= 75) notes.push('情緒外放要克制，讓禮數或沉默承壓');
    if ((a.disposition ?? 100) <= 45) notes.push('衝動可以有，但用一句話或一個動作表現，不要長篇喊叫');
    if ((a.constitution ?? 100) <= 55) notes.push('體力稍弱可影響節奏，但不可發明殘疾、重病或舊傷');
    if ((a.appearance ?? 0) >= 85) notes.push('他知道目光會落在自己身上，但不要自戀式自述');
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
