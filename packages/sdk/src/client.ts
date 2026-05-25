/**
 * Sui client factory — **browser-safe** subset of the sdk entry.
 *
 * Anything that touches the local file system (keypair loading from
 * `~/.endless-wuxia/keypair.json`, signer context construction) lives
 * in `./keypair-node.ts` and is exported via the `@endless-story/sdk/node`
 * subpath. That keeps Next.js client bundles from pulling in `node:fs`
 * when they only need a SuiClient.
 *
 * Uses `SuiJsonRpcClient` from `@mysten/sui/jsonRpc` (v2.17+ renamed
 * from the old `SuiClient`). Web code in browser contexts should pass
 * an externally-provided client (e.g. from dapp-kit's `useSuiClient`)
 * via the optional `client` arg on builders, rather than calling
 * `makeSuiClient` directly.
 */
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import type { SuiNetwork } from '@endless-story/shared/contract-ids';

export type SuiClient = SuiJsonRpcClient;

export interface MakeClientOptions {
  /** Defaults to 'devnet'. */
  network?: SuiNetwork;
  /** Override fullnode URL (e.g. for localnet or custom RPC). */
  url?: string;
}

/** Construct a Sui client pinned to a given network. Node / cli usage. */
export function makeSuiClient(opts: MakeClientOptions = {}): SuiClient {
  const network = opts.network ?? 'devnet';
  const url = opts.url ?? getJsonRpcFullnodeUrl(network);
  return new SuiJsonRpcClient({ url, network });
}
