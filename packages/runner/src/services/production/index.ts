/**
 * Production service — runs a whole 劇目 to premiere, then anchors the 戲折 on
 * chain. The creative engine is @endless-story/troupe (single source of truth);
 * the runner provides the LLM (via @endless-story/llm), the MemWal memory source
 * (injected by the web caller, which holds memory.ts), and the sign-and-anchor
 * rail. Mirrors event-chapter-compiler's runOnce shape.
 *
 * Trigger: the Showrunner decides to mount a production (a new `launch_production`
 * capability) and calls this. See docs/PRODUCTION_ENGINE.md §2 (trigger) + §6.
 *
 * **Anchor**: `commitment::commit(subject_id = sagaId)` with an embedded
 * `es:production` header (productionId + cast ids). A production aggregates
 * ACROSS scenes, so it anchors to the saga and the header carries the rest —
 * a namespace distinct from POV(subject=character) / cut(subject=scene).
 */

import type { Keypair } from '@mysten/sui/cryptography';
import {
  induct,
  chooseProduction,
  newProduction,
  runToPremiere,
  assembleXiZhe,
  type Ask,
  type MemorySource,
  type Production,
  type TroupeMember,
} from '@endless-story/troupe';
import { signAndAnchor } from '../../infra/sign-and-anchor.js';
import { makeProductionAsk } from './ask.js';
import { embedProductionHeader, type ProductionHeader } from './prompt.js';

export { embedProductionHeader, parseProductionHeader, type ProductionHeader } from './prompt.js';

export interface RunProductionInput {
  sagaId: string;
  /** the troupe cast (carry `chainId` per member to read real MemWal memories). */
  roster: TroupeMember[];
  /** repertoire key; omit + `auto` to let the 班主 choose. */
  classicKey?: string;
  skipScore?: boolean;
  /** autonomy: induct a social web + 班主 picks + characters self-judge 有感而發. */
  auto?: boolean;
  /** partId → character id pins (owner/班主 欽點 "X plays 許仙"); unpinned parts auto-cast. */
  castOverrides?: Record<string, string>;
  /** REAL accumulated memories/relationships; the web caller builds this from memory.ts. */
  source?: MemorySource;
  premiseHint?: string;
  /** inject an Ask (tests pass a mock); default = @endless-story/llm. */
  ask?: Ask;
  /** signer (StorytellerCap holder) for the chain anchor; omit ⇒ dry-run. */
  signer?: { keypair: Keypair; storytellerCapId: string };
  day?: number;
  dryRun?: boolean;
}

export interface RunProductionResult {
  production: Production;
  /** the assembled 戲折 markdown (anchored when a signer is given). */
  xizhe: string;
  anchored: boolean;
  commitmentId?: string;
  blobId?: string;
  blobUrl?: string;
  digest?: string;
  llm?: { calls: number; failures: number; ms: number; lastError?: string };
}

export async function runOnce(input: RunProductionInput): Promise<RunProductionResult> {
  const ask = input.ask ?? makeProductionAsk();

  // Induct when we have a real source or autonomy (derives skills + loads the
  // social web: MemWal real ＞ LLM-generated ＞ fixture); else use roster as-is.
  const troupe: TroupeMember[] =
    input.auto || input.source
      ? await induct(input.roster, input.premiseHint ?? '梨園戲班，角兒之間有舊情、暗慕與較勁', ask, input.source)
      : input.roster;

  // 班主 auto-picks the play when not told (the Director-triggered path), else honor classicKey.
  const classicKey = input.classicKey ?? (input.auto ? await chooseProduction(troupe, ask) : undefined);
  const prod = newProduction(input.sagaId, classicKey, {
    skipScore: input.skipScore,
    auto: input.auto,
    castOverrides: input.castOverrides,
  });
  await runToPremiere(prod, troupe, ask);

  const xizhe = assembleXiZhe(prod);
  const llm = ask.mock
    ? undefined
    : { calls: ask.calls, failures: ask.failures, ms: ask.ms, lastError: ask.lastError };

  if (input.dryRun || !input.signer) {
    return { production: prod, xizhe, anchored: false, llm };
  }

  const header: ProductionHeader = {
    v: 1,
    kind: 'production',
    productionId: prod.productionId,
    classicKey: prod.classicKey,
    classicSource: prod.brief?.classicSource,
    title: prod.brief?.title,
    castIds: (prod.cast ?? []).map((c) => c.assignedId).filter((x): x is string => !!x),
    day: input.day,
  };
  const anchor = await signAndAnchor({
    sagaId: input.sagaId,
    subjectId: input.sagaId,
    content: new TextEncoder().encode(embedProductionHeader(xizhe, header)),
    contentType: 'text/markdown',
    signer: input.signer.keypair,
  });

  return {
    production: prod,
    xizhe,
    anchored: true,
    commitmentId: anchor.commitmentId,
    blobId: anchor.blobId,
    blobUrl: anchor.blobUrl,
    digest: anchor.digest,
    llm,
  };
}
