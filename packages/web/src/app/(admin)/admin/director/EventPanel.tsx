'use client';

import { useEffect, useState } from 'react';
import type { Character, Scene } from '@endless-story/shared';
import {
    fetchBudgetEvents,
    type BudgetEventEntry,
} from '@/lib/chain/event-read';
import { CreateForm } from './event/CreateForm';
import { EventRow } from './event/EventRow';

/**
 * Admin panel: BudgetEvent (event.move 1.6) lifecycle controller.
 *
 * Three steps mapped 1:1 to admin server actions:
 *   1. Open event — push_event (admin signs storyteller cap)
 *   2. Deal hands — deal_participant_hand per character (entry fun → 1 tx each)
 *   3. Resolve — resolve_event with empty outcomes
 *
 * Catalog is a preset 4-card demo deck (KILL / ATTACK / SOCIAL / WITNESS).
 * Custom catalog editor + outcomes composer are v2.
 */
export function EventPanel({
    scenes,
    characters,
}: {
    scenes: Scene[];
    characters: Character[];
}) {
    const [events, setEvents] = useState<BudgetEventEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshNonce, setRefreshNonce] = useState(0);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        fetchBudgetEvents({ limit: 20 })
            .then((list) => {
                if (!cancelled) setEvents(list);
            })
            .catch(() => {
                if (!cancelled) setEvents([]);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [refreshNonce]);

    return (
        <div className="space-y-8">
            <CreateForm
                scenes={scenes}
                characters={characters}
                onCreated={() => setRefreshNonce((n) => n + 1)}
            />

            <div className="space-y-3">
                <div className="flex items-baseline justify-between">
                    <h3 className="font-serif text-base text-ink">近期事件</h3>
                    <button
                        type="button"
                        onClick={() => setRefreshNonce((n) => n + 1)}
                        className="text-2xs tracking-widest text-mute hover:text-cinnabar"
                    >
                        ↻ 重整
                    </button>
                </div>
                {loading && events.length === 0 ? (
                    // Only show the placeholder on the FIRST load. On a refresh
                    // (events already populated) keep the list mounted so an
                    // expanded event — and its character-decision result — isn't
                    // unmounted/collapsed every time you act.
                    <p className="text-sm text-mute">讀取中…</p>
                ) : events.length === 0 ? (
                    <p className="text-sm text-mute">
                        鏈上還沒事件。用上方表單開第一個。
                    </p>
                ) : (
                    <ul className="space-y-3">
                        {events.map((ev) => (
                            <EventRow
                                key={ev.eventId}
                                summary={ev}
                                characters={characters}
                                scenes={scenes}
                                onMutated={() => setRefreshNonce((n) => n + 1)}
                            />
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
