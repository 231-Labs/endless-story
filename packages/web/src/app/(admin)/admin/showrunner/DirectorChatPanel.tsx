'use client';

import { useRef, useState, useTransition } from 'react';
import { sendDirectorChatAction } from '@/lib/actions/director-chat';
import type { ChatTurn } from '@/lib/director/memory-store';

/**
 * The director chat box (§12.4) — ask what the story is doing, give small
 * orders (executed via tools now) or big directions (folded into the arc
 * plan for the next heartbeat). History persists in director memory.
 */
export function DirectorChatPanel({ initialChat }: { initialChat: ChatTurn[] }) {
    const [turns, setTurns] = useState<ChatTurn[]>(initialChat);
    const [draft, setDraft] = useState('');
    const [lastToolLine, setLastToolLine] = useState('');
    const [error, setError] = useState('');
    const [isPending, startTransition] = useTransition();
    const scrollRef = useRef<HTMLDivElement>(null);

    const send = () => {
        const message = draft.trim();
        if (!message || isPending) return;
        setDraft('');
        setError('');
        setLastToolLine('');
        const now = new Date().toISOString();
        setTurns((prev) => [...prev, { role: 'admin', text: message, at: now }]);
        startTransition(async () => {
            const r = await sendDirectorChatAction({ message });
            if (!r.ok) {
                setError(r.error ?? '對話失敗，請重試。');
                return;
            }
            setTurns((prev) => [
                ...prev,
                { role: 'director', text: r.reply, at: new Date().toISOString() },
            ]);
            if (r.toolCalls.length > 0) {
                setLastToolLine(
                    r.toolCalls.map((c) => `${c.ok ? '✓' : '✗'}${c.tool}`).join(' · '),
                );
            }
            requestAnimationFrame(() => {
                scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
            });
        });
    };

    return (
        <div className="space-y-3">
            <div
                ref={scrollRef}
                className="max-h-96 space-y-3 overflow-y-auto rounded border border-hairline bg-canvas/40 p-4"
            >
                {turns.length === 0 ? (
                    <p className="text-sm text-mute">
                        問它「現在劇情走到哪了？」，或下令「我要一條關於師承心結的張力線」。
                    </p>
                ) : (
                    turns.map((t, i) => (
                        <div key={`${t.at}-${i}`} className={t.role === 'admin' ? 'text-right' : ''}>
                            <div
                                className={`inline-block max-w-[85%] rounded px-3 py-2 text-left text-sm leading-relaxed ${
                                    t.role === 'admin'
                                        ? 'bg-ink text-canvas'
                                        : 'border border-hairline bg-surface text-ink'
                                }`}
                            >
                                <pre className="whitespace-pre-wrap font-sans">{t.text}</pre>
                            </div>
                        </div>
                    ))
                )}
                {isPending ? <p className="text-2xs tracking-widest text-mute">導演查證中…</p> : null}
            </div>
            {lastToolLine ? (
                <p className="text-2xs tracking-widest text-mute">工具：{lastToolLine}</p>
            ) : null}
            {error ? <p className="text-sm text-cinnabar">{error}</p> : null}
            <div className="flex gap-2">
                <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                            e.preventDefault();
                            send();
                        }
                    }}
                    rows={2}
                    placeholder="跟 Showrunner 說話…（Enter 送出，Shift+Enter 換行）"
                    className="flex-1 resize-none rounded border border-hairline bg-surface px-3 py-2 text-sm text-ink placeholder:text-mute focus:outline-none"
                />
                <button
                    type="button"
                    onClick={send}
                    disabled={isPending || !draft.trim()}
                    className="rounded bg-cinnabar px-4 py-2 text-sm tracking-widest text-canvas hover:bg-seal disabled:opacity-50"
                >
                    送出
                </button>
            </div>
        </div>
    );
}
