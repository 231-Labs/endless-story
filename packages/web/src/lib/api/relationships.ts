import type { RelationshipEdge } from '@endless-story/shared';
import { listEdgesFrom, listEdgesTo, relationshipEdges } from '@/mocks/relationships';
import { USE_MOCK } from './config';
import { httpGet } from './http';
import { fetchOnChainEdgesFrom, fetchOnChainEdgesTo } from '@/lib/chain/relationships';

/**
 * Relationships API
 *
 * Chain-first (N3): when the director has seeded ties (RelationshipSeeded),
 * surface the REAL on-chain edges. The relationship graph is public (it's
 * the objective record of who the director tied to whom), so no owner gate.
 * Falls back to mock / http for demo characters with no on-chain ties.
 *
 * Backend (legacy mock backend):
 *   GET   /relationships?fromId={id}      → RelationshipEdge[]   (outgoing)
 *   GET   /relationships                  → RelationshipEdge[]   (all)
 */

export async function listOutgoingEdges(fromId: string): Promise<RelationshipEdge[]> {
  // Chain-first: real director-seeded ties win when present.
  const onChain = await fetchOnChainEdgesFrom(fromId).catch(() => []);
  if (onChain.length > 0) return onChain;

  if (USE_MOCK) return listEdgesFrom(fromId);
  return httpGet<RelationshipEdge[]>('/relationships', { query: { fromId } });
}

/** Incoming edges — who feels what toward this character (direction-true). */
export async function listIncomingEdges(toId: string): Promise<RelationshipEdge[]> {
  const onChain = await fetchOnChainEdgesTo(toId).catch(() => []);
  if (onChain.length > 0) return onChain;

  if (USE_MOCK) return listEdgesTo(toId);
  return httpGet<RelationshipEdge[]>('/relationships', { query: { toId } });
}

export async function listAllEdges(): Promise<RelationshipEdge[]> {
  if (USE_MOCK) return relationshipEdges;
  return httpGet<RelationshipEdge[]>('/relationships');
}
