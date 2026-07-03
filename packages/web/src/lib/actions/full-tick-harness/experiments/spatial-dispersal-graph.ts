/**
 * 世界時空底層 v2 · 貼齊 runner 資料模型的解耦測試（仍無鏈、無 LLM）
 *
 * §2.50 的抽象 sim 用手寫 bond map + toy kind 證了路由。這一版把三塊換成 runner 真的會用的：
 *   1. 合宜度（屋主迎不迎你） = **真關係圖**：`aggregateDecayedOutgoing`（relationship-evolve.ts
 *      的純函式，帶時間冷卻）讀屋主的有向 tone 邊；暖 tone（romance/affection/mentorship）＝迎，
 *      冷 tone（rivalry/wary/tension/estrangement）或無邊 ＝ 不迎。不是手寫 bond。
 *   2. 場景公共/私宅 = 鏈上原生 **`privacy_level: 0..5`**（≥3 視為私宅），非 toy kind。
 *   3. 「這是誰的家」 = 角色的 **`homeSceneId`**（要加進 runner 的欄位）；不經 chamber、不上鏈所有權。
 * 睡眠/fatigue 照舊重用 `state.ts`。仍 DETERMINISTIC、standalone。過了＝概念用真機制也成立，可動 tick-loop。
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json <node23> <tsx/cli.mjs> \
 *     src/lib/actions/full-tick-harness/experiments/spatial-dispersal-graph.ts
 */

import { characterWorker } from '@endless-story/runner';
import { aggregateDecayedOutgoing, toneZh } from '../relationship-evolve';
import type { RelEventLite } from '../relationship-evolve';
import type { RelationshipTone } from '@endless-story/shared';

type CState = characterWorker.CharacterState;

const PARTS = ['清晨', '日午', '晡時', '黃昏', '入夜', '夜半', '深宵'] as const;
const PER_DAY = PARTS.length;
const DAYS = 2;
const isNightPart = (t: number): boolean => t >= 4;
const isDawn = (t: number): boolean => t === 0;

// ── mechanism constants ──
const PRIVATE_THRESHOLD = 3; // privacy_level ≥ 3 ⇒ 私宅（0..5，鏈上原生）
const HOME_W = 1.0;
const BOND_W = 1.0;
const WORK_W = 0.75;
const NIGHT_HOME_BIAS = 0.2;
const WELCOMING: Set<RelationshipTone> = new Set(['romance', 'affection', 'mentorship']); // 暖 tone ＝ 肯迎進門

interface Scene {
    id: string;
    name: string;
    privacyLevel: number; // 鏈上 SceneAccess.privacy_level（0 public … 5 fully private）
}
const SCENES: Scene[] = [
    { id: 'sc_backstage', name: '後台', privacyLevel: 0 },
    { id: 'sc_stage', name: '戲台', privacyLevel: 0 },
    { id: 'sc_road', name: '霞飛路', privacyLevel: 1 },
    { id: 'sc_su_room', name: '蘇廂房', privacyLevel: 5 },
    { id: 'sc_liu_room', name: '柳屋', privacyLevel: 5 },
    { id: 'sc_jin_hall', name: '金鳳歌廳', privacyLevel: 4 },
    { id: 'sc_bai_house', name: '白洋房', privacyLevel: 5 },
    { id: 'sc_tian_office', name: '田帳房', privacyLevel: 4 },
];
const sceneById = (id: string): Scene => SCENES.find((s) => s.id === id)!;
const isPrivate = (s: Scene): boolean => s.privacyLevel >= PRIVATE_THRESHOLD;

interface Char {
    id: string;
    name: string;
    homeSceneId: string; // ← runner 要加的欄位（角色→住處），不經 chamber
    sceneId: string;
    state: CState;
    scattered: number;
    asleep: boolean;
    work?: string; // 白天工作場 id
    pursue?: { id: string; w: number };
}

function makeWorld(): Char[] {
    const S = (): CState => ({ ...characterWorker.NEUTRAL_STATE });
    return [
        { id: 'su', name: '蘇映雪', homeSceneId: 'sc_su_room', sceneId: 'sc_backstage', state: S(), scattered: 0, asleep: false, work: 'sc_backstage', pursue: { id: 'liu', w: 0.3 } },
        { id: 'liu', name: '柳生春', homeSceneId: 'sc_liu_room', sceneId: 'sc_backstage', state: S(), scattered: 0, asleep: false, work: 'sc_backstage', pursue: { id: 'su', w: 0.95 } },
        { id: 'jin', name: '金鳳', homeSceneId: 'sc_jin_hall', sceneId: 'sc_backstage', state: S(), scattered: 0, asleep: false, work: 'sc_road', pursue: { id: 'liu', w: 0.85 } },
        { id: 'bai', name: '白韻秋', homeSceneId: 'sc_bai_house', sceneId: 'sc_road', state: S(), scattered: 0, asleep: false, pursue: { id: 'liu', w: 0.7 } },
        { id: 'tian', name: '田巧雲', homeSceneId: 'sc_tian_office', sceneId: 'sc_backstage', state: S(), scattered: 0, asleep: false, work: 'sc_backstage', pursue: { id: 'liu', w: 0.2 } },
    ];
}

