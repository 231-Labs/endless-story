/**
 * Storyteller chapter — agentic, accumulation-driven chapter production.
 *
 * Pure layers (material + gate + slice→payload mapping), safe to import from
 * the web tick path and the harness alike. The compose/anchor I/O reuses the
 * event-chapter-compiler; this service only decides WHAT material, WHEN to
 * write, and HOW to shape the compiler payload. See docs/STORYTELLER_CHAPTER.md.
 */

export * from './material.js';
export * from './gate.js';
export * from './compose.js';
