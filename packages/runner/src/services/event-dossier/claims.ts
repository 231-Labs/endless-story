/** Prompt, parser, and deterministic review rules for epistemic dossier editing.
 * The model writes character-specific copy and compares claims; it cannot mint
 * evidence or decide its own verification badge. */

import type { ClaimRelation, ClaimReview, NarrativeClaim } from '@endless-story/shared';
import type { DossierCanonicalEvent, DossierPerspectiveSource } from './compile.js';
import { povParagraphs } from '../narrative-format/pov-paragraphs.ts';
import { extractJsonLoose, wasTruncated } from '../../infra/json-loose.ts';

const MODES = new Set(['canonical', 'observed', 'heard', 'inferred', 'remembered', 'dreamed', 'fabricated']);
const SUBJECTIVE_RELATIONS = new Set(['contradicts', 'reinterprets', 'unresolved']);
const GENERIC_LEAD = /記住的，不必等於別人看見的|同一件事|主觀版本/;

function paragraphs(body: string): string[] {
    return povParagraphs(body);
}

/** Short POVs keep the historical headroom of four, which is more than bare
 * coverage needs, so bodies that already passed keep passing unchanged. */
const MIN_SUBJECTIVE_CLAIMS = 4;

/** Cost guard for the claims the editor writes itself, on top of the anchor.
 *
 * `canonicalAnchor` is prepended separately and always maps to p:0, so the
 * audited claims have to cover p:1..p:last on their own, worst case one claim
 * per remaining paragraph. A flat cap smaller than that silently drops the claim
 * carrying the trailing paragraphs and then `validateClaimAudit` fails the
 * dossier for exactly the paragraphs that claim covered.
 *
 * The prompt, the parser cap in `applyClaimAudit`, and the coverage gate in
 * `validateClaimAudit` all count paragraphs through the same `paragraphs()`
 * helper and read their budget from here, so a POV can no longer be asked for
 * fewer claims than the gate then demands. */
export function subjectiveClaimBudget(body: string): number {
    return Math.max(MIN_SUBJECTIVE_CLAIMS, paragraphs(body).length - 1);
}

function pronounForBody(bodyFact?: string): '他' | '她' {
    if (!bodyFact || bodyFact.includes('女')) return '她';
    return bodyFact.includes('男') ? '他' : '她';
}

