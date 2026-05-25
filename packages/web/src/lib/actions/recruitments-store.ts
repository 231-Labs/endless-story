'use server';

/**
 * Server-side recruitments store — JSON file at `web/data/recruitments.json`.
 *
 * The user-facing carousel reads via `lib/api/recruitments.ts` which falls
 * back to this when not USE_MOCK. Admin /recruitments page CRUDs it directly.
 *
 * On first read the file is seeded from the mock list so dev runs already
 * have content. Once admin edits, the JSON wins.
 *
 * No locking — single-writer assumed (dev / admin local). For production
 * swap to a DB.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { revalidatePath } from 'next/cache';
import type { Recruitment } from '@endless-story/shared';
import { recruitments as MOCK_SEED } from '@/mocks/recruitments';

export interface AdminRecruitment extends Recruitment {
    /** Active = appears in user-facing carousel. */
    active: boolean;
}

const DATA_DIR = path.join(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'recruitments.json');

function ensureSeeded(): AdminRecruitment[] {
    if (fs.existsSync(STORE_PATH)) {
        try {
            const raw = JSON.parse(fs.readFileSync(STORE_PATH, 'utf-8')) as AdminRecruitment[];
            if (Array.isArray(raw)) return raw;
        } catch (err) {
            console.warn('[recruitments-store] corrupt JSON, re-seeding:', err);
        }
    }
    const seeded: AdminRecruitment[] = MOCK_SEED.map((r) => ({ ...r, active: true }));
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(STORE_PATH, JSON.stringify(seeded, null, 2), 'utf-8');
    return seeded;
}

function persist(items: AdminRecruitment[]) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(STORE_PATH, JSON.stringify(items, null, 2), 'utf-8');
    // Invalidate the homepage carousel + any other consumers.
    revalidatePath('/');
    revalidatePath('/admin/recruitments');
}

export async function listAllRecruitments(): Promise<AdminRecruitment[]> {
    return ensureSeeded();
}

export async function listOpenStoreRecruitments(): Promise<Recruitment[]> {
    const all = ensureSeeded();
    const now = new Date().toISOString();
    return all.filter((r) => r.active && r.slots > 0 && r.expiresAt > now);
}

export async function getStoreRecruitment(id: string): Promise<AdminRecruitment | null> {
    const all = ensureSeeded();
    return all.find((r) => r.id === id) ?? null;
}

export async function upsertRecruitment(input: AdminRecruitment): Promise<AdminRecruitment> {
    const all = ensureSeeded();
    const i = all.findIndex((r) => r.id === input.id);
    if (i >= 0) all[i] = input;
    else all.push(input);
    persist(all);
    return input;
}

export async function deleteRecruitment(id: string): Promise<void> {
    const all = ensureSeeded();
    const filtered = all.filter((r) => r.id !== id);
    persist(filtered);
}

export async function setRecruitmentActive(id: string, active: boolean): Promise<void> {
    const all = ensureSeeded();
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
        expiresAt,
        createdAt: new Date().toISOString(),
        active: false,
    };
}
