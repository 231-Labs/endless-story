import type { Character, CharacterPersona, RelationshipEdge } from '@endless-story/shared';
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
  outgoingEdges,
  charactersById,
}: {
  character: Character;
  persona: CharacterPersona | null;
  outgoingEdges: RelationshipEdge[];
  charactersById: Map<string, Character>;
}) {
  return (
    <div className="grid grid-cols-1 gap-16 lg:grid-cols-[1fr_320px] lg:gap-24">
      {/* Main Column */}
      <div className="space-y-16">
        <section>
          <h2 className="font-serif text-2xl text-ink">敘描</h2>
          <div className="mt-6">
            <p className="text-base leading-loose text-ink/85 sm:text-lg sm:leading-loose">
              {character.description}
            </p>
          </div>
        </section>

        <SoulSection persona={persona} />

        <section>
          <h2 className="font-serif text-2xl text-ink">外貌設定</h2>
          <div className="mt-6">
            <p className="text-base leading-loose text-ink/85 sm:text-lg sm:leading-loose">
              {character.physicalFacts}
            </p>
            <p className="mt-4 text-xs tracking-widest text-mute">
              * mint 時寫上鏈、所有 portrait 生成都 anchor 於此
            </p>
          </div>
        </section>
      </div>

      {/* Sidebar */}
      <aside className="space-y-16">
        <section>
          <h3 className="font-serif text-xl text-ink">天賦</h3>
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
          <h3 className="font-serif text-xl text-ink">日常開銷</h3>
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
              <span className="font-mono text-base text-ink">{character.survival.daysLeft} 日</span>
            </div>
          </div>
        </section>

        <section>
          <h3 className="font-serif text-xl text-ink">關係</h3>
          {outgoingEdges.length === 0 ? (
            <p className="mt-8 text-sm leading-relaxed text-mute">尚未對誰留下顯著的記憶。</p>
          ) : (
            <ul className="mt-8 space-y-8">
              {outgoingEdges.slice(0, 6).map((edge) => {
                const target = charactersById.get(edge.toId);
                const name = target?.name ?? edge.toId;
                return (
                  <li key={`${edge.fromId}-${edge.toId}`}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-serif text-lg text-ink">{name}</span>
                      <span className="text-2xs tabular-nums tracking-widest text-mute">w {edge.weight}</span>
                    </div>
                    <p className="mt-2 text-sm italic leading-relaxed text-ink/75">「{edge.label}」</p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </aside>
    </div>
  );
}