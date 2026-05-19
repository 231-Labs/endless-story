import {
  charactersApi,
  chaptersApi,
  interventionsApi,
  relationshipsApi,
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
import { InterventionTab } from '@/components/dossier/tabs/InterventionTab';
import { DEMO_OWNERS } from '@/mocks/characters';
import { DEMO_SAGA_ID } from '@/mocks/sagas';
import {
  BASE_SUBSCRIBER_COUNT,
  NEXT_POV_HINT,
  SIGNATURE_QUOTES,
} from '@/lib/character-magnetism';
import { shortChapterTitle } from '@/lib/format';

const VALID_TABS: DossierTab[] = ['profile', 'gallery', 'chapters', 'entrusts'];
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

export default async function DossierPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; tab?: string; as?: string; filter?: string }>;
}) {
  const params = await searchParams;
  const characterId = params.id;

  const viewerWallet =
    params.as === 'viewer' ? null : params.as ?? DEMO_OWNERS.OWNER_A;

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
      <main className="min-h-screen">
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
  const [allCharacters, edges, chapters, interventions] = await Promise.all([
    charactersApi.listCharacters(),
    relationshipsApi.listOutgoingEdges(character.id),
    chaptersApi.listPublicChaptersForSubscription(character.id),
    interventionsApi.listInterventions(character.id),
  ]);
  const charactersById = new Map(allCharacters.map((c) => [c.id, c]));

  return (
    <main className="min-h-screen">
      <SiteNav />
      <DossierHeader character={character} />
      <DossierTabs character={character} active={tab} />
      <section className="px-5 py-10 sm:px-10 sm:py-14">
        <div className="mx-auto max-w-6xl">
          {tab === 'profile' ? (
            <ProfileTab
              character={character}
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
          {tab === 'entrusts' ? (
            <InterventionTab
              character={character}
              interventions={interventions}
              viewerWallet={viewerWallet}
            />
          ) : null}
        </div>
      </section>
    </main>
  );
}
