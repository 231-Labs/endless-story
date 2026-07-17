import type { SeasonFrame } from './preset.ts';
import type { ArchivePort, CanonicalSceneEvent, RecallPort, SceneAgentPort } from './ports.ts';
import type { WorldState } from './world-state.ts';

export interface SeasonOpeningDeps {
    agent: SceneAgentPort;
    recall: RecallPort;
    archive: ArchivePort;
}

export function seasonOpeningText(frame: SeasonFrame): string {
    return [
        frame.incitingIncident,
        `期限：${frame.deadline}`,
        ...frame.publicFacts.map((fact) => `已確認：${fact}`),
    ].join('\n');
}

/**
 * Freeze the season premise as an actual public event before the first agent
 * turn. A prompt-level premise is not enough: every character session and
 * recall ledger must receive the same event id and exact text, or old seed
 * memories can make different characters inhabit incompatible openings.
 */
export function buildSeasonOpeningEvent(world: WorldState, frame: SeasonFrame): CanonicalSceneEvent {
    const stage = world.data.scenes.find((scene) => scene.name === frame.openingScene)
        ?? world.data.scenes.find((scene) => scene.name === '雲錦台戲台')
        ?? world.data.scenes[0];
    if (!stage) throw new Error('cannot stage a season opening without a scene');
    const witnessIds = world.data.cast.map((member) => member.id);
    return {
        v: 1,
        id: `${world.data.sagaId}:season:${frame.id}:opening`,
        sagaId: world.data.sagaId,
        day: world.data.clock.day,
        tick: world.data.clock.currentTick,
        clock: '開季前夜',
        sceneId: stage.id,
        sceneName: stage.name,
        visibility: 'public',
        witnessIds,
        editorialSignals: { resolvedWants: 0, departures: 0, relationshipTurn: false },
        beats: [{
            characterId: '__world__',
            name: '世界',
            text: seasonOpeningText(frame),
            audience: 'scene',
            perceiverIds: witnessIds,
        }],
    };
}

export async function seedSeasonOpening(
    world: WorldState,
    frame: SeasonFrame,
    deps: SeasonOpeningDeps,
): Promise<CanonicalSceneEvent> {
    const event = buildSeasonOpeningEvent(world, frame);
    const body = event.beats.map((beat) => `${beat.name}：${beat.text}`).join('\n');

    for (const member of world.data.cast) {
        await deps.recall.remember(member.id, `〔${frame.title}·公開事件〕${body}`, {
            kind: 'observation',
            importance: 10,
            day: event.day,
        });
        await deps.agent.observeScene?.({
            event,
            characterId: member.id,
            name: member.name,
            persona: member.persona,
        });
    }

    await deps.archive.commit({
        kind: 'shoujuan',
        day: event.day,
        tick: event.tick,
        name: `${frame.title}·開季事件`,
        sceneId: event.sceneId,
        eventId: event.id,
        body,
    });
    world.data.dayAccum.lines.push('【開季前夜】', `[${event.sceneName}] ${body}`);
    return event;
}
