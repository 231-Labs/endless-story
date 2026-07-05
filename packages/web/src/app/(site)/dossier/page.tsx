import {
  appearanceApi,
  charactersApi,
  chaptersApi,
  cutsApi,
  interventionsApi,
  liveStateApi,
  memoriesApi,
  personasApi,
  relationshipsApi,
  sagasApi,
  soulSongsApi,
  subscriptionsApi,
} from '@/lib/api/index';
import { isSuiObjectId } from '@/lib/chain/character-read';
import { SiteNav } from '@/components/home/SiteNav';
import {
  CharacterGrid,
  type CardData,
  type RosterFilter,
} from '@/components/dossier/CharacterGrid';
import { Suspense } from 'react';
import type { Character } from '@endless-story/shared';
import { byId } from '@/lib/collections';
import { DossierHeader } from '@/components/dossier/DossierHeader';
import { DossierSkeleton } from '@/components/dossier/DossierSkeleton';
import { RosterSkeletonInner } from '@/components/dossier/RosterSkeleton';
import { LiveStateBar, LiveStateBarSkeleton } from '@/components/dossier/LiveStateBar';
import { getCharacterWants } from '@/lib/actions/saga-live';
import { DossierTabs, type DossierTab } from '@/components/dossier/DossierTabs';
import { ProfileTab } from '@/components/dossier/tabs/ProfileTab';
import { GalleryTab } from '@/components/dossier/tabs/GalleryTab';
import { ShopTab } from '@/components/dossier/tabs/ShopTab';
import { ChaptersTab } from '@/components/dossier/tabs/ChaptersTab';
import { MemoriesTab } from '@/components/dossier/tabs/MemoriesTab';
import { MemoriesTabClient } from '@/components/dossier/tabs/MemoriesTabClient';
import { isMemoryConfigured, sealNetwork } from '@/lib/chain/memory';
import { InterventionTab } from '@/components/dossier/tabs/InterventionTab';
import { DEMO_OWNERS } from '@/mocks/characters';
import { DEMO_SAGA_ID } from '@/mocks/sagas';
import { DEMO_VIEWER_WALLET } from '@/mocks/subscriptions';
import { shortChapterTitle } from '@/lib/format';
import { fetchPovChaptersForCharacter } from '@/lib/chain/pov-read';
import { fetchReflectionsForCharacter } from '@/lib/chain/reflection-read';
import { PovTriggerButton } from '@/components/dossier/PovTriggerButton';

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  if (!id) {
    return {
      title: '班底名冊',
      description: '春雪社的角色名冊 — 每一位都是活著的記憶資產，可訂閱、可持有。',
    };
  }
  const character = await charactersApi.getCharacter(id).catch(() => null);
  if (!character) return { title: '找不到角色' };
  const description = `${character.role} · ${character.description.slice(0, 100)}`;
  const portrait = character.gallery?.anchor?.imageUrl;
  return {
    title: character.name,
    description,
    openGraph: {
      title: `${character.name} · 無盡敘界`,
      description,
      ...(portrait ? { images: [{ url: portrait }] } : {}),
    },
  };
}

const VALID_TABS: DossierTab[] = ['profile', 'gallery', 'chapters', 'shop', 'memories', 'entrusts'];
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
  // The static shell (SiteNav) renders immediately; only the per-card chain
  // fan-out streams under <Suspense>, so the roster header + filters appear at
  // once and only the character cards show a (roster-shaped) skeleton.
  if (!characterId) {
    const filter = parseFilter(params.filter);
    return (
      <main className="h-[100dvh] overflow-y-auto overflow-x-hidden snap-y snap-mandatory scroll-smooth">
        <SiteNav />
        <Suspense fallback={<RosterSkeletonInner filter={filter} />}>
          <RosterCards filter={filter} />
        </Suspense>
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

async function RosterCards({
  filter,
}: {
  filter: RosterFilter;
}) {
  // Facade is chain-first when deployed; mock fallback otherwise.
  // The "mine" roster filter is evaluated in CharacterGrid from the connected
  // dapp-kit wallet. The server cannot trust URL `?as=` for ownership.
  const characters = await charactersApi.listCharacters();
  const charactersById = byId(characters);

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
            chapterTitle: quoteChapter ? shortChapterTitle(quoteChapter.title) : undefined,
          }
        : undefined;

      // Only surface a relationship when the character genuinely feels something
      // strong toward someone — skip 平淡(neutral) / 故舊(acquaintance), and pick the
      // strongest tie by weight rather than whatever edge happened to be first.
      const edges = await relationshipsApi.listOutgoingEdges(character.id);
      const strongEdge = edges
        .filter((e) => e.tone && e.tone !== 'neutral' && e.tone !== 'acquaintance')
        .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))[0];
      const target = strongEdge ? charactersById.get(strongEdge.toId) : null;
      const tension =
        strongEdge && target ? { targetName: target.name, label: strongEdge.label } : undefined;

      const subscribers = await subscriptionsApi.listSubscribers(character.id);
      const subscriberWallets = uniqueWallets(
        subscribers
          .filter((s) => !s.isOwner)
          .map((s) => s.wallet)
          .filter(Boolean)
          .filter((wallet) => !sameWallet(wallet, character.nftOwner))
      );
      const readerCount = subscriberWallets.length + 1;

      return {
        character,
        quote,
        tension,
        initialSubscriberCount: readerCount,
        subscriberWallets,
        initialSubscribed: false,
        isOwner: false,
        nextPovHint: magnetism?.nextPovHint,
      };
    })
  );

  return (
    <CharacterGrid
      cards={cards}
      filter={filter}
      internalSagaId={DEMO_SAGA_ID}
    />
  );
}

