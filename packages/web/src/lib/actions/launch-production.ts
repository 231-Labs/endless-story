'use server';

/**
 * Server action — the Director-triggered "排一齣新戲". Reads the live saga cast,
 * maps it to the troupe engine's TroupeMember shape, wires the REAL MemWal memory
 * source (so 有感而發 comes from what characters actually lived), and runs the
 * production to premiere + anchors the 戲折 on chain via the runner service.
 *
 * Mirrors compile-gazette.ts (admin keypair + runner.runOnce). The Showrunner
 * invokes this through the `launch_production` tool (gated; see tools.ts +
 * docs/PRODUCTION_ENGINE.md §2).
 */

import { ENDLESS_STORY_DEPLOYMENT } from '@endless-story/sdk';
import { production as runnerProduction } from '@endless-story/runner';
import { castingFromRole, type Gender, type MemorySource, type TroupeMember } from '@endless-story/troupe';
import { getAdminContext } from '@/lib/chain/admin-signer';
import { buildSagaRoster, type SagaRosterEntry } from '@/lib/chain/roster';
import { recallStructuredForCharacter } from '@/lib/chain/memory';
import { fetchOnChainEdgesFrom, toneLabel } from '@/lib/chain/relationships';

const RECALL_Q = '人物印象 關係 牽掛 競爭 舊事 心結 情份 提攜';

function rosterToTroupe(entries: SagaRosterEntry[]): TroupeMember[] {
  return entries.map((e): TroupeMember => {
    const { hangdang, yinggong } = castingFromRole(e.role);
    const actorGender: Gender = /female|女/i.test(e.gender) ? 'female' : 'male';
    return {
      id: e.id,
      chainId: e.id, // on-chain Character object id → the MemWal key
      name: e.name,
      hangdang,
      yinggong: [yinggong],
      actorGender,
      skills: [], // induct derives from 行當
      memories: [], // filled by the MemWal source below
      relationships: [],
      voice: e.brief ? e.brief.slice(0, 40) : undefined,
    };
  });
}

export interface LaunchProductionActionInput {
  /** repertoire key/別名; omit → 班主自選. */
  classicKey?: string;
  skipScore?: boolean;
  dryRun?: boolean;
}

export interface LaunchProductionActionResult {
  ok: boolean;
  title?: string;
  classicKey?: string;
  cast?: Array<{ part: string; actor: string; crossCast?: string }>;
  scenes?: number;
  emergent?: Array<{ author: string; why?: string }>;
  anchored: boolean;
  commitmentId?: string;
  blobId?: string;
  digest?: string;
  llm?: { calls: number; failures: number; ms: number };
  error?: string;
}

export async function launchProductionAction(
  input: LaunchProductionActionInput,
): Promise<LaunchProductionActionResult> {
  const d = ENDLESS_STORY_DEPLOYMENT;
  if (!d.sagaId || !d.storytellerCapId) {
    return { ok: false, anchored: false, error: 'saga 尚未種子化' };
  }

  let admin;
  try {
    admin = getAdminContext();
  } catch (err) {
    return { ok: false, anchored: false, error: err instanceof Error ? err.message : 'admin keypair 載入失敗' };
  }

  const entries = await buildSagaRoster(d.sagaId).catch(() => [] as SagaRosterEntry[]);
  if (entries.length < 3) {
    return { ok: false, anchored: false, error: `班底不足（${entries.length} 角），排不了戲` };
  }
  const roster = rosterToTroupe(entries);
  const byChain = new Map(roster.filter((m) => m.chainId).map((m) => [m.chainId!, m.id]));

  // REAL memory source: a character's accumulated MemWal memories + on-chain
  // relationship edges. Graceful — empty ⇒ induct falls back to LLM generation.
  const source: MemorySource = async (member) => {
    if (!member.chainId) return null;
    const [recalled, edges] = await Promise.all([
      recallStructuredForCharacter(member.chainId, RECALL_Q, 8).catch(() => []),
      fetchOnChainEdgesFrom(member.chainId).catch(() => []),
    ]);
    const memories = recalled.map((r, i) => ({ id: `mw_${member.id}_${i}`, text: r.text }));
    const relationships = edges.map((e) => ({
      withId: byChain.get(e.toId) ?? e.toId,
      kind: e.tone ? toneLabel(e.tone) : e.label || '相識',
      intensity: Math.max(0, Math.min(100, Math.round((e.weight ?? 0) * 10))),
      note: e.summary || e.label,
    }));
    if (memories.length === 0 && relationships.length === 0) return null;
    return { memories, relationships };
  };

  try {
    const res = await runnerProduction.runOnce({
      sagaId: d.sagaId,
      roster,
      classicKey: input.classicKey,
      skipScore: input.skipScore,
      auto: true, // induct (skills + social web) + 班主自選 + 角色自判有感而發
      source,
      signer: input.dryRun ? undefined : { keypair: admin.signer, storytellerCapId: d.storytellerCapId },
      dryRun: input.dryRun,
    });
    const prod = res.production;
    return {
      ok: res.anchored || input.dryRun === true,
      title: prod.brief?.title,
      classicKey: prod.classicKey,
      cast: (prod.cast ?? []).map((c) => ({
        part: c.partName,
        actor: c.assignedName ?? '（缺角）',
        crossCast: c.crossCastLabel ?? undefined,
      })),
      scenes: prod.script?.scenes.length,
      emergent: (prod.ci ?? [])
        .filter((c) => c.source === 'emergent')
        .map((c) => ({ author: c.authorName, why: c.provenance?.why })),
      anchored: res.anchored,
      commitmentId: res.commitmentId,
      blobId: res.blobId,
      digest: res.digest,
      llm: res.llm ? { calls: res.llm.calls, failures: res.llm.failures, ms: res.llm.ms } : undefined,
    };
  } catch (err) {
    return { ok: false, anchored: false, error: err instanceof Error ? err.message : String(err) };
  }
}
