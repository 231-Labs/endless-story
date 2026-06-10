import Link from 'next/link';
import type { CharacterRole } from '@endless-story/shared';
import { characterPortraitTone } from '@/components/common/CharacterPortrait';
import { BlobImage } from '@/components/common/BlobImage';

/**
 * Off-turf tracking board.
 *
 * Tracks members of this saga (bound by saga_id) who are NOT currently within
 * the saga's covered locations — i.e. their scene is in an uncovered location
 * (external venue) or they have no current scene. Axes are membership x current
 * position, not economy. One card = one off-turf member (who · where now);
 * empty state when everyone is on-turf. Data is prepared server-side (page.tsx).
 */

export interface OffTurfEntry {
  id: string;
  name: string;
  role: CharacterRole;
  imageUrl?: string;
  /** Current scene name (a room at an external location); undefined if no scene. */
  sceneName?: string;
  /** External location name the current scene belongs to; undefined if unknown. */
  locationName?: string;
}

function whereLabel(e: OffTurfEntry): string {
  if (e.locationName && e.sceneName) return `${e.locationName} · ${e.sceneName}`;
  if (e.locationName) return e.locationName;
  if (e.sceneName) return e.sceneName;
  return '江湖之間 · 行蹤不在台上';
}

export function OffTurfBoard({ entries }: { entries: OffTurfEntry[] }) {
  return (
    <section className="flex h-full w-full flex-col bg-canvas">
      {/* 標題 */}
      <div className="shrink-0 px-[max(env(safe-area-inset-left,0px),1.25rem)] pt-[max(5rem,calc(env(safe-area-inset-top,0px)+4.75rem))] sm:px-10 sm:pt-24">
        <div className="flex items-center gap-4">
          <div className="h-px w-8 bg-cinnabar/60" />
          <h2 className="font-serif text-3xl tracking-[0.25em] text-ink drop-shadow-sm sm:text-4xl">
            江湖在外
          </h2>
        </div>
        <p className="mt-3 max-w-xl text-2xs leading-relaxed tracking-[0.2em] text-mute sm:text-xs">
          春雪社的人，此刻不在戲班地界內：在堂子、會館、碼頭或更遠的上海。
        </p>
      </div>

      {/* 分鏡卡 */}
      <div className="mt-6 min-h-0 flex-1 overflow-y-auto overscroll-contain px-[max(env(safe-area-inset-left,0px),1rem)] pb-[max(7rem,calc(env(safe-area-inset-bottom,0px)+6rem))] sm:px-10">
        {entries.length === 0 ? (
          <div className="flex h-full min-h-[24vh] items-center justify-center">
            <p className="font-serif text-sm tracking-[0.25em] text-mute/80">
              全班都在地界內。
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
            {entries.map((e) => (
              <OffTurfCard key={e.id} entry={e} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function OffTurfCard({ entry }: { entry: OffTurfEntry }) {
  const tone = characterPortraitTone(entry.role);
  return (
    <li>
      <Link
        href={{ pathname: '/dossier', query: { id: entry.id } }}
        className="group flex h-full flex-col items-center gap-2.5 rounded-2xl border border-hairline/45 bg-surface/70 px-3 py-4 text-center shadow-sm backdrop-blur-sm transition-colors hover:border-cinnabar/45 dark:bg-elevated/55"
      >
        <span
          className={`relative h-16 w-16 overflow-hidden rounded-full shadow-md ring-2 ring-surface ${tone.ring} ${tone.bg}`}
        >
          <span
            className={`absolute inset-0 flex items-center justify-center font-serif text-xl ${tone.text}`}
          >
            {entry.name[0]}
          </span>
          {entry.imageUrl ? (
            <BlobImage
              src={entry.imageUrl}
              alt=""
              sizes="64px"
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : null}
        </span>

        <div className="min-w-0">
          <p className="truncate font-serif text-sm tracking-[0.12em] text-ink group-hover:text-ink">
            {entry.name}
          </p>
          <p className="mt-0.5 truncate text-2xs tracking-[0.2em] text-mute/80">{entry.role}</p>
        </div>

        <div className="mt-auto w-full border-t border-hairline/40 pt-1.5">
          <p className="line-clamp-2 font-serif text-xs leading-snug text-mute">
            {whereLabel(entry)}
          </p>
        </div>
      </Link>
    </li>
  );
}
