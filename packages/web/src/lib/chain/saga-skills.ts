/**
 * Per-saga skill seeding — gives each character the 行當 skill values that the
 * card-weight rules (saga `card_weight_rules`) read to bias which cards they're
 * dealt (event.move `compute_card_weights`). Until something writes these, every
 * character has NO saga skills, so the whole card-weight system is inert (uniform
 * draw). This is what makes a 武旦 deal more 武打 cards, a 花旦 more 唱念 cards.
 *
 * Server-only (admin keypair + chain writes). NOT a 'use server' module — server
 * actions call it. `deriveSagaSkills` is a pure, flexible, substring-on-role
 * mapping (unknown 行當 → a balanced fallback), nudged by the rolled world attrs
 * so two same-行當 characters still differ.
 */

import { Transaction } from '@mysten/sui/transactions';
import { ENDLESS_STORY_DEPLOYMENT, tx as endlessTx } from '@endless-story/sdk';
import type { AdminContext } from '@/lib/chain/admin-signer';

/** The six per-saga skills declared in the spring-snow preset's `saga_attributes`. */
export type SkillKey =
    | 'vocal'
    | 'movement'
    | 'stage_presence'
    | 'martial'
    | 'literati'
    | 'networking';

export type SkillProfile = Record<SkillKey, number>;

export interface WorldAttrs {
    appearance?: number;
    constitution?: number;
    acuity?: number;
    disposition?: number;
}

/**
 * 行當 → skill emphasis (the character's 本工). Substring match, most specific
 * keywords first; the first hit wins. A 行當 we don't recognise falls through to
 * BALANCED — we never leave a character skill-less. Keep these as the dominant
 * signal: 唱腔/身段 are trained craft, not raw physique.
 */
const SKILL_PROFILES: { match: string[]; profile: SkillProfile }[] = [
    { match: ['刀馬旦', '武旦', '武生', '武小生'], profile: { martial: 88, movement: 86, stage_presence: 72, vocal: 55, networking: 50, literati: 42 } },
    { match: ['花旦', '青衣', '正旦', '坤伶', '旦'], profile: { vocal: 84, stage_presence: 86, movement: 74, networking: 66, literati: 56, martial: 42 } },
    { match: ['坤生', '乾生', '小生'], profile: { vocal: 82, stage_presence: 84, movement: 76, literati: 64, networking: 56, martial: 58 } },
    { match: ['老生', '鬚生', '老旦'], profile: { vocal: 86, literati: 80, stage_presence: 74, networking: 58, movement: 56, martial: 44 } },
    { match: ['丑'], profile: { networking: 84, stage_presence: 78, movement: 76, literati: 70, vocal: 60, martial: 56 } },
    { match: ['淨', '大面', '花臉', '銅錘'], profile: { martial: 82, vocal: 78, stage_presence: 78, movement: 72, networking: 50, literati: 48 } },
    { match: ['班主', '掌事', '當家', '東家'], profile: { networking: 86, literati: 78, stage_presence: 78, vocal: 60, movement: 52, martial: 48 } },
    { match: ['記者', '報', '筆', '文人', '掮客'], profile: { literati: 88, networking: 84, stage_presence: 56, vocal: 40, movement: 40, martial: 38 } },
    { match: ['琴師', '樂師', '鼓', '場面', '文武場', '司鼓'], profile: { vocal: 72, literati: 70, networking: 58, stage_presence: 52, movement: 50, martial: 50 } },
    { match: ['衣箱', '管箱', '箱'], profile: { networking: 70, literati: 68, stage_presence: 48, movement: 46, vocal: 42, martial: 42 } },
    { match: ['龍套', '武行', '檢場', '道具'], profile: { movement: 64, martial: 64, stage_presence: 48, networking: 48, vocal: 44, literati: 40 } },
];
const BALANCED: SkillProfile = { vocal: 60, movement: 60, stage_presence: 60, martial: 55, literati: 58, networking: 60 };

const SKILL_KEYS: SkillKey[] = ['vocal', 'movement', 'stage_presence', 'martial', 'literati', 'networking'];

function clamp(n: number): number {
    return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Derive a character's six saga skills from 行當 (dominant) + rolled world attrs
 * (a small ± nudge so same-行當 peers individuate). Pure + deterministic.
 */
export function deriveSagaSkills(role: string, world: WorldAttrs = {}): SkillProfile {
    const r = role || '';
    const base = SKILL_PROFILES.find((g) => g.match.some((kw) => r.includes(kw)))?.profile ?? BALANCED;
    // World-attr nudges: physique → martial/movement, looks/heart → presence/vocal,
    // wit → literati/networking. Modest (±~6) so 行當 stays the dominant signal.
    const n = (v: number | undefined) => (typeof v === 'number' ? (v - 70) / 5 : 0);
    const body = n(world.constitution);
    const look = n(world.appearance);
    const wit = n(world.acuity);
    const heart = n(world.disposition);
    return {
        vocal: clamp(base.vocal + heart),
        movement: clamp(base.movement + body),
        stage_presence: clamp(base.stage_presence + look + heart * 0.5),
        martial: clamp(base.martial + body),
        literati: clamp(base.literati + wit),
        networking: clamp(base.networking + wit * 0.5 + heart * 0.5),
    };
}

export interface SeedSkillsResult {
    ok: boolean;
    seeded: number;
    digest?: string;
    error?: string;
}

/**
 * Write all six skills for one character in a single PTB (one signature). The
 * character must already be in the saga (set_character_skill asserts this) and
 * alive. set_character_skill is an upsert, so this is idempotent — re-running
 * overwrites with the same derived values. Best-effort: a failure here just
 * leaves the card draw at uniform weight, never blocks mint/reconcile.
 */
export async function seedCharacterSkills(
    admin: AdminContext,
    characterId: string,
    skills: SkillProfile,
): Promise<SeedSkillsResult> {
    const d = ENDLESS_STORY_DEPLOYMENT;
    if (!d.sagaId || !d.storytellerCapId) {
        return { ok: false, seeded: 0, error: 'saga 尚未種子化' };
    }
    try {
        const tx = new Transaction();
        for (const key of SKILL_KEYS) {
            tx.add(
                endlessTx.character.setCharacterSkill({
                    cap: d.storytellerCapId,
                    saga: d.sagaId,
                    character: characterId,
                    key,
                    value: BigInt(skills[key]),
                    seed: [],
                }),
            );
        }
        const res = await admin.client.signAndExecuteTransaction({
            transaction: tx,
            signer: admin.signer,
            options: { showEffects: true },
        });
        if (res.effects?.status?.status !== 'success') {
            throw new Error(res.effects?.status?.error ?? 'set_character_skill 交易失敗');
        }
        await admin.client.waitForTransaction({ digest: res.digest });
        return { ok: true, seeded: SKILL_KEYS.length, digest: res.digest };
    } catch (err) {
        return { ok: false, seeded: 0, error: err instanceof Error ? err.message : String(err) };
    }
}
