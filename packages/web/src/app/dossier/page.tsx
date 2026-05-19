import {
  charactersApi,
  chaptersApi,
  interventionsApi,
  relationshipsApi,
} from '@/lib/api/index';
import { SiteNav } from '@/components/home/SiteNav';
import { CharacterGrid, type RosterFilter } from '@/components/dossier/CharacterGrid';
import { DossierHeader } from '@/components/dossier/DossierHeader';
import { DossierTabs, type DossierTab } from '@/components/dossier/DossierTabs';
import { ProfileTab } from '@/components/dossier/tabs/ProfileTab';
import { GalleryTab } from '@/components/dossier/tabs/GalleryTab';
import { ChaptersTab } from '@/components/dossier/tabs/ChaptersTab';
import { InterventionTab } from '@/components/dossier/tabs/InterventionTab';
import { DEMO_OWNERS } from '@/mocks/characters';
import { DEMO_SAGA_ID } from '@/mocks/sagas';

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

  // demo viewer: default to OWNER_A (so 我的 / 託夢 features show real state);
  // override with ?as=viewer (anonymous) or ?as=<wallet>.
  const viewerWallet =
    params.as === 'viewer' ? null : params.as ?? DEMO_OWNERS.OWNER_A;

  if (!characterId) {
    const all = await charactersApi.listCharacters();
    const filter = parseFilter(params.filter);
    return (
      <main className="min-h-screen">
        <SiteNav />
        <CharacterGrid
          characters={all}
          filter={filter}
          viewerWallet={viewerWallet}
          internalSagaId={DEMO_SAGA_ID}
        />
      </main>
    );
  }

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
          {tab === 'gallery' ? <GalleryTab character={character} /> : null}
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
