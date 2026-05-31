import {
  charactersApi,
  chaptersApi,
  interventionsApi,
  liveStateApi,
  memoriesApi,
  personasApi,
  relationshipsApi,
  sagasApi,
  soulSongsApi,
  subscriptionsApi,
} from '@/lib/api/index';
import { SiteNav } from '@/components/home/SiteNav';
import {
  CharacterGrid,
  type CardData,
  type RosterFilter,
} from '@/components/dossier/CharacterGrid';
import { Suspense } from 'react';
import type { Character } from '@endless-story/shared';
import { DossierHeader } from '@/components/dossier/DossierHeader';
import { DossierSkeleton } from '@/components/dossier/DossierSkeleton';
import { LiveStateBar, LiveStateBarSkeleton } from '@/components/dossier/LiveStateBar';
import { DossierTabs, type DossierTab } from '@/components/dossier/DossierTabs';
import { ProfileTab } from '@/components/dossier/tabs/ProfileTab';
import { GalleryTab } from '@/components/dossier/tabs/GalleryTab';
import { ChaptersTab } from '@/components/dossier/tabs/ChaptersTab';
import { MemoriesTab } from '@/components/dossier/tabs/MemoriesTab';
import { InterventionTab } from '@/components/dossier/tabs/InterventionTab';
import { DEMO_OWNERS } from '@/mocks/characters';
import { DEMO_SAGA_ID } from '@/mocks/sagas';
import { DEMO_VIEWER_WALLET } from '@/mocks/subscriptions';
import { shortChapterTitle } from '@/lib/format';
import { fetchPovChaptersForCharacter } from '@/lib/chain/pov-read';
import { fetchReflectionsForCharacter } from '@/lib/chain/reflection-read';
import { PovTriggerButton } from '@/components/dossier/PovTriggerButton';

const VALID_TABS: DossierTab[] = ['profile', 'gallery', 'chapters', 'memories', 'entrusts'];
const VALID_FILTERS: RosterFilter[] = ['all', 'internal', 'external', 'mine'];

function parseTab(raw: string | string[] | undefined): DossierTab {
  if (typeof raw === 'string' && (VALID_TABS as string[]).includes(raw)) {
    return raw as DossierTab;
  }
  return 'profile';
}

function parseFilter(raw: string | string[] | undefined): RosterFilter {
  if (typeof raw === 'string' && (VALID_FILTERS as string[]).includes(raw)) {
    return raw as RosterFilter;
  }
  return 'all';
}

function resolveViewerWallet(raw: string | undefined): string | null {
  if (raw === 'viewer') return DEMO_VIEWER_WALLET;
  if (raw === 'none') return null;
  return raw ?? DEMO_OWNERS.OWNER_A;
}

export default async function DossierPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; tab?: string; as?: string; filter?: string }>;
}) {
  const params = await searchParams;
  const characterId = params.id;

  const viewerWallet = resolveViewerWallet(params.as);

  // ──────────── List view ────────────
  if (!characterId) {
    const filter = parseFilter(params.filter);
    // Facade is chain-first when deployed; mock fallback otherwise.
    // `filter=mine` branches at the facade level (uses OwnerCap query
    // for cheaper round-trip than scanning all CharacterMinted events).
    const useOwnedQuery =
      filter === 'mine' && viewerWallet != null && /^0x[0-9a-fA-F]{64}$/.test(viewerWallet);
    const characters = useOwnedQuery
      ? await charactersApi.listOwnedCharacters(viewerWallet)
      : await charactersApi.listCharacters();
    const charactersById = new Map(characters.map((c) => [c.id, c]));

    const cards: CardData[] = await Promise.all(
      characters.map(async (character) => {
        const magnetism = await charactersApi.getMagnetism(character.id);
        const sigQuote = magnetism?.signatureQuote;
        const quoteChapter = sigQuote?.chapterId
          ? await chaptersApi.getChapter(sigQuote.chapterId)
          : null;
        const quote = sigQuote
          ? {
              text: sigQuote.text,
              chapterId: sigQuote.chapterId,
              chapterTitle: quoteChapter
                ? shortChapterTitle(quoteChapter.title)
                : undefined,
            }
          : undefined;

        const edges = await relationshipsApi.listOutgoingEdges(character.id);
        const topEdge = edges[0];
        const target = topEdge ? charactersById.get(topEdge.toId) : null;
        const tension =
          topEdge && target
            ? { targetName: target.name, label: topEdge.label }
            : undefined;

        const subscribers = await subscriptionsApi.listSubscribers(character.id);
        const isOwner = viewerWallet != null && character.nftOwner === viewerWallet;
        const initialSubscribed =
          isOwner ||
          (viewerWallet != null &&
            subscribers.some((s) => s.wallet === viewerWallet && !s.isOwner));

        return {
          character,
          quote,
          tension,
          initialSubscriberCount: magnetism?.subscriberCount ?? 1,
          initialSubscribed,
          isOwner,
          nextPovHint: magnetism?.nextPovHint,
        };
      })
    );

    return (
      <main className="h-[100dvh] overflow-y-auto overflow-x-hidden snap-y snap-mandatory scroll-smooth">
        <SiteNav />
        <CharacterGrid
          cards={cards}
          filter={filter}
          viewerWallet={viewerWallet}
          internalSagaId={DEMO_SAGA_ID}
        />
      </main>
    );
  }

  // ──────────── Detail view ────────────
  // Keyed Suspense so a cold entry AND a character→character switch (same
  // /dossier segment, different ?id) both show the skeleton instead of
  // sitting on the previous character while the chain fan-out loads.
  return (
    <Suspense key={characterId} fallback={<DossierSkeleton />}>
      <DossierDetail characterId={characterId} viewerWallet={viewerWallet} tab={parseTab(params.tab)} />
    </Suspense>
  );
}

