'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from '@mysten/dapp-kit';
import { Transaction, coinWithBalance } from '@mysten/sui/transactions';
import {
  ENDLESS_STORY_DEPLOYMENT,
  read,
  tx as endlessTx,
} from '@endless-story/sdk';
import {
  submitInterventionAction,
  type InterventionFormResult,
} from '@/lib/actions/interventions';
import {
  prepareDreamAction,
  type PrepareDreamActionResult,
} from '@/lib/actions/prepare-dream';
import {
  runReflectionAction,
  type RunReflectionResult,
} from '@/lib/actions/run-reflection';
import { txUrl, objectUrl } from '@/lib/explorer';

type Kind = 'inject_dream' | 'whisper' | 'ask_reflection';

const ENDLESS_DECIMALS = 6;

const COPY: Record<Kind, { hint: string; placeholder: string; submit: string }> = {
  inject_dream: {
    hint: '她下一次出場才會夢到。內容會經審稿員改寫成戲園意象，再上鏈 anchor 在 Sui + Walrus — owner 付 ENDLESS，永久可驗證影響。',
    placeholder: '夢的素材 — 一個人、一句話、一個畫面…',
    submit: '送審 + 上鏈',
  },
  whisper: {
    hint: '她在下一個 tick 就會聽見 — 像她自己腦中的一段內心音。可能照辦、可能抗拒、無論如何會被她寫進記憶。',
    placeholder: '一句你想讓她在台口聽見的話…',
    submit: '在她耳邊',
  },
  ask_reflection: {
    hint: '只給她聽 — 她會在卸了妝獨自一人時想這個問題，寫一段「真實的」內心。可能跟她公開的章回對不上、可能避而不答 — 那都是她。內容上鏈 anchor，僅 owner 跟訂閱者可讀。',
    placeholder: '一句你想問她、但她未必想答的話…',
    submit: '問她',
  },
};

const INITIAL: InterventionFormResult = { ok: false };

