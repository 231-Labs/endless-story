'use client';

import { useState } from 'react';
import { ENDLESS_STORY_DEPLOYMENT } from '@endless-story/sdk';
import { truncateAddress } from '@/lib/format';

/**
 * Owner address pill — shows truncated by default, expands to the full
 * address on hover, click copies. Tiny external-link badge points at
 * the chain explorer (Sui Vision) for that account on the deployment's
 * network.
 *
 * Client component because of clipboard + hover state. Keep the
 * surrounding header server-rendered; only this pill ships JS.
 */
export function OwnerDisplay({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // clipboard blocked (e.g. http context) — silently ignore;
      // the explorer link is the fallback affordance.
    }
  };

  const explorerUrl = buildExplorerUrl(address);

  return (
    <span className="group inline-flex items-center gap-1.5 text-mute">
      <span className="text-xs tracking-widest uppercase">owner</span>
      <button
        type="button"
        onClick={handleCopy}
        title={copied ? '已複製' : `點擊複製：${address}`}
        className="inline-flex items-center gap-1 font-mono text-xs tabular-nums text-ink/70 transition-colors hover:text-cinnabar"
        aria-label={copied ? '已複製' : '複製地址'}
      >
        <span className="hidden sm:inline">{truncateAddress(address)}</span>
        <span className="sm:hidden">{truncateAddress(address, 4, 4)}</span>
        <CopyIcon copied={copied} />
      </button>
      {explorerUrl ? (
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          title="在 Sui Vision 開啟"
          className="text-mute/60 transition-colors hover:text-cinnabar"
          aria-label="在 Sui 區塊鏈瀏覽器查看"
        >
          <ExternalIcon />
        </a>
      ) : null}
    </span>
  );
}

function buildExplorerUrl(address: string): string | null {
  if (!address.startsWith('0x')) return null;
  const network = ENDLESS_STORY_DEPLOYMENT.network;
  // mainnet has no query suffix on Sui Vision
  const suffix = network === 'mainnet' ? '' : `?network=${network}`;
  return `https://suivision.xyz/account/${address}${suffix}`;
}

function CopyIcon({ copied }: { copied: boolean }) {
  if (copied) {
    return (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
        <path d="M5 12l5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M14 5h5v5M19 5l-9 9M5 5h6v14H5z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
