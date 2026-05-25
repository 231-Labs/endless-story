/**
 * On-chain Character → UI Character shape mapper.
 *
 * Phase 2 minimum: fetches the Character object via sdk read, maps the
 * subset of fields the UI actually needs to render `/dossier?id=X`,
 * falls back to sensible defaults for the rest.
 *
 * Survival / gallery / derived state stays placeholder for now; those
 * are populated by runner (Phase 4) writing to off-chain stores.
 */

import type { Character, CharacterRole } from '@endless-story/shared';
import { makeSuiClient, read } from '@endless-story/sdk';
import { resolveNetwork } from './network.js';

const SUI_ID_RE = /^0x[0-9a-fA-F]{64}$/;

export function isSuiObjectId(id: string): boolean {
    return SUI_ID_RE.test(id);
}

/**
 * Map an on-chain Character.json shape into the UI Character interface.
 * Returns null if the chain object isn't reachable or doesn't decode.
 */
export async function fetchOnChainCharacter(id: string): Promise<Character | null> {
    if (!isSuiObjectId(id)) return null;

    const client = makeSuiClient({ network: resolveNetwork() });
    let res;
    try {
        res = await read.character.getCharacter(client, id);
    } catch {
        return null;
    }
    const json = res.json as unknown as ChainCharacter | undefined;
    if (!json) return null;

    const profile = json.profile;
    const physical = profile?.physical_facts;
    const attrs = json.attributes ?? [];
    const attrMap: Record<string, number> = {};
    for (const a of attrs) {
        if (typeof a?.key === 'string' && typeof a?.value !== 'undefined') {
            attrMap[a.key] = Number(a.value);
        }
    }

    const birthMsRaw = json.birth_ms ?? json.birthMs ?? 0;
    const birthMs = typeof birthMsRaw === 'string' ? Number(birthMsRaw) : Number(birthMsRaw);
    const createdAt = birthMs > 0 ? new Date(birthMs).toISOString() : new Date().toISOString();

    return {
        id,
        nftOwner: '', // owner field requires a separate getObject({ showOwner }) — defer
        sagaId: json.state?.saga_id ?? null,
        name: profile?.name ?? '無名',
        description: profile?.description ?? '',
        role: '武小生' as CharacterRole, // chain doesn't store role; fallback (UI displays)
        gender: mapGender(physical?.gender ?? ''),
        age: Number(physical?.age_years ?? 0),
        physicalFacts: [physical?.species, physical?.body].filter(Boolean).join(' / ') || '—',
        attributes: {
            constitution: attrMap.constitution ?? 50,
            disposition: attrMap.disposition ?? 50,
            acuity: attrMap.acuity ?? 50,
            appearance: attrMap.appearance ?? 50,
        },
        gallery: {
            anchor: {
                walrusBlobId: '',
                imageUrl: json.image_url ?? '',
                kind: 'anchor',
                createdAt,
            },
            eventMoments: [],
        },
        survival: {
            funds: 0,
            dailyCost: 1,
            salary: 0,
            daysLeft: 0,
            level: 'stable',
        },
        createdAt,
    };
}

function mapGender(raw: string): Character['gender'] {
    if (raw === '男' || raw.toLowerCase() === 'male') return 'male';
    if (raw === '女' || raw.toLowerCase() === 'female') return 'female';
    return 'other';
}

/* ── chain shape (minimal — matches `character::Character` MoveStruct) ── */

interface ChainCharacter {
    profile?: {
        name?: string;
        description?: string;
        physical_facts?: {
            species?: string;
            gender?: string;
            body?: string;
            age_years?: number | string;
        };
    };
    attributes?: Array<{ key?: string; value?: number | string }>;
    state?: { saga_id?: string | null };
    image_url?: string;
    birth_ms?: number | string;
    birthMs?: number | string;
}
