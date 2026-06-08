'use server';

/**
 * Server-side recruitments store — JSON file at `web/data/recruitments.json`.
 *
 * Read by `lib/api/recruitments.ts` (user-facing carousel + dossier).
 * Written by `app/(admin)/admin/recruitments/` (CRUD UI) and by the
 * `seedDefaultRecruitments` server action (admin /admin/deploy ③ button).
 *
 * **Starts empty.** No auto-seed from mocks anymore — admin must click
 * the seed button (or hand-craft via the recruitments UI). Seed data
 * lives in `lib/recruitment-seeds.ts`.
 *
 * No locking — single-writer assumed (dev / admin local). For
 * production swap to a DB.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { revalidatePath } from 'next/cache';
import type { Recruitment } from '@endless-story/shared';
import { loadStoryPreset } from '@/lib/stories/loader';
import { suggestedBulkPrice, DEFAULT_BULK_MARGIN } from '@/lib/recruit-pricing';

export interface AdminRecruitment extends Recruitment {
    /** Active = appears in user-facing carousel. */
    active: boolean;
}

const DATA_DIR = path.join(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'recruitments.json');

function readStore(): AdminRecruitment[] {
    if (!fs.existsSync(STORE_PATH)) return [];
    try {
        const raw = JSON.parse(fs.readFileSync(STORE_PATH, 'utf-8')) as AdminRecruitment[];
        return Array.isArray(raw) ? raw : [];
    } catch (err) {
        console.warn('[recruitments-store] corrupt JSON, treating as empty:', err);
        return [];
    }
}

function persist(items: AdminRecruitment[]) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(STORE_PATH, JSON.stringify(items, null, 2), 'utf-8');
    // Invalidate the homepage carousel + any other consumers.
    revalidatePath('/');
    revalidatePath('/admin/recruitments');
}

export async function listAllRecruitments(): Promise<AdminRecruitment[]> {
    return readStore();
}

export async function listOpenStoreRecruitments(): Promise<Recruitment[]> {
    const all = readStore();
    const now = new Date().toISOString();
    return all.filter((r) => r.active && r.slots > 0 && r.expiresAt > now);
}

export async function getStoreRecruitment(id: string): Promise<AdminRecruitment | null> {
    const all = readStore();
    return all.find((r) => r.id === id) ?? null;
}

export async function upsertRecruitment(input: AdminRecruitment): Promise<AdminRecruitment> {
    const all = readStore();
    const i = all.findIndex((r) => r.id === input.id);
    if (i >= 0) all[i] = input;
    else all.push(input);
    persist(all);
    return input;
}

export async function deleteRecruitment(id: string): Promise<void> {
    const all = readStore();
    const filtered = all.filter((r) => r.id !== id);
    persist(filtered);
}

/**
 * 一鍵清空招募紀錄 —— 把整個 store 倒空(連人工建的 row 也清)。
 * 給「清乾淨再 seed 重種」的測試流程用。回傳清掉幾筆。
 */
export async function clearAllRecruitments(): Promise<{ ok: boolean; cleared: number }> {
    const cleared = readStore().length;
    persist([]);
    return { ok: true, cleared };
}

export async function setRecruitmentActive(id: string, active: boolean): Promise<void> {
    const all = readStore();
    const r = all.find((x) => x.id === id);
    if (!r) throw new Error(`recruitment not found: ${id}`);
    r.active = active;
    persist(all);
}

