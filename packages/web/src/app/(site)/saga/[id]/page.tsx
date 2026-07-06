import {
  chaptersApi,
  charactersApi,
  locationsApi,
  relationshipsApi,
  sagasApi,
  scenesApi,
} from '@/lib/api/index';
import type { CharacterLiveState } from '@endless-story/shared';
import { byId } from '@/lib/collections';
import { SiteNav } from '@/components/home/SiteNav';
import { SagaHandscroll } from '@/components/saga/handscroll/SagaHandscroll';
import { CastConstellation } from '@/components/saga/CastConstellation';
import { SagaCharterPanel } from '@/components/saga/SagaCharterPanel';
import { SagaDetailsTabs } from '@/components/saga/SagaDetailsTabs';
import { OffTurfBoard } from '@/components/saga/OffTurfBoard';
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

  const [cast, scenes, locations, stanceSnap] = await Promise.all([
    charactersApi.listSagaCharacters(saga.id),
    scenesApi.listScenes(saga.id),
    Promise.all(
      (saga.coveredLocationIds ?? []).map((lid) => locationsApi.getLocation(lid))
    ).then((arr) => arr.filter((l): l is NonNullable<typeof l> => Boolean(l))),
    getSagaStanceSnapshot(),
  ]);
  const stance = stanceSnap.stance;
  const charactersById = byId(cast);

  // All outgoing edges: cast↔cast + cast→wild
  const allEdgesArrays = await Promise.all(
    cast.map((c) => relationshipsApi.listOutgoingEdges(c.id))
  );
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

  const heartLedger = await getSagaHeartLedger(saga.id);

  const recentChapterIds = Array.from(
    new Set(
      scenes
        .map((s) => s.recentEventChapterId)
        .filter((id): id is string => Boolean(id))
    )
  );
  const recentChapters = await Promise.all(
    recentChapterIds.map((cid) => chaptersApi.getChapter(cid))
  );
  const chaptersById = new Map(
    recentChapters
      .filter((c): c is NonNullable<typeof c> => Boolean(c))
      .map((c) => [c.id, c])
  );

  const locationLabel = locations.length
    ? locations.map((l) => l.name).join(' + ')
    : '無 location';

  // Build live state LOCALLY from data already loaded (scenes + cast) instead
  // of N× getLiveState chain round-trips. Location = current scene name;
  // intent is fetched on hover in CastConstellation (MemWal plan, one at a time).
  const allCharsForLive = [...cast, ...wildCast];
  const sceneNameById = new Map(scenes.map((s) => [s.id, s.name]));
  const liveStatesById: Record<string, CharacterLiveState> = Object.fromEntries(
    allCharsForLive.map((c) => {
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

  // For handscroll: cast + wildCast both go in charactersById so wild can render silhouettes in-scene
  const allCharactersById = byId(allCharsForLive);

  // "Out in jianghu": saga members (saga_id-bound = cast) not currently on covered turf.
  // Scenes may anchor at uncovered external locations; fetch those names to label "where".
  const coveredLocIds = new Set(locations.map((l) => l.id));
  const sceneById = byId(scenes);
  const externalLocIds = Array.from(
    new Set(
      scenes
        .map((s) => s.locationId)
        .filter((id): id is string => typeof id === 'string' && !coveredLocIds.has(id)),
    ),
  );
  const externalLocs = (
    await Promise.all(externalLocIds.map((id) => locationsApi.getLocation(id)))
  ).filter((l): l is NonNullable<typeof l> => Boolean(l));
  const locationNameById = new Map(
    [...locations, ...externalLocs].map((l) => [l.id, l.name]),
  );
  const offTurfEntries = cast
    .map((c) => {
      const sc = c.currentSceneId ? sceneById.get(c.currentSceneId) : undefined;
      const onTurf = !!(sc?.locationId && coveredLocIds.has(sc.locationId));
      if (onTurf) return null;
      return {
        id: c.id,
        name: c.name,
        role: c.role,
        imageUrl: c.gallery?.anchor?.imageUrl,
        sceneName: sc?.name,
        locationName: sc?.locationId ? locationNameById.get(sc.locationId) : undefined,
      };
    })
    .filter((e): e is NonNullable<typeof e> => Boolean(e));

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
          charactersById={allCharactersById}
          chaptersById={chaptersById}
          locationLabel={locationLabel}
        />
      </section>

      {/* Screen 2: Details Tabs (Constellation / Charter) */}
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
        offTurfContent={<OffTurfBoard entries={offTurfEntries} />}
        charterContent={
          <SagaCharterPanel
            saga={saga}
            stance={stance}
            climate={relationshipClimate}
            heart={heartLedger}
          />
        }
      />
    </main>
    </SagaTabsProvider>
  );
}
