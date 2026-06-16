'use client';

import { useEffect, useState, useTransition } from 'react';
import {
    fundSagaTreasuryAction,
    getSagaTreasuryEndless,
} from '@/lib/actions/fund-treasury';

/**
 * 戲班金庫 · 灌注 ENDLESS — the on-chain source of 班中俸.
 *
 * Salary is paid out of the saga treasury (mint/recruit + dream fees). When it's
 * empty and no one has subscribers, the cohort settle has nothing to pay and
 * 班中俸 prorates to 0 (frozen economy). This mints fresh ENDLESS straight into
 * the treasury so wages have a pool to draw from. Run a 活世界 tick afterwards
 * to let the off-chain settle recompute and surface the salary.
 */
export function TreasuryFundPanel() {
    const [pending, start] = useTransition();
    const [balance, setBalance] = useState<number | null>(null);
    const [amount, setAmount] = useState('100');
    const [msg, setMsg] = useState<string | null>(null);
    const [ok, setOk] = useState<boolean | null>(null);

    const refresh = () => {
        start(async () => {
            const b = await getSagaTreasuryEndless();
            setBalance(b);
        });
    };

    useEffect(() => {
        refresh();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const fund = () => {
        setMsg(null);
        setOk(null);
        start(async () => {
            const res = await fundSagaTreasuryAction(Number(amount));
            if (!res.ok) {
                setOk(false);
                setMsg(res.error ?? '交易失敗');
                return;
            }
            setOk(true);
            setBalance(res.treasuryEndless ?? balance);
            setMsg(
                `已灌注 ${res.addedEndless} ENDLESS。跑一次「活世界 tick」推進敘事日後，班中俸才會重算顯示。` +
                    (res.digest ? `（digest: ${res.digest.slice(0, 10)}…）` : ''),
            );
        });
    };

    return (
        <div>
            <div className="text-sm text-mute">
                目前金庫餘額：
                <span className={balance && balance > 0 ? 'text-ink' : 'text-cinnabar'}>
                    {balance == null ? '讀取中…' : `${balance} ENDLESS`}
                </span>
                {balance === 0 && <span className="text-cinnabar"> — 空金庫（班中俸發不出 → 0）</span>}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
                <input
                    type="number"
                    min={0}
                    step="any"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    disabled={pending}
                    className="es-field w-32"
                    aria-label="灌注金額（ENDLESS）"
                />
                <span className="text-sm text-mute">ENDLESS</span>
                <button
                    onClick={fund}
                    disabled={pending || !(Number(amount) > 0)}
                    className="rounded-full border border-hairline px-5 py-2 text-sm text-mute transition hover:text-ink disabled:opacity-50"
                >
                    {pending ? '處理中…' : '灌注金庫'}
                </button>
                <button
                    onClick={refresh}
                    disabled={pending}
                    className="text-2xs tracking-widest text-mute hover:text-ink disabled:opacity-50"
                >
                    重讀餘額
                </button>
            </div>

            {msg && (
                <p className={`mt-3 text-sm ${ok ? 'text-jade' : 'text-cinnabar'}`}>{msg}</p>
            )}
        </div>
    );
}