// 既有的關係圖（有向 tone 邊，當作 established；讀在 tick 0 的暖度）。這就是 runner 關係圖的資料。
const REL: RelEventLite[] = [
    { characterA: 'su', characterB: 'liu', tone: 'romance', tick: 0 }, // 蘇→柳 戀慕（×2 加重）
    { characterA: 'su', characterB: 'liu', tone: 'romance', tick: 0 },
    { characterA: 'liu', characterB: 'su', tone: 'romance', tick: 0 }, // 柳→蘇 戀慕（×2）
    { characterA: 'liu', characterB: 'su', tone: 'romance', tick: 0 },
    { characterA: 'liu', characterB: 'jin', tone: 'estrangement', tick: 0 }, // 柳→金鳳 隔閡（冷了）
    { characterA: 'jin', characterB: 'liu', tone: 'romance', tick: 0 }, // 金鳳→柳 仍戀慕
    { characterA: 'bai', characterB: 'liu', tone: 'romance', tick: 0 }, // 白→柳 戀慕（柳對白無邊）
    { characterA: 'tian', characterB: 'liu', tone: 'affection', tick: 0 }, // 田→柳 親近
    { characterA: 'tian', characterB: 'su', tone: 'affection', tick: 0 }, // 田→蘇 親近
];

/** 屋主迎不迎訪客 = 讀真關係圖：屋主對訪客的暖 tone 有向邊（有＝其強度、冷/無＝0）。 */
function welcome(hostId: string, visitorId: string): { w: number; tone?: RelationshipTone } {
    const edges = aggregateDecayedOutgoing(REL, hostId, 0);
    const e = edges.find((x) => x.toId === visitorId);
    if (!e || !WELCOMING.has(e.tone)) return { w: 0, tone: e?.tone };
    return { w: Math.min(1, e.weight), tone: e.tone };
}

const whereIs = (world: Char[], id: string): string | undefined => world.find((c) => c.id === id)?.sceneId;
const occupants = (world: Char[], sceneId: string): Char[] => world.filter((c) => c.sceneId === sceneId);

/** 合宜度：公共=1；自宅=1；別人私宅=屋主對你的暖邊（讀關係圖）。不是牆。 */
function scenePropriety(c: Char, targetSceneId: string, world: Char[]): number {
    const s = sceneById(targetSceneId);
    if (!isPrivate(s)) return 1;
    if (targetSceneId === c.homeSceneId) return 1;
    const host = world.find((x) => x.homeSceneId === targetSceneId);
    if (!host) return 0; // 無主私宅
    return welcome(host.id, c.id).w;
}

function destination(c: Char, world: Char[], night: boolean): { sceneId: string; declinedFrom?: string } {
    const cands: { sceneId: string; w: number }[] = [{ sceneId: c.homeSceneId, w: c.state.fatigue * HOME_W + (night ? NIGHT_HOME_BIAS : 0) }];
    if (c.pursue) {
        const tScene = whereIs(world, c.pursue.id);
        if (tScene) cands.push({ sceneId: tScene, w: c.pursue.w * BOND_W * scenePropriety(c, tScene, world) });
    }
    if (c.work && !night) cands.push({ sceneId: c.work, w: WORK_W });
    cands.sort((a, b) => b.w - a.w);
    const chosen = cands[0].sceneId;
    let declinedFrom: string | undefined;
    if (c.pursue) {
        const tScene = whereIs(world, c.pursue.id);
        if (tScene && tScene !== c.homeSceneId && chosen === c.homeSceneId && isPrivate(sceneById(tScene))) declinedFrom = tScene;
    }
    return { sceneId: chosen, declinedFrom };
}

