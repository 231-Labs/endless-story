/**
 * Character Agent — WANT GENESIS: derive a character's initial wants from who
 * they are (persona + secret + canon), once at induction. Resistance is derived
 * from world facts (taboo/livelihood/station), never a free knob (§2.42–2.43).
 * Pure LLM; the caller validates, clamps and persists.
 */

import { text as llmText } from '@endless-story/llm';
import { roleHint } from '@endless-story/shared';

export interface DeriveWantsInput {
    name: string;
    role: string;
    gender?: string;
    ageYears?: number;
    /** Public persona / bio. */
    description: string;
    /** Private secret (never shown to others; wants may grow from it). */
    secret?: string;
    /** Saga premise for context (world facts that set resistance). */
    sagaPremise?: string;
    /** Other cast names, so targets resolve to real people. */
    castNames?: string[];
}

export interface GenesisWant {
    layer: string;
    desc: string;
    target?: string;
    weight: number;
    sat: number;
    resistance: number;
    /** One line: which FACTS set this resistance (audit trail, not stored). */
    why: string;
}

export function buildSystemPrompt(): string {
    return [
        '你是「角色內心的建檔師」。給你一個戲園角色的公開人設與私密心事,你要替 TA 寫下',
        '此刻心裡真正掛著的幾件事(wants)——這些會成為 TA 往後每一天行動的內在驅力。',
        '',
        '**鐵則**:',
        '1. **從這個人身上長出來**,不是你替劇情安排。每條 want 用 TA 自己的口吻寫(≤30字),',
        '   讀起來像 TA 心裡的話,不是任務清單。',
        '2. **3 到 5 條,層次要雜**:感情、志向、班務、身體、日常都可以;**至少一條與事業無關**',
        '   (人不會只為一件事活;全是搶位子的人是工具人不是人)。',
        '3. **resistance(1-10)從事實推導,不是隨手填**:這件事說破/做成的門檻有多高?',
        '   禁忌之情、飯碗攸關、身分懸殊=高(7-9);日常小願=低(2-3)。`why` 一句寫清是哪些',
        '   事實撐起這個數。',
        '4. `weight`(0-1)=這件事佔 TA 多少心;`sat`(0-1)=此刻已滿足多少(多數 0.2-0.4)。',
        '5. `target` 只在 want 指向具體某人時填,且必須是名冊裡的名字。',
        '6. **不要替 TA 決定結局**:want 是渴望不是計畫,別寫成「將要如何如何」。',
        '',
        '**輸出**:嚴格只輸出 JSON:',
        '`{"wants":[{"layer":"愛","desc":"…","target":"某某","weight":0.9,"sat":0.3,"resistance":8,"why":"…"}]}`',
        '不要 markdown、不要多餘文字。',
    ].join('\n');
}

export function buildUserPrompt(input: DeriveWantsInput): string {
    const cast = input.castNames?.length ? `\n## 班中名冊\n${input.castNames.join('、')}` : '';
    const secret = input.secret ? `\n## TA 的私密心事(外人不知)\n${input.secret}` : '';
    const premise = input.sagaPremise ? `\n## 這個班子\n${input.sagaPremise}` : '';
    return [
        `# 這個人`,
        `- ${input.name}（${input.role}${input.gender ? '·' + input.gender : ''}${input.ageYears ? '·' + input.ageYears + '歲' : ''}）`,
        `- 行當聲口:${roleHint(input.role)}`,
        `- 人設:${input.description}`,
        secret,
        premise,
        cast,
        '',
        `寫下 ${input.name} 此刻心裡掛著的 3-5 件事。`,
    ].join('\n');
}

function extractJson(raw: string): Record<string, unknown> | null {
    const blocks = raw.match(/\{[\s\S]*\}/g);
    if (!blocks?.length) return null;
    for (let i = blocks.length - 1; i >= 0; i--) {
        try {
            return JSON.parse(blocks[i]) as Record<string, unknown>;
        } catch {
            /* try an earlier block */
        }
    }
    return null;
}

const s = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const n = (v: unknown, lo: number, hi: number, dflt: number): number =>
    typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : dflt;

export function parseGenesisWants(raw: string, castNames?: string[]): GenesisWant[] {
    const obj = extractJson(raw);
    const arr = Array.isArray(obj?.wants) ? (obj!.wants as unknown[]) : [];
    const out: GenesisWant[] = [];
    for (const item of arr.slice(0, 5)) {
        const e = item as Record<string, unknown>;
        const desc = s(e.desc);
        if (!desc || desc.length > 40) continue;
        const target = s(e.target);
        out.push({
            layer: s(e.layer) || '其他',
            desc,
            target: target && (!castNames || castNames.includes(target)) ? target : undefined,
            weight: n(e.weight, 0.1, 1, 0.6),
            sat: n(e.sat, 0, 0.9, 0.3),
            resistance: n(e.resistance, 1, 10, 4),
            why: s(e.why),
        });
    }
    return out;
}

/** Derive genesis wants for one character. Returns [] on any failure (caller
 *  may retry next tick; a character without wants simply idles). */
export async function deriveGenesisWants(input: DeriveWantsInput): Promise<GenesisWant[]> {
    try {
        const client = llmText.createTextClient({ kind: 'primary' });
        const res = await client.chat({
            model: client.defaultModel,
            system: buildSystemPrompt(),
            messages: [{ role: 'user', content: buildUserPrompt(input) }],
            maxTokens: 700,
            temperature: 0.7,
        });
        return parseGenesisWants(res.text, input.castNames);
    } catch (err) {
        console.warn('[want-genesis] derive failed:', err instanceof Error ? err.message : err);
        return [];
    }
}
