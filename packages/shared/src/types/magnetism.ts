// Character "magnetism" — display-only derived attributes computed by the backend,
// separate from the on-chain Character identity. Drives SubscribeCard / DossierHeader.
export interface CharacterMagnetism {
  characterId: string;
  signatureQuote?: { text: string; chapterId?: string };
  subscriberCount: number;
  nextPovHint?: string; // rough countdown to next POV chapter, e.g. "within 6h"
}
