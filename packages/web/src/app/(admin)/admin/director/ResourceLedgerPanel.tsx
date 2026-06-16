'use client';

import { useEffect, useState, useTransition } from 'react';
import { readResourceLedgerAction, type ResourceLedgerResult } from '@/lib/actions/resource-ledger';

/**
 * Resource ledger — who holds each contested resource. If everything stays
 * 懸而未決 across ticks, the economy is frozen (events resolving empty_outcome).
 * After a 活世界 tick, holders should start to appear / change.
 */
export function ResourceLedgerPanel() {
    const [pending, start] = useTransition();
    const [res, setRes] = useState<ResourceLedgerResult | null>(null);
    const [err, setErr] = useState<string | null>(null);

    const refresh = () => {
        setErr(null);
        start(async () => {
            try {
                const r = await readResourceLedgerAction();
                setRes(r);
                if (!r.ok) setErr(r.error ?? '讀取失敗');
            } catch (e) {
                setErr(e instanceof Error ? e.message : String(e));
            }
        });
    };

    useEffect(() => {
        refresh();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div>
            <button
                onClick={refresh}
                disabled={pending}
                className="rounded-full border border-hairline px-5 py-2 text-sm text-mute transition hover:text-ink disabled:opacity-50"
            >
                {pending ? '讀取中…' : '重新整理資源帳本'}
            </button>

            {err && <p className="mt-3 text-sm text-cinnabar">{err}</p>}

            {res?.ok && (
                <div className="mt-4">
                    <div className="text-sm text-mute">
                        有歸屬的資源：<span className={res.heldCount > 0 ? 'text-ink' : 'text-cinnabar'}>{res.heldCount}</span>/
                        {res.rows.length}
                        {res.heldCount === 0 && <span className="text-cinnabar"> — 全部懸而未決（經濟凍結中）</span>}
                    </div>
                    {res.rows.length === 0 ? (
                        <p className="mt-3 text-sm text-mute">這個 saga 還沒有任何 instantiate 的資源。</p>
                    ) : (
                        <table className="mt-3 w-full text-sm">
                            <thead>
                                <tr className="border-b border-hairline text-2xs uppercase tracking-[0.2em] text-mute">
                                    <th className="py-2 text-left font-normal">資源</th>
                                    <th className="py-2 text-left font-normal">容量</th>
                                    <th className="py-2 text-left font-normal">現持有者</th>
                                </tr>
                            </thead>
                            <tbody>
                                {res.rows.map((r) => (
                                    <tr key={r.resourceId} className="border-b border-hairline/50">
                                        <td className="py-2 pr-3 align-top text-ink">{r.label}</td>
                                        <td className="py-2 pr-3 align-top text-mute">{r.capacity}</td>
                                        <td className="py-2 align-top">
                                            {r.held ? (
                                                <span className="text-ink">
                                                    {r.holders.map((h) => `${h.name}${h.units > 1 ? `×${h.units}` : ''}`).join('、')}
                                                </span>
                                            ) : (
                                                <span className="text-cinnabar/80">懸而未決</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}
        </div>
    );
}
