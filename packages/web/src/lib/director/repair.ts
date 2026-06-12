/**
 * Mechanical auto-repair — the no-LLM half of「漏了什麼就補」(§12.2 ACT).
 *
 * Takes an audit report, fixes the issues that have a mechanical fix
 * (character gaps → reconcile), capped per run so a heartbeat can't burn
 * unbounded image/LLM budget. Anything non-mechanical stays in the report
 * for the EVALUATE step to reason about.
 */

import { reconcileCharacterAction, type ReconcileResult } from '@/lib/actions/reconcile-character';
import type { WorldAuditReport } from './audit';

export interface AutoRepairResult {
  attempted: number;
  /** characterIds whose gaps exceeded this run's cap (left for next heartbeat). */
  deferred: string[];
  results: ReconcileResult[];
}

/** Repair flagged character gaps, sequentially (admin lock), capped. */
export async function runAutoRepair(
  report: WorldAuditReport,
  opts: { maxRepairs?: number } = {},
): Promise<AutoRepairResult> {
  const cap = opts.maxRepairs ?? 3;
  const targets = report.issues
    .filter((i) => i.code === 'character_gap' && i.characterId)
    .map((i) => i.characterId as string);

  const now = targets.slice(0, cap);
  const deferred = targets.slice(cap);
  const results: ReconcileResult[] = [];
  for (const characterId of now) {
    results.push(await reconcileCharacterAction(characterId));
  }
  return { attempted: now.length, deferred, results };
}
