import type { CanonicalSceneBeat, CanonicalSceneEvent } from '../ports.ts';

export interface SceneParticipant {
    id: string;
    name: string;
}

export interface SceneBeatPerceptionInput {
    characterId: string;
    addressed?: string;
    audience?: 'scene' | 'addressed';
}

/** Resolve exact-content perception from structured fields. Privacy is never
 * inferred from generated prose. An invalid addressed-only beat fails closed
 * to the actor instead of broadcasting a supposed whisper. */
export function deriveBeatPerceiverIds(
    beat: SceneBeatPerceptionInput,
    participants: SceneParticipant[],
): string[] {
    if (beat.audience !== 'addressed') return participants.map((p) => p.id);
    const target = beat.addressed
        ? participants.find((p) => p.name === beat.addressed || beat.addressed!.includes(p.name))
        : undefined;
    return [...new Set([beat.characterId, target?.id].filter((id): id is string => Boolean(id)))];
}

export function redactedSceneBeatText(beat: Pick<CanonicalSceneBeat, 'name' | 'addressed'>): string {
    return beat.addressed
        ? `對${beat.addressed}壓低了聲音，內容聽不清。`
        : '壓低了聲音，內容聽不清。';
}

/** The facts available to one co-present character. Exact private content is
 * replaced by the observable fact that a private exchange occurred. */
export function projectEventBeatsForWitness(
    event: Pick<CanonicalSceneEvent, 'beats'>,
    characterId: string,
): Array<{ name: string; text: string }> {
    return event.beats.map((beat) => ({
        name: beat.name,
        text: beat.perceiverIds.includes(characterId) ? beat.text : redactedSceneBeatText(beat),
    }));
}