export async function newRecruitmentDraft(sagaId: string, sagaName: string): Promise<AdminRecruitment> {
    const id = `rec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    return {
        id,
        sagaId,
        sagaName,
        specialty: '',
        roleIntent: '',
        membership: 'internal',
        slots: 1,
        basePrice: 100,
        // bulkPrice left unset (= basePrice until the admin sets minAttributes and
        // clicks 「建議」, or runs batch auto-pricing).
        expiresAt,
        createdAt: new Date().toISOString(),
        active: false,
    };
}

export interface SeedDefaultsResult {
    ok: boolean;
    inserted: number;
    skipped: number;
    storyId: string;
    /** Summary log lines for admin UI display. */
    log: string[];
}

/**
 * Batch-open the preset recruitments from a story JSON file
 * (packages/cli/scripts/stories/<storyId>.json). Skips any whose id
 * already exists, so re-running is idempotent and won't clobber
 * admin edits. Stale rows generated from an older preset for the same
 * story are deactivated, but hand-crafted admin rows are left alone.
 *
 * Each preset's `ttl_days` is applied from "now" at seed time so a
 * static JSON never goes stale.
 */
export async function seedDefaultRecruitments(storyId: string): Promise<SeedDefaultsResult> {
    const preset = await loadStoryPreset(storyId);

    const existing = readStore();
    const presetIds = new Set(preset.recruitments.map((r) => r.id));

    const log: string[] = [];
    log.push(`preset: ${preset.id} (${preset.label})`);
    log.push(`saga:   ${preset.saga.name}`);
    log.push(`---`);
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    let deactivated = 0;
    const nowIso = new Date().toISOString();

    for (const row of existing) {
        const wasPresetSeed = (row as { ttl_days?: unknown }).ttl_days !== undefined;
        if (row.sagaId === preset.id && wasPresetSeed && !presetIds.has(row.id) && row.active) {
            row.active = false;
            deactivated++;
            log.push(`OFF   ${row.id} (${row.specialty}) — stale preset row`);
        }
    }

    for (const seed of preset.recruitments) {
        const ttlMs = (seed.ttl_days ?? 14) * 86_400_000;
        const fresh: AdminRecruitment = {
            ...seed,
            sagaId: preset.id,
            sagaName: preset.saga.name,
            // Seeds may omit bulkPrice — derive it from the requirement difficulty
            // so fresh deploys are priced correctly without hand-editing the JSON.
            bulkPrice: seed.bulkPrice ?? suggestedBulkPrice(seed.basePrice, seed.minAttributes),
            createdAt: nowIso,
            expiresAt: new Date(Date.now() + ttlMs).toISOString(),
            active: true,
        };

        const idx = existing.findIndex((r) => r.id === seed.id);
        if (idx === -1) {
            existing.push(fresh);
            log.push(`ADD   ${seed.id} (${seed.specialty})`);
            inserted++;
            continue;
        }

        const prev = existing[idx];
        const wasPresetSeed = (prev as { ttl_days?: unknown }).ttl_days !== undefined;
        if (!wasPresetSeed) {
            // 人工在 admin UI 建的 row（無 ttl_days）— 不覆蓋。
            log.push(`SKIP  ${seed.id} (${seed.specialty}) — manual row, kept`);
            skipped++;
            continue;
        }
        // preset 種過的 row：用最新 preset「整筆覆寫」（連被移除的欄位如 genderRequirement
        // 也一併更新），只保留原 createdAt。這樣改 json 後 reseed 就會反映新描述/設定。
        existing[idx] = { ...fresh, createdAt: prev.createdAt ?? nowIso };
        log.push(`UPD   ${seed.id} (${seed.specialty})`);
        updated++;
    }

    if (inserted > 0 || updated > 0 || deactivated > 0) persist(existing);
    log.push(`---`);
    log.push(
        `inserted: ${inserted}   updated: ${updated}   skipped: ${skipped}   deactivated: ${deactivated}   total: ${existing.length}`,
    );

    return { ok: true, inserted, skipped, storyId, log };
}

/**
 * Batch re-price every recruitment's 必應 from its requirement difficulty
 * (basePrice × E[draws] × margin — see docs/WHITEPAPER.md §1). Idempotent;
 * returns how many rows changed.
 */
export async function autoPriceAllRecruitments(
    margin = DEFAULT_BULK_MARGIN,
): Promise<{ ok: boolean; updated: number }> {
    const items = readStore();
    let updated = 0;
    for (const r of items) {
        const next = suggestedBulkPrice(r.basePrice, r.minAttributes, margin);
        if (r.bulkPrice !== next) {
            r.bulkPrice = next;
            updated += 1;
        }
    }
    if (updated > 0) persist(items);
    return { ok: true, updated };
}
