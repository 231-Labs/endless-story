import { Suspense } from 'react';
import {
  chaptersApi,
  charactersApi,
  locationsApi,
  relationshipsApi,
  sagasApi,
  scenesApi,
} from '@/lib/api/index';
import type { Character, CharacterLiveState, Saga, SagaLocation, Scene } from '@endless-story/shared';
import { byId } from '@/lib/collections';
import { SiteNav } from '@/components/home/SiteNav';
import { SagaHandscroll } from '@/components/saga/handscroll/SagaHandscroll';
import { CastConstellation } from '@/components/saga/CastConstellation';
import { SagaCharterPanel } from '@/components/saga/SagaCharterPanel';
import { SagaDetailsTabs } from '@/components/saga/SagaDetailsTabs';
import { SagaTabsProvider } from '@/components/saga/SagaTabsContext';
import { getSagaStanceSnapshot } from '@/lib/actions/saga-stance';
import { getSagaHeartLedger } from '@/lib/actions/saga-live';
import { loadWants } from '@/lib/chain/want-store';
import { mergeFeltEdges, projectWantEdges } from '@/lib/chain/relationship-felt';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const saga = await sagasApi.getSaga(id).catch(() => null);
  if (!saga) return { title: '找不到戲班' };
  return {
    title: `${saga.name} · 手卷`,
    description: saga.premise.slice(0, 120),
    openGraph: { title: `${saga.name} · 無盡敘界`, description: saga.premise.slice(0, 120) },
  };
}

/**
 * Saga page = two snap screens with two very different data needs:
 *   screen 1 (handscroll) — saga + scenes + locations + whoever stands in a
 *     scene right now. Three read stages, then it paints.
 *   screen 2 (constellation / charter) — the full relationship graph (edge
 *     walk → wild cast → reverse edges), stance, heart ledger. That chain is
 *     deep, so it streams in under Suspense instead of blocking screen 1.
 */
export default async function SagaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const saga = await sagasApi.getSaga(id);

  if (!saga) {
    return (
      <main className="min-h-screen">
        <SiteNav />
        <section className="flex flex-col items-center px-5 py-24 text-center sm:px-10">
          <p className="font-serif text-xl tracking-[0.2em] text-ink">找不到這個戲班</p>
          <p className="mt-3 text-sm text-mute">這座園子還沒開張，或匾額已經摘了。</p>
          <a
            href="/"
            className="mt-8 es-button-ghost"
          >
            回戲園子
          </a>
        </section>
      </main>
    );
  }

  const [cast, scenes, locations] = await Promise.all([
    charactersApi.listSagaCharacters(saga.id),
    scenesApi.listScenes(saga.id),
    Promise.all(
      (saga.coveredLocationIds ?? []).map((lid) => locationsApi.getLocation(lid))
    ).then((arr) => arr.filter((l): l is NonNullable<typeof l> => Boolean(l))),
  ]);
  const charactersById = byId(cast);

  // The handscroll only needs characters actually standing in a scene: the
  // cast plus whoever wandered in from outside (names for 團扇 present counts
  // and the SceneSheet). The full edge-derived wild set belongs to screen 2.
  const presentWildIds = Array.from(
    new Set(
      scenes
        .flatMap((s) => s.currentCharacterIds ?? [])
        .filter((cid) => !charactersById.has(cid)),
    ),
  );
  const recentChapterIds = Array.from(
    new Set(
      scenes
        .map((s) => s.recentEventChapterId)
        .filter((id): id is string => Boolean(id))
    )
  );
  const [presentWildRaw, recentChapters] = await Promise.all([
    Promise.all(presentWildIds.map((cid) => charactersApi.getCharacter(cid))),
    Promise.all(recentChapterIds.map((cid) => chaptersApi.getChapter(cid))),
  ]);
  const presentWild = presentWildRaw.filter((c): c is NonNullable<typeof c> => Boolean(c));
  const chaptersById = new Map(
    recentChapters
      .filter((c): c is NonNullable<typeof c> => Boolean(c))
      .map((c) => [c.id, c])
  );

  const locationLabel = locations.length
    ? locations.map((l) => l.name).join(' + ')
    : '無 location';

  return (
    <SagaTabsProvider>
    <main className="h-[100dvh] overflow-y-auto overflow-x-hidden snap-y snap-mandatory scroll-smooth bg-canvas">
      {/* Screen 1: Immersive Canvas + Hero + Premise */}
      <section
        id="saga-handscroll"
        className="relative h-[100dvh] w-full snap-start snap-always overflow-hidden"
      >
        <div className="absolute top-0 inset-x-0 z-50">
          <SiteNav />
        </div>
        <SagaHandscroll
          saga={saga}
          scenes={scenes}
          locations={locations}
          charactersById={byId([...cast, ...presentWild])}
          chaptersById={chaptersById}
          locationLabel={locationLabel}
        />
      </section>

      {/* Screen 2: Details Tabs (Constellation / Charter) — streamed */}
      <Suspense fallback={<SagaDetailsFallback />}>
        <SagaDetailsSection saga={saga} cast={cast} scenes={scenes} locations={locations} />
      </Suspense>
    </main>
    </SagaTabsProvider>
  );
}

/** Placeholder for screen 2 while the relationship graph streams in — keeps
 *  the snap rhythm (a full-height section) and names what's coming. */