async function DossierDetail({
  characterId,
  viewerWallet,
  tab,
}: {
  characterId: string;
  viewerWallet: string | null;
  tab: DossierTab;
}) {
  const character = await charactersApi.getCharacter(characterId);
  if (!character) {
    return (
      <main className="min-h-screen">
        <SiteNav />
        <section className="px-5 py-20 text-center text-mute sm:px-10">
          找不到這個角色。
        </section>
      </main>
    );
  }

  // NOTE: memories are deliberately NOT fetched here — `listMemories` is a
  // 24-memory SEAL recall (72 candidates decrypted) that took 20-60s and
  // blocked the WHOLE dossier even on the profile tab. It now loads lazily
  // inside its own Suspense, only when the 記憶 tab is open (see below).
  const [
    allCharacters,
    edges,
    chapters,
    interventions,
    soulSongs,
    persona,
    sagaName,
    chainPovChapters,
    reflections,
  ] = await Promise.all([
    charactersApi.listCharacters(),
    relationshipsApi.listOutgoingEdges(character.id),
    chaptersApi.listPublicChaptersForSubscription(character.id),
    interventionsApi.listInterventions(character.id),
    soulSongsApi.listSoulSongs(character.id),
    personasApi.getPersona(character.id),
    // null when character.sagaId is null, a mock slug (non-Sui-id), or chain
    // unreachable; DossierHeader falls back to its legacy DEMO_SAGA_ID slug
    // match in that case.
    character.sagaId
      ? sagasApi.getSaga(character.sagaId).then((s) => s?.name ?? null)
      : Promise.resolve(null),
    // On-chain POV chapters anchored via commitment.move. Empty array
    // when nothing's been committed yet (no runner POV yet, no
    // admin-triggered chapter yet).
    fetchPovChaptersForCharacter(character.id, { limit: 5 }),
    // Reflections from reflection.move. Owner sees full body; non-owners
    // see only metadata (mode + timestamp + chain anchor).
    fetchReflectionsForCharacter(character.id, { limit: 8 }),
  ]);
  const charactersById = new Map(allCharacters.map((c) => [c.id, c]));
  const personaRegenChapter = persona?.lastRegenChapterId
    ? (await chaptersApi.getChapter(persona.lastRegenChapterId)) ?? null
    : null;

  return (
    <main className="h-[100dvh] overflow-y-auto overflow-x-hidden snap-y snap-mandatory scroll-smooth">
      {/* Screen 1: Header */}
      <div className="flex min-h-[100dvh] flex-col snap-start snap-always relative">
        <SiteNav />
        <div className="flex flex-1 flex-col justify-center pb-16">
          <DossierHeader
            character={character}
            sagaName={sagaName}
            liveStateSlot={
              <Suspense fallback={<LiveStateBarSkeleton />}>
                <LiveStateBarLoader character={character} sagaCharacters={allCharacters} />
              </Suspense>
            }
          />
        </div>
        
        {/* Scroll hint */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 opacity-75 pointer-events-none [@media(max-height:520px)]:hidden">
          <span className="text-2xs tracking-[0.35em] text-cinnabar/80">往下翻閱</span>
          <div className="h-8 w-px overflow-hidden bg-hairline">
            <div className="h-full w-full bg-cinnabar/90 animate-scroll-down-line" />
          </div>
        </div>
      </div>

      {/* Screen 2: Content */}
      <div className="min-h-[100dvh] snap-start snap-always relative pb-32">
        <DossierTabs character={character} active={tab} />
        <section className="px-5 py-12 sm:px-10 sm:py-16">
          <div className="mx-auto max-w-6xl">
            {tab === 'profile' ? (
              <ProfileTab
                character={character}
                persona={persona}
                personaRegenChapter={personaRegenChapter}
                outgoingEdges={edges}
                charactersById={charactersById}
              />
            ) : null}
            {tab === 'gallery' ? (
              <GalleryTab character={character} isOwner={viewerWallet === character.nftOwner} />
            ) : null}
            {tab === 'chapters' ? (
              <>
                <ChaptersTab
                  chapters={chapters}
                  character={character}
                  chainPovChapters={chainPovChapters}
                />
                <PovTriggerButton characterId={character.id} />
              </>
            ) : null}
            {tab === 'memories' ? (
              <Suspense fallback={<MemoriesTabSkeleton />}>
                <MemoriesTabLoader
                  character={character}
                  viewerWallet={viewerWallet}
                  sagaCharacters={allCharacters}
                />
              </Suspense>
            ) : null}
            {tab === 'entrusts' ? (
              <InterventionTab
                character={character}
                interventions={interventions}
                soulSongs={soulSongs}
                viewerWallet={viewerWallet}
                sagaCharacters={allCharacters}
                reflections={reflections}
              />
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}

/**
 * Lazy loader for the header's live-state bar. getLiveState(withPlan) does a
 * SEAL recall for 此刻心境/將往何方; isolating it here lets the header (portrait
 * + name + meta + chips) paint immediately while this streams in.
 */
async function LiveStateBarLoader({
  character,
  sagaCharacters,
}: {
  character: Character;
  sagaCharacters: Character[];
}) {
  const liveState = await liveStateApi.getLiveState(character.id, { withPlan: true });
  return (
    <LiveStateBar liveState={liveState} sagaCharacters={sagaCharacters} characterId={character.id} />
  );
}

/**
 * Lazy loader for the 記憶 tab. `listMemories` is a SEAL recall (slow +
 * rate-limited), so it's isolated here behind a Suspense and only runs when
 * the memories tab is open — never blocking the header / other tabs.
 */
async function MemoriesTabLoader({
  character,
  viewerWallet,
  sagaCharacters,
}: {
  character: Character;
  viewerWallet: string | null;
  sagaCharacters: Character[];
}) {
  const memories = await memoriesApi.listMemories(character.id, viewerWallet);
  const memoryChapterIds = Array.from(
    new Set(
      memories.map((m) => m.eventChapterId).filter((id): id is string => Boolean(id)),
    ),
  );
  const memoryChapters = await Promise.all(
    memoryChapterIds.map((id) => chaptersApi.getChapter(id)),
  );
  const chaptersById = new Map(
    memoryChapters
      .filter((c): c is NonNullable<typeof c> => Boolean(c))
      .map((c) => [c.id, c]),
  );
  return (
    <MemoriesTab
      character={character}
      memories={memories}
      viewerWallet={viewerWallet}
      sagaCharacters={sagaCharacters}
      chaptersById={chaptersById}
    />
  );
}

function MemoriesTabSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-4 w-40 rounded bg-hairline/60 dark:bg-hairline" />
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="rounded-xl border border-hairline/50 p-5">
          <div className="h-3 w-24 rounded bg-hairline/60 dark:bg-hairline" />
          <div className="mt-3 h-4 w-full rounded bg-hairline/60 dark:bg-hairline" />
          <div className="mt-2 h-4 w-3/4 rounded bg-hairline/60 dark:bg-hairline" />
        </div>
      ))}
      <p className="pt-2 text-center text-2xs tracking-widest text-mute">解密記憶中…</p>
    </div>
  );
}
