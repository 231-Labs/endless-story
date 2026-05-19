export type WalrusNetwork = 'testnet' | 'mainnet';

const AGGREGATOR_BY_NETWORK: Record<WalrusNetwork, string> = {
  testnet: 'https://aggregator.walrus-testnet.walrus.space',
  mainnet: 'https://aggregator.walrus.space',
};

export interface WalrusUrlOptions {
  network?: WalrusNetwork;
  aggregatorOverride?: string;
}

export function walrusAggregatorUrl(blobId: string, opts: WalrusUrlOptions = {}): string {
  const base = opts.aggregatorOverride ?? AGGREGATOR_BY_NETWORK[opts.network ?? 'testnet'];
  return `${base}/v1/blobs/${blobId}`;
}
