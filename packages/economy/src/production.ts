// production.ts — the season-world economy domain: multi-party accounts (characters,
// organizations, outside businesses), an append-only transaction ledger, purchases with
// spending authority, and deterministic daily fixed-cost settlement.
//
// This EXTENDS the same deterministic bigint core as settleDay — it never reimplements
// balance, runway, or vitality math. Where settleDay models the protocol economy
// (subscriptions / payroll pool / storage rent), this models the in-fiction economy a
// season world runs on: personal cash, a troupe treasury with authorized spenders, and
// priced affordances whose money always moves between accounted buckets.
//
// Invariants (asserted by conservesProduction + tests):
//   injected === Σ account.available + Σ account.reserved
//   no account ever goes negative; reserved funds are released, never destroyed
//   every mutation is an EconomyTransaction with a caller-supplied id + causeEventId;
//   re-applying an already-ledgered id is a no-op (idempotent settlement)
//
// Units are caller-defined bigint minimum units (a 1924 season uses 分; the protocol
// economy uses MUNIT base units). The domain never assumes a scale.

import { bmin } from "./fixed.ts";

export type AccountOwnerType = "character" | "troupe" | "business";

export interface EconomyAccount {
  id: string;
  ownerType: AccountOwnerType;
  /** display name for percepts/ledger rendering. */
  label: string;
  /** spendable balance, minimum units, ≥ 0. */
  available: bigint;
  /** escrowed balance (e.g. a contract advance held until signed/rejected), ≥ 0. */
  reserved: bigint;
  /** daily fixed outflow at settleEconomyDay (living cost / operating cost). */
  dailyFixedCost: bigint;
  /** ids allowed to spend from this account besides the owner itself.
   *  A character account is spendable only by its own id; an organization account
   *  is spendable only by ids listed here. Knowing a treasury exists ≠ authority. */
  authorizedSpenderIds: string[];
}

export type TransactionKind =
  | "external-in"    // money entering the modelled world (contract advance funding, patron cash)
  | "transfer"       // account → account, actor-initiated
  | "purchase"       // account → vendor account, buys a priced affordance
  | "wage"           // troupe → member daily wage
  | "fixed-cost"     // account → market, daily living/operating cost
  | "bill"           // account → creditor, periodic lump-sum due (system-collected)
  | "reserve"        // available → reserved within one account
  | "release"        // reserved → available within one account
  | "contract-payout"; // escrow → beneficiary on contract settlement

export interface EconomyTransaction {
  /** caller-supplied deterministic id — the idempotency key. */
  id: string;
  day: number;
  kind: TransactionKind;
  /** source account id, or "external" for external-in. */
  from: string;
  /** destination account id. */
  to: string;
  amount: bigint;
  memo: string;
  /** canon event that caused this money movement. Never empty. */
  causeEventId: string;
}

export interface EconomyRejection {
  code:
    | "NO_ACCOUNT"
    | "NOT_AUTHORIZED"
    | "INSUFFICIENT"
    | "NON_POSITIVE"
    | "SELF_TRANSFER"
    | "NO_CAUSE"
    | "BAD_ID";
  message: string;
}

export interface EconomyState {
  day: number;
  accounts: Record<string, EconomyAccount>;
  /** append-only; doubles as the idempotency record (transaction ids are unique). */
  ledger: EconomyTransaction[];
  /** total money ever injected from outside the modelled accounts. */
  injected: bigint;
  /** days already settled by settleEconomyDay — re-settling is a no-op. */
  settledDays: number[];
}

export interface EconomyResult {
  state: EconomyState;
  /** transactions actually applied by this call (empty on duplicate/no-op). */
  applied: EconomyTransaction[];
  /** true when the call was a duplicate id and the state is unchanged. */
  duplicate: boolean;
  rejection?: EconomyRejection;
}

// ── construction ──

export function emptyEconomy(day = 0): EconomyState {
  return { day, accounts: {}, ledger: [], injected: 0n, settledDays: [] };
}

export interface AccountSeed {
  id: string;
  ownerType: AccountOwnerType;
  label: string;
  opening: bigint;
  dailyFixedCost?: bigint;
  authorizedSpenderIds?: string[];
}