function SagaDetailsFallback() {
  return (
    <section className="relative flex h-[100dvh] w-full snap-start snap-always flex-col items-center justify-center gap-6 bg-canvas">
      <div className="relative h-40 w-40">
        {/* a faint constellation sketch: three pulsing nodes + hairlines */}
        <span className="absolute left-1/2 top-2 h-2.5 w-2.5 -translate-x-1/2 animate-pulse rounded-full bg-mute/40" />
        <span className="absolute bottom-4 left-4 h-2 w-2 animate-pulse rounded-full bg-mute/30 [animation-delay:0.4s]" />
        <span className="absolute bottom-8 right-2 h-2 w-2 animate-pulse rounded-full bg-mute/30 [animation-delay:0.8s]" />
        <svg viewBox="0 0 160 160" className="absolute inset-0 h-full w-full opacity-20">
          <path d="M80 14 L22 128 M80 14 L142 118 M22 128 L142 118" stroke="currentColor" strokeWidth="0.6" fill="none" className="text-mute" />
        </svg>
      </div>
      <p className="font-serif text-2xs tracking-[0.5em] text-mute/70">人物星圖梳理中</p>
    </section>
  );
}

/**
 * Screen 2 data + render: the deep reads (edge walk, wild cast, stance, heart
 * ledger) happen here so they stream in behind the already-visible handscroll.
 */
async function SagaDetailsSection({
  saga,
  cast,
  scenes,
  locations,
}: {
  saga: Saga;
  cast: Character[];
  scenes: Scene[];
  locations: SagaLocation[];
}) {
  const charactersById = byId(cast);

  // Independent roots first, in one round: stance, heart ledger, cast edges.
  const [stanceSnap, heartLedger, allEdgesArrays] = await Promise.all([
    getSagaStanceSnapshot(),
    getSagaHeartLedger(saga.id),
    Promise.all(cast.map((c) => relationshipsApi.listOutgoingEdges(c.id))),
  ]);
  const stance = stanceSnap.stance;
  const allCastEdges = allEdgesArrays.flat();

  // Wild character ids pointed at from outside the cast
  const wildCharIds = Array.from(
    new Set(allCastEdges.filter((e) => !charactersById.has(e.toId)).map((e) => e.toId))
  );
  const wildCharsRaw = await Promise.all(
    wildCharIds.map((cid) => charactersApi.getCharacter(cid))
  );
  const wildCast = wildCharsRaw.filter((c): c is NonNullable<typeof c> => Boolean(c));

  // Also fetch wild→cast reverse edges (jianghu's view of the saga)
  const wildEdgesArrays = await Promise.all(
    wildCast.map((c) => relationshipsApi.listOutgoingEdges(c.id))
  );
  const wildEdges = wildEdgesArrays.flat().filter((e) => charactersById.has(e.toId));

  // All renderable character ids (cast + wildCast)
  const allCharIds = new Set([...cast.map((c) => c.id), ...wildCast.map((c) => c.id)]);
  // felt layer: the cast's own wants project directed feelings (愛→戀慕), merged
  // over the lived (scene-judged) seeds so both coexist per (pair, tone).
  const idByName = new Map([...cast, ...wildCast].map((c) => [c.name, c.id]));
  const feltEdges = projectWantEdges(loadWants(saga.id), {
    resolveTargetId: (t) => (allCharIds.has(t) ? t : idByName.get(t)),
    currentDay: saga.currentDay,
  });
  const edges = mergeFeltEdges([...allCastEdges, ...wildEdges], feltEdges).filter((e) =>
    allCharIds.has(e.toId),
  );

  // Relationship climate for the charter — dedupe undirected per pair+tone, count
  // by tone, drop the bland 平淡. Same edges the constellation draws, aggregated.
  const TONE_LABELS: Record<string, string> = {
    affection: '親近', romance: '戀慕', mentorship: '師承', rivalry: '競爭',
    wary: '戒備', tension: '緊張', estrangement: '疏離', acquaintance: '故舊', neutral: '平淡',
  };
  const climateSeen = new Set<string>();
  const toneCount = new Map<string, number>();
  for (const e of edges) {
    const [a, b] = e.fromId < e.toId ? [e.fromId, e.toId] : [e.toId, e.fromId];
    const tone = e.tone ?? 'neutral';
    const key = `${a}::${b}::${tone}`;
    if (climateSeen.has(key)) continue;
    climateSeen.add(key);
    toneCount.set(tone, (toneCount.get(tone) ?? 0) + 1);
  }
  const relationshipClimate = [...toneCount.entries()]
    .filter(([t]) => t !== 'neutral')
    .map(([tone, count]) => ({ label: TONE_LABELS[tone] ?? tone, count }))
    .sort((x, y) => y.count - x.count)
    .slice(0, 5);

  // Build live state LOCALLY from data already loaded (scenes + cast) instead
  // of N× getLiveState chain round-trips. Location = current scene name;
  // intent is fetched on hover in CastConstellation (MemWal plan, one at a time).
  const sceneNameById = new Map(scenes.map((s) => [s.id, s.name]));
  const liveStatesById: Record<string, CharacterLiveState> = Object.fromEntries(
    [...cast, ...wildCast].map((c) => {
      const location = c.currentSceneId
        ? (sceneNameById.get(c.currentSceneId) ?? '別處')
        : '江湖之間';
      return [
        c.id,
        {
          intent: '',
          location,
          nextPlan: '',
        } satisfies CharacterLiveState,
      ];
    }),
  );

  return (
    <SagaDetailsTabs
      constellationContent={
        <div className="relative h-full w-full">
          <CastConstellation
            cast={cast}
            wildCast={wildCast}
            edges={edges}
            scenes={scenes}
            locations={locations}
            liveStatesById={liveStatesById}
          />
        </div>
      }
      charterContent={
        <SagaCharterPanel
          saga={saga}
          stance={stance}
          climate={relationshipClimate}
          heart={heartLedger}
        />
      }
    />
  );
}
