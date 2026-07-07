'use client';

/**
 * Custom, app-styled wallet connect button + picker.
 *
 * The new dapp-kit ships `ConnectButton` as a lit web component with a fixed,
 * un-themeable (black, no CSS vars / ::part) look. So we build our own on the
 * dapp-kit primitives — `useWallets()` for the installed wallets +
 * `useDAppKit().connectWallet({ wallet })` — and dress trigger + picker in the
 * site's own language (cinnabar accent, hairline panels, the shared ink tween).
 *
 * Flow:
 *   - 1 wallet   → connect directly (fast path; the extension pops its approval)
 *   - 0 or >1    → unfold an in-theme picker (install hint / wallet list)
 *
 * Plain React (no web component) so it is SSR-safe — no `next/dynamic` needed.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useDAppKit, useWallets } from '@mysten/dapp-kit-react';

// The site's shared "ink" easing (see components/common/ink-motion.tsx).
const TWEEN = { type: 'tween', ease: [0.22, 1, 0.36, 1], duration: 0.24 } as const;
const INSTALL_URL = 'https://slush.app';

const DEFAULT_TRIGGER =
    'rounded-full bg-cinnabar/15 px-4 py-1.5 text-2xs tracking-widest text-cinnabar transition-colors hover:bg-cinnabar/25 disabled:opacity-50';

export function WalletConnectButton({
    className = DEFAULT_TRIGGER,
    label = '連結錢包',
    children,
    align = 'center',
}: {
    className?: string;
    label?: string;
    /** Custom trigger content (e.g. the header status pill). Overrides `label`. */
    children?: ReactNode;
    /** Which edge the picker anchors to. Use 'right' near the viewport edge. */
    align?: 'center' | 'right';
}) {
    const dappKit = useDAppKit();
    const wallets = useWallets();
    const reduce = useReducedMotion();
    const [open, setOpen] = useState(false);
    const [connectingName, setConnectingName] = useState<string | null>(null);
    const rootRef = useRef<HTMLDivElement>(null);

    // Dismiss the picker on outside click / Esc.
    useEffect(() => {
        if (!open) return;
        const onDown = (e: PointerEvent) => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        document.addEventListener('pointerdown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('pointerdown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    async function connect(wallet: (typeof wallets)[number]) {
        setConnectingName(wallet.name);
        try {
            await dappKit.connectWallet({ wallet });
            setOpen(false);
        } catch {
            // rejected / failed — keep the picker open so they can retry
        } finally {
            setConnectingName(null);
        }
    }

    function handleTrigger() {
        if (connectingName) return;
        setOpen((o) => !o); // always unfold the picker (install hint when none)
    }

    const busy = connectingName !== null;

    return (
        <div ref={rootRef} className="relative">
            <button
                type="button"
                onClick={handleTrigger}
                disabled={busy}
                aria-haspopup="menu"
                aria-expanded={open}
                className={className}
            >
                {children ?? label}
            </button>

            <AnimatePresence>
                {open && (
                    <motion.div
                        role="menu"
                        initial={reduce ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.98 }}
                        animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
                        exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.98 }}
                        transition={reduce ? { duration: 0 } : TWEEN}
                        style={{ transformOrigin: align === 'right' ? 'top right' : 'top center' }}
                        className={`absolute top-full z-50 mt-2 w-full min-w-[14rem] overflow-hidden rounded-lg border border-hairline bg-elevated shadow-2xl shadow-black/25 ${
                            align === 'right' ? 'right-0' : 'left-1/2 -translate-x-1/2'
                        }`}
                    >
                        <p className="border-b border-hairline px-4 py-2.5 text-2xs tracking-[0.2em] text-mute">
                            選擇錢包
                        </p>

                        {wallets.length === 0 ? (
                            <a
                                href={INSTALL_URL}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-canvas/60"
                            >
                                <span className="text-sm text-mute">尚未偵測到 Sui 錢包</span>
                                <span className="whitespace-nowrap text-2xs tracking-widest text-cinnabar">
                                    安裝 Slush →
                                </span>
                            </a>
                        ) : (
                            <ul className="p-1">
                                {wallets.map((w) => {
                                    const isConnecting = connectingName === w.name;
                                    return (
                                        <li key={w.name}>
                                            <button
                                                type="button"
                                                onClick={() => void connect(w)}
                                                disabled={busy}
                                                className={`group flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors ${
                                                    busy && !isConnecting
                                                        ? 'opacity-40'
                                                        : 'hover:bg-canvas/60'
                                                }`}
                                            >
                                                <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md border border-hairline bg-canvas/50">
                                                    {w.icon ? (
                                                        // eslint-disable-next-line @next/next/no-img-element
                                                        <img src={w.icon} alt="" className="h-5 w-5" />
                                                    ) : (
                                                        <span className="text-2xs text-mute">
                                                            {w.name.slice(0, 1)}
                                                        </span>
                                                    )}
                                                </span>
                                                <span className="flex-1 truncate text-sm text-ink/85 transition-colors group-hover:text-ink">
                                                    {w.name}
                                                </span>
                                                {isConnecting ? (
                                                    <span
                                                        className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border border-cinnabar/30 border-t-cinnabar"
                                                        aria-label="連結中"
                                                    />
                                                ) : (
                                                    <span className="shrink-0 text-mute/50 transition-colors group-hover:text-cinnabar">
                                                        →
                                                    </span>
                                                )}
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
