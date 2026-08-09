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

    const isError = snapshot.phase === 'error';
    const mirror = snapshot.timeMode === 'mirror';
    const alive = snapshot.alive;
    // 主鈕寫的是**動作**，不是狀態——播放器的老規矩：看見 ▷ 就是「按了會開」，
    // 看見 ⏸ 就是「按了會停」。先前寫狀態（「活著／歇班」）誰也猜不到點下去
    // 是啟動還是停止；一個世界只有開與停兩件事，就該是一顆鈕。
    const primary = mirror
        ? alive
            ? { label: '歇班', icon: <IconPause />, title: '歇班 —— 停下自走（世界的時間照走，只是無人搬演）', run: () => labApi.control(snapshot.runId, { action: 'pause' }), key: 'pause' }
            : { label: '開演', icon: <IconStep />, title: '開演 —— 讓這一卷與現實同刻活著，每個時辰邊界自己走一拍', run: () => labApi.control(snapshot.runId, { action: 'alive', on: true }), key: 'alive' }
        : running
            ? { label: '停', icon: <IconPause />, title: '停（本拍走完即靜場）', run: () => labApi.control(snapshot.runId, { action: 'pause' }), key: 'pause' }
            : { label: '走一拍', icon: <IconStep />, title: '走一拍', run: () => labApi.control(snapshot.runId, { action: 'step' }), key: 'step' };
    const primaryLive = mirror ? alive : running;

    return (
        <div className="flex flex-wrap items-center gap-2">
            {/* 一顆主鈕定生死。走拍與否只是它左邊那顆點的事，不另立門戶。 */}
            <button
                type="button"
                disabled={busy !== null}
                onClick={() => act(primary.key, primary.run)}
                title={primary.title}
                aria-label={primary.label}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-serif text-2xs tracking-[0.2em] transition disabled:opacity-50 ${
                    primaryLive
                        ? 'border-cinnabar/50 text-ink/85 hover:border-cinnabar'
                        : 'border-hairline text-mute hover:border-cinnabar/60 hover:text-cinnabar'
                }`}
            >
                <span className="text-[13px] leading-none">{primary.icon}</span>
                {primary.label}
            </button>

            {/* 世界此刻在不在動——一顆點，不佔字。走拍中會呼吸，出錯轉硃。 */}
            <span
                title={
                    isError
                        ? (error ?? snapshot.lastError ?? '出錯（詳見下方）')
                        : running
                            ? `走拍中${snapshot.pendingTicks > 0 ? ` · 佇列尚餘 ${snapshot.pendingTicks} 拍` : ''}`
                            : mirror && alive
                                ? '活著 · 等下一個時辰邊界'
                                : '靜場'
                }
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    isError ? 'bg-cinnabar' : running || (mirror && alive) ? 'animate-lab-live-dot bg-cinnabar' : 'bg-mute/35'
                }`}
            />

            {/* 鏡像卷的次要動作：不等時辰，現在就演一拍。文字、安靜，不與主鈕爭。
                （排演卷沒有這一顆——那裡主鈕本身就是「走一拍」。） */}
            {mirror ? (
                <button
                    type="button"
                    disabled={busy !== null || running}
                    onClick={() => act('step', () => labApi.control(snapshot.runId, { action: 'step' }))}
                    title="叫一拍 —— 不等時辰邊界，立刻搬演此刻這個時辰"
                    className="font-serif text-2xs tracking-[0.2em] text-mute underline-offset-4 decoration-hairline transition hover:text-ink hover:underline disabled:opacity-40 disabled:hover:no-underline"
                >
                    叫一拍
                </button>
            ) : null}

            {/* 連走 N 拍只在排演卷成立。鏡像卷的一拍綁在時辰上：連下 6 拍不會把
                世界推到明天，只是叫同一個黃昏裡搬演六次——那不是使用者按下
                「連走 6 拍」時心裡想的事。 */}
            {mirror ? null : (
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
            )}

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