export function buildClaimAuditPrompt(
    event: DossierCanonicalEvent,
    perspectives: DossierPerspectiveSource[],
    castCanon: DossierPerspectiveSource[] = perspectives,
): string {
    const evidence = event.beats.map((beat, i) => `- beat:${i}｜${beat.name}：${beat.text}`).join('\n');
    const cast = castCanon.map((p) =>
        `- ${p.characterName}｜${p.role ?? '行當未註明'}｜${p.bodyFact ?? '身不詳'}｜第三人稱「${pronounForBody(p.bodyFact)}」`,
    ).join('\n');
    const povs = perspectives.map((p) => {
        const lines = paragraphs(p.body);
        return [
            `## ${p.characterId}｜${p.characterName}`,
            `不可更動的身／性別 canon：${p.bodyFact ?? '未註明'}；第三人稱代詞用「${pronounForBody(p.bodyFact)}」。`,
            `本卷宗共 ${lines.length} 段；p:0 已由系統的已錨定 claim 覆蓋，你最多可寫 ${subjectiveClaimBudget(p.body)} 條 claim，其餘各段一段都不能漏。`,
            '可用私人來源：session（只證明這是 TA 的主觀 session，不證明內容為真）',
            ...lines.map((text, index) => `p:${index}｜${text}`),
        ].join('\n');
    }).join('\n\n');
    return [
        '你是章回卷宗的認識論編輯，不是續寫作者。你要替每個角色完成兩件事：',
        '一、寫一句只屬於此人的 lead（24–52字，以角色姓名開頭，指出這個版本真正卡住的情感或誤讀；必須使用該 POV 的具體意象，不准套模板，不准改性別）。',
        '二、從該 POV 提煉主觀 claim，逐一說明它與封存客觀層的關係；以最少 claim 完整覆蓋全部段落，條數上限見各角色 POV 標頭。系統會另加一條逐字來自客觀 beat 的「已錨定」claim，你不要代寫或重複它。',
        '',
        '每個 claim 必須有：',
        '- text：角色實際主張了什麼，不是空泛的「這是主觀詮釋」。',
        '- mode：canonical|observed|heard|inferred|remembered|dreamed|fabricated。',
        '- relation：只能是 contradicts|reinterprets|unresolved。不要輸出 supports；已錨定的 supports 只由系統從客觀 beat 生成。',
        '- evidenceRefs：只能用 beat:N 或該角色自己的 session。',
        '- passageRefs：此 claim 對應的 p:N，同一條可一次列多段；每一段 p:N 都至少要被一個 claim 覆蓋。',
        '- editorialNote：20–70字，具體說明「哪個客觀逐拍支持／牴觸它，或正史為何無法回答」；不得創造新事實。',
        '',
        '證據規則：',
        '- contradicts 必須同時引用 beat:N 與 session。',
        '- reinterprets 必須同時引用 beat:N 與 session，表示動作相同但意義被角色改寫。',
        '- unresolved 只能表示客觀層真的沒有涵蓋，並引用 session。',
        '- 至少一項必須是 contradicts 或 reinterprets，不可全部 unresolved。',
        '- 不要輸出 review；已錨定／有異說／尚無外證由系統依證據規則計算。',
        '- lead、claim 與 editorialNote 提到任何在場角色時，都必須遵守下方全劇身份 canon；女子扮小生仍用「她」。',
        '',
        '輸出 JSON，不要 markdown：',
        '{"perspectives":[{"characterId":"...","lead":"角色姓名……","claims":[{"text":"...","mode":"inferred","relation":"reinterprets","evidenceRefs":["beat:0","session"],"passageRefs":["p:0"],"editorialNote":"..."}]}]}',
        '',
        '【封存的客觀逐拍】',
        evidence,
        '',
        '【全劇角色身份 canon】',
        cast,
        '',
        '【各角色 session POV】',
        povs,
    ].join('\n');
}

/** Safe production diagnostic: reports only response shape and closed aliases,
 * never the private POV prose, claim text, lead, or editorial copy. */
export function diagnoseClaimAudit(raw: string): string {
    // 診斷路徑不喊：它本來就是給人讀輸出形狀的，applyClaimAudit 已經喊過一次。
    const root = extractJsonLoose(raw);
    const rows = Array.isArray(root?.perspectives) ? root.perspectives : [];
    return JSON.stringify(rows.map((row) => {
        if (!row || typeof row !== 'object') return { invalidRow: typeof row };
        const value = row as Record<string, unknown>;
        const claims = Array.isArray(value.claims) ? value.claims : [];
        return {
            characterId: value.characterId,
            leadLength: typeof value.lead === 'string' ? value.lead.trim().length : 0,
            claimCount: claims.length,
            claims: claims.map((claim) => {
                if (!claim || typeof claim !== 'object') return { invalid: typeof claim };
                const item = claim as Record<string, unknown>;
                return {
                    mode: item.mode,
                    relation: item.relation,
                    evidenceRefs: item.evidenceRefs,
                    passageRefs: item.passageRefs,
                    editorialNoteLength: typeof item.editorialNote === 'string' ? item.editorialNote.trim().length : 0,
                };
            }),
        };
    }));
}

function relationHasRequiredEvidence(relation: ClaimRelation, refs: string[]): boolean {
    const hasBeat = refs.some((ref) => ref.startsWith('beat:'));
    const hasSession = refs.includes('session');
    if (relation === 'contradicts' || relation === 'reinterprets') return hasBeat && hasSession;
    return hasSession;
}

