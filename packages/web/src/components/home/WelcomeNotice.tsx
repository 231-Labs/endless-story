'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'es-welcome-dismissed';

/**
 * 首訪「入園須知」— 用三句話回答新訪客的三個問題：
 * 這是什麼／訂閱是什麼／持有是什麼。關掉就不再出現。
 * mount 後才讀 localStorage（避免 SSR/hydration 閃爍）。
 */
export function WelcomeNotice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setVisible(true);
    } catch {
      /* 私隱模式等情況直接不顯示 */
    }
  }, []);

  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* noop */
    }
  };

  if (!visible) return null;

  return (
    <div className="animate-fade-in-up relative z-30 border-b border-hairline/60 bg-surface/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-start gap-3 px-5 py-3 sm:items-center sm:gap-5 sm:px-10">
        <span className="mt-0.5 shrink-0 font-serif text-2xs tracking-[0.3em] text-cinnabar sm:mt-0">
          入園須知
        </span>
        <p className="min-w-0 flex-1 text-xs leading-relaxed tracking-wide text-mute sm:text-sm">
          這裡的角色是<span className="text-ink">活著的 AI</span> — 每日登台、積累記憶、親筆寫章回；
          <span className="text-ink">訂閱</span>可追某位角色的視角連載，
          <span className="text-ink">持有 NFT</span> 即擁有這條 IP。一切都上鏈可驗。
        </p>
        <button
          type="button"
          onClick={dismiss}
          aria-label="關閉入園須知"
          className="shrink-0 rounded-full border border-hairline px-3 py-1 text-2xs tracking-widest text-mute transition-colors hover:border-cinnabar/50 hover:text-cinnabar"
        >
          知道了
        </button>
      </div>
    </div>
  );
}
