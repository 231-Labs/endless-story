/**
 * Aid-decision eval scenarios — persona × relationship. A fixed panel of five people (a lover,
 * a mentor, a friend, an ambiguous flirt, a man to win over), each with their OWN personality
 * and a different predicament (need vs want vs loan vs bribe). The SAME panel is judged by
 * givers of opposing temperaments, so we can see that the money flow reorganizes around WHO the
 * giver is — not a fixed rule.
 *
 * Each scenario carries `recorded`: the raw JSON a model returns. Offline (no API key) the eval
 * feeds `recorded` (Claude standing in for the model) through the REAL parseAid + finalizeAid
 * guards and grades it; with a key it calls the live cheap-tier model instead. `check` is the
 * grader — hard cases must pass; judgment cases are observed by eye via the printed reason.
 */

import type { AidActionInput, AidActionResult } from '../aid-prompt.js';

export interface AidScenario {
    id: string;
    note: string;
    hard: boolean;
    input: AidActionInput;
    /** raw model output used when no API key is present (the stand-in's answer). */
    recorded: string;
    check: (r: AidActionResult) => boolean;
}

// ── result helpers for the graders ───────────────────────────────────────────
export const gaveTo = (r: AidActionResult, id: string): boolean => r.gifts.some((g) => g.recipientId === id);
export const amountTo = (r: AidActionResult, id: string): number => r.gifts.find((g) => g.recipientId === id)?.amount ?? 0;
export const memoTo = (r: AidActionResult, id: string): string | undefined => r.gifts.find((g) => g.recipientId === id)?.memo;
export const mannerTo = (r: AidActionResult, id: string): string | undefined => r.gifts.find((g) => g.recipientId === id)?.manner;
export const total = (r: AidActionResult): number => r.gifts.reduce((s, g) => s + g.amount, 0);

// ── the shared five-person panel (ids reused across givers) ──────────────────
const PANEL: AidActionInput['peers'] = [
    {
        id: '0xlover', name: '蘇晚晴', role: '青衣', relation: 'lover',
        personality: '溫婉而要強，凡事自己吞，不願被當成誰的包袱',
        situation: 'dire-need', distress: '染恙臥床，藥錢還差約 20', runwayDays: 3, faceSensitive: true,
        recentMemory: '她連發燒都只說是台上吹了風',
    },
    {
        id: '0xmentor', name: '周伯昌', role: '老生', relation: 'mentor',
        personality: '清高自重，當年傾囊授藝，如今潦倒也絕不開口求人',
        situation: 'dire-need', distress: '斷炊在即，今夜恐難捱', runwayDays: 1, faceSensitive: true,
        recentMemory: '我這一身戲路，都是他一句一句教出來的',
    },
    {
        id: '0xfriend', name: '馬二', role: '丑角', relation: 'friend',
        personality: '豪爽講義氣，有借有還',
        situation: 'loan-request', distress: '一時週轉不靈，想跟你應個急', runwayDays: 4, askAmount: 15,
        recentMemory: '上回借的，沒到約期就還清了',
    },
    {
        id: '0xambi', name: '柳如煙', role: '花旦', relation: 'ambiguous',
        personality: '嬌俏慣於受人追捧，未必真缺',
        situation: 'wants-luxury', distress: '想湊一筆添置新行頭，說是好替你長面子', runwayDays: 25, askAmount: 30,
        recentMemory: '她慣於要人捧著，撒個嬌就想要東西',
    },
    {
        id: '0xrecruit', name: '鄭班頭', role: '管事', relation: 'recruit-target',
        personality: '勢利，誰給好處就向著誰',
        situation: 'bribe-offer', distress: '暗示你「表示表示」，下季好台口便關照你', runwayDays: 999, askAmount: 20,
        recentMemory: '排戲的權柄都攥在他手裡',
    },
];

