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
import { resolveNetwork } from '../../infra/network.js';
import { signAndAnchor } from '../../infra/sign-and-anchor.js';
import {
    buildSystemPrompt,
    buildUserPrompt,
    findUngroundedHeavyMotifs,
    type CharacterSnapshot,
} from './prompt.js';

export interface RunCharacterWorkerInput {
    /** Character to write POV for. */
    characterId: string;
    /** Saga the character is in (used for commitment + signer cap). */
    sagaId: string;
    /** Runner-supplied "what just happened" line — typically from a chain
     *  event (e.g. "saga director 在後台化妝間開了 storylet ..."). */
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
    /** Optional: current plan text (N6). */
    planHint?: string;
    /** Optional: drama-engine tension hint (DR-6) — dominant unmet desire. */
    dramaHint?: string;
    /**
     * Optional: role / specialty override (e.g. "富商" from off-chain
     * Recruitment.specialty). Chain `Character` has no role field, so
     * caller is expected to look this up and pass in. If omitted,
     * snapshot defaults to '—' so the LLM doesn't get misled by a
     * fake role like the previous hardcoded '武小生'.
     */
    role?: string;
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
     *  UI surfaces it as a「本章受夢境影響」chip. */
    dreamFragmentUsed?: string;
    /** Errors that didn't abort. */
    errors?: string[];
}

export async function runOnce(input: RunCharacterWorkerInput): Promise<RunCharacterWorkerResult> {
    const client = makeSuiClient({ network: resolveNetwork() });
    const snapshot = await fetchCharacterSnapshot(
        client,
        input.characterId,
        input.sagaId,
        input.role,
    );
    if (!snapshot) {
        return {
            chapter: '',
            anchored: false,
            skipReason: 'character_unreachable',
            errors: [`character ${input.characterId} not readable from chain`],
        };
    }
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

    const system = buildSystemPrompt();
    const user = buildUserPrompt({
        character: publicSnapshot,
        triggerNarrative: input.triggerNarrative,
        recentMemorySnippets: input.recentMemorySnippets ?? [],
        dreamFragment: resolvedDream,
        relationshipHints: input.relationshipHints,
        rosterContext: input.rosterContext,
        planHint: input.planHint,
        dramaHint: input.dramaHint,
    });

    const response = await llm.chat({
        model: modelId,
        system,
        messages: [{ role: 'user', content: user }],
        // POV is literary, but should read like controlled fiction rather
        // than an emotional free-write. Keep enough room for 3-6 paragraphs.
        maxTokens: 1800,
        temperature: 0.72,
    });

    let chapter = response.text.trim();
    let heavyMotifs = findUngroundedHeavyMotifs(chapter, publicSnapshot);
    for (let attempt = 0; attempt < 2 && heavyMotifs.length > 0; attempt += 1) {
        const revision = await llm.chat({
            model: modelId,
            system: buildRevisionSystemPrompt(),
            messages: [{ role: 'user', content: buildRevisionUserPrompt(chapter, heavyMotifs) }],
            maxTokens: 1800,
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

function buildRevisionSystemPrompt(): string {
    return [
        '你是一位嚴格但低調的小說編修，任務是把一段角色 POV 章回改回設定可支持的版本。',
        '只做必要刪改：保留人物、場景、關係壓力、事件方向與第一人稱視角。',
        '移除設定沒有支持的強烈創傷意象：肢體殘疾、腿腳舊痛、特殊鞋具、療傷用品、喪葬死亡、血腥威嚇等。',
        '用梨園職業動作承接壓力：身段、台步、站位、槍花、妝面、袖口、眼神、停頓。',
        '不得新增重大事實，不得解釋你如何修改。只輸出改寫後正文。',
    ].join('\n');
}

function buildRevisionUserPrompt(chapter: string, motifs: string[]): string {
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
): Promise<CharacterSnapshotInternal | null> {
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
    const sagaJson = sagaRes?.json as unknown as { name?: string } | undefined;

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

    return {
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
