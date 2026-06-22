/**
 * SHARED CAST. 春雪戲班 (the Spring-Snow troupe).
 *
 * Six founding-cast people, authored in the SAME `FoundingCharSpec` shape the web 創世班底
 * path uses. Each carries a 行當 (becomes the public `role:` tag the POV/roster role
 * resolver reads) and a 2-4 句 小傳 (becomes the chain `profile.description`, surfaced as
 * the roster brief). 行當 are deliberately COMPLEMENTARY (花旦/小生/青衣/老生/刀馬旦/淨) so
 * the troupe can stage a real 戲, and each bio plants a latent tension with at least one
 * castmate, so whatever 土壤 (傾心 / 搭戲) the experiment seeds grows from the SAME blooded
 * people.
 *
 * Both shipped experiments import THIS cast and seed a different stake over it; reading the
 * two reports side by side is then「同一群有血有肉的人、不同土壤長出不同關係網」, not two
 * unrelated runs.
 *
 * cast[0] = 文蘅 (當家花旦) is the marquee lead, so the experiments point their stake's focus
 * (傾心 / 搭戲) at index 0, the person the troupe's gaze already gathers around.
 */
import type { FoundingCharSpec } from '../types';

/**
 * 排序即 cast index（與 stake.targetIndex 對齊）。前 3 人聚在 SCENE_A（排練廳）湊得齊
 * 戲眼，後 3 人在 SCENE_B（後台），由 harness 的場景分配決定，不在這裡指定。
 */
export const SPRING_SNOW_CAST: FoundingCharSpec[] = [
    {
        name: '文蘅',
        gender: '女',
        role: '當家花旦',
        description:
            '春雪戲班的台柱花旦，一亮嗓滿園皆靜，眉眼間自帶三分驕。自幼被班主從水路撿回，戲是她唯一認的家。' +
            '對誰都客氣，卻誰也走不進她心裡，唯獨怕有人比她更被看見。',
        minAttributes: { appearance: 90, disposition: 82, acuity: 76, constitution: 64 },
    },
    {
        name: '孟昭',
        gender: '男',
        role: '小生',
        description:
            '俊朗清雅的當家小生，台上與文蘅一對璧人，台下卻總慢半拍地紅了臉。出身書香，落魄投班，' +
            '把一身規矩都化進水袖裡。暗暗記著文蘅替他遮過的一次失場，那情意自己也說不清是敬還是慕。',
        minAttributes: { appearance: 88, acuity: 82, disposition: 74, constitution: 66 },
    },
    {
        name: '姚青',
        gender: '女',
        role: '青衣',
        description:
            '正工青衣，唱腔沉得住、身段穩得狠，是班裡公認最像「角兒」的人。她比文蘅早入班三年，卻一直屈在二路，' +
            '心裡那口氣憋成了刺。對孟昭有過一段沒挑明的舊情，如今只剩台上對戲時那一瞬的遲疑。',
        minAttributes: { appearance: 84, disposition: 80, acuity: 78, constitution: 64 },
    },
    {
        name: '柳鶴聲',
        gender: '男',
        role: '老生',
        description:
            '掛鬚的老生，戲齡比在場誰都長，半部春雪的規矩都在他肚子裡。性子硬，眼裡揉不得沙，' +
            '看不慣後生為爭一個名額亂了班規。私心盼著把畢生本事傳給一個對的人，卻遲遲不肯點頭是誰。',
        minAttributes: { acuity: 82, disposition: 80, appearance: 64, constitution: 66 },
    },
    {
        name: '蕭破',
        gender: '女',
        role: '刀馬旦',
        description:
            '挑大樑的刀馬旦，翻打俐落、嗓門爽脆，是後台最壓不住的一團火。最看不起扭捏作態，' +
            '偏偏跟青衣姚青同台就針鋒相對，一個嫌一個太冷、一個嫌一個太野。心裡其實服文蘅的戲，只是嘴上不認。',
        minAttributes: { constitution: 88, disposition: 78, appearance: 82, acuity: 74 },
    },
    {
        name: '霍鐵山',
        gender: '男',
        role: '淨',
        description:
            '勾臉的大花臉，嗓如洪鐘，往台上一站就是半壁江山。粗中有細，是班裡的和事佬，誰鬧了彆扭都來找他評理。' +
            '唯獨對柳鶴聲的老規矩既敬又憋，他想試新路子，老生卻總拿祖宗章程壓他。',
        minAttributes: { constitution: 86, disposition: 70, acuity: 68, appearance: 64 },
    },
];

/** Saga premise + scene names shared by every experiment that uses this cast. */
export const SPRING_SNOW_STORY = {
    saga: {
        name: '春雪戲班',
        description:
            '春雪戲班是一個在水鄉碼頭起家、靠一齣齣戲掙命的老班子。台柱、二路、文武場各擅勝場，' +
            '名額與戲份卻永遠不夠分，台上是一家人，台下各有各的盤算與心事。',
    },
    scenes: [{ name: '排練廳' }, { name: '後台' }],
} as const;
