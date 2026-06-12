import type { Chapter } from '@endless-story/shared';
import { isValidWalrusBlobId } from '@endless-story/shared';

/**
 * Rewrite gazette markdown POV links to the rendered chapter page.
 *
 * Handles legacy dossier links, raw blob URLs (including LLM placeholders
 * like `/api/blob/0` when blobId was missing at compile time), and maps
 * each to `/feed/chapter/{commitmentId}`.
 */
export function rewriteGazettePovLinks(
  markdown: string,
  chapters: Chapter[],
  gazetteCommittedAtMs: number,
  characterNamesById?: Map<string, string>,
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

  // Known blob ids → chapter page (compile-time rewrite path).
  for (const chapter of chapters) {
    const blobId = chapter.walrusBlobId;
    if (!blobId || !isValidWalrusBlobId(blobId)) continue;
    out = out.split(`/api/blob/${blobId}`).join(`/feed/chapter/${chapter.id}`);
  }

  // Character-name lines in 連載預告 — fix bad blob links (e.g. /api/blob/0).
  const hrefByCharacterName = buildCharacterNameHrefMap(
    chapters,
    gazetteCommittedAtMs,
    characterNamesById,
  );
  out = out.replace(
    /(\*\*)([^*]+)(\*\*〈視角〉[^\]]*\]\()(\/api\/blob\/[^)\s]+)(\))/g,
    (match, boldOpen, name, mid, _badHref, close) => {
      const href = hrefByCharacterName.get(name.trim());
      return href ? `${boldOpen}${name}${mid}${href}${close}` : match;
    },
  );

  return out;
}

function buildCharacterNameHrefMap(
  chapters: Chapter[],
  beforeMs: number,
  characterNamesById?: Map<string, string>,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const chapter of chapters) {
    if (!chapter.povCharacterId) continue;
    const name =
      characterNamesById?.get(chapter.povCharacterId) ||
      chapter.title.split(' 視角')[0]?.replace(/ ·.*/, '').trim();
    if (!name) continue;
    const href = chapterHrefForCharacter(chapter.povCharacterId, chapters, beforeMs);
    if (href) out.set(name, href);
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
