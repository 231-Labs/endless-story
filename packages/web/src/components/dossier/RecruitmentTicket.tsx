'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCurrentAccount, useSignAndExecuteTransaction, useSuiClient } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import type { Recruitment } from '@endless-story/shared';
import { ENDLESS_STORY_DEPLOYMENT, tx as endlessTx } from '@endless-story/sdk';
import { generateAttributeSeed } from '@endless-story/llm/seed';
import type { CharacterCandidate, RolledAttribute } from '@endless-story/llm/prompts';
import { moderatePrompt } from '@/lib/actions/moderate-prompt';
import { previewCharacter } from '@/lib/actions/preview-character';
import { generatePortrait } from '@/lib/actions/generate-portrait';
import { redeemVoucher } from '@/lib/actions/redeem-voucher';

type Stage = 'closed' | 'prompt' | 'rolling' | 'pick' | 'painting' | 'portrait' | 'done';

const ATTR_LABEL: Record<string, string> = {
  appearance: '外貌',
  constitution: '筋骨',
  acuity: '機敏',
  disposition: '心性',
};

const GENDER_LABEL: Record<string, string> = {
  male: '男性',
  female: '女性',
  other: '不限性別',
};

const STEPS: { key: Exclude<Stage, 'closed' | 'painting'>; label: string }[] = [
  { key: 'prompt', label: '描述' },
  { key: 'rolling', label: '擲牌' },
  { key: 'pick', label: '揭曉' },
  { key: 'portrait', label: '配像' },
  { key: 'done', label: '入班' },
];

const VOUCHER_TTL_MS = 24n * 60n * 60n * 1000n;
const ENDLESS_DECIMALS = 6;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function stepKeyForStage(stage: Stage): Exclude<Stage, 'closed' | 'painting'> {
  if (stage === 'painting') return 'portrait';
  return stage as Exclude<Stage, 'closed' | 'painting'>;
}

