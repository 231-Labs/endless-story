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
        if (perspectives.length < 2) continue;

        const dossierEvent: DossierCanonicalEvent = {
            id: event.id,
            canonHead: event.id,
            saga: event.sagaId,
            day: event.day,
            scene: event.sceneName,
            title: `${event.sceneName}的一樁事`,
            kicker: '客觀逐拍只有一份；在場的人，各自帶走了不同的一份真相。',
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