function deriveReview(relation: ClaimRelation, refs: string[]): ClaimReview {
    const hasBeat = refs.some((ref) => ref.startsWith('beat:'));
    const hasSession = refs.includes('session');
    if ((relation === 'contradicts' || relation === 'reinterprets') && hasBeat && hasSession) return 'contested';
    return 'unresolved';
}

function normalizeSubjectiveMode(
    mode: NarrativeClaim['epistemicMode'],
): NarrativeClaim['epistemicMode'] {
    // `canonical` is reserved for the frozen layer, and a subjective claim that
    // adds motive/meaning is no longer mere observation even when it begins from
    // something the character saw. Keep heard/remembered/dreamed/fabricated when
    // the editor supplied them; collapse only the two category errors.
    return mode === 'canonical' || mode === 'observed' ? 'inferred' : mode;
}

function canonicalAnchor(event: DossierCanonicalEvent, source: DossierPerspectiveSource): NarrativeClaim | null {
    if (!event.beats.length) return null;
    const ownIndex = event.beats.findIndex((beat) => beat.characterId === source.characterId);
    const index = ownIndex >= 0 ? ownIndex : 0;
    const beat = event.beats[index];
    return {
        id: `${event.id}:claim:${source.characterId}:0`,
        text: `客觀逐拍記錄：${beat.name}：${beat.text}`,
        epistemicMode: 'observed',
        relation: 'supports',
        review: 'verified',
        editorialNote: `這句直接取自客觀逐拍第 ${index + 1} 拍，只證明動作與說出口的話確實發生，不替任何人判定動機。`,
        evidenceRefs: [`${event.id}:beat:${index}`],
    };
}

export function applyClaimAudit(
    event: DossierCanonicalEvent,
    perspectives: DossierPerspectiveSource[],
    raw: string,
): DossierPerspectiveSource[] {
    const root = extractJsonLoose(raw);
    if (wasTruncated(root)) {
        // 撿回來的是前面幾個 POV；後面那幾個會落成沒有 lead、沒有 claim 的空卷宗，
        // 而 validateClaimAudit 只會說「缺專屬導語」——不喊就查不出是被剪掉的。
        console.warn(`[event-dossier] 回話被剪斷，已撿回可用的部分（${event.id}，共 ${perspectives.length} 份卷宗）`);
    }
    const rows = Array.isArray(root?.perspectives) ? root!.perspectives : [];
    const byId = new Map<string, unknown>();
    for (const row of rows) {
        if (row && typeof row === 'object' && typeof (row as { characterId?: unknown }).characterId === 'string') {
            byId.set((row as { characterId: string }).characterId, row);
        }
    }
    // Dedicated editors occasionally echo the human-readable name in the
    // characterId field. For a one-POV request this alias is unambiguous; do not
    // extend the tolerance to ensemble responses where it could cross-wire POVs.
    if (perspectives.length === 1 && rows.length === 1 && !byId.has(perspectives[0].characterId)) {
        const only = rows[0];
        if (only && typeof only === 'object' && (only as { characterId?: unknown }).characterId === perspectives[0].characterName) {
            byId.set(perspectives[0].characterId, only);
        }
    }

    return perspectives.map((source) => {
        const row = byId.get(source.characterId) as { lead?: unknown; claims?: unknown } | undefined;
        const lead = typeof row?.lead === 'string' ? row.lead.trim() : '';
        const rawClaims = Array.isArray(row?.claims) ? row.claims : [];
        const sourceParagraphs = paragraphs(source.body);
        const knownRefs = new Map<string, string>([
            ['session', `${event.id}:session:${source.characterId}`],
            ...event.beats.map((_, i) => [`beat:${i}`, `${event.id}:beat:${i}`] as [string, string]),
        ]);
        const knownPassages = new Set(sourceParagraphs.map((_, i) => `p:${i}`));
        const anchor = canonicalAnchor(event, source);
        const claims: NarrativeClaim[] = anchor ? [anchor] : [];
        const passageClaimIds: Record<number, string[]> = {};
        if (anchor && sourceParagraphs.length) passageClaimIds[0] = [anchor.id];

        for (const item of rawClaims.slice(0, subjectiveClaimBudget(source.body))) {
            if (!item || typeof item !== 'object') continue;
            const c = item as Record<string, unknown>;
            const text = typeof c.text === 'string' ? c.text.trim() : '';
            const mode = typeof c.mode === 'string' && MODES.has(c.mode) ? c.mode : null;
            const relation = typeof c.relation === 'string' && SUBJECTIVE_RELATIONS.has(c.relation)
                ? c.relation as ClaimRelation
                : null;
            const editorialNote = typeof c.editorialNote === 'string' ? c.editorialNote.trim() : '';
            const aliasRefs = Array.isArray(c.evidenceRefs)
                ? [...new Set(c.evidenceRefs.flatMap((ref) => typeof ref === 'string' && knownRefs.has(ref) ? [ref] : []))]
                : [];
            const passageRefs = Array.isArray(c.passageRefs)
                ? [...new Set(c.passageRefs.flatMap((ref) => typeof ref === 'string' && knownPassages.has(ref) ? [ref] : []))]
                : [];
            if (!text || !mode || !relation || editorialNote.length < 12 || !aliasRefs.length || !passageRefs.length) continue;
            if (!relationHasRequiredEvidence(relation, aliasRefs)) continue;

            const id = `${event.id}:claim:${source.characterId}:${claims.length}`;
            claims.push({
                id,
                text,
                epistemicMode: normalizeSubjectiveMode(mode as NarrativeClaim['epistemicMode']),
                relation,
                review: deriveReview(relation, aliasRefs),
                editorialNote,
                evidenceRefs: aliasRefs.map((ref) => knownRefs.get(ref)!),
            });
            for (const ref of passageRefs) {
                const index = Number(ref.slice(2));
                (passageClaimIds[index] ??= []).push(id);
            }
        }

        return {
            ...source,
            ...(lead ? { lead } : {}),
            ...(claims.length ? { claims, passageClaimIds } : {}),
        };
    });
}

