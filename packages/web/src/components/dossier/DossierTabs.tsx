'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { Character } from '@endless-story/shared';
import { characterPortraitTone } from '@/components/common/CharacterPortrait';

export type DossierTab = 'profile' | 'gallery' | 'chapters' | 'entrusts';

const TABS: { key: DossierTab; label: string }[] = [
  { key: 'profile', label: '履歷' },
  { key: 'gallery', label: '設定集' },
  { key: 'chapters', label: '連載' },
  { key: 'entrusts', label: '託夢' },
];

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
    <nav className="sticky top-[57px] z-30 border-b border-hairline bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/90 sm:top-[65px]">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-5 sm:gap-6 sm:px-10">
        <MiniAvatar character={character} visible={stuck} />
        <div className="no-scrollbar flex h-full flex-1 items-center gap-6 overflow-x-auto sm:gap-10">
          {TABS.map((tab) => {
            const isActive = tab.key === active;
            return (
              <Link
                key={tab.key}
                href={{ pathname: '/dossier', query: { id: character.id, tab: tab.key } }}
                className={`relative flex h-full items-center whitespace-nowrap text-sm font-medium leading-none tracking-wide transition-colors ${
                  isActive ? 'text-ink' : 'text-ink/65 hover:text-ink'
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
  const tone = characterPortraitTone(character.role);
  return (
    <div
      aria-hidden={!visible}
      className={`flex h-full items-center gap-2 overflow-hidden transition-all duration-300 ${
        visible ? 'max-w-[180px] opacity-100' : 'pointer-events-none max-w-0 opacity-0'
      }`}
    >
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-1 ${tone.bg} ${tone.ring}`}>
        <span className={`font-serif text-base leading-none ${tone.text}`}>{character.name[0]}</span>
      </span>
      <span className="whitespace-nowrap font-serif text-sm leading-normal text-ink">{character.name}</span>
    </div>
  );
}
