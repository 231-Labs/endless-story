'use client';

import { useState, useTransition } from 'react';
import { clearDirectorMemoryAction } from '@/lib/actions/showrunner';
import type { DirectorMemory } from '@/lib/director/memory-store';
import { InfoHint } from '@/components/common/InfoHint';
import { DirectorChatPanel } from './DirectorChatPanel';
import { ResourceLedgerPanel } from './director/ResourceLedgerPanel';
import { ShowrunnerPanel } from './ShowrunnerPanel';

/**
 * Chat + heartbeat panels with a one-click wipe for post-redeploy resets.
 * Remounts child panels after clear so client state matches the empty store.
 */
export function CockpitMemoryPanels({ initialMemory }: { initialMemory: DirectorMemory }) {
  const [memory, setMemory] = useState(initialMemory);
  const [resetKey, setResetKey] = useState(0);
  const [notice, setNotice] = useState('');
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleClear = () => {
    if (
      !window.confirm(
        '清空後臺記憶（弧線計畫、導演日誌、對話紀錄）？\n\n重新部署後舊 saga 上下文會過時，建議清空再開始。',
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
      setNotice(parts.length > 0 ? `已清空：${parts.join('、')}。` : '後臺已是空白。');
    });
  };

  return (
    <>
      <section className="mt-12 border-t border-hairline pt-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-1.5 font-serif text-xl tracking-wide text-ink">
              對話 · AI 導演
              <InfoHint>
                跟 AI 導演（說書人）對話：問劇情（「現在故事走到哪了？」）、下小指令（補某角色、開一條張力線）、
                給大方向（寫進弧線計畫，下次心跳執行）。
              </InfoHint>
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClear}
            disabled={isPending}
            aria-label="清空後臺記憶"
            title="清空後臺（弧線計畫 / 導演日誌 / 對話）"
            className="es-icon-button h-9 w-9 shrink-0 border border-hairline disabled:opacity-50"
          >
            {isPending ? (
              <span className="text-2xs text-mute">…</span>
            ) : (
              <TrashIcon className="h-4 w-4" />
            )}
          </button>
        </div>
        {notice ? <p className="mt-3 text-sm text-jade">{notice}</p> : null}
        <div className="mt-4">
          <DirectorChatPanel key={`chat-${resetKey}`} initialChat={memory.chat} />
        </div>
      </section>

      <section className="mt-12 border-t border-hairline pt-10">
        <h2 className="flex items-center gap-1.5 font-serif text-xl tracking-wide text-ink">
          心跳與日誌
          <InfoHint>
            巡檢 → 補漏 → 評估劇情 → 干預 → 導演日誌。VPS 上由 world-loop 的{' '}
            <code className="font-mono">--showrunner-every=N</code>（或 env{' '}
            <code className="font-mono">SHOWRUNNER_EVERY_TICKS</code>）每 N tick 自動驅動、POST
            /api/showrunner；這裡可手動跑一次。
          </InfoHint>
        </h2>
        <div className="mt-4">
          <ShowrunnerPanel
            key={`log-${resetKey}`}
            initialArcPlan={memory.arcPlan}
            initialLog={memory.log}
          />
        </div>
      </section>

      <section className="mt-12 border-t border-hairline pt-10">
        <div className="flex items-center gap-2 rounded-md border border-hairline bg-surface/40 px-4 py-3 transition hover:bg-elevated/40">
          <button
            type="button"
            onClick={() => setLedgerOpen((v) => !v)}
            aria-expanded={ledgerOpen}
            className="flex flex-1 items-center gap-2 text-left"
          >
            <ChevronRightIcon
              className={`h-4 w-4 shrink-0 text-mute transition-transform ${ledgerOpen ? 'rotate-90' : ''}`}
            />
            <span className="font-serif text-base tracking-wide text-ink">帳本資源</span>
            <span className="ml-auto text-2xs tracking-widest text-mute">{ledgerOpen ? '收合' : '展開'}</span>
          </button>
          <InfoHint align="right">
            每個爭奪資源目前歸誰持有。若長期「全部懸而未決」，代表事件都 empty_outcome
            收掉、資源從沒易手（經濟凍結）。活世界 tick 跑過後，持有者應開始變動。
          </InfoHint>
        </div>
        {ledgerOpen ? (
          <div className="mt-3 rounded-md border border-hairline bg-canvas/30 p-4">
            <ResourceLedgerPanel />
          </div>
        ) : null}
      </section>
    </>
  );
}

function TrashIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

function ChevronRightIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
