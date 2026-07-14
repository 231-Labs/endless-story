/**
 * Pure compiler from one frozen world event + session POVs to the payload used
 * by EventDossier. It never writes prose and therefore cannot alter canon.
 */

import type {
    DossierEventPresentation,
    EpistemicDossierBundle,
    EpistemicMode,
    NarrativeClaim,
    NarrativeEvidence,
    NarrativePerspective,
} from '@endless-story/shared';
import { povParagraphs } from '../narrative-format/pov-paragraphs.ts';

export interface DossierCanonicalBeat {
    characterId: string;
    name: string;
    text: string;
}

export interface DossierCanonicalEvent {
    id: string;
    canonHead?: string;
    eventTx?: string;
    saga: string;
    day: number;
    scene: string;
    title: string;
    kicker?: string;
    summary?: string;
    hero?: string;
    heroAlt?: string;
    heroZoom?: boolean;
    beats: DossierCanonicalBeat[];
    editorialSignals?: {
        resolvedWants: number;
        departures: number;
        relationshipTurn: boolean;
    };
}

export interface DossierPerspectiveSource {
    characterId: string;
    characterName: string;
    role?: string;
    /** Immutable body/sex canon used only for pronoun and identity guards. */
    bodyFact?: string;
    portrait?: string;
    lead?: string;
    /** First-person prose projected read-only from this character's session. */
    body: string;
    /** Optional audited claims. Missing claims get a conservative session claim. */
    claims?: NarrativeClaim[];
    /** Claim ids selected for each zero-based POV paragraph by the epistemic
     * editor. This keeps one claim from being stamped onto unrelated prose. */
    passageClaimIds?: Record<number, string[]>;
    /** Private memory evidence actually used by this perspective. */
    evidence?: NarrativeEvidence[];
}

export interface CompileDossierInput {
    event: DossierCanonicalEvent;
    perspectives: DossierPerspectiveSource[];
    slug?: string;
}

export interface DossierValidation {
    ok: boolean;
    errors: string[];
}

function paragraphs(body: string): string[] {
    return povParagraphs(body);
}

function excerpt(body: string, max = 38): string {
    const first = paragraphs(body)[0]?.replace(/\s+/g, '') ?? '';
    return first.length > max ? `${first.slice(0, max)}……` : first;
}

function fallbackLead(source: DossierPerspectiveSource): string {
    const remembered = excerpt(source.body);
    return remembered
        ? `${source.characterName}把「${remembered}」留成了這一刻最難放下的部分。`
        : `${source.characterName}留下了一份只有自己能說明的沉默。`;
}

function safeSlug(value: string): string {
    return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 72) || 'event';
}

function conservativeClaim(source: DossierPerspectiveSource, eventId: string): NarrativeClaim {
    const remembered = excerpt(source.body, 46);
    return {
        id: `${eventId}:claim:${source.characterId}:session`,
        text: remembered
            ? `${source.characterName}把這一幕記成「${remembered}」；目前只能確認這是其主觀版本。`
            : `${source.characterName}留下了主觀版本，但沒有足夠內容可與正史逐拍核對。`,
        epistemicMode: 'inferred' satisfies EpistemicMode,
        relation: 'unresolved',
        review: 'unresolved',
        editorialNote: '這份說法只有角色 session 可作證，尚無公開逐拍可確認或反駁。',
        evidenceRefs: [`${eventId}:session:${source.characterId}`],
    };
}

