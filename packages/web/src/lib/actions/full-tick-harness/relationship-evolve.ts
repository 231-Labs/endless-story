/**
 * Moved to @/lib/chain/relationship-evolve (production location — the live tick loop
 * now evolves directed relationship tones from POVs, not just the harness). This is
 * a re-export shim so existing harness imports keep working.
 */
export * from '@/lib/chain/relationship-evolve';
