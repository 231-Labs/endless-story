'use client';

import { useEffect, useState } from 'react';
import type { Recruitment } from '@endless-story/shared';

type Stage = 'closed' | 'prompt' | 'rolling' | 'pick' | 'portrait' | 'done';

interface Candidate {
  name: string;
  attributes: { 筋骨: number; 心性: number; 機敏: number; 外貌: number };
  description: string;
}

const ATTR_LABEL: Record<string, string> = {
  constitution: '筋骨',
  disposition: '心性',
  acuity: '機敏',
  appearance: '外貌',
};

const GENDER_LABEL: Record<string, string> = {
  male: '需男',
  female: '需女',
  other: '不限性別',
};

const STEPS: { key: Exclude<Stage, 'closed'>; label: string }[] = [
  { key: 'prompt', label: '描述' },
  { key: 'rolling', label: '擲牌' },
  { key: 'pick', label: '選定' },
  { key: 'portrait', label: '配像' },
  { key: 'done', label: '入班' },
];

const PORTRAIT_TONES = [
  {
    bg: 'bg-rose-50 dark:bg-rose-950/40',
    ring: 'ring-rose-100 dark:ring-rose-900/50',
    text: 'text-rose-300 dark:text-rose-800',
  },
  {
    bg: 'bg-indigo-50 dark:bg-indigo-950/40',
    ring: 'ring-indigo-100 dark:ring-indigo-900/50',
    text: 'text-indigo-300 dark:text-indigo-800',
  },
  {
    bg: 'bg-amber-50 dark:bg-amber-950/40',
    ring: 'ring-amber-100 dark:ring-amber-900/50',
    text: 'text-amber-300 dark:text-amber-700',
  },
];

const MOCK_CANDIDATES_BY_SPECIALTY: Record<string, Candidate[]> = {
  武小生: [
    {
      name: '墨秋雨',
      attributes: { 筋骨: 72, 心性: 88, 機敏: 80, 外貌: 82 },
      description:
        '從蘇州河碼頭走進來的少年。眉峰落得利落、目光卻有點怯，會替人擋酒前先低聲說「我來」。',
    },
    {
      name: '蘇令薰',
      attributes: { 筋骨: 75, 心性: 65, 機敏: 92, 外貌: 88 },
      description:
        '霞飛路口洋行少東家的私生子。穿著比誰都得體、講話比誰都圓滑；只有提到生母時眼神會頓一下。',
    },
    {
      name: '葉子衿',
      attributes: { 筋骨: 70, 心性: 78, 機敏: 85, 外貌: 95 },
      description:
        '京戲班解散後流落到上海。台上的氣場壓得住場、台下卻孤僻；只跟胡琴說話。',
    },
  ],
};

function getCandidates(specialty: string): Candidate[] {
  return MOCK_CANDIDATES_BY_SPECIALTY[specialty] ?? MOCK_CANDIDATES_BY_SPECIALTY['武小生'];
}

function daysLeft(expiresAt: string): number {
  const now = Date.now();
  const exp = new Date(expiresAt).getTime();
  return Math.max(0, Math.floor((exp - now) / (1000 * 60 * 60 * 24)));
}

