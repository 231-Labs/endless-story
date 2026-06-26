/**
 * Character POV Worker — produces per-character chapters.
 *
 * R2 scope:
 *   - Read character + scene state from chain
 *   - Build POV prompt with character snapshot + a runner-supplied
 *     "what just happened" line (no memory tail / dream pulls yet —
 *     R3 + R5 add those)
 *   - Call LLM → chapter prose
 *   - Sign-and-anchor: Walrus upload + commitment::commit
 *   - Subscriber gate: skip unless `subscriber_count > 0` OR `forceRun`
 *
 * Triggered by:
 *   - Admin button on dossier (manual, demo trigger)
 *   - Eventually: chain event subscriber that fires this on
 *     StoryletOpened / CharacterCalled / SceneEventResolved
 */

import type { Keypair } from '@mysten/sui/cryptography';
import {
    ENDLESS_STORY_DEPLOYMENT,
    makeSuiClient,
    read,
    type SuiClient,
} from '@endless-story/sdk';
import { text as llmText } from '@endless-story/llm';
import { toTraditional } from '@endless-story/shared';
import { auditProse, correctionNote } from '../narrative-audit/index.js';
import { resolveNetwork } from '../../infra/network.js';
import { signAndAnchor } from '../../infra/sign-and-anchor.js';
import {
    buildSystemPrompt,
    buildUserPrompt,
    buildReflectionCodaSystemPrompt,
    buildReflectionCodaUserPrompt,
    findUngroundedHeavyMotifs,
    CODA_DIVIDER,
    type ChapterMode,
    type CharacterSnapshot,
    type CharacterState,
    type SagaSoul,
} from './prompt.js';

export {
    buildSystemPrompt as buildPovSystemPrompt,
    buildUserPrompt as buildPovUserPrompt,
    buildStateBlock,
    shouldSleep,
    evolveState,
    driftState,
    clampState,
    NEUTRAL_STATE,
    WORK_FATIGUE,
    SLEEP_RECOVERY,
    NIGHT_SLEEP_FATIGUE,
    DAY_SLEEP_FATIGUE,
    MIN_SCATTERED_TO_SLEEP,
    MEMORY_PRESSURE_CAP,
    type ChapterMode,
    type CharacterSnapshot,
    type PovPromptInput,
    type SagaSoul,
    type EmotionalStance,
    type CharacterState,
    type SleepDecisionInput,
} from './prompt.js';

