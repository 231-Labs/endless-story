/**
 * Saga roster cognition.
 *
 * Public identity lives in the roster: who is in this saga, what role/tag
 * others can see, and where they currently are. Subjective relationships stay
 * in each character's own MemWal memories.
 */

import type { Character, Scene } from '@endless-story/shared';
import { inferRoleFromText } from '@endless-story/shared';
import { ENDLESS_STORY_DEPLOYMENT } from '@endless-story/sdk';
import { charactersApi, sagasApi } from '@/lib/api/index';
import { getStoreRecruitment } from '@/lib/actions/recruitments-store';
import { fetchRecruitmentIdMapForCharacters } from './voucher-read';
import { fetchOnChainScenesForSaga } from './scene-read';
import { fetchOnChainEdgesFrom } from './relationships';

export interface SagaRosterEntry {
    id: string;
    name: string;
    role: string;
    gender: string;
    ageYears: number;
    brief: string;
    currentSceneName?: string;
    currentSceneId?: string;
}

export async function buildSagaRoster(
    sagaId: string,
    opts: { characters?: Character[]; scenes?: Scene[] } = {},
): Promise<SagaRosterEntry[]> {
    const [characters, scenes] = await Promise.all([
        opts.characters
            ? Promise.resolve(opts.characters)
            : charactersApi.listSagaCharacters(sagaId).catch(() => []),
        opts.scenes
            ? Promise.resolve(opts.scenes)
            : fetchOnChainScenesForSaga(sagaId).catch(() => []),
    ]);
    const roleById = await resolveRosterRoles(characters);
    const sceneByChar = sceneNameMaps(scenes);
    return characters
        .filter((c) => !c.sagaId || c.sagaId === sagaId)
        .map((c) => ({
            id: c.id,
            name: c.name,
            role: roleById.get(c.id) ?? '—',
            gender: genderLabel(c.gender),
            ageYears: Number(c.age ?? 0),
            brief: (c.description || c.physicalFacts || '').slice(0, 160),
            currentSceneName: sceneByChar.name.get(c.id),
            currentSceneId: c.currentSceneId ?? sceneByChar.id.get(c.id),
        }));
}

export interface TroupeTie {
    aId: string;
    bId: string;
    tone: string;
}

export interface TroupeSnapshot {
    saga: {
        name: string;
        premise: string;
        naturePrompt?: string;
        rhythmHints?: string;
        worldTimeLabel?: string;
    };
    members: SagaRosterEntry[];
    /** 成員之間目前的公開關係 tone(去重、無向)。讓 induction 把新人鑲進現有關係網。 */
    ties: TroupeTie[];
}

/**
 * 戲班公開現況快照 — 給 mint induction 用。
 *
 * **只公開**:saga 氣質 + 現有成員(公開描述/行當/性別/年齡/當前場景)+ 成員間既有
 * 關係 tone。**絕不含任何人的私密記憶**(那是 owner-only / SEAL);induction 據此把新人
 * 的記憶與關係鑲進現有戲班,而非憑空。
 */
export async function buildTroupeSnapshot(
    sagaId: string,
    opts: { characters?: Character[]; scenes?: Scene[] } = {},
): Promise<TroupeSnapshot> {
    const [members, saga] = await Promise.all([
        buildSagaRoster(sagaId, opts),
        sagasApi.getSaga(sagaId).catch(() => null),
    ]);
    const ties = await collectMemberTies(members);
    return {
        saga: {
            name: saga?.name ?? '',
            premise: saga?.premise || saga?.description || '',
            naturePrompt: saga?.sagaPrompts?.naturePrompt,
            rhythmHints: saga?.sagaPrompts?.rhythmHints,
            worldTimeLabel: saga?.worldTime?.label,
        },
        members,
        ties,
    };
}

