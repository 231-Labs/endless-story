/** Turn a completed physical-world tick into the exact dossier header consumed
 * by the product UI. This is a compiler only: it cannot add or rewrite events. */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
    compileDossier,
    embedDossierHeader,
} from '@endless-story/runner/services/event-dossier/compile';
import type { EpistemicDossierBundle } from '@endless-story/shared';
import type { TickReport } from './tick.ts';

export interface DossierCastMember {
    id: string;
    name: string;
    role?: string;
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

export function compileTickDossiers(
    report: Pick<TickReport, 'events' | 'eventPovs'>,
    cast: DossierCastMember[],
): TickDossierArtifact[] {
    const byId = new Map(cast.map((member) => [member.id, member]));
    return report.events.flatMap((event) => {
        // Private windows stay in the participants' sessions and never become a
        // public dossier merely because two witnesses were present.
        if (event.visibility !== 'public') return [];
        const perspectives = report.eventPovs
            .filter((pov) => pov.eventId === event.id && event.witnessIds.includes(pov.characterId))
            .map((pov) => ({
                characterId: pov.characterId,
                characterName: pov.name,
                role: byId.get(pov.characterId)?.role,
                body: pov.body,
            }));
        if (perspectives.length < 2) return [];

        const bundle = compileDossier({
            event: {
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
            },
            perspectives,
        });
        const prose = [
            `# ${bundle.event.title}`,
            '',
            ...event.beats.map((beat) => `${beat.name}：${beat.text}`),
        ].join('\n');
        return [{
            eventId: event.id,
            filename: `${safeFilename(event.id)}.md`,
            bundle,
            content: embedDossierHeader(prose, bundle),
        }];
    });
}

export function writeTickDossiers(
    outDir: string,
    report: Pick<TickReport, 'events' | 'eventPovs'>,
    cast: DossierCastMember[],
): TickDossierArtifact[] {
    const artifacts = compileTickDossiers(report, cast);
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
