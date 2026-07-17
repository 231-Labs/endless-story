// contract.ts — structured economic contracts over production.ts accounts.
//
// A contract is not flavour text: its advance is real escrowed money on the proposer's
// account, its splits name every beneficiary in minimum units, and its terminal states
// move different money into different worlds:
//   signed   → escrow pays out to each named beneficiary atomically
//   rejected → escrow releases back to the proposer, zero transfers
//   expired  → same release, but caused by the deadline, not a choice
//
// Signing order is world-authored (LLMs only propose sign/reject/fill commands; the
// caller validates them against this state machine). The special beneficiary
// PARTNER_SLOT resolves to whoever the lead names as 聯名搭檔 — an unfilled required
// slot blocks signing, so "搭檔未定" can never reach settlement silently again (v14).

import {
  payoutReserved,
  releaseFunds,
  reserveFunds,
  type EconomyRejection,
  type EconomyState,
  type EconomyTransaction,
} from "./production.ts";

/** Split beneficiary placeholder resolved by the partner slot at settlement. */
export const PARTNER_SLOT = "@partner";

export interface ContractSplit {
  /** account id, or PARTNER_SLOT for the yet-unnamed co-signer. */
  beneficiary: string;
  amount: bigint;
  memo: string;
}

export type ContractStatus = "offered" | "signed" | "rejected" | "expired" | "settled";

export interface EconomicContract {
  id: string;
  label: string;
  /** business account funding the advance; total is escrowed there while offered. */
  proposerAccountId: string;
  total: bigint;
  splits: ContractSplit[];
  /** every id here must sign before the contract can settle. */
  requiredSignerIds: string[];
  /** the 聯名搭檔 slot: when required, settlement is blocked until filled + signed. */
  partnerSlot: { required: boolean; filledBy?: string };
  /** ids that have signed so far. */
  signedBy: string[];
  status: ContractStatus;
  /** last day (inclusive) a signature can complete the contract. */
  deadlineDay: number;
  /** the written terms of the offer; accepted counter-demands append here. */
  terms: string[];
  /** an unanswered counter-demand from a party — one at a time; the proposer
   *  answers through resolveCounter (an authored policy today, a real
   *  counterparty agent from another saga later). */
  pendingCounter?: { byId: string; demand: string; day: number };
  causeEventId: string;
  /** terminal settlement event, set exactly once. */
  outcomeEventId?: string;
}

export interface ContractState {
  economy: EconomyState;
  contracts: Record<string, EconomicContract>;
}

export interface ContractRejection {
  code:
    | EconomyRejection["code"]
    | "NO_CONTRACT"
    | "NOT_OFFERED"
    | "NOT_SIGNER"
    | "ALREADY_SIGNED"
    | "PARTNER_TAKEN"
    | "PARTNER_NOT_REQUIRED"
    | "SPLIT_MISMATCH"
    | "NOT_COMPLETE"
    | "PAST_DEADLINE"
    | "COUNTER_PENDING"
    | "NO_COUNTER"
    | "EMPTY_DEMAND";
  message: string;
}

export interface ContractResult {
  state: ContractState;
  applied: EconomyTransaction[];
  duplicate: boolean;
  rejection?: ContractRejection;
}

function fail(state: ContractState, code: ContractRejection["code"], message: string): ContractResult {
  return { state, applied: [], duplicate: false, rejection: { code, message } };
}

function cloneContracts(contracts: Record<string, EconomicContract>): Record<string, EconomicContract> {
  const next: Record<string, EconomicContract> = {};
  for (const [id, c] of Object.entries(contracts)) {
    next[id] = {
      ...c,
      splits: c.splits.map((s) => ({ ...s })),
      requiredSignerIds: [...c.requiredSignerIds],
      partnerSlot: { ...c.partnerSlot },
      signedBy: [...c.signedBy],
      terms: [...c.terms],
      pendingCounter: c.pendingCounter ? { ...c.pendingCounter } : undefined,
    };
  }
  return next;
}

export interface ContractOffer {
  id: string;
  label: string;
  proposerAccountId: string;
  total: bigint;
  splits: ContractSplit[];
  requiredSignerIds: string[];
  partnerRequired: boolean;
  deadlineDay: number;
  /** the written conditions of the offer as proposed. */
  terms?: string[];
  causeEventId: string;
}

