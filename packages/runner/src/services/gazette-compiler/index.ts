/**
 * Gazette Compiler — saga-level daily gazette aggregator.
 *
 * **Inputs read from chain** (all happen in the runOnce):
 *   - Saga state (name + character_count + treasury)
 *   - Recent director events (StoryletOpened / CharacterCalled / etc.)
 *   - Recent character mints (CharacterMinted)
 *   - Recent POV chapter commitments (CommitmentCreated where subject
 *     is one of the saga's characters)
 *
 * **LLM rules**: see `prompt.ts`. Compiler is template-strict; the
 * LLM only smooths event prose + writes a 1-line tagline.
 *
 * **Output**: gazette markdown blob → Walrus → commitment::commit
 * with `subject_id = sagaId` so it's clearly distinguished from
 * character POV commitments (subject_id = characterId).
 *
 * **Cadence (R3 manual)**: admin triggers via server action. Future
 * R3+ auto-trigger: per-narrative-day boundary (skip empty days).
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
import { fetchWorldTime } from '../../infra/world-time.js';
import {
    buildSystemPrompt,
    buildUserPrompt,
    type GazetteChapter,
    type GazetteEvent,
    type GazetteSnapshot,
} from './prompt.js';

export {
    buildSystemPrompt as buildGazetteSystemPrompt,
    buildUserPrompt as buildGazetteUserPrompt,
    type GazetteChapter,
    type GazetteEvent,
    type GazetteSnapshot,
} from './prompt.js';

export interface CompileGazetteInput {
    sagaId: string;
    /** Narrative day boundary. If omitted, derived from saga world tick
     *  (or 1 if unavailable). Used in the gazette title; no event-time
     *  filtering yet (R3 gathers ALL recent events; a future R3.5 will
     *  filter by day). */
    day?: number;
    /** Cap on events scanned per kind. Default 20. */
    maxEventsPerKind?: number;
    /** Cap on POV chapters fetched. Default 10. */
    maxChapters?: number;
    /** Signer (StorytellerCap holder) for the chain anchor step. */
    signer?: { keypair: Keypair; storytellerCapId: string };
    /** Override LLM model. */
    model?: string;
    /** Dry-run: produce markdown but don't anchor on chain. */
    dryRun?: boolean;
}

export interface CompileGazetteResult {
    /** Final markdown body. */
    markdown: string;
    /** How many of each kind made it into the gazette. */
    eventCount: number;
    chapterCount: number;
    /** Whether anchored on chain. */
    anchored: boolean;
    commitmentId?: string;
    blobId?: string;
    blobUrl?: string;
    contentHashHex?: string;
    digest?: string;
    skipReason?: 'no_content';
    snapshot?: GazetteSnapshot;
    errors?: string[];
}

/**
 * Rewrite the gazette's POV "read full text" links from the raw Walrus blob
 * (`/api/blob/<blobId>`) to the rendered, access-gated dossier chapters tab
 * (`/dossier?id=<characterId>&tab=chapters`). Two reasons:
 *   1. the raw blob link bypassed the owner+subscriber gate (gazette is public,
 *      POV bodies are not) — a privacy leak;
 *   2. it dumped raw markdown instead of our rendered chapter view.
 * Deterministic (not LLM-trusted): we map each chapter's blobId→characterId.
 */
function rewriteChapterLinks(
    markdown: string,
    chapters: ReadonlyArray<{ characterId: string; blobId: string }>,
): string {
    let out = markdown;
    for (const c of chapters) {
        if (!c.blobId || !c.characterId) continue;
        const dossier = `/dossier?id=${c.characterId}&tab=chapters`;
        out = out.split(`/api/blob/${c.blobId}`).join(dossier);
    }
    return out;
}

