'use client';

import { useEffect, useState } from 'react';
import { useCurrentAccount, useSignPersonalMessage, useSuiClient } from '@mysten/dapp-kit';
import { ENDLESS_STORY_DEPLOYMENT, read } from '@endless-story/sdk';
import { decryptWithOwnerCap } from '@endless-story/memwal';
import type { Character, CharacterMemory } from '@endless-story/shared';
import {
  parseMemory,
  recalledToCharacterMemory,
  recencyWeight,
  relevanceWeight,
} from '@/lib/chain/memory-tags';
import { LockedNotice, MemoriesTab } from './MemoriesTab';

/**
 * Owner-gated memory journal — cap-enforced, decrypted in the browser.
 *
 * Access model (matches the contract's SEAL policy): a character's memories
 * decrypt for exactly two cap holders — the Saga server (ControlCap, via
 * `seal_approve_control`, used by the runner) and the character's Owner
 * (OwnerCap, via `seal_approve_owner`). This component is the Owner half:
 *
 *   1. verify the CONNECTED wallet (dapp-kit, never the `?as=` URL param)
 *      holds the on-chain OwnerCap for this character;
 *   2. fetch still-sealed ciphertext from `/api/memories/encrypted`
 *      (the server exercises no cap there);
 *   3. decrypt locally — the wallet signs one SEAL SessionKey, and the key
 *      servers verify `seal_approve_owner` on chain before releasing shares.
 *
 * A viewer without the OwnerCap can reach step 2 at most and ends up with
 * ciphertext it cannot open; spoofing an address changes nothing because
 * the key servers check the cap, not a self-declared identity.
 *
 * Decryption starts from an explicit button press so the wallet signature
 * prompt never appears unprompted on tab load.
 */
