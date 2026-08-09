'use client';

/**
 * LabControls — the operator's hand, wordless: step one tick, run a stretch,
 * pause, fork. Every icon carries an aria-label + title; text only where a
 * number or an error must be read.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { IconFork, IconPause, IconRun, IconStep } from './LabIcons';
import { useLabDialog } from './LabDialog';
import { labApi } from './useLab';
import { useToast } from '@/components/common/Toaster';
import type { LabLiveSnapshot } from '@/lib/lab/live';

export function LabControls({ snapshot, onChanged }: { snapshot: LabLiveSnapshot; onChanged: () => void }) {
    const router = useRouter();
    const dialog = useLabDialog();
    const toast = useToast();
    const [ticks, setTicks] = useState(6);
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const running = snapshot.phase === 'running';

    const act = async (label: string, fn: () => Promise<unknown>) => {
        setBusy(label);
        setError(null);
        try {
            await fn();
            onChanged();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(null);
        }
    };

    const iconButton =
        'es-icon-button !h-9 !w-9 text-[15px] disabled:opacity-35 disabled:hover:border-hairline';

    // ── 狀態章（世界在做什麼）+ 開關（班子上不上工），併為一枚 ──────────
    const isError = snapshot.phase === 'error';
    const mirror = snapshot.timeMode === 'mirror';
    const alive = snapshot.alive;
    // 章面只寫一個字（或佇列數）：走拍中報還剩幾拍，靜下來報班子在不在。
    const stateLabel = isError ? '!' : running ? String(snapshot.pendingTicks) : mirror ? (alive ? '活著' : '歇班') : '靜';
    const stateTitle = isError
        ? '出錯（詳見下方）'
        : running
            ? `走拍中 · 佇列尚餘 ${snapshot.pendingTicks} 拍${mirror ? (alive ? '（班子活著，時辰邊界自走）· 點一下歇班' : '（班子歇著，這是手撥的拍）· 點一下讓它活著') : ''}`
            : mirror
                ? alive
                    ? '活著 · 與現實同刻，時辰邊界自走——點一下讓班子歇著'
                    : '歇班 · 世界的時間照走，只是無人搬演——點一下讓它活著'
                : '靜場';
    const chipClass = `inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-serif text-2xs tracking-[0.2em] ${
        isError
            ? 'border-cinnabar/60 text-cinnabar'
            : running || (mirror && alive)
                ? 'border-cinnabar/40 text-ink/85'
                : 'border-hairline text-mute'
    }`;
    const dotClass = `h-1.5 w-1.5 shrink-0 rounded-full ${
        isError
            ? 'bg-cinnabar'
            : running || (mirror && alive)
                ? 'animate-lab-live-dot bg-cinnabar'
                : mirror
                    ? 'bg-mute/40'
                    : 'bg-jade/70'
    }`;

    return (
        <div className="flex flex-wrap items-center gap-2">
            {/* 世界此刻的狀態 —— 只此一枚章，而它本身就是「活著」的開關（鏡像卷）。
                先前一列裡兩顆點各說各話（演繹狀態一顆、自走開關一顆），誰也不知道
                哪個才算數；併章之後：章面說世界正在做什麼，點一下換班子上下工。 */}
            {mirror ? (
                <button
                    type="button"
                    disabled={busy === 'alive'}
                    onClick={() =>
                        act('alive', () => labApi.control(snapshot.runId, { action: 'alive', on: !alive }))
                    }
                    title={stateTitle}
                    aria-pressed={alive}
                    className={`${chipClass} transition hover:border-cinnabar/60 disabled:opacity-50`}
                >
                    <span className={dotClass} />
                    {stateLabel}
                </button>
            ) : (
                <span title={stateTitle} className={chipClass}>
                    <span className={dotClass} />
                    {stateLabel}
                </span>
            )}

            <button
                type="button"
                disabled={busy !== null || running}
                onClick={() => act('step', () => labApi.control(snapshot.runId, { action: 'step' }))}
                aria-label="走一拍"
                title="走一拍"
                className={`${iconButton} border-cinnabar/50 text-cinnabar hover:border-cinnabar`}
            >
                <IconStep />
            </button>

            <span className="inline-flex items-center gap-1">
                <button
                    type="button"
                    disabled={busy !== null || running}
                    onClick={() => act('run', () => labApi.control(snapshot.runId, { action: 'run', ticks }))}
                    aria-label={`連走 ${ticks} 拍`}
                    title={`連走 ${ticks} 拍`}
                    className={iconButton}
                >
                    <IconRun />
                </button>
                <input
                    type="number"
                    min={1}
                    max={600}
                    value={ticks}
                    onChange={(e) => setTicks(Math.max(1, Math.min(600, Number(e.target.value) || 1)))}
                    className="es-field w-14 px-1.5 py-1.5 text-center text-xs"
                    aria-label="連走拍數"
                    title="連走拍數"
                />
            </span>

            <button
                type="button"
                disabled={!running}
                onClick={() => act('pause', () => labApi.control(snapshot.runId, { action: 'pause' }))}
                aria-label="停（本拍走完即靜場）"
                title="停（本拍走完即靜場）"
                className={iconButton}
            >
                <IconPause />
            </button>

            <button
                type="button"
                disabled={busy !== null || running}
                onClick={() =>
                    act('fork', async () => {
                        const title = await dialog.prompt({
                            title: '另開一卷',
                            body: '自此一拍分支成兄弟卷，世系記於卷架。',
                            defaultValue: `${snapshot.meta.title} · 別卷`,
                            confirmLabel: '開卷',
                        });
                        if (!title) return;
                        const { meta } = await labApi.control(snapshot.runId, { action: 'fork', title });
                        if (meta) {
                            toast(`分卷「${title}」已開。`, 'success');
                            router.push(`/lab/run/${meta.id}`);
                        }
                    })
                }
                aria-label="另開一卷（分支）"
                title="另開一卷（自此一拍分支）"
                className={iconButton}
            >
                <IconFork />
            </button>

            <span
                className="font-serif text-2xs tracking-[0.15em] text-mute/80"
                title={snapshot.provider ? `實錄 · ${snapshot.provider} / ${snapshot.model}` : '排演 · 確定性假角，零鑰零費'}
            >
                {snapshot.provider ? '錄' : '排'}
            </span>

            {(error || snapshot.lastError) ? (
                <span className="w-full font-serif text-xs text-cinnabar" role="alert">
                    {error ?? snapshot.lastError}
                </span>
            ) : null}
        </div>
    );
}