/** Offer a contract: validates splits sum to total, then escrows the advance. */
export function offerContract(state: ContractState, offer: ContractOffer): ContractResult {
  if (state.contracts[offer.id]) return { state, applied: [], duplicate: true };
  let splitSum = 0n;
  for (const s of offer.splits) splitSum += s.amount;
  if (splitSum !== offer.total) {
    return fail(state, "SPLIT_MISMATCH", `${offer.label}: splits sum to ${splitSum}, total is ${offer.total}`);
  }
  if (offer.splits.some((s) => s.beneficiary === PARTNER_SLOT) && !offer.partnerRequired) {
    return fail(state, "PARTNER_NOT_REQUIRED", `${offer.label} pays ${PARTNER_SLOT} but requires no partner`);
  }
  const escrow = reserveFunds(state.economy, {
    txnId: `contract:${offer.id}:escrow`,
    accountId: offer.proposerAccountId,
    amount: offer.total,
    memo: `escrow advance for ${offer.label}`,
    causeEventId: offer.causeEventId,
  });
  if (escrow.rejection) return fail(state, escrow.rejection.code, escrow.rejection.message);
  const contracts = cloneContracts(state.contracts);
  contracts[offer.id] = {
    id: offer.id,
    label: offer.label,
    proposerAccountId: offer.proposerAccountId,
    total: offer.total,
    splits: offer.splits.map((s) => ({ ...s })),
    requiredSignerIds: [...offer.requiredSignerIds],
    partnerSlot: { required: offer.partnerRequired },
    signedBy: [],
    status: "offered",
    deadlineDay: offer.deadlineDay,
    terms: [...(offer.terms ?? [])],
    causeEventId: offer.causeEventId,
  };
  return { state: { economy: escrow.state, contracts }, applied: escrow.applied, duplicate: false };
}

/**
 * A party pushes the terms back instead of signing or walking: one pending
 * demand at a time, answered by resolveCounter. Filing a counter never moves
 * money — it is a claim on the CONDITIONS.
 */
export function fileCounter(
  state: ContractState,
  req: { contractId: string; actorId: string; demand: string; day: number; causeEventId: string },
): ContractResult {
  const contract = state.contracts[req.contractId];
  if (!contract) return fail(state, "NO_CONTRACT", `unknown contract ${req.contractId}`);
  if (contract.status !== "offered") return fail(state, "NOT_OFFERED", `${contract.label} is ${contract.status}`);
  const parties = new Set([
    ...contract.requiredSignerIds,
    ...(contract.partnerSlot.filledBy ? [contract.partnerSlot.filledBy] : []),
  ]);
  if (!parties.has(req.actorId)) return fail(state, "NOT_SIGNER", `${req.actorId} is not a party to ${contract.label}`);
  if (!req.demand.trim()) return fail(state, "EMPTY_DEMAND", "a counter-offer needs a written demand");
  if (contract.pendingCounter) {
    return fail(state, "COUNTER_PENDING", `${contract.label} already has an unanswered demand: ${contract.pendingCounter.demand}`);
  }
  const contracts = cloneContracts(state.contracts);
  contracts[req.contractId].pendingCounter = { byId: req.actorId, demand: req.demand.trim(), day: req.day };
  return { state: { economy: state.economy, contracts }, applied: [], duplicate: false };
}

/**
 * The proposer answers a pending counter. Today an authored policy decides;
 * the seam is where a real counterparty agent (another saga's stakeholder)
 * plugs in later. Accepting writes the demand into the terms and may grant
 * grace days to sign the amended paper; refusing leaves the offer as it was.
 */
export function resolveCounter(
  state: ContractState,
  req: { contractId: string; accept: boolean; day: number; graceDays?: number; causeEventId: string },
): ContractResult {
  const contract = state.contracts[req.contractId];
  if (!contract) return fail(state, "NO_CONTRACT", `unknown contract ${req.contractId}`);
  if (!contract.pendingCounter) return fail(state, "NO_COUNTER", `${contract.label} has no pending demand`);
  const contracts = cloneContracts(state.contracts);
  const next = contracts[req.contractId];
  if (req.accept) {
    next.terms = [...next.terms, next.pendingCounter!.demand];
    next.deadlineDay = Math.max(next.deadlineDay, req.day + (req.graceDays ?? 0));
  }
  next.pendingCounter = undefined;
  return { state: { economy: state.economy, contracts }, applied: [], duplicate: false };
}

/** Name the 聯名搭檔. Only a required signer may fill it; refilling is rejected. */
export function fillPartnerSlot(
  state: ContractState,
  req: { contractId: string; actorId: string; partnerId: string; causeEventId: string },
): ContractResult {
  const contract = state.contracts[req.contractId];
  if (!contract) return fail(state, "NO_CONTRACT", `unknown contract ${req.contractId}`);
  if (contract.status !== "offered") return fail(state, "NOT_OFFERED", `${contract.label} is ${contract.status}`);
  if (!contract.partnerSlot.required) return fail(state, "PARTNER_NOT_REQUIRED", `${contract.label} has no partner slot`);
  if (!contract.requiredSignerIds.includes(req.actorId)) {
    return fail(state, "NOT_SIGNER", `${req.actorId} cannot name the partner on ${contract.label}`);
  }
  if (contract.partnerSlot.filledBy) {
    return fail(state, "PARTNER_TAKEN", `${contract.label} partner is already ${contract.partnerSlot.filledBy}`);
  }
  const contracts = cloneContracts(state.contracts);
  contracts[req.contractId].partnerSlot.filledBy = req.partnerId;
  return { state: { economy: state.economy, contracts }, applied: [], duplicate: false };
}