export async function runOnce(input: CompileGazetteInput): Promise<CompileGazetteResult> {
    const client = makeSuiClient({ network: resolveNetwork() });
    const snapshot = await fetchGazetteSnapshot(client, input);

    if (snapshot.events.length === 0 && snapshot.chapters.length === 0) {
        return {
            markdown: '',
            eventCount: 0,
            chapterCount: 0,
            anchored: false,
            skipReason: 'no_content',
            snapshot,
        };
    }

    const llm = llmText.createTextClient({ kind: 'cheap' });
    const modelId = input.model ?? llm.defaultModel;

    const system = buildSystemPrompt(snapshot.soul);
    const user = buildUserPrompt(snapshot);

    const response = await llm.chat({
        model: modelId,
        system,
        messages: [{ role: 'user', content: user }],
        maxTokens: 1500,
        temperature: 0.5,
    });
    const markdown = rewriteChapterLinks(response.text.trim(), snapshot.chapters);

    if (input.dryRun || !input.signer) {
        return {
            markdown,
            eventCount: snapshot.events.length,
            chapterCount: snapshot.chapters.length,
            anchored: false,
            snapshot,
        };
    }

    const anchor = await signAndAnchor({
        sagaId: input.sagaId,
        // Subject = sagaId so readers can filter "saga-level commitments"
        // from "character-level POV chapters" by subject discriminator.
        subjectId: input.sagaId,
        content: new TextEncoder().encode(markdown),
        contentType: 'text/markdown',
        signer: input.signer.keypair,
    });

    return {
        markdown,
        eventCount: snapshot.events.length,
        chapterCount: snapshot.chapters.length,
        anchored: true,
        commitmentId: anchor.commitmentId,
        blobId: anchor.blobId,
        blobUrl: anchor.blobUrl,
        contentHashHex: anchor.contentHashHex,
        digest: anchor.digest,
        snapshot,
    };
}

/* ── snapshot reader ─────────────────────────────────────────────── */