/** Open accounts with opening balances. Opening money counts as injected. */
export function openAccounts(state: EconomyState, seeds: AccountSeed[]): EconomyState {
  const next = cloneState(state);
  for (const seed of seeds) {
    if (next.accounts[seed.id]) throw new Error(`economy: account ${seed.id} already exists`);
    if (seed.opening < 0n) throw new Error(`economy: opening balance for ${seed.id} must be ≥ 0`);
    next.accounts[seed.id] = {
      id: seed.id,
      ownerType: seed.ownerType,
      label: seed.label,
      available: seed.opening,
      reserved: 0n,
      dailyFixedCost: seed.dailyFixedCost ?? 0n,
      authorizedSpenderIds: [...(seed.authorizedSpenderIds ?? [])],
    };
    next.injected += seed.opening;
  }
  return next;
}

// ── internals ──

function cloneAccount(a: EconomyAccount): EconomyAccount {
  return { ...a, authorizedSpenderIds: [...a.authorizedSpenderIds] };
}

function cloneState(s: EconomyState): EconomyState {
  const accounts: Record<string, EconomyAccount> = {};
  for (const [id, a] of Object.entries(s.accounts)) accounts[id] = cloneAccount(a);
  return { day: s.day, accounts, ledger: [...s.ledger], injected: s.injected, settledDays: [...s.settledDays] };
}

function alreadyApplied(state: EconomyState, txnId: string): boolean {
  return state.ledger.some((t) => t.id === txnId);
}

function reject(state: EconomyState, code: EconomyRejection["code"], message: string): EconomyResult {
  return { state, applied: [], duplicate: false, rejection: { code, message } };
}

function duplicateResult(state: EconomyState): EconomyResult {
  return { state, applied: [], duplicate: true };
}

/** Spending authority: the account owner (character accounts) or a listed spender. */
export function maySpend(account: EconomyAccount, actorId: string): boolean {
  if (account.ownerType === "character") return account.id === actorId || account.authorizedSpenderIds.includes(actorId);
  return account.authorizedSpenderIds.includes(actorId);
}

interface MoveRequest {
  txnId: string;
  day: number;
  kind: TransactionKind;
  from: string;
  to: string;
  amount: bigint;
  memo: string;
  causeEventId: string;
  /** actor initiating the spend; system moves (wage, fixed-cost) pass null. */
  actorId: string | null;
}

/** The one guarded account→account move every transition funnels through. */
function move(state: EconomyState, req: MoveRequest): EconomyResult {
  if (!req.txnId) return reject(state, "BAD_ID", "a transaction needs a deterministic id");
  if (alreadyApplied(state, req.txnId)) return duplicateResult(state);
  if (!req.causeEventId) return reject(state, "NO_CAUSE", `transaction ${req.txnId} has no causeEventId`);
  if (req.amount <= 0n) return reject(state, "NON_POSITIVE", `amount must be positive, got ${req.amount}`);
  if (req.from === req.to) return reject(state, "SELF_TRANSFER", `${req.from} cannot pay itself`);
  const from = state.accounts[req.from];
  const to = state.accounts[req.to];
  if (!from) return reject(state, "NO_ACCOUNT", `unknown source account ${req.from}`);
  if (!to) return reject(state, "NO_ACCOUNT", `unknown destination account ${req.to}`);
  if (req.actorId !== null && !maySpend(from, req.actorId)) {
    return reject(state, "NOT_AUTHORIZED", `${req.actorId} has no spending authority over ${from.label}`);
  }
  if (from.available < req.amount) {
    return reject(state, "INSUFFICIENT", `${from.label} holds ${from.available}, needs ${req.amount}`);
  }
  const next = cloneState(state);
  next.accounts[req.from].available -= req.amount;
  next.accounts[req.to].available += req.amount;
  const txn: EconomyTransaction = {
    id: req.txnId, day: req.day, kind: req.kind,
    from: req.from, to: req.to, amount: req.amount, memo: req.memo, causeEventId: req.causeEventId,
  };
  next.ledger.push(txn);
  return { state: next, applied: [txn], duplicate: false };
}

// ── transitions ──

export interface DepositRequest {
  txnId: string;
  to: string;
  amount: bigint;
  memo: string;
  causeEventId: string;
}

/** Money entering the modelled world (funds a business account, patron cash…). */
export function depositExternal(state: EconomyState, req: DepositRequest): EconomyResult {
  if (!req.txnId) return reject(state, "BAD_ID", "a transaction needs a deterministic id");
  if (alreadyApplied(state, req.txnId)) return duplicateResult(state);
  if (!req.causeEventId) return reject(state, "NO_CAUSE", `transaction ${req.txnId} has no causeEventId`);
  if (req.amount <= 0n) return reject(state, "NON_POSITIVE", `amount must be positive, got ${req.amount}`);
  const to = state.accounts[req.to];
  if (!to) return reject(state, "NO_ACCOUNT", `unknown destination account ${req.to}`);
  const next = cloneState(state);
  next.accounts[req.to].available += req.amount;
  next.injected += req.amount;
  const txn: EconomyTransaction = {
    id: req.txnId, day: state.day, kind: "external-in",
    from: "external", to: req.to, amount: req.amount, memo: req.memo, causeEventId: req.causeEventId,
  };
  next.ledger.push(txn);
  return { state: next, applied: [txn], duplicate: false };
}

