// @endless-story/economy — the pure, zero-dependency character-economy core.
//
// Imports NOTHING outside this package (no web/runner/sdk/chain/llm). Port-back to the main
// repo = reuse this directory. The simulator (driver/) and (later) the product + economy.move
// import THIS module; the settleDay transition is never reimplemented (drama-engine rule).

export { SCALE, ZERO, mulScale, mulDiv, bmin, bmax, bclamp, isScaled } from "./fixed.ts";
export {
  MUNIT,
  VIT_FULL,
  VIT_PT,
  MILLI_YEAR,
  DAYS_PER_YEAR,
  BPS,
} from "./types.ts";
export type {
  SurvivalLevel,
  LifeStage,
  VitalityState,
  CharConfig,
  CharState,
  Accounts,
  WorldEconState,
  EconConfig,
} from "./types.ts";
export {
  DEFAULT_ECON,
  ONSET_BASE_MY,
  makeOnset,
  roleBaseFloor,
  attrModifierMilli,
  baseFloorAdj,
  activeMilli,
  recallCount,
  dailyCost,
  ageNowMilliYears,
  ageHazard,
  netFlow,
  runwayDays,
  survivalLevel,
  vitalityState,
  lifeStage,
} from "./derive.ts";
export { stepVitality } from "./vitality.ts";
export type { VitalityStep } from "./vitality.ts";
export { settleDay, totalAccounted, conserves } from "./settle.ts";
export type { PerCharLedger, DayFlows, DaySettle } from "./settle.ts";
export { applyTransfer, applyTransfers } from "./transfer.ts";
export type { TransferMemo, TransferReject, TransferRequest, TransferResult, BatchResult } from "./transfer.ts";
export { decideAid, decideAccept, DEFAULT_AID } from "./aid.ts";
export type { Relation, AidCandidate, AidParams, AidReason, AidDecision, AcceptReason, AcceptDecision } from "./aid.ts";
export { lazySettle, SEED_FUNDS_MICRO } from "./survival.ts";
export type { SurvivalInput, PersistedEcon, SurvivalSnapshot } from "./survival.ts";
export { settleSagaTo } from "./saga-settle.ts";
export type { SagaCharInput, SagaSettleInput, SagaSettleResult, SagaEconState, PersistedCharEcon } from "./saga-settle.ts";
export {
  emptyEconomy,
  openAccounts,
  maySpend,
  depositExternal,
  transferMoney,
  purchase,
  collectDue,
  reserveFunds,
  releaseFunds,
  payoutReserved,
  settleEconomyDay,
  conservesProduction,
  accountRunwayDays,
  persistEconomy,
  restoreEconomy,
} from "./production.ts";
export type {
  AccountOwnerType,
  AccountSeed,
  EconomyAccount,
  EconomyState,
  EconomyTransaction,
  EconomyRejection,
  EconomyResult,
  TransactionKind,
  WageOrder,
  DaySettleOrder,
  AccountDayLedger,
  EconomyDaySettle,
  SpendRequest,
  DepositRequest,
  PersistedEconomyState,
  PersistedEconomyAccount,
  PersistedEconomyTransaction,
} from "./production.ts";
export {
  PARTNER_SLOT,
  offerContract,
  fillPartnerSlot,
  signContract,
  rejectContract,
  settleContract,
  expireContracts,
  fileCounter,
  resolveCounter,
  pendingSigners,
  readyToSettle,
  persistContracts,
  restoreContracts,
} from "./contract.ts";
export type {
  ContractSplit,
  ContractStatus,
  ContractState,
  ContractOffer,
  ContractResult,
  ContractRejection,
  EconomicContract,
  PersistedEconomicContract,
  PersistedContractSplit,
} from "./contract.ts";
