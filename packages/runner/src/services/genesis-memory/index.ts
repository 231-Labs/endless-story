/**
 * Genesis Memory — distill a character's description into first-person
 * opening memories at creation time.
 *
 * Pure generation: snapshot character from chain → LLM → parse a JSON
 * array of memory strings. The CALLER (web action) persists them into
 * MemWal via `rememberForCharacter` — keeping the MemWal client + creds
 * on the web side (where env lives), same split as pov-core.
 *
 * No chain writes here; this is read + LLM only.
 */

import {
    makeSuiClient,
    read,
    type SuiClient,
} from '@endless-story/sdk';
import { text as llmText } from '@endless-story/llm';
import { resolveNetwork } from '../../infra/network.js';
import { buildSystemPrompt, buildUserPrompt, type GenesisRosterEntry } from './prompt.js';

export type { GenesisRosterEntry } from './prompt.js';

export interface GenesisRelationshipMemory {
    otherId: string;
    otherName: string;
    text: string;
    importance: number;
}

export interface RunGenesisMemoryInput {
    characterId: string;
    sagaId: string;
    /** Off-chain role (voucher specialty). Optional; caller resolves it. */
    role?: string;
    /** Recruitment role intent that minted this character, if available. */
    recruitmentRoleIntent?: string;
    /** Public same-saga roster for first impressions. */
    roster?: GenesisRosterEntry[];
    /** How many self memories to generate. Default 5. */
    count?: number;
    /** Override LLM model. */
    model?: string;
}

export interface RunGenesisMemoryResult {
    selfMemories: string[];
    relationshipMemories: GenesisRelationshipMemory[];
    /** Compatibility alias for the old caller contract. */
    memories: string[];
    skipReason?: 'character_unreachable';
}

export async function runOnce(input: RunGenesisMemoryInput): Promise<RunGenesisMemoryResult> {
    const client = makeSuiClient({ network: resolveNetwork() });
    const snap = await fetchSnapshot(client, input.characterId, input.sagaId);
    if (!snap) {
        return {
            selfMemories: [],
            relationshipMemories: [],
            memories: [],
            skipReason: 'character_unreachable',
        };
    }

    const llm = llmText.createTextClient({ kind: 'primary' });
    const modelId = input.model ?? llm.defaultModel;

    const response = await llm.chat({
        model: modelId,
        system: buildSystemPrompt(),
        messages: [
            {
                role: 'user',
                content: buildUserPrompt({
                    name: snap.name,
                    role: input.role ?? snap.role,
                    gender: snap.gender,
                    ageYears: snap.ageYears,
                    sagaName: snap.sagaName,
                    physicalFacts: snap.physicalFacts,
                    description: snap.description,
                    recruitmentRoleIntent: input.recruitmentRoleIntent,
                    roster: input.roster,
                    count: input.count,
                }),
            },
        ],
        maxTokens: 3200,
        temperature: 0.95,
    });

    const parsed = parseGenesisResponse(response.text, input.count ?? 5);
    return { ...parsed, memories: parsed.selfMemories };
}

interface Snapshot {
    name: string;
    role: string;
    gender: string;
    ageYears: number;
    sagaName: string;
    physicalFacts: string;
    description: string;
}

async function fetchSnapshot(
    client: SuiClient,
    characterId: string,
    sagaId: string,
): Promise<Snapshot | null> {
    const [charRes, sagaRes] = await Promise.all([
        read.character.getCharacter(client, characterId).catch(() => null),
        read.saga.getSaga(client, sagaId).catch(() => null),
    ]);
    if (!charRes) return null;
    const charJson = charRes.json as unknown as {
        profile?: {
            name?: string;
            description?: string;
            physical_facts?: { species?: string; gender?: string; body?: string; age_years?: number | string };
        };
    };
    const sagaJson = sagaRes?.json as unknown as { name?: string } | undefined;
    const physical = charJson.profile?.physical_facts;
    return {
        name: charJson.profile?.name ?? '無名',
        role: '—',
        gender: mapGender(physical?.gender ?? ''),
        ageYears: Number(physical?.age_years ?? 0),
        sagaName: sagaJson?.name ?? '無名戲班',
        physicalFacts: [physical?.species, physical?.body].filter(Boolean).join(' / ') || '—',
        description: charJson.profile?.description ?? '',
    };
}

/** Parse the LLM's JSON object; tolerant of legacy array output + stray prose. */
function parseGenesisResponse(
    raw: string,
    maxSelf: number,
): Pick<RunGenesisMemoryResult, 'selfMemories' | 'relationshipMemories'> {
    const objectMatch = raw.match(/\{[\s\S]*\}/);
    if (objectMatch) {
        try {
            const obj = JSON.parse(objectMatch[0]) as {
                selfMemories?: unknown;
                memories?: unknown;
                relationshipMemories?: unknown;
            };
            const selfMemories = parseStringArray(obj.selfMemories ?? obj.memories, maxSelf);
            const relationshipMemories = parseRelationshipMemories(obj.relationshipMemories);
            return { selfMemories, relationshipMemories };
        } catch {
            // Fall through to legacy array parser.
        }
    }
    return { selfMemories: parseLegacyMemoryArray(raw, maxSelf), relationshipMemories: [] };
}

function parseLegacyMemoryArray(raw: string, max: number): string[] {
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return [];
    try {
        return parseStringArray(JSON.parse(match[0]), max);
    } catch {
        return [];
    }
}

function parseStringArray(raw: unknown, max: number): string[] {
    if (!Array.isArray(raw)) return [];
    return raw
        .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
        .map((s) => clampText(s.trim(), 220))
        .slice(0, max);
}

function parseRelationshipMemories(raw: unknown): GenesisRelationshipMemory[] {
    if (!Array.isArray(raw)) return [];
    const out: GenesisRelationshipMemory[] = [];
    for (const item of raw) {
        if (!item || typeof item !== 'object') continue;
        const obj = item as {
            otherId?: unknown;
            otherName?: unknown;
            text?: unknown;
            importance?: unknown;
        };
        if (typeof obj.otherId !== 'string' || typeof obj.otherName !== 'string') continue;
        if (typeof obj.text !== 'string' || !obj.text.trim()) continue;
        const otherName = clampText(obj.otherName.trim(), 32);
        out.push({
            otherId: obj.otherId.trim(),
            otherName,
            text: sanitizeRelationshipText(obj.text.trim(), otherName),
            importance: clampImportance(Number(obj.importance ?? 8)),
        });
        if (out.length >= 4) break;
    }
    return out;
}

const UNAUTHORIZED_SHARED_PAST_RE =
    /多年同門|舊情|舊愛|血緣|親兄|親弟|親姊|親妹|父女|母女|父子|母子|青梅竹馬|從小相識|一同長大|舊仇|宿怨|前世|拜過師|師徒舊恩/;

function sanitizeRelationshipText(text: string, otherName: string): string {
    const trimmed = clampText(text, 180);
    if (!UNAUTHORIZED_SHARED_PAST_RE.test(trimmed)) return trimmed;
    return `我今日才從班中人的眼色裡認得「${otherName}」這個名字；只知此人已在此處有位置，至於交情深淺，還不敢妄認。`;
}

function clampImportance(n: number): number {
    if (!Number.isFinite(n)) return 8;
    return Math.max(1, Math.min(10, Math.round(n)));
}

function clampText(text: string, max: number): string {
    return text.length > max ? text.slice(0, max) : text;
}

function mapGender(raw: string): string {
    if (raw === '男' || raw.toLowerCase() === 'male') return '男';
    if (raw === '女' || raw.toLowerCase() === 'female') return '女';
    return '中性';
}
