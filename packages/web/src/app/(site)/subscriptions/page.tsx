import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { charactersApi, subscriptionsApi } from '@/lib/api/index';
import { SiteNav } from '@/components/home/SiteNav';
import { CharacterPortrait } from '@/components/common/CharacterPortrait';
import { DEMO_OWNERS } from '@/mocks/characters';
import { DEMO_VIEWER_WALLET } from '@/mocks/subscriptions';
import { formatDate, truncateAddress } from '@/lib/format';
import type { Subscription, SubscriptionChannel } from '@endless-story/shared';

export const metadata = { title: '我的訂閱' };

const CHANNEL_LABEL: Record<SubscriptionChannel, string> = {
  in_app: '站內',
  rss: 'RSS',
  webpush: '推播',
};

const PERSONA_LABEL: Record<string, string> = {
  [DEMO_OWNERS.OWNER_A]: '班主視角',
  [DEMO_VIEWER_WALLET]: '看客視角',
};

function resolveViewerWallet(raw: string | undefined): string | null {
  if (raw === 'viewer') return DEMO_VIEWER_WALLET;
  if (raw === 'none') return null;
  return raw ?? DEMO_OWNERS.OWNER_A;
}

async function cancelSubscription(formData: FormData) {
  'use server';
  const wallet = formData.get('wallet');
  const characterId = formData.get('characterId');
  if (typeof wallet !== 'string' || typeof characterId !== 'string') return;
  await subscriptionsApi.unsubscribe(wallet, characterId);
  revalidatePath('/subscriptions');
}

