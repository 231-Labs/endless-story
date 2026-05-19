'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { Character, CharacterRole } from '@endless-story/shared';

export type DossierTab = 'profile' | 'gallery' | 'chapters' | 'entrusts';

const TABS: { key: DossierTab; label: string }[] = [
  { key: 'profile', label: '履歷' },
  { key: 'gallery', label: '設定集' },
  { key: 'chapters', label: '連載' },
  { key: 'entrusts', label: '託夢' },
];

const MINI_TONE_BY_ROLE: Record<CharacterRole, { bg: string; ring: string; text: string }> = {
  班主: { bg: 'bg-stone-100', ring: 'ring-stone-200', text: 'text-stone-400' },
  青衣: { bg: 'bg-rose-50', ring: 'ring-rose-100', text: 'text-rose-300' },
  花旦: { bg: 'bg-pink-50', ring: 'ring-pink-100', text: 'text-pink-300' },
  小生: { bg: 'bg-indigo-50', ring: 'ring-indigo-100', text: 'text-indigo-300' },
  武旦: { bg: 'bg-amber-50', ring: 'ring-amber-100', text: 'text-amber-400' },
  老旦: { bg: 'bg-stone-100', ring: 'ring-stone-200', text: 'text-stone-400' },
  丑: { bg: 'bg-neutral-100', ring: 'ring-neutral-200', text: 'text-neutral-400' },
  樂師: { bg: 'bg-emerald-50', ring: 'ring-emerald-100', text: 'text-emerald-300' },
  箱管: { bg: 'bg-sky-50', ring: 'ring-sky-100', text: 'text-sky-300' },
  學徒: { bg: 'bg-yellow-50', ring: 'ring-yellow-100', text: 'text-yellow-400' },
  看客: { bg: 'bg-zinc-100', ring: 'ring-zinc-200', text: 'text-zinc-400' },
};

export function DossierTabs({
  character,
  active,
}: {
  character: Character;
  active: DossierTab;
}) {
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const target = document.getElementById('dossier-portrait');
    if (!target) return;
    const observer = new IntersectionObserver(
      ([entry]) => setStuck(!entry.isIntersecting),
      { threshold: 0 }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  return (
    <nav className="sticky top-[57px] z-30 border-b border-hairline bg-canvas/85 backdrop-blur supports-[backdrop-filter]:bg-canvas/70 sm:top-[65px]">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-5 sm:gap-6 sm:px-10">
        <MiniAvatar character={character} visible={stuck} />
        <div className="no-scrollbar flex h-full flex-1 items-center gap-6 overflow-x-auto sm:gap-10">
          {TABS.map((tab) => {
            const isActive = tab.key === active;
            return (
              <Link
                key={tab.key}
                href={{ pathname: '/dossier', query: { id: character.id, tab: tab.key } }}
                className={`relative flex h-full items-center whitespace-nowrap text-sm tracking-wide transition-colors ${
                  isActive ? 'text-ink' : 'text-mute hover:text-ink'
                }`}
              >
                {tab.label}
                {isActive ? (
                  <span className="absolute inset-x-0 bottom-0 h-0.5 bg-cinnabar" />
                ) : null}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

function MiniAvatar({ character, visible }: { character: Character; visible: boolean }) {
  const tone = MINI_TONE_BY_ROLE[character.role] ?? MINI_TONE_BY_ROLE['班主'];
  return (
    <div
      aria-hidden={!visible}
      className={`flex items-center gap-2 overflow-hidden transition-all duration-300 ${
        visible ? 'max-w-[180px] opacity-100' : 'pointer-events-none max-w-0 opacity-0'
      }`}
    >
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-1 ${tone.bg} ${tone.ring}`}>
        <span className={`font-serif text-base leading-none ${tone.text}`}>{character.name[0]}</span>
      </span>
      <span className="font-serif text-sm leading-none whitespace-nowrap text-ink">{character.name}</span>
    </div>
  );
}
