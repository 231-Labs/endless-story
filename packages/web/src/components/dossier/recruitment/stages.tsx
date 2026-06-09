'use client';

import { useMemo, useState } from 'react';
import type { Recruitment } from '@endless-story/shared';
import type { CharacterCandidate, RolledAttribute } from '@endless-story/llm/prompts';
import { objectUrl } from '@/lib/explorer';
import { ATTR_LABEL, GENDER_LABEL, STEPS, stepKeyForStage, type Stage } from './helpers';

// ════════════════════════════════════════════════════════════════
// Sub-components
// ════════════════════════════════════════════════════════════════

export function RecruitmentDetails({
  recruitment,
  minEntries,
}: {
  recruitment: Recruitment;
  minEntries: [string, number][];
}) {
  return (
    <div className="flex flex-col text-left">
      <p className="text-2xs tracking-widest text-mute">
        {recruitment.sagaName} · {recruitment.membership === 'internal' ? `${recruitment.sagaName}徵召` : '江湖客串'}
      </p>
      <h3 className="mt-3 font-serif text-3xl text-ink sm:text-4xl">{recruitment.specialty}</h3>

      {(minEntries.length > 0 || recruitment.genderRequirement) && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {recruitment.genderRequirement && recruitment.genderRequirement !== 'other' && (
            <span className="rounded-full bg-cinnabar/5 px-2.5 py-0.5 text-2xs tracking-widest text-cinnabar/80 ring-1 ring-cinnabar/20">
              {GENDER_LABEL[recruitment.genderRequirement]}
            </span>
          )}
          {minEntries.map(([key, value]) => (
            <span
              key={key}
              className="rounded-full bg-cinnabar/5 px-2.5 py-0.5 text-2xs tracking-widest text-cinnabar/80 ring-1 ring-cinnabar/20"
            >
              {ATTR_LABEL[key] ?? key} ≥ {value}
            </span>
          ))}
        </div>
      )}

      <p className="mt-5 max-w-prose text-[15px] leading-loose text-ink/75 sm:text-base">
        {recruitment.roleIntent}
      </p>
    </div>
  );
}

export function DefaultMain({
  recruitment,
  minEntries,
}: {
  recruitment: Recruitment;
  minEntries: [string, number][];
}) {
  return (
    <div className="flex flex-col justify-center p-6 sm:p-8 md:p-10">
      <RecruitmentDetails recruitment={recruitment} minEntries={minEntries} />
    </div>
  );
}

export function DefaultStub({
  recruitment,
  days,
  onOpen,
  drawMode,
  onDrawModeChange,
}: {
  recruitment: Recruitment;
  days: number;
  onOpen: () => void;
  drawMode: 'single' | 'bulk';
  onDrawModeChange: (mode: 'single' | 'bulk') => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      className="group/stub relative flex cursor-pointer flex-col justify-between border-t-2 border-dashed border-cinnabar/25 bg-cinnabar/[0.015] p-6 sm:p-8 md:border-l-2 md:border-t-0 text-left transition-colors hover:bg-cinnabar/[0.03]"
    >
      <span aria-hidden className="absolute -top-2 left-1/2 h-4 w-4 -translate-x-1/2 rounded-full bg-canvas ring-1 ring-cinnabar/25 md:left-0 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2" />
      <span aria-hidden className="absolute -top-2 right-1/2 hidden h-4 w-4 -translate-x-1/2 rounded-full bg-canvas ring-1 ring-cinnabar/25 md:bottom-0 md:left-0 md:top-auto md:right-auto md:block md:-translate-x-1/2 md:translate-y-1/2" />
      <div className="flex h-full w-full flex-col justify-between gap-6 md:gap-8">
        <div>
          <p className="font-serif text-2xl text-ink sm:text-3xl">
            {drawMode === 'bulk' ? recruitment.bulkPrice ?? recruitment.basePrice : recruitment.basePrice}
            <span className="ml-1.5 text-base text-mute">Endless</span>
            <DrawModeToggle
              drawMode={drawMode}
              onToggle={() => onDrawModeChange(drawMode === 'bulk' ? 'single' : 'bulk')}
              stopPropagation
            />
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
    </div>
  );
}

/**
 * Tiny ∞ glyph that sits right after the price and toggles single ⇄ guaranteed.
 * Lit (cinnabar) when guaranteed mode is active. `stopPropagation` for use inside the
 * clickable resting card so it doesn't also open the ticket.
 */