export default async function SubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ as?: string }>;
}) {
  const params = await searchParams;
  const viewerWallet = resolveViewerWallet(params.as);

  if (!viewerWallet) {
    return (
      <main className="min-h-screen">
        <SiteNav />
        <section className="mx-auto max-w-3xl px-5 py-20 text-center sm:px-10">
          <p className="font-serif text-2xl text-ink">尚未連結錢包</p>
          <p className="mt-4 text-sm text-mute">請先從右上選單切換到一個視角。</p>
        </section>
      </main>
    );
  }

  const [subscriptions, allCharacters] = await Promise.all([
    subscriptionsApi.listMySubscriptions(viewerWallet),
    charactersApi.listCharacters(),
  ]);
  const charactersById = new Map(allCharacters.map((c) => [c.id, c]));
  // 訂閱對象不一定在 listCharacters 裡（江湖角色 / 鏈讀部分失敗）——逐筆補抓，
  // 否則「N 筆」的計數會和下方列表對不上。
  await Promise.all(
    subscriptions
      .filter((s) => !charactersById.has(s.characterId))
      .map(async (s) => {
        const c = await charactersApi.getCharacter(s.characterId).catch(() => null);
        if (c) charactersById.set(c.id, c);
      }),
  );

  // 只計入真的渲染得出來的訂閱，標題數字才不會說謊。
  const renderable = subscriptions.filter((s) => charactersById.has(s.characterId));
  const owned = renderable.filter((s) => s.isOwner);
  const following = renderable
    .filter((s) => !s.isOwner)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const personaLabel = PERSONA_LABEL[viewerWallet] ?? truncateAddress(viewerWallet);
  // 沒帶 ?as= 時是預設示範身份，不是訪客真的連上了錢包 — 要對用戶誠實。
  const isDemoPersona = params.as == null || PERSONA_LABEL[viewerWallet] != null;

  return (
    <main className="min-h-screen">
      <SiteNav />
      <section className="mx-auto max-w-4xl px-5 py-12 sm:px-10 sm:py-16">
        <header className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <p className="text-2xs tracking-widest text-mute">我的訂閱</p>
            <h1 className="mt-2 font-serif text-3xl text-ink sm:text-4xl">
              {following.length + owned.length} 筆
            </h1>
          </div>
          <p className="text-2xs tracking-widest text-mute">
            {personaLabel} · <span className="font-mono">{truncateAddress(viewerWallet)}</span>
          </p>
        </header>
        {isDemoPersona ? (
          <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-hairline/70 bg-surface/60 px-3.5 py-1.5 text-2xs tracking-widest text-mute">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-jade/70" />
            示範視角 — 正式版將以你連接的錢包身分顯示訂閱
          </p>
        ) : null}

        {following.length > 0 ? (
          <section className="mt-12">
            <h2 className="text-2xs tracking-widest text-mute">追訂中</h2>
            <ul className="mt-5 space-y-4">
              {following.map((sub) => {
                const character = charactersById.get(sub.characterId);
                if (!character) return null;
                return (
                  <li key={sub.characterId}>
                    <SubscriptionRow
                      subscription={sub}
                      characterName={character.name}
                      characterRole={character.role}
                      characterId={character.id}
                      characterAnchor={character}
                      wallet={viewerWallet}
                      cancellable
                    />
                  </li>
                );
              })}
            </ul>
          </section>
        ) : (
          <section className="mt-12">
            <h2 className="text-2xs tracking-widest text-mute">追訂中</h2>
            <p className="mt-5 text-sm text-mute">
              你還沒追任何角色。去
              <Link
                href={{ pathname: '/dossier', query: params.as ? { as: params.as } : {} }}
                className="mx-1 border-b border-cinnabar/40 text-cinnabar transition-colors hover:border-cinnabar"
              >
                班底名冊
              </Link>
              逛逛。
            </p>
          </section>
        )}

        {owned.length === 0 ? (
          <section className="mt-16">
            <h2 className="text-2xs tracking-widest text-mute">持有（自動訂閱）</h2>
            <p className="mt-5 text-sm leading-relaxed text-mute">
              還沒持有任何角色。持有角色 NFT 即擁有這條 IP，並自動訂閱其視角章回 — 留意首頁的
              <Link
                href="/#recruitment-section"
                className="mx-1 border-b border-cinnabar/40 text-cinnabar transition-colors hover:border-cinnabar"
              >
                徵召公告
              </Link>
              。
            </p>
          </section>
        ) : (
          <section className="mt-16">
            <h2 className="text-2xs tracking-widest text-mute">持有（自動訂閱）</h2>
            <ul className="mt-5 space-y-4">
              {owned.map((sub) => {
                const character = charactersById.get(sub.characterId);
                if (!character) return null;
                return (
                  <li key={sub.characterId}>
                    <SubscriptionRow
                      subscription={sub}
                      characterName={character.name}
                      characterRole={character.role}
                      characterId={character.id}
                      characterAnchor={character}
                      wallet={viewerWallet}
                      cancellable={false}
                    />
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </section>
    </main>
  );
}

function SubscriptionRow({
  subscription,
  characterName,
  characterRole,
  characterId,
  characterAnchor,
  wallet,
  cancellable,
}: {
  subscription: Subscription;
  characterName: string;
  characterRole: string;
  characterId: string;
  characterAnchor: Parameters<typeof CharacterPortrait>[0]['character'];
  wallet: string;
  cancellable: boolean;
}) {
  return (
    <article className="es-soft-panel flex items-center gap-4 p-3 sm:gap-5 sm:p-4">
      <Link
        href={{ pathname: '/dossier', query: { id: characterId } }}
        className="block w-16 shrink-0 transition-opacity hover:opacity-80 sm:w-20"
        aria-label={`查看 ${characterName}`}
      >
        <CharacterPortrait character={characterAnchor} aspect="1/1" sizes="80px" />
      </Link>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <Link
            href={{ pathname: '/dossier', query: { id: characterId } }}
            className="font-serif text-lg text-ink transition-colors hover:text-cinnabar sm:text-xl"
          >
            {characterName}
          </Link>
          <span className="text-2xs tracking-widest text-mute">{characterRole}</span>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs tracking-widest text-mute">
          <span>自 {formatDate(subscription.createdAt)}</span>
          <span className="text-hairline">·</span>
          <span>{CHANNEL_LABEL[subscription.channel]}</span>
          {!cancellable ? (
            <>
              <span className="text-hairline">·</span>
              <span className="text-jade">持有</span>
            </>
          ) : null}
        </div>
      </div>

      {cancellable ? (
        <form action={cancelSubscription} className="shrink-0">
          <input type="hidden" name="wallet" value={wallet} />
          <input type="hidden" name="characterId" value={characterId} />
          <button
            type="submit"
            className="rounded border border-hairline px-3 py-1.5 text-2xs tracking-widest text-mute transition-colors hover:border-cinnabar/40 hover:text-cinnabar"
          >
            取消訂閱
          </button>
        </form>
      ) : null}
    </article>
  );
}
