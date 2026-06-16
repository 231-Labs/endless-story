/**
 * Production anchor header — embeds a verifiable `es:production` header into the
 * anchored 戲折 blob (mirrors event-chapter-compiler's `es:cut`). A reader finds
 * "the 折子 for production X" by matching `productionId`; `castIds` make the
 * co-authors verifiable (the shared-IP provenance). Pure (no chain/LLM) so it
 * unit-tests cleanly under `node --test`.
 */

const HEADER_RE = /^<!--es:production\s+(\{[\s\S]*?\})\s*-->\s*/;

export interface ProductionHeader {
  v: 1;
  kind: 'production';
  productionId: string;
  classicKey: string;
  classicSource?: string;
  title?: string;
  /** assigned member ids = the cast / co-authors (provenance for shared IP). */
  castIds: string[];
  day?: number;
}

export function embedProductionHeader(doc: string, header: ProductionHeader): string {
  return `<!--es:production ${JSON.stringify(header)} -->\n${doc}`;
}

export function parseProductionHeader(content: string): { header?: ProductionHeader; body: string } {
  const m = content.match(HEADER_RE);
  if (!m) return { body: content };
  try {
    return { header: JSON.parse(m[1]) as ProductionHeader, body: content.slice(m[0].length) };
  } catch {
    return { body: content };
  }
}
