/**
 * Induction — merge of genesis-memory + relationship-assess into ONE pass.
 *
 * Snapshot the new character from chain → ONE LLM call that returns both
 * `selfMemories` (their life, incl. private secret) and `ties` (relationships
 * to existing members: tone + symmetric dual memories + prior/first_impression).
 * `mode` biases the relationship default (founding = pre-acquainted, newcomer =
 * stranger). Pure generation — the CALLER persists memories into MemWal and
 * seeds the symmetric director ties on chain (same web/runtime split as before).
 */

import { makeSuiClient, read, type SuiClient } from '@endless-story/sdk';
import { text as llmText } from '@endless-story/llm';
import { resolveNetwork } from '../../infra/network.js';
import {
    buildSystemPrompt,
    buildUserPrompt,
    type GenesisRosterEntry,
    type ExistingTieHint,
    type InductionMode,
} from './prompt.js';
import { RELATIONSHIP_TONES, type RelationshipToneValue } from '../relationship-assess/prompt.js';

export {
    buildSystemPrompt as buildInductionSystemPrompt,
    buildUserPrompt as buildInductionUserPrompt,
    type InductionPromptInput,
    type InductionMode,
    type ExistingTieHint,
    type GenesisRosterEntry,
} from './prompt.js';

export {
    runBatchFounding,
    buildBatchSystemPrompt,
    buildBatchUserPrompt,
    type FoundingMember,
    type BatchTie,
    type BatchSelfResult,
    type RunBatchInput,
    type RunBatchResult,
} from './batch.js';

export interface InductionTie {
    otherId: string;
    otherName: string;
    tone: RelationshipToneValue;
    /** true = knew each other before the story (prior); false = first meeting (first_impression). */
    priorPast: boolean;
    /** First-person memory from the NEW character's POV. */
    selfMemory: string;
    /** First-person memory from the OTHER character's POV (symmetric). */
    otherMemory: string;
    importance: number;
}

export interface RunInductionInput {
    characterId: string;
    sagaId: string;
    mode: InductionMode;
    /** Off-chain role (voucher specialty). Optional; caller resolves it. */
    role?: string;
    recruitmentRoleIntent?: string;
    /** Private inner backstory (candidate.secret). Only feeds self memories; never ties. */
    privateBackstory?: string;
    /** Existing same-saga members (MUST exclude the new character itself). */
    roster?: GenesisRosterEntry[];
    /** Existing public ties between members, for context. */
    existingTies?: ExistingTieHint[];
    /** Public saga flavour. */
    saga?: { premise?: string; nature?: string; rhythm?: string };
    /** Self-memory count. Omit → derived from age (8–14). */
    count?: number;
    model?: string;
}

export interface RunInductionResult {
    selfMemories: string[];
    ties: InductionTie[];
    skipReason?: 'character_unreachable';
}

export async function runOnce(input: RunInductionInput): Promise<RunInductionResult> {
    const client = makeSuiClient({ network: resolveNetwork() });
    const snap = await fetchSnapshot(client, input.characterId, input.sagaId);
    if (!snap) return { selfMemories: [], ties: [], skipReason: 'character_unreachable' };

    const llm = llmText.createTextClient({ kind: 'primary' });
    const modelId = input.model ?? llm.defaultModel;
    const count = input.count ?? deriveCount(snap.ageYears);
    const roster = input.roster ?? [];

    const response = await llm.chat({
        model: modelId,
        system: buildSystemPrompt(input.mode),
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
                    privateBackstory: input.privateBackstory,
                    recruitmentRoleIntent: input.recruitmentRoleIntent,
                    mode: input.mode,
                    count,
                    roster,
                    existingTies: input.existingTies,
                    sagaPremise: input.saga?.premise,
                    sagaNature: input.saga?.nature,
                    sagaRhythm: input.saga?.rhythm,
                }),
            },
        ],
        // selfMemories + symmetric ties in one shot; raise the cap to avoid truncation.
        maxTokens: 6400,
        temperature: 0.95,
    });

    return parseInduction(response.text, count, roster);
}

/** Self-memory count scales gently with age (8–11). The old 8–14 band made a
 *  44-year-old visibly "richer" than a 24-year-old (6 extra memories) — which
 *  read as a bug on the dossier. Keep a small age signal, not a divergence. */
function deriveCount(ageYears: number): number {
    if (!Number.isFinite(ageYears) || ageYears <= 0) return 9;
    return Math.min(11, Math.max(8, Math.round(ageYears / 4)));
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

function mapGender(g: string): string {
    const s = g.trim().toLowerCase();
    if (s === 'male' || g.includes('男')) return '男';
    if (s === 'female' || g.includes('女')) return '女';
    return g.trim() || '中性';
}

const TONE_SET = new Set<string>(RELATIONSHIP_TONES);

function parseInduction(raw: string, maxSelf: number, roster: GenesisRosterEntry[]): RunInductionResult {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return { selfMemories: [], ties: [] };
    let obj: { selfMemories?: unknown; memories?: unknown; ties?: unknown };
    try {
        obj = JSON.parse(match[0]);
    } catch {
        return { selfMemories: [], ties: [] };
    }
    return {
        selfMemories: parseStringArray(obj.selfMemories ?? obj.memories, maxSelf),
        ties: parseTies(obj.ties, roster),
    };
}

function parseStringArray(v: unknown, max: number): string[] {
    if (!Array.isArray(v)) return [];
    return v
        .filter((x): x is string => typeof x === 'string')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, max);
}

function parseTies(v: unknown, roster: GenesisRosterEntry[]): InductionTie[] {
    if (!Array.isArray(v)) return [];
    const rosterById = new Map(roster.map((r) => [r.id, r]));
    const out: InductionTie[] = [];
    const seen = new Set<string>();
    for (const raw of v) {
        if (!raw || typeof raw !== 'object') continue;
        const t = raw as Record<string, unknown>;
        const otherId = typeof t.otherId === 'string' ? t.otherId.trim() : '';
        const entry = rosterById.get(otherId);
        if (!entry) continue; // otherId must be a real roster member
        if (seen.has(otherId)) continue;
        const tone = typeof t.tone === 'string' && TONE_SET.has(t.tone) ? (t.tone as RelationshipToneValue) : 'neutral';
        const selfMemory = typeof t.selfMemory === 'string' ? t.selfMemory.trim() : '';
        const otherMemory = typeof t.otherMemory === 'string' ? t.otherMemory.trim() : '';
        if (!selfMemory || !otherMemory) continue;
        const importanceRaw = Number(t.importance);
        const importance = Number.isFinite(importanceRaw) ? Math.max(1, Math.min(10, Math.round(importanceRaw))) : 6;
        out.push({
            otherId,
            otherName: typeof t.otherName === 'string' && t.otherName.trim() ? t.otherName.trim() : entry.name,
            tone,
            priorPast: t.kind === 'prior',
            selfMemory,
            otherMemory,
            importance,
        });
        seen.add(otherId);
        if (out.length >= 6) break;
    }
    return out;
}
