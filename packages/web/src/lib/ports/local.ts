/** Local (off-chain lab) adapters — default product backend. */

import { buildLiveSnapshot } from '@/lib/lab/live';
import { sanitizeLiveForGuest } from '@/lib/lab/guest-view';
import { readDailyShot } from '@/lib/lab/daily-shot';
import { listArchiveEntries, listDossiers, readArchiveEntry, readEditorial } from '@/lib/lab/artifacts';
import { requirePublicRunId, resolvePublicConfig } from '@/lib/lab/public-config';
import { labDataDir, readJson, writeJsonAtomic, ensureDir } from '@/lib/lab/paths';
import * as path from 'node:path';
import * as fs from 'node:fs';
import type {
    CastPort,
    EntitlementPort,
    FeaturedShotPort,
    LiveWorldPort,
    ReadingPort,
    RecruitmentPort,
    VaultPort,
} from './types';

export const localLiveWorld: LiveWorldPort = {
    async getLive(runId, afterSeq = 0) {
        const snap = await buildLiveSnapshot(runId, afterSeq);
        return sanitizeLiveForGuest(snap);
    },
};

export const localFeaturedShot: FeaturedShotPort = {
    async getDailyShot(runId) {
        return readDailyShot(runId);
    },
};

export const localCast: CastPort = {
    async listCast(runId) {
        const snap = await buildLiveSnapshot(runId, 0);
        return snap.characters.map((c) => ({
            id: c.id,
            name: c.name,
            role: c.role,
            portraitUrl: c.portraitUrl,
        }));
    },
};

export const localReading: ReadingPort = {
    async listDossiers(runId) {
        return { dossiers: listDossiers(runId), editorial: readEditorial(runId) };
    },
    async listArchive(runId) {
        return { entries: listArchiveEntries(runId) };
    },
    async readArchiveFile(runId, file) {
        return readArchiveEntry(runId, file);
    },
};

function entitlementsPath(viewerId: string): string {
    const safe = viewerId.replace(/[/\\:*?"<>|\s]+/g, '-').slice(0, 80) || 'anon';
    return path.join(labDataDir(), 'entitlements', `${safe}.json`);
}

interface EntitlementFile {
    subscriptions: string[];
}

export const localEntitlement: EntitlementPort = {
    async canReadPov(viewerId, characterId) {
        if (!viewerId) return false;
        return localEntitlement.isSubscribed(viewerId, characterId);
    },
    async isSubscribed(viewerId, characterId) {
        if (!viewerId) return false;
        const file = readJson<EntitlementFile>(entitlementsPath(viewerId));
        return Boolean(file?.subscriptions?.includes(characterId));
    },
    async subscribe(viewerId, characterId) {
        const file = readJson<EntitlementFile>(entitlementsPath(viewerId)) ?? { subscriptions: [] };
        if (!file.subscriptions.includes(characterId)) file.subscriptions.push(characterId);
        writeJsonAtomic(entitlementsPath(viewerId), file);
    },
    async unsubscribe(viewerId, characterId) {
        const file = readJson<EntitlementFile>(entitlementsPath(viewerId)) ?? { subscriptions: [] };
        file.subscriptions = file.subscriptions.filter((id) => id !== characterId);
        writeJsonAtomic(entitlementsPath(viewerId), file);
    },
};

export const localRecruitment: RecruitmentPort = {
    async listOpenCampaigns() {
        const cfg = resolvePublicConfig();
        return [
            {
                id: 'follow-cast',
                title: `${cfg.brand} · 追蹤入班（本地）`,
                slots: undefined,
            },
        ];
    },
    async join(viewerId, _campaignId) {
        // Phase-1 local join = track entitlement stub; true joinCastMember stays director-side.
        void viewerId;
        try {
            return { characterId: requirePublicRunId() };
        } catch {
            return {};
        }
    },
};

function vaultDir(viewerId: string): string {
    const safe = viewerId.replace(/[/\\:*?"<>|\s]+/g, '-').slice(0, 80) || 'anon';
    return path.join(labDataDir(), 'vaults', safe);
}

export const localVault: VaultPort = {
    async getInventory(viewerId) {
        const file = path.join(vaultDir(viewerId), 'inventory.json');
        return readJson<Array<{ id: string; title: string; imageUrl?: string }>>(file) ?? [];
    },
    async getLayout(viewerId) {
        const file = path.join(vaultDir(viewerId), 'layout.json');
        return readJson(file) ?? { rooms: [] };
    },
    async saveLayout(viewerId, layout) {
        ensureDir(vaultDir(viewerId));
        writeJsonAtomic(path.join(vaultDir(viewerId), 'layout.json'), layout);
    },
};

/** Ensure vault root exists lazily (no-op if unused). */
export function ensureLocalVaultScaffold(viewerId: string): void {
    ensureDir(vaultDir(viewerId));
    const inv = path.join(vaultDir(viewerId), 'inventory.json');
    if (!fs.existsSync(inv)) writeJsonAtomic(inv, []);
}
