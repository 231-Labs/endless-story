/** Pure prompt + parser for epistemic claim extraction. The model may classify
 * a POV, but it cannot mint evidence: every ref is resolved against a closed
 * alias set derived from the frozen event and that character's session. */

import type { NarrativeClaim } from '@endless-story/shared';
import type { DossierCanonicalEvent, DossierPerspectiveSource } from './compile.js';

const MODES = new Set(['canonical', 'observed', 'heard', 'inferred', 'remembered', 'dreamed', 'fabricated']);
const RELATIONS = new Set(['supports', 'contradicts', 'reinterprets', 'unresolved']);
const REVIEWS = new Set(['verified', 'contested', 'unresolved']);

export function buildClaimAuditPrompt(event: DossierCanonicalEvent, perspectives: DossierPerspectiveSource[]): string {
    const evidence = event.beats.map((beat, i) => `- beat:${i}｜${beat.name}：${beat.text}`).join('\n');
    const povs = perspectives.map((p) => [
        `## ${p.characterId}｜${p.characterName}`,
        `可用私人來源：session（只證明這是 TA 的主觀 session，不證明內容為真）`,
        p.body,
    ].join('\n')).join('\n\n');
    return [
        '你是認識論校訂，不是續寫作者。從每個 POV 挑 1–3 個真正有辨識度的說法，標記它如何知道、與客觀層的關係、目前可否驗證。',
        '只能引用下面列出的 evidence alias：beat:N 或該角色自己的 session。不可創造新證據；沒有證據就不要列那個 claim。',
        'mode 只能是 canonical|observed|heard|inferred|remembered|dreamed|fabricated；',
        'relation 只能是 supports|contradicts|reinterprets|unresolved；review 只能是 verified|contested|unresolved。',
        '輸出 JSON：{"perspectives":[{"characterId":"...","claims":[{"text":"...","mode":"observed","relation":"supports","review":"verified","evidenceRefs":["beat:0"]}]}]}。不要 markdown。',
        '',
        '【封存的客觀逐拍】',
        evidence,
        '',
        '【各角色 session POV】',
        povs,
    ].join('\n');
}

function extractJson(raw: string): Record<string, unknown> | null {
    const blocks = raw.match(/\{[\s\S]*\}/g);
    if (!blocks?.length) return null;
    for (let i = blocks.length - 1; i >= 0; i--) {
        try { return JSON.parse(blocks[i]) as Record<string, unknown>; } catch { /* earlier */ }
    }
    return null;
}

export function applyClaimAudit(
    event: DossierCanonicalEvent,
    perspectives: DossierPerspectiveSource[],
    raw: string,
): DossierPerspectiveSource[] {
    const root = extractJson(raw);
    const rows = Array.isArray(root?.perspectives) ? root!.perspectives : [];
    const byId = new Map<string, unknown>();
    for (const row of rows) {
        if (row && typeof row === 'object' && typeof (row as { characterId?: unknown }).characterId === 'string') {
            byId.set((row as { characterId: string }).characterId, row);
        }
    }
    return perspectives.map((source) => {
        const row = byId.get(source.characterId) as { claims?: unknown } | undefined;
        const rawClaims = Array.isArray(row?.claims) ? row!.claims : [];
        const knownRefs = new Map<string, string>([
            ['session', `${event.id}:session:${source.characterId}`],
            ...event.beats.map((_, i) => [`beat:${i}`, `${event.id}:beat:${i}`] as [string, string]),
        ]);
        const claims: NarrativeClaim[] = [];
        for (const item of rawClaims.slice(0, 3)) {
            if (!item || typeof item !== 'object') continue;
            const c = item as Record<string, unknown>;
            const text = typeof c.text === 'string' ? c.text.trim() : '';
            const mode = typeof c.mode === 'string' && MODES.has(c.mode) ? c.mode : null;
            const relation = typeof c.relation === 'string' && RELATIONS.has(c.relation) ? c.relation : null;
            const review = typeof c.review === 'string' && REVIEWS.has(c.review) ? c.review : null;
            const refs = Array.isArray(c.evidenceRefs)
                ? [...new Set(c.evidenceRefs.flatMap((ref) => typeof ref === 'string' && knownRefs.has(ref) ? [knownRefs.get(ref)!] : []))]
                : [];
            if (!text || !mode || !relation || !review || !refs.length) continue;
            claims.push({
                id: `${event.id}:claim:${source.characterId}:${claims.length}`,
                text,
                epistemicMode: mode as NarrativeClaim['epistemicMode'],
                relation: relation as NarrativeClaim['relation'],
                review: review as NarrativeClaim['review'],
                evidenceRefs: refs,
            });
        }
        return claims.length ? { ...source, claims } : source;
    });
}
