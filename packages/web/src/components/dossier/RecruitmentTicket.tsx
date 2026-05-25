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
            className={`relative overflow-hidden rounded-lg bg-surface ring-1 transition-all duration-500 flex flex-col min-h-[560px] md:h-[520px] md:min-h-[520px] ${
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

            <div className="relative z-10 grid grid-cols-1 md:grid-cols-[1fr_240px] flex-1 h-full">
              {!isOpen ? (
                <>
                  <DefaultMain recruitment={recruitment} minEntries={minEntries} />
                  <DefaultStub recruitment={recruitment} days={daysLeft(recruitment.expiresAt)} onOpen={handleOpen} />
                </>
              ) : (
                <>
                  <div className="relative flex flex-col p-6 sm:p-8 md:p-10 h-full overflow-y-auto no-scrollbar">
                    <div key={stage} className="animate-fade-in-up flex-1 flex flex-col justify-center">
                  {stage === 'prompt' && (
                    <PromptStage prompt={prompt} onPromptChange={setPrompt} />
                  )}
                  {stage === 'rolling' && <RollingStage status={rollingStatus} />}
                  {stage === 'pick' && candidate && rolledValues && (
                    <PickStage candidate={candidate} rolledValues={rolledValues} />
                  )}
                  {stage === 'painting' && <PaintingStage />}
                  {stage === 'portrait' && candidate && (
                    <PortraitStage
                      candidate={candidate}
                      portraitBase64={portraitBase64}
                      portraitUrl={portraitUrl}
                    />
                  )}
                  {stage === 'done' && candidate && (
                    <DoneStage
                      candidate={candidate}
                      role={recruitment.specialty}
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
                  <div className="relative border-t-2 border-dashed border-cinnabar/25 bg-cinnabar/[0.015] p-6 sm:p-8 md:border-l-2 md:border-t-0 h-full flex flex-col">
                    <span aria-hidden className="absolute -top-2 left-1/2 h-4 w-4 -translate-x-1/2 rounded-full bg-canvas ring-1 ring-cinnabar/25 md:left-0 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2" />
                    <span aria-hidden className="absolute -top-2 right-1/2 hidden h-4 w-4 -translate-x-1/2 rounded-full bg-canvas ring-1 ring-cinnabar/25 md:bottom-0 md:left-0 md:top-auto md:right-auto md:block md:-translate-x-1/2 md:translate-y-1/2" />

                    <div className="flex flex-1 flex-col gap-6 pt-6 md:pt-0">
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
    <div className="flex flex-col justify-center p-6 sm:p-8 md:p-10 h-full overflow-y-auto no-scrollbar">
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
      className="group/stub relative flex flex-col justify-between border-t-2 border-dashed border-cinnabar/25 bg-cinnabar/[0.015] p-6 sm:p-8 md:border-l-2 md:border-t-0 text-left transition-colors hover:bg-cinnabar/[0.03] h-full w-full"
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
    <div className="flex flex-col w-full max-w-lg mx-auto space-y-4 py-4">
      <p className="text-2xs tracking-widest text-mute text-center">寫下你想扮演的角色</p>
      <textarea
        value={prompt}
        onChange={(e) => onPromptChange(e.target.value)}
        rows={8}
        maxLength={1200}
        placeholder="他是誰？從哪兒來？想做什麼？他身上一個讓人忘不掉的細節…"
        className="es-field w-full text-sm leading-relaxed resize-none"
      />
      <p className="text-2xs text-mute text-right">{prompt.length}/1200</p>
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

function RollingStage({ status }: { status: 'moderating' | 'minting' | 'previewing' | null }) {
  const statusText = 
    status === 'moderating' ? '審核意圖…' :
    status === 'minting' ? '鑄造天命…' :
    status === 'previewing' ? '說書人擬人中…' : '擲牌中…';

  return (
    <div className="flex flex-col items-center justify-center gap-8 py-12">
      <ElegantSpinner />
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
    <div className="flex flex-col items-center justify-center gap-8 py-12">
      <ElegantSpinner />
      <div className="text-center">
        <p className="font-serif text-xl text-ink animate-pulse">繪製畫像中…</p>
        <p className="mt-3 text-2xs tracking-widest text-mute">
          筆墨流轉，為此角留影
        </p>
      </div>
    </div>
  );
}

function PickStage({ candidate, rolledValues }: { candidate: CharacterCandidate; rolledValues: RolledAttribute[] }) {
  return (
    <div className="flex flex-col items-center text-center space-y-6 w-full max-w-lg mx-auto py-4">
      <p className="text-2xs tracking-widest text-mute shrink-0">骰子已落，揭曉</p>
      
      <div className="w-full rounded-xl border border-cinnabar/20 bg-gradient-to-b from-elevated/80 to-surface/80 p-6 shadow-xl shadow-cinnabar/5 dark:from-elevated/40 dark:to-surface/40 backdrop-blur-sm">
        <h3 className="font-serif text-3xl text-ink">{candidate.name}</h3>
        <p className="mt-2 text-xs tracking-widest text-mute">
          {candidate.physicalFacts.gender} · {candidate.physicalFacts.age} 歲 · {candidate.physicalFacts.body}
        </p>
        
        <div className="my-5 h-px w-full bg-gradient-to-r from-transparent via-hairline to-transparent" />
        
        <p className="text-sm leading-relaxed text-ink/85 text-justify text-indent-2 line-clamp-6">{candidate.description}</p>
        
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {rolledValues.map((rv) => (
            <span
              key={rv.key}
              className="rounded-full border border-cinnabar/20 bg-cinnabar/5 px-3 py-1 text-xs tracking-widest text-cinnabar"
            >
              {rv.label} <span className="font-serif ml-1">{rv.value}</span>
            </span>
          ))}
        </div>
      </div>
      <p className="text-2xs text-mute shrink-0">接受即送入畫師繪像；緣寂則此票自然過期。</p>
    </div>
  );
}

function PortraitStage({
  candidate,
  portraitBase64,
  portraitUrl,
}: {
  candidate: CharacterCandidate;
  portraitBase64: string | null;
  portraitUrl: string | null;
}) {
  const src = useMemo(() => {
    if (portraitBase64) return `data:image/png;base64,${portraitBase64}`;
    if (portraitUrl) return portraitUrl;
    return null;
  }, [portraitBase64, portraitUrl]);

  return (
    <div className="flex flex-col items-center space-y-8 w-full max-w-2xl mx-auto py-4">
      <p className="text-2xs tracking-widest text-mute shrink-0">配像已成</p>
      
      <div className="flex flex-col sm:flex-row items-center gap-8 w-full">
        <div className="relative group overflow-hidden rounded-md bg-canvas ring-1 ring-hairline shadow-2xl shadow-cinnabar/10 w-48 shrink-0 aspect-[3/4]">
          {src ? (
            <img src={src} alt={candidate.name} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-2xs text-mute">無像</div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-60 pointer-events-none" />
          <div className="absolute bottom-4 left-0 right-0 text-center pointer-events-none">
             <h3 className="font-serif text-2xl text-white drop-shadow-md">{candidate.name}</h3>
          </div>
        </div>
        
        <div className="flex flex-col text-center sm:text-left">
          <h3 className="hidden sm:block font-serif text-3xl text-ink">{candidate.name}</h3>
          <p className="hidden sm:block mt-2 text-2xs tracking-widest text-mute">準備入班</p>
          <div className="hidden sm:block my-4 h-px w-full bg-gradient-to-r from-hairline to-transparent sm:from-hairline sm:to-transparent" />
          <p className="text-sm leading-relaxed text-ink/80 line-clamp-6 text-justify text-indent-2">{candidate.description}</p>
        </div>
      </div>
    </div>
  );
}

function DoneStage({
  candidate,
  role,
  portraitBase64,
  portraitUrl,
  characterId,
}: {
  candidate: CharacterCandidate;
  role: string;
  portraitBase64: string | null;
  portraitUrl: string | null;
  characterId: string | null;
}) {
  const src = portraitBase64 ? `data:image/png;base64,${portraitBase64}` : portraitUrl;
  return (
    <div className="flex flex-col items-center justify-center gap-6 py-4 text-center w-full mx-auto">
      <div className="relative overflow-hidden rounded-md bg-canvas ring-1 ring-cinnabar/30 shadow-2xl shadow-cinnabar/20 w-40 aspect-[3/4]">
        {src ? (
          <img src={src} alt={candidate.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-2xs text-mute">無像</div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-80 pointer-events-none" />
        <div className="absolute bottom-4 left-0 right-0 text-center pointer-events-none">
           <h3 className="font-serif text-xl text-white drop-shadow-md">{candidate.name}</h3>
           <p className="text-2xs tracking-widest text-white/80 mt-1">{role}</p>
        </div>
      </div>
      
      <div className="space-y-3">
        <p className="text-2xs tracking-widest text-mute">已登錄梨園名冊</p>
        {characterId ? (
          <p className="font-mono text-xs text-ink px-4 py-2 bg-surface rounded border border-hairline shadow-sm">{characterId}</p>
        ) : (
          <p className="text-2xs text-mute animate-pulse">上鏈中…</p>
        )}
      </div>
    </div>
  );
}
