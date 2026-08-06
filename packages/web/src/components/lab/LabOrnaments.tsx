/**
 * 片場裝飾 — 東方屋簷與珠簾，純 SVG/CSS 靜態元件（server-safe）。
 *
 * LabEaves：歇山飛簷的剪影帶 + 瓦當滴水一排，作 lab 頁的簷口。
 * BeadCurtain：簷下的一排垂珠。兩種身分：
 *   · 純裝飾（無 progress）——參差垂簾，卷架／頁首的儀式感，維持舊樣。
 *   · 當日行程（有 progress）——**一串一拍**：串數即 ticksPerDay，六拍就六串，
 *     等距落在畫面的節奏點上。已演的拍垂成硃串，走拍中的那串在呼吸，
 *     未來的拍只露一截淡墨。裝飾即語義，看一眼就知道今天走到哪。
 * 兩者都是裝飾層：pointer-events-none、不攔截任何互動。
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

/** 一串一拍的行程簾。串數由 total 決定（clamp 過，免得離譜的 ticksPerDay 把
 *  簷口鋪成雜訊）；兩端留 10% 內距，讓串落在節奏點上而不貼邊。 */
function DayCurtain({
    progress,
    className,
}: {
    progress: { total: number; done: number; active?: boolean };
    className: string;
}) {
    const total = Math.min(24, Math.max(1, Math.round(progress.total)));
    const done = Math.min(total, Math.max(0, Math.round(progress.done)));
    return (
        <div
            role="img"
            aria-label={`本日行程 ${done}／${total} 拍`}
            title={`本日 ${done}／${total} 拍${progress.active ? ' · 走拍中' : ''}`}
            className={`pointer-events-none flex h-6 select-none items-start justify-between px-[10%] ${className}`}
        >
            {Array.from({ length: total }).map((_, i) => {
                const played = i < done;
                // 走拍中的那一串＝正在發生的拍；一日走完（done === total）就沒有活串
                const live = Boolean(progress.active) && i === done;
                const grown = played || live;
                // 已落地的拍垂到底（四珠），未來的拍只露一截（三珠）
                // 走拍的那串在呼吸：三秒一息、只動透明度，幅度小到不會跟油畫搶眼
                const tone = played
                    ? 'text-cinnabar/55'
                    : live
                      ? 'text-cinnabar animate-[pulse_3s_cubic-bezier(0.4,0,0.6,1)_infinite] motion-reduce:animate-none'
                      : 'text-ink/25 dark:text-mute/45';
                return (
                    <span
                        key={i}
                        className={`flex flex-col items-center justify-between ${grown ? 'h-[22px]' : 'h-[12px]'} ${tone}`}
                    >
                        {Array.from({ length: grown ? 4 : 3 }).map((_, b) => (
                            <span key={b} className="h-[3px] w-[3px] rounded-full bg-current" />
                        ))}
                    </span>
                );
            })}
        </div>
    );
}

export function BeadCurtain({
    strings = 26,
    className = '',
    progress,
}: {
    /** 純裝飾模式的簾數。有 progress 時忽略——那時串數由「一日幾拍」定。 */
    strings?: number;
    className?: string;
    /** 給了就不只是簾：一串一拍的當日行程（見檔頭）。 */
    progress?: { total: number; done: number; active?: boolean };
}) {
    if (progress) return <DayCurtain progress={progress} className={className} />;

    return (
        <div
            aria-hidden
            className={`pointer-events-none flex select-none items-start justify-between overflow-hidden px-3 ${className}`}
        >
            {Array.from({ length: strings }).map((_, i) => {
                // 簾腳參差：中間略長，兩側收短，像被風理過（整數高度，水合穩定）
                const t = i / (strings - 1);
                const h = Math.round(26 + Math.sin(Math.PI * t) * 34 + ((i * 7) % 11));
                return <span key={i} className="es-bead-string" style={{ height: `${h}px` }} />;
            })}
        </div>
    );
}
