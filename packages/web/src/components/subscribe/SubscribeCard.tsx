'use client';

import { useState, type MouseEvent } from 'react';
import Link from 'next/link';
import type { Character, CharacterRole } from '@endless-story/shared';

interface SignatureQuoteView {
  text: string;
  chapterId?: string;
  chapterTitle?: string;
}

interface TensionView {
  targetName: string;
  label: string;
}

const TONE_BY_ROLE: Record<CharacterRole, { bg: string; text: string }> = {
  班主: { bg: 'bg-stone-100', text: 'text-stone-300' },
  青衣: { bg: 'bg-rose-50', text: 'text-rose-200' },
  花旦: { bg: 'bg-pink-50', text: 'text-pink-200' },
  小生: { bg: 'bg-indigo-50', text: 'text-indigo-200' },
  武旦: { bg: 'bg-amber-50', text: 'text-amber-300' },
  老旦: { bg: 'bg-stone-100', text: 'text-stone-300' },
  丑: { bg: 'bg-neutral-100', text: 'text-neutral-300' },
  樂師: { bg: 'bg-emerald-50', text: 'text-emerald-200' },
  箱管: { bg: 'bg-sky-50', text: 'text-sky-200' },
  學徒: { bg: 'bg-yellow-50', text: 'text-yellow-300' },
  看客: { bg: 'bg-zinc-100', text: 'text-zinc-300' },
};

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
  const tone = TONE_BY_ROLE[character.role] ?? TONE_BY_ROLE['班主'];

  const toggle = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isOwner) return;
    const next = !subscribed;
    setSubscribed(next);
    setCount((c) => c + (next ? 1 : -1));
  };

  return (
    <article className="group relative aspect-[3/4] overflow-hidden rounded-lg ring-1 ring-hairline transition-shadow hover:shadow-lg hover:shadow-ink/5">
      {/* Background plate — large initial as typographic poster */}
      <div className={`absolute inset-0 flex items-center justify-center ${tone.bg}`}>
        <span
          className={`font-serif leading-none ${tone.text}`}
          style={{ fontSize: '11rem', transform: 'translateY(-8%)' }}
        >
          {character.name[0]}
        </span>
      </div>

      {/* Clickable overlay → dossier (z-10) */}
      <Link
        href={{ pathname: '/dossier', query: { id: character.id } }}
        aria-label={`查看 ${character.name}`}
        className="absolute inset-0 z-10"
      >
        <span className="sr-only">{character.name}</span>
      </Link>

      {/* Top-left: subscriber count pill */}
      <div className="pointer-events-none absolute left-3 top-3 z-20 rounded-full bg-canvas/75 px-2.5 py-0.5 text-2xs tracking-widest text-ink/75 backdrop-blur">
        {count} 人在讀
      </div>

      {/* Top-right: subscribe action pill */}
      <div className="absolute right-3 top-3 z-20">
        {isOwner ? (
          <span className="rounded-full bg-canvas/75 px-3 py-1 text-2xs tracking-widest text-mute backdrop-blur">
            你的
          </span>
        ) : (
          <button
            type="button"
            onClick={toggle}
            className={`rounded-full px-3.5 py-1 text-2xs tracking-widest backdrop-blur transition-colors ${
              subscribed
                ? 'bg-canvas/75 text-ink/70 hover:text-cinnabar'
                : 'bg-cinnabar/90 text-canvas hover:bg-seal'
            }`}
          >
            {subscribed ? '已訂閱' : '訂閱'}
          </button>
        )}
      </div>

      {/* Bottom: gradient + content overlay (pointer-events-none so card-link still receives clicks) */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-15 bg-gradient-to-t from-canvas via-canvas/95 to-transparent p-5 pt-20 sm:p-6 sm:pt-24">
        <p className="text-2xs tracking-widest text-mute">{character.role}</p>
        <h3 className="mt-1 font-serif text-2xl text-ink sm:text-3xl">{character.name}</h3>

        {/* Hover-reveal block */}
        <div className="mt-3 max-h-0 overflow-hidden opacity-0 transition-all duration-300 group-hover:max-h-48 group-hover:opacity-100">
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
              她在意 · <span className="font-serif text-ink">{tension.targetName}</span>
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
