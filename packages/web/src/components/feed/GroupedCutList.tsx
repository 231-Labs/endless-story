import type { EventCutEntry } from '@/lib/api/cuts';
import { CutList } from './CutList';

/**
 * Event cuts grouped into a per-day timeline — the closest thing to a 回目
 * rollup with the data on hand: cuts already carry a narrative `day`, so the
 * flat newest-first list becomes 「第 N 日」 sections. Days descend (newest
 * first); undated cuts fall to a final 未紀日 group. Each day's cards are the
 * shared CutList so the card stays a single source of truth.
 */
export function GroupedCutList({
  cuts,
  sagaName,
}: {
  cuts: EventCutEntry[];
  sagaName: string;
}) {
  if (cuts.length === 0) {
    // Reuse CutList's empty state.
    return <CutList cuts={cuts} sagaName={sagaName} />;
  }

  const byDay = new Map<number | null, EventCutEntry[]>();
  for (const c of cuts) {
    const d = c.day ?? null;
    const list = byDay.get(d) ?? [];
    if (list.length === 0) byDay.set(d, list);
    list.push(c);
  }
  const days = [...byDay.keys()].sort((a, b) => {
    if (a == null) return 1;
    if (b == null) return -1;
    return b - a;
  });

  return (
    <div className="space-y-12">
      {days.map((day) => {
        const dayCuts = byDay.get(day)!;
        return (
          <section key={day ?? 'undated'}>
            <div className="mb-5 flex items-baseline gap-4">
              <h2 className="font-serif text-xl tracking-[0.2em] text-ink">
                {day != null ? `第 ${day} 日` : '未紀日'}
              </h2>
              <div className="h-px flex-1 bg-hairline/50" />
              <span className="shrink-0 text-2xs tracking-widest text-mute">
                {dayCuts.length} 回
              </span>
            </div>
            <CutList cuts={dayCuts} sagaName={sagaName} />
          </section>
        );
      })}
    </div>
  );
}
