// TEMP devnet-seed trigger — replicates the admin FoundingCastPanel flow exactly
// (loadFoundingPresetAction → same spec map → createFoundingCastAction, which
// generates portraits, mints, and runs the batch induction that writes self
// memories into MemWal + seeds ties). Server-signed by SUI_ADMIN_PRIVATE_KEY
// (= throwaway holding the devnet caps). DELETE after the devnet wiring test.
import { NextResponse } from 'next/server';
import {
  loadFoundingPresetAction,
  createFoundingCastAction,
} from '@/lib/actions/create-founding-cast';
import { ENDLESS_STORY_DEPLOYMENT } from '@endless-story/sdk';
import { charactersApi, relationshipsApi } from '@/lib/api/index';
import { loadWants } from '@/lib/chain/want-store';
import { mergeFeltEdges, projectWantEdges } from '@/lib/chain/relationship-felt';

export const dynamic = 'force-dynamic';
export const maxDuration = 800;

// Roster + portrait status + relationship graph for the devnet saga (authoritative).
// ?memories=<characterId> → server-side delegate decrypt of that character's
// memories (SEAL key servers don't serve devnet, so the browser owner-read
// can't work on test worlds; this is the dev-only window into MemWal truth).
export async function GET(req: Request) {
  const memoriesFor = new URL(req.url).searchParams.get('memories');
  if (memoriesFor) {
    const { recallForCharacter } = await import('@/lib/chain/memory');
    const memories = await recallForCharacter(memoriesFor, '這一生記得的事', 24).catch(() => []);
    return NextResponse.json({ characterId: memoriesFor, count: memories.length, memories });
  }
  return listRoster();
}

async function listRoster() {
  const sagaId = ENDLESS_STORY_DEPLOYMENT.sagaId;
  const cast = await charactersApi.listSagaCharacters(sagaId);
  const nameById = new Map(cast.map((c) => [c.id, c.name]));
  const idByName = new Map(cast.map((c) => [c.name, c.id]));
  const knownIds = new Set(cast.map((c) => c.id));
  const edgeArrays = await Promise.all(cast.map((c) => relationshipsApi.listOutgoingEdges(c.id)));
  // Same merged view the saga/dossier pages render: lived seeds + felt projections.
  const felt = projectWantEdges(loadWants(sagaId), {
    resolveTargetId: (t) => (knownIds.has(t) ? t : idByName.get(t)),
  });
  const edges = mergeFeltEdges(edgeArrays.flat(), felt).map((e) => ({
    from: nameById.get(e.fromId) ?? e.fromId.slice(0, 8),
    to: nameById.get(e.toId) ?? e.toId.slice(0, 8),
    tone: e.tone,
    weight: e.weight,
    origin: e.origin ?? 'lived',
    summary: e.summary,
    day: e.lastUpdatedDay,
  }));
  return NextResponse.json({
    sagaId,
    count: cast.length,
    characters: cast.map((c) => ({
      id: c.id,
      name: c.name,
      hasPortrait: Boolean(c.gallery?.anchor?.imageUrl),
      imageUrl: c.gallery?.anchor?.imageUrl ?? null,
      role: c.role ?? null,
    })),
    edgeCount: edges.length,
    edges,
  });
}

export async function POST(req: Request) {
  // `limit` bounds how many to mint this call (each portrait ~2min; the route
  // caps at 800s). `skipNames` is the CALLER's confirmed-minted list — the
  // on-chain roster read lags finality across calls, so relying on it alone
  // duplicated characters; the client-tracked skip is what actually prevents it.
  const body = (await req.json().catch(() => ({}))) as { limit?: number; skipNames?: string[] };
  const cast = await loadFoundingPresetAction();
  if (!cast.length) {
    return NextResponse.json({ ok: false, error: 'preset has no founding_cast' }, { status: 400 });
  }
  const specs = cast
    .filter(
      (r) => r.name?.trim() && r.description?.trim() && r.ageYears > 0 && r.gender?.trim() && r.role?.trim(),
    )
    .map((r) => ({
      name: r.name.trim(),
      ageYears: r.ageYears,
      gender: r.gender,
      role: r.role.trim(),
      description: r.description.trim(),
      secret: r.secret?.trim() || undefined,
      minAttributes: r.minAttributes,
    }));
  const skip = new Set(body.skipNames ?? []);
  const existing = new Set(
    (await charactersApi.listSagaCharacters(ENDLESS_STORY_DEPLOYMENT.sagaId)).map((c) => c.name),
  );
  let pending = specs.filter((s) => !existing.has(s.name) && !skip.has(s.name));
  if (typeof body.limit === 'number' && body.limit > 0) pending = pending.slice(0, body.limit);
  if (!pending.length) {
    return NextResponse.json({ minted: [], remaining: 0, done: true });
  }
  const result = await createFoundingCastAction({ specs: pending });
  const mintedNames = result.minted.map((m) => m.name);
  const remaining = specs.filter(
    (s) => !existing.has(s.name) && !skip.has(s.name) && !mintedNames.includes(s.name),
  ).length;
  return NextResponse.json({ minted: mintedNames, failures: result.failures, remaining, done: false });
}
