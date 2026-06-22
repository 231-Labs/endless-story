/**
 * SHARED CAST — the CANON 春雪社 founding troupe.
 *
 * Reads the SAME story preset the web 創世班底 panel + cli bootstrap consume
 * (packages/cli/scripts/stories/spring-snow.json → founding_cast), so the
 * experiments run on the real eight (沈雪笙 / 蘇映雪 / 柳生春 / 江聞鶴 / 連翹 /
 * 何阿喜 / 唐桂蘭 / 方競西) with their canon bios + secrets, not a hand-written
 * stand-in. Single source of truth: edit the json and every experiment follows.
 *
 * Ordering: 柳生春 then 蘇映雪 first. The canon's own contested resource is
 * `partnership:柳生春`, and 蘇映雪 is her 師姐, so index 0/1 aims each experiment's
 * stake (傾心 / 搭戲) at 柳生春 and keeps the 師姐妹 co-present in the lead scene.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { FoundingCharSpec } from '../types';

interface CanonMember extends FoundingCharSpec {
    secret?: string;
    disabled?: boolean;
}
interface CanonPreset {
    saga?: { name?: string; description?: string };
    scenes?: { name: string }[];
    founding_cast?: CanonMember[];
}

// Same dir lib/stories/loader.ts + cli bootstrap read from (cwd = packages/web).
const STORIES_DIR = path.resolve(process.cwd(), '..', 'cli', 'scripts', 'stories');
const CANON = JSON.parse(
    fs.readFileSync(path.join(STORIES_DIR, 'spring-snow.json'), 'utf-8'),
) as CanonPreset;

/**
 * secret is private canon; fold it into the bio (marked 心底) so a POV can act on
 * the deeper motive (蘇映雪 怕柳生春太紅、柳生春 怕師姐只看見台上的她…), not just the
 * public face. `FoundingCharSpec` itself has no secret field, so this is where it lands.
 */
function toSpec(c: CanonMember): FoundingCharSpec {
    const bio = c.secret ? `${c.description}\n（心底：${c.secret}）` : c.description;
    return {
        name: c.name,
        gender: c.gender,
        role: c.role,
        description: bio,
        ageYears: c.ageYears,
        minAttributes: c.minAttributes,
    };
}

const FRONT = ['柳生春', '蘇映雪'];
const raw = (CANON.founding_cast ?? []).filter((c) => !c.disabled);
const ordered: CanonMember[] = [
    ...FRONT.map((n) => raw.find((c) => c.name === n)).filter((c): c is CanonMember => !!c),
    ...raw.filter((c) => !FRONT.includes(c.name)),
];

export const SPRING_SNOW_CAST: FoundingCharSpec[] = ordered.map(toSpec);

/**
 * Saga premise + the two stage spaces the cast share. The canon has 11 locations;
 * the experiment needs the cast co-present to quorum an event, so use the戲台 + 後台.
 */
export const SPRING_SNOW_STORY = {
    saga: {
        name: CANON.saga?.name ?? '春雪社',
        description: CANON.saga?.description ?? '',
    },
    scenes: pickScenes(CANON.scenes ?? []),
};

function pickScenes(all: { name: string }[]): { name: string }[] {
    const want = ['雲錦台戲台', '後台妝閣'];
    const picked = want
        .map((w) => all.find((s) => s.name === w))
        .filter((s): s is { name: string } => !!s);
    return picked.length >= 2 ? picked : all.slice(0, 2);
}
