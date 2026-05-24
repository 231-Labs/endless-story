import {
  chaptersApi,
  charactersApi,
  liveStateApi,
  relationshipsApi,
  sagasApi,
  scenesApi,
} from '@/lib/api/index';
import type { CharacterLiveState } from '@endless-story/shared';
import { SiteNav } from '@/components/home/SiteNav';
import { SagaHandscroll } from '@/components/saga/handscroll/SagaHandscroll';
import { CastConstellation } from '@/components/saga/CastConstellation';
import { SagaCharterPanel } from '@/components/saga/SagaCharterPanel';
import { SagaDetailsTabs } from '@/components/saga/SagaDetailsTabs';

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
        <section className="px-5 py-20 text-center text-mute sm:px-10">
          找不到這個戲班。
        </section>
      </main>
    );
  }

  const [cast, scenes, locations] = await Promise.all([
    charactersApi.listSagaCharacters(saga.id),
    scenesApi.listScenes(saga.id),
    Promise.all(
      (saga.coveredLocationIds ?? []).map((lid) => sagasApi.getLocation(lid))
    ).then((arr) => arr.filter((l): l is NonNullable<typeof l> => Boolean(l))),
  ]);
  const charactersById = new Map(cast.map((c) => [c.id, c]));

  // 收 cast 之間 + cast → wild 的所有 outgoing edges
  const allEdgesArrays = await Promise.all(
    cast.map((c) => relationshipsApi.listOutgoingEdges(c.id))
  );
  const allCastEdges = allEdgesArrays.flat();

  // 找出 cast 外被指到的 wild 角色 ids
  const wildCharIds = Array.from(
    new Set(allCastEdges.filter((e) => !charactersById.has(e.toId)).map((e) => e.toId))
  );
  const wildCharsRaw = await Promise.all(
    wildCharIds.map((cid) => charactersApi.getCharacter(cid))
  );
  const wildCast = wildCharsRaw.filter((c): c is NonNullable<typeof c> => Boolean(c));

  // 還要拿 wild → cast 反向邊（顯示江湖對 saga 的視角）
  const wildEdgesArrays = await Promise.all(
    wildCast.map((c) => relationshipsApi.listOutgoingEdges(c.id))
  );
  const wildEdges = wildEdgesArrays.flat().filter((e) => charactersById.has(e.toId));

  // 全圖能 render 的 character ids（cast + wildCast）
  const allCharIds = new Set([...cast.map((c) => c.id), ...wildCast.map((c) => c.id)]);
  const edges = [...allCastEdges, ...wildEdges].filter((e) => allCharIds.has(e.toId));

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

  // 拉所有 character（cast + wildCast）的 live state — 鏈上「現在在哪」投影
  const allCharsForLive = [...cast, ...wildCast];
  const liveStateEntries = await Promise.all(
    allCharsForLive.map(async (c) => [c.id, await liveStateApi.getLiveState(c.id)] as const)
  );
  const liveStatesById: Record<string, CharacterLiveState> = Object.fromEntries(liveStateEntries);

  // 給 handscroll：cast + wildCast 都進 charactersById，wild 在 scene 內也能渲染剪影
  const allCharactersById = new Map(allCharsForLive.map((c) => [c.id, c]));

  return (
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
        charterContent={
          <SagaCharterPanel saga={saga} />
        }
      />
    </main>
  );
}
