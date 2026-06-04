'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCurrentAccount, useSignAndExecuteTransaction, useSuiClient } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import type { Recruitment } from '@endless-story/shared';
import { ENDLESS_STORY_DEPLOYMENT, tx as endlessTx } from '@endless-story/sdk';
import { generateAttributeSeed, rollAttributesFromSeed } from '@endless-story/llm/seed';
import type { CharacterCandidate, RolledAttribute } from '@endless-story/llm/prompts';
import { DEFAULT_ATTRIBUTE_SCHEMA } from '@/lib/config/attribute-schema';
import { objectUrl } from '@/lib/explorer';
import { moderatePrompt } from '@/lib/actions/moderate-prompt';
import { previewCharacter } from '@/lib/actions/preview-character';
import { generatePortrait } from '@/lib/actions/generate-portrait';
import { redeemVoucher } from '@/lib/actions/redeem-voucher';

type Stage = 'closed' | 'minting' | 'rejected' | 'prompt' | 'generating' | 'pick' | 'done';

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

const STEPS: { key: Exclude<Stage, 'closed' | 'rejected'>; label: string }[] = [
  { key: 'minting', label: '擲牌' },
  { key: 'prompt', label: '描述' },
  { key: 'generating', label: '凝形' },
  { key: 'pick', label: '揭曉' },
  { key: 'done', label: '入班' },
];

const VOUCHER_TTL_MS = 24n * 60n * 60n * 1000n;
const ENDLESS_DECIMALS = 6;

/**
 * Off-chain `Recruitment.genderRequirement` uses English (`male`/`female`/`other`)
 * but the on-chain `Character.profile.physical_facts.gender` is whatever the
 * LLM emits — currently the Chinese label (`男`/`女`/`中性`, see
 * `packages/llm/src/prompts/character.ts`). VoucherRequirements does an exact
 * string match on redeem, so we have to convert here.
 *
 * **`'other'` semantics**: the seed data + admin form + display cards have
 * always used `'other'` (and `undefined`) interchangeably to mean "不限/any
 * gender". So the chain-side requirement for `'other'` is an *empty* allow
 * list (no check), NOT the literal `'中性'` character gender. If we ever
 * want to enforce non-binary specifically, that needs a new requirement
 * value distinct from `'other'`.
 */
const GENDER_CHAIN: Record<'male' | 'female', string> = {
  male: '男',
  female: '女',
};

