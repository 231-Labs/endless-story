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
}

export interface DossierPerspectiveSource {
    characterId: string;
    characterName: string;
    role?: string;
    portrait?: string;
    lead?: string;
    /** First-person prose projected read-only from this character's session. */
    body: string;
    /** Optional audited claims. Missing claims get a conservative session claim. */
    claims?: NarrativeClaim[];
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
    return body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
}

function safeSlug(value: string): string {
    return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 72) || 'event';
}

function conservativeClaim(source: DossierPerspectiveSource, eventId: string): NarrativeClaim {
    return {
        id: `${eventId}:claim:${source.characterId}:session`,
        text: `${source.characterName}如何理解這一事件，只能證明其主觀詮釋，不能反向改寫客觀逐拍。`,
        epistemicMode: 'inferred' satisfies EpistemicMode,
        relation: 'reinterprets',
        review: 'unresolved',
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
            return {
                id: `${event.id}:perspective:${source.characterId}`,
                characterId: source.characterId,
                characterName: source.characterName,
                role: source.role ?? '在場者',
                portrait: source.portrait ?? '/hero/saga-day.webp',
                lead: source.lead ?? `${source.characterName}記住的，不必等於別人看見的。`,
                passages: paragraphs(source.body).map((text, i) => ({
                    id: `${event.id}:passage:${source.characterId}:${i}`,
                    text,
                    claimIds: claims.map((c) => c.id),
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

export function parseDossierHeader(content: string): { bundle?: EpistemicDossierBundle; body: string } {
    const match = content.match(DOSSIER_RE);
    if (!match) return { body: content };
    try {
        const bundle = JSON.parse(match[1]) as EpistemicDossierBundle;
        return validateDossier(bundle).ok ? { bundle, body: content.slice(match[0].length) } : { body: content };
    } catch {
        return { body: content };
    }
}
