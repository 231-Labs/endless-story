'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useCurrentAccount } from '@mysten/dapp-kit';
import type { Character } from '@endless-story/shared';
import { characterPortraitTone } from '@/components/common/CharacterPortrait';
import { BlobImage } from '@/components/common/BlobImage';
import { FlowIndicator, useFlowingIndicator } from '@/components/common/ink-motion';

export type DossierTab = 'profile' | 'gallery' | 'chapters' | 'shop' | 'memories' | 'entrusts';

/** 記憶 / 託夢 are owner-only surfaces (private memory + dream intervention), so they
 *  only appear in the menu for the connected OwnerCap holder. The rest are public. */
const OWNER_ONLY_TABS = new Set<DossierTab>(['memories', 'entrusts']);

const TABS: { key: DossierTab; label: string }[] = [
  { key: 'profile', label: '履歷' },
  { key: 'gallery', label: '設定集' },
  { key: 'chapters', label: '章回' },
  { key: 'shop', label: '戲坊' },
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
  // Owner gate is client-side (real connected wallet), never the spoofable ?as= param.
  const account = useCurrentAccount();
  const isOwner = !!account && account.address === character.nftOwner;
  const visibleTabs = TABS.filter((tab) => isOwner || !OWNER_ONLY_TABS.has(tab.key));
  const { containerRef, box } = useFlowingIndicator<HTMLDivElement>(active);

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
        <div ref={containerRef} className="no-scrollbar relative flex items-center gap-1 overflow-x-auto px-1">
          <FlowIndicator box={box} />
          {visibleTabs.map((tab) => {
            const isActive = tab.key === active;
            return (
              <Link
                key={tab.key}
                href={{ pathname: '/dossier', query: { id: character.id, tab: tab.key } }}
                scroll={false}
                data-flow-key={tab.key}
                aria-current={isActive ? 'page' : undefined}
                className={`relative z-10 flex items-center justify-center rounded-full px-4 py-2 text-sm font-medium tracking-wide transition-colors ${
                  isActive ? 'text-canvas' : 'text-ink/65 hover:text-ink'
                }`}
              >
                {tab.label}
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
  const portraitUrl = character.gallery.anchor?.imageUrl;
  return (
    <div
      aria-hidden={!visible}
      className={`flex items-center gap-2.5 overflow-hidden transition-all duration-300 ${
        visible ? 'max-w-[180px] opacity-100' : 'pointer-events-none max-w-0 opacity-0'
      }`}
    >
      <div className="py-0.5 pl-0.5">
        {/* Real portrait when we have one; the tinted name-initial stays as the
            fallback layer beneath (BlobImage renders null on missing/failed src). */}
        <span className={`relative flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full ring-1 ${tone.bg} ${tone.ring}`}>
          <span className={`font-serif text-sm leading-none ${tone.text}`}>{character.name[0]}</span>
          {portraitUrl ? (
            <BlobImage
              src={portraitUrl}
              alt={character.name}
              sizes="28px"
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : null}
        </span>
      </div>
      <span className="whitespace-nowrap font-serif text-sm leading-normal text-ink pr-2">{character.name}</span>
    </div>
  );
}
