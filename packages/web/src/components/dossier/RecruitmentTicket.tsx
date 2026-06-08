'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCurrentAccount, useSignAndExecuteTransaction, useSuiClient } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import type { Recruitment } from '@endless-story/shared';
import { ENDLESS_STORY_DEPLOYMENT, tx as endlessTx } from '@endless-story/sdk';
import { generateAttributeSeed, rollAttributesFromSeed } from '@endless-story/llm/seed';
import type { CharacterCandidate, RolledAttribute } from '@endless-story/llm/prompts';
import { DEFAULT_ATTRIBUTE_SCHEMA } from '@/lib/config/attribute-schema';
import { moderatePrompt } from '@/lib/actions/moderate-prompt';
import { previewCharacter } from '@/lib/actions/preview-character';
import { generatePortrait } from '@/lib/actions/generate-portrait';
import { redeemVoucher } from '@/lib/actions/redeem-voucher';
import {
  bytesToHex,
  candidateMeetsRequirements,
  daysLeft,
  ENDLESS_DECIMALS,
  recruitmentRequirements,
  stepKeyForStage,
  STEPS,
  VOUCHER_TTL_MS,
  type Stage,
} from './recruitment/helpers';
import {
  DefaultMain,
  DefaultStub,
  DrawModeToggle,
  PromptStage,
  RecruitmentDetails,
  RejectedStage,
  RevealStage,
  RollingStage,
  VerticalStepper,
} from './recruitment/stages';

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
  // single vs guaranteed (bulk): bulk rerolls the cheap local dice until the 4 attrs
  // meet the recruitment's hard requirements, then mints ONE matching voucher.
  const [drawMode, setDrawMode] = useState<'single' | 'bulk'>('single');
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
  const handleMint = async (modeOverride?: 'single' | 'bulk') => {
    const mode = modeOverride ?? drawMode;
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

    // 1. Mint voucher (real on-chain) — pay basePrice from user's ENDLESS coin.
    //
    // guaranteed (bulk): reroll the CHEAP local dice (no LLM / no chain / no image)
    // until the 4 attributes meet the recruitment's minAttributes, then mint ONE
    // voucher with that winning seed — guaranteed attribute match, single payment.
    // Gender is not rolled: it's forced in the preview prompt (requiredGender) and
    // enforced on chain, so we only gate on attributes here (candidate = null).
    let seed = generateAttributeSeed();
    if (mode === 'bulk') {
      const MAX_REROLL = 1000;
      let rolled = rollAttributesFromSeed(seed, DEFAULT_ATTRIBUTE_SCHEMA);
      let tries = 1;
      while (!candidateMeetsRequirements(recruitment, null, rolled).ok && tries < MAX_REROLL) {
        seed = generateAttributeSeed();
        rolled = rollAttributesFromSeed(seed, DEFAULT_ATTRIBUTE_SCHEMA);
        tries += 1;
      }
      if (!candidateMeetsRequirements(recruitment, null, rolled).ok) {
        setError(`必應：${MAX_REROLL} 抽仍未湊齊四維門檻，請改用單抽或調低要求`);
        setStage('minting');
        setRollingStatus(null);
        return;
      }
    }
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
        const unitPrice =
          mode === 'bulk' ? recruitment.bulkPrice ?? recruitment.basePrice : recruitment.basePrice;
        const priceBase = BigInt(unitPrice) * BigInt(10 ** ENDLESS_DECIMALS);

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
        requiredGender:
          recruitment.genderRequirement === 'male'
            ? '男'
            : recruitment.genderRequirement === 'female'
              ? '女'
              : undefined,
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
        // (F — brush-style soul), falling back to a default ink-wash when unset.
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
      // full LLM + MemWal seeding (which previously hung the "submitting" screen).
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
  // accept when the rolled candidate won't satisfy the recruitment, so the
  // user doesn't pay for portrait gen + redeem only to abort EReqsNotMet.
  const reqCheck =
    candidate && rolledValues
      ? candidateMeetsRequirements(recruitment, candidate, rolledValues)
      : null;

  // ── Navigation handlers ────────────────────────────────────────
  // From the rejected card: flip to guaranteed mode and immediately re-draw.
  // Pass the mode explicitly so the reroll doesn't race React's state update.
  const switchToBulkAndRedraw = () => {
    setDrawMode('bulk');
    void handleMint('bulk');
  };

  const handleNext = () => {
    if (stage === 'minting') void handleMint();
    else if (stage === 'prompt') void handleGenerate();
    else if (stage === 'rejected') void handleMint(); // redraw
    else if (stage === 'pick') void handleEnroll();
    else if (stage === 'done' && characterId) router.push(`/dossier?id=${characterId}`);
  };

  const handlePrev = () => {
    if (stage === 'minting') resetWizard();
    else if (stage === 'prompt' || stage === 'generating') resetWizard();
    else if (stage === 'pick') {
      if (!isPainting) handleRegenerate();
    }
    else if (stage === 'rejected') resetWizard(); // let go
    else if (stage === 'done') resetWizard();
  };

  let prevLabel = '取消';
  let nextLabel = '下一步';
  let canNext = false;
  let canPrev = true;

  if (stage === 'minting') {
    nextLabel =
      rollingStatus === 'minting'
        ? '簽署中…'
        : drawMode === 'bulk'
          ? '必應 (支付)'
          : '擲牌 (支付)';
    canNext = rollingStatus !== 'minting';
  } else if (stage === 'prompt') {
    nextLabel = '凝形';
    canNext = prompt.trim().length > 0;
  } else if (stage === 'generating') {
    nextLabel = '凝形中…';
    canNext = false;
  } else if (stage === 'rejected') {
    prevLabel = '緣寂';
    nextLabel = drawMode === 'bulk' ? '必應重抽 (支付)' : '重抽 (支付)';
    canNext = true;
  } else if (stage === 'pick') {
    prevLabel = '重新凝形';
    // Portrait no longer blocks 入班 — if it's still painting, mint goes ahead
    // without it and the cover is generated + patched on chain server-side
    // (see ensure-portrait in redeem-voucher's after()). If it finished, the
    // ready url is passed and baked into the mint tx directly.
    nextLabel = isPainting ? '入班（畫像續繪）' : '入班';
    canNext = candidate !== null && (reqCheck === null || reqCheck.ok);
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
              <DefaultStub
                recruitment={recruitment}
                days={daysLeft(recruitment.expiresAt)}
                onOpen={handleOpen}
                drawMode={drawMode}
                onDrawModeChange={setDrawMode}
              />
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
                      bulkPrice={recruitment.bulkPrice ?? recruitment.basePrice}
                      onSwitchToBulk={switchToBulkAndRedraw}
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
                      <span className="font-serif text-base text-ink">
                        {drawMode === 'bulk' ? recruitment.bulkPrice ?? recruitment.basePrice : recruitment.basePrice}
                      </span>{' '}
                      Endless
                      {stage === 'minting' && rollingStatus !== 'minting' ? (
                        <DrawModeToggle
                          drawMode={drawMode}
                          onToggle={() => setDrawMode(drawMode === 'bulk' ? 'single' : 'bulk')}
                        />
                      ) : null}
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
