import Link from 'next/link';
import type {
  Character,
  CharacterMemory,
  CharacterMemoryKind,
  Chapter,
} from '@endless-story/shared';
import { Linkified } from '@/components/common/CharacterLinkifier';
import { formatDate, shortChapterTitle, truncateAddress } from '@/lib/format';

const KIND_LABEL: Record<CharacterMemoryKind, string> = {
  reflection: '反思',
  observation: '觀察',
  event: '事件',
};

// 三種 kind 用三種微妙的點色作標記 — 全部低調，不喧賓奪主
const KIND_DOT: Record<CharacterMemoryKind, string> = {
  reflection: 'bg-cinnabar',
  observation: 'bg-jade',
  event: 'bg-mute',
};

export function MemoriesTab({
  character,
  memories,
  viewerWallet,
  sagaCharacters,
  chaptersById,
}: {
  character: Character;
  memories: CharacterMemory[];
  viewerWallet: string | null;
  sagaCharacters: Character[];
  chaptersById: Map<string, Chapter>;
}) {
  const isOwner = viewerWallet === character.nftOwner;

  if (!isOwner) {
    return <LockedNotice character={character} />;
  }

  return (
    <div className="space-y-10">
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <h2 className="font-serif text-2xl text-ink">記憶</h2>
          <p className="mt-1 text-sm text-mute">她記得這些事 — 上鏈寫進 Walrus，只有持有者讀得到。</p>
        </div>
        <p className="text-2xs tracking-widest text-mute">{memories.length} 則</p>
      </header>

      {memories.length === 0 ? (
        <p className="es-soft-panel border-dashed p-6 text-sm text-mute">
          她暫時還沒留下供你翻閱的記憶。下一場戲落幕後，這裡會陸續長出新的條目。
        </p>
      ) : (
        <ol className="space-y-6">
          {memories.map((mem) => (
            <MemoryEntry
              key={mem.id}
              memory={mem}
              sagaCharacters={sagaCharacters}
              selfId={character.id}
              chapter={mem.eventChapterId ? chaptersById.get(mem.eventChapterId) ?? null : null}
            />
          ))}
        </ol>
      )}
    </div>
  );
}

function MemoryEntry({
  memory,
  sagaCharacters,
  selfId,
  chapter,
}: {
  memory: CharacterMemory;
  sagaCharacters: Character[];
  selfId: string;
  chapter: Chapter | null;
}) {
  return (
    <li className="es-soft-panel p-5 sm:p-6">
      {/* meta row */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-2xs tracking-widest text-mute">
        <span className="flex items-center gap-1.5">
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${KIND_DOT[memory.kind]}`} aria-hidden />
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

      {/* summary line — slightly larger, sets the scene */}
      <p className="mt-4 font-serif text-lg leading-snug text-ink">
        <Linkified text={memory.summary} characters={sagaCharacters} skipId={selfId} />
      </p>

      {/* body reflection — italic quote-style with cinnabar left border */}
      <div className="mt-3 border-l border-cinnabar/35 pl-4 text-[15px] leading-loose text-ink/80 dark:border-cinnabar/45">
        <Linkified text={memory.body} characters={sagaCharacters} skipId={selfId} />
      </div>
    </li>
  );
}

function LockedNotice({ character }: { character: Character }) {
  return (
    <section className="es-soft-panel border-dashed p-6 text-sm leading-relaxed text-mute sm:p-8">
      <p className="font-serif text-base text-ink/80">記憶是她私有的部分。</p>
      <p className="mt-2">
        只有持有
        <span className="mx-1.5 font-mono text-mute/90">{truncateAddress(character.nftOwner)}</span>
        能翻閱她的反思 — 章回是她願意被看見的；記憶是還沒整理好、不確定要不要被看見的那些。
      </p>
    </section>
  );
}
