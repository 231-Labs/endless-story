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
 * 三色 × 三形 視覺分層 — 第一眼讀出「她是怎麼記得這條的」。
 *
 * 顏色：
 *  - cinnabar（朱）= 內在 / 主要記得
 *  - jade（青）   = 關於他人 / 旁觀
 *  - mute（灰）   = 事實 / 未驗證
 *
 * 形狀：
 *  - filled  圓 = 親身、可信
 *  - ring    環 = 外來 / 未驗證 / 夢
 *  - diamond ◆ = 永久性 / 複合（artifact 寫進 Walrus / relationship 對人）
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
  const charactersById = new Map(sagaCharacters.map((c) => [c.id, c]));

  if (!isOwner) {
    return <LockedNotice character={character} />;
  }

  return (
    <div className="space-y-10">
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <h2 className="font-serif text-2xl text-ink">記憶</h2>
          <p className="mt-1 text-sm text-mute">
            她記得這些事 — 上鏈寫進 Walrus，只有持有者讀得到。
          </p>
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
              charactersById={charactersById}
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
    <li className="es-soft-panel p-5 sm:p-6">
      {/* meta row — kind dot + kind label + date + chapter link */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-2xs tracking-widest text-mute">
        <span className="flex items-center gap-1.5">
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

      {/* provenance micro line — 只在非 self 時顯示 */}
      <ProvenanceLine
        provenance={memory.provenance}
        charactersById={charactersById}
      />

      {/* summary line — 字重 reflect importance */}
      <p className={`mt-3 font-serif text-lg leading-snug ${summaryWeight}`}>
        <Linkified text={memory.summary} characters={sagaCharacters} skipId={selfId} />
      </p>

      {/* body — italic quote 體 with cinnabar left border */}
      <div className="mt-3 border-l border-cinnabar/35 pl-4 text-[15px] leading-loose text-ink/80 dark:border-cinnabar/45">
        <Linkified text={memory.body} characters={sagaCharacters} skipId={selfId} />
      </div>
    </li>
  );
}

/** importance（1-10）→ summary 字重，視覺上的「她記得多深」 */
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
