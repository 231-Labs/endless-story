import Link from 'next/link';
import type {
  Character,
  CharacterMemory,
  CharacterMemoryKind,
  Chapter,
  MemoryProvenance,
} from '@endless-story/shared';
import { Linkified } from '@/components/common/CharacterLinkifier';
import { formatDate, shortChapterTitle, truncateAddress } from '@/lib/format';

const KIND_LABEL: Record<CharacterMemoryKind, string> = {
  reflection: '反思',
  observation: '觀察',
  event: '事件',
  dream: '夢',
  relationship: '關係',
  heard_memory: '聽來',
  claimed_backstory: '自述',
  artifact: '創作',
};

/**
 * 3-tone x 3-shape encoding of how a memory is held.
 * Tone:  cinnabar = inner/primary, jade = about others, mute = fact/unverified.
 * Shape: filled = firsthand/trusted, ring = external/unverified/dream,
 *        diamond = permanent/composite (artifact in Walrus / relationship).
 */
type DotShape = 'filled' | 'ring' | 'diamond';
type DotTone = 'cinnabar' | 'jade' | 'mute' | 'faint';

const KIND_DOT: Record<CharacterMemoryKind, { shape: DotShape; tone: DotTone }> = {
  reflection: { shape: 'filled', tone: 'cinnabar' },
  observation: { shape: 'filled', tone: 'jade' },
  event: { shape: 'filled', tone: 'mute' },
  dream: { shape: 'ring', tone: 'cinnabar' },
  relationship: { shape: 'diamond', tone: 'jade' },
  heard_memory: { shape: 'ring', tone: 'mute' },
  claimed_backstory: { shape: 'filled', tone: 'faint' },
  artifact: { shape: 'diamond', tone: 'cinnabar' },
};

const PROVENANCE_LABEL = {
  self: null,
  storyteller: '班主寄入的夢',
  owner: '持有者的低語',
  system: '系統紀錄',
} as const;

