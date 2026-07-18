'use client';

/**
 * 片場對話盒 — in-house confirm / prompt / choose,取代瀏覽器原生彈窗。
 * 紙面卡片、朱砂主鍵、framer 淡入;Promise 介面讓呼叫端跟 window.confirm
 * 一樣好寫: const ok = await dialog.confirm({ title: '焚毀此卷?' })
 */

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

interface ConfirmOpts {
    title: string;
    body?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    danger?: boolean;
}

interface PromptOpts {
    title: string;
    body?: string;
    placeholder?: string;
    defaultValue?: string;
    multiline?: boolean;
    confirmLabel?: string;
}

interface ChooseOpts {
    title: string;
    body?: string;
    options: Array<{ key: string; label: string; hint?: string }>;
}

interface LabDialogApi {
    confirm: (opts: ConfirmOpts) => Promise<boolean>;
    prompt: (opts: PromptOpts) => Promise<string | null>;
    choose: (opts: ChooseOpts) => Promise<string | null>;
}

type Pending =
    | { kind: 'confirm'; opts: ConfirmOpts; resolve: (v: boolean) => void }
    | { kind: 'prompt'; opts: PromptOpts; resolve: (v: string | null) => void }
    | { kind: 'choose'; opts: ChooseOpts; resolve: (v: string | null) => void };

const LabDialogContext = createContext<LabDialogApi | null>(null);

export function useLabDialog(): LabDialogApi {
    const api = useContext(LabDialogContext);
    if (!api) throw new Error('useLabDialog outside LabDialogProvider');
    return api;
}

export function LabDialogProvider({ children }: { children: ReactNode }) {
    const [pending, setPending] = useState<Pending | null>(null);
    const [promptValue, setPromptValue] = useState('');
    const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

    const open = useCallback(<T,>(make: (resolve: (v: T) => void) => Pending, defaultValue = '') => {
        return new Promise<T>((resolve) => {
            setPromptValue(defaultValue);
            setPending(make(resolve));
        });
    }, []);

    const api: LabDialogApi = {
        confirm: (opts) => open<boolean>((resolve) => ({ kind: 'confirm', opts, resolve })),
        prompt: (opts) => open<string | null>((resolve) => ({ kind: 'prompt', opts, resolve }), opts.defaultValue ?? ''),
        choose: (opts) => open<string | null>((resolve) => ({ kind: 'choose', opts, resolve })),
    };

    const close = (result: boolean | string | null) => {
        if (!pending) return;
        if (pending.kind === 'confirm') pending.resolve(Boolean(result));
        else pending.resolve(typeof result === 'string' ? result : null);
        setPending(null);
    };

    // 空字串是合法答案（例如「清空描述回落原文」）——取消才回 null
    const submitPrompt = () => close(promptValue.trim());

    return (
        <LabDialogContext.Provider value={api}>
            {children}
            <AnimatePresence>
                {pending ? (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.18 }}
                        className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/25 p-4 backdrop-blur-[2px] dark:bg-black/40"
                        onMouseDown={(e) => {
                            if (e.target === e.currentTarget) close(pending.kind === 'confirm' ? false : null);
                        }}
                        role="dialog"
                        aria-modal="true"
                        aria-label={pending.opts.title}
                    >
                        <motion.div
                            initial={{ opacity: 0, y: 10, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 6 }}
                            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                            className="es-lab-panel w-full max-w-sm p-5"
                        >
                            <p className="font-serif text-base tracking-[0.12em] text-ink">{pending.opts.title}</p>
                            {pending.opts.body ? (
                                <p className="mt-2 font-serif text-xs leading-relaxed text-mute">{pending.opts.body}</p>
                            ) : null}

                            {pending.kind === 'prompt' ? (
                                pending.opts.multiline ? (
                                    <textarea
                                        ref={(el) => { inputRef.current = el; el?.focus(); }}
                                        value={promptValue}
                                        onChange={(e) => setPromptValue(e.target.value)}
                                        placeholder={pending.opts.placeholder}
                                        rows={4}
                                        className="es-field mt-3 w-full px-3 py-2 font-serif text-sm leading-relaxed"
                                    />
                                ) : (
                                    <input
                                        ref={(el) => { inputRef.current = el; el?.focus(); el?.select(); }}
                                        value={promptValue}
                                        onChange={(e) => setPromptValue(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === 'Enter') submitPrompt(); }}
                                        placeholder={pending.opts.placeholder}
                                        className="es-field mt-3 w-full px-3 py-2 font-serif text-sm"
                                    />
                                )
                            ) : null}

                            {pending.kind === 'choose' ? (
                                <div className="mt-3 space-y-1.5">
                                    {pending.opts.options.map((option) => (
                                        <button
                                            key={option.key}
                                            type="button"
                                            onClick={() => close(option.key)}
                                            className="w-full rounded-lg bg-ink/[0.04] p-3 text-left transition hover:bg-cinnabar/10 dark:bg-white/[0.05] dark:hover:bg-cinnabar/15"
                                        >
                                            <span className="font-serif text-sm tracking-[0.1em] text-ink">{option.label}</span>
                                            {option.hint ? (
                                                <span className="mt-0.5 block font-serif text-2xs leading-relaxed text-mute">{option.hint}</span>
                                            ) : null}
                                        </button>
                                    ))}
                                </div>
                            ) : null}

                            <div className="mt-4 flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => close(pending.kind === 'confirm' ? false : null)}
                                    className="es-button-ghost px-3.5 py-1.5 text-xs"
                                >
                                    {(pending.kind === 'confirm' && pending.opts.cancelLabel) || '罷了'}
                                </button>
                                {pending.kind !== 'choose' ? (
                                    <button
                                        type="button"
                                        onClick={() => (pending.kind === 'prompt' ? submitPrompt() : close(true))}
                                        className={`es-button-primary px-4 py-1.5 text-xs ${
                                            pending.kind === 'confirm' && pending.opts.danger ? '!bg-cinnabar' : ''
                                        }`}
                                    >
                                        {pending.opts.confirmLabel ?? (pending.kind === 'confirm' ? '就這麼辦' : '定')}
                                    </button>
                                ) : null}
                            </div>
                        </motion.div>
                    </motion.div>
                ) : null}
            </AnimatePresence>
        </LabDialogContext.Provider>
    );
}
