/** Local (off-chain lab) adapters — default product backend. */

import { buildLiveSnapshot } from '@/lib/lab/live';
import { sanitizeLiveForGuest } from '@/lib/lab/guest-view';
import { readDailyShot } from '@/lib/lab/daily-shot';
import { listArchiveEntries, listDossiers, readArchiveEntry, readEditorial, tailTickRecords } from '@/lib/lab/artifacts';
import { resolvePublicConfig } from '@/lib/lab/public-config';
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
    async listTicks(runId, limit = 60) {
        return { records: tailTickRecords(runId, limit) };
    },
};

function entitlementsPath(viewerId: string): string {
    const safe = viewerId.replace(/[/\\:*?"<>|\s]+/g, '-').slice(0, 80) || 'anon';
    return path.join(labDataDir(), 'entitlements', `${safe}.json`);
}

interface EntitlementFile {
    subscriptions: string[];
    follows: string[];
}

function readEntitlements(viewerId: string): EntitlementFile {
    const file = readJson<EntitlementFile>(entitlementsPath(viewerId));
    return {
        subscriptions: file?.subscriptions ?? [],
        follows: file?.follows ?? [],
    };
}

function writeEntitlements(viewerId: string, file: EntitlementFile): void {
    writeJsonAtomic(entitlementsPath(viewerId), file);
}

export const localEntitlement: EntitlementPort = {
    async canReadPov(viewerId, characterId) {
        if (!viewerId) return false;
        return localEntitlement.isSubscribed(viewerId, characterId);
    },
    async isSubscribed(viewerId, characterId) {
        if (!viewerId) return false;
        return readEntitlements(viewerId).subscriptions.includes(characterId);
    },
    async listSubscriptions(viewerId) {
        return readEntitlements(viewerId).subscriptions;
    },
    async listFollows(viewerId) {
        return readEntitlements(viewerId).follows;
    },
    async follow(viewerId, characterId) {
        const file = readEntitlements(viewerId);
        if (!file.follows.includes(characterId)) file.follows.push(characterId);
        writeEntitlements(viewerId, file);
    },
    async unfollow(viewerId, characterId) {
        const file = readEntitlements(viewerId);
        file.follows = file.follows.filter((id) => id !== characterId);
        writeEntitlements(viewerId, file);
    },
    async subscribe(viewerId, characterId) {
        const file = readEntitlements(viewerId);
        if (!file.subscriptions.includes(characterId)) file.subscriptions.push(characterId);
        writeEntitlements(viewerId, file);
    },
    async unsubscribe(viewerId, characterId) {
        const file = readEntitlements(viewerId);
        file.subscriptions = file.subscriptions.filter((id) => id !== characterId);
        writeEntitlements(viewerId, file);
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
    async join(viewerId, _campaignId, opts) {
        const characterId = opts?.characterId;
        if (characterId && localEntitlement.follow) {
            await localEntitlement.follow(viewerId, characterId);
            return { characterId };
        }
        return {};
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
    async addItem(viewerId, item) {
        ensureLocalVaultScaffold(viewerId);
        const inventory = await localVault.getInventory(viewerId);
        if (!inventory.some((i) => i.id === item.id)) inventory.push(item);
        writeJsonAtomic(path.join(vaultDir(viewerId), 'inventory.json'), inventory);
        return inventory;
    },
};

/** Ensure vault root exists lazily (no-op if unused). */
export function ensureLocalVaultScaffold(viewerId: string): void {
    ensureDir(vaultDir(viewerId));
    const inv = path.join(vaultDir(viewerId), 'inventory.json');
    if (!fs.existsSync(inv)) writeJsonAtomic(inv, []);
}