/** Fail-loud completeness gate for the real-LLM path. A malformed audit must
 * never silently fall back to a page full of generic "未定" markers. */
export function validateClaimAudit(perspectives: DossierPerspectiveSource[]): string[] {
    const errors: string[] = [];
    const leads = new Set<string>();
    for (const source of perspectives) {
        const prefix = source.characterName;
        if (!source.lead || source.lead.length < 12 || GENERIC_LEAD.test(source.lead) || !source.lead.startsWith(source.characterName)) {
            errors.push(`${prefix}: missing bespoke lead`);
        } else if (leads.has(source.lead)) {
            errors.push(`${prefix}: duplicate lead`);
        } else {
            leads.add(source.lead);
        }
        if (!source.claims || source.claims.length < 2) {
            errors.push(`${prefix}: fewer than two audited claims`);
            continue;
        }
        if (!source.claims.some((claim) => claim.relation === 'supports' && claim.review === 'verified')) {
            errors.push(`${prefix}: missing canonical anchor`);
        }
        if (!source.claims.some((claim) => claim.relation === 'contradicts' || claim.relation === 'reinterprets')) {
            errors.push(`${prefix}: missing grounded subjective comparison`);
        }
        if (source.claims.some((claim) => !claim.editorialNote)) {
            errors.push(`${prefix}: claim missing editorial note`);
        }
        const mapped = source.passageClaimIds ?? {};
        // Stays a hard failure: a dossier that quietly loses a paragraph's claim
        // degrades into generic 未定 markers. `subjectiveClaimBudget` is derived
        // from this same paragraph list, so a complete audit can always pay for
        // the coverage demanded here.
        paragraphs(source.body).forEach((_, index) => {
            if (!mapped[index]?.length) errors.push(`${prefix}: p:${index} has no audited claim`);
        });
    }
    return errors;
}
