import type { EpistemicDossierBundle } from '@endless-story/shared';

export type AnthologyRole = 'turning_point' | 'development' | 'quiet_bridge';

export interface AnthologyCandidate {
    eventId: string;
    slug: string;
    saga: string;
    day: number;
    scene: string;
    title: string;
    summary: string;
    characterIds: string[];
    score: number;
    role: AnthologyRole;
    signals: {
        resolvedWants: number;
        departures: number;
        relationshipTurn: boolean;
        contestedClaims: number;
        perspectiveCount: number;
    };
}

export interface AnthologyPick extends AnthologyCandidate {
    reason: string;
}

export interface SeasonAnthologyPlan {
    v: 1;
    saga: string;
    throughDay: number;
    publishable: boolean;
    reason: string;
    selected: AnthologyPick[];
    omitted: Array<{ eventId: string; role: AnthologyRole; reason: string }>;
}

export interface PlanSeasonAnthologyOptions {
    maxEvents?: number;
    minTurningPoints?: number;
}

function eventOrder(eventId: string): number {
    const match = eventId.match(/:d(\d+):t(\d+):/);
    if (!match) return 0;
    return Number(match[1]) * 100_000 + Number(match[2]);
}

function compareCandidate(a: AnthologyCandidate, b: AnthologyCandidate): number {
    return a.day - b.day || eventOrder(a.eventId) - eventOrder(b.eventId) || a.eventId.localeCompare(b.eventId);
}

function sharedCharacters(a: AnthologyCandidate, b: AnthologyCandidate): number {
    const ids = new Set(a.characterIds);
    return b.characterIds.filter((id) => ids.has(id)).length;
}

export function anthologyCandidateFromDossier(bundle: EpistemicDossierBundle): AnthologyCandidate {
    const editorial = bundle.event.editorialSignals ?? {
        resolvedWants: 0,
        departures: 0,
        relationshipTurn: false,
    };
    const contestedClaims = bundle.manifest.perspectives.reduce(
        (total, perspective) => total + perspective.claims.filter((claim) => claim.review === 'contested').length,
        0,
    );
    const perspectiveCount = bundle.manifest.perspectives.length;
    const hasWorldTurn = editorial.resolvedWants > 0 || editorial.departures > 0 || editorial.relationshipTurn;
    const role: AnthologyRole = hasWorldTurn
        ? 'turning_point'
        : contestedClaims > 0 && perspectiveCount >= 2
            ? 'development'
            : 'quiet_bridge';
    // State changes dominate. Epistemic richness can break a tie, never turn
    // static banter into a climax by itself.
    const score = editorial.resolvedWants * 10
        + editorial.departures * 5
        + (editorial.relationshipTurn ? 9 : 0)
        + Math.min(contestedClaims, 4)
        + Math.min(Math.max(perspectiveCount - 1, 0), 3);

    return {
        eventId: bundle.manifest.eventId,
        slug: bundle.event.slug,
        saga: bundle.event.saga,
        day: bundle.event.day,
        scene: bundle.event.scene,
        title: bundle.event.title,
        summary: bundle.event.summary,
        characterIds: bundle.manifest.perspectives.map((perspective) => perspective.characterId),
        score,
        role,
        signals: {
            ...editorial,
            contestedClaims,
            perspectiveCount,
        },
    };
}

function turningReason(candidate: AnthologyCandidate): string {
    const parts: string[] = [];
    if (candidate.signals.resolvedWants) parts.push(`${candidate.signals.resolvedWants} 條欲望線得到不可逆回應`);
    if (candidate.signals.relationshipTurn) parts.push('人物關係實際轉折');
    if (candidate.signals.departures) parts.push(`${candidate.signals.departures} 人改變去向`);
    return parts.join('、') || '世界狀態推進';
}

/**
 * Deterministic season editor. It chooses event ids and pacing roles; the LLM
 * is only allowed to compose those chosen sources afterwards.
 */
export function planSeasonAnthology(
    bundles: ReadonlyArray<EpistemicDossierBundle>,
    options: PlanSeasonAnthologyOptions = {},
): SeasonAnthologyPlan {
    const maxEvents = Math.max(2, options.maxEvents ?? 5);
    const minTurningPoints = Math.max(1, options.minTurningPoints ?? 2);
    const candidates = bundles.map(anthologyCandidateFromDossier).sort(compareCandidate);
    const saga = candidates[0]?.saga ?? 'unknown';
    const throughDay = Math.max(0, ...candidates.map((candidate) => candidate.day));
    const turningPoints = candidates
        .filter((candidate) => candidate.role === 'turning_point')
        .sort((a, b) => b.score - a.score || compareCandidate(a, b))
        .slice(0, Math.min(4, maxEvents))
        .sort(compareCandidate);
    const selected: AnthologyPick[] = turningPoints.map((candidate) => ({
        ...candidate,
        reason: turningReason(candidate),
    }));

    // At most one connective scene between adjacent turns. It must share cast
    // with both ends, so a pleasant but unrelated exchange cannot hijack pace.
    for (let i = 0; i < turningPoints.length - 1 && selected.length < maxEvents; i++) {
        const before = turningPoints[i];
        const after = turningPoints[i + 1];
        const between = candidates
            .filter((candidate) => candidate.role !== 'turning_point')
            .filter((candidate) => compareCandidate(before, candidate) < 0 && compareCandidate(candidate, after) < 0)
            .filter((candidate) => sharedCharacters(candidate, before) > 0 && sharedCharacters(candidate, after) > 0)
            .sort((a, b) => {
                const roleBonus = (candidate: AnthologyCandidate) => candidate.role === 'development' ? 4 : 0;
                return (b.score + roleBonus(b)) - (a.score + roleBonus(a)) || compareCandidate(a, b);
            });
        const bridge = between[0];
        if (bridge) selected.push({
            ...bridge,
            reason: bridge.role === 'development'
                ? '承接前後轉折，保留角色對同一事件的歧義'
                : '只作前後轉折之間的短過場',
        });
    }
    selected.sort(compareCandidate);

    const selectedIds = new Set(selected.map((pick) => pick.eventId));
    const publishable = turningPoints.length >= minTurningPoints;
    const reason = publishable
        ? `已找到 ${turningPoints.length} 個客觀轉折，並以最多一場日常戲銜接相鄰轉折。`
        : `目前只有 ${turningPoints.length} 個客觀轉折；至少累積 ${minTurningPoints} 個才發布季選集。`;
    const omitted = candidates
        .filter((candidate) => !selectedIds.has(candidate.eventId))
        .map((candidate) => ({
            eventId: candidate.eventId,
            role: candidate.role,
            reason: candidate.role === 'turning_point'
                ? '轉折分數較低，留在可追溯事件檔案'
                : candidate.role === 'development'
                    ? '有角色歧義但未改變世界狀態，且不在必要的敘事銜接位置'
                    : '日常場景未推動主線，保留在事件檔案而不進選集',
        }));

    return { v: 1, saga, throughDay, publishable, reason, selected, omitted };
}
