/**
 * Relationship edges from chain — N3.
 *
 * The director seeds ties via `relationship_seed`, emitting RelationshipSeeded
 * (character_a, character_b, tone). This module reads those soft events and
 * projects them into the per-character `RelationshipEdge` shape the dossier
 * ProfileTab + character prompts consume. Lightweight by design (per the
 * canonical doc): one tone summary per pair, no full weighted graph.
 *
 * Server-only (chain reads). Returns [] on any failure — relationships are
 * additive context, never load-bearing.
 */

import type { RelationshipEdge, RelationshipTone } from '@endless-story/shared';
import { ENDLESS_STORY_DEPLOYMENT, makeSuiClient, read } from '@endless-story/sdk';
import { resolveNetwork } from './network.js';
import { currentNarrativeDay } from './memory.js';

const TONES: RelationshipTone[] = [
    'affection',
    'romance',
    'mentorship',
    'rivalry',
    'wary',
    'tension',
    'estrangement',
    'neutral',
];

const TONE_ZH: Record<RelationshipTone, string> = {
    affection: '親近',
    romance: '戀慕',
    mentorship: '師徒',
    rivalry: '競爭',
    wary: '戒備',
    tension: '緊張',
    estrangement: '隔閡',
    neutral: '平淡',
};

function normalizeTone(raw: string): RelationshipTone {
    const t = raw.trim().toLowerCase();
    return (TONES as string[]).includes(t) ? (t as RelationshipTone) : 'neutral';
}

interface PairAgg {
    otherId: string;
    tone: RelationshipTone;
    count: number;
}

/**
 * Aggregate RelationshipSeeded events touching `characterId` into one entry
 * per "other" character — newest tone wins, weight grows with repeat seeds.
 */
async function aggregatePairs(characterId: string): Promise<PairAgg[]> {
    const pkg = ENDLESS_STORY_DEPLOYMENT.packageId;
    if (!pkg) return [];
    const client = makeSuiClient({ network: resolveNetwork() });
    const events = await read.director
        .listRelationshipEvents(client, pkg, { characterId, maxEvents: 200 })
        .catch(() => []);

    // events are newest-first; first time we see a pair sets its tone.
    const byOther = new Map<string, PairAgg>();
    for (const ev of events) {
        const otherId = ev.characterA === characterId ? ev.characterB : ev.characterA;
        if (!otherId || otherId === characterId) continue;
        const existing = byOther.get(otherId);
        if (existing) {
            existing.count += 1;
        } else {
            byOther.set(otherId, {
                otherId,
                tone: normalizeTone(ev.tone),
                count: 1,
            });
        }
    }
    return [...byOther.values()];
}

/**
 * Outgoing relationship edges for the dossier ProfileTab. Returns [] when
 * the character has no seeded ties (UI shows the empty state).
 */
export async function fetchOnChainEdgesFrom(characterId: string): Promise<RelationshipEdge[]> {
    try {
        const [pairs, day] = await Promise.all([
            aggregatePairs(characterId),
            currentNarrativeDay().catch(() => 1),
        ]);
        return pairs.map((p) => ({
            fromId: characterId,
            toId: p.otherId,
            weight: Math.min(10, p.count * 3),
            label: TONE_ZH[p.tone],
            lastUpdatedDay: day,
            tone: p.tone,
            confidence: Math.min(1, 0.34 * p.count),
            summary: `班主在戲裡牽起的一段「${TONE_ZH[p.tone]}」。`,
        }));
    } catch (err) {
        console.warn('[relationships] fetchOnChainEdgesFrom failed:', err);
        return [];
    }
}

/**
 * Short relationship hints for prompt injection (decide / POV). Resolves the
 * other character's name. e.g. "與 程慕聲 之間：師徒（導演牽起）".
 * Empty array when no ties — callers omit the section.
 */
export async function fetchRelationshipHints(
    characterId: string,
    limit = 6,
): Promise<string[]> {
    const pairs = await aggregatePairs(characterId).catch(() => []);
    if (pairs.length === 0) return [];
    const client = makeSuiClient({ network: resolveNetwork() });
    // Strongest ties first (more seeds = more salient).
    pairs.sort((a, b) => b.count - a.count);
    const top = pairs.slice(0, limit);
    const hints = await Promise.all(
        top.map(async (p) => {
            const name = await read.character
                .getCharacter(client, p.otherId)
                .then(
                    (r) =>
                        (r.json as unknown as { profile?: { name?: string } })?.profile?.name,
                )
                .catch(() => undefined);
            const who = name ?? `某人(${p.otherId.slice(0, 8)}…)`;
            return `與 ${who} 之間：${TONE_ZH[p.tone]}`;
        }),
    );
    return hints;
}
