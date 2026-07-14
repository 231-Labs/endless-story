/** Periodic season-editor artifact writer for the local engine runtime. */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseDossierHeader } from '@endless-story/runner/services/event-dossier/compile';
import { planSeasonAnthology, type SeasonAnthologyPlan } from '@endless-story/runner/services/storyteller-chapter/anthology';
import type { EpistemicDossierBundle } from '@endless-story/shared';

export interface SeasonEditorialArtifact {
    plan: SeasonAnthologyPlan;
    selectionChanged: boolean;
    anthologyWritten: boolean;
}

export type AnthologyComposer = (
    plan: SeasonAnthologyPlan,
    bundles: EpistemicDossierBundle[],
) => Promise<string>;

function readDossiers(outDir: string): EpistemicDossierBundle[] {
    const dir = path.join(outDir, 'dossiers');
    if (!fs.existsSync(dir)) return [];
    const bundles: EpistemicDossierBundle[] = [];
    for (const filename of fs.readdirSync(dir).filter((name) => name.endsWith('.md')).sort()) {
        const parsed = parseDossierHeader(fs.readFileSync(path.join(dir, filename), 'utf8'));
        if (parsed.bundle) bundles.push(parsed.bundle);
    }
    return bundles;
}

function selectedKey(plan: SeasonAnthologyPlan): string {
    return plan.selected.map((pick) => `${pick.eventId}:${pick.role}`).join('|');
}

function atomicWrite(target: string, content: string): void {
    const temp = `${target}.tmp`;
    fs.writeFileSync(temp, content, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(temp, target);
}

/**
 * Re-evaluates the season after every engine tick. Ranking is deterministic and
 * cheap; prose is regenerated only when a publishable selection actually changes.
 */
export async function refreshSeasonEditorial(
    outDir: string,
    compose?: AnthologyComposer,
): Promise<SeasonEditorialArtifact> {
    const bundles = readDossiers(outDir);
    const plan = planSeasonAnthology(bundles);
    const dir = path.join(outDir, 'editorial');
    const manifestPath = path.join(dir, 'season-selection.json');
    let previousKey = '';
    if (fs.existsSync(manifestPath)) {
        try {
            previousKey = selectedKey(JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as SeasonAnthologyPlan);
        } catch {
            previousKey = '';
        }
    }
    const selectionChanged = previousKey !== selectedKey(plan);
    fs.mkdirSync(dir, { recursive: true });
    atomicWrite(manifestPath, `${JSON.stringify(plan, null, 2)}\n`);

    let anthologyWritten = false;
    if (compose && plan.publishable && selectionChanged) {
        const prose = await compose(plan, bundles);
        atomicWrite(path.join(dir, 'season-anthology.md'), `${prose.trim()}\n`);
        anthologyWritten = true;
    }
    return { plan, selectionChanged, anthologyWritten };
}
