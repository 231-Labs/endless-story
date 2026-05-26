/**
 * Chain event types the runner subscribes to.
 *
 * These are *parsed* shapes — the on-chain Move event has snake_case
 * fields and `Option<T>` quirks; this layer normalises into ergonomic
 * TS objects.
 *
 * Naming convention: same as Move `EventStruct`, camelCased. New events
 * added by R1+ modules (director.move, subscribe.move) live below.
 */

/** What triggered a runner service to wake up. */
export type RunnerEvent =
    | { kind: 'CharacterMinted'; data: CharacterMintedEvent }
    | { kind: 'CharacterMoved'; data: CharacterMovedEvent }
    | { kind: 'SceneEventResolved'; data: SceneEventResolvedEvent }
    | { kind: 'StoryletOpened'; data: StoryletOpenedEvent }
    | { kind: 'StoryletConcluded'; data: StoryletConcludedEvent }
    | { kind: 'DreamInjected'; data: DreamInjectedEvent }
    | { kind: 'Subscribed'; data: SubscribedEvent }
    | { kind: 'ImportanceDebtCrossed'; data: ImportanceDebtCrossedEvent }
    | { kind: 'ChapterCommitted'; data: ChapterCommittedEvent };

// ─── stable shapes already on chain ──────────────────────────────────

export interface CharacterMintedEvent {
    characterId: string;
    sagaId: string | null;
    sceneId: string | null;
    ownerCapId: string;
    name: string;
    owner: string;
    mintedAtMs: string;
}

export interface CharacterMovedEvent {
    characterId: string;
    fromSceneId: string | null;
    toSceneId: string | null;
    movedAtMs: string;
}

export interface SceneEventResolvedEvent {
    sceneId: string;
    sagaId: string;
    eventKind: string;
    atmosphereDelta: number;
    dangerDelta: number;
    prosperityDelta: number;
    resolvedAtMs: string;
}

// ─── R1 (director.move) ─────────────────────────────────────────────

export interface StoryletOpenedEvent {
    storyletId: string;
    sagaId: string;
    templateId: string;
    sceneId: string;
    characterIds: string[];
    openedAtMs: string;
}

export interface StoryletConcludedEvent {
    storyletId: string;
    sagaId: string;
    outcome: string;
    concludedAtMs: string;
}

// ─── R1.5 (subscribe.move) ──────────────────────────────────────────

export interface SubscribedEvent {
    subscriptionId: string;
    characterId: string;
    sagaId: string;
    subscriber: string;
    subscribedAtMs: string;
}

// ─── R4 (importance debt accumulator) ───────────────────────────────

export interface ImportanceDebtCrossedEvent {
    subjectId: string;       // typically a character id
    sagaId: string;
    debtAccrued: string;
    threshold: string;
    crossedAtMs: string;
}

// ─── R5 (dream.move) ────────────────────────────────────────────────

export interface DreamInjectedEvent {
    dreamCommitmentId: string;
    characterId: string;
    sagaId: string;
    owner: string;
    importance: number;
    injectedAtMs: string;
}

// ─── chapter commitment (uses generic commitment::CommitmentCreated
//     but the runner cares about chapter kind specifically) ──────────

export interface ChapterCommittedEvent {
    commitmentId: string;
    sagaId: string;
    characterId: string;        // POV character
    storyletId: string | null;  // links chapter to driving storylet
    blobId: string;             // walrus blob ref
    committedAtMs: string;
}
