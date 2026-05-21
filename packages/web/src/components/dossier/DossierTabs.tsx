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
    const target = document.getElementById('dossier-header');
    if (!target) return;
    const observer = new IntersectionObserver(
      ([entry]) => setStuck(!entry.isIntersecting),
      { threshold: 0.1 }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  return (
    <nav 
      className={`fixed bottom-8 left-1/2 z-50 -translate-x-1/2 transition-all duration-500 ease-out ${
        stuck ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0 pointer-events-none'
      }`}
    >
      <div className="flex items-center gap-2 rounded-full border border-hairline/30 bg-elevated/85 px-2 py-2 backdrop-blur-xl shadow-2xl supports-[backdrop-filter]:bg-elevated/60 dark:shadow-black/60">
        <div className="hidden sm:block pl-1">
          <MiniAvatar character={character} visible={true} />
        </div>
        <div className="hidden sm:block h-6 w-px bg-hairline/50 mx-1" />
        <div className="no-scrollbar flex items-center gap-1 overflow-x-auto px-1">
          {TABS.map((tab) => {
            const isActive = tab.key === active;
            return (
              <Link
                key={tab.key}
                href={{ pathname: '/dossier', query: { id: character.id, tab: tab.key } }}
                scroll={false}
                className={`relative flex items-center justify-center rounded-full px-4 py-2 text-sm font-medium tracking-wide transition-colors ${
                  isActive 
                    ? 'bg-ink text-canvas dark:bg-ink dark:text-canvas' 
                    : 'text-ink/65 hover:text-ink hover:bg-surface'
                }`}
              >
                <span>{tab.label}</span>
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
      className={`flex items-center gap-2.5 overflow-hidden transition-all duration-300 ${
        visible ? 'max-w-[180px] opacity-100' : 'pointer-events-none max-w-0 opacity-0'
      }`}
    >
      <div className="py-0.5 pl-0.5">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-1 ${tone.bg} ${tone.ring}`}>
          <span className={`font-serif text-sm leading-none ${tone.text}`}>{character.name[0]}</span>
        </span>
      </div>
      <span className="whitespace-nowrap font-serif text-sm leading-normal text-ink pr-2">{character.name}</span>
    </div>
  );
}