export interface SpendRequest {
  txnId: string;
  /** who initiates the spend — authority is checked against the source account. */
  actorId: string;
  from: string;
  to: string;
  amount: bigint;
  memo: string;
  causeEventId: string;
}

/** Actor-initiated account→account payment (gift, repayment, budget grant…). */
export function transferMoney(state: EconomyState, req: SpendRequest): EconomyResult {
  return move(state, { ...req, day: state.day, kind: "transfer" });
}

/** A purchase is a transfer to the vendor — the CALLER must also apply the bought
 *  effect to the world (repaired object, better lodging, production unlock); the
 *  domain only moves the money and records what was bought. */
export function purchase(state: EconomyState, req: SpendRequest): EconomyResult {
  return move(state, { ...req, day: state.day, kind: "purchase" });
}

/** System collection of a periodic due (rent, interest): no actor authority —
 *  the world itself collects. Pays only what exists; the CALLER tracks the
 *  outstanding remainder as standing debt. */
export function collectDue(
  state: EconomyState,
  req: { txnId: string; from: string; to: string; amount: bigint; memo: string; causeEventId: string },
): EconomyResult {
  return move(state, { ...req, day: state.day, kind: "bill", actorId: null });
}

/** Escrow part of an account's available balance (contract advance on offer). */
export function reserveFunds(
  state: EconomyState,
  req: { txnId: string; accountId: string; amount: bigint; memo: string; causeEventId: string },
): EconomyResult {
  if (!req.txnId) return reject(state, "BAD_ID", "a transaction needs a deterministic id");
  if (alreadyApplied(state, req.txnId)) return duplicateResult(state);
  if (!req.causeEventId) return reject(state, "NO_CAUSE", `transaction ${req.txnId} has no causeEventId`);
  if (req.amount <= 0n) return reject(state, "NON_POSITIVE", `amount must be positive, got ${req.amount}`);
  const account = state.accounts[req.accountId];
  if (!account) return reject(state, "NO_ACCOUNT", `unknown account ${req.accountId}`);
  if (account.available < req.amount) {
    return reject(state, "INSUFFICIENT", `${account.label} holds ${account.available}, cannot reserve ${req.amount}`);
  }
  const next = cloneState(state);
  next.accounts[req.accountId].available -= req.amount;
  next.accounts[req.accountId].reserved += req.amount;
  const txn: EconomyTransaction = {
    id: req.txnId, day: state.day, kind: "reserve",
    from: req.accountId, to: req.accountId, amount: req.amount, memo: req.memo, causeEventId: req.causeEventId,
  };
  next.ledger.push(txn);
  return { state: next, applied: [txn], duplicate: false };
}

/** Release escrow back to available (contract rejected/expired). */
export function releaseFunds(
  state: EconomyState,
  req: { txnId: string; accountId: string; amount: bigint; memo: string; causeEventId: string },
): EconomyResult {
  if (!req.txnId) return reject(state, "BAD_ID", "a transaction needs a deterministic id");
  if (alreadyApplied(state, req.txnId)) return duplicateResult(state);
  if (!req.causeEventId) return reject(state, "NO_CAUSE", `transaction ${req.txnId} has no causeEventId`);
  if (req.amount <= 0n) return reject(state, "NON_POSITIVE", `amount must be positive, got ${req.amount}`);
  const account = state.accounts[req.accountId];
  if (!account) return reject(state, "NO_ACCOUNT", `unknown account ${req.accountId}`);
  if (account.reserved < req.amount) {
    return reject(state, "INSUFFICIENT", `${account.label} escrows ${account.reserved}, cannot release ${req.amount}`);
  }
  const next = cloneState(state);
  next.accounts[req.accountId].reserved -= req.amount;
  next.accounts[req.accountId].available += req.amount;
  const txn: EconomyTransaction = {
    id: req.txnId, day: state.day, kind: "release",
    from: req.accountId, to: req.accountId, amount: req.amount, memo: req.memo, causeEventId: req.causeEventId,
  };
  next.ledger.push(txn);
  return { state: next, applied: [txn], duplicate: false };
}

