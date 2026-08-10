/**
 * Character Agent — WANT GENESIS 的純解析葉（node-clean）。
 *
 * 只放形狀與解析，不碰 `@endless-story/llm`（那條 graph 用 `.js` 指名，光禿禿的
 * `node --test` 解不到）。分出來是為了能直接測：genesis 落空正是「世界完全靜止」
 * 那類事故的源頭（角色沒有心事就無事可做，滿場 `action noop`），這條路徑必須釘
 * 得住。`want-genesis.ts` 原樣再匯出，套件外緣不變 —— 與 `beat-prompt.ts` 從
 * `beat.ts` 分出來的理由一模一樣。
 */

import { extractJsonLoose, wasTruncated } from '../../infra/json-loose.ts';

export interface GenesisWant {
    layer: string;
    desc: string;
    target?: string;
    /** Exact contested-resource label when this want IS that stake's pursuit. */
    resource?: string;
    weight: number;
    sat: number;
    resistance: number;
    /** One line: which FACTS set this resistance (audit trail, not stored). */
    why: string;
}

const s = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const n = (v: unknown, lo: number, hi: number, dflt: number): number =>
    typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : dflt;

export function parseGenesisWants(
    raw: string,
    castNames?: string[],
    resourceLabels?: string[],
    /** 誰的心事（只進日誌，讓截斷警告能對上人）。 */
    who?: string,
): GenesisWant[] {
    const obj = extractJsonLoose(raw);
    // 撿回來的那幾件仍然算數（每一件都是完整的物件；殘缺的半件已在修復時丟掉），
    // 但要喊出聲——一整批角色連著被剪，就是 maxTokens 又不夠了。
    if (wasTruncated(obj)) {
        console.warn(`[want-genesis] 回話被剪斷，已撿回可用的部分${who ? `（${who}）` : ''}`);
    }
    const arr = Array.isArray(obj?.wants) ? (obj!.wants as unknown[]) : [];
    const out: GenesisWant[] = [];
    for (const item of arr.slice(0, 5)) {
        const e = item as Record<string, unknown>;
        const descRaw = s(e.desc);
        if (!descRaw) continue;
        // Overlong descs get truncated, never dropped — the deepest wants run
        // long, and silently discarding them left 蘇映雪-class canon uncharted.
        const desc = descRaw.length > 48 ? `${descRaw.slice(0, 47)}…` : descRaw;
        const target = s(e.target);
        // Exact-label match only — substring guessing wrongly ties e.g. a 歌廳頭牌
        // want to the troupe's 頭牌名額 stake.
        const resource = s(e.resource);
        out.push({
            layer: s(e.layer) || '其他',
            desc,
            target: target && (!castNames || castNames.includes(target)) ? target : undefined,
            resource: resource && resourceLabels?.includes(resource) ? resource : undefined,
            weight: n(e.weight, 0.1, 1, 0.6),
            sat: n(e.sat, 0, 0.9, 0.3),
            resistance: n(e.resistance, 1, 10, 4),
            why: s(e.why),
        });
    }
    return out;
}