export interface RunCharacterWorkerInput {
    /** Character to write POV for. */
    characterId: string;
    /** Saga the character is in (used for commitment + signer cap). */
    sagaId: string;
    /** Runner-supplied "what just happened" line — typically from a chain
     *  event (e.g. "saga director opened a storylet in the backstage dressing room ..."). */
    triggerNarrative: string;
    /** Signer + the StorytellerCap id it controls. Required unless dryRun. */
    signer?: { keypair: Keypair; storytellerCapId: string };
    /** Optional: recent memory snippets to include in prompt (R3+). */
    recentMemorySnippets?: string[];
    /** Optional: owner-injected dream fragment to weave in (R5). */
    dreamFragment?: string;
    /** Optional: subjective relationship memories + public director ties. */
    relationshipHints?: string[];
    /** Optional: public saga roster lines: name / role / scene. */
    rosterContext?: string[];
    /** Optional: saga peers WITH gender, for the self-check's pronoun/kinship rules.
     *  `rosterContext` is plain strings (no gender); pass this to activate those checks.
     *  Empty/omitted ⇒ only craft + mechanism-token rules run. No names are hardcoded. */
    rosterPeople?: Array<{ name: string; gender: string; role?: string }>;
    /** Optional: current plan text (N6). */
    planHint?: string;
    /** Optional: drama-engine tension hint (DR-6) — dominant unmet desire. */
    dramaHint?: string;
    /** Optional: objective same-scene beats this tick (other characters' visible
     *  acts) — keeps same-scene POVs consistent. See PovPromptInput.sceneBeats. */
    sceneBeats?: string[];
    /**
     * Optional: per-saga tonal DNA layered onto the genre baseline (F).
     * When omitted, `runOnce` derives a Tier-1 soul (premise + departure
     * policy) from the saga it already reads. Pass this to enrich with
     * Tier-2 fields (naturePrompt / rhythmHints); provided fields win.
     */
    sagaSoul?: SagaSoul;
    /**
     * Optional: role / specialty override (e.g. "wealthy merchant" from off-chain
     * Recruitment.specialty). Chain `Character` has no role field, so
     * caller is expected to look this up and pass in. If omitted,
     * snapshot defaults to '—' so the LLM doesn't get misled by a
     * fake hardcoded role.
     */
    role?: string;
    /**
     * Optional: chapter framing. `pov` (default) = event-anchored serial
     * chapter (承上/推進/啟下); `genesis` = the character's first 入世序章
     * (front door, no 承上, leans on life memories for thickness);
     * `encounter` = a quiet two-person 關係戲/溫情 (no competition). All modes
     * share the same iron rules + voice — only the framing swaps.
     */
    mode?: ChapterMode;
    /**
     * Optional: this character's contested event RESOLVED this tick. Makes the
     * scene narrate the full arc settling (前因後果收束) instead of one moment,
     * and earns extra length. Threaded from the tick loop's verdict map.
     */
    closing?: boolean;
    /**
     * Optional: 日常層 — this character's current 餓/累/心情 state, tinting the chapter's
     * texture without changing who they are. Omit ⇒ no injection (regression-safe).
     * The tick loop will drift/evolve this per character per tick (see state.ts).
     */
    state?: CharacterState;
    /**
     * Optional: append a private interior「燈下」coda after the scene (the
     * character's honest read on the event / the people / themselves). Default
     * ON for `pov` mode; pass `false` to skip (e.g. a fast dry preview). No-op
     * for genesis/encounter, which have their own framing.
     */
    reflect?: boolean;
    /** Override LLM model. */
    model?: string;
    /** Bypass subscriber gate (admin manual trigger). */
    forceRun?: boolean;
    /** Dry-run: produce prose but don't anchor on chain. */
    dryRun?: boolean;
}

export interface RunCharacterWorkerResult {
    /** Generated chapter prose. */
    chapter: string;
    /** Whether anchored on chain (false if dryRun or skipped). */
    anchored: boolean;
    /** Why the worker skipped, if applicable. */
    skipReason?: 'no_subscribers' | 'character_unreachable';
    /** Chain commitment id if anchored. */
    commitmentId?: string;
    /** Walrus blob id. */
    blobId?: string;
    /** Walrus aggregator URL — handy for direct read. */
    blobUrl?: string;
    /** Hex content hash. */
    contentHashHex?: string;
    /** tx digest. */
    digest?: string;
    /** Snapshot used for prompt — debug aid. */
    snapshot?: CharacterSnapshot;
    /** When the prompt wove a dream in (caller-supplied OR auto-pulled
     *  from latest DreamInjected event), this is the resolved fragment.
     *  UI surfaces it as a "chapter influenced by dream" chip. */
    dreamFragmentUsed?: string;
    /** Errors that didn't abort. */
    errors?: string[];
}

