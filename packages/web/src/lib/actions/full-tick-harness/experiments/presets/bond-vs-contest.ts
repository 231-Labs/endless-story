/**
 * PRESET — 戀慕 vs 競爭·整合版第一步「先觀察」(bond meets contest, observe first).
 *
 * The same 師姐妹 pair (柳生春 / 蘇映雪) now sit in BOTH soils at once: a partnership
 * stake (only one 掛頭牌 台柱 spot, capacity 1) makes them rivals, while their genesis
 * old-flames make them lovers. The question this preset asks is the one you raised:
 * does 戀慕 SOFTEN 競爭 on its own, or does the model just compete?
 *
 * Deliberately NOT tender: a global tender stance would pre-soften the contest and beg
 * the question. So this run keeps `emotionalStance` restrained (rivalry stays sharp) and
 * only warms the COLOUR a little (toneRegister) so it isn't bleak. We watch whether the
 * romance edge, once it accrues, makes either of them pull a punch — purely from the LLM,
 * no mechanism yet.
 *
 * Next step (per the design): if the model does NOT soften on its own, add either
 * per-relationship stance (tender toward the lover, restrained toward the rival) or a
 * relationship MILESTONE (a 表白 event when the romance edge holds strong long enough),
 * which is the dramatic pivot where 因相戀而不爭 actually turns.
 *
 *   lab.ts bond-vs-contest [ticks]
 */
import type { ExperimentConfig, FoundingCharSpec } from '../types';

const CAST: FoundingCharSpec[] = [
    {
        name: '柳生春',
        gender: '女',
        role: '小生',
        ageYears: 24,
        description:
            '春雪社當紅小生，台上一柄摺扇撩動滿堂春水的風流少年郎，台下卻愛撒嬌、最黏師姐蘇映雪。' +
            '這回班主要立一個掛頭牌的台柱，只一個位置，她想要——可要爭，就得從蘇映雪手裡爭。',
        minAttributes: { appearance: 88, constitution: 72, acuity: 82, disposition: 76 },
    },
    {
        name: '蘇映雪',
        gender: '女',
        role: '花旦',
        ageYears: 28,
        description:
            '春雪社的台柱花旦，台上端莊，台下對柳生春藏不住偏疼，真把這小生當自己的小郎君。' +
            '頭牌只立一個，她守了這些年的台柱位不願讓；偏偏這回要爭的人，是柳生春。',
        minAttributes: { appearance: 88, constitution: 64, acuity: 78, disposition: 82 },
    },
    {
        name: '田巧雲',
        gender: '女',
        role: '老旦',
        ageYears: 55,
        description:
            '春雪社的班主，唱了一輩子老旦。這幾日她要定下誰掛頭牌的台柱——' +
            '柳生春的勢頭、蘇映雪的功底，她兩個都疼，偏只能點一個，左右為難。',
        minAttributes: { appearance: 60, constitution: 70, acuity: 82, disposition: 70 },
    },
    {
        name: '賴金喜',
        gender: '男',
        role: '丑',
        ageYears: 30,
        description:
            '春雪社的丑角，台上插科打諢，台下閒不住。頭牌之爭鬧得後台氣壓低，' +
            '他揣著炒栗子兩頭討好，誰繃著臉就湊過去逗一句，盼這倆師姐妹別真生分了。',
        minAttributes: { appearance: 58, constitution: 76, acuity: 75, disposition: 58 },
    },
];

export const bondVsContest: ExperimentConfig = {
    name: 'bond-vs-contest',
    description:
        '戀慕 vs 競爭·先觀察：柳生春與蘇映雪同爭一個頭牌位（competition），又有 genesis 舊情（romance）。' +
        '刻意不套 tender，看戀慕能否「自己」軟化競爭，作為加機制前的基準。',
    ticks: 4,
    cast: { count: CAST.length },
    story: {
        saga: {
            name: '春雪社',
            description: '一個彼此照應卻也要爭角兒的小戲班，在雲錦台討生活。台上爭好角，台下是十幾年的舊情。',
        },
        scenes: [{ name: '後台妝閣' }, { name: '雲錦台戲台' }],
        cast: CAST,
        // Warm the COLOUR so it isn't bleak, but DO NOT relax the stance — rivalry must
        // stay sharp so we can see whether the romance edge softens it on its own.
        soul: {
            toneRegister:
                '底色不必冷雨孤燈，後台仍有煙火與人情；但這一場各有各的盤算與牽掛，讓每個人照自己的心思走，別替他們先和解。',
        },
    },
    stake: {
        // 兩人同爭「掛頭牌」這唯一的台柱位（capacity 1）。target 指柳生春，framing 點明這是與蘇映雪之爭。
        kind: 'partnership',
        targetIndex: 0,
        capacity: 1,
    },
    framingOverride:
        '春雪社只立一個掛頭牌的台柱，班主這幾日要定人選。柳生春與蘇映雪打小相依、舊情深種，如今卻同爭這唯一的角兒位置——爭，又捨不得。',
    settle: 'relationship-evolve',
};

export default bondVsContest;