export function compileDossier(input: CompileDossierInput): EpistemicDossierBundle {
    const { event } = input;
    const canonicalEvidence: NarrativeEvidence[] = event.beats.map((beat, i) => ({
        id: `${event.id}:beat:${i}`,
        label: `客觀逐拍 ${i + 1} · ${beat.name}`,
        detail: beat.text,
        visibility: 'public',
        anchor: event.eventTx ?? event.canonHead ?? event.id,
    }));

    const seenEvidence = new Set(canonicalEvidence.map((e) => e.id));
    const evidence = [...canonicalEvidence];
    const perspectives: NarrativePerspective[] = input.perspectives
        .filter((source) => source.body.trim())
        .map((source) => {
            const sessionEvidence: NarrativeEvidence = {
                id: `${event.id}:session:${source.characterId}`,
                label: `${source.characterName}的角色 session`,
                detail: '只含這個角色親歷、被告知與保留下來的記憶；章回投影不會寫回 session。',
                visibility: 'private',
                anchor: event.id,
            };
            if (!seenEvidence.has(sessionEvidence.id)) {
                evidence.push(sessionEvidence);
                seenEvidence.add(sessionEvidence.id);
            }
            for (const item of source.evidence ?? []) {
                if (!seenEvidence.has(item.id)) {
                    evidence.push(item);
                    seenEvidence.add(item.id);
                }
            }
            const claims = source.claims?.length ? source.claims : [conservativeClaim(source, event.id)];
            const claimIds = new Set(claims.map((claim) => claim.id));
            return {
                id: `${event.id}:perspective:${source.characterId}`,
                characterId: source.characterId,
                characterName: source.characterName,
                role: source.role ?? '在場者',
                portrait: source.portrait ?? '/hero/saga-day.webp',
                lead: source.lead ?? fallbackLead(source),
                passages: paragraphs(source.body).map((text, i) => ({
                    id: `${event.id}:passage:${source.characterId}:${i}`,
                    text,
                    claimIds: source.passageClaimIds?.[i]?.filter((id) => claimIds.has(id))
                        ?? claims.map((c) => c.id),
                })),
                claims,
            };
        });

    const presentation: DossierEventPresentation = {
        slug: input.slug ?? safeSlug(event.id),
        saga: event.saga,
        day: event.day,
        scene: event.scene,
        title: event.title,
        kicker: event.kicker ?? '同一件事，在不同的人心裡留下不同的形狀。',
        summary: event.summary ?? event.beats.map((b) => `${b.name}：${b.text}`).join(' '),
        hero: event.hero ?? '/handscroll/s-yunjintai-tai.jpg',
        heroAlt: event.heroAlt ?? `${event.scene}的事件場景`,
        ...(event.heroZoom == null ? {} : { heroZoom: event.heroZoom }),
        canonFacts: event.beats.map((b) => `${b.name}：${b.text}`),
        ...(event.editorialSignals ? { editorialSignals: event.editorialSignals } : {}),
    };

    const bundle: EpistemicDossierBundle = {
        v: 1,
        event: presentation,
        manifest: {
            v: 1,
            eventId: event.id,
            canonHead: event.canonHead ?? event.eventTx ?? event.id,
            eventTx: event.eventTx,
            evidence,
            perspectives,
        },
    };
    const validation = validateDossier(bundle);
    if (!validation.ok) throw new Error(`invalid dossier: ${validation.errors.join('; ')}`);
    return bundle;
}

export function validateDossier(bundle: EpistemicDossierBundle): DossierValidation {
    const errors: string[] = [];
    if (!bundle.manifest.canonHead) errors.push('missing canonHead');
    if (bundle.manifest.perspectives.length < 2) errors.push('fewer than two perspectives');
    const evidenceIds = new Set(bundle.manifest.evidence.map((e) => e.id));
    const claimIds = new Set<string>();
    for (const perspective of bundle.manifest.perspectives) {
        if (!perspective.passages.length) errors.push(`${perspective.characterName}: no passages`);
        for (const claim of perspective.claims) {
            if (claimIds.has(claim.id)) errors.push(`duplicate claim ${claim.id}`);
            claimIds.add(claim.id);
            if (!claim.evidenceRefs.length) errors.push(`${claim.id}: no evidence`);
            for (const ref of claim.evidenceRefs) if (!evidenceIds.has(ref)) errors.push(`${claim.id}: unknown evidence ${ref}`);
        }
        for (const passage of perspective.passages) {
            for (const claimId of passage.claimIds) {
                if (!perspective.claims.some((claim) => claim.id === claimId)) errors.push(`${passage.id}: unknown claim ${claimId}`);
            }
        }
    }
    return { ok: errors.length === 0, errors };
}

const DOSSIER_RE = /^<!--es:dossier\s+(\{[\s\S]*?\})\s*-->\s*/;

export function embedDossierHeader(prose: string, bundle: EpistemicDossierBundle): string {
    return `<!--es:dossier ${JSON.stringify(bundle)}-->\n\n${prose}`;
}

/** Reader-only migration for previously sealed presentation payloads. It does
 * not change prose bytes, evidence, or claim ids: only paragraph boundaries and
 * a redundant pair of display quotes from the first dossier compiler. */
function normalizeLegacyProjection(bundle: EpistemicDossierBundle): EpistemicDossierBundle {
    for (const perspective of bundle.manifest.perspectives) {
        if (perspective.passages.length < 3) {
            perspective.passages = perspective.passages.flatMap((passage) => {
                const parts = povParagraphs(passage.text);
                return parts.map((text, index) => ({
                    ...passage,
                    id: index === 0 ? passage.id : `${passage.id}:part:${index}`,
                    text,
                }));
            });
        }
        perspective.claims = perspective.claims.map((claim) => {
            if (claim.relation !== 'supports' || claim.review !== 'verified') return claim;
            const legacy = claim.text.match(/^客觀逐拍記錄：([^「]+)「([\s\S]*)」$/);
            return legacy ? { ...claim, text: `客觀逐拍記錄：${legacy[1]}：${legacy[2]}` } : claim;
        });
    }
    return bundle;
}

export function parseDossierHeader(content: string): { bundle?: EpistemicDossierBundle; body: string } {
    const match = content.match(DOSSIER_RE);
    if (!match) return { body: content };
    try {
        const bundle = normalizeLegacyProjection(JSON.parse(match[1]) as EpistemicDossierBundle);
        return validateDossier(bundle).ok ? { bundle, body: content.slice(match[0].length) } : { body: content };
    } catch {
        return { body: content };
    }
}