function daysLeft(expiresAt: string): number {
  const now = Date.now();
  const exp = new Date(expiresAt).getTime();
  return Math.max(0, Math.floor((exp - now) / (1000 * 60 * 60 * 24)));
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
  const router = useRouter();
  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const packageId = ENDLESS_STORY_DEPLOYMENT.packageId;
  const sagaId = ENDLESS_STORY_DEPLOYMENT.sagaId;

  const [stage, setStage] = useState<Stage>('closed');
  const [rollingStatus, setRollingStatus] = useState<'moderating' | 'minting' | 'previewing' | null>(null);
  const [prompt, setPrompt] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Flow state — accumulates as steps complete.
  const [voucherId, setVoucherId] = useState<string | null>(null);
  const [attributeSeedHex, setAttributeSeedHex] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [candidate, setCandidate] = useState<CharacterCandidate | null>(null);
  const [rolledValues, setRolledValues] = useState<RolledAttribute[] | null>(null);
  const [portraitUrl, setPortraitUrl] = useState<string | null>(null);
  const [portraitBase64, setPortraitBase64] = useState<string | null>(null);
  const [characterId, setCharacterId] = useState<string | null>(null);

  const isOpen = stage !== 'closed';

  const resetWizard = () => {
    setStage('closed');
    setRollingStatus(null);
    setPrompt('');
    setError(null);
    setVoucherId(null);
    setAttributeSeedHex(null);
    setSignature(null);
    setCandidate(null);
    setRolledValues(null);
    setPortraitUrl(null);
    setPortraitBase64(null);
    setCharacterId(null);
  };

  useEffect(() => {
    onOpenChange?.(isOpen);
  }, [isOpen, onOpenChange]);

  useEffect(() => {
    resetWizard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recruitment.id]);

  // ───────────────────────────────────────────────────────────────
  // Step: prompt → rolling (moderate + mint + preview)
  // ───────────────────────────────────────────────────────────────
  const handleRoll = async () => {
    setError(null);

    if (!account) {
      setError('請先連結錢包');
      return;
    }
    if (!packageId || !sagaId) {
      setError('梨園尚未種子化 — 請通知 admin 跑 cli bootstrap');
      return;
    }

    setStage('rolling');
    setRollingStatus('moderating');

    // 1. Moderate (server action) — wrap so any network / serialization
    // failure surfaces with phase context instead of bare "Failed to fetch".
    let modRes;
    try {
      modRes = await moderatePrompt(prompt);
    } catch (err) {
      setError(`[moderate] ${err instanceof Error ? err.message : String(err)}`);
      setStage('prompt');
      setRollingStatus(null);
      return;
    }
    if (!modRes.ok) {
      setError(modRes.reason ?? '審核未通過');
      setStage('prompt');
      setRollingStatus(null);
      return;
    }
    setSignature(modRes.signature!);

    setRollingStatus('minting');
    // 2. Mint voucher (real on-chain) — pay basePrice from user's ENDLESS coin
    const seed = generateAttributeSeed();
    const seedHex = bytesToHex(seed);
    setAttributeSeedHex(seedHex);

    // Devnet/testnet RPC frequently serves slightly stale owned-object
    // versions, especially right after another tx on the same wallet.
    // Validator rejects with "object … version X unavailable, current Y"
    // — entirely retryable: re-fetch coins, rebuild PTB, re-sign.
    // ONE retry is enough in practice.
    const MINT_RETRIES = 2;
    let mintedVoucherId: string | null = null;
    let lastMintErr: unknown = null;
    for (let attempt = 1; attempt <= MINT_RETRIES; attempt++) {
      try {
        const coinType = `${packageId}::currency::CURRENCY`;
        const coins = await suiClient.getCoins({ owner: account.address, coinType, limit: 50 });
        if (!coins.data || coins.data.length === 0) {
          throw new Error('沒有 ENDLESS 幣 — 請先用右上「領 ENDLESS」');
        }
        const priceBase = BigInt(recruitment.basePrice) * BigInt(10 ** ENDLESS_DECIMALS);

        const tx = new Transaction();
        const coinIds = coins.data.map((c) => c.coinObjectId);
        const primary = tx.object(coinIds[0]);
        if (coinIds.length > 1) {
          tx.mergeCoins(primary, coinIds.slice(1).map((id) => tx.object(id)));
        }
        const [payment] = tx.splitCoins(primary, [priceBase]);

        const reqs = tx.add(endlessTx.recruit.noRequirements());
        const voucherObj = tx.add(
          endlessTx.recruit.mintGenesisVoucher({
            saga: sagaId,
            payment,
            attributeSeed: Array.from(seed),
            hint: prompt.slice(0, 80),
            requirements: reqs,
            intentHint: recruitment.roleIntent.slice(0, 80),
            ttlMs: VOUCHER_TTL_MS,
          }),
        );
        tx.transferObjects([voucherObj], account.address);

        const res = await signAndExecute({ transaction: tx });
        const full = await suiClient.waitForTransaction({
          digest: res.digest,
          options: { showObjectChanges: true, showEffects: true },
        });
        if (full.effects?.status?.status !== 'success') {
          throw new Error(full.effects?.status?.error ?? '交易失敗');
        }
        const voucherType = `${packageId}::recruit::GenesisVoucher`;
        const created = (full.objectChanges ?? []).find(
          (c) => c.type === 'created' && 'objectType' in c && c.objectType === voucherType,
        );
        if (!created || !('objectId' in created)) {
          throw new Error('voucher 物件未找到');
        }
        mintedVoucherId = created.objectId;
        break; // success
      } catch (err) {
        lastMintErr = err;
        const msg = err instanceof Error ? err.message : String(err);
        const isStaleVersion =
          msg.includes('unavailable for consumption') ||
          msg.includes('version unavailable') ||
          msg.includes('ObjectVersionUnavailableForConsumption');
        if (isStaleVersion && attempt < MINT_RETRIES) {
          // Small backoff so RPC has time to settle
          await new Promise((r) => setTimeout(r, 800));
          continue;
        }
        // Non-retryable, or out of retries — bail
        setError(`[mint] ${msg}`);
        setStage('prompt');
        setRollingStatus(null);
        return;
      }
    }
    if (!mintedVoucherId) {
      setError(`[mint] ${lastMintErr instanceof Error ? lastMintErr.message : String(lastMintErr)}`);
      setStage('prompt');
      setRollingStatus(null);
      return;
    }
    setVoucherId(mintedVoucherId);

    setRollingStatus('previewing');
    // 3. Server preview
    try {
      const prev = await previewCharacter({
        attributeSeedHex: seedHex,
        userPrompt: prompt,
        signature: modRes.signature!,
        recruitmentIntent: recruitment.roleIntent,
      });
      if (!prev.ok || !prev.candidate || !prev.rolledValues) {
        throw new Error(prev.error ?? '預覽失敗');
      }
      setCandidate(prev.candidate);
      setRolledValues(prev.rolledValues);
      setStage('pick');
    } catch (err) {
      setError(`[preview] ${err instanceof Error ? err.message : String(err)}`);
      setStage('prompt');
      setRollingStatus(null);
    }
  };

  // ───────────────────────────────────────────────────────────────
  // Step: pick → painting → portrait
  // ───────────────────────────────────────────────────────────────
  const handleAccept = async () => {
    if (!candidate) return;
    setStage('painting');
    setError(null);
    try {
      const port = await generatePortrait({
        character: {
          description: candidate.description,
          physical: {
            gender: candidate.physicalFacts.gender,
            ageYears: candidate.physicalFacts.age,
            body: candidate.physicalFacts.body,
          },
          attributes: candidate.attributes,
        },
        toneHint: '水墨工筆畫風格，宣紙暈染邊緣，淡墨線描 + 水彩設色。',
        recruitmentIntent: recruitment.roleIntent,
      });
      if (!port.ok) {
        // Continue even on portrait failure — wizard can finish without an image.
        setError(`(portrait 失敗，仍可繼續): ${port.error}`);
      }
      setPortraitUrl(port.url ?? null);
      setPortraitBase64(port.base64 ?? null);
      setStage('portrait');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStage('pick');
    }
  };

  // ───────────────────────────────────────────────────────────────
  // Step: portrait → done (auto redeem)
  // ───────────────────────────────────────────────────────────────
  const handleEnroll = async () => {
    if (!candidate || !rolledValues || !attributeSeedHex || !voucherId) return;
    setStage('done');
    setError(null);
    try {
      const sceneId = ENDLESS_STORY_DEPLOYMENT.sceneIds[0];
      if (!sceneId) throw new Error('無可用 scene — 種子化未完成');
      const r = await redeemVoucher({
        voucherId,
        sceneId,
        candidate,
        rolledValues,
        attributeSeedHex,
      });
      if (!r.ok || !r.characterId) throw new Error(r.error ?? 'redeem 失敗');
      setCharacterId(r.characterId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStage('portrait');
    }
  };

  const minEntries: [string, number][] = recruitment.minAttributes
    ? Object.entries(recruitment.minAttributes).filter(
        (entry): entry is [string, number] => typeof entry[1] === 'number'
      )
    : [];

  // ── Navigation handlers ────────────────────────────────────────
  const handleNext = () => {
    if (stage === 'prompt') void handleRoll();
    else if (stage === 'pick') void handleAccept();
    else if (stage === 'portrait') void handleEnroll();
    else if (stage === 'done' && characterId) router.push(`/dossier?id=${characterId}`);
  };

  const handlePrev = () => {
    if (stage === 'prompt' || stage === 'rolling') resetWizard();
    else if (stage === 'pick') resetWizard(); // 緣寂 — voucher will expire
    else if (stage === 'painting' || stage === 'portrait') setStage('pick');
    else if (stage === 'done') resetWizard();
  };

  let prevLabel = '取消';
  let nextLabel = '下一步';
  let canNext = false;

  if (stage === 'prompt') {
    nextLabel = '擲牌';
    canNext = prompt.trim().length > 0;
  } else if (stage === 'rolling') {
    nextLabel = '擲牌中…';
    canNext = false;
  } else if (stage === 'pick') {
    prevLabel = '緣寂';
    nextLabel = '接受';
    canNext = candidate !== null;
  } else if (stage === 'painting') {
    prevLabel = '上一步';
    nextLabel = '繪製中…';
    canNext = false;
  } else if (stage === 'portrait') {
    prevLabel = '重抽';
    nextLabel = '入班';
    canNext = true;
  } else if (stage === 'done') {
    prevLabel = '關閉';
    nextLabel = characterId ? '查看人物卡' : '上鏈中…';
    canNext = characterId !== null;
  }

  const handleOpen = () => setStage('prompt');

      return (
        <>
      <div
        className={`relative overflow-hidden rounded-lg bg-surface ring-1 transition-all duration-500 md:min-h-[440px] ${
          isOpen ? 'scale-100 opacity-100 ring-cinnabar/40 shadow-xl shadow-cinnabar/5' : 'ring-hairline'
        }`}
      >
        {/* Day/Night backgrounds */}
        <div
          className="absolute inset-0 bg-cover bg-center opacity-[0.25] dark:opacity-0 transition-opacity duration-700 pointer-events-none"
          style={{ backgroundImage: `url('/ticket-bg/day-${(index % 5) + 1}.png')` }}
        />
        <div
          className="absolute inset-0 bg-cover bg-center opacity-0 dark:opacity-[0.35] transition-opacity duration-700 pointer-events-none"
          style={{ backgroundImage: `url('/ticket-bg/night-${(index % 5) + 1}.png')` }}
        />
        <div className="absolute inset-0 bg-surface/40 pointer-events-none" />

        <div className="relative z-10 grid grid-cols-1 md:min-h-[440px] md:grid-cols-[1fr_240px]">
          {!isOpen ? (
            <>
              <DefaultMain recruitment={recruitment} minEntries={minEntries} />
              <DefaultStub recruitment={recruitment} days={daysLeft(recruitment.expiresAt)} onOpen={handleOpen} />
            </>
          ) : (
            <>
              <div className="relative flex flex-col justify-center p-6 sm:p-8 md:p-10">
                <div key={stage} className="animate-fade-in-up">
                  {stage === 'prompt' && (
                    <PromptStage prompt={prompt} onPromptChange={setPrompt} />
                  )}
                  {stage === 'rolling' && <RollingStage status={rollingStatus} />}
                  {(stage === 'pick' || stage === 'painting' || stage === 'portrait' || stage === 'done') && candidate && rolledValues && (
                    <RevealStage
                      stage={stage as 'pick' | 'painting' | 'portrait' | 'done'}
                      candidate={candidate}
                      rolledValues={rolledValues}
                      portraitBase64={portraitBase64}
                      portraitUrl={portraitUrl}
                      characterId={characterId}
                    />
                  )}
                  {error && (
                    <p className="mt-4 rounded-md bg-cinnabar/10 px-3 py-2 text-xs text-cinnabar">
                      {error}
                    </p>
                  )}
                </div>
              </div>

              {/* Right stub */}
              <div className="relative border-t-2 border-dashed border-cinnabar/25 bg-cinnabar/[0.015] p-6 sm:p-8 md:border-l-2 md:border-t-0">
                <span aria-hidden className="absolute -top-2 left-1/2 h-4 w-4 -translate-x-1/2 rounded-full bg-canvas ring-1 ring-cinnabar/25 md:left-0 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2" />
                <span aria-hidden className="absolute -top-2 right-1/2 hidden h-4 w-4 -translate-x-1/2 rounded-full bg-canvas ring-1 ring-cinnabar/25 md:bottom-0 md:left-0 md:top-auto md:right-auto md:block md:-translate-x-1/2 md:translate-y-1/2" />

                <div className="flex h-full flex-col gap-6 pt-6 md:pt-0">
                  <div>
                    <p className="text-2xs tracking-widest text-mute">{recruitment.sagaName}</p>
                    <h3 className="mt-2 font-serif text-2xl text-ink sm:text-3xl">
                      {recruitment.specialty}
                    </h3>
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

// ════════════════════════════════════════════════════════════════
// Sub-components
// ════════════════════════════════════════════════════════════════

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
      <span aria-hidden className="absolute -top-2 left-1/2 h-4 w-4 -translate-x-1/2 rounded-full bg-canvas ring-1 ring-cinnabar/25 md:left-0 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2" />
      <span aria-hidden className="absolute -top-2 right-1/2 hidden h-4 w-4 -translate-x-1/2 rounded-full bg-canvas ring-1 ring-cinnabar/25 md:bottom-0 md:left-0 md:top-auto md:right-auto md:block md:-translate-x-1/2 md:translate-y-1/2" />
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
            <span className={`text-2xs tracking-widest transition-colors ${isCurrent ? 'text-ink' : 'text-mute'}`}>
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function PromptStage({ prompt, onPromptChange }: { prompt: string; onPromptChange: (v: string) => void }) {
  return (
    <div className="flex h-full flex-col justify-center text-left">
      <p className="text-2xs tracking-widest text-mute">寫下你想扮演的角色</p>
      <div className="relative mt-4">
        <textarea
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          rows={5}
          maxLength={1200}
          placeholder="他是誰？從哪兒來？想做什麼？他身上一個讓人忘不掉的細節…"
          className="w-full rounded-lg border-2 border-dashed border-hairline bg-surface/30 px-6 py-5 text-[15px] leading-loose text-ink placeholder:text-mute/60 focus:border-cinnabar/50 focus:bg-surface/80 focus:outline-none transition-all resize-none dark:bg-elevated/20"
        />
        <div className="absolute bottom-4 right-6 pointer-events-none">
          <p className="text-2xs text-mute font-mono">{prompt.length}/1200</p>
        </div>
      </div>
    </div>
  );
}

function ElegantSpinner() {
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

function DiceSpinner() {
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

function BrushSpinner() {
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

function RollingStage({ status }: { status: 'moderating' | 'minting' | 'previewing' | null }) {
  const statusText = 
    status === 'moderating' ? '審核意圖…' :
    status === 'minting' ? '鑄造天命…' :
    status === 'previewing' ? '說書人擬人中…' : '擲牌中…';

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

function PaintingStage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 py-12">
      <BrushSpinner />
      <div className="text-center">
        <p className="font-serif text-xl text-ink animate-pulse">繪製畫像中…</p>
        <p className="mt-3 text-2xs tracking-widest text-mute">
          筆墨流轉，為此角留影
        </p>
      </div>
    </div>
  );
}

function RevealStage({
  stage,
  candidate,
  rolledValues,
  portraitBase64,
  portraitUrl,
  characterId,
}: {
  stage: 'pick' | 'painting' | 'portrait' | 'done';
  candidate: CharacterCandidate;
  rolledValues: RolledAttribute[];
  portraitBase64: string | null;
  portraitUrl: string | null;
  characterId: string | null;
}) {
  const src = useMemo(() => {
    if (portraitBase64) return `data:image/png;base64,${portraitBase64}`;
    if (portraitUrl) return portraitUrl;
    return null;
  }, [portraitBase64, portraitUrl]);

  const isEnrolling = stage === 'done' && !characterId;
  const isEnrolled = stage === 'done' && !!characterId;

  let eyebrow = '骰子已落，揭曉';
  if (stage === 'painting') eyebrow = '畫師繪製中…';
  if (stage === 'portrait') eyebrow = '\u00A0';
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
          
          <div className="mt-6 h-px w-16 bg-cinnabar/30" />
          
          <p className="mt-6 max-w-prose text-[15px] leading-loose text-ink/80 sm:text-base line-clamp-6 text-justify">
            {candidate.description}
          </p>

          {isEnrolled && characterId && (
            <a
              href={`https://suiscan.xyz/object/${characterId}`}
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

        {stage !== 'pick' && (
          <div className="relative group overflow-hidden rounded-md bg-canvas ring-1 ring-hairline shadow-2xl shadow-cinnabar/10 w-48 sm:w-56 shrink-0 aspect-[3/4] animate-fade-in-up sm:mr-2 md:mr-4">
            {stage === 'painting' ? (
              <div className="flex h-full w-full items-center justify-center bg-surface/50">
                 <BrushSpinner />
              </div>
          ) : src ? (
            <img src={src} alt={candidate.name} className={`h-full w-full object-cover transition-transform duration-700 ${stage === 'done' ? '' : 'group-hover:scale-105'}`} />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-2xs text-mute bg-surface/50">無像</div>
          )}
        </div>
        )}
      </div>
    </div>
  );
}

function CheckIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
