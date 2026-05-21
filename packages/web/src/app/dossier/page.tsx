import {
  charactersApi,
  chaptersApi,
  interventionsApi,
  liveStateApi,
  memoriesApi,
  personasApi,
  relationshipsApi,
  soulSongsApi,
  subscriptionsApi,
} from '@/lib/api/index';
import { SiteNav } from '@/components/home/SiteNav';
import {
  CharacterGrid,
  type CardData,
  type RosterFilter,
} from '@/components/dossier/CharacterGrid';
import { DossierHeader } from '@/components/dossier/DossierHeader';
import { DossierTabs, type DossierTab } from '@/components/dossier/DossierTabs';
import { ProfileTab } from '@/components/dossier/tabs/ProfileTab';
import { GalleryTab } from '@/components/dossier/tabs/GalleryTab';
import { ChaptersTab } from '@/components/dossier/tabs/ChaptersTab';
import { MemoriesTab } from '@/components/dossier/tabs/MemoriesTab';
import { InterventionTab } from '@/components/dossier/tabs/InterventionTab';
import { DEMO_OWNERS } from '@/mocks/characters';
import { DEMO_SAGA_ID } from '@/mocks/sagas';
import { DEMO_VIEWER_WALLET } from '@/mocks/subscriptions';
import {
  BASE_SUBSCRIBER_COUNT,
  NEXT_POV_HINT,
  SIGNATURE_QUOTES,
} from '@/lib/character-magnetism';
import { shortChapterTitle } from '@/lib/format';

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
    const characters = await charactersApi.listCharacters();
    const charactersById = new Map(characters.map((c) => [c.id, c]));
    const filter = parseFilter(params.filter);

    const cards: CardData[] = await Promise.all(
      characters.map(async (character) => {
        const sigQuote = SIGNATURE_QUOTES[character.id];
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
          initialSubscriberCount: BASE_SUBSCRIBER_COUNT[character.id] ?? 1,
          initialSubscribed,
          isOwner,
          nextPovHint: NEXT_POV_HINT[character.id],
        };
      })
    );

    return (
      <main className="h-[100dvh] overflow-y-auto overflow-x-hidden snap-y snap-mandatory scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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

  const tab = parseTab(params.tab);
  const [
    allCharacters,
    edges,
    chapters,
    interventions,
    soulSongs,
    memories,
    persona,
    liveState,
  ] = await Promise.all([
    charactersApi.listCharacters(),
    relationshipsApi.listOutgoingEdges(character.id),
    chaptersApi.listPublicChaptersForSubscription(character.id),
    interventionsApi.listInterventions(character.id),
    soulSongsApi.listSoulSongs(character.id),
    memoriesApi.listMemories(character.id, viewerWallet),
    personasApi.getPersona(character.id),
    liveStateApi.getLiveState(character.id),
  ]);
  const charactersById = new Map(allCharacters.map((c) => [c.id, c]));
  const memoryChapterIds = Array.from(
    new Set(
      memories
        .map((m) => m.eventChapterId)
        .filter((id): id is string => Boolean(id))
    )
  );
  const memoryChapters = await Promise.all(
    memoryChapterIds.map((id) => chaptersApi.getChapter(id))
  );
  const chaptersById = new Map(
    memoryChapters
      .filter((c): c is NonNullable<typeof c> => Boolean(c))
      .map((c) => [c.id, c])
  );
  const personaRegenChapter = persona?.lastRegenChapterId
    ? (await chaptersApi.getChapter(persona.lastRegenChapterId)) ?? null
    : null;

  return (
    <main className="h-[100dvh] overflow-y-auto overflow-x-hidden snap-y snap-mandatory scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {/* Screen 1: Header */}
      <div className="flex min-h-[100dvh] flex-col snap-start snap-always relative">
        <SiteNav />
        <div className="flex flex-1 flex-col justify-center pb-16">
          <DossierHeader
            character={character}
            liveState={liveState}
            sagaCharacters={allCharacters}
          />
        </div>
        
        {/* Scroll hint */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-mute/50 pointer-events-none">
          <span className="text-2xs font-mono tracking-widest uppercase">SCROLL</span>
          <div className="h-10 w-px overflow-hidden bg-hairline/30">
            <div className="h-full w-full animate-scroll-down-line bg-mute/50" />
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
              <ChaptersTab chapters={chapters} character={character} />
            ) : null}
            {tab === 'memories' ? (
              <MemoriesTab
                character={character}
                memories={memories}
                viewerWallet={viewerWallet}
                sagaCharacters={allCharacters}
                chaptersById={chaptersById}
              />
            ) : null}
            {tab === 'entrusts' ? (
              <InterventionTab
                character={character}
                interventions={interventions}
                soulSongs={soulSongs}
                viewerWallet={viewerWallet}
                sagaCharacters={allCharacters}
              />
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