/** 收集成員之間既有的公開關係 tone(去重、無向)。best-effort:任一讀取失敗就略過。 */
async function collectMemberTies(members: SagaRosterEntry[]): Promise<TroupeTie[]> {
    const memberIds = new Set(members.map((m) => m.id));
    const perMember = await Promise.all(
        members.map((m) => fetchOnChainEdgesFrom(m.id).catch(() => [])),
    );
    const seen = new Set<string>();
    const ties: TroupeTie[] = [];
    for (const edges of perMember) {
        for (const e of edges) {
            if (!memberIds.has(e.fromId) || !memberIds.has(e.toId)) continue;
            const [a, b] = e.fromId < e.toId ? [e.fromId, e.toId] : [e.toId, e.fromId];
            const key = `${a}::${b}`;
            if (seen.has(key)) continue;
            seen.add(key);
            ties.push({ aId: a, bId: b, tone: e.tone ?? 'neutral' });
        }
    }
    return ties;
}

export async function resolveRosterRoles(
    characters: Array<Pick<Character, 'id' | 'role' | 'publicTags' | 'description'>>,
): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const needsRecruitment = characters.filter((c) => !roleFromPublicTags(c.publicTags));
    const recruitIdMap = await fetchRecruitmentIdMapForCharacters(needsRecruitment.map((c) => c.id));
    const recruitments = new Map<string, Awaited<ReturnType<typeof getStoreRecruitment>>>();
    const recruitmentIds = Array.from(
        new Set(
            Array.from(recruitIdMap.values()).filter((id): id is string => Boolean(id)),
        ),
    );
    await Promise.all(
        recruitmentIds.map(async (id) => {
            recruitments.set(id, await getStoreRecruitment(id));
        }),
    );

    for (const c of characters) {
        const tagged = roleFromPublicTags(c.publicTags);
        if (tagged) {
            out.set(c.id, tagged);
            continue;
        }
        const recruitmentId = recruitIdMap.get(c.id);
        const recruitmentRole = recruitmentId
            ? recruitments.get(recruitmentId)?.specialty
            : undefined;
        if (recruitmentRole) {
            out.set(c.id, recruitmentRole);
            continue;
        }
        const publicProfileRole = inferRoleFromText(c.description);
        if (publicProfileRole) {
            out.set(c.id, publicProfileRole);
            continue;
        }
        // In mock mode, c.role is authored fixture data. On chain, an untagged
        // character mapper uses the "onlooker" UI fallback, so do not promote it
        // into public cognition unless it came from a tag or recruitment.
        if (!ENDLESS_STORY_DEPLOYMENT.packageId && c.role) out.set(c.id, c.role);
        else out.set(c.id, '—');
    }
    return out;
}

export function rosterLines(entries: SagaRosterEntry[], limit = 12): string[] {
    return entries.slice(0, limit).map((r) => {
        const role = r.role && r.role !== '—' ? r.role : '行當未明';
        const scene = r.currentSceneName ? `在${r.currentSceneName}` : '所在未明';
        const brief = r.brief ? `；${r.brief.slice(0, 60)}` : '';
        return `${r.name}（${role}，${r.gender}${r.ageYears ? `，${r.ageYears}歲` : ''}，${scene}${brief}）`;
    });
}

function sceneNameMaps(scenes: Scene[]): {
    name: Map<string, string>;
    id: Map<string, string>;
} {
    const name = new Map<string, string>();
    const id = new Map<string, string>();
    for (const scene of scenes) {
        for (const characterId of scene.currentCharacterIds ?? []) {
            name.set(characterId, scene.name);
            id.set(characterId, scene.id);
        }
    }
    return { name, id };
}

function roleFromPublicTags(tags: Character['publicTags']): string | null {
    const tag = tags?.find((t) => t.label.startsWith('role:'));
    return tag ? tag.label.slice('role:'.length) : null;
}

function genderLabel(gender: Character['gender']): string {
    if (gender === 'female') return '女';
    if (gender === 'male') return '男';
    return '中性';
}
