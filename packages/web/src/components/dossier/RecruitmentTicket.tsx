'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Recruitment } from '@endless-story/shared';

type Stage = 'closed' | 'prompt' | 'rolling' | 'pick' | 'painting' | 'portrait' | 'done';

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
  male: '男性',
  female: '女性',
  other: '不限性別',
};

const STEPS: { key: Exclude<Stage, 'closed' | 'painting'>; label: string }[] = [
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

function stepKeyForStage(stage: Stage): Exclude<Stage, 'closed' | 'painting'> {
  if (stage === 'painting') return 'portrait';
  return stage as Exclude<Stage, 'closed' | 'painting'>;
}

export function RecruitmentTicket({
  recruitment,
  index = 0,
  onOpenChange,
}: {
  recruitment: Recruitment;
  index?: number;
  onOpenChange?: (open: boolean) => void;
}) {
  const [stage, setStage] = useState<Stage>('closed');
  const [prompt, setPrompt] = useState('');
  const [pickedIdx, setPickedIdx] = useState<number | null>(null);
  const [portraitIdx, setPortraitIdx] = useState<number | null>(null);
  const router = useRouter();
  const stageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const candidates = getCandidates(recruitment.specialty);
  const isOpen = stage !== 'closed';

  const resetWizard = () => {
    if (stageTimerRef.current) clearTimeout(stageTimerRef.current);
    setStage('closed');
    setPrompt('');
    setPickedIdx(null);
    setPortraitIdx(null);
  };

  useEffect(() => {
    onOpenChange?.(isOpen);
  }, [isOpen, onOpenChange]);

  useEffect(() => {
    return () => {
      if (stageTimerRef.current) clearTimeout(stageTimerRef.current);
    };
  }, []);

  // Reset internal state when the ticket's recruitment changes (carousel switch)
  useEffect(() => {
    resetWizard();
  }, [recruitment.id]);

  const close = () => resetWizard();

  const handleOpen = () => setStage('prompt');

  const minEntries: [string, number][] = recruitment.minAttributes
    ? Object.entries(recruitment.minAttributes).filter(
        (entry): entry is [string, number] => typeof entry[1] === 'number'
      )
    : [];

  const handleNext = () => {
    if (stageTimerRef.current) clearTimeout(stageTimerRef.current);

    if (stage === 'prompt') {
      setStage('rolling');
      stageTimerRef.current = setTimeout(() => setStage('pick'), 1400);
    } else if (stage === 'pick') {
      setStage('painting');
      stageTimerRef.current = setTimeout(() => setStage('portrait'), 2500);
    } else if (stage === 'portrait') {
      setStage('done');
    } else if (stage === 'done') {
      router.push('/dossier?id=char_cheng_hengyu');
    }
  };

  const handlePrev = () => {
    if (stage === 'prompt' || stage === 'rolling' || stage === 'done') {
      close();
    } else if (stage === 'pick') {
      setStage('prompt');
    } else if (stage === 'painting') {
      setStage('pick');
    } else if (stage === 'portrait') {
      setStage('pick');
    }
  };

  let prevLabel = '取消';
  let nextLabel = '下一步';
  let canNext = false;

  if (stage === 'prompt') {
    nextLabel = '擲牌';
    canNext = prompt.trim().length > 0;
  } else if (stage === 'rolling') {
    nextLabel = '擲牌中...';
    canNext = false;
  } else if (stage === 'pick') {
    prevLabel = '上一步';
    nextLabel = '選定';
    canNext = pickedIdx !== null;
  } else if (stage === 'painting') {
    prevLabel = '上一步';
    nextLabel = '繪製中...';
    canNext = false;
  } else if (stage === 'portrait') {
    prevLabel = '上一步';
    nextLabel = '配像';
    canNext = portraitIdx !== null;
  } else if (stage === 'done') {
    prevLabel = '關閉';
    nextLabel = '查看人物卡';
    canNext = true;
  }

  return (
    <>
      <div
        className={`relative overflow-hidden rounded-lg bg-surface ring-1 transition-all duration-500 md:min-h-[440px] ${
          isOpen ? 'scale-100 opacity-100 ring-cinnabar/40 shadow-xl shadow-cinnabar/5' : 'ring-hairline'
        }`}
      >
        {/* Day/Night Chinese Painting Backgrounds */}
        <div
          className="absolute inset-0 bg-cover bg-center opacity-[0.25] dark:opacity-0 transition-opacity duration-700 pointer-events-none"
          style={{
            backgroundImage: `url('/ticket-bg/day-${(index % 5) + 1}.png')`
          }}
        />
        <div
          className="absolute inset-0 bg-cover bg-center opacity-0 dark:opacity-[0.35] transition-opacity duration-700 pointer-events-none"
          style={{
            backgroundImage: `url('/ticket-bg/night-${(index % 5) + 1}.png')`
          }}
        />
        {/* Subtle overlay to ensure text legibility */}
        <div className="absolute inset-0 bg-surface/40 pointer-events-none" />

        <div className="relative z-10 grid grid-cols-1 md:min-h-[440px] md:grid-cols-[1fr_240px]">
          {!isOpen ? (
            <>
              <DefaultMain recruitment={recruitment} minEntries={minEntries} />
              <DefaultStub recruitment={recruitment} days={daysLeft(recruitment.expiresAt)} onOpen={handleOpen} />
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
                />
              ) : null}
              {stage === 'rolling' ? <RollingStage /> : null}
              {stage === 'pick' ? (
                <PickStage candidates={candidates} pickedIdx={pickedIdx} onPick={setPickedIdx} />
              ) : null}
              {stage === 'painting' ? <PaintingStage /> : null}
              {stage === 'portrait' && pickedIdx != null ? (
                <PortraitStage candidate={candidates[pickedIdx]} portraitIdx={portraitIdx} onPick={setPortraitIdx} />
              ) : null}
              {stage === 'done' && pickedIdx != null && portraitIdx != null ? (
                <DoneStage
                  candidate={candidates[pickedIdx]}
                  role={recruitment.specialty}
                  portraitTone={PORTRAIT_TONES[portraitIdx]}
                />
              ) : null}
            </div>
          </div>

          {/* Right stub — perforation + stepper + ticket info */}
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

      {/* Unified Bottom Navigation for Wizard */}
      {isOpen && (
        <div className="mt-6 flex items-center justify-center gap-3 animate-fade-in-up">
          <button
            type="button"
            onClick={handlePrev}
            className="inline-flex h-9 items-center gap-2 rounded-full border border-hairline bg-surface px-4 text-sm text-mute transition-colors hover:border-cinnabar/60 hover:bg-elevated hover:text-ink"
          >
            <span aria-hidden>←</span>
            <span className="text-2xs tracking-widest">{prevLabel}</span>
          </button>

          <div className="flex min-w-20 items-center justify-center gap-2">
            {STEPS.map((step) => {
              const isActive = step.key === stepKeyForStage(stage);
              return (
                <div
                  key={step.key}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    isActive ? 'w-8 bg-cinnabar' : 'w-1.5 bg-hairline'
                  }`}
                />
              );
            })}
          </div>

          <button
            type="button"
            onClick={handleNext}
            disabled={!canNext}
            className="inline-flex h-9 items-center gap-2 rounded-full border border-hairline bg-surface px-4 text-sm text-mute transition-colors hover:border-cinnabar/60 hover:bg-elevated hover:text-ink disabled:pointer-events-none disabled:opacity-40"
          >
            <span className="text-2xs tracking-widest">{nextLabel}</span>
            <span aria-hidden>→</span>
          </button>
        </div>
      )}
    </>
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
  onOpen,
}: {
  recruitment: Recruitment;
  days: number;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group/stub relative flex flex-col justify-between border-t-2 border-dashed border-cinnabar/25 bg-cinnabar/[0.015] p-6 sm:p-8 md:border-l-2 md:border-t-0 text-left transition-colors hover:bg-cinnabar/[0.03]"
    >
      <span
        aria-hidden
        className="absolute -top-2 left-1/2 h-4 w-4 -translate-x-1/2 rounded-full bg-canvas ring-1 ring-cinnabar/25 md:left-0 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2"
      />
      <span
        aria-hidden
        className="absolute -top-2 right-1/2 hidden h-4 w-4 -translate-x-1/2 rounded-full bg-canvas ring-1 ring-cinnabar/25 md:bottom-0 md:left-0 md:top-auto md:right-auto md:block md:-translate-x-1/2 md:translate-y-1/2"
      />

      <div className="flex h-full w-full flex-col justify-between gap-6 md:gap-8">
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

        <p className="text-sm tracking-wide text-cinnabar transition-transform group-hover/stub:translate-x-1">
          應榜 →
        </p>
      </div>
    </button>
  );
}

function VerticalStepper({ stage }: { stage: Exclude<Stage, 'closed'> }) {
  const activeKey = stepKeyForStage(stage);
  const currentIdx = STEPS.findIndex((s) => s.key === activeKey);
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
}: {
  prompt: string;
  onPromptChange: (v: string) => void;
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
  pickedIdx,
  onPick,
}: {
  candidates: Candidate[];
  pickedIdx: number | null;
  onPick: (idx: number) => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink/75">候選角色已就緒，請選擇一位繼續。</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {candidates.map((c, idx) => (
          <CandidateCard key={idx} candidate={c} isSelected={pickedIdx === idx} onPick={() => onPick(idx)} />
        ))}
      </div>
    </div>
  );
}

function PaintingStage() {
  return (
    <div className="flex flex-col items-center justify-center gap-8">
      <div className="flex gap-4 sm:gap-6">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="relative aspect-[3/4] w-28 sm:w-36 overflow-hidden rounded-md bg-surface ring-1 ring-hairline"
          >
            <div
              className="absolute inset-0 bg-cinnabar/20 animate-pulse"
              style={{ animationDelay: `${i * 200}ms`, animationDuration: '1.5s' }}
            />
          </div>
        ))}
      </div>
      <p className="text-sm tracking-widest text-mute animate-pulse">畫師正在為角色繪製肖像…</p>
    </div>
  );
}

function CandidateCard({
  candidate,
  isSelected,
  onPick,
}: {
  candidate: Candidate;
  isSelected: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className={`es-choice-card flex flex-col gap-3 p-4 text-left transition-all ${
        isSelected
          ? '!ring-2 !ring-cinnabar !bg-cinnabar/5'
          : 'ring-1 ring-hairline hover:ring-cinnabar/40 hover:bg-surface'
      }`}
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
  portraitIdx,
  onPick,
}: {
  candidate: Candidate;
  portraitIdx: number | null;
  onPick: (idx: number) => void;
}) {
  const initial = candidate.name[0];
  return (
    <div className="mx-auto grid max-w-[640px] grid-cols-3 gap-4 sm:gap-6">
      {PORTRAIT_TONES.map((tone, idx) => {
        const isSelected = portraitIdx === idx;
        return (
          <button
            key={idx}
            type="button"
            onClick={() => onPick(idx)}
            aria-label={`頭像候選 ${idx + 1}`}
            className={`group relative aspect-[3/4] overflow-hidden rounded-md transition-all ${
              isSelected
                ? `ring-2 ring-cinnabar scale-[1.02] shadow-md ${tone.bg} ${tone.text}`
                : `ring-1 hover:ring-2 hover:ring-cinnabar/50 ${tone.bg} ${tone.ring} ${tone.text}`
            }`}
          >
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="font-serif text-7xl sm:text-8xl">{initial}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function DoneStage({
  candidate,
  role,
  portraitTone,
}: {
  candidate: Candidate;
  role: string;
  portraitTone: { bg: string; ring: string; text: string };
}) {
  const [revealStage, setRevealStage] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setRevealStage(1), 400);
    const t2 = setTimeout(() => setRevealStage(2), 1100);
    const t3 = setTimeout(() => setRevealStage(3), 1800);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, []);

  const initial = candidate.name[0];

  return (
    <div className="flex flex-col sm:flex-row items-center sm:items-stretch justify-center gap-8 sm:gap-12 py-2">
      {/* Left: Portrait */}
      <div
        className={`relative shrink-0 aspect-[3/4] w-48 sm:w-56 overflow-hidden rounded-md ring-1 transition-all duration-700 ${portraitTone.bg} ${portraitTone.ring}`}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`font-serif text-8xl ${portraitTone.text}`}>{initial}</span>
        </div>
      </div>

      {/* Right: Info & Stats */}
      <div className="flex flex-col justify-center text-center sm:text-left">
        <div
          className={`transition-all duration-500 ${
            revealStage >= 1 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
          }`}
        >
          <div className="flex items-center justify-center sm:justify-start gap-3">
            <p className="font-serif text-3xl sm:text-4xl text-ink">{candidate.name}</p>
            <span className="rounded-sm bg-cinnabar/10 px-2 py-0.5 text-2xs tracking-widest text-cinnabar ring-1 ring-cinnabar/30">
              入班
            </span>
          </div>
          <p className="mt-2 text-sm tracking-widest text-mute">{role}</p>
        </div>

        <div
          className={`mt-6 sm:mt-8 transition-all duration-500 delay-100 ${
            revealStage >= 2 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
          }`}
        >
          <dl className="grid grid-cols-4 gap-4 sm:gap-6 text-center sm:text-left">
            {(Object.entries(candidate.attributes) as [string, number][]).map(([k, v]) => (
              <div key={k}>
                <dt className="text-2xs tracking-widest text-mute">{k}</dt>
                <dd className="mt-1 font-mono text-xl text-ink">{v}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div
          className={`mt-6 sm:mt-8 max-w-sm transition-all duration-500 delay-200 ${
            revealStage >= 3 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
          }`}
        >
          <p className="text-sm leading-relaxed text-ink/75">
            {candidate.description}
          </p>
        </div>
      </div>
    </div>
  );
}
