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
import { buildSystemPrompt, buildUserPrompt } from './prompt.js';

export interface RunGenesisMemoryInput {
    characterId: string;
    sagaId: string;
    /** Off-chain role (voucher specialty). Optional; caller resolves it. */
    role?: string;
    /** How many memories to generate. Default 4. */
    count?: number;
    /** Override LLM model. */
    model?: string;
}

export interface RunGenesisMemoryResult {
    memories: string[];
    skipReason?: 'character_unreachable';
}

export async function runOnce(input: RunGenesisMemoryInput): Promise<RunGenesisMemoryResult> {
    const client = makeSuiClient({ network: resolveNetwork() });
    const snap = await fetchSnapshot(client, input.characterId, input.sagaId);
    if (!snap) return { memories: [], skipReason: 'character_unreachable' };

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
                    count: input.count,
                }),
            },
        ],
        maxTokens: 1200,
        temperature: 0.9,
    });

    return { memories: parseMemories(response.text, input.count ?? 4) };
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

/** Parse the LLM's JSON array of strings; tolerant of stray prose. */
function parseMemories(raw: string, max: number): string[] {
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return [];
    try {
        const arr = JSON.parse(match[0]);
        if (!Array.isArray(arr)) return [];
        return arr
            .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
            .map((s) => s.trim())
            .slice(0, max);
    } catch {
        return [];
    }
}

function mapGender(raw: string): string {
    if (raw === '男' || raw.toLowerCase() === 'male') return '男';
    if (raw === '女' || raw.toLowerCase() === 'female') return '女';
    return '中性';
}
