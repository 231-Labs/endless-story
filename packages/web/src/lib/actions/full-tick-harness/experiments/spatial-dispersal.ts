/**
 * 世界時空底層 · 住處 + 睡眠排程 + 拉力路由 → 分散與獨處「湧現」
 *
 * DETERMINISTIC (no LLM, no chain). Reuses the REAL state.ts sleep/fatigue primitives
 * (characterWorker.shouldSleep / evolveState / driftState) and adds the ONE mechanism
 * UNDER TEST: a generic per-character scene-routing rule —
 *   destination = argmax pull over { 住處←fatigue+夜, 某人←pursuit×合宜度, 工作場←daytime }
 * plus PERSISTENT SLEEP (asleep through the night, wake at dawn).
 *
 * NO hard "door gate". Privacy is NOT enforced by a wall that turns people away — that
 * would be a hardcoded external rule. Instead a character simply never CHOOSES to intrude:
 * approaching a private home is weighted by 「合宜度」= your bond with that home's owner
 * (public places = fully approachable; a stranger's home at night = near-zero pull). So a
 * normal person, tired at night, is pulled to their OWN home; only a strong bond makes
 * visiting someone's home the stronger pull. Privacy holds because nobody wants to intrude,
 * not because they're barred. Only per-character weights (disposition) are config.
 *
 * Hypothesis (what "先做解耦測試" must show before touching the runner):
 *   1. 夜深時公共場自己淨空 —— 睏了的人各自回住處睡整夜。
 *   2. 有羈絆的一對（柳追蘇）在一處住所裡「單獨」相處 —— 獨處是湧現、不是清場。
 *   3. 沒羈絆的追求者（金鳳／白韻秋）夜深自己回家、不去打擾 —— 出於自律，非被擋。
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json <node23> <tsx/cli.mjs> \
 *     src/lib/actions/full-tick-harness/experiments/spatial-dispersal.ts
 */

import { characterWorker } from '@endless-story/runner';

type CState = characterWorker.CharacterState;

const PARTS = ['清晨', '日午', '晡時', '黃昏', '入夜', '夜半', '深宵'] as const;
const PER_DAY = PARTS.length;
const DAYS = 2;
const isNightPart = (t: number): boolean => t >= 4;
const isDawn = (t: number): boolean => t === 0;

// ── mechanism constants (generic knobs, NOT domain rules) ──
const HOME_W = 1.0; // 回家拉力 = fatigue × HOME_W（越累越想回家）
const BOND_W = 1.0; // 追人拉力 = pursue × BOND_W × 合宜度
const WORK_W = 0.75; // 工作場拉力（僅白天）
const NIGHT_HOME_BIAS = 0.2; // 夜深本就想歸家（人人如此）

interface Scene {
    id: string;
    kind: 'public' | 'home';
    owner?: string;
}
const SCENES: Scene[] = [
    { id: '後台', kind: 'public' },
    { id: '戲台', kind: 'public' },
    { id: '霞飛路', kind: 'public' },
    { id: '蘇廂房', kind: 'home', owner: '蘇映雪' },
    { id: '柳屋', kind: 'home', owner: '柳生春' },
    { id: '金鳳歌廳', kind: 'home', owner: '金鳳' },
    { id: '白洋房', kind: 'home', owner: '白韻秋' },
    { id: '田帳房', kind: 'home', owner: '田巧雲' },
];
const sceneById = (id: string): Scene => SCENES.find((s) => s.id === id)!;

interface Char {
    name: string;
    home: string;
    scene: string;
    state: CState;
    scattered: number;
    asleep: boolean;
    work?: string; // 白天工作場（累的來源）；沒有＝不坐班
    pursue?: { name: string; w: number }; // 對某人的拉力
    bond: Record<string, number>; // 對他人的羈絆（決定進其私宅的「合宜度」）
}

