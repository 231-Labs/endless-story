import type { Character, RelationshipEdge } from '@endless-story/shared';

const ATTR_LABEL: Record<keyof Character['attributes'], string> = {
  constitution: '筋骨',
  disposition: '心性',
  acuity: '機敏',
  appearance: '外貌',
};

export function ProfileTab({
  character,
  outgoingEdges,
  charactersById,
}: {
  character: Character;
  outgoingEdges: RelationshipEdge[];
  charactersById: Map<string, Character>;
}) {
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
      <article className="space-y-8 lg:col-span-2">
        <section>
          <h2 className="font-serif text-lg text-ink sm:text-xl">敘描</h2>
          <p className="mt-3 max-w-prose text-base leading-loose text-ink/80">
            {character.description}
          </p>
        </section>
        <section>
          <h2 className="font-serif text-lg text-ink sm:text-xl">外貌設定</h2>
          <p className="mt-1 text-2xs tracking-widest text-mute">
            mint 時寫上鏈、所有 portrait 生成都 anchor 於此
          </p>
          <p className="mt-3 max-w-prose text-base leading-loose text-ink/75">
            {character.physicalFacts}
          </p>
        </section>
        <section>
          <h2 className="font-serif text-lg text-ink sm:text-xl">天賦</h2>
          <Attributes attrs={character.attributes} />
        </section>
      </article>
      <aside className="space-y-8">
        <SurvivalBlock character={character} />
        <RelationshipsBlock edges={outgoingEdges} charactersById={charactersById} />
      </aside>
    </div>
  );
}

function Attributes({ attrs }: { attrs: Character['attributes'] }) {
  const entries = Object.entries(attrs) as [keyof Character['attributes'], number][];
  return (
    <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
      {entries.map(([key, value]) => (
        <div key={key}>
          <dt className="text-2xs tracking-widest text-mute">{ATTR_LABEL[key]}</dt>
          <dd className="mt-1 flex items-baseline gap-2">
            <span className="font-mono text-xl text-ink">{value}</span>
            <span className="text-2xs tracking-widest text-mute">/ 100</span>
          </dd>
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-hairline/60">
            <div className="h-full bg-cinnabar/70 dark:bg-cinnabar/80" style={{ width: `${value}%` }} />
          </div>
        </div>
      ))}
    </dl>
  );
}

function SurvivalBlock({ character }: { character: Character }) {
  const { funds, dailyCost, salary, daysLeft } = character.survival;
  return (
    <section>
      <h3 className="text-2xs tracking-widest text-mute">日常開銷</h3>
      <dl className="mt-3 space-y-2 text-sm">
        <Row label="現銀" value={`${funds}`} />
        <Row label="每日開銷" value={`${dailyCost}`} />
        <Row label="班中俸" value={`${salary}`} />
        <Row label="可撐日數" value={`${daysLeft} 日`} />
      </dl>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-mute">{label}</dt>
      <dd className="font-mono text-ink">{value}</dd>
    </div>
  );
}

function RelationshipsBlock({
  edges,
  charactersById,
}: {
  edges: RelationshipEdge[];
  charactersById: Map<string, Character>;
}) {
  if (edges.length === 0) {
    return (
      <section>
        <h3 className="text-2xs tracking-widest text-mute">關係</h3>
        <p className="mt-3 text-sm text-mute">尚未對誰留下顯著的記憶。</p>
      </section>
    );
  }
  return (
    <section>
      <h3 className="text-2xs tracking-widest text-mute">關係</h3>
      <ul className="mt-3 space-y-4">
        {edges.slice(0, 5).map((edge) => {
          const target = charactersById.get(edge.toId);
          return (
            <li key={`${edge.fromId}-${edge.toId}`} className="text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-serif text-ink">
                  {target?.name ?? edge.toId}
                </span>
                <span className="text-2xs tracking-widest text-mute">
                  weight {edge.weight}
                </span>
              </div>
              <p className="mt-1 italic text-ink/70">「{edge.label}」</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