export function MemoriesTabClient({
  character,
  sagaCharacters,
  suiNetwork,
}: {
  character: Character;
  sagaCharacters: Character[];
  suiNetwork: 'testnet' | 'mainnet';
}) {
  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const { mutateAsync: signPersonalMessage } = useSignPersonalMessage();

  // undefined = lookup in flight; null = connected wallet holds no OwnerCap.
  const [ownerCapId, setOwnerCapId] = useState<string | null | undefined>(undefined);
  const [phase, setPhase] = useState<'idle' | 'working' | 'done' | 'error'>('idle');
  const [statusText, setStatusText] = useState('');
  const [memories, setMemories] = useState<CharacterMemory[]>([]);
  const [failedCount, setFailedCount] = useState(0);

  const pkg = ENDLESS_STORY_DEPLOYMENT.packageId;
  const isChainCharacter = /^0x[0-9a-fA-F]+$/.test(character.id);

  useEffect(() => {
    setPhase('idle');
    setMemories([]);
    if (!account || !pkg || !isChainCharacter) {
      setOwnerCapId(account ? null : undefined);
      return;
    }
    let cancelled = false;
    setOwnerCapId(undefined);
    read.character
      .listOwnerCapsForAddress(suiClient, account.address, pkg)
      .then((caps) => {
        if (cancelled) return;
        const mine = caps.find((c) => c.characterId === character.id);
        setOwnerCapId(mine?.capId ?? null);
      })
      .catch(() => {
        if (!cancelled) setOwnerCapId(null);
      });
    return () => {
      cancelled = true;
    };
  }, [account, suiClient, character.id, pkg, isChainCharacter]);

  if (!account) {
    return (
      <GateShell>
        <p className="font-serif text-xl text-ink/80 tracking-wide mb-4">記憶是私有的部分。</p>
        <p className="tracking-wide leading-loose">
          連接持有這個角色 OwnerCap 的錢包，才能在你自己的瀏覽器裡解密她的記憶 —
          伺服器只經手密文。
        </p>
      </GateShell>
    );
  }

  if (!pkg || !isChainCharacter) {
    return <LockedNotice character={character} />;
  }

  if (ownerCapId === undefined) {
    return (
      <GateShell>
        <p className="text-sm text-mute tracking-wide">查驗鏈上 OwnerCap…</p>
      </GateShell>
    );
  }

  if (ownerCapId === null) {
    return <LockedNotice character={character} />;
  }

  const decrypt = async () => {
    setPhase('working');
    setFailedCount(0);
    try {
      setStatusText('取回加密記憶…');
      const res = await fetch(
        `/api/memories/encrypted?characterId=${encodeURIComponent(character.id)}&limit=24`,
      );
      if (!res.ok) throw new Error(`encrypted recall HTTP ${res.status}`);
      const payload = (await res.json()) as {
        configured: boolean;
        today: number;
        blobs: { blobId: string; dataB64: string; distance: number }[];
      };
      if (!payload.configured) {
        setMemories([]);
        setPhase('done');
        return;
      }
      if (payload.blobs.length === 0) {
        setMemories([]);
        setPhase('done');
        return;
      }

      setStatusText(`以錢包解密 ${payload.blobs.length} 則記憶…（需要一次簽名）`);
      const { results, failed } = await decryptWithOwnerCap({
        packageId: pkg,
        characterId: character.id,
        ownerCapId,
        suiClient,
        suiNetwork,
        signer: {
          address: account.address,
          signPersonalMessage: ({ message }) => signPersonalMessage({ message }),
        },
        blobs: payload.blobs.map((b) => ({
          blob_id: b.blobId,
          data_b64: b.dataB64,
          distance: b.distance,
        })),
      });
      setFailedCount(failed);

      // Same three-factor re-rank the server path used: importance × recency
      // (narrative day) × relevance (vector distance), stable on ties.
      const scored = results.map((r, idx) => {
        const m = parseMemory(r.text);
        const score =
          (m.importance / 10) *
          recencyWeight(m.day, payload.today) *
          relevanceWeight(r.distance);
        return { m, score, idx };
      });
      const ranked = scored
        .sort((a, b) => b.score - a.score || a.idx - b.idx)
        .map((x, i) => recalledToCharacterMemory(x.m, character.id, i));
      setMemories(ranked);
      setPhase('done');
    } catch (err) {
      console.warn('[memories] owner decrypt failed:', err);
      setPhase('error');
    }
  };

  if (phase === 'idle') {
    return (
      <GateShell>
        <p className="font-serif text-xl text-ink/80 tracking-wide mb-4">這些記憶等著你來翻閱。</p>
        <p className="tracking-wide leading-loose mb-8">
          你的錢包持有這個角色的 OwnerCap。按下後會請你簽一次名（SEAL 工作階段），
          記憶在你自己的瀏覽器裡解密 — 不經過任何人的手。
        </p>
        <button
          type="button"
          onClick={decrypt}
          className="rounded-full border border-cinnabar/60 px-8 py-3 text-sm tracking-[0.3em] text-cinnabar transition-colors hover:bg-cinnabar hover:text-canvas"
        >
          解密記憶
        </button>
      </GateShell>
    );
  }

  if (phase === 'working') {
    return (
      <div className="animate-pulse space-y-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-hairline/50 p-5">
            <div className="h-3 w-24 rounded bg-hairline/60 dark:bg-hairline" />
            <div className="mt-3 h-4 w-full rounded bg-hairline/60 dark:bg-hairline" />
            <div className="mt-2 h-4 w-3/4 rounded bg-hairline/60 dark:bg-hairline" />
          </div>
        ))}
        <p className="pt-2 text-center text-2xs tracking-widest text-mute">{statusText}</p>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <GateShell>
        <p className="text-sm text-mute tracking-wide mb-6">
          解密沒有完成 — 可能是簽名被取消，或 SEAL 金鑰伺服器暫時擁擠。
        </p>
        <button
          type="button"
          onClick={decrypt}
          className="rounded-full border border-cinnabar/60 px-8 py-3 text-sm tracking-[0.3em] text-cinnabar transition-colors hover:bg-cinnabar hover:text-canvas"
        >
          再試一次
        </button>
      </GateShell>
    );
  }

  return (
    <>
      <MemoriesTab
        character={character}
        memories={memories}
        isOwner
        sagaCharacters={sagaCharacters}
        chaptersById={new Map()}
      />
      {failedCount > 0 ? (
        <p className="mt-6 text-center text-2xs tracking-widest text-mute/70">
          另有 {failedCount} 則暫時解不開（金鑰伺服器限流時稍後再試）。
        </p>
      ) : null}
    </>
  );
}

function GateShell({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-3xl bg-surface/40 border border-dashed border-hairline/60 p-8 sm:p-12 text-sm leading-relaxed text-mute backdrop-blur-sm text-center max-w-2xl mx-auto mt-12">
      {children}
    </section>
  );
}