/** True when the recruitment imposes no gender filter (`undefined` or 'other'). */
function isGenderUnrestricted(g: Recruitment['genderRequirement']): boolean {
  return g === undefined || g === 'other';
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Build the parallel-vector inputs the contract's `new_voucher_requirements`
 * expects, from a Recruitment's `genderRequirement` + `minAttributes`.
 */
function recruitmentRequirements(recruitment: Recruitment): {
  allowedGenders: string[];
  requiredAttributeKeys: string[];
  requiredAttributeMins: bigint[];
} {
  const allowedGenders = isGenderUnrestricted(recruitment.genderRequirement)
    ? []
    : [GENDER_CHAIN[recruitment.genderRequirement as 'male' | 'female']];
  const requiredAttributeKeys: string[] = [];
  const requiredAttributeMins: bigint[] = [];
  if (recruitment.minAttributes) {
    for (const [key, min] of Object.entries(recruitment.minAttributes)) {
      if (typeof min === 'number') {
        requiredAttributeKeys.push(key);
        requiredAttributeMins.push(BigInt(min));
      }
    }
  }
  return { allowedGenders, requiredAttributeKeys, requiredAttributeMins };
}

/**
 * Mirrors the contract's `check_voucher_requirements` so the wizard can warn
 * the user *before* paying for the portrait / redeem if the rolled candidate
 * won't satisfy the recruitment. Chain still enforces — this is UX only.
 */
function candidateMeetsRequirements(
  recruitment: Recruitment,
  candidate: CharacterCandidate | null,
  rolledValues: RolledAttribute[],
): { ok: true } | { ok: false; reason: string } {
  if (candidate && !isGenderUnrestricted(recruitment.genderRequirement)) {
    const wanted = GENDER_CHAIN[recruitment.genderRequirement as 'male' | 'female'];
    if (candidate.physicalFacts.gender !== wanted) {
      return { ok: false, reason: `性別要求：${wanted}，擲出：${candidate.physicalFacts.gender}` };
    }
  }
  if (recruitment.minAttributes) {
    for (const [key, min] of Object.entries(recruitment.minAttributes)) {
      if (typeof min !== 'number') continue;
      const got = rolledValues.find((r) => r.key === key)?.value ?? 0;
      if (got < min) {
        const label = ATTR_LABEL[key] ?? key;
        return { ok: false, reason: `${label} 須 ≥ ${min}，擲出：${got}` };
      }
    }
  }
  return { ok: true };
}

function stepKeyForStage(stage: Stage): Exclude<Stage, 'closed' | 'rejected'> {
  if (stage === 'rejected') return 'minting';
  return stage as Exclude<Stage, 'closed' | 'rejected'>;
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
  const [rollingStatus, setRollingStatus] = useState<'minting' | 'moderating' | 'generating' | null>(null);
  const [prompt, setPrompt] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Flow state — accumulates as steps complete.
  const [voucherId, setVoucherId] = useState<string | null>(null);
  const [attributeSeedHex, setAttributeSeedHex] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [candidate, setCandidate] = useState<CharacterCandidate | null>(null);
  const [rolledValues, setRolledValues] = useState<RolledAttribute[] | null>(null);
  const [portraitUrl, setPortraitUrl] = useState<string | null>(null);
  const [portraitBlobId, setPortraitBlobId] = useState<string | null>(null);
  const [portraitBase64, setPortraitBase64] = useState<string | null>(null);
  const [characterId, setCharacterId] = useState<string | null>(null);
  const [isPainting, setIsPainting] = useState(false);

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
    setPortraitBlobId(null);
    setPortraitBase64(null);
    setCharacterId(null);
    setIsPainting(false);
  };

  useEffect(() => {
    onOpenChange?.(isOpen);
  }, [isOpen, onOpenChange]);

  useEffect(() => {
    resetWizard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recruitment.id]);

  // ───────────────────────────────────────────────────────────────
  // Step: closed → minting → prompt/rejected
  // ───────────────────────────────────────────────────────────────
  const handleMint = async () => {
    setError(null);
    setStage('minting');

    if (!account) {
      setError('請先連結錢包');
      setRollingStatus(null);
      return;
    }
    if (!packageId || !sagaId) {
      setError('梨園尚未種子化 — 請通知 admin 跑 cli bootstrap');
      setRollingStatus(null);
      return;
    }

    setRollingStatus('minting');

    // 1. Mint voucher (real on-chain) — pay basePrice from user's ENDLESS coin
    const seed = generateAttributeSeed();
    const seedHex = bytesToHex(seed);
    setAttributeSeedHex(seedHex);

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

        const cardReqs = recruitmentRequirements(recruitment);
        const reqs = cardReqs.allowedGenders.length === 0 &&
          cardReqs.requiredAttributeKeys.length === 0
          ? tx.add(endlessTx.recruit.noRequirements())
          : tx.add(
              endlessTx.recruit.newVoucherRequirements({
                allowedGenders: cardReqs.allowedGenders,
                allowedSpecies: [],
                minAge: 0,
                maxAge: 0,
                requiredAttributeKeys: cardReqs.requiredAttributeKeys,
                requiredAttributeMins: cardReqs.requiredAttributeMins,
              }),
            );
        const voucherObj = tx.add(
          endlessTx.recruit.mintGenesisVoucher({
            saga: sagaId,
            payment,
            attributeSeed: Array.from(seed),
            // Stamp the off-chain recruitment id as the voucher hint so
            // chain-side event readers can group vouchers by their
            // originating campaign without an extra object fetch.
            hint: recruitment.id,
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
          await new Promise((r) => setTimeout(r, 800));
          continue;
        }
        setError(`[mint] ${msg}`);
        setStage('minting');
        setRollingStatus(null);
        return;
      }
    }
    if (!mintedVoucherId) {
      setError(`[mint] ${lastMintErr instanceof Error ? lastMintErr.message : String(lastMintErr)}`);
      setStage('minting');
      setRollingStatus(null);
      return;
    }
    setVoucherId(mintedVoucherId);

    // 2. Roll attributes locally to verify if candidate meets requirements early
    const rolled = rollAttributesFromSeed(seed, DEFAULT_ATTRIBUTE_SCHEMA);
    setRolledValues(rolled);
    
    const check = candidateMeetsRequirements(recruitment, null, rolled);
    if (!check.ok) {
      setStage('rejected');
      setRollingStatus(null);
      return;
    }

    setStage('prompt');
    setRollingStatus(null);
  };

  // ───────────────────────────────────────────────────────────────
  // Step: prompt → generating (moderate + preview)
  // ───────────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    setError(null);
    setStage('generating');
    setRollingStatus('moderating');

    // 1. Moderate (server action)
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

    setRollingStatus('generating');
    
    // 2. Server preview
    try {
      const prev = await previewCharacter({
        attributeSeedHex: attributeSeedHex!,
        userPrompt: prompt,
        signature: modRes.signature!,
        recruitmentIntent: recruitment.roleIntent,
      });
      if (!prev.ok || !prev.candidate || !prev.rolledValues) {
        throw new Error(prev.error ?? '預覽失敗');
      }
      setCandidate(prev.candidate);
      setStage('pick');

      // 3. Start generating portrait immediately
      setIsPainting(true);
      setPortraitUrl(null);
      setPortraitBase64(null);
      setPortraitBlobId(null);
      generatePortrait({
        character: {
          description: prev.candidate.description,
          physical: {
            gender: prev.candidate.physicalFacts.gender,
            ageYears: prev.candidate.physicalFacts.age,
            body: prev.candidate.physicalFacts.body,
          },
          attributes: prev.candidate.attributes,
        },
        // Empty toneHint → server resolves this saga's on-chain portrait_tone
        // (F — 畫風 soul), falling back to a default ink-wash when unset.
        toneHint: '',
        sagaId: recruitment.sagaId,
        recruitmentIntent: recruitment.roleIntent,
      }).then(port => {
        setIsPainting(false);
        if (port.ok) {
          setPortraitUrl(port.url ?? null);
          setPortraitBlobId(port.blobId ?? null);
          setPortraitBase64(port.base64 ?? null);
        } else {
          setError(`(畫像繪製失敗，仍可繼續): ${port.error}`);
        }
      }).catch(err => {
        setIsPainting(false);
        setError(`(畫像繪製失敗，仍可繼續): ${err instanceof Error ? err.message : String(err)}`);
      });

    } catch (err) {
      setError(`[preview] ${err instanceof Error ? err.message : String(err)}`);
      setStage('prompt');
      setRollingStatus(null);
    }
  };

  // ───────────────────────────────────────────────────────────────
  // Step: pick → done (auto redeem)
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
        portraitUrl: portraitUrl ?? undefined,
        portraitBlobId: portraitBlobId ?? undefined,
        recruitmentSpecialty: recruitment.specialty,
        recruitmentIntent: recruitment.roleIntent,
      });
      if (!r.ok || !r.characterId) throw new Error(r.error ?? 'redeem 失敗');
      setCharacterId(r.characterId);
      // Genesis memories seed SERVER-SIDE in the background (Next `after`) inside
      // redeemVoucher — see redeem-voucher.ts. We don't block on them here, so the
      // success seal stamps the moment characterId lands instead of waiting out the
      // full LLM + MemWal seeding (which previously hung the "上鏈中…" screen).
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStage('pick');
    }
  };

  const handleRegenerate = () => {
    setError(null);
    setCandidate(null);
    void handleGenerate();
  };

  const minEntries: [string, number][] = recruitment.minAttributes
    ? Object.entries(recruitment.minAttributes).filter(
        (entry): entry is [string, number] => typeof entry[1] === 'number'
      )
    : [];

  // Client-side mirror of `check_voucher_requirements` — used to block
  // 接受 when the rolled candidate won't satisfy the recruitment, so the
  // user doesn't pay for portrait gen + redeem only to abort EReqsNotMet.
  const reqCheck =
    candidate && rolledValues
      ? candidateMeetsRequirements(recruitment, candidate, rolledValues)
      : null;

  // ── Navigation handlers ────────────────────────────────────────
  const handleNext = () => {
    if (stage === 'minting') void handleMint();
    else if (stage === 'prompt') void handleGenerate();
    else if (stage === 'rejected') void handleMint(); // 重抽
    else if (stage === 'pick') void handleEnroll();
    else if (stage === 'done' && characterId) router.push(`/dossier?id=${characterId}`);
  };

  const handlePrev = () => {
    if (stage === 'minting') resetWizard();
    else if (stage === 'prompt' || stage === 'generating') resetWizard();
    else if (stage === 'pick') {
      if (!isPainting) handleRegenerate();
    }
    else if (stage === 'rejected') resetWizard(); // 緣寂
    else if (stage === 'done') resetWizard();
  };

  let prevLabel = '取消';
  let nextLabel = '下一步';
  let canNext = false;
  let canPrev = true;

  if (stage === 'minting') {
    nextLabel = rollingStatus === 'minting' ? '簽署中…' : '擲牌 (支付)';
    canNext = rollingStatus !== 'minting';
  } else if (stage === 'prompt') {
    nextLabel = '凝形';
    canNext = prompt.trim().length > 0;
  } else if (stage === 'generating') {
    nextLabel = '凝形中…';
    canNext = false;
  } else if (stage === 'rejected') {
    prevLabel = '緣寂';
    nextLabel = '重抽 (支付)';
    canNext = true;
  } else if (stage === 'pick') {
    prevLabel = '重新凝形';
    nextLabel = isPainting ? '繪製畫像中…' : '入班';
    canNext = !isPainting && candidate !== null && (reqCheck === null || reqCheck.ok);
    canPrev = !isPainting;
  } else if (stage === 'done') {
    prevLabel = '關閉';
    nextLabel = characterId ? '查看人物卡' : '上鏈中…';
    canNext = characterId !== null;
  }

  const handleOpen = () => {
    void handleMint();
  };

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
                  {stage === 'minting' && (
                    rollingStatus === 'minting' ? <RollingStage status="minting" /> : <RecruitmentDetails recruitment={recruitment} minEntries={minEntries} />
                  )}
                  {stage === 'rejected' && rolledValues && (
                    <RejectedStage
                      rolledValues={rolledValues}
                      reason={reqCheck && !reqCheck.ok ? reqCheck.reason : '不符徵召條件'}
                    />
                  )}
                  {stage === 'prompt' && (
                    <PromptStage prompt={prompt} onPromptChange={setPrompt} rolledValues={rolledValues} />
                  )}
                  {stage === 'generating' && <RollingStage status={rollingStatus} />}
                  {(stage === 'pick' || stage === 'done') && candidate && rolledValues && (
                    <RevealStage
                      stage={stage as 'pick' | 'done'}
                      candidate={candidate}
                      rolledValues={rolledValues}
                      portraitBase64={portraitBase64}
                      portraitUrl={portraitUrl}
                      characterId={characterId}
                      rejectedReason={stage === 'pick' && reqCheck && !reqCheck.ok ? reqCheck.reason : null}
                      isPainting={isPainting}
                    />
                  )}
                </div>

                {error && (
                  <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[calc(100%-3rem)] md:w-max md:max-w-[85%] flex items-center gap-3 px-4 py-2.5 rounded-full bg-elevated/95 backdrop-blur-md shadow-xl shadow-cinnabar/5 ring-1 ring-cinnabar/30 animate-fade-in-up z-20">
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cinnabar/10 ring-1 ring-cinnabar/20">
                      <span className="h-1.5 w-1.5 rounded-full bg-cinnabar animate-pulse" />
                    </div>
                    <p className="text-xs text-cinnabar font-medium tracking-wide leading-relaxed line-clamp-2">
                      {error}
                    </p>
                  </div>
                )}
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
            disabled={!canPrev}
            className="inline-flex h-9 items-center gap-2 rounded-full border border-hairline bg-surface px-4 text-sm text-mute transition-colors hover:border-cinnabar/60 hover:bg-elevated hover:text-ink disabled:pointer-events-none disabled:opacity-40"
          >
            {stage === 'pick' ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 opacity-70">
                <path d="M21 2v6h-6" />
                <path d="M3 12a9 9 0 1 0 2.6-6.6L21 8" />
              </svg>
            ) : (
              <span aria-hidden>←</span>
            )}
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

function RecruitmentDetails({
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

function DefaultMain({
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

function RejectedStage({ rolledValues, reason }: { rolledValues: RolledAttribute[], reason: string }) {
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
    </div>
  );
}

function PromptStage({ prompt, onPromptChange, rolledValues }: { prompt: string; onPromptChange: (v: string) => void; rolledValues: RolledAttribute[] | null }) {
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

function RollingStage({ status }: { status: 'minting' | 'moderating' | 'generating' | null }) {
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
          
          <div className="mt-6 h-px w-16 bg-cinnabar/30" />
          
          <p className="mt-6 max-w-prose text-[15px] leading-loose text-ink/80 sm:text-base line-clamp-6 text-justify">
            {candidate.description}
          </p>

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

function CheckIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