function main(): void {
    const world = makeWorld();
    const privatePairs: string[] = [];
    const declinedVisits: string[] = [];
    const lastNightPublic: number[] = [];

    console.log(`世界時空 sim v2（真關係圖 + privacy_level + homeSceneId） · ${DAYS} 日 × ${PER_DAY} 時辰\n`);
    // 印出從真關係圖推出的「誰迎誰進私宅」
    console.log('屋主迎誰進私宅（讀真關係圖的暖邊）：');
    for (const host of world) {
        const welcomed = world
            .filter((v) => v.id !== host.id)
            .map((v) => ({ v, ...welcome(host.id, v.id) }))
            .filter((x) => x.w > 0);
        const txt = welcomed.length ? welcomed.map((x) => `${x.v.name}（${toneZh(x.tone!)}${x.w.toFixed(1)}）`).join('、') : '（誰都不特意迎）';
        console.log(`  ${host.name} 迎：${txt}`);
    }
    console.log('');

    for (let tick = 0; tick < DAYS * PER_DAY; tick++) {
        const t = tick % PER_DAY;
        const day = Math.floor(tick / PER_DAY) + 1;
        const night = isNightPart(t);
        if (isDawn(t)) world.forEach((c) => (c.asleep = false));

        const routed = world.map((c) => (c.asleep ? { sceneId: c.sceneId } : destination(c, world, night)));
        routed.forEach((r, i) => {
            if (night && r.declinedFrom) declinedVisits.push(`第${day}日${PARTS[t]} · ${world[i].name} 夜深自己回了家（沒去打擾「${sceneById(r.declinedFrom).name}」）`);
            world[i].sceneId = r.sceneId;
        });

        world.forEach((c) => {
            if (c.asleep) return;
            c.state = characterWorker.driftState(c.state);
            if (c.work && !night && !isPrivate(sceneById(c.sceneId))) {
                c.state = characterWorker.evolveState(c.state, { fatigue: characterWorker.WORK_FATIGUE });
                c.scattered += 1;
            }
        });

        world.forEach((c) => {
            if (c.asleep) return;
            if (isPrivate(sceneById(c.sceneId)) && characterWorker.shouldSleep({ fatigue: c.state.fatigue, isNight: night, scatteredCount: c.scattered })) {
                c.state = characterWorker.evolveState(c.state, { fatigue: -characterWorker.SLEEP_RECOVERY });
                c.scattered = 0;
                c.asleep = true;
            }
        });

        const line = SCENES.filter((s) => occupants(world, s.id).length > 0)
            .map((s) => {
                const who = occupants(world, s.id).map((c) => (c.asleep ? `${c.name}💤` : c.name)).join('、');
                return `${isPrivate(s) ? '🏠' : '🎭'}${s.name}[${who}]`;
            })
            .join('  ');
        console.log(`  第${day}日 ${PARTS[t]}${night ? '·夜' : '　　'}  ${line}`);

        if (night) {
            for (const s of SCENES.filter((s) => isPrivate(s))) {
                const occ = occupants(world, s.id);
                if (occ.length === 2) privatePairs.push(`第${day}日${PARTS[t]} · ${s.name} = ${occ.map((c) => c.name).join(' ＋ ')}`);
            }
            if (t === PER_DAY - 1) lastNightPublic.push(SCENES.filter((s) => !isPrivate(s)).reduce((n, s) => n + occupants(world, s.id).length, 0));
        }
    }

    console.log(`\n${'═'.repeat(72)}`);
    const maxLastNight = Math.max(...lastNightPublic);
    console.log(`① 夜深淨空：每日「深宵」公共場人數 = [${lastNightPublic.join(', ')}]  → ${maxLastNight === 0 ? '全 0，分散成立' : '仍有人'}`);
    console.log(`② 獨處湧現（私宅裡剛好二人）：`);
    if (privatePairs.length === 0) console.log('     （無）');
    else [...new Set(privatePairs)].forEach((p) => console.log(`     ${p}`));
    console.log(`③ 自律不打擾（讀關係圖：不被屋主迎的人自己回家）：`);
    if (declinedVisits.length === 0) console.log('     （無）');
    else [...new Set(declinedVisits)].forEach((b) => console.log(`     ${b}`));

    const liuSuAlone = privatePairs.some((p) => p.includes('蘇廂房') && p.includes('柳生春') && p.includes('蘇映雪'));
    const selfRestraint = declinedVisits.some((b) => b.includes('金鳳') || b.includes('白韻秋'));
    console.log(`\n判定：① 夜深分散 ${maxLastNight === 0 ? '✅' : '⚠️'} · ② 柳蘇獨處湧現 ${liuSuAlone ? '✅' : '❌'} · ③ 自律不打擾 ${selfRestraint ? '✅' : '⚠️'}`);
    console.log('\n看：合宜度不再是手寫 bond，而是讀真關係圖 —— 蘇對柳有戀慕暖邊 → 迎柳進蘇廂房；柳對白/金鳳無暖邊 →');
    console.log('    她們追柳卻進不了柳/蘇的私宅，自己夜深回家。privacy_level 決定公共/私宅、homeSceneId 決定各回哪。');
}

main();

export {};
