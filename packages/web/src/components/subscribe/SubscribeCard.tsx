'use client';

import { useEffect, useState, useTransition, type MouseEvent } from 'react';
import Link from 'next/link';
import { useCurrentAccount, useSignAndExecuteTransaction, useSuiClient } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { tx as endlessTx } from '@endless-story/sdk';
import { useToast } from '@/components/common/Toaster';
import { BlobImage } from '@/components/common/BlobImage';
import type { Character } from '@endless-story/shared';

const SUI_ID_RE = /^0x[0-9a-fA-F]{64}$/;

interface SignatureQuoteView {
  text: string;
  chapterId?: string;
  chapterTitle?: string;
}

interface TensionView {
  targetName: string;
  label: string;
}

export function SubscribeCard({
  character,
  quote,
  tension,
  initialSubscriberCount,
  initialSubscribed,
  isOwner,
  nextPovHint,
}: {
  character: Character;
  quote?: SignatureQuoteView;
  tension?: TensionView;
  initialSubscriberCount: number;
  initialSubscribed: boolean;
  isOwner: boolean;
  nextPovHint?: string;
}) {
  const [subscribed, setSubscribed] = useState(initialSubscribed);
  const [count, setCount] = useState(initialSubscriberCount);
  const [isPending, startTransition] = useTransition();
  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();
  const toast = useToast();

  useEffect(() => {
    setSubscribed(initialSubscribed);
  }, [initialSubscribed]);

  useEffect(() => {
    setCount(initialSubscriberCount);
  }, [initialSubscriberCount]);

  // 鏈上角色（Sui object id）→ 真 subscribe::subscribe 交易；
  // 示範角色（mock slug）→ 本地示意 + 明示「尚未上鏈」，不假裝成功。
  const isChainCharacter = SUI_ID_RE.test(character.id);

  const toggle = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isOwner || isPending) return;

    if (!isChainCharacter) {
      const next = !subscribed;
      setSubscribed(next);
      setCount((c) => c + (next ? 1 : -1));
      toast(next ? `已追訂 ${character.name}（示範角色，尚未上鏈）` : `已取消追訂 ${character.name}`);
      return;
    }

    if (subscribed) return; // 鏈上取消訂閱尚未開放
    if (!account) {
      toast('請先從右上角連接錢包，才能訂閱上鏈', 'error');
      return;
    }
    const txb = new Transaction();
    txb.add(endlessTx.subscribe.subscribe({ character: character.id }));
    startTransition(() => {
      signAndExecute(
        { transaction: txb },
        {
          onSuccess: async (res) => {
            try {
              await suiClient.waitForTransaction({ digest: res.digest });
              setSubscribed(true);
              setCount((c) => c + 1);
              toast(`已訂閱 ${character.name} 的視角章回`, 'success');
            } catch {
              toast('訂閱已送出，鏈上確認稍慢 — 稍後重整看看', 'info');
            }
          },
          onError: (err) => toast(`訂閱沒成：${err.message}`, 'error'),
        },
      );
    });
  };

  return (
    <article className="group relative isolate aspect-[3/4] overflow-hidden rounded-lg ring-1 ring-hairline transition-shadow hover:shadow-lg hover:shadow-ink/5">
      {/* Background — on-chain portrait (Walrus URL) if minted, else typographic
          poster fallback. The image is large-area so the gradient overlay below
          still preserves text legibility at the bottom. */}
      {/* 水墨海報恆常墊底；肖像載入前/失敗（BlobImage → null）時就是這張未乾的墨底。
          字形是浮水印，必須留在最底層 — 肖像（後面的 absolute 兄弟）會整片蓋掉它。 */}
      <div className="es-ink-wash absolute inset-0 flex items-center justify-center overflow-hidden">
        <span
          className="font-serif leading-none text-ink/[0.16]"
          style={{ fontSize: '11rem', transform: 'translateY(-8%)' }}
        >
          {character.name[0]}
        </span>
      </div>
      {character.gallery?.anchor?.imageUrl ? (
        <BlobImage
          src={character.gallery.anchor.imageUrl}
          alt={character.name}
          sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : null}

      {/* Clickable overlay → dossier (z-10) */}
      <Link
        href={{ pathname: '/dossier', query: { id: character.id } }}
        aria-label={`查看 ${character.name}`}
        className="absolute inset-0 z-10"
      >
        <span className="sr-only">{character.name}</span>
      </Link>

      {/* Top-left: subscriber count pill */}
      <div className="pointer-events-none absolute left-3 top-3 z-[11] rounded-full bg-surface/85 px-2.5 py-0.5 text-2xs tracking-widest text-ink/75 backdrop-blur">
        {count} 人在讀
      </div>

      {/* Top-right: subscribe action pill */}
      <div className="absolute right-3 top-3 z-[11]">
        {isOwner ? (
          <span className="rounded-full bg-surface/85 px-3 py-1 text-2xs tracking-widest text-mute backdrop-blur">
            你的
          </span>
        ) : (
          <button
            type="button"
            onClick={toggle}
            disabled={isPending}
            className={`rounded-full px-3.5 py-1.5 text-2xs tracking-widest backdrop-blur transition-colors disabled:cursor-wait disabled:opacity-60 ${
              subscribed
                ? 'bg-surface/85 text-ink/70 hover:text-cinnabar'
                : 'bg-cinnabar/90 text-canvas hover:bg-seal'
            }`}
          >
            {isPending ? '上鏈中…' : subscribed ? '已訂閱' : '訂閱'}
          </button>
        )}
      </div>

      {/* Bottom: gradient + content overlay (pointer-events-none so card-link still receives clicks) */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] bg-gradient-to-t from-canvas via-canvas/95 to-transparent p-5 pt-20 sm:p-6 sm:pt-24">
        <p className="text-2xs tracking-widest text-mute">{character.role}</p>
        <h3 className="mt-1 font-serif text-2xl text-ink sm:text-3xl">{character.name}</h3>

        {/* Hover-reveal block — 觸控裝置（無 hover）直接常駐顯示 */}
        <div className="mt-3 max-h-0 overflow-hidden opacity-0 transition-all duration-300 group-hover:max-h-48 group-hover:opacity-100 [@media(hover:none)]:max-h-48 [@media(hover:none)]:opacity-100">
          {quote ? (
            <blockquote className="border-l-2 border-cinnabar/40 pl-3">
              <p className="font-serif text-[13.5px] leading-relaxed text-ink/80">
                「{quote.text}」
              </p>
              {quote.chapterTitle ? (
                <p className="mt-1 text-2xs tracking-widest text-mute">
                  ─ {quote.chapterTitle}
                </p>
              ) : null}
            </blockquote>
          ) : null}

          {tension ? (
            <p className="mt-3 text-2xs tracking-widest text-mute">
              {tension.label} · <span className="font-serif text-ink">{tension.targetName}</span>
            </p>
          ) : null}

          {nextPovHint ? (
            <p className="mt-3 text-2xs tracking-widest text-mute">
              下一篇 · {nextPovHint}
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}
