/**
 * Product ports — UI talks only to these. Local (LAB_DATA_DIR) is default;
 * Sui/Walrus adapters are alternate backends (BACKEND=local|sui).
 */

export type ProductBackend = 'local' | 'sui';

export function resolveProductBackend(): ProductBackend {
    const raw = (process.env.PRODUCT_BACKEND ?? process.env.BACKEND ?? 'local').trim().toLowerCase();
    return raw === 'sui' || raw === 'chain' ? 'sui' : 'local';
}

export interface LiveWorldPort {
    getLive(runOrSagaId: string, afterSeq?: number): Promise<unknown>;
}

export interface FeaturedShotPort {
    getDailyShot(runOrSagaId: string): Promise<unknown>;
}

export interface CastMember {
    id: string;
    name: string;
    role?: string;
    portraitUrl?: string;
}

export interface CastPort {
    listCast(runOrSagaId: string): Promise<CastMember[]>;
    listOwned?(viewerId: string): Promise<CastMember[]>;
}

export interface ReadingPort {
    listDossiers(runOrSagaId: string): Promise<unknown>;
    listArchive(runOrSagaId: string): Promise<unknown>;
    readArchiveFile(runOrSagaId: string, file: string): Promise<string>;
}

export interface EntitlementPort {
    canReadPov(viewerId: string | null, characterId: string): Promise<boolean>;
    isSubscribed(viewerId: string | null, characterId: string): Promise<boolean>;
    subscribe?(viewerId: string, characterId: string): Promise<void>;
    unsubscribe?(viewerId: string, characterId: string): Promise<void>;
}

export interface RecruitmentPort {
    listOpenCampaigns(): Promise<Array<{ id: string; title: string; slots?: number }>>;
    /** Local: mint a follow/track intent. Chain: voucher redeem. */
    join?(viewerId: string, campaignId: string): Promise<{ characterId?: string }>;
}

export interface VaultPort {
    getInventory(viewerId: string): Promise<Array<{ id: string; title: string; imageUrl?: string }>>;
    getLayout(viewerId: string): Promise<unknown>;
    saveLayout?(viewerId: string, layout: unknown): Promise<void>;
}

export interface ProductPorts {
    backend: ProductBackend;
    liveWorld: LiveWorldPort;
    featuredShot: FeaturedShotPort;
    cast: CastPort;
    reading: ReadingPort;
    entitlement: EntitlementPort;
    recruitment: RecruitmentPort;
    vault: VaultPort;
}