export async function runOnce(input: RunCharacterWorkerInput): Promise<RunCharacterWorkerResult> {
    const client = makeSuiClient({ network: resolveNetwork() });
    const fetched = await fetchCharacterSnapshot(
        client,
        input.characterId,
        input.sagaId,
        input.role,
    );
    if (!fetched) {
        return {
            chapter: '',
            anchored: false,
            skipReason: 'character_unreachable',
            errors: [`character ${input.characterId} not readable from chain`],
        };
    }
    const { snapshot, soul: chainSoul } = fetched;
    const publicSnapshot = stripInternal(snapshot);

    // Subscriber gate: skip if 0 and not forced.
    const subCount = snapshot.subscriberCount ?? 0;
    if (!input.forceRun && subCount === 0) {
        return {
            chapter: '',
            anchored: false,
            skipReason: 'no_subscribers',
            snapshot: publicSnapshot,
        };
    }

    // Pull latest owner-injected dream (if any) so the prompt can
    // weave it in. Caller may also pass dreamFragment explicitly to
    // override (e.g. dry-run test); explicit wins.
    const resolvedDream = input.dreamFragment ?? (await fetchLatestDreamFragment(client, input.characterId));

    const llm = llmText.createTextClient({ kind: 'primary' });
    const modelId = input.model ?? llm.defaultModel;

    // Per-saga soul: chain-derived (Tier 1) merged under any caller override
    // (Tier 2: nature/rhythm). Caller-provided fields win; chain fills the rest.
    const soul: SagaSoul = { ...chainSoul, ...(input.sagaSoul ?? {}) };
    const system = buildSystemPrompt(soul, input.mode ?? 'pov');
    const user = buildUserPrompt({
        character: publicSnapshot,
        triggerNarrative: input.triggerNarrative,
        recentMemorySnippets: input.recentMemorySnippets ?? [],
        dreamFragment: resolvedDream,
        relationshipHints: input.relationshipHints,
        rosterContext: input.rosterContext,
        planHint: input.planHint,
        dramaHint: input.dramaHint,
        sceneBeats: input.sceneBeats,
        closing: input.closing,
        state: input.state,
    });

    // Scene length: the prompt now asks for 700–1100 字 (1200–1500 when an event
    // is settling), so give the cap headroom. A closing chapter must show a full
    // 前因後果, so it gets more room than an ambient beat.
    const sceneMaxTokens = input.closing ? 3000 : 2400;

    const response = await llm.chat({
        model: modelId,
        system,
        messages: [{ role: 'user', content: user }],
        // POV is literary, but should read like controlled fiction rather
        // than an emotional free-write.
        maxTokens: sceneMaxTokens,
        temperature: 0.72,
    });

    let chapter = response.text.trim();
    let heavyMotifs = findUngroundedHeavyMotifs(chapter, publicSnapshot);
    for (let attempt = 0; attempt < 2 && heavyMotifs.length > 0; attempt += 1) {
        const revision = await llm.chat({
            model: modelId,
            system: buildRevisionSystemPrompt(),
            messages: [{ role: 'user', content: buildRevisionUserPrompt(chapter, heavyMotifs) }],
            maxTokens: sceneMaxTokens,
            temperature: 0.25,
        });
        const candidate = revision.text.trim();
        if (candidate) {
            const remainingMotifs = findUngroundedHeavyMotifs(candidate, publicSnapshot);
            if (remainingMotifs.length === 0) {
                chapter = candidate;
                heavyMotifs = [];
                break;
            }
            if (remainingMotifs.length < heavyMotifs.length) {
                chapter = candidate;
                heavyMotifs = remainingMotifs;
                continue;
            }
        }
        break;
    }
    if (heavyMotifs.length > 0) {
        const softened = softenUnsupportedMotifs(chapter);
        const remainingMotifs = findUngroundedHeavyMotifs(softened, publicSnapshot);
        if (remainingMotifs.length < heavyMotifs.length) {
            chapter = softened;
        }
    }

    // Normalise to Traditional, then run the deterministic narrative self-check
    // (craft + mechanism-token + pronoun/kinship rules). Pronoun/kinship rules need
    // peer genders, supplied via `rosterPeople` when the caller has them (the loop
    // does); when omitted, only craft + token checks run. Never fabricate genders.
    chapter = toTraditional(chapter);
    const subject = {
        name: publicSnapshot.name,
        role: publicSnapshot.role,
        gender: publicSnapshot.gender,
    };
    const roster = input.rosterPeople ?? [];
    let violations = auditProse(chapter, subject, roster);
    // Corrective regen runs on ANY violation — it's a pure LLM rewrite (no signer/chain),
    // and the tick loop generates with dryRun=true then anchors separately, so gating on
    // !dryRun would skip the fix in the real flow.
    if (violations.length > 0) {
        console.warn('[character-worker] narrative self-check violations:', violations);
        try {
            const correction = await llm.chat({
                model: modelId,
                system,
                messages: [{ role: 'user', content: user + '\n' + correctionNote(violations) }],
                maxTokens: sceneMaxTokens,
                temperature: 0.4,
            });
            const candidate = toTraditional(correction.text.trim());
            if (candidate) {
                const remaining = auditProse(candidate, subject, roster);
                // Keep the rewrite only if it is no worse than the original.
                if (remaining.length <= violations.length) {
                    chapter = candidate;
                    violations = remaining;
                }
            }
        } catch (err) {
            console.warn('[character-worker] corrective regeneration failed:', err);
        }
    }

    // Optional「燈下」coda — a short off-stage interior monologue appended after the
    // scene behind a「---」divider. OFF by default now: the interior life is meant to
    // live woven INTO the pov prose (see the 內心戲 directive in VOICE), not walled off
    // in a separate段 that read as tacked-on and, under its「專挑最痛/最不體面」prompt,
    // often darker than the scene it followed. Kept as an explicit opt-in (reflect:true)
    // for callers that still want the split「事件客觀 / 燈下主觀」register. pov mode only.
    if (input.reflect === true && (input.mode ?? 'pov') === 'pov' && chapter.trim()) {
        try {
            const coda = await llm.chat({
                model: modelId,
                system: buildReflectionCodaSystemPrompt(soul),
                messages: [
                    {
                        role: 'user',
                        content: buildReflectionCodaUserPrompt({
                            character: publicSnapshot,
                            chapter,
                            triggerNarrative: input.triggerNarrative,
                            relationshipHints: input.relationshipHints,
                        }),
                    },
                ],
                maxTokens: 360,
                temperature: 0.8,
            });
            let codaText = toTraditional(coda.text.trim());
            if (codaText) {
                // Ground the coda the same way as the scene — soften any
                // ungrounded heavy motif (跛/棺/血…) the interior voice might
                // have invented. We deliberately DON'T run the full scene audit
                // on it (that would false-flag a pure monologue for lacking
                // scene craft and drop every coda); the heavy-motif check is the
                // safety-relevant, mode-agnostic part.
                if (findUngroundedHeavyMotifs(codaText, publicSnapshot).length > 0) {
                    codaText = softenUnsupportedMotifs(codaText);
                }
                chapter = `${chapter}${CODA_DIVIDER}${codaText}`;
            }
        } catch (err) {
            console.warn('[character-worker] reflection coda failed:', err);
        }
    }

    if (input.dryRun || !input.signer) {
        return {
            chapter,
            anchored: false,
            snapshot: publicSnapshot,
            dreamFragmentUsed: resolvedDream,
        };
    }

    // Anchor: Walrus + commitment::commit.
    const anchor = await signAndAnchor({
        sagaId: input.sagaId,
        subjectId: input.characterId,
        content: new TextEncoder().encode(chapter),
        contentType: 'text/markdown',
        signer: input.signer.keypair,
    });

    return {
        chapter,
        anchored: true,
        commitmentId: anchor.commitmentId,
        blobId: anchor.blobId,
        blobUrl: anchor.blobUrl,
        contentHashHex: anchor.contentHashHex,
        digest: anchor.digest,
        snapshot: publicSnapshot,
        dreamFragmentUsed: resolvedDream,
    };
}

