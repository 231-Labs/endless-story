'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { Character } from '@endless-story/shared';
import { characterPortraitTone } from '@/components/common/CharacterPortrait';

export type DossierTab = 'profile' | 'gallery' | 'chapters' | 'memories' | 'entrusts';

const TABS: { key: DossierTab; label: string }[] = [
  { key: 'profile', label: '履歷' },
  { key: 'gallery', label: '設定集' },
  { key: 'chapters', label: '連載' },
  { key: 'memories', label: '記憶' },
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
      { threshold: 0, rootMargin: '-120px 0px 0px 0px' }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  return (
    <nav className="sticky top-[65px] z-30 border-b border-hairline bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/85 sm:top-[73px]">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-5 pt-1 sm:gap-6 sm:px-10">
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
                <span className="-translate-y-0.5">{tab.label}</span>
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
      className={`flex items-center gap-2.5 overflow-hidden transition-all duration-300 -translate-y-0.5 ${
        visible ? 'max-w-[180px] opacity-100' : 'pointer-events-none max-w-0 opacity-0'
      }`}
    >
      <div className="py-1 pl-1">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-1 ${tone.bg} ${tone.ring}`}>
          <span className={`font-serif text-sm leading-none ${tone.text}`}>{character.name[0]}</span>
        </span>
      </div>
      <span className="whitespace-nowrap font-serif text-sm leading-normal text-ink">{character.name}</span>
    </div>
  );
}
