/**
 * 新戲 — the play-in-progress object the season accretes (SEASON_ONE_SLICE §3).
 * A play grows ONLY from characters' self-tagged open actions (fix #1: the engine
 * routes off the tag, never a regex on prose): propose seeds it, compose adds a
 * script fragment, join/rehearse add cast + rehearsal effort. rehearsalEffort is
 * accounted PER character PER play and later feeds box-office quality (§4).
 */

import type { ActionKind } from '../../src/index.ts';

export interface PlayFragment {
    tick: number;
    author: string;
    text: string;
}

export interface NewPlay {
    proposer: string;
    proposedTick: number;
    cast: Set<string>;
    fragments: PlayFragment[];
    /** characterId → accumulated rehearsal effort for THIS play. */
    rehearsalEffort: Record<string, number>;
    performed: boolean;
    performedTick?: number;
}

export function createPlay(proposer: string, tick: number): NewPlay {
    return {
        proposer,
        proposedTick: tick,
        cast: new Set([proposer]),
        fragments: [],
        rehearsalEffort: {},
        performed: false,
    };
}

export function totalRehearsalEffort(play: NewPlay): number {
    return Object.values(play.rehearsalEffort).reduce((s, v) => s + v, 0);
}

/**
 * Route ONE self-tagged action into the play object. Returns the play (created if
 * a propose/compose is the first play-directed act). Personal / seek_person /
 * perform are handled by the caller, not here (perform flips `performed` at the
 * finale). Deterministic and pure aside from mutating/creating the play.
 */
export function applyPlayAction(
    play: NewPlay | null,
    actor: string,
    kind: ActionKind,
    prose: string,
    tick: number,
): NewPlay | null {
    switch (kind) {
        case 'propose_play':
            if (!play) return createPlay(actor, tick);
            play.cast.add(actor);
            return play;
        case 'join_play':
            if (play) play.cast.add(actor);
            return play;
        case 'compose': {
            // compose COUNTS as a script fragment (the emergence-test bug: 添唱詞
            // was mis-read as personal and fragments stayed at 0). A compose with
            // no play yet seeds the play.
            const p = play ?? createPlay(actor, tick);
            p.fragments.push({ tick, author: actor, text: prose });
            p.cast.add(actor);
            return p;
        }
        case 'rehearse':
            if (play) {
                play.rehearsalEffort[actor] = (play.rehearsalEffort[actor] ?? 0) + 1;
                play.cast.add(actor);
            }
            return play;
        default:
            return play; // seek_person / perform / personal — not a play-object edit
    }
}

export function playSummaryLine(play: NewPlay | null): string | null {
    if (!play) return null;
    const cast = [...play.cast].join('、');
    return [
        `班裡正張羅一齣新戲（第 ${play.proposedTick} 拍由 ${play.proposer} 起頭）。`,
        `目前搭夥的人:${cast || '（還只有起頭的人）'}。`,
        `攢下的戲文/唱段片段:${play.fragments.length} 段。`,
        `各人排練投入:${totalRehearsalEffort(play)} 回。`,
    ].join('\n');
}