export function buildRevisionSystemPrompt(): string {
    return [
        '你是一位嚴格但低調的小說編修，任務是把一段角色 POV 章回改回設定可支持的版本。',
        '只做必要刪改：保留人物、場景、關係壓力、事件方向與第一人稱視角。',
        '移除設定沒有支持的強烈創傷意象：肢體殘疾、腿腳舊痛、特殊鞋具、療傷用品、喪葬死亡、血腥威嚇等。',
        '用梨園職業動作承接壓力：身段、台步、站位、槍花、妝面、袖口、眼神、停頓。',
        '不得新增重大事實，不得解釋你如何修改。只輸出改寫後正文。',
    ].join('\n');
}

export function buildRevisionUserPrompt(chapter: string, motifs: string[]): string {
    return [
        '請改寫下面章回，讓它像同一場戲的更克制版本。',
        '要求：不改事件結果；不補新身世；不加入新災禍；不要寫成心得或摘要；只輸出正文。',
        `新文不得包含這些未被設定支持的字串：${motifs.join('、')}`,
        '',
        chapter,
    ].join('\n');
}

function softenUnsupportedMotifs(chapter: string): string {
    let text = chapter;
    for (const [from, to] of SOFTEN_MOTIF_REPLACEMENTS) {
        text = text.split(from).join(to);
    }
    return text;
}

