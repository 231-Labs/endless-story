'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useCurrentAccount } from '@mysten/dapp-kit';
import type { Character, Subscription, SubscriptionChannel } from '@endless-story/shared';
import { CharacterPortrait } from '@/components/common/CharacterPortrait';
import { UnsubscribeButton } from '@/components/subscribe/UnsubscribeButton';
import {
  cancelMockSubscription,
  getMySubscriptionsPageData,
  type SubscriptionsPageData,
} from '@/lib/actions/subscriptions-page';
import { USE_MOCK } from '@/lib/api/config';
import { isSuiObjectId } from '@/lib/chain/character-read';
import { formatDate, truncateAddress } from '@/lib/format';

const CHANNEL_LABEL: Record<SubscriptionChannel, string> = {
  in_app: '站內',
  rss: 'RSS',
  webpush: '推播',
};

export function SubscriptionsContent() {
  const account = useCurrentAccount();
  const wallet = account?.address ?? null;

  const [data, setData] = useState<SubscriptionsPageData | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  const refetch = useCallback(() => setRefreshTick((t) => t + 1), []);

  useEffect(() => {
    if (!wallet) {
      setData(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    getMySubscriptionsPageData(wallet)
      .then((next) => {
        if (!cancelled) setData(next);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [wallet, refreshTick]);

  if (!wallet) {
    return (
      <section className="mx-auto max-w-3xl px-5 py-20 text-center sm:px-10">
        <p className="font-serif text-2xl text-ink">尚未連結錢包</p>
        <p className="mt-4 text-sm text-mute">請先從右上選單連接錢包，再查看你的訂閱。</p>
      </section>
    );
  }

  if (loading && !data) {
    return <SubscriptionsSkeleton />;
  }

  const charactersById = new Map((data?.characters ?? []).map((c) => [c.id, c]));
  const subscriptions = data?.subscriptions ?? [];
  const renderable = subscriptions.filter((s) => charactersById.has(s.characterId));
  const owned = renderable.filter((s) => s.isOwner);
  const following = renderable
    .filter((s) => !s.isOwner)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const isChainWallet = isSuiObjectId(wallet);

  return (
    <section className="mx-auto max-w-4xl px-5 py-12 sm:px-10 sm:py-16">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="text-2xs tracking-widest text-mute">我的訂閱</p>
          <h1 className="mt-2 font-serif text-3xl text-ink sm:text-4xl">
            {following.length + owned.length} 筆
          </h1>
        </div>
        <p className="text-2xs tracking-widest text-mute">
          <span className="font-mono">{truncateAddress(wallet)}</span>
        </p>
      </header>

      {USE_MOCK ? (
        <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-hairline/70 bg-surface/60 px-3.5 py-1.5 text-2xs tracking-widest text-mute">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-jade/70" />
          示範資料 — 連接鏈上錢包後讀取真實訂閱
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
                <li key={sub.subscriptionId ?? sub.characterId}>
                  <SubscriptionRow
                    subscription={sub}
                    character={character}
                    wallet={wallet}
                    useChainUnsubscribe={isChainWallet && !!sub.subscriptionId}
                    onUnsubscribed={refetch}
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
              href="/dossier"
              className="mx-1 border-b border-cinnabar/40 text-cinnabar transition-colors hover:border-cinnabar"
            >
              班底名冊
            </Link>
            逛逛，或在角色頁點「訂閱」。
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
                    character={character}
                    wallet={wallet}
                    useChainUnsubscribe={false}
                    onUnsubscribed={refetch}
                  />
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </section>
  );
}

function SubscriptionRow({
  subscription,
  character,
  wallet,
  useChainUnsubscribe,
  onUnsubscribed,
}: {
  subscription: Subscription;
  character: Character;
  wallet: string;
  useChainUnsubscribe: boolean;
  onUnsubscribed: () => void;
}) {
  const cancellable = !subscription.isOwner;

  return (
    <article className="es-soft-panel flex items-center gap-4 p-3 sm:gap-5 sm:p-4">
      <Link
        href={{ pathname: '/dossier', query: { id: character.id } }}
        className="block w-16 shrink-0 transition-opacity hover:opacity-80 sm:w-20"
        aria-label={`查看 ${character.name}`}
      >
        <CharacterPortrait character={character} aspect="1/1" sizes="80px" />
      </Link>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <Link
            href={{ pathname: '/dossier', query: { id: character.id } }}
            className="font-serif text-lg text-ink transition-colors hover:text-cinnabar sm:text-xl"
          >
            {character.name}
          </Link>
          <span className="text-2xs tracking-widest text-mute">{character.role}</span>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs tracking-widest text-mute">
          <span>自 {formatDate(subscription.createdAt)}</span>
          <span className="text-hairline">·</span>
          <span>{CHANNEL_LABEL[subscription.channel]}</span>
          {subscription.isOwner ? (
            <>
              <span className="text-hairline">·</span>
              <span className="text-jade">持有</span>
            </>
          ) : null}
        </div>
      </div>

      {cancellable && useChainUnsubscribe && subscription.subscriptionId ? (
        <UnsubscribeButton
          subscriptionId={subscription.subscriptionId}
          characterId={character.id}
          characterName={character.name}
          expectedWallet={wallet}
          onComplete={onUnsubscribed}
        />
      ) : cancellable ? (
        <MockUnsubscribeForm
          wallet={wallet}
          characterId={character.id}
          onUnsubscribed={onUnsubscribed}
        />
      ) : null}
    </article>
  );
}

function MockUnsubscribeForm({
  wallet,
  characterId,
  onUnsubscribed,
}: {
  wallet: string;
  characterId: string;
  onUnsubscribed: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          const fd = new FormData();
          fd.set('wallet', wallet);
          fd.set('characterId', characterId);
          await cancelMockSubscription(fd);
          onUnsubscribed();
        });
      }}
      className="shrink-0 rounded border border-hairline px-3 py-1.5 text-2xs tracking-widest text-mute transition-colors hover:border-cinnabar/40 hover:text-cinnabar disabled:opacity-50"
    >
      {isPending ? '取消中…' : '取消訂閱'}
    </button>
  );
}

function SubscriptionsSkeleton() {
  return (
    <section className="mx-auto max-w-4xl px-5 py-12 sm:px-10 sm:py-16" aria-hidden>
      <div className="animate-pulse space-y-8">
        <div className="h-10 w-48 rounded bg-hairline/40" />
        <div className="h-4 w-64 rounded bg-hairline/30" />
        <div className="space-y-4 pt-8">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-2xl bg-hairline/25" />
          ))}
        </div>
      </div>
    </section>
  );
}
