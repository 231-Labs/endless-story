'use client';

import { CharacterCapsule } from './CharacterCapsule.js';
import { CharacterStandee } from './CharacterStandee.js';

/**
 * Character presence in the chamber. With a real portrait → a 2D standee;
 * otherwise an abstract capsule. (3D character models via Meshy stay roadmap —
 * image-to-3D of stylised portraits is too uncanny to ship.)
 */
export function CharacterAvatar({
  isSelf,
  portraitUrl,
}: {
  isSelf?: boolean;
  portraitUrl?: string;
}) {
  return portraitUrl ? (
    <CharacterStandee portraitUrl={portraitUrl} isSelf={isSelf} />
  ) : (
    <CharacterCapsule isSelf={isSelf} />
  );
}
