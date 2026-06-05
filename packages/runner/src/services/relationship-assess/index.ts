/**
 * Relationship Assessment — judge a freshly-minted character's ties to the
 * existing saga roster from public descriptions.
 *
 * Pure generation: snapshot the new character from chain → LLM → parse a JSON
 * list of ties (tone + kind + symmetric first-person memories). The CALLER
 * (web action) persists them: seeds a director `RelationshipSeeded` event per
 * pair (public, symmetric) and writes the two memories into each character's
 * MemWal. No chain writes here — read + LLM only, same split as genesis-memory.
 */

import { makeSuiClient, read, type SuiClient } from '@endless-story/sdk';
import { text as llmText } from '@endless-story/llm';
import { resolveNetwork } from '../../infra/network.js';
import {
    buildSystemPrompt,
    buildUserPrompt,
    RELATIONSHIP_TONES,
    type GenesisRosterEntry,
    type RelationshipToneValue,
} from './prompt.js';

export {
    buildSystemPrompt as buildRelationshipSystemPrompt,
    buildUserPrompt as buildRelationshipUserPrompt,
    RELATIONSHIP_TONES,
    type RelationshipAssessInput,
    type RelationshipToneValue,
    type GenesisRosterEntry,
} from './prompt.js';

export interface RelationshipTie {
    otherId: string;
    otherName: string;
    tone: RelationshipToneValue;
    kind: 'prior' | 'first_impression';
    /** First-person memory from the NEW character's POV. */
    selfMemory: string;
    /** First-person memory from the OTHER character's POV (symmetric). */
    otherMemory: string;
    importance: number;
}

export interface RunRelationshipAssessInput {
    characterId: string;
    sagaId: string;
    /** Off-chain role (voucher specialty). Optional; caller resolves it. */
    role?: string;
    recruitmentRoleIntent?: string;
    /** Existing same-saga roster (MUST exclude the new character itself). */
    roster: GenesisRosterEntry[];
    /** Override LLM model. */
    model?: string;
}

export interface RunRelationshipAssessResult {
    ties: RelationshipTie[];
    skipReason?: 'character_unreachable' | 'empty_roster';
}

const TONE_SET = new Set<string>(RELATIONSHIP_TONES);

export async function runOnce(
    input: RunRelationshipAssessInput,
): Promise<RunRelationshipAssessResult> {
    if (!input.roster || input.roster.length === 0) {
        return { ties: [], skipReason: 'empty_roster' };
    }
    const client = makeSuiClient({ network: resolveNetwork() });
    const snap = await fetchSnapshot(client, input.characterId, input.sagaId);
    if (!snap) return { ties: [], skipReason: 'character_unreachable' };

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
                }),
            },
        ],
        maxTokens: 3600,
        temperature: 0.9,
    });

    // Authoritative roster lookup — never trust LLM-invented ids / names.
    const rosterById = new Map(input.roster.map((r) => [r.id, r]));
    return { ties: parseTies(response.text, rosterById, input.characterId) };
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

function parseTies(
    raw: string,
    rosterById: Map<string, GenesisRosterEntry>,
    selfId: string,
): RelationshipTie[] {
    const objectMatch = raw.match(/\{[\s\S]*\}/);
    if (!objectMatch) return [];
    let parsed: { ties?: unknown };
    try {
        parsed = JSON.parse(objectMatch[0]) as { ties?: unknown };
    } catch {
        return [];
    }
    if (!Array.isArray(parsed.ties)) return [];

    const out: RelationshipTie[] = [];
    const seen = new Set<string>();
    for (const item of parsed.ties) {
        if (!item || typeof item !== 'object') continue;
        const obj = item as Record<string, unknown>;
        const otherId = typeof obj.otherId === 'string' ? obj.otherId.trim() : '';
        // Reject hallucinated / self ids — only roster members are valid targets.
        if (!otherId || otherId === selfId || !rosterById.has(otherId)) continue;
        if (seen.has(otherId)) continue;
        const selfMemory = typeof obj.selfMemory === 'string' ? obj.selfMemory.trim() : '';
        const otherMemory = typeof obj.otherMemory === 'string' ? obj.otherMemory.trim() : '';
        if (!selfMemory || !otherMemory) continue;

        const toneRaw = typeof obj.tone === 'string' ? obj.tone.trim().toLowerCase() : '';
        const tone: RelationshipToneValue = TONE_SET.has(toneRaw)
            ? (toneRaw as RelationshipToneValue)
            : 'neutral';
        const kind = obj.kind === 'prior' ? 'prior' : 'first_impression';

        seen.add(otherId);
        out.push({
            otherId,
            otherName: rosterById.get(otherId)?.name ?? '某人',
            tone,
            kind,
            selfMemory: clampText(selfMemory, 220),
            otherMemory: clampText(otherMemory, 220),
            importance: clampImportance(Number(obj.importance ?? 7)),
        });
        if (out.length >= 6) break;
    }
    return out;
}

function clampImportance(n: number): number {
    if (!Number.isFinite(n)) return 7;
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
