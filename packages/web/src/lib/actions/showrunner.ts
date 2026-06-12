'use server';

/**
 * Server actions — Showrunner heartbeat + director memory reads
 * (NARRATIVE_AGENTS.md §12.2/§12.3). Consumed by the admin ShowrunnerPanel
 * and the headless /api/showrunner route.
 */

import { runShowrunner, type ShowrunnerOptions, type ShowrunnerResult } from '@/lib/director/showrunner';
import { readDirectorMemory, type DirectorMemory } from '@/lib/director/memory-store';

export async function runShowrunnerAction(
  input: ShowrunnerOptions = {},
): Promise<ShowrunnerResult> {
  return runShowrunner(input);
}

export async function getDirectorMemoryAction(): Promise<DirectorMemory> {
  return readDirectorMemory();
}