function uniqueWallets(wallets: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const wallet of wallets) {
    const key = wallet.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(wallet);
  }
  return out;
}

function sameWallet(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
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
  // inside its own Suspense, only when the memories tab is open (see below).
  // Chain characters: 參與的回 = event cuts (metadata-only, cached); the old
  // listPublicChaptersForSubscription path re-read up to 12 POV bodies from
  // Walrus per dossier visit just to build cards — kept only as the mock
  // fallback for demo-slug characters.
  const isChainCharacter = isSuiObjectId(character.id);
  const [
    allCharacters,
    edges,
    incomingEdges,
    chapters,
    sagaCuts,
    interventions,
    soulSongs,
    persona,
    sagaName,
    chainPovChapters,
    reflections,
    appearance,
  ] = await Promise.all([
    charactersApi.listCharacters(),
    relationshipsApi.listOutgoingEdges(character.id),
    relationshipsApi.listIncomingEdges(character.id),
    isChainCharacter
      ? Promise.resolve([])
      : chaptersApi.listPublicChaptersForSubscription(character.id),
    isChainCharacter && character.sagaId
      ? cutsApi.listEventCuts(character.sagaId).catch(() => [])
      : Promise.resolve([]),
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
    // withTeaser: server-extract a first-paragraph preview per chapter so the
    // locked card can show an opening taste + fade without ever shipping the
    // full body to non-subscribers (the gate stays the real wallet gate).
    fetchPovChaptersForCharacter(character.id, { limit: 5, withTeaser: true }),
    // Reflections from reflection.move. Owner sees full body; non-owners
    // see only metadata (mode + timestamp + chain anchor).
    fetchReflectionsForCharacter(character.id, { limit: 8 }),
    // 形貌 description (content road, own subject) — only needed by 設定集·形貌,
    // so skip the chain read on other tabs. null → caption falls back to facts.
    tab === 'gallery' ? appearanceApi.getAppearance(character.id) : Promise.resolve(null),
  ]);
  const charactersById = byId(allCharacters);
  // 關係對象可能是名冊外的江湖角色（不在 listCharacters 裡）——補抓，
  // 否則關係欄會顯示原始 id 而不是名字。
  const partnerIds = new Set([
    ...edges.map((e) => e.toId),
    ...incomingEdges.map((e) => e.fromId),
  ]);
  const missingPartners = await Promise.all(
    [...partnerIds]
      .filter((pid) => pid !== character.id && !charactersById.has(pid))
      .map((pid) => charactersApi.getCharacter(pid)),
  );
  for (const partner of missingPartners) {
    if (partner) charactersById.set(partner.id, partner);
  }
  const personaRegenChapter = persona?.lastRegenChapterId
    ? (await chaptersApi.getChapter(persona.lastRegenChapterId)) ?? null
    : null;
  // 當下心事 — the character's live wants (drives behind their current intent).
  const currentWants =
    tab === 'profile' && character.sagaId
      ? await getCharacterWants(character.sagaId, character.id).catch(() => [])
      : [];

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
                incomingEdges={incomingEdges}
                charactersById={charactersById}
                wants={currentWants}
              />
            ) : null}
            {tab === 'gallery' ? (
              <GalleryTab
                character={character}
                isOwner={viewerWallet === character.nftOwner}
                appearanceDesc={appearance?.description ?? null}
              />
            ) : null}
            {tab === 'shop' ? <ShopTab character={character} /> : null}
            {tab === 'chapters' ? (
              <>
                <ChaptersTab
                  chapters={chapters}
                  character={character}
                  chainPovChapters={chainPovChapters}
                  participatedCuts={sagaCuts.filter((c) =>
                    c.povCharacterIds.includes(character.id),
                  )}
                />
                <PovTriggerButton characterId={character.id} />
              </>
            ) : null}
            {tab === 'memories' ? (
              // Real (MemWal-configured) memories are cap-gated: the browser
              // verifies the connected wallet holds the OwnerCap and decrypts
              // locally via seal_approve_owner — the server hands out
              // ciphertext only. The spoofable `?as=` viewerWallet is never
              // consulted on this path; it survives only in the mock fallback
              // below (demo fixtures, nothing private).
              isMemoryConfigured() ? (
                <MemoriesTabClient
                  character={character}
                  sagaCharacters={allCharacters}
                  suiNetwork={sealNetwork()}
                />
              ) : (
                <Suspense fallback={<MemoriesTabSkeleton />}>
                  <MemoriesTabLoader
                    character={character}
                    viewerWallet={viewerWallet}
                    sagaCharacters={allCharacters}
                  />
                </Suspense>
              )
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
 * SEAL recall for current mood / next plan; isolating it here lets the header (portrait
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
 * Lazy loader for the memories tab — MOCK / http fallback only (used when
 * MemWal isn't configured). Real memories never pass through here: they go
 * ciphertext-only via /api/memories/encrypted and decrypt in the browser
 * against the viewer's OwnerCap (MemoriesTabClient). The `?as=`-derived
 * viewerWallet below therefore gates nothing but demo fixtures.
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
      isOwner={viewerWallet != null && viewerWallet === character.nftOwner}
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
