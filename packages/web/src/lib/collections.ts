// Index a list by each item's `id` for O(1) lookup.
export function byId<T extends { id: string }>(items: readonly T[]): Map<string, T> {
  return new Map(items.map((item) => [item.id, item]));
}