function makeWorld(): Char[] {
    const S = (): CState => ({ ...characterWorker.NEUTRAL_STATE });
    // pursue = 想接近誰(disposition)：蘇卑微少追(0.3)、柳主動追蘇(0.95)、金鳳追柳(0.85)、白追柳(0.7)、田低。
    // bond = 屋主「歡迎誰進自己私宅」(有向)：蘇只迎柳、柳只迎蘇 → 只有柳蘇能在私宅獨處；
    //        白/金鳳雖追柳，柳不迎她們進屋、蘇更不迎 → 她們夜裡只能各回各家。
    return [
        { name: '蘇映雪', home: '蘇廂房', scene: '後台', state: S(), scattered: 0, asleep: false, work: '後台', pursue: { name: '柳生春', w: 0.3 }, bond: { 柳生春: 0.9 } },
        { name: '柳生春', home: '柳屋', scene: '後台', state: S(), scattered: 0, asleep: false, work: '後台', pursue: { name: '蘇映雪', w: 0.95 }, bond: { 蘇映雪: 0.9 } },
        { name: '金鳳', home: '金鳳歌廳', scene: '後台', state: S(), scattered: 0, asleep: false, work: '霞飛路', pursue: { name: '柳生春', w: 0.85 }, bond: { 柳生春: 0.4, 蘇映雪: 0.1 } },
        { name: '白韻秋', home: '白洋房', scene: '霞飛路', state: S(), scattered: 0, asleep: false, pursue: { name: '柳生春', w: 0.7 }, bond: { 柳生春: 0.5, 蘇映雪: 0.05 } },
        { name: '田巧雲', home: '田帳房', scene: '後台', state: S(), scattered: 0, asleep: false, work: '後台', pursue: { name: '柳生春', w: 0.2 }, bond: { 柳生春: 0.5, 蘇映雪: 0.5 } },
    ];
}

const whereIs = (world: Char[], name: string): string | undefined => world.find((c) => c.name === name)?.scene;
const occupants = (world: Char[], sceneId: string): string[] => world.filter((c) => c.scene === sceneId).map((c) => c.name);

/** 合宜度：往公共場 = 1；往某人的私宅 = 屋主對你的接納（自宅 = 1）。不是牆，是「人家歡不歡迎你上門」。
 *  有向：用屋主→訪客的羈絆。你只上你被歡迎的門；夜裡沒人請的人，自己就各回各家。 */
function propriety(c: Char, targetScene: string, world: Char[]): number {
    const s = sceneById(targetScene);
    if (s.kind === 'public') return 1;
    if (s.owner === c.name) return 1;
    const host = world.find((x) => x.name === s.owner);
    return host?.bond[c.name] ?? 0;
}

/** THE MECHANISM: pick a destination by strongest pull. No gate — 合宜度 is folded into the pull. */
function destination(c: Char, world: Char[], night: boolean): { scene: string; declinedFrom?: string } {
    const cands: { scene: string; w: number }[] = [{ scene: c.home, w: c.state.fatigue * HOME_W + (night ? NIGHT_HOME_BIAS : 0) }];
    if (c.pursue) {
        const tScene = whereIs(world, c.pursue.name);
        if (tScene) cands.push({ scene: tScene, w: c.pursue.w * BOND_W * propriety(c, tScene, world) });
    }
    if (c.work && !night) cands.push({ scene: c.work, w: WORK_W });
    cands.sort((a, b) => b.w - a.w);
    const chosen = cands[0].scene;
    // emergent social note: my person is in a private space I don't belong to, and I chose home instead
    let declinedFrom: string | undefined;
    if (c.pursue) {
        const tScene = whereIs(world, c.pursue.name);
        if (tScene && tScene !== c.home && chosen === c.home) {
            const s = sceneById(tScene);
            if (s.kind === 'home' && s.owner !== c.name) declinedFrom = tScene;
        }
    }
    return { scene: chosen, declinedFrom };
}

