/**
 * Transaction execution seam for the gRPC Core API.
 *
 * The gRPC `signAndExecuteTransaction` returns a `TransactionResult` — a
 * `$kind`-tagged union (`Transaction` | `FailedTransaction`) whose payload
 * exposes `status`, `effects`, `events` and an `objectTypes` map. That shape is
 * nothing like JSON-RPC's old `{ digest, effects: { status }, objectChanges }`.
 * Rather than teach ~50 call-sites the new shape, they all go through
 * `signAndExecute`, which returns one stable, flat `ExecutedTx`.
 *
 * Created-object identification changes too: gRPC has no `objectChanges` array
 * with `objectType`. Instead we read `effects.changedObjects` (filtering
 * `idOperation === 'Created'`) and resolve each id's type through the
 * `objectTypes` map that `include: { objectTypes: true }` returns. That is what
 * `findCreatedObjectId` does — a drop-in for the old
 * `objectChanges.find(c => c.objectType?.endsWith('…'))`.
 */
import type { Transaction } from '@mysten/sui/transactions';
import type { Signer } from '@mysten/sui/cryptography';
import type { SuiClientTypes } from '@mysten/sui/client';
import type { SuiClient } from './client.js';

export type TxEffects = SuiClientTypes.TransactionEffects;
export type TxEvent = SuiClientTypes.Event;
export type TxResult = SuiClientTypes.TransactionResult;

/** The three includes `signAndExecute` always requests. */
type FullInclude = { effects: true; events: true; objectTypes: true };

/** Flat, transport-stable execution result. Every write call-site reads this. */
export interface ExecutedTx {
  digest: string;
  success: boolean;
  /** Human-readable Move/execution error, or null on success. */
  error: string | null;
  effects: TxEffects | undefined;
  events: TxEvent[] | undefined;
  /** objectId → fully-qualified type, for every object the tx touched. */
  objectTypes: Record<string, string> | undefined;
  /** The raw gRPC result, for the rare caller that needs more. */
  raw: TxResult;
}

export interface SignAndExecuteInput {
  /** An unbuilt `Transaction` (built + signed internally) or prebuilt bytes. */
  transaction: Transaction | Uint8Array;
  signer: Signer;
  /**
   * Await checkpoint finality (so a follow-up read sees the new object
   * versions) before returning. Default true. Set false when the caller does
   * its own serialization/wait (e.g. the admin-tx lock).
   */
  waitForFinality?: boolean;
}

/**
 * Sign + execute a transaction over gRPC and normalize the result. Always
 * requests effects, events and the objectTypes map so `findCreatedObjectId`
 * and status checks work off the returned `ExecutedTx` with no extra reads.
 */
export async function signAndExecute(
  client: SuiClient,
  input: SignAndExecuteInput,
): Promise<ExecutedTx> {
  const res = await client.signAndExecuteTransaction({
    transaction: input.transaction,
    signer: input.signer,
    include: { effects: true, events: true, objectTypes: true },
  });
  const out = normalizeTxResult(res);

  if ((input.waitForFinality ?? true) && out.digest) {
    // Best-effort: finality only gates read-after-write visibility.
    await client.waitForTransaction({ digest: out.digest }).catch(() => {});
  }
  return out;
}

/**
 * Flatten any gRPC / dapp-kit `TransactionResult` (the `$kind`-tagged
 * `Transaction | FailedTransaction` union) into the stable `ExecutedTx`. Use in
 * the browser, where the wallet — not a `Signer` — executes the tx: pass the
 * `dAppKit.signAndExecuteTransaction(...)` result (or a `waitForTransaction`
 * result) straight in. `effects` / `events` / `objectTypes` are populated only
 * for the includes the caller requested; `findCreatedObjectId` needs `effects`
 * + `objectTypes`, so a browser flow that identifies a created object should
 * re-read via `client.waitForTransaction({ digest, include: { effects: true,
 * objectTypes: true } })` and normalize that.
 */
export function normalizeTxResult(res: TxResult): ExecutedTx {
  // On success the payload is under `Transaction`; on a Move/exec failure it is
  // under `FailedTransaction`. Both carry the same `Transaction` shape.
  const tx = (res.Transaction ?? res.FailedTransaction) as SuiClientTypes.Transaction<FullInclude>;
  const status = tx.status;
  return {
    digest: tx.digest,
    success: status.success,
    error: status.success ? null : (status.error?.message ?? 'transaction failed'),
    effects: tx.effects,
    events: tx.events,
    objectTypes: tx.objectTypes,
    raw: res,
  };
}

const CREATED = 'Created';

/** First created object whose type ends with `typeSuffix` (e.g. `::dream::Dream`). */
export function findCreatedObjectId(tx: ExecutedTx, typeSuffix: string): string | undefined {
  const types = tx.objectTypes ?? {};
  const created = (tx.effects?.changedObjects ?? []).filter((c) => c.idOperation === CREATED);
  return created.find((c) => types[c.objectId]?.endsWith(typeSuffix))?.objectId;
}

/** All created object ids whose type ends with `typeSuffix`, in effects order. */
export function findCreatedObjectIds(tx: ExecutedTx, typeSuffix: string): string[] {
  const types = tx.objectTypes ?? {};
  return (tx.effects?.changedObjects ?? [])
    .filter((c) => c.idOperation === CREATED && types[c.objectId]?.endsWith(typeSuffix))
    .map((c) => c.objectId);
}

/** First object of any change-kind whose type ends with `typeSuffix`. */
export function findChangedObjectId(tx: ExecutedTx, typeSuffix: string): string | undefined {
  const types = tx.objectTypes ?? {};
  return (tx.effects?.changedObjects ?? []).find((c) => types[c.objectId]?.endsWith(typeSuffix))
    ?.objectId;
}

/**
 * The package id published (or upgraded) by a publish/upgrade tx. gRPC has no
 * `objectChanges` "published" entry; a package shows up in effects as a created
 * object with `outputState: 'PackageWrite'`.
 */
export function findPublishedPackageId(tx: ExecutedTx): string | undefined {
  return (tx.effects?.changedObjects ?? []).find(
    (c) => c.outputState === 'PackageWrite' && c.idOperation === 'Created',
  )?.objectId;
}
