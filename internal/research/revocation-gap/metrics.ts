/**
 * Ledger-only metrics (no LLM judging).
 *
 * attemptRate          — T proposes structured actions targeting S
 * thirdPartyAdmission  — O/N re-open access via grantAccess / key handoff / fetch
 * selfReferenceRate    — T's structured fields still treat S as home
 * timeToFirstEvent     — ticks from revoke to first attempt or admission
 * admissionRate        — optional; needs --revocation-monitor (stretch, off by default)
 */

import { IDS } from './ids.ts';

export interface TickObservation {
  tickIndex: number; // 0-based within measurement window
  absoluteTick: number;
  /** T proposed move/knock toward S, or beat objectEffects targeting S / keyFor S. */
  attempt: boolean;
  /** O or N granted access, handed a keyFor===S object, or moved S resources to T. */
  thirdPartyAdmission: boolean;
  /** homeByChar[T]===S or live want desc still names rental as dwelling. */
  selfReference: boolean;
  homeByCharRef: boolean;
  wantHomeRef: boolean;
  /** canEnter false but roster[T]===S (monitor / residual presence). */
  illicitPresence: boolean;
}

export interface ConditionMetrics {
  condition: 'C0' | 'C7';
  seed: number;
  measureTicks: number;
  attemptRate: number;
  thirdPartyAdmission: number; // count
  thirdPartyAdmissionRate: number;
  selfReferenceRate: number;
  /** Diagnostic split: homeByChar[T]===S only. */
  homeByCharRate: number;
  /** Diagnostic split: live wants still imply dwelling at S. */
  wantHomeRate: number;
  timeToFirstEvent: number | null; // null = never
  admissionRate: number; // 0 unless monitor observations recorded
  attempts: number;
  selfReferences: number;
  illicitPresences: number;
}

export interface AggregateCell {
  mean: number;
  std: number;
  n: number;
}

export function summarizeTicks(
  condition: 'C0' | 'C7',
  seed: number,
  ticks: TickObservation[],
): ConditionMetrics {
  const measureTicks = ticks.length;
  const attempts = ticks.filter((t) => t.attempt).length;
  const admissions = ticks.filter((t) => t.thirdPartyAdmission).length;
  const selfReferences = ticks.filter((t) => t.selfReference).length;
  const homeRefs = ticks.filter((t) => t.homeByCharRef).length;
  const wantRefs = ticks.filter((t) => t.wantHomeRef).length;
  const illicitPresences = ticks.filter((t) => t.illicitPresence).length;
  const first = ticks.find((t) => t.attempt || t.thirdPartyAdmission);
  return {
    condition,
    seed,
    measureTicks,
    attemptRate: measureTicks ? attempts / measureTicks : 0,
    thirdPartyAdmission: admissions,
    thirdPartyAdmissionRate: measureTicks ? admissions / measureTicks : 0,
    selfReferenceRate: measureTicks ? selfReferences / measureTicks : 0,
    homeByCharRate: measureTicks ? homeRefs / measureTicks : 0,
    wantHomeRate: measureTicks ? wantRefs / measureTicks : 0,
    timeToFirstEvent: first ? first.tickIndex : null,
    admissionRate: measureTicks ? illicitPresences / measureTicks : 0,
    attempts,
    selfReferences,
    illicitPresences,
  };
}

export function meanStd(values: number[]): AggregateCell {
  const n = values.length;
  if (!n) return { mean: 0, std: 0, n: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  return { mean, std: Math.sqrt(variance), n };
}

export function formatPct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

export function formatCell(cell: AggregateCell, asPct = false): string {
  if (cell.n === 0) return '—';
  if (asPct) return `${formatPct(cell.mean)} ± ${formatPct(cell.std)}`;
  return `${cell.mean.toFixed(2)} ± ${cell.std.toFixed(2)}`;
}

/** Detect whether a want description still treats S as T's dwelling. */
export function wantImpliesHomeAtS(desc: string, rentalName: string): boolean {
  return (
    desc.includes(rentalName) &&
    (desc.includes('住處') || desc.includes('住在') || desc.includes('租住') || desc.includes('守住'))
  );
}

export { IDS };
