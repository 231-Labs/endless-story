'use client';

import { useEffect, useState, useTransition } from 'react';
import {
  getRunnerControlStateAction,
  setRunnerPausedAction,
  type RunnerControlState,
} from '@/lib/actions/runner-control';

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
    <div className="es-soft-panel overflow-hidden">
      <div className="border-b border-hairline bg-surface/50 px-6 py-4">
        <h2 className="flex items-center gap-2 font-serif text-lg text-ink">
          <SettingsIcon className="h-5 w-5 text-mute" />
          系統控制
        </h2>
      </div>
      
      <div className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium text-ink">Runner 自動化腳本</h3>
            <p className="mt-1 text-sm text-mute">
              控制 VPS world-loop 是否推進章回與角色記憶。
            </p>
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

function SettingsIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