async function fetchGazetteSnapshot(
    client: SuiClient,
    input: CompileGazetteInput,
): Promise<GazetteSnapshot> {
    const pkg = ENDLESS_STORY_DEPLOYMENT.packageId;
    const sagaRes = await read.saga.getSaga(client, input.sagaId);
    const sagaJson = sagaRes.json as unknown as {
        name?: string;
        treasury?: number | string;
        character_count?: number | string;
        description?: string;
        departure_policy?: string;
        nature_prompt?: string;
        rhythm_hints?: string;
    };
    const soul = {
        sagaName: sagaJson.name ?? '無名戲班',
        premise: sagaJson.description?.trim() || undefined,
        departurePolicy: sagaJson.departure_policy?.trim() || undefined,
        naturePrompt: sagaJson.nature_prompt?.trim() || undefined,
        rhythmHints: sagaJson.rhythm_hints?.trim() || undefined,
    };

    const charactersRes = pkg
        ? await read.character.listMintedCharacters(client, pkg, { sagaId: input.sagaId })
        : { summaries: [] as { characterId: string; name: string; mintedAtMs: string }[] };
    const charById = new Map(
        charactersRes.summaries.map((c) => [c.characterId, c.name]),
    );

    const maxEvents = input.maxEventsPerKind ?? 20;
    const events: GazetteEvent[] = [];

    // New members — CharacterMinted into this saga is news ("X joins the troupe").
    // We list the most recent few so a freshly-seeded saga (no director
    // events / POV yet) still produces a non-empty gazette. Once real
    // activity exists, these become a small tail. Mints are wall-clock
    // (not tick-based), so we can't cleanly scope to "today" — bounded
    // to the latest 5 to limit cross-gazette repetition.
    const recentJoins = [...charactersRes.summaries]
        .sort((a, b) => Number(b.mintedAtMs ?? 0) - Number(a.mintedAtMs ?? 0))
        .slice(0, 5);
    for (const c of recentJoins) {
        events.push({
            kind: 'CharacterJoined',
            summary: `「${c.name}」入班 ${sagaJson.name ?? '春雪社'}`,
            characterNames: [c.name],
            timestampMs: c.mintedAtMs ?? '0',
        });
    }

    // Director events — opened storylets, character calls, attribute pressures.
    if (pkg) {
        const directorEventTypes = [
            { type: `${pkg}::director::StoryletOpened`, label: 'StoryletOpened' },
            { type: `${pkg}::director::CharacterCalled`, label: 'CharacterCalled' },
            { type: `${pkg}::director::AttributePressureApplied`, label: 'AttributePressureApplied' },
            { type: `${pkg}::director::RelationshipSeeded`, label: 'RelationshipSeeded' },
            { type: `${pkg}::director::PhaseAdvanced`, label: 'PhaseAdvanced' },
        ];
        for (const { type, label } of directorEventTypes) {
            try {
                const page = await client.queryEvents({
                    query: { MoveEventType: type },
                    limit: maxEvents,
                    order: 'descending',
                });
                for (const ev of page.data) {
                    const summary = summariseDirectorEvent(label, ev.parsedJson, charById);
                    if (!summary) continue;
                    events.push({
                        kind: label,
                        summary: summary.text,
                        characterNames: summary.characterNames,
                        timestampMs: ev.timestampMs ?? '0',
                    });
                }
            } catch {
                // Tolerate per-event-type failures; continue with others.
            }
        }

        // event.move BudgetEvent lifecycle. We fetch the shared object
        // for the title + participant snapshot because the *Pushed event
        // only carries ids + counts (title lives in the object). Capped
        // at maxEvents to stay cheap. Resolved status is joined from the
        // BudgetEventResolved log.
        try {
            const [pushed, resolved] = await Promise.all([
                read.event.listBudgetEvents(client, pkg, {
                    sagaId: input.sagaId,
                    maxEvents,
                }),
                read.event.listResolvedBudgetEvents(client, pkg, maxEvents),
            ]);
            const resolvedMap = new Map(
                resolved.map((r) => [r.eventId, r.resolvedAtMs]),
            );
            for (const p of pushed) {
                let title = '一場事件';
                let participantCount = 0;
                try {
                    const objRes = await read.event.getBudgetEvent(client, p.eventId);
                    const json = objRes.json as unknown as {
                        meta?: { title?: string };
                        deck?: { participants?: string[] };
                    };
                    if (json.meta?.title) title = json.meta.title;
                    if (Array.isArray(json.deck?.participants)) {
                        participantCount = json.deck.participants.length;
                    }
                } catch {
                    // fall through with defaults
                }
                const sceneShort = p.sceneId.slice(0, 10);
                const status = resolvedMap.has(p.eventId) ? '已結算' : '未結算';
                events.push({
                    kind: 'BudgetEventOpened',
                    summary: `${sceneShort}… 開了《${title}》，${participantCount} 人參與，${status}`,
                    characterNames: [],
                    timestampMs: p.createdAtMs,
                });
            }
        } catch {
            // continue without budget events on RPC failure
        }
    }

    // POV chapters — commitment::CommitmentCreated where subject is a
    // character in this saga. Reuse the same listCommitments helper
    // pattern but filter to characters we know.
    const chapters: GazetteChapter[] = [];
    if (pkg && charById.size > 0) {
        const max = input.maxChapters ?? 10;
        // One chapter link PER CHARACTER (their latest). listCommitments is
        // newest-first, so the first time we see a character is their most
        // recent POV. Without this, a character who wrote 3 POVs across
        // multiple daily runs shows up 3× in the same gazette — noisy.
        const seenChars = new Set<string>();
        try {
            const allCommits = await read.commitment.listCommitments(client, pkg, {
                maxEvents: max * 3, // overshoot, then filter
            });
            for (const c of allCommits) {
                if (chapters.length >= max) break;
                const charName = charById.get(c.subjectId);
                if (!charName) continue; // not a char in this saga (could be gazette itself)
                if (seenChars.has(c.subjectId)) continue; // keep only latest per character
                seenChars.add(c.subjectId);
                // Fetch blob excerpt for the teaser line in the gazette.
                const excerpt = await fetchExcerpt(c.commitmentId, client).catch(() => '');
                chapters.push({
                    characterId: c.subjectId,
                    characterName: charName,
                    blobId: '', // filled below from commitment object
                    excerpt,
                    committedAtMs: c.committedAtMs,
                });
                // Pull blob_id from the Commitment object for the link.
                try {
                    const res = await read.commitment.getCommitment(client, c.commitmentId);
                    const json = res.json as unknown as { blob_id?: number[] };
                    if (Array.isArray(json.blob_id)) {
                        chapters[chapters.length - 1].blobId = new TextDecoder().decode(
                            new Uint8Array(json.blob_id),
                        );
                    }
                } catch {
                    // skip
                }
            }
        } catch {
            // continue with empty chapters
        }
    }

    // Narrative day: explicit override wins; otherwise derive from the
    // World tick (chain-canonical two-layer clock). Falls back to 1 if
    // the World object is unreadable.
    let day = input.day ?? 1;
    if (input.day == null) {
        const worldId = ENDLESS_STORY_DEPLOYMENT.worldId;
        if (worldId) {
            const wt = await fetchWorldTime(client, worldId);
            day = wt.day;
        }
    }

    return {
        sagaName: sagaJson.name ?? '無名戲班',
        soul,
        day,
        events,
        chapters,
        treasuryEndless:
            sagaJson.treasury != null ? Number(sagaJson.treasury) / 1_000_000 : undefined,
        characterCount:
            sagaJson.character_count != null ? Number(sagaJson.character_count) : undefined,
    };
}