/** Escrow → beneficiary. Contract settlement uses this; authority is the contract
 *  itself (already ratified), so no actor check. */
export function payoutReserved(
  state: EconomyState,
  req: { txnId: string; from: string; to: string; amount: bigint; memo: string; causeEventId: string },
): EconomyResult {
  if (!req.txnId) return reject(state, "BAD_ID", "a transaction needs a deterministic id");
  if (alreadyApplied(state, req.txnId)) return duplicateResult(state);
  if (!req.causeEventId) return reject(state, "NO_CAUSE", `transaction ${req.txnId} has no causeEventId`);
  if (req.amount <= 0n) return reject(state, "NON_POSITIVE", `amount must be positive, got ${req.amount}`);
  const from = state.accounts[req.from];
  const to = state.accounts[req.to];
  if (!from) return reject(state, "NO_ACCOUNT", `unknown source account ${req.from}`);
  if (!to) return reject(state, "NO_ACCOUNT", `unknown destination account ${req.to}`);
  if (from.reserved < req.amount) {
    return reject(state, "INSUFFICIENT", `${from.label} escrows ${from.reserved}, cannot pay out ${req.amount}`);
  }
  const next = cloneState(state);
  next.accounts[req.from].reserved -= req.amount;
  next.accounts[req.to].available += req.amount;
  const txn: EconomyTransaction = {
    id: req.txnId, day: state.day, kind: "contract-payout",
    from: req.from, to: req.to, amount: req.amount, memo: req.memo, causeEventId: req.causeEventId,
  };
  next.ledger.push(txn);
  return { state: next, applied: [txn], duplicate: false };
}

// ── daily settlement ──

export interface WageOrder {
  memberAccountId: string;
  amount: bigint;
}

export interface DaySettleOrder {
  day: number;
  causeEventId: string;
  /** wage schedule paid from the payer account, prorated on shortfall the same way
   *  settleDay prorates payroll (budget < sum → each gets amount·budget/sum). */
  wages?: { payerAccountId: string; orders: WageOrder[] };
  /** account that absorbs fixed costs (rent-collectors, rice shops, the street). */
  marketAccountId: string;
}

export interface AccountDayLedger {
  accountId: string;
  wage: bigint;
  fixedCostDue: bigint;
  fixedCostPaid: bigint;
  /** unpaid fixed cost — the world must turn this into hunger/pressure/loss. */
  shortfall: bigint;
}

export interface EconomyDaySettle {
  state: EconomyState;
  /** false when this day was already settled (idempotent re-run, state unchanged). */
  settled: boolean;
  perAccount: Record<string, AccountDayLedger>;
}

/**
 * Deterministic end-of-day settlement: wages out of the payer pot (prorated on
 * shortfall, mirroring settleDay's payroll rule), then every account pays its
 * dailyFixedCost to the market — pay what you can, shortfall is reported so the
 * world can apply objective consequences. Idempotent per day.
 */
