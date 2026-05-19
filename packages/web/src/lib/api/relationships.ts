import type { RelationshipEdge } from '@endless-story/shared';
import { listEdgesFrom, relationshipEdges } from '@/mocks/relationships.js';

export async function listOutgoingEdges(fromId: string): Promise<RelationshipEdge[]> {
  return listEdgesFrom(fromId);
}

export async function listAllEdges(): Promise<RelationshipEdge[]> {
  return relationshipEdges;
}
