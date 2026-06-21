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

/** Server-side private RPC override. The public testnet fullnode rate-limits
 *  (429) hard under a tick's fan-out of reads; set SUI_RPC_URL to a dedicated
 *  node. Browser bundles never see it (non-NEXT_PUBLIC ⇒ undefined there). */
function envRpcUrl(): string | undefined {
  const v = typeof process !== 'undefined' ? process.env?.SUI_RPC_URL : undefined;
  return v && v.trim() ? v.trim() : undefined;
}

/** Harness seam (test-only): when set, EVERY `makeSuiClient` call returns this
 *  factory's client instead of a real JSON-RPC one. Installed by the full-tick
 *  harness (`__setHarnessClientFactory`) so the decoupled, zero-network fake
 *  intercepts both web and runner clients (all of them import this one factory).
 *  Null in production ⇒ zero behavioural change. */
let _harnessFactory: ((opts: MakeClientOptions) => SuiClient) | null = null;

/** Install (or clear, with `null`) the harness client factory. Test-only. */
export function __setHarnessClientFactory(
  fn: ((opts: MakeClientOptions) => SuiClient) | null,
): void {
  _harnessFactory = fn;
}

/** Construct a Sui client pinned to a given network. Node / cli usage. */
export function makeSuiClient(opts: MakeClientOptions = {}): SuiClient {
  if (_harnessFactory) return _harnessFactory(opts);
  const network = opts.network ?? 'devnet';
  const url = opts.url ?? envRpcUrl() ?? getJsonRpcFullnodeUrl(network);
  return new SuiJsonRpcClient({ url, network });
}
