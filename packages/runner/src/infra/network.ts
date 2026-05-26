/**
 * Resolve the active Sui network for runner services. Same convention
 * as web's `lib/chain/network.ts` but kept independent so runner can
 * be deployed without web.
 */

import { ENDLESS_STORY_DEPLOYMENT, type SuiNetwork } from '@endless-story/sdk';

export function resolveNetwork(): SuiNetwork {
    if (ENDLESS_STORY_DEPLOYMENT.packageId) return ENDLESS_STORY_DEPLOYMENT.network;
    const envNet = process.env.SUI_NETWORK as SuiNetwork | undefined;
    if (envNet === 'devnet' || envNet === 'testnet' || envNet === 'mainnet' || envNet === 'localnet') {
        return envNet;
    }
    return 'devnet';
}