/** All signatures needed: required signers plus the filled partner. */
export function pendingSigners(contract: EconomicContract): string[] {
  const needed = [...contract.requiredSignerIds];
  if (contract.partnerSlot.required && contract.partnerSlot.filledBy) needed.push(contract.partnerSlot.filledBy);
  return [...new Set(needed)].filter((id) => !contract.signedBy.includes(id));
}

/** True when every required signature exists and the partner slot is satisfied. */
export function readyToSettle(contract: EconomicContract): boolean {
  if (contract.status !== "offered") return false;
  if (contract.partnerSlot.required && !contract.partnerSlot.filledBy) return false;
  return pendingSigners(contract).length === 0;
}

export function signContract(
  state: ContractState,
  req: { contractId: string; signerId: string; causeEventId: string },
): ContractResult {
  const contract = state.contracts[req.contractId];
  if (!contract) return fail(state, "NO_CONTRACT", `unknown contract ${req.contractId}`);
  if (contract.status !== "offered") return fail(state, "NOT_OFFERED", `${contract.label} is ${contract.status}`);
  const mustSign = new Set([
    ...contract.requiredSignerIds,
    ...(contract.partnerSlot.filledBy ? [contract.partnerSlot.filledBy] : []),
  ]);
  if (!mustSign.has(req.signerId)) return fail(state, "NOT_SIGNER", `${req.signerId} is not a party to ${contract.label}`);
  if (contract.signedBy.includes(req.signerId)) {
    return fail(state, "ALREADY_SIGNED", `${req.signerId} already signed ${contract.label}`);
  }
  const contracts = cloneContracts(state.contracts);
  contracts[req.contractId].signedBy = [...contract.signedBy, req.signerId];
  return { state: { economy: state.economy, contracts }, applied: [], duplicate: false };
}

/** Any required party (or the named partner) can kill the offer outright. */
export function rejectContract(
  state: ContractState,
  req: { contractId: string; actorId: string; causeEventId: string },
): ContractResult {
  const contract = state.contracts[req.contractId];
  if (!contract) return fail(state, "NO_CONTRACT", `unknown contract ${req.contractId}`);
  if (contract.status !== "offered") return fail(state, "NOT_OFFERED", `${contract.label} is ${contract.status}`);
  const parties = new Set([
    ...contract.requiredSignerIds,
    ...(contract.partnerSlot.filledBy ? [contract.partnerSlot.filledBy] : []),
  ]);
  if (!parties.has(req.actorId)) return fail(state, "NOT_SIGNER", `${req.actorId} is not a party to ${contract.label}`);
  const release = releaseFunds(state.economy, {
    txnId: `contract:${contract.id}:release`,
    accountId: contract.proposerAccountId,
    amount: contract.total,
    memo: `advance returns: ${contract.label} rejected`,
    causeEventId: req.causeEventId,
  });
  if (release.rejection) return fail(state, release.rejection.code, release.rejection.message);
  const contracts = cloneContracts(state.contracts);
  contracts[req.contractId].status = "rejected";
  contracts[req.contractId].outcomeEventId = req.causeEventId;
  return { state: { economy: release.state, contracts }, applied: release.applied, duplicate: false };
}

/**
 * Settle a fully-signed contract: pay every split out of escrow atomically.
 * Idempotent — a settled contract returns duplicate. PARTNER_SLOT resolves to the
 * filled partner's account.
 */
