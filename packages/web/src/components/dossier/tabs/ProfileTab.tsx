import Link from 'next/link';
import type {
  Chapter,
  Character,
  CharacterPersona,
  RelationshipEdge,
  RelationshipTone,
} from '@endless-story/shared';
import { SoulSection } from '@/components/dossier/SoulSection';

const ATTR_LABEL: Record<keyof Character['attributes'], string> = {
  constitution: '筋骨',
  disposition: '心性',
  acuity: '機敏',
  appearance: '外貌',
};

const ATTR_ORDER: (keyof Character['attributes'])[] = [
  'constitution',
  'disposition',
  'acuity',
  'appearance',
];

export function ProfileTab({
  character,
  persona,
  personaRegenChapter,
  outgoingEdges,
  incomingEdges = [],
  charactersById,
}: {
  character: Character;
  persona: CharacterPersona | null;
  personaRegenChapter: Chapter | null;
  outgoingEdges: RelationshipEdge[];
  incomingEdges?: RelationshipEdge[];
  charactersById: Map<string, Character>;
}) {
  // 配對視角：同一位對象的「此人所感」與「對方所感」併成一列，
  // 才能呈現雙向不對稱（A 戀慕 B、B 卻無感／另有所感）。
  const incomingByFromId = new Map<string, RelationshipEdge>();
  for (const e of incomingEdges) {
    const prev = incomingByFromId.get(e.fromId);
    if (!prev || (e.weight ?? 0) > (prev.weight ?? 0)) incomingByFromId.set(e.fromId, e);
  }
  const outgoingPartnerIds = new Set(outgoingEdges.map((e) => e.toId));
  const incomingOnly = incomingEdges
    .filter((e) => !outgoingPartnerIds.has(e.fromId) && e.tone && e.tone !== 'neutral')
    .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
  const bondRows = [
    ...outgoingEdges.map((edge) => ({
      key: `${edge.fromId}-${edge.toId}`,
      partnerId: edge.toId,
      out: edge as RelationshipEdge | null,
      inc: incomingByFromId.get(edge.toId) ?? null,
    })),
    ...incomingOnly.map((edge) => ({
      key: `${edge.fromId}-${edge.toId}-in`,
      partnerId: edge.fromId,
      out: null,
      inc: edge,
    })),
  ].slice(0, 6);
  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_320px] lg:gap-20">
      {/* Main Column */}
      <div className="space-y-14 sm:space-y-20">
        <section>
          <div className="flex items-center gap-4">
            <div className="h-px w-8 bg-cinnabar/40" />
            <h2 className="font-serif text-2xl tracking-wide text-ink">敘描</h2>
          </div>
          <div className="mt-8 pl-0 sm:pl-12">
            <p className="text-base leading-loose text-ink/85 sm:text-lg sm:leading-loose">
              {character.description}
            </p>
          </div>
        </section>

        <SoulSection persona={persona} regenChapter={personaRegenChapter} />

        <section>
          <div className="flex items-center gap-4">
            <div className="h-px w-8 bg-cinnabar/40" />
            <h2 className="font-serif text-2xl tracking-wide text-ink">外貌設定</h2>
          </div>
          <div className="mt-8 pl-0 sm:pl-12">
            <p className="text-base leading-loose text-ink/85 sm:text-lg sm:leading-loose">
              {character.physicalFacts}
            </p>
          </div>
        </section>
      </div>

      {/* Sidebar */}
      <aside className="space-y-8">
        <div className="es-card p-6 sm:p-8 space-y-12">
          <section>
            <h3 className="font-serif text-lg tracking-widest text-ink text-center">天賦</h3>
            <div className="mt-8 space-y-6">
              {ATTR_ORDER.map((key) => {
                const value = character.attributes[key];
                const label = ATTR_LABEL[key];
                return (
                  <div key={key}>
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm tracking-widest text-mute">{label}</span>
                      <span className="font-mono text-lg text-ink">{value}</span>
                    </div>
                    <div className="mt-3 h-0.5 w-full overflow-hidden rounded-full bg-hairline/80 dark:bg-hairline">
                      <div
                        className="h-full rounded-full bg-cinnabar/70 dark:bg-cinnabar/80"
                        style={{ width: `${value}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section>
            <div className="flex items-center justify-center gap-3">
              <h3 className="font-serif text-lg tracking-widest text-ink text-center">日常開銷</h3>
              {character.survival.lifeStage ? (
                <span className="rounded-full border border-hairline px-2 py-0.5 text-2xs tracking-widest text-mute">
                  {{ birth: '初生', growth: '成長', golden: '黃金', aging: '老化', decline: '衰退' }[
                    character.survival.lifeStage
                  ]}
                </span>
              ) : null}
            </div>
            <div className="mt-8 space-y-5">
              <div className="flex items-baseline justify-between border-b border-hairline pb-5">
                <span className="text-sm tracking-widest text-mute">現銀</span>
                <span className="font-mono text-3xl text-ink">{character.survival.funds}</span>
              </div>
              <div className="flex items-baseline justify-between pt-2">
                <span className="text-sm tracking-widest text-mute">每日開銷</span>
                <span className="font-mono text-base text-ink">{character.survival.dailyCost}</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-sm tracking-widest text-mute">班中俸</span>
                <span className="font-mono text-base text-ink">{character.survival.salary}</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-sm tracking-widest text-mute">可撐日數</span>
                <span className="font-mono text-base text-ink">
                  {character.survival.daysLeft >= 999 ? '—' : `${character.survival.daysLeft} 日`}
                </span>
              </div>
              {character.survival.memoryCount != null ? (
                <div className="flex items-baseline justify-between">
                  <span className="text-sm tracking-widest text-mute">記憶（厚度）</span>
                  <span className="font-mono text-base text-ink">{character.survival.memoryCount}</span>
                </div>
              ) : null}
              {character.survival.imageCount != null ? (
                <div className="flex items-baseline justify-between">
                  <span className="text-sm tracking-widest text-mute">設定集（張）</span>
                  <span className="font-mono text-base text-ink">{character.survival.imageCount}</span>
                </div>
              ) : null}
              {character.survival.vitality != null ? (
                <div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm tracking-widest text-mute">氣血</span>
                    <span className="font-mono text-base text-ink">{character.survival.vitality}</span>
                  </div>
                  <div className="mt-3 h-0.5 w-full overflow-hidden rounded-full bg-hairline/80 dark:bg-hairline">
                    <div
                      className={`h-full rounded-full ${
                        character.survival.vitalityState === 'healthy'
                          ? 'bg-jade'
                          : character.survival.vitalityState === 'strained'
                            ? 'bg-cinnabar/60'
                            : character.survival.vitalityState === 'failing'
                              ? 'bg-cinnabar'
                              : 'bg-mute'
                      }`}
                      style={{
                        width: `${Math.max(0, Math.min(100, character.survival.vitality))}%`,
                      }}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        </div>

        <div className="es-card p-6 sm:p-8">
          <section>
            <h3 className="font-serif text-lg tracking-widest text-ink text-center">關係</h3>
            {bondRows.length === 0 ? (
              <p className="mt-8 text-sm leading-relaxed text-mute text-center">尚未對誰留下顯著的記憶。</p>
            ) : (
              <ul className="mt-8 space-y-6">
                {bondRows.map((row) => (
                  <RelationshipRow
                    key={row.key}
                    out={row.out}
                    inc={row.inc}
                    target={charactersById.get(row.partnerId) ?? null}
                    fallbackName={row.partnerId}
                  />
                ))}
              </ul>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}

// ─────────────── Relationship row ───────────────
//
// Layout: tone dot (color x shape) + label + weight on one line,
//   summary as a quote, date range + confidence as micro meta.
//
// Tone → visual (shares the dot vocabulary with MemoriesTab's KindDot):
//   affection    → ● cinnabar      romance      → ◆ cinnabar
//   mentorship   → ● jade          rivalry      → ◆ mute
//   wary         → ○ mute          tension      → ○ cinnabar
//   estrangement → ● faint         acquaintance → ○ jade
//   neutral      → ● faint

type ToneShape = 'filled' | 'ring' | 'diamond';
type ToneColor = 'cinnabar' | 'jade' | 'mute' | 'faint';

const TONE_LABEL: Record<RelationshipTone, string> = {
  affection: '親近',
  romance: '戀慕',
  mentorship: '師徒',
  rivalry: '競爭',
  wary: '戒備',
  tension: '緊張',
  estrangement: '隔閡',
  acquaintance: '故舊',
  neutral: '平淡',
};

const TONE_VISUAL: Record<RelationshipTone, { shape: ToneShape; color: ToneColor }> = {
  affection: { shape: 'filled', color: 'cinnabar' },
  romance: { shape: 'diamond', color: 'cinnabar' },
  mentorship: { shape: 'filled', color: 'jade' },
  rivalry: { shape: 'diamond', color: 'mute' },
  wary: { shape: 'ring', color: 'mute' },
  tension: { shape: 'ring', color: 'cinnabar' },
  estrangement: { shape: 'filled', color: 'faint' },
  acquaintance: { shape: 'ring', color: 'jade' },
  neutral: { shape: 'filled', color: 'faint' },
};

const TONE_CSS: Record<ToneColor, { bg: string; ring: string }> = {
  cinnabar: { bg: 'bg-cinnabar', ring: 'border-cinnabar/70' },
  jade: { bg: 'bg-jade', ring: 'border-jade/70' },
  mute: { bg: 'bg-mute', ring: 'border-mute/60' },
  faint: { bg: 'bg-mute/35', ring: 'border-mute/35' },
};

function RelationshipRow({
  out,
  inc,
  target,
  fallbackName,
}: {
  /** 此人對對方的感受；null = 此人未對其留下記憶（只有對方有感） */
  out: RelationshipEdge | null;
  /** 對方對此人的感受；null = 對方未有所感 */
  inc: RelationshipEdge | null;
  target: Character | null;
  fallbackName: string;
}) {
  const name = target?.name ?? fallbackName;
  const primary = out ?? inc!;
  // 只在有真區間時顯示日期；單日（多半就是當前敘事日）對讀者沒有訊息。
  const dayRange =
    primary.firstSeenDay != null && primary.firstSeenDay !== primary.lastUpdatedDay
      ? `日 ${primary.firstSeenDay} — 日 ${primary.lastUpdatedDay}`
      : null;
  // 只顯示真‧敘事 summary；不再 fallback 到 label（label 多是 tone 詞，會與右側標籤重複）。
  const quote = out?.summary?.trim() || null;
  const mutual = !!(out?.tone && inc?.tone && out.tone === inc.tone);

  return (
    <li>
      {/* 第一行：名字（連結到 dossier）+ 此人所感（→）；互相同感標 ⇄ */}
      <div className="flex items-baseline justify-between gap-2">
        {target ? (
          <Link
            href={{ pathname: '/dossier', query: { id: target.id } }}
            className="font-serif text-lg text-ink transition-colors hover:text-cinnabar"
          >
            {name}
          </Link>
        ) : (
          <span className="font-serif text-lg text-ink">{name}</span>
        )}
        {out?.tone ? (
          <span className="flex items-center gap-2 text-2xs tracking-widest text-mute">
            <ToneDot tone={out.tone} />
            <span>
              {mutual ? '⇄ ' : ''}
              {TONE_LABEL[out.tone]}
            </span>
          </span>
        ) : inc?.tone ? (
          <span className="flex items-center gap-2 text-2xs tracking-widest text-mute/70">
            <ToneDot tone={inc.tone} />
            <span>← {TONE_LABEL[inc.tone]}</span>
          </span>
        ) : null}
      </div>

      {/* 主敘述：僅在有真 summary 時顯示，否則整行省略 */}
      {quote ? (
        <p className="mt-2 text-sm italic leading-relaxed text-ink/75">「{quote}」</p>
      ) : null}

      {/* 雙向不對稱：對方所感與此人不同（或一方無感）時，標出彼端心緒 */}
      {!mutual && out?.tone && out.tone !== 'neutral' ? (
        inc?.tone && inc.tone !== 'neutral' ? (
          <p className="mt-2 flex items-center gap-2 text-2xs tracking-widest text-mute/85">
            <ToneDot tone={inc.tone} />
            <span>對方所感 ← {TONE_LABEL[inc.tone]}</span>
          </p>
        ) : (
          <p className="mt-2 text-2xs italic tracking-widest text-mute/55">對方未有所感</p>
        )
      ) : null}
      {!out && inc ? (
        <p className="mt-2 text-2xs italic tracking-widest text-mute/55">此人未有回應</p>
      ) : null}

      {/* 微 meta：僅在有真日期區間時顯示 */}
      {dayRange ? (
        <p className="mt-2 text-2xs tracking-widest text-mute/85">{dayRange}</p>
      ) : null}
    </li>
  );
}

function ToneDot({ tone }: { tone: RelationshipTone }) {
  const { shape, color } = TONE_VISUAL[tone];
  const css = TONE_CSS[color];
  if (shape === 'diamond') {
    return <span aria-hidden className={`inline-block h-2 w-2 rotate-45 ${css.bg}`} />;
  }
  if (shape === 'ring') {
    return (
      <span aria-hidden className={`inline-block h-2 w-2 rounded-full border ${css.ring}`} />
    );
  }
  return <span aria-hidden className={`inline-block h-2 w-2 rounded-full ${css.bg}`} />;
}