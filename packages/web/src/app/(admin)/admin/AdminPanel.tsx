'use client';

import { useEffect, useState, useTransition } from 'react';
import {
  getRunnerControlStateAction,
  setRunnerPausedAction,
  type RunnerControlState,
} from '@/lib/actions/runner-control';
import { InfoHint } from '@/components/common/InfoHint';

export function AdminPanel() {
  const [control, setControl] = useState<RunnerControlState | null>(null);
  const [isPending, startTransition] = useTransition();
  const isRunnerEnabled = Boolean(control?.configured && !control.paused && !control.error);

  useEffect(() => {
    let alive = true;
    getRunnerControlStateAction().then((state) => {
      if (alive) setControl(state);
    });
    return () => {
      alive = false;
    };
  }, []);

  const toggleRunner = () => {
    if (!control?.configured || isPending) return;
    startTransition(async () => {
      const next = await setRunnerPausedAction({ paused: isRunnerEnabled });
      setControl(next);
    });
  };

  return (
    <div className="es-soft-panel flex h-full flex-col overflow-hidden">
      <div className="border-b border-hairline bg-surface/50 px-6 py-4">
        <h2 className="font-serif text-lg text-ink">系統控制</h2>
      </div>

      <div className="flex flex-1 flex-col justify-center p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="flex items-center gap-1.5 font-medium text-ink">
              Runner 自動化腳本
              <InfoHint>控制 VPS world-loop 是否推進章回與角色記憶（暫停＝整個世界停跑）。</InfoHint>
            </h3>
            <p className="mt-1 text-2xs tracking-widest text-mute">
              {control
                ? control.configured
                  ? control.error
                    ? `控制端錯誤：${control.error}`
                    : `目前：${control.paused ? 'paused' : 'running'}`
                  : '尚未設定 RUNNER_CONTROL_URL'
                : '讀取控制端…'}
            </p>
          </div>
          
          <button
            type="button"
            onClick={toggleRunner}
            disabled={!control?.configured || isPending}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              isRunnerEnabled ? 'bg-jade' : 'bg-mute/30'
            } disabled:cursor-not-allowed disabled:opacity-50`}
            role="switch"
            aria-checked={isRunnerEnabled}
          >
            <span className="sr-only">啟用 Runner</span>
            <span
              aria-hidden="true"
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                isRunnerEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
