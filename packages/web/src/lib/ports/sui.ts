/**
 * Sui / Walrus adapters — alternate product backend.
 * Wraps existing web facades; UI must not import @mysten/* directly.
 */

import { getSagaLiveSnapshot } from '@/lib/actions/saga-live';
import { charactersApi, recruitmentsApi, scenesApi, subscriptionsApi } from '@/lib/api/index';
import type {
    CastPort,
    EntitlementPort,
    FeaturedShotPort,
    LiveWorldPort,
    ReadingPort,
    RecruitmentPort,
    VaultPort,
} from './types';

export const suiLiveWorld: LiveWorldPort = {
    async getLive(sagaId, _afterSeq = 0) {
        return getSagaLiveSnapshot(sagaId);
    },
};

export const suiFeaturedShot: FeaturedShotPort = {
    async getDailyShot(sagaId) {
        const clips = await scenesApi.listShowcaseClips().catch(() => []);
        const clip = clips.find((c) => c.sagaId === sagaId) ?? clips[0] ?? null;
        if (!clip) return null;
        return {
            id: clip.id,
            day: clip.day,
            title: clip.title,
            caption: clip.caption,
            posterUrl: clip.thumbnailUrl,
            videoUrl: clip.videoUrl,
            durationSeconds: clip.durationSeconds,
            aspect: clip.aspect,
            sceneId: clip.sceneId,
            updatedAt: clip.createdAt,
        };
    },
};

export const suiCast: CastPort = {
    async listCast(sagaId) {
        const chars = await charactersApi.listSagaCharacters(sagaId).catch(() => []);
        return chars.map((c) => ({
            id: c.id,
            name: c.name,
            role: String(c.role ?? ''),
            portraitUrl: c.gallery?.anchor?.imageUrl,
        }));
    },
    async listOwned(viewerId) {
        const chars = await charactersApi.listOwnedCharacters(viewerId).catch(() => []);
        return chars.map((c) => ({
            id: c.id,
            name: c.name,
            role: String(c.role ?? ''),
            portraitUrl: c.gallery?.anchor?.imageUrl,
        }));
    },
};

export const suiReading: ReadingPort = {
    async listDossiers(_sagaId) {
        // Chain dossier listing stays on /feed surfaces; port returns empty until unified.
        return { dossiers: [], editorial: {} };
    },
    async listArchive(_sagaId) {
        return { entries: [] };
    },
    async readArchiveFile(_sagaId, _file) {
        return '';
    },
};

export const suiEntitlement: EntitlementPort = {
    async canReadPov(viewerId, characterId) {
        if (!viewerId) return false;
        return suiEntitlement.isSubscribed(viewerId, characterId);
    },
    async isSubscribed(viewerId, characterId) {
        if (!viewerId) return false;
        try {
            const subs = await subscriptionsApi.listMySubscriptions(viewerId);
            return subs.some((s) => s.characterId === characterId);
        } catch {
            return false;
        }
    },
};

export const suiRecruitment: RecruitmentPort = {
    async listOpenCampaigns() {
        const open = await recruitmentsApi.listOpenRecruitments().catch(() => []);
        return open.map((r) => ({
            id: r.id,
            title: r.roleIntent || String(r.specialty),
            slots: r.slots,
        }));
    },
};

export const suiVault: VaultPort = {
    async getInventory(_viewerId) {
        return [];
    },
    async getLayout(_viewerId) {
        return { rooms: [] };
    },
};
