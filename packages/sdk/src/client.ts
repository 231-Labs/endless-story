/**
 * Sui client factory — **browser-safe** subset of the sdk entry.
 *
 * Anything that touches the local file system (keypair loading from
 * `~/.endless-wuxia/keypair.json`, signer context construction) lives
 * in `./keypair-node.ts` and is exported via the `@endless-story/sdk/node`
 * subpath. That keeps Next.js client bundles from pulling in `node:fs`
 * when they only need a SuiClient.
 *
 * Uses `SuiGrpcClient` from `@mysten/sui/grpc`. The Sui JSON-RPC API is being
 * decommissioned (testnet the week of 2026-07-06, full deactivation 2026-07-31),
 * so reads/writes go over gRPC via the transport-agnostic Core API
 * (`client.core.*`). Object/tx/coin/balance/dynamic-field reads and tx execution
 * all speak gRPC; the one thing gRPC does not cover — event filtering
 * (`queryEvents`) — is served by the durable event store (see
 * `@endless-story/indexer`), whose feeder now polls GraphQL.
 *
 * Web code in browser contexts should pass an externally-provided client (e.g.
 * from dapp-kit's `useSuiClient`) via the optional `client` arg on builders,
 * rather than calling `makeSuiClient` directly.
 */
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import type { SuiNetwork } from '@endless-story/shared/contract-ids';
import { resilientFetch } from './resilient-fetch.js';

export type SuiClient = SuiGrpcClient;

export interface MakeClientOptions {
  /** Defaults to 'devnet'. */
  network?: SuiNetwork;
  /** Override the gRPC base URL (e.g. for localnet or a dedicated node). */
  url?: string;
}

/** Server-side private endpoint override. The public testnet fullnode
 *  rate-limits (429) under a tick's fan-out of reads; set SUI_GRPC_URL (or the
 *  legacy SUI_RPC_URL — both name the same fullnode host, which serves gRPC on
 *  :443) to a dedicated node. Browser bundles never see it (non-NEXT_PUBLIC ⇒
 *  undefined there). */
function envGrpcUrl(): string | undefined {
  const env = typeof process !== 'undefined' ? process.env : undefined;
  const v = env?.SUI_GRPC_URL ?? env?.SUI_RPC_URL;
  return v && v.trim() ? v.trim() : undefined;
}

/** Construct a Sui gRPC client pinned to a given network. Node / cli usage.
 *  The fullnode host is the same one JSON-RPC used, so `getJsonRpcFullnodeUrl`
 *  still yields the correct base URL (it serves gRPC-web on :443).
 *  `resilientFetch` wraps the transport for 429/5xx retry; it only special-cases
 *  JSON-RPC bodies, so for gRPC's binary bodies it is a plain retrying fetch. */
export function makeSuiClient(opts: MakeClientOptions = {}): SuiClient {
  const network = opts.network ?? 'devnet';
  const baseUrl = opts.url ?? envGrpcUrl() ?? getJsonRpcFullnodeUrl(network);
  return new SuiGrpcClient({ network, baseUrl, fetch: resilientFetch() });
}
