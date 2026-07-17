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

const LEGACY_DURABLE_MUTATION =
    /拿走|帶走|揣進|收進|抽出|取出|放進|塞進|藏起|打開|翻開|挑開|揭開|拆封|抽開|拉開|撕|燒|毀|署名|簽下|填上|寫入|塗掉|交給|遞給|移到|搬到|封口|按回|壓回|拽回|壓實|折死/;

function seasonObjectAliases(outDir: string): string[] {
    const framePath = path.join(outDir, 'season-frame.json');
    if (!fs.existsSync(framePath)) return [];
    try {
        const frame = JSON.parse(fs.readFileSync(framePath, 'utf8')) as {
            initialObjects?: Array<{ label?: string; aliases?: string[] }>;
        };
        return [...new Set((frame.initialObjects ?? []).flatMap((object) => [object.label, ...(object.aliases ?? [])])
            .filter((alias): alias is string => Boolean(alias)))]
            .sort((a, b) => b.length - a.length);
    } catch {
        return [];
    }
}

/** Old dossiers predate `objectChanges`, but their frozen canon facts remain
 * usable. Recover only strong mutation verbs attached to a registered season
 * object alias; generic cup/gesture prose never qualifies. */
function backfillLegacyObjectSignals(bundle: EpistemicDossierBundle, aliases: string[]): void {
    const signals = bundle.event.editorialSignals;
    if (!signals || signals.objectChanges !== undefined || aliases.length === 0) return;
    signals.objectChanges = bundle.event.canonFacts.filter(
        (fact) => LEGACY_DURABLE_MUTATION.test(fact) && aliases.some((alias) => fact.includes(alias)),
    ).length;
}

function readDossiers(outDir: string): EpistemicDossierBundle[] {
    const dir = path.join(outDir, 'dossiers');
    if (!fs.existsSync(dir)) return [];
    const bundles: EpistemicDossierBundle[] = [];
    const aliases = seasonObjectAliases(outDir);
    for (const filename of fs.readdirSync(dir).filter((name) => name.endsWith('.md')).sort()) {
        const parsed = parseDossierHeader(fs.readFileSync(path.join(dir, filename), 'utf8'));
        if (parsed.bundle) {
            backfillLegacyObjectSignals(parsed.bundle, aliases);
            bundles.push(parsed.bundle);
        }
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
 * `objectiveAudit` lines (e.g. economy/canon inconsistencies) VETO composition:
 * a season whose ledger contradicts its story must not publish prose.
 */
export async function refreshSeasonEditorial(
    outDir: string,
    compose?: AnthologyComposer,
    objectiveAudit: string[] = [],
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
    const auditPath = path.join(dir, 'objective-audit.json');
    atomicWrite(auditPath, `${JSON.stringify({ errors: objectiveAudit }, null, 2)}\n`);

    let anthologyWritten = false;
    const anthologyPath = path.join(dir, 'season-anthology.md');
    const needsAnthology = selectionChanged || !fs.existsSync(anthologyPath);
    if (compose && plan.publishable && needsAnthology && objectiveAudit.length === 0) {
        const prose = await compose(plan, bundles);
        atomicWrite(anthologyPath, `${prose.trim()}\n`);
        anthologyWritten = true;
    }
    return { plan, selectionChanged, anthologyWritten };
}