export function Composer({
  characterId,
  ownerWallet,
}: {
  characterId: string;
  ownerWallet: string;
}) {
  const [kind, setKind] = useState<Kind | null>(null);
  const [text, setText] = useState('');

  // whisper path: legacy form action (off-chain mock store)
  const [whisperState, whisperFormAction, whisperPending] = useActionState(
    submitInterventionAction,
    INITIAL,
  );
  useEffect(() => {
    if (whisperState.ok) {
      setText('');
      setKind(null);
    }
  }, [whisperState.ok]);

  // dream path: server prepares (moderate + Walrus), client wallet signs
  // submit_dream tx with ENDLESS payment + OwnerCap auth
  const [prepared, setPrepared] = useState<PrepareDreamActionResult | null>(null);
  const [chainResult, setChainResult] = useState<{ digest: string; dreamId?: string } | null>(
    null,
  );
  const [dreamError, setDreamError] = useState<string | null>(null);
  const [dreamPrice, setDreamPrice] = useState<bigint>(50_000_000n);
  const [chainPending, startChainTransition] = useTransition();

  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();

  // Pull live dream price so the UI shows the actual amount that'll
  // be charged + the wallet sign tx pays the right amount.
  useEffect(() => {
    if (kind !== 'inject_dream') return;
    const d = ENDLESS_STORY_DEPLOYMENT;
    if (!d.dreamConfigId) return;
    read.dream
      .getDreamConfig(suiClient, d.dreamConfigId)
      .then((res) => {
        const json = res.json as { price?: string | number };
        setDreamPrice(BigInt(json.price ?? '50000000'));
      })
      .catch(() => {
        // fall through to default; user can still submit
      });
  }, [kind, suiClient]);

  // reflection 'ask_reflection' path: server-side LLM + admin-signed
  // anchor. Owner just submits text — no wallet sign needed (storyteller
  // cap holder signs the reflection::submit on chain). Server gates
  // owner via the InterventionComposerGate upstream.
  const [reflectionResult, setReflectionResult] = useState<RunReflectionResult | null>(null);
  const [reflectionError, setReflectionError] = useState<string | null>(null);

  const toggle = (next: Kind) => {
    setKind((current) => (current === next ? null : next));
    setText('');
    setPrepared(null);
    setChainResult(null);
    setDreamError(null);
    setReflectionResult(null);
    setReflectionError(null);
  };

  const handleAskReflection = () => {
    if (!text.trim()) return;
    setReflectionError(null);
    setReflectionResult(null);
    startChainTransition(async () => {
      const res = await runReflectionAction({
        characterId,
        mode: 'active',
        ownerQuestion: text,
      });
      setReflectionResult(res);
      if (!res.ok) {
        setReflectionError(res.error ?? '未知錯誤');
      }
    });
  };

  const handleDreamPrepare = () => {
    if (!text.trim()) return;
    setDreamError(null);
    setPrepared(null);
    setChainResult(null);
    startChainTransition(async () => {
      const res = await prepareDreamAction({ characterId, rawText: text });
      setPrepared(res);
      if (!res.ok && !res.rejectReason) {
        setDreamError(res.error ?? '未知錯誤');
      }
    });
  };

  const handleDreamSubmit = () => {
    if (!prepared?.ok || prepared.status !== 'accepted' || !prepared.blobId) return;
    if (!account) {
      setDreamError('請先連接錢包');
      return;
    }
    const d = ENDLESS_STORY_DEPLOYMENT;
    setDreamError(null);

    startChainTransition(async () => {
      // Find OwnerCap for this character owned by the connected wallet.
      let ownerCapId: string | null = null;
      try {
        const caps = await read.character.listOwnerCapsForAddress(
          suiClient,
          account.address,
          d.packageId,
        );
        const match = caps.find((c) => c.characterId === characterId);
        ownerCapId = match?.capId ?? null;
      } catch (err) {
        setDreamError(
          `找不到 OwnerCap: ${err instanceof Error ? err.message : String(err)}`,
        );
        return;
      }
      if (!ownerCapId) {
        setDreamError('找不到對應的 OwnerCap — 你是這位角色的擁有者嗎？');
        return;
      }

      const tx = new Transaction();
      const payment = tx.add(
        coinWithBalance({
          balance: dreamPrice,
          type: `${d.packageId}::currency::CURRENCY`,
        }),
      );
      tx.add(
        endlessTx.dream.submitDream({
          config: d.dreamConfigId,
          saga: d.sagaId,
          character: characterId,
          ownerCap: ownerCapId,
          payment,
          contentHash: prepared.contentHashBytes ?? [],
          blobId: Array.from(new TextEncoder().encode(prepared.blobId)),
          importance: prepared.importance ?? 8,
        }),
      );

      signAndExecute(
        { transaction: tx },
        {
          onSuccess: async (res) => {
            try {
              const full = await suiClient.waitForTransaction({
                digest: res.digest,
                options: { showEffects: true, showObjectChanges: true },
              });
              const created = (full.objectChanges ?? []) as Array<{
                type?: string;
                objectType?: string;
                objectId?: string;
              }>;
              const dream = created.find(
                (c) => c.type === 'created' && c.objectType?.endsWith('::dream::Dream'),
              );
              setChainResult({ digest: res.digest, dreamId: dream?.objectId });
              setText('');
            } catch (err) {
              setDreamError(
                err instanceof Error
                  ? `tx 已發出但等待失敗: ${err.message}`
                  : 'tx 已發出但等待失敗',
              );
            }
          },
          onError: (err) => setDreamError(err.message),
        },
      );
    });
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <ActionButton
          label="注夢"
          active={kind === 'inject_dream'}
          onClick={() => toggle('inject_dream')}
        />
        <ActionButton label="耳語" active={kind === 'whisper'} onClick={() => toggle('whisper')} />
        <ActionButton
          label="問一句"
          active={kind === 'ask_reflection'}
          onClick={() => toggle('ask_reflection')}
        />
      </div>

      {kind === 'whisper' ? (
        <form action={whisperFormAction} className="es-soft-panel space-y-3 p-4 sm:p-5">
          <input type="hidden" name="characterId" value={characterId} />
          <input type="hidden" name="ownerWallet" value={ownerWallet} />
          <input type="hidden" name="kind" value="whisper" />
          <p className="text-2xs leading-relaxed tracking-widest text-mute">
            {COPY.whisper.hint}
          </p>
          <textarea
            name="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder={COPY.whisper.placeholder}
            className="es-field resize-none"
            disabled={whisperPending}
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-2xs tracking-widest text-mute">寫上 Walrus · Seal 限 owner 可解</p>
            <button
              type="submit"
              disabled={!text.trim() || whisperPending}
              className="rounded bg-cinnabar px-4 py-2 text-sm text-canvas transition-colors hover:bg-seal disabled:cursor-not-allowed disabled:opacity-40"
            >
              {whisperPending ? '寄出中…' : COPY.whisper.submit}
            </button>
          </div>
          {whisperState.error ? (
            <p className="text-2xs tracking-widest text-cinnabar/85">{whisperState.error}</p>
          ) : null}
        </form>
      ) : null}

      {kind === 'inject_dream' ? (
        <div className="es-soft-panel space-y-3 p-4 sm:p-5">
          <p className="text-2xs leading-relaxed tracking-widest text-mute">
            {COPY.inject_dream.hint}
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder={COPY.inject_dream.placeholder}
            className="es-field resize-none"
            disabled={chainPending || prepared?.status === 'accepted'}
          />

          {!prepared && !chainResult ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-2xs tracking-widest text-mute">
                當前價格：{Number(dreamPrice / BigInt(10 ** ENDLESS_DECIMALS))} ENDLESS
              </p>
              <button
                type="button"
                onClick={handleDreamPrepare}
                disabled={!text.trim() || chainPending}
                className="rounded border border-hairline bg-surface px-4 py-2 text-sm text-ink transition-colors hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-40"
              >
                {chainPending ? '審稿中…' : '送審 + 改寫'}
              </button>
            </div>
          ) : null}

          {prepared && !prepared.ok && prepared.rejectReason ? (
            <div className="rounded border border-cinnabar/40 bg-cinnabar/5 p-3 text-sm text-cinnabar">
              審稿未過：{prepared.rejectReason}
              <button
                type="button"
                onClick={() => setPrepared(null)}
                className="ml-3 underline"
              >
                重新編寫
              </button>
            </div>
          ) : null}

          {prepared?.ok && prepared.status === 'accepted' && !chainResult ? (
            <div className="space-y-3">
              <div className="rounded border border-jade/40 bg-jade/5 p-3">
                <div className="text-2xs tracking-widest text-jade">
                  改寫後 · 將存入 Walrus + Sui anchor
                </div>
                <p className="mt-2 max-w-prose whitespace-pre-wrap font-serif text-sm leading-loose text-ink/90">
                  {prepared.optimizedText}
                </p>
                <div className="mt-3 text-2xs text-mute">
                  importance: {prepared.importance} · blobId: {prepared.blobId?.slice(0, 12)}…
                </div>
              </div>
              <button
                type="button"
                onClick={handleDreamSubmit}
                disabled={chainPending || !account}
                className="w-full rounded bg-cinnabar px-4 py-2.5 text-sm tracking-widest text-canvas transition-colors hover:bg-seal disabled:cursor-not-allowed disabled:opacity-40"
              >
                {chainPending
                  ? '上鏈中…'
                  : `支付 ${Number(dreamPrice / BigInt(10 ** ENDLESS_DECIMALS))} ENDLESS · 注入夢境`}
              </button>
            </div>
          ) : null}

          {chainResult ? (
            <div className="rounded border border-jade/40 bg-jade/5 p-3 text-sm">
              <div className="text-jade">已注入。她將在下次出場時想起這段夢。</div>
              <div className="mt-2 flex flex-wrap gap-3 text-2xs tracking-widest">
                <a
                  href={txUrl(chainResult.digest)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cinnabar hover:underline"
                >
                  tx ↗
                </a>
                {chainResult.dreamId ? (
                  <a
                    href={objectUrl(chainResult.dreamId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-cinnabar hover:underline"
                  >
                    dream object ↗
                  </a>
                ) : null}
              </div>
            </div>
          ) : null}

          {dreamError ? (
            <p className="text-2xs tracking-widest text-cinnabar/85">{dreamError}</p>
          ) : null}
        </div>
      ) : null}

      {kind === 'ask_reflection' ? (
        <div className="es-soft-panel space-y-3 p-4 sm:p-5">
          <p className="text-2xs leading-relaxed tracking-widest text-mute">
            {COPY.ask_reflection.hint}
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder={COPY.ask_reflection.placeholder}
            className="es-field resize-none"
            disabled={chainPending || (reflectionResult?.ok ?? false)}
          />

          {!reflectionResult ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-2xs tracking-widest text-mute">內心獨白上鏈 anchor · 僅 owner + 訂閱者可讀</p>
              <button
                type="button"
                onClick={handleAskReflection}
                disabled={!text.trim() || chainPending}
                className="rounded bg-cinnabar px-4 py-2 text-sm text-canvas transition-colors hover:bg-seal disabled:cursor-not-allowed disabled:opacity-40"
              >
                {chainPending ? '問著…' : COPY.ask_reflection.submit}
              </button>
            </div>
          ) : null}

          {reflectionResult?.ok ? (
            <div className="space-y-3">
              <div className="rounded border border-jade/40 bg-jade/5 p-3">
                <div className="text-2xs tracking-widest text-jade">她的內心獨白（已上鏈 anchor）</div>
                <p className="mt-2 max-w-prose whitespace-pre-wrap font-serif text-sm leading-loose text-ink/90">
                  {reflectionResult.reflection}
                </p>
              </div>
              <div className="flex flex-wrap gap-3 text-2xs tracking-widest">
                {reflectionResult.digest ? (
                  <a
                    href={txUrl(reflectionResult.digest)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-cinnabar hover:underline"
                  >
                    tx ↗
                  </a>
                ) : null}
                {reflectionResult.reflectionId ? (
                  <a
                    href={objectUrl(reflectionResult.reflectionId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-cinnabar hover:underline"
                  >
                    reflection object ↗
                  </a>
                ) : null}
                {reflectionResult.blobId ? (
                  <a
                    href={`/api/blob/${reflectionResult.blobId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-cinnabar hover:underline"
                  >
                    walrus ↗
                  </a>
                ) : null}
              </div>
            </div>
          ) : null}

          {reflectionError ? (
            <p className="text-2xs tracking-widest text-cinnabar/85">{reflectionError}</p>
          ) : null}
        </div>
      ) : null}

      {!kind ? (
        whisperState.ok ? (
          <p className="rounded-md border border-dashed border-jade/40 bg-jade/10 p-4 text-sm text-jade dark:border-jade/50 dark:bg-jade/15">
            已寄出。她會在下一段夢或下一個 tick 感應到。
          </p>
        ) : (
          <p className="text-sm text-mute">
            注夢藏在夢裡、慢、深、可能被她遺忘；耳語直接傳入她當下心緒、快、淺、不易藏。
          </p>
        )
      ) : null}
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
