/**
 * Resolve the active Sui network for the web app.
 *
 * Priority:
 *   1. ENDLESS_STORY_DEPLOYMENT.network (single source of truth — cli writes it)
 *   2. process.env.NEXT_PUBLIC_SUI_NETWORK (override before deployment)
 *   3. Fallback to 'devnet'
 */

import {
    ENDLESS_STORY_DEPLOYMENT,
    type SuiNetwork,
} from '@endless-story/sdk';

export function resolveNetwork(): SuiNetwork {
    if (ENDLESS_STORY_DEPLOYMENT.packageId) return ENDLESS_STORY_DEPLOYMENT.network;
    const envNet = process.env.NEXT_PUBLIC_SUI_NETWORK as SuiNetwork | undefined;
    if (envNet === 'devnet' || envNet === 'testnet' || envNet === 'mainnet' || envNet === 'localnet') {
        return envNet;
    }
    return 'devnet';
}