export function MemoriesTab({
  character,
  memories,
  isOwner,
  sagaCharacters,
  chaptersById,
}: {
  character: Character;
  memories: CharacterMemory[];
  /** Caller must derive this from a verifiable source (connected wallet /
   *  on-chain OwnerCap), never from the spoofable `?as=` URL param. */
  isOwner: boolean;
  sagaCharacters: Character[];
  chaptersById: Map<string, Chapter>;
}) {
  const charactersById = new Map(sagaCharacters.map((c) => [c.id, c]));

  if (!isOwner) {
    return <LockedNotice character={character} />;
  }

  return (
    <div className="space-y-12">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="h-px w-8 bg-cinnabar/40" />
          <h2 className="font-serif text-2xl tracking-wide text-ink">記憶</h2>
          <p className="text-xs tracking-widest text-mute/70 hidden sm:block">
            記得的事 — 都上鏈寫進 Walrus，只有持有者讀得到。
          </p>
        </div>
        <p className="text-xs tracking-widest text-mute/70 pl-12 sm:pl-0">{memories.length} 則</p>
      </header>
      <p className="text-xs tracking-widest text-mute/70 pl-12 sm:hidden">
        記得的事 — 都上鏈寫進 Walrus，只有持有者讀得到。
      </p>

      <div className="pl-0 sm:pl-12">
        {memories.length === 0 ? (
          <div className="rounded-3xl bg-surface/40 border border-hairline/50 p-12 text-center backdrop-blur-sm">
            <p className="text-sm text-mute tracking-wide">
              暫時還沒留下供你翻閱的記憶。下一場戲落幕後，這裡會陸續長出新的條目。
            </p>
          </div>
        ) : (
          <ol className="space-y-6">
            {memories.map((mem) => (
              <MemoryEntry
                key={mem.id}
                memory={mem}
                sagaCharacters={sagaCharacters}
                charactersById={charactersById}
                selfId={character.id}
                chapter={mem.eventChapterId ? chaptersById.get(mem.eventChapterId) ?? null : null}
              />
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function MemoryEntry({
  memory,
  sagaCharacters,
  charactersById,
  selfId,
  chapter,
}: {
  memory: CharacterMemory;
  sagaCharacters: Character[];
  charactersById: Map<string, Character>;
  selfId: string;
  chapter: Chapter | null;
}) {
  const summaryWeight = importanceClass(memory.importance);

  return (
    <li className="rounded-3xl bg-surface/40 border border-hairline/50 p-6 sm:p-8 backdrop-blur-sm transition-all duration-300 hover:bg-surface hover:shadow-sm">
      {/* meta row — kind dot + kind label + date + chapter link */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs tracking-widest text-mute/80">
        <span className="flex items-center gap-2 bg-canvas/50 px-2.5 py-1 rounded border border-hairline/50">
          <KindDot kind={memory.kind} />
          <span>{KIND_LABEL[memory.kind]}</span>
        </span>
        <span className="text-hairline">·</span>
        <span>{formatDate(memory.occurredAt)}</span>
        {chapter ? (
          <>
            <span className="text-hairline">·</span>
            <Link
              href={`/feed/chapter/${chapter.id}`}
              className="border-b border-dotted border-cinnabar/40 text-cinnabar/90 transition-colors hover:border-cinnabar hover:text-cinnabar"
            >
              @ {shortChapterTitle(chapter.title)}
            </Link>
          </>
        ) : null}
      </div>

      {/* provenance micro line — only shown for non-self */}
      <ProvenanceLine
        provenance={memory.provenance}
        charactersById={charactersById}
      />

      {/* summary line — weight reflects importance */}
      <p className={`mt-5 font-serif text-xl leading-snug tracking-wide ${summaryWeight}`}>
        <Linkified text={memory.summary} characters={sagaCharacters} skipId={selfId} />
      </p>

      {/* body — italic quote style with cinnabar left border */}
      <div className="mt-4 border-l-2 border-cinnabar/30 pl-5 text-base leading-loose text-ink/75 dark:border-cinnabar/40">
        <Linkified text={memory.body} characters={sagaCharacters} skipId={selfId} />
      </div>
    </li>
  );
}

/** importance (1-10) → summary font weight, visually "how deeply remembered" */
function importanceClass(importance: number): string {
  if (importance >= 9) return 'font-medium text-ink';
  if (importance >= 6) return 'text-ink';
  if (importance >= 4) return 'text-ink/80';
  return 'text-ink/60';
}

function KindDot({ kind }: { kind: CharacterMemoryKind }) {
  const { shape, tone } = KIND_DOT[kind];
  const toneClass = TONE_CLASS[tone];

  if (shape === 'diamond') {
    return (
      <span
        aria-hidden
        className={`inline-block h-2 w-2 rotate-45 ${toneClass.bg}`}
      />
    );
  }
  if (shape === 'ring') {
    return (
      <span
        aria-hidden
        className={`inline-block h-2 w-2 rounded-full border ${toneClass.ring}`}
      />
    );
  }
  return (
    <span aria-hidden className={`inline-block h-2 w-2 rounded-full ${toneClass.bg}`} />
  );
}

const TONE_CLASS: Record<DotTone, { bg: string; ring: string }> = {
  cinnabar: { bg: 'bg-cinnabar', ring: 'border-cinnabar/70' },
  jade: { bg: 'bg-jade', ring: 'border-jade/70' },
  mute: { bg: 'bg-mute', ring: 'border-mute/60' },
  faint: { bg: 'bg-mute/35', ring: 'border-mute/35' },
};

function ProvenanceLine({
  provenance,
  charactersById,
}: {
  provenance: MemoryProvenance | undefined;
  charactersById: Map<string, Character>;
}) {
  if (!provenance || provenance.source === 'self') return null;

  let text: string;
  if (provenance.source === 'heard_from_character') {
    const from = provenance.sourceCharacterId
      ? charactersById.get(provenance.sourceCharacterId)
      : null;
    const name = from?.name ?? '某人';
    text = `從 ${name} 那裡聽來`;
  } else {
    text = PROVENANCE_LABEL[provenance.source] ?? '';
  }

  const confidence =
    typeof provenance.confidence === 'number'
      ? `信度 ${Math.round(provenance.confidence * 100)}%`
      : null;
  const claim = provenance.claimStatus === 'unverified' ? '未驗證' : null;

  if (!text && !confidence && !claim) return null;

  return (
    <p className="mt-2 flex flex-wrap items-baseline gap-x-2 text-xs italic leading-snug text-mute/85">
      <span aria-hidden className="text-mute/60">
        ↳
      </span>
      <span>{text}</span>
      {confidence ? (
        <>
          <span className="text-hairline not-italic">·</span>
          <span className="not-italic tracking-wide">{confidence}</span>
        </>
      ) : null}
      {claim ? (
        <>
          <span className="text-hairline not-italic">·</span>
          <span className="not-italic tracking-wide">{claim}</span>
        </>
      ) : null}
    </p>
  );
}

export function LockedNotice({ character }: { character: Character }) {
  return (
    <section className="rounded-3xl bg-surface/40 border border-dashed border-hairline/60 p-8 sm:p-12 text-sm leading-relaxed text-mute backdrop-blur-sm text-center max-w-2xl mx-auto mt-12">
      <p className="font-serif text-xl text-ink/80 tracking-wide mb-4">記憶是私有的部分。</p>
      <p className="tracking-wide leading-loose">
        只有持有
        <span className="mx-2 font-mono text-mute/90 bg-canvas/50 px-2 py-1 rounded">{truncateAddress(character.nftOwner)}</span>
        能翻閱這些反思 — 章回是願意被看見的；記憶是還沒整理好、不確定要不要被看見的那些。
      </p>
    </section>
  );
}
