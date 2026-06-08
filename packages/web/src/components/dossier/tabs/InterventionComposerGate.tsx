'use client';

import { useCurrentAccount } from '@mysten/dapp-kit';
import { truncateAddress } from '@/lib/format';
import { Composer } from './Composer';

/**
 * Owner gate for the intervention Composer.
 *
 * Why this is client-side: the dossier page server-component reads
 * `viewerWallet` from a URL `?as=` query param (mock-era debugging
 * affordance), which defaults to a fake demo wallet when absent. That
 * worked when wallet identity was simulated via the URL, but now we
 * have real dapp-kit connections — connected account is the source of
 * truth. Checking server-side gives stale/wrong gates for real users.
 *
 * Behaviour:
 *   - No wallet connected → "connect first" prompt
 *   - Connected but not the owner → locked notice
 *   - Connected AND matches character.nftOwner → real Composer
 */
export function InterventionComposerGate({
    characterId,
    characterNftOwner,
}: {
    characterId: string;
    characterNftOwner: string;
}) {
    const account = useCurrentAccount();

    if (!account) {
        return (
            <section className="rounded-3xl bg-surface/40 border border-dashed border-hairline/60 p-6 sm:p-8 text-sm text-mute backdrop-blur-sm text-center">
                請先連接錢包，確認你是 <span className="font-mono">{truncateAddress(characterNftOwner)}</span> 後才能寄夢入心。
            </section>
        );
    }

    if (account.address !== characterNftOwner) {
        return (
            <section className="rounded-3xl bg-surface/40 border border-dashed border-hairline/60 p-6 sm:p-8 text-sm text-mute backdrop-blur-sm text-center">
                只有持有 <span className="font-mono">{truncateAddress(characterNftOwner)}</span> 能寄夢入心。
                <br />
                <span className="text-2xs">（你連的是 {truncateAddress(account.address)}）</span>
            </section>
        );
    }

    return <Composer characterId={characterId} ownerWallet={account.address} />;
}