function main(): void {
    const world = makeWorld();
    const privatePairs: string[] = [];
    const declinedVisits: string[] = [];
    const lastNightPublic: number[] = [];

    console.log(
        `世界時空 sim · ${DAYS} 日 × ${PER_DAY} 時辰 · 住處${SCENES.filter((s) => s.kind === 'home').length} 公共${SCENES.filter((s) => s.kind === 'public').length} · ` +
            `合宜度=與屋主羈絆（無門禁牆） · 夜眠閾 ${characterWorker.NIGHT_SLEEP_FATIGUE} · 睡整夜\n`,
    );

    for (let tick = 0; tick < DAYS * PER_DAY; tick++) {
        const t = tick % PER_DAY;
        const day = Math.floor(tick / PER_DAY) + 1;
        const night = isNightPart(t);

        if (isDawn(t)) world.forEach((c) => (c.asleep = false)); // 天亮：醒

        // 1. 路由（睡著不動；醒的人同步從快照決定，再套用）
        const routed = world.map((c) => (c.asleep ? { scene: c.scene } : destination(c, world, night)));
        routed.forEach((r, i) => {
            if (night && r.declinedFrom) declinedVisits.push(`第${day}日${PARTS[t]} · ${world[i].name} 夜深自己回了家（沒去打擾「${r.declinedFrom}」）`);
            world[i].scene = r.scene;
        });

        // 2. 狀態：drift；白天在公共場＝工作 → 累 + 零散記憶（睡著不算）
        world.forEach((c) => {
            if (c.asleep) return;
            c.state = characterWorker.driftState(c.state);
            if (c.work && !night && sceneById(c.scene).kind === 'public') {
                c.state = characterWorker.evolveState(c.state, { fatigue: characterWorker.WORK_FATIGUE });
                c.scattered += 1;
            }
        });

        // 3. 睡眠：人在住處 ＋ 該睡 → 睡整夜（回血、壓縮零散、asleep）
        world.forEach((c) => {
            if (c.asleep) return;
            if (sceneById(c.scene).kind === 'home' && characterWorker.shouldSleep({ fatigue: c.state.fatigue, isNight: night, scatteredCount: c.scattered })) {
                c.state = characterWorker.evolveState(c.state, { fatigue: -characterWorker.SLEEP_RECOVERY });
                c.scattered = 0;
                c.asleep = true;
            }
        });

        // 4. 打印
        const line = SCENES.filter((s) => occupants(world, s.id).length > 0)
            .map((s) => {
                const who = occupants(world, s.id)
                    .map((n) => (world.find((c) => c.name === n)!.asleep ? `${n}💤` : n))
                    .join('、');
                return `${s.kind === 'home' ? '🏠' : '🎭'}${s.id}[${who}]`;
            })
            .join('  ');
        console.log(`  第${day}日 ${PARTS[t]}${night ? '·夜' : '　　'}  ${line}`);

        // 5. 記錄
        if (night) {
            for (const s of SCENES.filter((s) => s.kind === 'home')) {
                const occ = occupants(world, s.id);
                if (occ.length === 2) privatePairs.push(`第${day}日${PARTS[t]} · ${s.id} = ${occ.join(' ＋ ')}`);
            }
            if (t === PER_DAY - 1) lastNightPublic.push(SCENES.filter((s) => s.kind === 'public').reduce((n, s) => n + occupants(world, s.id).length, 0));
        }
    }

    // ── 結論 ──
    console.log(`\n${'═'.repeat(72)}`);
    const maxLastNight = Math.max(...lastNightPublic);
    console.log(`① 夜深淨空：每日「深宵」公共場人數 = [${lastNightPublic.join(', ')}]  → ${maxLastNight === 0 ? '全 0，分散成立' : '仍有人'}`);
    console.log(`② 獨處湧現（住所裡剛好二人）：`);
    if (privatePairs.length === 0) console.log('     （無 —— 需調拉力）');
    else [...new Set(privatePairs)].forEach((p) => console.log(`     ${p}`));
    console.log(`③ 自律不打擾（非被擋、是自己選擇回家）：`);
    if (declinedVisits.length === 0) console.log('     （無）');
    else [...new Set(declinedVisits)].forEach((b) => console.log(`     ${b}`));

    const liuSuAlone = privatePairs.some((p) => p.includes('蘇廂房') && p.includes('柳生春') && p.includes('蘇映雪'));
    const selfRestraint = declinedVisits.some((b) => b.includes('金鳳') || b.includes('白韻秋'));
    console.log(
        `\n判定：① 夜深分散 ${maxLastNight === 0 ? '✅' : '⚠️'} · ② 柳蘇獨處湧現 ${liuSuAlone ? '✅' : '❌'} · ③ 自律不打擾 ${selfRestraint ? '✅' : '⚠️'}`,
    );
    console.log('\n看：沒有任何「門禁」把人擋在外。金鳳/白追柳、可柳進了蘇的私宅，她們與蘇不夠親、上門不合宜，');
    console.log('    自己的拉力就導回了各自的家 → 柳蘇獨處是眾人「自己選擇離開」的結果，不是被誰清場或擋下。');
}

main();

export {};
