'use client';

/**
 * DeployAdminGuard — gate deployment/setup tools by the server-side admin signer.
 *
 * `/admin/deploy` has to remain usable before bootstrap creates the saga's
 * StorytellerCap, so SagaAdminGuard is the wrong gate for this page. The CLI
 * actions here are signed by SUI_ADMIN_PRIVATE_KEY on the server; the UI gate
 * therefore asks the operator to connect that same wallet.
 */

import { useState } from 'react';
import { ConnectModal, useCurrentAccount } from '@mysten/dapp-kit';
import { truncateAddress } from '@/lib/format';

export function DeployAdminGuard({
  adminSignerAddress,
  adminSignerError,
  children,
}: {
  adminSignerAddress: string;
  adminSignerError?: string;
  children: React.ReactNode;
}) {
  const account = useCurrentAccount();
  const [connectOpen, setConnectOpen] = useState(false);

  if (!adminSignerAddress) {
    return (
      <div className="es-soft-panel px-6 py-10 text-center">
        <p className="font-serif text-lg text-ink">部署後台尚未設定簽署錢包</p>
        <p className="mt-2 text-sm text-mute">
          請先設定 <span className="font-mono text-ink/80">SUI_ADMIN_PRIVATE_KEY</span>
          ，部署與種子化腳本都會由這把 server key 簽署。
        </p>
        {adminSignerError ? (
          <p className="mx-auto mt-3 max-w-xl break-words font-mono text-xs text-mute/80">
            {adminSignerError}
          </p>
        ) : null}
      </div>
    );
  }

  if (account?.address === adminSignerAddress) return <>{children}</>;

  return (
    <>
      <div className="es-soft-panel px-6 py-10 text-center">
        <p className="font-serif text-lg text-ink">部署後台</p>
        <p className="mt-2 text-sm text-mute">
          此頁需連結 server admin signer 錢包：
          <span className="ml-1 font-mono text-ink/80">{truncateAddress(adminSignerAddress)}</span>
        </p>
        {account ? (
          <p className="mt-1 text-xs text-mute">
            當前錢包 <span className="font-mono text-ink/80">{truncateAddress(account.address)}</span>{' '}
            不是部署簽署錢包。
          </p>
        ) : (
          <p className="mt-1 text-xs text-mute">
            這裡還不是檢查 StorytellerCap；StorytellerCap 會在 bootstrap 後才出現。
          </p>
        )}
        <button
          type="button"
          onClick={() => setConnectOpen(true)}
          className="mt-6 rounded-full bg-cinnabar/15 px-4 py-1.5 text-2xs tracking-widest text-cinnabar transition-colors hover:bg-cinnabar/25"
        >
          {account ? '切換部署錢包' : '連結部署錢包'}
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
