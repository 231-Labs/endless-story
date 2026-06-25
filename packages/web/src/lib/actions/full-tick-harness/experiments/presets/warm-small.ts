/**
 * PRESET — 暖戲班·小型版 (warm troupe, small cast).
 *
 * A deliberately SMALL, WARM-toned counterpart to the 8-person canon presets. Four
 * people instead of eight (the graph stays readable; the cooling engine's ebb is easy
 * to see), and the bios lean warm instead of carrying the canon's ache: the 師姐妹 pair
 * (柳生春 / 蘇映雪) plus a fond 班主 and a clowning 丑 for hearth-warmth and banter.
 *
 * The narrative knobs are set on `story.soul`: `emotionalStance: 'tender'` (lets people
 * approach + land on a warm beat instead of the half-inch-apart default) and a warm
 * `toneRegister`. With the cooling engine on, ties now ebb when un-tended, so over a few
 * ticks you should see the graph breathe (warm bonds maintained, stray gazes fading)
 * rather than monotonically pile toward romance.
 *
 *   lab.ts warm-small [ticks]
 */
import type { ExperimentConfig, FoundingCharSpec } from '../types';

const WARM_CAST: FoundingCharSpec[] = [
    {
        name: '柳生春',
        gender: '女',
        role: '小生',
        ageYears: 24,
        description:
            '春雪社當紅小生，台上一柄摺扇便能撩動滿堂春水的風流少年郎；台下卻是個愛撒嬌、' +
            '最黏師姐蘇映雪的暖姑娘，對人客氣周到，沒有台上那種會辜負人的薄情。散戲後最愛賴在妝閣，' +
            '等師姐替她卸頭面、分一盞熱茶。',
        minAttributes: { appearance: 88, constitution: 72, acuity: 82, disposition: 76 },
    },
    {
        name: '蘇映雪',
        gender: '女',
        role: '花旦',
        ageYears: 28,
        description:
            '春雪社的台柱花旦，台上端莊，台下極懂分寸，總替全班圓場。旁人只見她穩，' +
            '唯獨對柳生春藏不住那點偏疼：真把這小生當自己的小郎君，替她理鬢角、留最好的點心，' +
            '嘴上嫌她貪睡，手裡卻先把茶溫好。',
        minAttributes: { appearance: 88, constitution: 64, acuity: 78, disposition: 82 },
    },
    {
        name: '田巧雲',
        gender: '女',
        role: '老旦',
        ageYears: 55,
        description:
            '春雪社的班主，唱了一輩子老旦，如今管著一班人的吃穿冷暖。嘴上規矩嚴，' +
            '心裡把戲班當一家子：誰嗓子啞了她記著，誰夜裡咳了她聽得見，最樂見這群孩子湊在燈下說笑。',
        minAttributes: { appearance: 60, constitution: 70, acuity: 80, disposition: 72 },
    },
    {
        name: '賴金喜',
        gender: '男',
        role: '丑',
        ageYears: 30,
        description:
            '春雪社的丑角，台上插科打諢，台下是個閒不住的活寶：揣著炒栗子滿後台轉，' +
            '誰繃著臉他偏要逗出個笑來。手腳勤快，場面一冷他頭一個熱場，是這戲班的煙火氣。',
        minAttributes: { appearance: 58, constitution: 76, acuity: 75, disposition: 58 },
    },
];

export const warmSmall: ExperimentConfig = {
    name: 'warm-small',
    description:
        '暖戲班·小型版：四人春雪社（師姐妹＋慈班主＋活寶丑角），底色溫暖（tender＋暖亮）。' +
        '看冷卻引擎下，關係如何潮起潮落而非只增不減。',
    ticks: 4,
    cast: { count: WARM_CAST.length },
    story: {
        saga: {
            name: '春雪社',
            description:
                '一個彼此照應的小戲班，在雲錦台討生活。台上爭的是好角兒，台下守的是燈下這點熱乎人情。',
        },
        scenes: [{ name: '後台妝閣' }, { name: '雲錦台戲台' }],
        cast: WARM_CAST,
        soul: {
            emotionalStance: 'tender',
            toneRegister:
                '這個戲班的底色是暖的。後台有市井煙火氣、彼此打趣的熱乎勁、過日子的人情；' +
                '暖光、笑鬧、被人惦記的踏實，都往濃裡寫，不是冷雨孤燈。',
        },
    },
    stake: {
        // 師姐妹傾心土壤，但暖：把柳生春放 index 0，眾人的暖意繞著她，而不是搶一個名額。
        kind: 'affection',
        targetIndex: 0,
        capacity: 1,
    },
    framingOverride:
        '後台燈下，眾人的心思都繞著{target}打轉，暖意藏在替她理鬢、留茶、逗笑的尋常照應裡',
    settle: 'relationship-evolve',
};

export default warmSmall;
