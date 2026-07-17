/** Pure movement-output guard. No provider/session imports: node tests can prove
 * identity and language normalization without constructing the LLM runtime. */
import { toTraditional } from '@endless-story/shared/to-traditional';

export interface MoveGuardPerson {
    id: string;
    name: string;
    bodyFact?: string;
}

export interface MoveGuardInput {
    options: Array<{
        sceneId: string;
        name: string;
        presentCharacters: MoveGuardPerson[];
    }>;
}

export function movePronounFromBody(bodyFact?: string): '他' | '她' {
    if (!bodyFact || bodyFact.includes('女')) return '她';
    return bodyFact.includes('男') ? '他' : '她';
}

/** Normalize the auditable first-person reason without changing the autonomous
 * destination choice. Traditional conversion is deterministic. If the short
 * reason demonstrably assigns the wrong pronoun to its only named gender group,
 * fall back to a neutral truthful line instead of persisting identity drift. */
export function sanitizeMoveReason(
    reason: string | undefined,
    input: MoveGuardInput,
    targetSceneId?: string,
): string | undefined {
    const normalized = toTraditional(reason?.trim() ?? '').slice(0, 60);
    if (!normalized) return undefined;
    const people = input.options
        .flatMap((option) => option.presentCharacters)
        .filter((person, index, all) => all.findIndex((candidate) => candidate.id === person.id) === index);
    const named = people.filter((person) => normalized.includes(person.name) && person.bodyFact);
    const expected = new Set(named.map((person) => movePronounFromBody(person.bodyFact)));
    const unambiguousDrift =
        expected.size === 1 &&
        ((expected.has('她') && normalized.includes('他')) || (expected.has('他') && normalized.includes('她')));
    const target = input.options.find((option) => option.sceneId === targetSceneId);
    if (!unambiguousDrift) return normalized;
    return `我決定去${target?.name ?? '那裡'}，照應心裡掛著的事。`;
}
