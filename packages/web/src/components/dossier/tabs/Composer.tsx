'use client';

import { useState } from 'react';

type Kind = 'inject_dream' | 'whisper';

const COPY: Record<Kind, { hint: string; placeholder: string; submit: string }> = {
  inject_dream: {
    hint: '她下一次入睡才會夢到。內容會以「夢的口吻」混入她的反思裡 — 不一定原樣浮現，可能被她遺忘、也可能多年後才在某段對白裡冒出來。',
    placeholder: '夢的素材 — 一個人、一句話、一個畫面…',
    submit: '寄入她的夢',
  },
  whisper: {
    hint: '她在下一個 tick 就會聽見 — 像她自己腦中的一段內心音。可能照辦、可能抗拒、無論如何會被她寫進記憶。',
    placeholder: '一句你想讓她在台口聽見的話…',
    submit: '在她耳邊',
  },
};

export function Composer() {
  const [kind, setKind] = useState<Kind | null>(null);
  const [text, setText] = useState('');
  const [sent, setSent] = useState<{ kind: Kind; text: string } | null>(null);

  const toggle = (next: Kind) => {
    setKind((current) => (current === next ? null : next));
    setText('');
    setSent(null);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!kind || !text.trim()) return;
    setSent({ kind, text: text.trim() });
    setText('');
    setKind(null);
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <ActionButton label="注夢" active={kind === 'inject_dream'} onClick={() => toggle('inject_dream')} />
        <ActionButton label="耳語" active={kind === 'whisper'} onClick={() => toggle('whisper')} />
      </div>

      {kind ? (
        <form
          onSubmit={submit}
          className="es-soft-panel space-y-3 p-4 sm:p-5"
        >
          <p className="text-2xs leading-relaxed tracking-widest text-mute">{COPY[kind].hint}</p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder={COPY[kind].placeholder}
            className="es-field resize-none"
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-2xs tracking-widest text-mute">寫上 Walrus · Seal 限 owner 可解</p>
            <button
              type="submit"
              disabled={!text.trim()}
              className="rounded bg-cinnabar px-4 py-2 text-sm text-canvas transition-colors hover:bg-seal disabled:cursor-not-allowed disabled:opacity-40"
            >
              {COPY[kind].submit}
            </button>
          </div>
        </form>
      ) : sent ? (
        <p className="rounded-md border border-dashed border-jade/40 bg-jade/10 p-4 text-sm text-jade dark:border-jade/50 dark:bg-jade/15">
          已寄出。她會在下一{sent.kind === 'inject_dream' ? '段夢' : '個 tick'}感應到。
        </p>
      ) : (
        <p className="text-sm text-mute">
          注夢藏在夢裡、慢、深、可能被她遺忘；耳語直接傳入她當下心緒、快、淺、不易藏。
        </p>
      )}
    </section>
  );
}

function ActionButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded border px-4 py-2 text-sm transition-colors ${
        active
          ? 'border-cinnabar bg-cinnabar/5 text-cinnabar'
          : 'border-hairline bg-surface text-ink hover:bg-ink/5 dark:bg-elevated/30 dark:hover:bg-elevated'
      }`}
    >
      {label}
    </button>
  );
}