const SOFTEN_MOTIF_REPLACEMENTS: Array<[string, string]> = [
    ['提刀殺人', '提槍登台'],
    ['厚底靴', '戲靴'],
    ['厚底', '靴底'],
    ['膝蓋', '腿腳'],
    ['藥酒', '茶水'],
    ['跌打', '筋骨'],
    ['舊傷', '疲意'],
    ['燒刀子', '熱茶'],
    ['擋酒', '擋場'],
    ['拿命', '下功夫'],
    ['腳下一軟', '身位一亂'],
    ['腳趾頭', '腳底'],
    ['這條腿', '這身架'],
    ['腿彎', '肩背'],
    ['棺材', '戲箱'],
    ['棺', '箱'],
    ['屍首', '影子'],
    ['屍', '影'],
    ['死人', '舊人'],
    ['血跡', '胭脂痕'],
    ['殺氣', '鋒芒'],
    ['煞氣', '壓迫感'],
    ['殺人', '逼人'],
    ['靈堂', '後堂'],
    ['紙紮', '紙扇'],
];

/* ── snapshot ────────────────────────────────────────────────────── */

/** Internal snapshot — includes subscriber_count for gating. */
interface CharacterSnapshotInternal extends CharacterSnapshot {
    subscriberCount: number;
}

function stripInternal(s: CharacterSnapshotInternal): CharacterSnapshot {
    const { subscriberCount: _sc, ...rest } = s;
    return rest;
}

