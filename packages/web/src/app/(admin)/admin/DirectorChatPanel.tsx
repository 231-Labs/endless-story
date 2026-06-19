'use client';

import { useRef, useState, useTransition } from 'react';
import { sendDirectorChatAction } from '@/lib/actions/director-chat';
import type { ChatTurn } from '@/lib/director/memory-store';
import { Markdown } from '@/components/common/Markdown';

/** Prompt starters — click to load into the box, edit, then send. */
const QUICK_ASKS = ['現在劇情走到哪了？', '開一條新的張力線', '戲班裡誰的戲份被冷落了？'];

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
                        問說書人「現在劇情走到哪了？」，或下令「我要一條關於師承心結的張力線」。
                    </p>
                ) : (
                    turns.map((t, i) =>
                        t.role === 'director' ? (
                            <div key={`${t.at}-${i}`} className="flex gap-2.5">
                                <div
                                    className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cinnabar font-serif text-sm text-canvas"
                                    aria-hidden
                                >
                                    書
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="mb-1 flex items-center gap-2">
                                        <span className="font-serif text-xs tracking-wide text-ink">說書人</span>
                                        <span className="rounded border border-cinnabar/40 px-1.5 py-px text-2xs tracking-wider text-cinnabar">
                                            AI 代筆
                                        </span>
                                    </div>
                                    <div className="rounded border border-hairline bg-surface px-3 py-2">
                                        <Markdown source={t.text} compact />
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div key={`${t.at}-${i}`} className="text-right">
                                <div className="mb-1 text-2xs tracking-widest text-mute">班主</div>
                                <div className="inline-block max-w-[85%] rounded bg-ink px-3 py-2 text-left text-sm leading-relaxed text-canvas">
                                    <pre className="whitespace-pre-wrap font-sans">{t.text}</pre>
                                </div>
                            </div>
                        ),
                    )
                )}
                {isPending ? <p className="text-2xs tracking-widest text-mute">說書人查證中…</p> : null}
            </div>
            {lastToolLine ? (
                <p className="text-2xs tracking-widest text-mute">工具：{lastToolLine}</p>
            ) : null}
            {error ? <p className="text-sm text-cinnabar">{error}</p> : null}
            <div className="flex flex-wrap gap-2">
                {QUICK_ASKS.map((q) => (
                    <button
                        key={q}
                        type="button"
                        onClick={() => setDraft(q)}
                        disabled={isPending}
                        className="rounded-full border border-hairline bg-surface px-3 py-1 text-2xs tracking-wide text-mute hover:bg-elevated hover:text-ink disabled:opacity-50"
                    >
                        {q}
                    </button>
                ))}
            </div>
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
                    placeholder="跟說書人說話…（Enter 送出，Shift+Enter 換行）"
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
