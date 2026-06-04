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
  charactersById,
}: {
  character: Character;
  persona: CharacterPersona | null;
  personaRegenChapter: Chapter | null;
  outgoingEdges: RelationshipEdge[];
  charactersById: Map<string, Character>;
}) {
  return (
    <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1fr_320px] lg:gap-20">
      {/* Main Column */}
      <div className="space-y-20">
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
            <p className="mt-6 text-xs tracking-widest text-mute/70">
              * mint 時寫上鏈、所有 portrait 生成都 anchor 於此
            </p>
          </div>
        </section>
      </div>

      {/* Sidebar */}
      <aside className="space-y-8">
        <div className="rounded-3xl bg-surface/40 border border-hairline/50 p-6 sm:p-8 space-y-12 backdrop-blur-sm">
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
              {character.survival.memoryRent != null ? (
                <div className="flex items-baseline justify-between -mt-3">
                  <span className="pl-3 text-2xs tracking-widest text-mute/70">其中記憶租金</span>
                  <span className="font-mono text-2xs text-mute/70">{character.survival.memoryRent}</span>
                </div>
              ) : null}
              {character.survival.imageRent != null ? (
                <div className="flex items-baseline justify-between -mt-3">
                  <span className="pl-3 text-2xs tracking-widest text-mute/70">其中設定集租金</span>
                  <span className="font-mono text-2xs text-mute/70">{character.survival.imageRent}</span>
                </div>
              ) : null}
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

        <div className="rounded-3xl bg-surface/40 border border-hairline/50 p-6 sm:p-8 backdrop-blur-sm">
          <section>
            <h3 className="font-serif text-lg tracking-widest text-ink text-center">關係</h3>
            {outgoingEdges.length === 0 ? (
              <p className="mt-8 text-sm leading-relaxed text-mute text-center">尚未對誰留下顯著的記憶。</p>
            ) : (
              <ul className="mt-8 space-y-8">
                {outgoingEdges.slice(0, 6).map((edge) => (
                  <RelationshipRow
                    key={`${edge.fromId}-${edge.toId}`}
                    edge={edge}
                    target={charactersById.get(edge.toId) ?? null}
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
// 設計：tone dot（色 × 形）+ label + weight 一行
//      summary（fallback 用 label）作引文體
//      日 X — 日 Y · 信度 N% 作微 meta
//
// tone 視覺對映 — 與 MemoriesTab 的 KindDot 共用色 / 形語彙：
//   親近 affection   → ● cinnabar （朱圓 / 樸實親）
//   戀慕 romance     → ◆ cinnabar （朱菱 / 獨特熱烈）
//   師徒 mentorship  → ● jade     （青圓 / 生長關係）
//   競爭 rivalry     → ◆ mute     （灰菱 / 理性對峙）
//   戒備 wary        → ○ mute     （灰環 / 保持距離）
//   緊張 tension     → ○ cinnabar （朱環 / 內熱外冷）
//   隔閡 estrangement→ ● faint    （淡圓 / 已遠）
//   平淡 neutral     → ● faint    （淡圓 / 未起）

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
  neutral: { shape: 'filled', color: 'faint' },
};

const TONE_CSS: Record<ToneColor, { bg: string; ring: string }> = {
  cinnabar: { bg: 'bg-cinnabar', ring: 'border-cinnabar/70' },
  jade: { bg: 'bg-jade', ring: 'border-jade/70' },
  mute: { bg: 'bg-mute', ring: 'border-mute/60' },
  faint: { bg: 'bg-mute/35', ring: 'border-mute/35' },
};

function RelationshipRow({
  edge,
  target,
}: {
  edge: RelationshipEdge;
  target: Character | null;
}) {
  const name = target?.name ?? edge.toId;
  const dayRange =
    edge.firstSeenDay != null && edge.firstSeenDay !== edge.lastUpdatedDay
      ? `日 ${edge.firstSeenDay} — 日 ${edge.lastUpdatedDay}`
      : `日 ${edge.lastUpdatedDay}`;
  const confidence =
    typeof edge.confidence === 'number'
      ? `信度 ${Math.round(edge.confidence * 100)}%`
      : null;
  const quote = edge.summary?.trim() || edge.label;

  return (
    <li>
      {/* 第一行：名字（連結到 dossier）+ tone + weight */}
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
        <span className="flex items-center gap-2 text-2xs tabular-nums tracking-widest text-mute">
          {edge.tone ? <ToneDot tone={edge.tone} /> : null}
          {edge.tone ? <span>{TONE_LABEL[edge.tone]}</span> : null}
          {edge.tone ? <span className="text-hairline">·</span> : null}
          <span>w {edge.weight}</span>
        </span>
      </div>

      {/* 主敘述：summary（fallback label）*/}
      <p className="mt-2 text-sm italic leading-relaxed text-ink/75">「{quote}」</p>

      {/* 微 meta：日期範圍 + 信度 */}
      <p className="mt-2 flex flex-wrap items-baseline gap-x-2 text-2xs tracking-widest text-mute/85">
        <span>{dayRange}</span>
        {confidence ? (
          <>
            <span className="text-hairline">·</span>
            <span>{confidence}</span>
          </>
        ) : null}
      </p>
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