export function settleContract(
  state: ContractState,
  req: { contractId: string; causeEventId: string },
): ContractResult {
  const contract = state.contracts[req.contractId];
  if (!contract) return fail(state, "NO_CONTRACT", `unknown contract ${req.contractId}`);
  if (contract.status === "settled") return { state, applied: [], duplicate: true };
  if (!readyToSettle(contract)) {
    return fail(state, "NOT_COMPLETE", `${contract.label} lacks signatures (${pendingSigners(contract).join(", ") || "partner slot"})`);
  }
  let economy = state.economy;
  const applied: EconomyTransaction[] = [];
  for (let i = 0; i < contract.splits.length; i++) {
    const split = contract.splits[i];
    const beneficiary = split.beneficiary === PARTNER_SLOT ? contract.partnerSlot.filledBy! : split.beneficiary;
    const paid = payoutReserved(economy, {
      txnId: `contract:${contract.id}:payout:${i}`,
      from: contract.proposerAccountId,
      to: beneficiary,
      amount: split.amount,
      memo: `${contract.label} — ${split.memo}`,
      causeEventId: req.causeEventId,
    });
    // Splits were validated against total at offer time and escrow cannot be spent
    // elsewhere, so a failure here is a programming error, not a world outcome.
    if (paid.rejection) throw new Error(`contract ${contract.id} split ${i} failed: ${paid.rejection.message}`);
    economy = paid.state;
    applied.push(...paid.applied);
  }
  const contracts = cloneContracts(state.contracts);
  contracts[req.contractId].status = "settled";
  contracts[req.contractId].outcomeEventId = req.causeEventId;
  return { state: { economy, contracts }, applied, duplicate: false };
}

/**
 * Deterministic deadline resolver: past the deadline, an unsigned offer expires and
 * its escrow releases. A fully-signed offer settles instead — signatures beat the
 * clock when both land on the deadline day.
 */
export function expireContracts(
  state: ContractState,
  req: { day: number; causeEventId: string },
): ContractResult {
  let current = state;
  const applied: EconomyTransaction[] = [];
  for (const id of Object.keys(state.contracts).sort()) {
    const contract = current.contracts[id];
    if (contract.status !== "offered" || contract.deadlineDay >= req.day) continue;
    if (readyToSettle(contract)) {
      const settled = settleContract(current, { contractId: id, causeEventId: req.causeEventId });
      if (settled.rejection) throw new Error(`contract ${id} deadline settle failed: ${settled.rejection.message}`);
      current = settled.state;
      applied.push(...settled.applied);
      continue;
    }
    const release = releaseFunds(current.economy, {
      txnId: `contract:${id}:expire`,
      accountId: contract.proposerAccountId,
      amount: contract.total,
      memo: `advance returns: ${contract.label} expired unsigned`,
      causeEventId: req.causeEventId,
    });
    if (release.rejection) throw new Error(`contract ${id} expiry release failed: ${release.rejection.message}`);
    const contracts = cloneContracts(current.contracts);
    contracts[id].status = "expired";
    contracts[id].outcomeEventId = req.causeEventId;
    current = { economy: release.state, contracts };
    applied.push(...release.applied);
  }
  return { state: current, applied, duplicate: false };
}

// ── JSON-safe persistence ──

export interface PersistedContractSplit {
  beneficiary: string;
  amount: string;
  memo: string;
}

export interface PersistedEconomicContract {
  id: string;
  label: string;
  proposerAccountId: string;
  total: string;
  splits: PersistedContractSplit[];
  requiredSignerIds: string[];
  partnerSlot: { required: boolean; filledBy?: string };
  signedBy: string[];
  status: ContractStatus;
  deadlineDay: number;
  terms: string[];
  pendingCounter?: { byId: string; demand: string; day: number };
  causeEventId: string;
  outcomeEventId?: string;
}

export function persistContracts(contracts: Record<string, EconomicContract>): Record<string, PersistedEconomicContract> {
  const out: Record<string, PersistedEconomicContract> = {};
  for (const [id, c] of Object.entries(contracts)) {
    const row: PersistedEconomicContract = {
      id: c.id,
      label: c.label,
      proposerAccountId: c.proposerAccountId,
      total: c.total.toString(),
      splits: c.splits.map((s) => ({ ...s, amount: s.amount.toString() })),
      requiredSignerIds: [...c.requiredSignerIds],
      partnerSlot: { ...c.partnerSlot },
      signedBy: [...c.signedBy],
      status: c.status,
      deadlineDay: c.deadlineDay,
      terms: [...c.terms],
      causeEventId: c.causeEventId,
    };
    if (c.outcomeEventId) row.outcomeEventId = c.outcomeEventId;
    if (c.pendingCounter) row.pendingCounter = { ...c.pendingCounter };
    out[id] = row;
  }
  return out;
}

export function restoreContracts(persisted: Record<string, PersistedEconomicContract>): Record<string, EconomicContract> {
  const out: Record<string, EconomicContract> = {};
  for (const [id, c] of Object.entries(persisted)) {
    out[id] = {
      ...c,
      total: BigInt(c.total),
      splits: c.splits.map((s) => ({ ...s, amount: BigInt(s.amount) })),
      requiredSignerIds: [...c.requiredSignerIds],
      partnerSlot: { ...c.partnerSlot },
      signedBy: [...c.signedBy],
      terms: [...(c.terms ?? [])],
      pendingCounter: c.pendingCounter ? { ...c.pendingCounter } : undefined,
    };
  }
  return out;
}