export function settleEconomyDay(state: EconomyState, order: DaySettleOrder): EconomyDaySettle {
  if (state.settledDays.includes(order.day)) {
    return { state, settled: false, perAccount: {} };
  }
  if (!order.causeEventId) throw new Error(`economy: day ${order.day} settlement needs a causeEventId`);
  const market = state.accounts[order.marketAccountId];
  if (!market) throw new Error(`economy: unknown market account ${order.marketAccountId}`);

  let next = cloneState(state);
  const perAccount: Record<string, AccountDayLedger> = {};
  const entry = (id: string): AccountDayLedger => {
    perAccount[id] ??= { accountId: id, wage: 0n, fixedCostDue: 0n, fixedCostPaid: 0n, shortfall: 0n };
    return perAccount[id];
  };

  // 1. wages — prorate when the pot cannot cover the schedule (same rule as settleDay).
  if (order.wages) {
    const payer = next.accounts[order.wages.payerAccountId];
    if (!payer) throw new Error(`economy: unknown wage payer ${order.wages.payerAccountId}`);
    let sum = 0n;
    for (const w of order.wages.orders) sum += w.amount;
    const budget = bmin(payer.available, sum);
    for (const w of order.wages.orders) {
      const pay = sum === 0n ? 0n : budget < sum ? (w.amount * budget) / sum : w.amount;
      if (pay <= 0n) continue;
      const moved = move(next, {
        txnId: `day${order.day}:wage:${order.wages.payerAccountId}->${w.memberAccountId}`,
        day: order.day, kind: "wage",
        from: order.wages.payerAccountId, to: w.memberAccountId,
        amount: pay, memo: "daily wage", causeEventId: order.causeEventId, actorId: null,
      });
      if (moved.rejection) throw new Error(`economy: wage settlement failed: ${moved.rejection.message}`);
      next = moved.state;
      entry(w.memberAccountId).wage += pay;
    }
  }

  // 2. fixed costs — deterministic account order; pay what you can.
  for (const id of Object.keys(next.accounts).sort()) {
    const account = next.accounts[id];
    if (account.dailyFixedCost <= 0n || id === order.marketAccountId) continue;
    const due = account.dailyFixedCost;
    const pay = bmin(account.available, due);
    const ledger = entry(id);
    ledger.fixedCostDue = due;
    ledger.fixedCostPaid = pay;
    ledger.shortfall = due - pay;
    if (pay > 0n) {
      const moved = move(next, {
        txnId: `day${order.day}:fixed:${id}`,
        day: order.day, kind: "fixed-cost",
        from: id, to: order.marketAccountId,
        amount: pay, memo: "daily fixed cost", causeEventId: order.causeEventId, actorId: null,
      });
      if (moved.rejection) throw new Error(`economy: fixed-cost settlement failed: ${moved.rejection.message}`);
      next = moved.state;
    }
  }

  next.day = order.day + 1;
  next.settledDays = [...next.settledDays, order.day];
  return { state: next, settled: true, perAccount };
}

// ── invariants + projections ──

/** injected === Σ available + Σ reserved. Every transition preserves this. */
export function conservesProduction(state: EconomyState): boolean {
  let total = 0n;
  for (const a of Object.values(state.accounts)) {
    if (a.available < 0n || a.reserved < 0n) return false;
    total += a.available + a.reserved;
  }
  return state.injected === total;
}

/** Days an account survives its net daily burn — same division settleDay's runway
 *  uses (balance / net outflow), generalized to accounts. null = indefinitely. */
export function accountRunwayDays(account: EconomyAccount, dailyIncome = 0n): bigint | null {
  const burn = account.dailyFixedCost - dailyIncome;
  if (burn <= 0n) return null;
  return account.available / burn;
}

// ── JSON-safe persistence (bigint ↔ decimal string, same convention as
//    PersistedCharEcon / SagaEconState) ──

export interface PersistedEconomyAccount {
  id: string;
  ownerType: AccountOwnerType;
  label: string;
  available: string;
  reserved: string;
  dailyFixedCost: string;
  authorizedSpenderIds: string[];
}

export interface PersistedEconomyTransaction {
  id: string;
  day: number;
  kind: TransactionKind;
  from: string;
  to: string;
  amount: string;
  memo: string;
  causeEventId: string;
}

export interface PersistedEconomyState {
  day: number;
  accounts: Record<string, PersistedEconomyAccount>;
  ledger: PersistedEconomyTransaction[];
  injected: string;
  settledDays: number[];
}

export function persistEconomy(state: EconomyState): PersistedEconomyState {
  const accounts: Record<string, PersistedEconomyAccount> = {};
  for (const [id, a] of Object.entries(state.accounts)) {
    accounts[id] = {
      id: a.id, ownerType: a.ownerType, label: a.label,
      available: a.available.toString(), reserved: a.reserved.toString(),
      dailyFixedCost: a.dailyFixedCost.toString(),
      authorizedSpenderIds: [...a.authorizedSpenderIds],
    };
  }
  return {
    day: state.day,
    accounts,
    ledger: state.ledger.map((t) => ({ ...t, amount: t.amount.toString() })),
    injected: state.injected.toString(),
    settledDays: [...state.settledDays],
  };
}

export function restoreEconomy(persisted: PersistedEconomyState): EconomyState {
  const accounts: Record<string, EconomyAccount> = {};
  for (const [id, a] of Object.entries(persisted.accounts)) {
    accounts[id] = {
      id: a.id, ownerType: a.ownerType, label: a.label,
      available: BigInt(a.available), reserved: BigInt(a.reserved),
      dailyFixedCost: BigInt(a.dailyFixedCost),
      authorizedSpenderIds: [...a.authorizedSpenderIds],
    };
  }
  return {
    day: persisted.day,
    accounts,
    ledger: persisted.ledger.map((t) => ({ ...t, amount: BigInt(t.amount) })),
    injected: BigInt(persisted.injected),
    settledDays: [...persisted.settledDays],
  };
}