export function RecruitmentTicket({
  recruitment,
  onOpenChange,
}: {
  recruitment: Recruitment;
  onOpenChange?: (open: boolean) => void;
}) {
  const [stage, setStage] = useState<Stage>('closed');
  const [prompt, setPrompt] = useState('');
  const [pickedIdx, setPickedIdx] = useState<number | null>(null);
  const [portraitIdx, setPortraitIdx] = useState<number | null>(null);
  const [collapsing, setCollapsing] = useState(false);

  const candidates = getCandidates(recruitment.specialty);
  const isOpen = stage !== 'closed';

  useEffect(() => {
    onOpenChange?.(isOpen);
  }, [isOpen, onOpenChange]);

  // Reset internal state when the ticket's recruitment changes (carousel switch)
  useEffect(() => {
    setStage('closed');
    setPrompt('');
    setPickedIdx(null);
    setPortraitIdx(null);
    setCollapsing(false);
  }, [recruitment.id]);

  const close = () => {
    setStage('closed');
    setPrompt('');
    setPickedIdx(null);
    setPortraitIdx(null);
    setCollapsing(false);
  };

  const handleOpen = () => setStage('prompt');
  const handleRoll = () => {
    if (!prompt.trim()) return;
    setStage('rolling');
    setTimeout(() => setStage('pick'), 1400);
  };
  const handlePick = (idx: number) => {
    setPickedIdx(idx);
    setStage('portrait');
  };
  const handlePortraitPick = (idx: number) => {
    setPortraitIdx(idx);
    setStage('done');
  };

  const minEntries: [string, number][] = recruitment.minAttributes
    ? Object.entries(recruitment.minAttributes).filter(
        (entry): entry is [string, number] => typeof entry[1] === 'number'
      )
    : [];

  // Unified wrapper — same element across closed/open so React doesn't remount
  // on stage change. Only inner content swaps; outer dimensions stay constant.
  const handleKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!isOpen && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      handleOpen();
    }
  };

  return (
    <div
      role={!isOpen ? 'button' : undefined}
      tabIndex={!isOpen ? 0 : undefined}
      onClick={!isOpen ? handleOpen : undefined}
      onKeyDown={!isOpen ? handleKey : undefined}
      aria-label={!isOpen ? `應榜 ${recruitment.specialty}` : undefined}
      className={`group relative select-none overflow-hidden rounded-lg bg-surface ring-1 transition-all duration-500 md:min-h-[440px] ${
        isOpen
          ? `ring-cinnabar/40 shadow-xl shadow-cinnabar/5 ${
              collapsing ? 'scale-95 opacity-0' : 'scale-100 opacity-100'
            }`
          : 'cursor-pointer ring-cinnabar/25 hover:shadow-xl hover:shadow-cinnabar/5 hover:ring-cinnabar/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-cinnabar/60 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas'
      }`}
    >
      <div className="grid grid-cols-1 md:min-h-[440px] md:grid-cols-[1fr_240px]">
        {!isOpen ? (
          <>
            <DefaultMain recruitment={recruitment} minEntries={minEntries} />
            <DefaultStub recruitment={recruitment} days={daysLeft(recruitment.expiresAt)} />
          </>
        ) : (
          <>
        {/* Left main — stage content morphs, vertically centered */}
        <div className="relative flex flex-col justify-center p-6 sm:p-8 md:p-10">
          <div key={stage} className="animate-fade-in-up">
            {stage === 'prompt' ? (
              <PromptStage
                prompt={prompt}
                onPromptChange={setPrompt}
                onSubmit={handleRoll}
              />
            ) : null}
            {stage === 'rolling' ? <RollingStage /> : null}
            {stage === 'pick' ? (
              <PickStage candidates={candidates} onPick={handlePick} />
            ) : null}
            {stage === 'portrait' && pickedIdx != null ? (
              <PortraitStage candidate={candidates[pickedIdx]} onPick={handlePortraitPick} />
            ) : null}
            {stage === 'done' && pickedIdx != null && portraitIdx != null ? (
              <DoneStage
                candidate={candidates[pickedIdx]}
                role={recruitment.specialty}
                portraitTone={PORTRAIT_TONES[portraitIdx]}
                onClose={close}
              />
            ) : null}
          </div>
        </div>

        {/* Right stub — perforation + stepper + ticket info + close */}
        <div className="relative border-t-2 border-dashed border-cinnabar/25 bg-cinnabar/[0.015] p-6 sm:p-8 md:border-l-2 md:border-t-0">
          {/* Perforation cut-out circles */}
          <span
            aria-hidden
            className="absolute -top-2 left-1/2 h-4 w-4 -translate-x-1/2 rounded-full bg-canvas ring-1 ring-cinnabar/25 md:left-0 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2"
          />
          <span
            aria-hidden
            className="absolute -top-2 right-1/2 hidden h-4 w-4 -translate-x-1/2 rounded-full bg-canvas ring-1 ring-cinnabar/25 md:bottom-0 md:left-0 md:top-auto md:right-auto md:block md:-translate-x-1/2 md:translate-y-1/2"
          />

          <button
            type="button"
            onClick={close}
            aria-label="關閉"
            className="es-icon-button absolute right-3 top-3 h-8 w-8 text-base"
          >
            ×
          </button>

          <div className="flex h-full flex-col gap-6 pt-6 md:pt-0">
            <div>
              <p className="text-2xs tracking-widest text-mute">{recruitment.sagaName}</p>
              <h3 className="mt-2 font-serif text-2xl text-ink sm:text-3xl">{recruitment.specialty}</h3>
            </div>

            <VerticalStepper stage={stage as Exclude<Stage, 'closed'>} />

            <div className="mt-auto space-y-1 text-2xs tracking-widest text-mute">
              <p>
                <span className="font-serif text-base text-ink">{recruitment.basePrice}</span>{' '}
                Endless
              </p>
              <p>剩 {recruitment.slots} 位</p>
            </div>
          </div>
        </div>
          </>
        )}
      </div>
    </div>
  );
}

