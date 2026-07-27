/**
 * Guest-safe projection of a LabLiveSnapshot — strip operator-only texture
 * (private beats, 心聲, logs, production diagnostics).
 */

import type { LabLiveSnapshot } from './live';
import type { LabLiveBeat } from './types';

export function sanitizeBeatsForGuest(beats: LabLiveBeat[]): LabLiveBeat[] {
    return beats
        .filter((b) => !b.isPrivate)
        .map((b) => {
            const { inner: _inner, acts: _acts, ...rest } = b;
            return rest;
        });
}

export function sanitizeLiveForGuest(snapshot: LabLiveSnapshot): LabLiveSnapshot {
    return {
        ...snapshot,
        beats: sanitizeBeatsForGuest(snapshot.beats),
        logs: [],
        // production panel is director-facing; guests still see the world breathe
        production: undefined,
        characters: snapshot.characters.map((c) => {
            const { secret: _secret, ...rest } = c;
            return rest;
        }),
    };
}
