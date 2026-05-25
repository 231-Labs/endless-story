'use client';

/**
 * SagaAdminGuard — only render children if the connected wallet holds the
 * saga's StorytellerCap (the 班主 role).
 *
 * Server actions inside /admin already run with the admin keypair, but the
 * UI shouldn't expose those forms to non-admin visitors. This is a
 * client-side gate; middleware can't see wallet state.
 *
 * States:
 *   - loading (cap fetch in flight) → spinner-y placeholder
 *   - disconnected                  → "connect 班主 wallet" CTA
 *   - connected but not admin       → denial copy with the wrong address
 *   - admin                         → children
 */

import { useState } from 'react';
import { ConnectModal } from '@mysten/dapp-kit';
import { truncateAddress } from '@/lib/format';
import { useSagaAdmin } from '@/lib/hooks/useSagaAdmin';

export function SagaAdminGuard({ children }: { children: React.ReactNode }) {
  const { account, isSagaAdmin, isLoading } = useSagaAdmin();
  const [connectOpen, setConnectOpen] = useState(false);

  if (isSagaAdmin) return <>{children}</>;

  if (isLoading) {
    return (
      <div className="es-soft-panel px-6 py-10 text-center text-sm text-mute">
        驗證班主身份中…
      </div>
    );
  }

  if (!account) {
    return (
      <>
        <div className="es-soft-panel px-6 py-10 text-center">
          <p className="font-serif text-lg text-ink">班主後台</p>
          <p className="mt-2 text-sm text-mute">
            此處需以發起本梨園的班主錢包簽入。
          </p>
          <button
            type="button"
            onClick={() => setConnectOpen(true)}
            className="mt-6 rounded-full bg-cinnabar/15 px-4 py-1.5 text-2xs tracking-widest text-cinnabar transition-colors hover:bg-cinnabar/25"
          >
            連結班主錢包
          </button>
        </div>
        <ConnectModal
          trigger={<span style={{ display: 'none' }} />}
          open={connectOpen}
          onOpenChange={setConnectOpen}
        />
      </>
    );
  }

  return (
    <div className="es-soft-panel px-6 py-10 text-center">
      <p className="font-serif text-lg text-ink">此錢包並非班主</p>
      <p className="mt-2 text-sm text-mute">
        當前錢包 <span className="font-mono text-ink/80">{truncateAddress(account.address)}</span>{' '}
        未持有此梨園的 StorytellerCap。
      </p>
      <p className="mt-1 text-xs text-mute">請改以班主錢包重新連結。</p>
    </div>
  );
}