async function fetchCharacterSnapshot(
    client: SuiClient,
    characterId: string,
    sagaId: string,
    roleOverride?: string,
): Promise<{ snapshot: CharacterSnapshotInternal; soul: SagaSoul } | null> {
    const [charRes, sagaRes] = await Promise.all([
        read.character.getCharacter(client, characterId).catch(() => null),
        read.saga.getSaga(client, sagaId).catch(() => null),
    ]);
    if (!charRes) return null;
    const charJson = charRes.json as unknown as {
        profile?: {
            name?: string;
            physical_facts?: {
                species?: string;
                gender?: string;
                body?: string;
                age_years?: number | string;
            };
        };
        attributes?: Array<{ key?: string; value?: number | string }>;
        state?: { current_scene_id?: string | null };
        subscriber_count?: number | string;
    };
    const sagaJson = sagaRes?.json as unknown as
        | {
              name?: string;
              description?: string;
              departure_policy?: string;
              nature_prompt?: string;
              rhythm_hints?: string;
          }
        | undefined;

    // Resolve scene name (optional — null if character not in any scene).
    const sceneIdRaw = unwrapOption(charJson.state?.current_scene_id);
    const sceneName = sceneIdRaw
        ? await read.scene
              .getScene(client, sceneIdRaw)
              .then((r) => (r.json as { info?: { name?: string } })?.info?.name)
              .catch(() => undefined)
        : undefined;

    const attrMap: Record<string, number> = {};
    for (const a of charJson.attributes ?? []) {
        if (typeof a?.key === 'string' && a?.value != null) {
            attrMap[a.key] = Number(a.value);
        }
    }
    const physical = charJson.profile?.physical_facts;

    const snapshot: CharacterSnapshotInternal = {
        id: characterId,
        name: charJson.profile?.name ?? '無名',
        // Role is not on chain — caller supplies via roleOverride
        // (typically resolved from off-chain Recruitment.specialty
        // via voucher hint). Without override, render as '—' so the
        // LLM doesn't get misled into impersonating a wrong role.
        role: roleOverride ?? '—',
        gender: mapGender(physical?.gender ?? ''),
        ageYears: Number(physical?.age_years ?? 0),
        sagaName: sagaJson?.name ?? '無名戲班',
        sceneName,
        physicalFacts:
            [physical?.species, physical?.body].filter(Boolean).join(' / ') || '—',
        attributes: {
            appearance: attrMap.appearance,
            constitution: attrMap.constitution,
            acuity: attrMap.acuity,
            disposition: attrMap.disposition,
        },
        subscriberCount: charJson.subscriber_count != null ? Number(charJson.subscriber_count) : 0,
    };

    // Saga soul from the saga object we already fetched above. All fields are
    // on chain (F Tier 2), so the full soul — premise + departure policy +
    // nature/rhythm — is derived here with no extra fetch. Callers may still
    // override via input.sagaSoul (merged in runOnce).
    const soul: SagaSoul = {
        sagaName: sagaJson?.name ?? '無名戲班',
        premise: sagaJson?.description?.trim() || undefined,
        departurePolicy: sagaJson?.departure_policy?.trim() || undefined,
        naturePrompt: sagaJson?.nature_prompt?.trim() || undefined,
        rhythmHints: sagaJson?.rhythm_hints?.trim() || undefined,
    };

    return { snapshot, soul };
}

function unwrapOption(raw: unknown): string | null {
    if (raw == null) return null;
    if (typeof raw === 'string') return raw;
    if (typeof raw !== 'object') return null;
    const obj = raw as Record<string, unknown>;
    if ('Some' in obj && typeof obj.Some === 'string') return obj.Some;
    if ('vec' in obj && Array.isArray(obj.vec)) {
        return typeof obj.vec[0] === 'string' ? obj.vec[0] : null;
    }
    return null;
}

function mapGender(raw: string): string {
    if (raw === '男' || raw.toLowerCase() === 'male') return '男';
    if (raw === '女' || raw.toLowerCase() === 'female') return '女';
    return '中性';
}

/**
 * Find the latest DreamInjected event for this character, fetch the
 * Dream object → get blob_id → fetch text from Walrus.
 *
 * Returns undefined if no dream exists, or any step fails — the POV
 * worker degrades gracefully (no dream weaving, normal prompt).
 *
 * Smallville convention: only the most recent dream is surfaced per
 * chapter, since dream is meant to be a fresh emotional anchor. Older
 * dreams persist on chain but get demoted to memory-tail (R-next).
 */
async function fetchLatestDreamFragment(
    client: SuiClient,
    characterId: string,
): Promise<string | undefined> {
    const pkg = ENDLESS_STORY_DEPLOYMENT.packageId;
    if (!pkg) return undefined;
    try {
        const dreams = await read.dream.listDreamInjectedEvents(client, pkg, {
            characterId,
            maxEvents: 1,
        });
        if (dreams.length === 0) return undefined;
        const dreamId = dreams[0].dreamId;
        const res = await read.dream.getDream(client, dreamId);
        const json = res.json as unknown as { blob_id?: number[] };
        if (!Array.isArray(json.blob_id)) return undefined;
        const blobId = new TextDecoder().decode(new Uint8Array(json.blob_id));
        const r = await fetch(
            `https://aggregator.walrus-testnet.walrus.space/v1/blobs/${blobId}`,
            { cache: 'no-store' },
        );
        if (!r.ok) return undefined;
        const text = await r.text();
        return text.trim() || undefined;
    } catch (err) {
        console.warn('[character-worker] fetchLatestDreamFragment failed:', err);
        return undefined;
    }
}