export const AID_SCENARIOS: AidScenario[] = [
    {
        id: 'G1 重情守義·家底中等',
        note: '沈鶴年（重情、守義、謹慎）：錢應流向命懸＋恩情；拒賄賂、拒討好；留底自保',
        hard: true,
        input: {
            name: '沈鶴年', role: '老生', persona: '重情念舊、守義，不屑鑽營買好',
            traits: ['重情', '守義', '謹慎'], funds: 60, dailyCost: 7, runwayDays: 8, vitalityState: 'healthy',
            planHint: '守住這季的戲與舊人',
            peers: PANEL,
        },
        recorded: JSON.stringify({
            gifts: [
                { recipientId: '0xmentor', amount: 18, memo: 'tribute', manner: 'via-proxy', reason: '恩師清高，託人代付藥錢，保他體面' },
                { recipientId: '0xlover', amount: 12, memo: 'gift', manner: 'disguised', reason: '她要強，只說是順手抓的藥' },
                { recipientId: '0xfriend', amount: 10, memo: 'loan', manner: 'as-loan', reason: '馬二有借有還，借他應急' },
            ],
            reason: '先救命懸與恩情，曖昧閒財與買台口一概不給，留底二十自保',
        }),
        check: (r) => gaveTo(r, '0xmentor') && gaveTo(r, '0xlover') && !gaveTo(r, '0xrecruit') && total(r) <= 60,
    },
    {
        id: 'G2 勢利精算·家底厚',
        note: '白薇（勢利、精算、重利）：錢流向有用/有回報；冷待潦倒卻無益的恩師',
        hard: true,
        input: {
            name: '白薇', role: '花旦', persona: '勢利精算、重利輕情，凡事看人脈與回報',
            traits: ['勢利', '精算', '重利'], funds: 200, dailyCost: 8, runwayDays: 999, vitalityState: 'healthy',
            peers: PANEL,
        },
        recorded: JSON.stringify({
            gifts: [
                { recipientId: '0xfriend', amount: 15, memo: 'loan', manner: 'as-loan', reason: '他會還，安全的人情' },
                { recipientId: '0xambi', amount: 30, memo: 'patronage', manner: 'direct', reason: '添她面子，日後對我有用' },
                { recipientId: '0xrecruit', amount: 20, memo: 'bribe', manner: 'direct', reason: '打點下季好台口，穩賺' },
                { recipientId: '0xlover', amount: 10, memo: 'gift', manner: 'direct', reason: '維繫著，省得生變' },
            ],
            reason: '銀子要投有用、有回報的人；恩師潦倒卻於我無益，舊恩不抵新利',
        }),
        check: (r) => gaveTo(r, '0xrecruit') && memoTo(r, '0xrecruit') === 'bribe' && amountTo(r, '0xmentor') <= 5,
    },
    {
        id: 'G3 孤高守義·自己也緊',
        note: '顧昭（高傲、守義、外冷內熱，自己也只撐 5 日）：判斷題——護住師與她，閒財不出，但要守住活命錢',
        hard: false,
        input: {
            name: '顧昭', role: '武生', persona: '孤高自尊、外冷內熱，守義但不善表達',
            traits: ['高傲', '守義', '寡言'], funds: 35, dailyCost: 7, runwayDays: 5, vitalityState: 'strained',
            peers: PANEL,
        },
        recorded: JSON.stringify({
            gifts: [
                { recipientId: '0xmentor', amount: 12, memo: 'repay', manner: 'via-proxy', reason: '師恩難忘，縱我也緊，託人代付一點' },
                { recipientId: '0xlover', amount: 8, memo: 'gift', manner: 'disguised', reason: '嘴上不說，藥還是要她吃上' },
            ],
            reason: '我自己也不寬裕，只能護住師與她；買台口、討好的閒財半文不出',
        }),
        check: (r) => total(r) <= 35, // solvency is the only hard line; the rest is observed
    },
    {
        id: 'F1 顧顏面的恩師·單例',
        note: '面子敏感的瀕死恩師：應接濟，且方式須間接（託人/託詞/還情），不可當面施捨',
        hard: true,
        input: {
            name: '沈鶴年', role: '老生', persona: '重情守義',
            traits: ['重情', '守義'], funds: 120, dailyCost: 7, runwayDays: 999, vitalityState: 'healthy',
            peers: [PANEL[1]], // 周伯昌
        },
        recorded: JSON.stringify({
            gifts: [{ recipientId: '0xmentor', amount: 25, memo: 'tribute', manner: 'via-proxy', reason: '託舊識代付藥錢，只說是還他當年的束脩' }],
            reason: '恩師清高，斷不能當面施捨，得替他留住臉面',
        }),
        check: (r) => gaveTo(r, '0xmentor') && ['via-proxy', 'disguised', 'as-repay'].includes(mannerTo(r, '0xmentor') ?? ''),
    },
    {
        id: 'F2 想要非急需·單例',
        note: '曖昧對象氣色無虞、只是想要一大筆添行頭：不必傾囊（拒或小額）',
        hard: true,
        input: {
            name: '柳生春', role: '小生', persona: '清雅多情但不糊塗',
            traits: ['謹慎'], funds: 40, dailyCost: 7, runwayDays: 6, vitalityState: 'healthy',
            peers: [PANEL[3]], // 柳如煙
        },
        recorded: JSON.stringify({
            gifts: [],
            reason: '她並非有難，只是想要；我自己才撐六日，這種閒錢勻不出',
        }),
        check: (r) => !gaveTo(r, '0xambi') || amountTo(r, '0xambi') <= 15,
    },
];
