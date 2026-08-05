import { chineseNumber } from '@endless-story/shared/world-clock';
import type { WorldTimeSnapshot } from '@/lib/actions/world-time';
import { StoryClock } from '@/components/StoryClock';

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'] as const;

/**
 * Read-only world clock.
 *
 * 兩種時間模式各說各的話（見 docs/narrative/WORLD_TIME_MIRROR.md）：
 * - `tick`   —— tick 就是時間，日與時辰由拍數推導，面板照舊。
 * - `mirror` —— 牆鐘是時間之源，日期是主詞；tick 退為「心跳」，
 *               只記世界獲准演繹的那一刻。這裡的文案不可再說 tick 是時鐘。
 */
export function TimePanel({ initial: snapshot }: { initial: WorldTimeSnapshot | null }) {
    const wall = snapshot?.mode === 'mirror' ? snapshot : null;
    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-x-8 gap-y-3 rounded border border-hairline bg-canvas/40 p-4">
                <div>
                    <div className="flex items-center gap-1.5 text-2xs tracking-widest text-mute">
                        {snapshot ? (
                            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-jade" aria-hidden />
                        ) : null}
                        當前敘事日
                    </div>
                    <div className="mt-1 font-serif text-3xl leading-none text-ink">
                        {wall ? (wall.dateLabel ?? '—') : snapshot ? `第 ${snapshot.day} 日` : '—'}
                    </div>
                    {wall ? (
                        <div className="mt-1.5 text-2xs tracking-widest text-mute">
                            {wall.dateLabelIso ?? ''}
                            {wall.date ? ` · 星期${WEEKDAYS[wall.date.weekday] ?? ''}` : ''}
                        </div>
                    ) : null}
                </div>
                {wall ? (
                    <div>
                        <div className="text-2xs tracking-widest text-mute">時辰</div>
                        <div className="mt-1 font-serif text-lg text-ink">
                            {wall.partOfDay} ·{' '}
                            {wall.mirror ? (
                                <StoryClock
                                    mirror={wall.mirror}
                                    initial={wall.clockHm ? `${wall.clockHm} · ${wall.shichen ?? ''}` : undefined}
                                />
                            ) : (wall.shichen ?? '—')}
                        </div>
                    </div>
                ) : (
                    <TimeStat label="時辰" value={snapshot?.partOfDay ?? '—'} />
                )}
                <TimeStat
                    label={wall ? '心跳' : 'tick'}
                    value={
                        wall
                            ? `${wall.currentTick}（本日第 ${wall.tickOfDay + 1}/${wall.ticksPerDay} 拍）`
                            : snapshot
                              ? `${snapshot.currentTick}（日內 ${snapshot.tickOfDay + 1}/${snapshot.ticksPerDay}）`
                              : '—'
                    }
                />
            </div>
            <p className="text-2xs tracking-widest text-mute">
                {wall
                    ? `鏡像時間：與現實同刻，早${chineseNumber(wall.mirror?.yearOffset ?? 100)}年。時辰邊界自動打拍。`
                    : snapshot
                      ? `每 ${snapshot.ticksPerDay} tick 跨一日（${snapshot.daysPerTickBp} bp）。world-loop 自動推進。`
                      : 'World 尚未種子化。'}
            </p>
        </div>
    );
}

function TimeStat({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <div className="text-2xs tracking-widest text-mute">{label}</div>
            <div className="mt-1 font-serif text-lg text-ink">{value}</div>
        </div>
    );
}