export function DrawModeToggle({
  drawMode,
  onToggle,
  stopPropagation,
}: {
  drawMode: 'single' | 'bulk';
  onToggle: () => void;
  stopPropagation?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        if (stopPropagation) e.stopPropagation();
        onToggle();
      }}
      aria-label="切換抽法（單抽 / 必應）"
      title={
        drawMode === 'bulk'
          ? '必應：包骰到符合徵召門檻，一次付清 · 點此切回單抽'
          : '單抽：一筆一抽，先天隨緣 · 點此切換必應（包骰到符合）'
      }
      className={`ml-2 inline-flex h-5 w-5 translate-y-[-1px] items-center justify-center rounded-full align-middle text-base leading-none transition-colors ${
        drawMode === 'bulk'
          ? 'bg-cinnabar/15 text-cinnabar ring-1 ring-cinnabar/40'
          : 'text-mute hover:text-cinnabar'
      }`}
    >
      ∞
    </button>
  );
}

export function VerticalStepper({ stage }: { stage: Exclude<Stage, 'closed'> }) {
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
            <span className={`text-2xs tracking-widest transition-colors ${isCurrent ? 'text-ink' : 'text-mute'}`}>
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function RejectedStage({
  rolledValues,
  reason,
  bulkPrice,
  onSwitchToBulk,
}: {
  rolledValues: RolledAttribute[];
  reason: string;
  bulkPrice: number;
  onSwitchToBulk: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <div className="relative flex items-center justify-center w-24 h-24 text-cinnabar/70 rotate-[-12deg] mix-blend-multiply dark:mix-blend-screen opacity-90 drop-shadow-sm mb-6">
        <div className="absolute inset-0 border-4 border-double border-cinnabar/70 rounded-md" />
        <div className="absolute inset-1.5 border border-cinnabar/70 rounded-sm opacity-60" />
        <span className="font-serif text-3xl font-bold opacity-90 mt-1" style={{ writingMode: 'vertical-rl', letterSpacing: '0.2em' }}>落選</span>
      </div>
      <p className="text-sm font-serif font-medium tracking-widest text-cinnabar">不符徵召條件</p>
      <p className="mt-2 text-xs opacity-75 leading-relaxed text-cinnabar max-w-xs">{reason}</p>

      <div className="mt-8 flex justify-center flex-wrap gap-2 max-w-sm">
        {rolledValues.map((rv) => (
          <span
            key={rv.key}
            className="rounded-full bg-surface px-3 py-1 text-xs tracking-widest text-mute ring-1 ring-hairline"
          >
            {rv.label} <span className="font-serif ml-1">{rv.value}</span>
          </span>
        ))}
      </div>

      {/* 落選引導:骰不到 → 一鍵轉必應（包骰到符合，必得入選） */}
      <button
        type="button"
        onClick={onSwitchToBulk}
        title={`必應：自動重骰先天，直到符合徵召門檻才入選 · ${bulkPrice} Endless`}
        className="mt-7 inline-flex items-center gap-1.5 rounded-full border border-cinnabar/35 px-4 py-1.5 text-xs tracking-widest text-cinnabar transition-colors hover:border-cinnabar hover:bg-cinnabar hover:text-canvas"
      >
        <span className="text-sm leading-none">∞</span>
        改投必應 · 必得入選
      </button>
      <p className="mt-2 text-2xs tracking-widest text-mute">重骰至達標 · {bulkPrice} Endless</p>
    </div>
  );
}

export function PromptStage({ prompt, onPromptChange, rolledValues }: { prompt: string; onPromptChange: (v: string) => void; rolledValues: RolledAttribute[] | null }) {
  return (
    <div className="flex h-full flex-col justify-center text-left">
      <div className="flex items-center justify-between">
        <p className="text-2xs tracking-widest text-mute">寫下你想扮演的角色</p>
        {rolledValues && (
          <div className="flex flex-wrap gap-1.5 justify-end max-w-[200px] sm:max-w-none">
            {rolledValues.map((rv) => (
              <span
                key={rv.key}
                className="rounded-full bg-cinnabar/5 px-2 py-0.5 text-2xs tracking-widest text-cinnabar/80 ring-1 ring-cinnabar/20"
              >
                {rv.label} <span className="font-serif ml-0.5">{rv.value}</span>
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="relative mt-4">
        <textarea
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          rows={5}
          maxLength={1200}
          placeholder="是誰？從哪兒來？想做什麼？身上一個讓人忘不掉的細節…"
          className="w-full rounded-lg border-2 border-dashed border-hairline bg-surface/30 px-6 py-5 text-[15px] leading-loose text-ink placeholder:text-mute/60 focus:border-cinnabar/50 focus:bg-surface/80 focus:outline-none transition-all resize-none dark:bg-elevated/20"
        />
        <div className="absolute bottom-4 right-6 pointer-events-none">
          <p className="text-2xs text-mute font-mono">{prompt.length}/1200</p>
        </div>
      </div>
    </div>
  );
}

export function ElegantSpinner() {
  return (
    <div className="relative flex h-24 w-24 items-center justify-center">
      <div className="absolute inset-0 animate-[spin_4s_linear_infinite] rounded-full border-t-2 border-cinnabar/40 border-r-2 border-r-transparent" />
      <div className="absolute inset-2 animate-[spin_3s_linear_infinite_reverse] rounded-full border-b-2 border-jade/40 border-l-2 border-l-transparent" />
      <div className="absolute inset-4 animate-[spin_5s_linear_infinite] rounded-full border-t-2 border-ink/20 border-l-2 border-l-transparent" />
      <div className="absolute inset-0 flex items-center justify-center animate-pulse">
         <span className="h-2.5 w-2.5 rounded-full bg-cinnabar/60" />
      </div>
    </div>
  );
}

export function DiceSpinner() {
  return (
    <div className="relative flex h-24 w-24 items-center justify-center">
      <div className="absolute inset-0 animate-[spin_3s_linear_infinite] rounded-full border-t-2 border-cinnabar/60 border-l-2 border-l-transparent" />
      <div className="absolute inset-3 animate-[spin_2s_linear_infinite_reverse] rounded-full border-b-2 border-seal/40 border-r-2 border-r-transparent" />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="grid grid-cols-2 gap-1 animate-pulse">
          <span className="h-1.5 w-1.5 rounded-full bg-cinnabar" />
          <span className="h-1.5 w-1.5 rounded-full bg-cinnabar" />
          <span className="h-1.5 w-1.5 rounded-full bg-cinnabar" />
          <span className="h-1.5 w-1.5 rounded-full bg-cinnabar" />
        </div>
      </div>
    </div>
  );
}

export function BrushSpinner() {
  return (
    <div className="relative flex h-24 w-24 items-center justify-center">
      <div className="absolute inset-0 rounded-full border border-hairline" />
      <div className="absolute inset-0 animate-[spin_2.5s_ease-in-out_infinite] rounded-full border-t-2 border-ink/80 border-r-2 border-r-transparent" />
      <div className="absolute inset-2 animate-[spin_4s_ease-in-out_infinite_reverse] rounded-full border-b-2 border-mute/50 border-l-2 border-l-transparent" />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-ink/20 to-transparent animate-pulse blur-sm" />
      </div>
    </div>
  );
}

export function RollingStage({ status }: { status: 'minting' | 'moderating' | 'generating' | null }) {
  const statusText =
    status === 'minting' ? '鑄造天命…' :
    status === 'moderating' ? '審核意圖…' :
    status === 'generating' ? '說書人擬人中…' : '請稍候…';

  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 py-12">
      {status === 'minting' ? <DiceSpinner /> : <ElegantSpinner />}
      <div className="text-center">
        <p className="font-serif text-xl text-ink animate-pulse">{statusText}</p>
        <p className="mt-3 text-2xs tracking-widest text-mute">
          請靜候片刻，切勿關閉視窗
        </p>
      </div>
    </div>
  );
}

export function RevealStage({
  stage,
  candidate,
  rolledValues,
  portraitBase64,
  portraitUrl,
  characterId,
  rejectedReason,
  isPainting,
}: {
  stage: 'pick' | 'done';
  candidate: CharacterCandidate;
  rolledValues: RolledAttribute[];
  portraitBase64: string | null;
  portraitUrl: string | null;
  characterId: string | null;
  rejectedReason?: string | null;
  isPainting?: boolean;
}) {
  const src = useMemo(() => {
    if (portraitBase64) return `data:image/png;base64,${portraitBase64}`;
    if (portraitUrl) return portraitUrl;
    return null;
  }, [portraitBase64, portraitUrl]);

  // Toggle public description / inner secret (same text block, ticket height stays fixed).
  const [showSecret, setShowSecret] = useState(false);

  const isEnrolling = stage === 'done' && !characterId;
  const isEnrolled = stage === 'done' && !!characterId;

  let eyebrow = '骰子已落，揭曉';
  if (isEnrolling) eyebrow = '上鏈中…';
  if (isEnrolled) eyebrow = '已登錄梨園名冊';

  return (
    <div className="flex h-full flex-col justify-center text-left">
      <div className="flex items-center justify-between">
        <p className="text-2xs tracking-widest text-mute transition-colors">
          {eyebrow}
        </p>
      </div>

      <div className="mt-4 flex flex-col-reverse sm:flex-row items-center sm:items-center gap-8 sm:gap-12 w-full relative">
        <div className="flex flex-col flex-1 relative w-full pr-0 sm:pr-4">
          <h3 className="font-serif text-4xl text-ink sm:text-5xl">{candidate.name}</h3>
          <p className="mt-3 text-xs tracking-widest text-mute">
            {candidate.physicalFacts.gender} · {candidate.physicalFacts.age} 歲 · {candidate.physicalFacts.body}
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            {rolledValues.map((rv) => (
              <span
                key={rv.key}
                className="rounded-full bg-cinnabar/5 px-3 py-1 text-xs tracking-widest text-cinnabar/90 ring-1 ring-cinnabar/20"
              >
                {rv.label} <span className="font-serif ml-1">{rv.value}</span>
              </span>
            ))}
          </div>

          {/* 分隔線 + 心底秘密切換(有秘密才出現)。切換不撐高戲票:同一塊文字區在
              公開描述／心底秘密之間切。秘密不上鏈、不公開,僅化成角色私密記憶。 */}
          <div className="mt-6 flex items-center gap-3">
            <div className="h-px w-16 bg-cinnabar/30" />
            {candidate.secret ? (
              <button
                type="button"
                onClick={() => setShowSecret((v) => !v)}
                aria-pressed={showSecret}
                className="ml-auto text-2xs tracking-[0.25em] text-mute/70 transition-colors hover:text-cinnabar/90"
              >
                {showSecret ? '看公開簡述' : '心底秘密'}
              </button>
            ) : null}
          </div>

          {/* Public description / inner secret stacked in ONE grid cell: the block
              height is always max(both) regardless of which is shown, so toggling
              just cross-fades the text — the name + 屬性 rows above never shift. */}
          <div className="mt-6 grid max-w-prose">
            <p
              className={`col-start-1 row-start-1 text-[15px] leading-loose sm:text-base line-clamp-6 text-justify text-ink/80 transition-opacity duration-300 ${
                showSecret ? 'opacity-0 pointer-events-none' : 'opacity-100'
              }`}
            >
              {candidate.description}
            </p>
            {candidate.secret ? (
              <p
                className={`col-start-1 row-start-1 text-[15px] leading-loose sm:text-base line-clamp-6 text-justify italic text-ink/70 transition-opacity duration-300 ${
                  showSecret ? 'opacity-100' : 'opacity-0 pointer-events-none'
                }`}
              >
                {candidate.secret}
              </p>
            ) : null}
          </div>

          {isEnrolled && characterId && (
            <a
              href={objectUrl(characterId)}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute -top-4 right-2 sm:right-6 animate-stamp z-10 group cursor-pointer"
              title="在區塊鏈瀏覽器查看此角色"
            >
              <div className="flex items-center justify-center w-[4.5rem] h-[4.5rem] text-cinnabar/90 mix-blend-multiply dark:mix-blend-screen opacity-90 drop-shadow-sm transition-all duration-300 group-hover:scale-110 group-hover:text-cinnabar group-hover:drop-shadow-md">
                <svg viewBox="0 0 100 100" className="w-full h-full" fill="currentColor">
                  <defs>
                    <filter id={`ink-wash-${characterId}`} x="-10%" y="-10%" width="120%" height="120%">
                      <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="3" result="noise" />
                      <feDisplacementMap in="SourceGraphic" in2="noise" scale="2" xChannelSelector="R" yChannelSelector="G" />
                      <feGaussianBlur stdDeviation="0.25" />
                    </filter>
                    <mask id={`flower-mask-${characterId}`}>
                      <rect width="100" height="100" fill="white" />
                      <circle cx="50" cy="50" r="9" fill="black" />
                      <line x1="50" y1="50" x2="50" y2="28" stroke="black" strokeWidth="1.5" strokeLinecap="round" />
                      <line x1="50" y1="50" x2="70.9" y2="43.2" stroke="black" strokeWidth="1.5" strokeLinecap="round" />
                      <line x1="50" y1="50" x2="62.9" y2="67.8" stroke="black" strokeWidth="1.5" strokeLinecap="round" />
                      <line x1="50" y1="50" x2="37.1" y2="67.8" stroke="black" strokeWidth="1.5" strokeLinecap="round" />
                      <line x1="50" y1="50" x2="29.1" y2="43.2" stroke="black" strokeWidth="1.5" strokeLinecap="round" />
                    </mask>
                  </defs>
                  <g filter={`url(#ink-wash-${characterId})`}>
                    <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" strokeWidth="3" />
                    <g mask={`url(#flower-mask-${characterId})`}>
                      <circle cx="50" cy="26" r="22" />
                      <circle cx="72.8" cy="42.6" r="22" />
                      <circle cx="64.1" cy="69.4" r="22" />
                      <circle cx="35.9" cy="69.4" r="22" />
                      <circle cx="27.2" cy="42.6" r="22" />
                    </g>
                    <circle cx="50" cy="50" r="4" fill="currentColor" />
                  </g>
                </svg>
              </div>
              <div className="absolute -bottom-1 -right-1 opacity-0 transition-opacity duration-300 group-hover:opacity-100 rounded-full bg-surface p-1 text-cinnabar shadow-sm ring-1 ring-hairline">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </div>
            </a>
          )}
        </div>

        {stage !== 'pick' ? (
          <div className="relative group overflow-hidden rounded-md bg-canvas ring-1 ring-hairline shadow-2xl shadow-cinnabar/10 w-48 sm:w-56 shrink-0 aspect-[3/4] animate-fade-in-up sm:mr-2 md:mr-4">
            {isPainting ? (
              <div className="flex h-full w-full items-center justify-center bg-surface/50">
                 <BrushSpinner />
              </div>
          ) : src ? (
            <img src={src} alt={candidate.name} className={`h-full w-full object-cover transition-transform duration-700 ${stage === 'done' ? '' : 'group-hover:scale-105'}`} />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-2xs text-mute bg-surface/50">無像</div>
          )}
        </div>
        ) : isPainting ? (
          <div className="relative group overflow-hidden rounded-md bg-canvas ring-1 ring-hairline shadow-2xl shadow-cinnabar/10 w-48 sm:w-56 shrink-0 aspect-[3/4] animate-fade-in-up sm:mr-2 md:mr-4">
            <div className="flex h-full w-full items-center justify-center bg-surface/50">
               <BrushSpinner />
            </div>
          </div>
        ) : src ? (
          <div className="relative group overflow-hidden rounded-md bg-canvas ring-1 ring-hairline shadow-2xl shadow-cinnabar/10 w-48 sm:w-56 shrink-0 aspect-[3/4] animate-fade-in-up sm:mr-2 md:mr-4">
            <img src={src} alt={candidate.name} className={`h-full w-full object-cover transition-transform duration-700 group-hover:scale-105`} />
          </div>
        ) : rejectedReason ? (
          <div className="w-48 sm:w-56 shrink-0 flex flex-col items-center justify-center animate-fade-in-up sm:mr-2 md:mr-4 select-none">
            <div className="relative flex items-center justify-center w-24 h-24 text-cinnabar/70 rotate-[-12deg] mix-blend-multiply dark:mix-blend-screen opacity-90 drop-shadow-sm">
              <div className="absolute inset-0 border-4 border-double border-cinnabar/70 rounded-md" />
              <div className="absolute inset-1.5 border border-cinnabar/70 rounded-sm opacity-60" />
              <span className="font-serif text-3xl font-bold opacity-90 mt-1" style={{ writingMode: 'vertical-rl', letterSpacing: '0.2em' }}>落選</span>
            </div>
            <div className="mt-8 text-center text-cinnabar">
              <p className="text-sm font-serif font-medium tracking-widest">不符徵召條件</p>
              <p className="mt-2 text-xs opacity-75 leading-relaxed max-w-[160px]">{rejectedReason}</p>
              <p className="mt-3 text-2xs opacity-50 tracking-widest">可選「緣寂」收尾</p>
            </div>
          </div>
        ) : (
          <div className="relative group overflow-hidden rounded-md bg-canvas ring-1 ring-hairline shadow-2xl shadow-cinnabar/10 w-48 sm:w-56 shrink-0 aspect-[3/4] animate-fade-in-up sm:mr-2 md:mr-4">
            <div className="flex h-full w-full items-center justify-center text-2xs text-mute bg-surface/50">無像</div>
          </div>
        )}
      </div>
    </div>
  );
}
