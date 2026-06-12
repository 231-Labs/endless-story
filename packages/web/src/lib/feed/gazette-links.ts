import type { Chapter } from '@endless-story/shared';

/**
 * Rewrite gazette markdown POV links to the rendered chapter page.
 *
 * Handles both legacy links (`/dossier?id=…&tab=chapters`) and raw blob
 * URLs (`/api/blob/…`) from LLM output. Maps each to `/feed/chapter/{commitmentId}`.
 */
export function rewriteGazettePovLinks(
  markdown: string,
  chapters: Chapter[],
  gazetteCommittedAtMs: number,
): string {
  let out = markdown;

  // Legacy dossier chapters-tab links baked into older gazettes.
  out = out.replace(
    /(\]\()\/dossier\?id=([^&)\s]+)(?:&tab=chapters)?(\))/g,
    (match, prefix, characterId, suffix) => {
      const href = chapterHrefForCharacter(characterId, chapters, gazetteCommittedAtMs);
      return href ? `${prefix}${href}${suffix}` : match;
    },
  );

  // Raw blob links (if any slipped through un-rewritten at compile time).
  for (const chapter of chapters) {
    const blobId = chapter.walrusBlobId;
    if (!blobId) continue;
    out = out.split(`/api/blob/${blobId}`).join(`/feed/chapter/${chapter.id}`);
  }

  return out;
}

function chapterHrefForCharacter(
  characterId: string,
  chapters: Chapter[],
  beforeMs: number,
): string | null {
  const candidates = chapters
    .filter((c) => c.povCharacterId === characterId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (candidates.length === 0) return null;

  const atPublishTime = candidates.find(
    (c) => new Date(c.createdAt).getTime() <= beforeMs,
  );
  const pick = atPublishTime ?? candidates[0];
  return `/feed/chapter/${pick.id}`;
}