function DefaultMain({
  recruitment,
  minEntries,
}: {
  recruitment: Recruitment;
  minEntries: [string, number][];
}) {
  return (
    <div className="flex flex-col justify-center p-6 sm:p-8 md:p-10">
      <p className="text-2xs tracking-widest text-mute">
        {recruitment.sagaName} · {recruitment.membership === 'internal' ? '春雪社徵召' : '江湖客串'}
      </p>
      <h3 className="mt-3 font-serif text-3xl text-ink sm:text-4xl">{recruitment.specialty}</h3>

      {(minEntries.length > 0 || recruitment.genderRequirement) ? (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {recruitment.genderRequirement && recruitment.genderRequirement !== 'other' ? (
            <span className="rounded-full bg-cinnabar/5 px-2.5 py-0.5 text-2xs tracking-widest text-cinnabar/80 ring-1 ring-cinnabar/20">
              {GENDER_LABEL[recruitment.genderRequirement]}
            </span>
          ) : null}
          {minEntries.map(([key, value]) => (
            <span
              key={key}
              className="rounded-full bg-cinnabar/5 px-2.5 py-0.5 text-2xs tracking-widest text-cinnabar/80 ring-1 ring-cinnabar/20"
            >
              {ATTR_LABEL[key] ?? key} ≥ {value}
            </span>
          ))}
        </div>
      ) : null}

      <p className="mt-5 max-w-prose text-[15px] leading-loose text-ink/75 sm:text-base">
        {recruitment.roleIntent}
      </p>
    </div>
  );
}

function DefaultStub({
  recruitment,
  days,
}: {
  recruitment: Recruitment;
  days: number;
}) {
  return (
    <div className="relative border-t-2 border-dashed border-cinnabar/25 bg-cinnabar/[0.015] p-6 sm:p-8 md:border-l-2 md:border-t-0">
      <span
        aria-hidden
        className="absolute -top-2 left-1/2 h-4 w-4 -translate-x-1/2 rounded-full bg-canvas ring-1 ring-cinnabar/25 md:left-0 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2"
      />
      <span
        aria-hidden
        className="absolute -top-2 right-1/2 hidden h-4 w-4 -translate-x-1/2 rounded-full bg-canvas ring-1 ring-cinnabar/25 md:bottom-0 md:left-0 md:top-auto md:right-auto md:block md:-translate-x-1/2 md:translate-y-1/2"
      />

      <div className="flex h-full flex-col justify-between gap-6 md:gap-8">
        <div>
          <p className="font-serif text-2xl text-ink sm:text-3xl">
            {recruitment.basePrice}
            <span className="ml-1.5 text-base text-mute">Endless</span>
          </p>
          <div className="mt-3 space-y-1 text-2xs tracking-widest text-mute">
            <p>剩 {recruitment.slots} 位</p>
            <p>{days} 日內截止</p>
          </div>
        </div>

        <p className="text-sm tracking-wide text-cinnabar transition-transform group-hover:translate-x-1">
          應榜 →
        </p>
      </div>
    </div>
  );
}