async function fetchExcerpt(commitmentId: string, client: SuiClient): Promise<string> {
    // Excerpt comes from Walrus; we get blob_id off the Commitment then
    // fetch first 80 chars. Bounded so it's cheap.
    try {
        const res = await read.commitment.getCommitment(client, commitmentId);
        const json = res.json as unknown as { blob_id?: number[] };
        if (!Array.isArray(json.blob_id)) return '';
        const blobId = new TextDecoder().decode(new Uint8Array(json.blob_id));
        const r = await fetch(`https://aggregator.walrus-testnet.walrus.space/v1/blobs/${blobId}`, {
            cache: 'no-store',
        });
        if (!r.ok) return '';
        const text = await r.text();
        return text.slice(0, 80).replace(/\s+/g, ' ').trim();
    } catch {
        return '';
    }
}

interface DirectorEventSummary {
    text: string;
    characterNames: string[];
}

function summariseDirectorEvent(
    kind: string,
    parsed: unknown,
    charById: Map<string, string>,
): DirectorEventSummary | null {
    if (typeof parsed !== 'object' || parsed === null) return null;
    const p = parsed as Record<string, unknown>;
    switch (kind) {
        case 'StoryletOpened': {
            const templateId = strField(p, 'template_id');
            const characterIds = arrField(p, 'character_ids');
            const names = characterIds
                .map((id) => charById.get(id))
                .filter((n): n is string => Boolean(n));
            return {
                text: `「${templateId}」storylet 啟動${names.length > 0 ? `，涉及 ${names.join('、')}` : ''}`,
                characterNames: names,
            };
        }
        case 'CharacterCalled': {
            const charName = charById.get(strField(p, 'character_id')) ?? '某人';
            const reason = strField(p, 'reason');
            return {
                text: `召喚${charName}入場${reason ? `：${reason}` : ''}`,
                characterNames: [charName],
            };
        }
        case 'AttributePressureApplied': {
            const axis = strField(p, 'axis');
            const delta = Number(p.delta ?? 0);
            const neg = Boolean(p.is_negative);
            return {
                text: `場景氣場有變動 — ${axis} ${neg ? '-' : '+'}${delta}`,
                characterNames: [],
            };
        }
        case 'RelationshipSeeded': {
            const a = charById.get(strField(p, 'character_a')) ?? '某人';
            const b = charById.get(strField(p, 'character_b')) ?? '某人';
            const tone = strField(p, 'tone');
            return {
                text: `${a} 與 ${b} 之間種下一段 ${tone}`,
                characterNames: [a, b],
            };
        }
        case 'PhaseAdvanced': {
            const next = strField(p, 'next_phase');
            return { text: `戲班進入新階段：${next}`, characterNames: [] };
        }
        default:
            return null;
    }
}

function strField(o: Record<string, unknown>, k: string): string {
    return typeof o[k] === 'string' ? (o[k] as string) : '';
}
function arrField(o: Record<string, unknown>, k: string): string[] {
    const v = o[k];
    if (!Array.isArray(v)) return [];
    return v.filter((x): x is string => typeof x === 'string');
}
