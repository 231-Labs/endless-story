/**
 * 片場裝飾 — 東方屋簷與珠簾，純 SVG/CSS 靜態元件（server-safe）。
 *
 * LabEaves：歇山飛簷的剪影帶 + 瓦當滴水一排，作 lab 頁的簷口。
 * BeadCurtain：一排垂珠簾（CSS 動畫輕擺），簷下作分隔／入口的儀式感。
 * 兩者都是裝飾層：aria-hidden、pointer-events-none、不攔截任何互動。
 */

export function LabEaves({ className = '' }: { className?: string }) {
    // 瓦當 (eave-end discs) evenly across; the ridge is one calligraphic curve
    // with upturned corners (飛簷), drawn as strokes so it stays light.
    const discs = Array.from({ length: 22 });
    return (
        <div aria-hidden className={`pointer-events-none select-none ${className}`}>
            <svg
                viewBox="0 0 1200 84"
                preserveAspectRatio="none"
                className="block h-14 w-full text-ink/70 dark:text-seal/80 sm:h-16"
            >
                {/* 正脊與垂脊的一筆：兩端飛簷微翹 */}
                <path
                    d="M8,30 C120,10 320,4 600,4 C880,4 1080,10 1192,30"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    opacity="0.9"
                />
                <path
                    d="M8,30 C6,22 4,16 2,8 M1192,30 C1194,22 1196,16 1198,8"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    opacity="0.8"
                />
                {/* 檐口第二道弧，略低略淡，畫出瓦壟的厚度 */}
                <path
                    d="M24,46 C150,28 340,22 600,22 C860,22 1050,28 1176,46"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    opacity="0.45"
                />
                {/* 瓦當一排：圓當 + 滴水三角，等距。座標一律定成一位小數字串，
                    server/client 序列化才逐字相同（否則 React 19 水合報警）。 */}
                {discs.map((_, i) => {
                    const t = i / (discs.length - 1);
                    // follow the second curve's height roughly
                    const x = Number((40 + t * 1120).toFixed(1));
                    const y = Number((60 - Math.sin(Math.PI * t) * 22).toFixed(1));
                    return (
                        <g key={i} opacity="0.75">
                            <circle cx={x} cy={y} r="4.6" fill="none" stroke="currentColor" strokeWidth="1.3" />
                            <circle cx={x} cy={y} r="1.2" fill="currentColor" opacity="0.7" />
                            <path
                                d={`M${(x - 4.2).toFixed(1)},${(y + 7).toFixed(1)} L${x},${(y + 13.5).toFixed(1)} L${(x + 4.2).toFixed(1)},${(y + 7).toFixed(1)}`}
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1"
                                opacity="0.5"
                            />
                        </g>
                    );
                })}
            </svg>
        </div>
    );
}

export function BeadCurtain({
    strings = 26,
    className = '',
    progress,
}: {
    strings?: number;
    className?: string;
    /** When set, the curtain doubles as the day's tick progress: strings light
     *  up cinnabar left→right as `done/total` advances; the boundary string
     *  breathes while a tick is walking (`active`). */
    progress?: { total: number; done: number; active?: boolean };
}) {
    const fraction = progress ? Math.max(0, Math.min(1, progress.done / Math.max(1, progress.total))) : 0;
    const lit = progress ? Math.round(fraction * strings) : 0;
    return (
        <div
            aria-hidden={progress ? undefined : true}
            role={progress ? 'img' : undefined}
            aria-label={progress ? `本日行程 ${progress.done}／${progress.total} 拍` : undefined}
            title={progress ? `本日 ${progress.done}／${progress.total} 拍${progress.active ? ' · 走拍中' : ''}` : undefined}
            className={`pointer-events-none flex select-none items-start justify-between overflow-hidden px-3 ${className}`}
        >
            {Array.from({ length: strings }).map((_, i) => {
                // 簾腳參差：中間略長，兩側收短，像被風理過（整數高度，水合穩定）
                const t = i / (strings - 1);
                const h = Math.round(26 + Math.sin(Math.PI * t) * 34 + ((i * 7) % 11));
                const isLit = progress ? i < lit : false;
                const isLive = Boolean(progress?.active) && i === Math.min(strings - 1, lit);
                const cls = `es-bead-string${isLit ? ' es-bead-string--lit' : ''}${isLive ? ' es-bead-string--live' : ''}`;
                return <span key={i} className={cls} style={{ height: `${h}px` }} />;
            })}
        </div>
    );
}
