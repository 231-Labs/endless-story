'use server';

/**
 * Server actions — deterministic world audit + mechanical auto-repair
 * (NARRATIVE_AGENTS.md §12.1/§12.2 Phase 1). Standalone entry so the admin UI
 * and headless runners can sweep-and-fill without invoking the full
 * Showrunner heartbeat.
 */

import { runWorldAudit, type WorldAuditReport } from '@/lib/director/audit';
import { runAutoRepair, type AutoRepairResult } from '@/lib/director/repair';

export async function runWorldAuditAction(): Promise<WorldAuditReport> {
  return runWorldAudit();
}

export interface AuditAndRepairResult {
  report: WorldAuditReport;
  repair?: AutoRepairResult;
}

/** Audit, then mechanically fix flagged character gaps (capped). */
export async function runAuditAndRepairAction(
  input: { maxRepairs?: number; repair?: boolean } = {},
): Promise<AuditAndRepairResult> {
  const report = await runWorldAudit();
  if (!report.ok || input.repair === false) return { report };
  const repair = await runAutoRepair(report, { maxRepairs: input.maxRepairs });
  return { report, repair };
}
