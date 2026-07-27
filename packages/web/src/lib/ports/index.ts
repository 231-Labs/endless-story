/**
 * Product ports entry — pick local (default) or sui via PRODUCT_BACKEND / BACKEND.
 */

import {
    localCast,
    localEntitlement,
    localFeaturedShot,
    localLiveWorld,
    localReading,
    localRecruitment,
    localVault,
} from './local';
import {
    suiCast,
    suiEntitlement,
    suiFeaturedShot,
    suiLiveWorld,
    suiReading,
    suiRecruitment,
    suiVault,
} from './sui';
import { resolveProductBackend, type ProductPorts } from './types';

export type { ProductBackend, ProductPorts } from './types';
export { resolveProductBackend } from './types';

export function getProductPorts(): ProductPorts {
    const backend = resolveProductBackend();
    if (backend === 'sui') {
        return {
            backend,
            liveWorld: suiLiveWorld,
            featuredShot: suiFeaturedShot,
            cast: suiCast,
            reading: suiReading,
            entitlement: suiEntitlement,
            recruitment: suiRecruitment,
            vault: suiVault,
        };
    }
    return {
        backend: 'local',
        liveWorld: localLiveWorld,
        featuredShot: localFeaturedShot,
        cast: localCast,
        reading: localReading,
        entitlement: localEntitlement,
        recruitment: localRecruitment,
        vault: localVault,
    };
}
