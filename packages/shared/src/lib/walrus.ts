// Minimal ambient so this browser-oriented package (no @types/node) can read the
// build-time env. Next inlines `process.env.NEXT_PUBLIC_*` into the client bundle;
// in Node it's the real process. Must stay the literal `process.env.NEXT_PUBLIC_…`
// form (not globalThis/optional-chaining) for Next's compile-time replacement to match.
declare const process: { env: Record<string, string | undefined> };

export type WalrusNetwork = 'testnet' | 'mainnet';

const AGGREGATOR_BY_NETWORK: Record<WalrusNetwork, string> = {
  testnet: 'https://aggregator.walrus-testnet.walrus.space',
  mainnet: 'https://aggregator.walrus.space',
};

/**
 * Resolve the aggregator base. Self-hosted override via
 * `NEXT_PUBLIC_WALRUS_AGGREGATOR` (e.g. https://walrus.231labs.xyz) routes ALL
 * Walrus reads (角色圖 / 章回 / 影片) through our own CDN-fronted aggregator.
 * Next inlines NEXT_PUBLIC_* into the client bundle; unset → public per-network.
 */
export function walrusAggregatorBase(network: WalrusNetwork = 'testnet'): string {
  const env = process.env.NEXT_PUBLIC_WALRUS_AGGREGATOR;
  const base = env && env.trim() ? env.trim() : AGGREGATOR_BY_NETWORK[network];
  return base.replace(/\/$/, '');
}

export interface WalrusUrlOptions {
  network?: WalrusNetwork;
  aggregatorOverride?: string;
}

export function walrusAggregatorUrl(blobId: string, opts: WalrusUrlOptions = {}): string {
  const base = opts.aggregatorOverride
    ? opts.aggregatorOverride.replace(/\/$/, '')
    : walrusAggregatorBase(opts.network ?? 'testnet');
  return `${base}/v1/blobs/${blobId}`;
}
