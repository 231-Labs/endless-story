import type { RelationshipEdge } from '@endless-story/shared';
import { listEdgesFrom, relationshipEdges } from '@/mocks/relationships';
import { USE_MOCK } from './config';
import { httpGet } from './http';

/**
 * Relationships API
 *
 * 後端對應 endpoints：
 *   GET   /relationships?fromId={id}      → RelationshipEdge[]   (outgoing)
 *   GET   /relationships                  → RelationshipEdge[]   (all)
 *
 * 後端應該：
 *   - 邊由 sleep cycle 的 subjective-llm 蒸出（每日跑一次、accumulate）
 *   - tone / confidence / summary 由 LLM 評
 *   - 跨界邊（saga 成員 ↔ wild）也走同樣表結構
 */

export async function listOutgoingEdges(fromId: string): Promise<RelationshipEdge[]> {
  if (USE_MOCK) return listEdgesFrom(fromId);
  return httpGet<RelationshipEdge[]>('/relationships', { query: { fromId } });
}

export async function listAllEdges(): Promise<RelationshipEdge[]> {
  if (USE_MOCK) return relationshipEdges;
  return httpGet<RelationshipEdge[]>('/relationships');
}
