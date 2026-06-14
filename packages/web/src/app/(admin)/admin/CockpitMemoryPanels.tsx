'use client';

import { useState, useTransition } from 'react';
import { clearDirectorMemoryAction } from '@/lib/actions/showrunner';
import type { DirectorMemory } from '@/lib/director/memory-store';
import { DirectorChatPanel } from './DirectorChatPanel';
import { ShowrunnerPanel } from './ShowrunnerPanel';

/**
 * Chat + heartbeat panels with a one-click wipe for post-redeploy resets.
 * Remounts child panels after clear so client state matches the empty store.
 */
export function CockpitMemoryPanels({ initialMemory }: { initialMemory: DirectorMemory }) {
  const [memory, setMemory] = useState(initialMemory);
  const [resetKey, setResetKey] = useState(0);
  const [notice, setNotice] = useState('');
  const [isPending, startTransition] = useTransition();

  const handleClear = () => {
    if (
      !window.confirm(
        '清空駕駛艙記憶（弧線計畫、導演日誌、對話紀錄）？\n\n重新部署後舊 saga 上下文會過時，建議清空再開始。',
      )
    ) {
      return;
    }
    setNotice('');
    startTransition(async () => {
      const result = await clearDirectorMemoryAction();
      const parts: string[] = [];
      if (result.cleared.hadArcPlan) parts.push('弧線計畫');
      if (result.cleared.log > 0) parts.push(`${result.cleared.log} 則日誌`);
      if (result.cleared.chat > 0) parts.push(`${result.cleared.chat} 則對話`);
      setMemory({ arcPlan: '', log: [], chat: [] });
      setResetKey((k) => k + 1);
      setNotice(parts.length > 0 ? `已清空：${parts.join('、')}。` : '駕駛艙已是空白。');
    });
  };

  return (
    <>
      <section className="mt-12 border-t border-hairline pt-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-serif text-xl tracking-wide text-ink">對話</h2>
            <p className="mt-2 text-sm leading-relaxed text-mute">
              問劇情（「現在故事走到哪了？」）、下小指令（補某角色、開一條張力線）、
              給大方向（寫進弧線計畫，下次心跳執行）。
            </p>
          </div>
          <button
            type="button"
            onClick={handleClear}
            disabled={isPending}
            className="shrink-0 rounded border border-hairline bg-surface px-4 py-2 text-sm tracking-widest text-mute hover:bg-elevated hover:text-ink disabled:opacity-50"
          >
            {isPending ? '清空中…' : '清空駕駛艙'}
          </button>
        </div>
        {notice ? <p className="mt-3 text-sm text-jade">{notice}</p> : null}
        <div className="mt-4">
          <DirectorChatPanel key={`chat-${resetKey}`} initialChat={memory.chat} />
        </div>
      </section>

      <section className="mt-12 border-t border-hairline pt-10">
        <h2 className="font-serif text-xl tracking-wide text-ink">心跳與日誌</h2>
        <p className="mt-2 text-sm leading-relaxed text-mute">
          巡檢 → 補漏 → 評估劇情 → 干預 → 導演日誌。VPS 上由 world-loop 的
          <code className="font-mono text-2xs"> --showrunner-every=N </code>自動驅動；這裡可手動跑一次。
        </p>
        <div className="mt-4">
          <ShowrunnerPanel
            key={`log-${resetKey}`}
            initialArcPlan={memory.arcPlan}
            initialLog={memory.log}
          />
        </div>
      </section>
    </>
  );
}
