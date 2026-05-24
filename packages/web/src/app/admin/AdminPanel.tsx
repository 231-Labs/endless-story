'use client';

import { useState } from 'react';

export function AdminPanel() {
  const [isRunnerEnabled, setIsRunnerEnabled] = useState(false);

  return (
    <div className="es-soft-panel overflow-hidden">
      <div className="border-b border-hairline px-6 py-4">
        <h2 className="font-serif text-lg text-ink">系統控制</h2>
      </div>
      
      <div className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium text-ink">Runner 自動化腳本</h3>
            <p className="mt-1 text-sm text-mute">
              啟用後，系統將自動推進章回與角色記憶。
            </p>
          </div>
          
          <button
            type="button"
            onClick={() => setIsRunnerEnabled(!isRunnerEnabled)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              isRunnerEnabled ? 'bg-jade' : 'bg-mute/30'
            }`}
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
