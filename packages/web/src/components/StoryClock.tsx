'use client';

import { useEffect, useState } from 'react';
import {
  formatStoryDate,
  storyNow,
  type MirrorTimeConfig,
} from '@endless-story/shared/world-clock';

/**
 * 活時鐘 —— 鏡像時間的此刻，逐分走著。
 *
 * 兩個約束定下了這支元件的形狀：
 * 1. 時刻只在客戶端算。伺服器 render 出來的分鐘一定跟瀏覽器對不上，所以首屏
 *    渲染 `initial`（server 端取樣的 `clockHm · shichen`，兩邊一致故 hydration
 *    無從打架；無 JS 環境也至少看得到頁面送出那一刻），掛載後才換活時刻。
 * 2. 樣式一律繼承外層面板——這是一格數字，不是一塊招牌。
 *
 * 每 30 秒重取樣即可：一刻是半個時辰（30 分鐘），分鐘欄位的解析度就是上限。
 */
export function StoryClock({
  mirror,
  showDate = false,
  initial,
}: {
  mirror: MirrorTimeConfig;
  showDate?: boolean;
  /** server 取樣的首屏時刻（如 `14:32 · 未時三刻`）；缺席時首屏為 `--:--`。 */
  initial?: string;
}) {
  const [text, setText] = useState<string | null>(null);
  // 攤成純量再進 effect：呼叫端多半直接餵 snapshot.mirror 這個物件字面量，
  // 用物件當相依會讓每次 render 都重置 interval。
  const { yearOffset, tzOffsetMinutes } = mirror;

  useEffect(() => {
    const cfg: MirrorTimeConfig = { mode: 'mirror', yearOffset, tzOffsetMinutes };
    const tick = () => {
      const m = storyNow(Date.now(), cfg);
      const hm = `${String(m.hour).padStart(2, '0')}:${String(m.minute).padStart(2, '0')}`;
      const clock = `${hm} · ${m.shichen}`;
      setText(showDate ? `${formatStoryDate(m.date)} · ${clock}` : clock);
    };
    tick();
    const id = setInterval(tick, 30_000);
    // 分頁回到前景時立刻補一次——背景分頁的 timer 會被瀏覽器節流，
    // 不補的話讀者切回來會先看到一段陳舊的時刻。
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [yearOffset, tzOffsetMinutes, showDate]);

  return <span>{text ?? initial ?? '--:--'}</span>;
}