function VerticalStepper({ stage }: { stage: Exclude<Stage, 'closed'> }) {
  const currentIdx = STEPS.findIndex((s) => s.key === stage);
  return (
    <ol className="space-y-3">
      {STEPS.map((step, i) => {
        const isCurrent = i === currentIdx;
        const isReached = i <= currentIdx;
        return (
          <li key={step.key} className="flex items-center gap-3">
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-2xs transition-colors ${
                isCurrent
                  ? 'bg-cinnabar text-canvas'
                  : isReached
                    ? 'bg-cinnabar/10 text-cinnabar ring-1 ring-cinnabar/30'
                    : 'bg-surface text-mute ring-1 ring-hairline dark:bg-elevated/35'
              }`}
            >
              {i + 1}
            </span>
            <span
              className={`text-2xs tracking-widest transition-colors ${
                isCurrent ? 'text-ink' : 'text-mute'
              }`}
            >
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function PromptStage({
  prompt,
  onPromptChange,
  onSubmit,
}: {
  prompt: string;
  onPromptChange: (v: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-ink/75">
        寫一段你對這角色的想像 — 班主會看，過審才擲牌。
      </p>
      <textarea
        value={prompt}
        onChange={(e) => onPromptChange(e.target.value)}
        rows={5}
        placeholder="他從哪裡來？身上帶著什麼樣的習慣？什麼事會讓他突然安靜下來？"
        maxLength={200}
        className="es-field resize-none"
      />
      <div className="flex items-center justify-between gap-3">
        <p className="text-2xs tracking-widest text-mute">{prompt.length} / 200</p>
        <button
          type="button"
          onClick={onSubmit}
          disabled={!prompt.trim()}
          className="rounded bg-cinnabar px-6 py-2.5 text-sm text-canvas transition-colors hover:bg-seal disabled:cursor-not-allowed disabled:opacity-40"
        >
          擲牌
        </button>
      </div>
    </div>
  );
}

function RollingStage() {
  return (
    <div className="flex min-h-[260px] flex-col items-center justify-center gap-4">
      <div className="flex gap-3">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="block h-16 w-12 rounded bg-cinnabar/10 ring-1 ring-cinnabar/30"
            style={{
              animation: `endless-roll 1.4s ease-in-out ${i * 0.15}s infinite`,
            }}
          />
        ))}
      </div>
      <p className="text-sm text-mute">班主在擲牌…</p>
    </div>
  );
}

function PickStage({
  candidates,
  onPick,
}: {
  candidates: Candidate[];
  onPick: (idx: number) => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink/75">候選角色已就緒，請選擇一位繼續。</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {candidates.map((c, idx) => (
          <CandidateCard key={idx} candidate={c} onPick={() => onPick(idx)} />
        ))}
      </div>
    </div>
  );
}

function CandidateCard({
  candidate,
  onPick,
}: {
  candidate: Candidate;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="es-choice-card flex flex-col gap-3 p-4"
    >
      <p className="font-serif text-base text-ink">{candidate.name}</p>
      <dl className="grid grid-cols-4 gap-2 text-center">
        {(Object.entries(candidate.attributes) as [string, number][]).map(([k, v]) => (
          <div key={k}>
            <dt className="text-2xs tracking-widest text-mute">{k}</dt>
            <dd className="mt-0.5 font-mono text-base text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="text-[13px] leading-relaxed text-ink/75 line-clamp-3">
        {candidate.description}
      </p>
    </button>
  );
}

function PortraitStage({
  candidate,
  onPick,
}: {
  candidate: Candidate;
  onPick: (idx: number) => void;
}) {
  const initial = candidate.name[0];
  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-3">
        <p className="font-serif text-base text-ink">{candidate.name}</p>
        <p className="text-2xs tracking-widest text-mute">配像 · 三選一</p>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {PORTRAIT_TONES.map((tone, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => onPick(idx)}
            aria-label={`頭像候選 ${idx + 1}`}
            className={`group relative aspect-[3/4] overflow-hidden rounded-md ring-1 transition-all hover:ring-2 ${tone.bg} ${tone.ring} hover:ring-cinnabar`}
          >
            <div className="absolute inset-0 flex items-center justify-center">
              <span className={`font-serif text-6xl ${tone.text}`}>{initial}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function DoneStage({
  candidate,
  role,
  portraitTone,
  onClose,
}: {
  candidate: Candidate;
  role: string;
  portraitTone: { bg: string; ring: string; text: string };
  onClose: () => void;
}) {
  const [revealStage, setRevealStage] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setRevealStage(1), 400);
    const t2 = setTimeout(() => setRevealStage(2), 1100);
    const t3 = setTimeout(() => setRevealStage(3), 1700);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, []);

  const initial = candidate.name[0];

  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center gap-6 py-2 text-center">
      <div
        className={`relative aspect-[3/4] w-52 overflow-hidden rounded-md ring-1 transition-all duration-700 ${portraitTone.bg} ${portraitTone.ring}`}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`font-serif text-8xl ${portraitTone.text}`}>{initial}</span>
        </div>
      </div>

      <div
        className={`transition-all duration-500 ${
          revealStage >= 1 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
        }`}
      >
        <p className="font-serif text-3xl text-ink">{candidate.name}</p>
        <div className="mt-2 flex items-center justify-center gap-2.5 text-2xs tracking-widest text-mute">
          <span>{role}</span>
          {revealStage >= 2 ? (
            <>
              <span className="text-hairline">·</span>
              <span className="rounded-sm bg-cinnabar/10 px-2 py-0.5 text-cinnabar ring-1 ring-cinnabar/30">
                入班
              </span>
            </>
          ) : null}
        </div>
      </div>

      <div
        className={`flex items-center gap-3 transition-all duration-500 ${
          revealStage >= 3 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
        }`}
      >
        <a
          href="/dossier"
          className="rounded bg-cinnabar px-6 py-2.5 text-sm text-canvas transition-colors hover:bg-seal"
        >
          前往人物誌 →
        </a>
        <button
          type="button"
          onClick={onClose}
          className="es-outline-button px-6 py-2.5 text-sm hover:border-ink/30 hover:text-ink"
        >
          關閉
        </button>
      </div>
    </div>
  );
}
