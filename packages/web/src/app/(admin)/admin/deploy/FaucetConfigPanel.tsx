'use client';

import { useState, useTransition } from 'react';
import {
    getFaucetSnapshot,
    setFaucetConfig,
    type FaucetSnapshot,
} from '@/lib/actions/faucet-config';
import { ENDLESS_DECIMALS } from '@endless-story/shared';

function rawToHuman(raw: string | bigint): string {
    const n = BigInt(raw);
    const denom = BigInt(10 ** ENDLESS_DECIMALS);
    return (n / denom).toString();
}

function humanToRaw(human: string): string {
    const trimmed = human.trim();
    if (!trimmed) return '0';
    const n = BigInt(trimmed);
    return (n * BigInt(10 ** ENDLESS_DECIMALS)).toString();
}

function msToHours(ms: string | bigint): string {
    const n = Number(BigInt(ms));
    return (n / (1000 * 60 * 60)).toString();
}

function hoursToMs(hours: string): string {
    const n = Number(hours.trim());
    return Math.floor(n * 1000 * 60 * 60).toString();
}

interface Props {
    initial: FaucetSnapshot | null;
}

export function FaucetConfigPanel({ initial }: Props) {
    const [snap, setSnap] = useState<FaucetSnapshot | null>(initial);
    const [dripHuman, setDripHuman] = useState<string>(initial ? rawToHuman(initial.drip_amount) : '10');
    const [cooldownHours, setCooldownHours] = useState<string>(initial ? msToHours(initial.cooldown_ms) : '24');
    const [capHuman, setCapHuman] = useState<string>(initial ? rawToHuman(initial.total_supply_cap) : '0');
    const [paused, setPaused] = useState<boolean>(initial?.paused ?? false);
    const [msg, setMsg] = useState<string>('');
    const [ok, setOk] = useState<boolean | null>(null);
    const [isPending, startTransition] = useTransition();

    const handleApply = () => {
        setMsg('Applying…');
        setOk(null);
        startTransition(async () => {
            const res = await setFaucetConfig({
                drip_amount: humanToRaw(dripHuman),
                cooldown_ms: hoursToMs(cooldownHours),
                total_supply_cap: humanToRaw(capHuman),
                paused,
            });
            if (!res.ok) {
                setOk(false);
                setMsg(`FAIL ${res.error}${res.digest ? ` (digest: ${res.digest})` : ''}`);
                return;
            }
            setOk(true);
            setMsg(`OK digest: ${res.digest}`);
            // Refresh snapshot
            const next = await getFaucetSnapshot();
            if (next) setSnap(next);
        });
    };

    const handleRefresh = () => {
        startTransition(async () => {
            const next = await getFaucetSnapshot();
            if (next) {
                setSnap(next);
                setDripHuman(rawToHuman(next.drip_amount));
                setCooldownHours(msToHours(next.cooldown_ms));
                setCapHuman(rawToHuman(next.total_supply_cap));
                setPaused(next.paused);
                setMsg('refreshed');
                setOk(true);
            } else {
                setMsg('snapshot 讀取失敗（faucet 未種子化？）');
                setOk(false);
            }
        });
    };

    return (
        <section className="es-soft-panel overflow-hidden">
            <div className="border-b border-hairline bg-surface/50 px-6 py-4 flex items-center justify-between">
                <h2 className="font-serif text-lg text-ink">Faucet 設定</h2>
                <button
                    type="button"
                    onClick={handleRefresh}
                    disabled={isPending}
                    aria-label="重讀"
                    title="重讀"
                    className="es-icon-button h-8 w-8 text-mute hover:text-ink disabled:opacity-50"
                >
                    <RefreshIcon className={`h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {snap ? (
                <div className="px-6 py-4 space-y-4 text-sm">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <Field label="drip 量 (ENDLESS)">
                            <input
                                type="number"
                                min={1}
                                value={dripHuman}
                                onChange={(e) => setDripHuman(e.target.value)}
                                className="es-field w-full"
                                disabled={isPending}
                            />
                            <p className="text-2xs text-mute mt-1">
                                當前: {rawToHuman(snap.drip_amount)} ENDLESS
                            </p>
                        </Field>
                        <Field label="cooldown (小時 per address)">
                            <input
                                type="number"
                                min={0}
                                step={0.01}
                                value={cooldownHours}
                                onChange={(e) => setCooldownHours(e.target.value)}
                                className="es-field w-full"
                                disabled={isPending}
                            />
                            <p className="text-2xs text-mute mt-1">
                                當前: {msToHours(snap.cooldown_ms)} 小時
                            </p>
                        </Field>
                        <Field label="總供給上限 (ENDLESS, 0=無限)">
                            <input
                                type="number"
                                min={0}
                                value={capHuman}
                                onChange={(e) => setCapHuman(e.target.value)}
                                className="es-field w-full"
                                disabled={isPending}
                            />
                            <p className="text-2xs text-mute mt-1">
                                當前: {rawToHuman(snap.total_supply_cap)} ENDLESS
                                · 已 mint {rawToHuman(snap.total_minted)}
                            </p>
                        </Field>
                        <Field label="暫停">
                            <label className="flex items-center gap-2 text-sm">
                                <input
                                    type="checkbox"
                                    checked={paused}
                                    onChange={(e) => setPaused(e.target.checked)}
                                    disabled={isPending}
                                />
                                paused (擋掉所有 drip)
                            </label>
                            <p className="text-2xs text-mute mt-1">當前: {snap.paused ? 'paused' : 'open'}</p>
                        </Field>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={handleApply}
                            disabled={isPending}
                            className="es-outline-button inline-flex items-center gap-1.5 text-sm"
                            title="套用設定（set_config）"
                        >
                            <CheckIcon className="h-4 w-4" />
                            套用
                        </button>
                        {msg && (
                            <span
                                className={`text-xs ${
                                    ok === true
                                        ? 'text-jade'
                                        : ok === false
                                          ? 'text-cinnabar'
                                          : 'text-mute'
                                }`}
                            >
                                {msg}
                            </span>
                        )}
                    </div>
                </div>
            ) : (
                <div className="px-6 py-8 text-sm text-mute">
                    Faucet 尚未種子化 — 先跑 ② bootstrap。
                </div>
            )}
        </section>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="block">
            <span className="block text-xs text-mute mb-1">{label}</span>
            {children}
        </label>
    );
}

function RefreshIcon(props: React.SVGProps<SVGSVGElement>) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
            <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
            <path d="M21 3v5h-5" />
            <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
            <path d="M3 21v-5h5" />
        </svg>
    );
}

function CheckIcon(props: React.SVGProps<SVGSVGElement>) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
            <path d="M20 6 9 17l-5-5" />
        </svg>
    );
}
