/** Turn a completed physical-world tick into the exact dossier header consumed
 * by the product UI. This is a compiler only: it cannot add or rewrite events. */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
    compileDossier,
    embedDossierHeader,
    type DossierCanonicalEvent,
    type DossierPerspectiveSource,
} from '@endless-story/runner/services/event-dossier/compile';
import type { EpistemicDossierBundle } from '@endless-story/shared';
import type { SceneAgentPort } from './ports.ts';
import type { TickReport } from './tick.ts';

export interface DossierCastMember {
    id: string;
    name: string;
    role?: string;
    gender?: string;
}

export interface TickDossierArtifact {
    eventId: string;
    filename: string;
    bundle: EpistemicDossierBundle;
    content: string;
}

function safeFilename(value: string): string {
    return value.replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^-|-$/g, '').slice(0, 120) || 'event';
}

/**
 * 卷宗改吃 beats — build a perspective for a witness who has NO POV prose.
 *
 * The POV tracking switch means most participants no longer get first-person
 * prose, and a dossier needs at least two perspectives to be worth compiling. So
 * an untracked witness's perspective is assembled from what the beats already
 * recorded: their OWN lines plus their OWN 〔心下〕, one paragraph per beat.
 *
 * This is not a downgrade in kind — a beat's 心下 IS that character's subjective
 * record, it simply has not been woven into serial prose. What it cannot do is
 * reinterpret or contradict at length, which is precisely why a tracked
 * character's woven POV remains the richer document.
 *
 * A witness who was present but said nothing yields no perspective (there is no
 * material to attribute to them), rather than an invented one.
 */
function perspectiveFromBeats(
    event: Pick<TickReport['events'][number], 'beats'>,
    characterId: string,
    member?: DossierCastMember,
): DossierPerspectiveSource | undefined {
    const own = event.beats.filter((beat) => beat.characterId === characterId);
    if (!own.length) return undefined;
    const body = own
        .map((beat) => (beat.inner ? `${beat.text}（心下：${beat.inner}）` : beat.text))
        .join('\n\n');
    return {
        characterId,
        characterName: member?.name ?? own[0].name,
        role: member?.role,
        bodyFact: member?.gender,
        body,
    };
}

export async function compileTickDossiers(
    report: Pick<TickReport, 'events' | 'eventPovs'>,
    cast: DossierCastMember[],
    curator?: Pick<SceneAgentPort, 'curateDossier'>,
): Promise<TickDossierArtifact[]> {
    const byId = new Map(cast.map((member) => [member.id, member]));
    const artifacts: TickDossierArtifact[] = [];
    for (const event of report.events) {
        // Private windows stay in the participants' sessions and never become a
        // public dossier merely because two witnesses were present.
        if (event.visibility !== 'public') continue;
        let perspectives: DossierPerspectiveSource[] = report.eventPovs
            .filter((pov) => pov.eventId === event.id && event.witnessIds.includes(pov.characterId))
            .map((pov) => ({
                characterId: pov.characterId,
                characterName: pov.name,
                role: byId.get(pov.characterId)?.role,
                bodyFact: byId.get(pov.characterId)?.gender,
                body: pov.body,
            }));
        // With the POV tracking switch on, most witnesses have no woven prose. Fill
        // the rest from their own beats + 心下 so the dossier still compiles —
        // otherwise turning tracking on would silently stop producing dossiers,
        // which is the downstream dependency the switch had to sever.
        if (perspectives.length < 2) {
            const covered = new Set(perspectives.map((perspective) => perspective.characterId));
            const speakers = [...new Set(event.beats.map((beat) => beat.characterId))];
            for (const characterId of speakers) {
                if (covered.has(characterId) || !event.witnessIds.includes(characterId)) continue;
                const derived = perspectiveFromBeats(event, characterId, byId.get(characterId));
                if (derived) perspectives.push(derived);
            }
        }
        if (perspectives.length < 2) continue;

        const dossierEvent: DossierCanonicalEvent = {
            id: event.id,
            canonHead: event.id,
            saga: event.sagaId,
            day: event.day,
            scene: event.sceneName,
            title: `${event.sceneName}的一樁事`,
            kicker: '客觀逐拍只有一份；在場的人，各自帶走了不同的一份真相。',
            editorialSignals: event.editorialSignals,
            beats: event.beats.map((beat) => ({
                characterId: beat.characterId,
                name: beat.name,
                text: beat.text,
            })),
        };
        if (curator?.curateDossier) {
            perspectives = await curator.curateDossier(dossierEvent, perspectives);
        }
        const bundle = compileDossier({
            event: dossierEvent,
            perspectives,
        });
        const prose = [
            `# ${bundle.event.title}`,
            '',
            ...event.beats.map((beat) => `${beat.name}：${beat.text}`),
        ].join('\n');
        artifacts.push({
            eventId: event.id,
            filename: `${safeFilename(event.id)}.md`,
            bundle,
            content: embedDossierHeader(prose, bundle),
        });
    }
    return artifacts;
}

export async function writeTickDossiers(
    outDir: string,
    report: Pick<TickReport, 'events' | 'eventPovs'>,
    cast: DossierCastMember[],
    curator?: Pick<SceneAgentPort, 'curateDossier'>,
): Promise<TickDossierArtifact[]> {
    const artifacts = await compileTickDossiers(report, cast, curator);
    if (!artifacts.length) return artifacts;
    const dir = path.join(outDir, 'dossiers');
    fs.mkdirSync(dir, { recursive: true });
    for (const artifact of artifacts) {
        const target = path.join(dir, artifact.filename);
        const temp = `${target}.tmp`;
        fs.writeFileSync(temp, artifact.content, { encoding: 'utf8', mode: 0o600 });
        fs.renameSync(temp, target);
    }
    return artifacts;
}
