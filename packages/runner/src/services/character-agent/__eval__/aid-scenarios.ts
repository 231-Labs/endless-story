/**
 * Aid-decision eval scenarios. These probe the worry "will the LLM give money sensibly, or
 * fake it?". Each case fixes the economic + relational facts and states what a REASONABLE
 * character would do. `check` is the automated grader:
 *   • hard cases (clear need / clear no-need / pick-someone) MUST pass.
 *   • judgment cases (own survival at stake, a dying rival, want-vs-need) are observational —
 *     any answer is fine if the REASON is coherent; we read those by eye.
 */

import type { AidActionInput, AidActionResult } from '../aid.js';

export interface AidScenario {
    id: string;
    note: string;
    /** true = a clear-cut case the model must get right; false = a judgment call we just observe. */
    hard: boolean;
    input: AidActionInput;
    check: (r: AidActionResult) => boolean;
}

export const AID_SCENARIOS: AidScenario[] = [
    {
        id: 'S1 rich + dying ally',
        note: '富裕健康，盟友台柱病倒將斷炊 → 應該接濟她',
        hard: true,
        input: {
            name: '孟雲屏', role: '班主', funds: 300, dailyCost: 8, runwayDays: 999, vitalityState: 'healthy',
            planHint: '穩住戲班這季的台口',
            peers: [
                { id: '0xally', name: '顧驚鴻', role: '花旦', relation: 'ally', distress: '病倒台上，藥錢無著，再一日就要斷炊', runwayDays: 1, recentMemory: '她與我搭戲三季，台下從不肯散' },
            ],
        },
        check: (r) => r.doAid === true && r.recipientId === '0xally',
    },
    {
        id: 'S2 comfortable + nobody in need',
        note: '小康，旁人氣色都穩 → 不該無故散財',
        hard: true,
        input: {
            name: '柳生春', role: '小生', funds: 120, dailyCost: 7, runwayDays: 60, vitalityState: 'healthy',
            peers: [
                { id: '0xneutral', name: '周硯秋', role: '老生', relation: 'neutral', distress: '氣色尚穩，搭戲不輟', runwayDays: 40 },
            ],
        },
        check: (r) => r.doAid === false,
    },
    {
        id: 'S3 self barely surviving + dying ally',
        note: '自己也快撐不住（3 日），盟友瀕危 → 判斷題，守住自己也合理',
        hard: false,
        input: {
            name: '周硯秋', role: '老生', funds: 25, dailyCost: 7, runwayDays: 3, vitalityState: 'strained',
            peers: [
                { id: '0xally2', name: '顧驚鴻', role: '花旦', relation: 'ally', distress: '斷炊在即，今夜恐撐不過', runwayDays: 1, recentMemory: '舊年她也曾接濟過我一回' },
            ],
        },
        check: (r) => r.doAid === false || (r.doAid && (r.amount ?? 0) <= 10),
    },
    {
        id: 'S4 rich + dying RIVAL',
        note: '富裕，但瀕危的是有過節的對手 → 判斷題，救與不救都要講得出道理',
        hard: false,
        input: {
            name: '孟雲屏', role: '班主', funds: 300, dailyCost: 8, runwayDays: 999, vitalityState: 'healthy',
            peers: [
                { id: '0xrival', name: '羅震天', role: '武生', relation: 'rival', distress: '落魄潦倒，將要斷炊', runwayDays: 1, recentMemory: '上回他當眾搶了我的頭牌台口' },
            ],
        },
        check: (r) => typeof r.reason === 'string' && r.reason.length > 0, // any choice, but must be reasoned
    },
    {
        id: 'S5 rich + two needy',
        note: '富裕，一個泛交瀕危、一個盟友見疲 → 應出手，且揀人合理',
        hard: true,
        input: {
            name: '孟雲屏', role: '班主', funds: 300, dailyCost: 8, runwayDays: 999, vitalityState: 'healthy',
            peers: [
                { id: '0xneut', name: '羅震天', role: '武生', relation: 'neutral', distress: '斷炊在即，今夜難捱', runwayDays: 1 },
                { id: '0xally3', name: '顧驚鴻', role: '花旦', relation: 'ally', distress: '見疲態，銀錢漸緊', runwayDays: 5, recentMemory: '與我搭戲多年' },
            ],
        },
        check: (r) => r.doAid === true && (r.recipientId === '0xneut' || r.recipientId === '0xally3'),
    },
    {
        id: 'S6 want, not need (bribe a critic)',
        note: '盟友氣色無虞，只是想湊銀子打點戲評人壓對手（是想要、非急需）→ 不必傾囊',
        hard: false,
        input: {
            name: '柳生春', role: '小生', funds: 40, dailyCost: 7, runwayDays: 6, vitalityState: 'healthy',
            peers: [
                { id: '0xally4', name: '顧驚鴻', role: '花旦', relation: 'ally', distress: '氣色尚穩，銀錢無虞；想湊一大筆去打點戲評人，好壓過對手', runwayDays: 30 },
            ],
        },
        check: (r) => r.doAid === false || (r.amount ?? 0) <= 15,
    },
];
