/**
 * A/B experiment — LIVING WANT rewrite (decoupled, out of the package barrel).
 *
 * Hypothesis: the current want model is "dead" — `{desc, weight, sat, resistance}`
 * with `desc` frozen at spawn — which drives verbatim beat repetition, zero
 * self-driven escalation, and reliance on external judges. Arm B makes the want's
 * TEXT alive: after each scene closes, each participant rewrites their own want
 * ledger in their own words, citing what actually happened. Numbers stay
 * engine-owned; meaning becomes character-owned.
 *
 * Both arms share: identical cast, identical genesis wants (deep-copied), the
 * same public scene over 4 ticks, the same memory channel (last-4 own beats). The
 * ONLY difference is Arm B's post-scene rewrite call.
 *
 * Run (from packages/engine):
 *   POE_API_KEY=… AI_PROVIDER=poe ./node_modules/.bin/tsx experiments/rewrite-ab.ts
 *
 * All counters are computed mechanically in code — no LLM judging of the output.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { text as llmText } from '@endless-story/llm';
import { runSceneLoop, type SceneAgent, type SceneBeat, type SceneLoopCastMember } from '../src/core/scene-loop.ts';
import { newWant, type Want } from '../src/core/want-core.ts';
import { RunnerSceneAgent } from '../src/adapters/runner-scene-agent.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Retry helper — 4 attempts, increasing backoff. Transient ETIMEDOUT is a known
// gotcha; every LLM call in this script goes through here.
// ─────────────────────────────────────────────────────────────────────────────
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 4; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastErr = err;
            const wait = 800 * (attempt + 1) * (attempt + 1); // 0.8s, 3.2s, 7.2s, 12.8s
            console.warn(`[retry] ${label} attempt ${attempt + 1} failed: ${err instanceof Error ? err.message : err}; waiting ${wait}ms`);
            if (attempt < 3) await sleep(wait);
        }
    }
    throw lastErr;
}

// ─────────────────────────────────────────────────────────────────────────────
// Setup — cast of 4 from spring-snow.json (real persona/secret/first-3 memories).
// ─────────────────────────────────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORY_PATH = path.resolve(__dirname, '../../cli/scripts/stories/spring-snow.json');
const story = JSON.parse(fs.readFileSync(STORY_PATH, 'utf8'));

const CAST_NAMES = ['蘇映雪', '柳生春', '連翹', '江聞鶴'];
type Persona = {
    name: string;
    role: string;
    gender?: string;
    ageYears?: number;
    description: string;
    secret?: string;
    memories: string[];
};
const personas: Record<string, Persona> = {};
for (const n of CAST_NAMES) {
    const c = story.founding_cast.find((x: any) => x.name === n);
    if (!c) throw new Error(`cast member not found in spring-snow.json: ${n}`);
    personas[n] = {
        name: c.name,
        role: c.role,
        gender: c.gender,
        ageYears: c.ageYears,
        description: c.description,
        secret: c.secret,
        memories: (c.memories ?? []).slice(0, 3),
    };
}
const SAGA_PREMISE: string = story.saga?.description ?? '';

// Canon ties (the actor's OWN feeling toward each co-present, keyed by id).
// Identical in both arms.
const TIES: Record<string, Record<string, string>> = {
    蘇映雪: {
        柳生春: '你對TA：師妹（同台八年的生旦搭檔，情根深種卻始終收著手）',
        連翹: '你對TA：新來的刀馬旦',
        江聞鶴: '你對TA：外班北上的小生',
    },
    柳生春: {
        蘇映雪: '你對TA：師姐（你在她跟前一向聽話）',
        連翹: '你對TA：新來的班中同人',
        江聞鶴: '你對TA：同工小生行、台上較勁的對手',
    },
    連翹: {
        蘇映雪: '你對TA：班中台柱花旦',
        柳生春: '你對TA：當紅小生',
        江聞鶴: '你對TA：外班北上的小生',
    },
    江聞鶴: {
        蘇映雪: '你對TA：班中台柱花旦',
        柳生春: '你對TA：台上較勁的對手小生',
        連翹: '你對TA：新來的刀馬旦',
    },
};

const ETIQUETTE =
    '蘇映雪為師姐、柳生春為師妹，二人同台八年的生旦搭檔。柳生春為坤生（女兒身扮小生），是女子，稱「她」不稱「他」。';
const TONE = '春雪社的班底，紅幔油彩胡琴帳本裡過日子，台前一聲彩、台後往往已有十樁心事。';
const STAKE = '今日雲錦台有堂會的客與報館的人在座，台上台下都有眼睛。';
const CLOCKS = ['清晨', '日午', '晡時', '黃昏'];
const SCENE_ID = 'scene-yunjin';
const SCENE_NAME = '雲錦台戲台';
const MAX_TURNS = 4;

// Base cast (memories filled per tick).
function baseCast(): SceneLoopCastMember[] {
    return CAST_NAMES.map((n) => {
        const p = personas[n];
        return {
            characterId: n,
            name: n,
            persona: p.description,
            innerSecret: p.secret,
            role: p.role,
            ties: TIES[n],
        };
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Real-LLM scene agent (reuse the RunnerSceneAgent adapter), wrapped in retry.
// ─────────────────────────────────────────────────────────────────────────────
const rsa = new RunnerSceneAgent();
const agent: SceneAgent = {
    actBeat: (i) => withRetry('actBeat', () => rsa.actBeat(i)),
    judgeWantResolved: (i) => withRetry('judgeWantResolved', () => rsa.judgeWantResolved(i)),
};

// ─────────────────────────────────────────────────────────────────────────────
// Genesis wants — derive once per character (with secret), cap 3 each, then reuse
// the exact same set for both arms via deep copy.
// ─────────────────────────────────────────────────────────────────────────────
async function deriveInitialWants(): Promise<Want[]> {
    const wants: Want[] = [];
    for (const n of CAST_NAMES) {
        const p = personas[n];
        let genesis = await withRetry(`genesis:${n}`, () =>
            rsa.deriveGenesisWants({
                name: p.name,
                role: p.role,
                gender: p.gender,
                ageYears: p.ageYears,
                description: p.description,
                secret: p.secret,
                sagaPremise: SAGA_PREMISE,
                castNames: CAST_NAMES,
            }),
        );
        if (genesis.length === 0) {
            // one extra shot — a character with no wants would just idle
            genesis = await withRetry(`genesis-retry:${n}`, () =>
                rsa.deriveGenesisWants({
                    name: p.name,
                    role: p.role,
                    gender: p.gender,
                    ageYears: p.ageYears,
                    description: p.description,
                    secret: p.secret,
                    sagaPremise: SAGA_PREMISE,
                    castNames: CAST_NAMES,
                }),
            );
        }
        for (const g of genesis.slice(0, 3)) {
            wants.push(
                newWant({
                    characterId: n,
                    layer: g.layer,
                    desc: g.desc,
                    target: g.target,
                    weight: g.weight,
                    sat: g.sat,
                    resistance: g.resistance,
                    kind: 'narrative',
                    source: 'genesis',
                    bornTick: 0,
                }),
            );
        }
        console.log(`[genesis] ${n}: ${genesis.slice(0, 3).map((g) => g.desc).join(' / ')}`);
    }
    return wants;
}

// ─────────────────────────────────────────────────────────────────────────────
// Arm B — living-want rewrite. After each scene closes, one LLM call per
// participant. The prompt asks ONLY "這場之後這件事在你心裡變成了什麼樣" — it
// never suggests escalation, confession, or any specific content.
// ─────────────────────────────────────────────────────────────────────────────
interface RewriteDecision {
    id: string;
    action: 'keep' | 'mutate' | 'close';
    newDesc?: string;
    note?: string;
}
interface RewriteSpawn {
    desc: string;
    layer?: string;
}
interface RewriteReply {
    decisions: RewriteDecision[];
    spawn?: RewriteSpawn;
}

function rewriteSystemPrompt(): string {
    return [
        '你是一個戲園角色「心裡那本帳」的記帳人。給你這個人剛剛演過的一場戲（逐字），',
        '和 TA 此刻心裡掛著的幾件事（wants）。你要替 TA 判斷：**這場戲之後，每一件事在 TA 心裡',
        '變成了什麼樣子**。',
        '',
        '**鐵則**：',
        '1. 你只描述「這件事此刻在心裡是什麼樣」，**不寫計畫、不寫下一步要怎麼做**。',
        '   寫心裡掛著的事，不是待辦。',
        '2. 每件事給一個 action：',
        '   - "keep"：這場之後這件事在心裡沒什麼變化，照舊掛著。',
        '   - "mutate"：這場之後同一件事在心裡的樣子變了（更緊、更淡、換了個說法、被某個瞬間改寫），',
        '     用 `newDesc` 寫新的樣子（≤30字，第一人稱，**必須引用這場實際發生的事**）。',
        '   - "close"：**只有這事在你心裡真放下了**才用（不是做完計畫，是心裡那個結真鬆了）。',
        '3. 你可以 `spawn` **至多一條**這場戲新勾起的心事（同樣 ≤30字、第一人稱、引用這場的事）。',
        '4. **額度**：你心裡同時掛著的事至多 4 件。若已滿 4 件還要 spawn，必須在這次回覆裡 close 掉一件。',
        '5. 不要替 TA 安排劇情，不要暗示告白、攤牌、或任何具體橋段。只誠實記錄心裡的變化。',
        '',
        '**輸出**：嚴格只輸出 JSON：',
        '{"decisions":[{"id":"…","action":"keep|mutate|close","newDesc":"…","note":"一句：為什麼"}],',
        ' "spawn":{"desc":"…","layer":"…"}}',
        '（沒有要 spawn 就省略 spawn 欄。newDesc 只在 mutate 時給。）不要 markdown、不要多餘文字。',
    ].join('\n');
}

function extractJson(raw: string): Record<string, unknown> | null {
    const blocks = raw.match(/\{[\s\S]*\}/g);
    if (!blocks?.length) return null;
    for (let i = blocks.length - 1; i >= 0; i--) {
        try {
            return JSON.parse(blocks[i]) as Record<string, unknown>;
        } catch {
            /* earlier block */
        }
    }
    return null;
}

async function rewriteLedger(
    persona: Persona,
    liveWants: Want[],
    sceneBeats: SceneBeat[],
): Promise<RewriteReply> {
    const wantList = liveWants.map((w) => `- id=${w.id}｜[${w.layer}]｜${w.desc}`).join('\n');
    const beatText = sceneBeats.map((b) => `${b.name}：${b.text}`).join('\n');
    const user = [
        `# 你是誰\n${persona.name}（${persona.role}）：${persona.description}`,
        persona.secret ? `\n# 你心底的事（只有你自己知道）\n${persona.secret}` : '',
        `\n# 你此刻心裡掛著的事`,
        wantList || '（暫時沒有）',
        `\n# 剛剛這場戲（逐字，只此一場）`,
        beatText || '（這場你沒開口。）',
        `\n這場之後，上面每一件事在你（${persona.name}）心裡變成了什麼樣？`,
    ].join('\n');

    const client = llmText.createTextClient({ kind: 'primary' });
    const res = await withRetry(`rewrite:${persona.name}`, () =>
        client.chat({
            model: client.defaultModel,
            system: rewriteSystemPrompt(),
            messages: [{ role: 'user', content: user }],
            maxTokens: 600,
            temperature: 0.7,
        }),
    );
    const obj = extractJson(res.text) ?? {};
    const decisions: RewriteDecision[] = Array.isArray(obj.decisions)
        ? (obj.decisions as any[]).map((d) => ({
              id: String(d?.id ?? ''),
              action: (['keep', 'mutate', 'close'].includes(d?.action) ? d.action : 'keep') as RewriteDecision['action'],
              newDesc: typeof d?.newDesc === 'string' ? d.newDesc.trim() : undefined,
              note: typeof d?.note === 'string' ? d.note.trim() : undefined,
          }))
        : [];
    let spawn: RewriteSpawn | undefined;
    const sp = obj.spawn as any;
    if (sp && typeof sp.desc === 'string' && sp.desc.trim()) {
        spawn = { desc: sp.desc.trim(), layer: typeof sp.layer === 'string' ? sp.layer.trim() : undefined };
    }
    return { decisions, spawn };
}

// A mutation/spawn record for the desc-history report + counters.
interface LedgerEvent {
    tick: number;
    characterId: string;
    kind: 'mutate' | 'close' | 'spawn' | 'spawn-rejected';
    wantId: string;
    fromDesc?: string;
    toDesc?: string;
    note?: string;
}

const ROMANTIC_HOSTILE = /愛|情|戀|慕|恨|妒|怨|敵|仇|虧|愧|償/;

function applyRewrite(
    wants: Want[],
    characterId: string,
    reply: RewriteReply,
    tick: number,
    events: LedgerEvent[],
): void {
    const byId = new Map(wants.map((w) => [w.id, w]));
    for (const d of reply.decisions) {
        const w = byId.get(d.id);
        if (!w || w.retired || w.characterId !== characterId) continue;
        if (d.action === 'mutate') {
            const nd = (d.newDesc ?? '').trim();
            if (nd && nd.length <= 30 && nd !== w.desc) {
                events.push({ tick, characterId, kind: 'mutate', wantId: w.id, fromDesc: w.desc, toDesc: nd, note: d.note });
                w.desc = nd; // scalars untouched
            }
        } else if (d.action === 'close') {
            events.push({ tick, characterId, kind: 'close', wantId: w.id, fromDesc: w.desc, note: d.note });
            w.retired = true;
            w.resolvedTick = tick;
            w.resolvedNote = d.note;
        }
    }
    // Spawn (max 1), enforcing the ≤4 live-want budget per character.
    if (reply.spawn) {
        const desc = reply.spawn.desc.trim();
        const liveNow = wants.filter((w) => !w.retired && w.characterId === characterId).length;
        if (desc.length > 0 && desc.length <= 30 && liveNow < 4) {
            const namesOther = CAST_NAMES.some((n) => n !== characterId && desc.includes(n));
            const hot = ROMANTIC_HOSTILE.test(desc) || ROMANTIC_HOSTILE.test(reply.spawn.layer ?? '');
            const resistance = namesOther && hot ? 8 : 4;
            const target = CAST_NAMES.find((n) => n !== characterId && desc.includes(n));
            const w = newWant({
                characterId,
                layer: reply.spawn.layer || '其他',
                desc,
                target,
                weight: 0.5,
                sat: 0.2,
                resistance,
                kind: 'narrative',
                source: 'owner',
                bornTick: tick,
            });
            wants.push(w);
            events.push({ tick, characterId, kind: 'spawn', wantId: w.id, toDesc: desc, note: `layer=${w.layer} R=${resistance}` });
        } else if (desc.length > 0) {
            events.push({ tick, characterId, kind: 'spawn-rejected', wantId: '-', toDesc: desc, note: liveNow >= 4 ? 'budget≥4' : 'len' });
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// One arm run. Mutates `acc` in place so partial data survives a mid-run failure.
// ─────────────────────────────────────────────────────────────────────────────
interface ArmAcc {
    arm: 'A' | 'B';
    beatsByTick: SceneBeat[][]; // [tick][beat]
    liveCountPerTickPerChar: Array<Record<string, number>>; // [tick] -> {char: liveCount}
    events: LedgerEvent[];
    initialWants: Want[]; // snapshot (deep copy) at t0
    finalWants: Want[]; // reference to the live array
}

async function runArm(arm: 'A' | 'B', wants: Want[], acc: ArmAcc): Promise<void> {
    const memByChar: Record<string, string[]> = {};
    for (let tick = 0; tick < CLOCKS.length; tick++) {
        const clock = CLOCKS[tick];
        const cast = baseCast().map((c) => ({ ...c, memories: (memByChar[c.characterId] ?? []).slice(-4) }));
        const res = await runSceneLoop({
            sceneId: SCENE_ID,
            sceneName: SCENE_NAME,
            isPrivate: false,
            clock,
            stake: tick === 0 ? STAKE : undefined,
            tone: TONE,
            etiquette: ETIQUETTE,
            cast,
            wants,
            tick,
            maxTurns: MAX_TURNS,
            agent,
        });
        acc.beatsByTick[tick] = res.beats;
        console.log(`[arm ${arm}] tick ${tick} (${clock}) — ${res.beats.length} beats, ${res.resolved.length} resolved`);

        // Memory channel (identical in both arms): append this tick's beats to each
        // character's own memory list.
        for (const b of res.beats) (memByChar[b.characterId] ??= []).push(`【${clock}】${b.text}`);

        // Arm B only: living-want rewrite, one call per participant.
        if (arm === 'B') {
            const participants = [...new Set(res.beats.map((b) => b.characterId))];
            for (const cid of participants) {
                const liveWants = wants.filter((w) => !w.retired && w.characterId === cid);
                if (liveWants.length === 0) continue;
                const reply = await rewriteLedger(personas[cid], liveWants, res.beats);
                applyRewrite(wants, cid, reply, tick, acc.events);
            }
        }

        // Record live-want count per character (after this tick's mutations).
        const counts: Record<string, number> = {};
        for (const n of CAST_NAMES) counts[n] = wants.filter((w) => !w.retired && w.characterId === n).length;
        acc.liveCountPerTickPerChar[tick] = counts;
    }
    acc.finalWants = wants;
}

async function runArmWithRestart(arm: 'A' | 'B', initialWants: Want[]): Promise<ArmAcc> {
    const mkAcc = (snap: Want[]): ArmAcc => ({
        arm,
        beatsByTick: [],
        liveCountPerTickPerChar: [],
        events: [],
        initialWants: structuredClone(snap),
        finalWants: [],
    });
    try {
        const wants = structuredClone(initialWants);
        const acc = mkAcc(wants);
        await runArm(arm, wants, acc);
        return acc;
    } catch (err) {
        console.warn(`[arm ${arm}] died after retries: ${err instanceof Error ? err.message : err}. Restarting once.`);
    }
    // Restart once.
    const wants = structuredClone(initialWants);
    const acc = mkAcc(wants);
    try {
        await runArm(arm, wants, acc);
    } catch (err) {
        console.warn(`[arm ${arm}] died again: ${err instanceof Error ? err.message : err}. Reporting partial data.`);
    }
    return acc;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mechanical counters (no LLM judging).
// ─────────────────────────────────────────────────────────────────────────────
/** CJK/alnum char-bigrams: strip whitespace + punctuation, take consecutive pairs. */
function bigrams(text: string): Set<string> {
    const clean = (text || '').replace(/[^\p{Script=Han}\p{L}\p{N}]/gu, '');
    const out = new Set<string>();
    for (let i = 0; i + 1 < clean.length; i++) out.add(clean.slice(i, i + 2));
    return out;
}
function jaccard(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 && b.size === 0) return 0;
    let inter = 0;
    for (const x of a) if (b.has(x)) inter++;
    const uni = a.size + b.size - inter;
    return uni === 0 ? 0 : inter / uni;
}

/** Counter 1: per character, max pairwise cross-tick bigram Jaccard of their beats. */
function repetition(acc: ArmAcc): { perChar: Record<string, number>; mean: number } {
    const perChar: Record<string, number> = {};
    for (const n of CAST_NAMES) {
        const perTick: Array<Set<string>> = [];
        for (const beats of acc.beatsByTick) {
            const mine = (beats ?? []).filter((b) => b.characterId === n).map((b) => b.text).join('');
            perTick.push(mine ? bigrams(mine) : new Set<string>());
        }
        const idx = perTick.map((s, i) => ({ s, i })).filter((x) => x.s.size > 0);
        let max = 0;
        for (let a = 0; a < idx.length; a++)
            for (let b = a + 1; b < idx.length; b++) max = Math.max(max, jaccard(idx[a].s, idx[b].s));
        if (idx.length >= 2) perChar[n] = max;
    }
    const vals = Object.values(perChar);
    const mean = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
    return { perChar, mean };
}

/** Counter 2: per tick, fraction of bigrams unseen in prior ticks. */
function noveltyCurve(acc: ArmAcc): number[] {
    const seen = new Set<string>();
    const out: number[] = [];
    for (const beats of acc.beatsByTick) {
        const bg = bigrams((beats ?? []).map((b) => b.text).join(''));
        if (bg.size === 0) {
            out.push(0);
            continue;
        }
        let unseen = 0;
        for (const g of bg) if (!seen.has(g)) unseen++;
        out.push(unseen / bg.size);
        for (const g of bg) seen.add(g);
    }
    return out;
}

/** Counter 3: ledger dynamics. */
function ledgerDynamics(acc: ArmAcc): {
    mutations: number;
    closes: number;
    spawns: number;
    spawnRejected: number;
    liveByTick: Array<Record<string, number>>;
    budgetViolations: number;
} {
    const mutations = acc.events.filter((e) => e.kind === 'mutate').length;
    const closes = acc.events.filter((e) => e.kind === 'close').length;
    const spawns = acc.events.filter((e) => e.kind === 'spawn').length;
    const spawnRejected = acc.events.filter((e) => e.kind === 'spawn-rejected').length;
    let budgetViolations = 0;
    for (const counts of acc.liveCountPerTickPerChar)
        for (const n of CAST_NAMES) if ((counts?.[n] ?? 0) > 4) budgetViolations++;
    return { mutations, closes, spawns, spawnRejected, liveByTick: acc.liveCountPerTickPerChar, budgetViolations };
}

/** Counter 4 (B only): does each mutated/spawned desc share ≥1 CJK bigram with
 *  this tick's beat text (excluding the character's own name)? */
function provenance(acc: ArmAcc): { total: number; passed: number; rate: number; misses: LedgerEvent[] } {
    let total = 0;
    let passed = 0;
    const misses: LedgerEvent[] = [];
    for (const e of acc.events) {
        if (e.kind !== 'mutate' && e.kind !== 'spawn') continue;
        const desc = e.toDesc ?? '';
        const beatsThisTick = (acc.beatsByTick[e.tick] ?? []).map((b) => b.text).join('');
        const stripName = (s: string) => s.split(e.characterId).join('');
        const dBg = bigrams(stripName(desc));
        const bBg = bigrams(stripName(beatsThisTick));
        let share = false;
        for (const g of dBg) if (bBg.has(g)) { share = true; break; }
        total++;
        if (share) passed++;
        else misses.push(e);
    }
    return { total, passed, rate: total ? passed / total : 1, misses };
}

/** Counter 5: persona-anchor violations (mechanical heuristics, documented). */
function personaAnchors(acc: ArmAcc): {
    misgenderLiu: number;
    suAddressLiuWrong: number;
    liuAddressSuWrong: number;
} {
    const all = acc.beatsByTick.flat();
    // V1 (misgender, upper bound): a beat that mentions 生春 and uses 他 (not 她).
    // Heuristic — 江聞鶴 is male, so 他 can be legitimate; this counts candidates.
    const misgenderLiu = all.filter((b) => /生春/.test(b.text) && /他/.test(b.text) && !/她/.test(b.text)).length;
    // V2: 蘇映雪 addressing 柳生春 with a wrong honorific (correct = 師妹/生春).
    const WRONG_FOR_LIU = ['師姐', '柳老板', '柳先生', '柳公子', '公子'];
    const suAddressLiuWrong = all.filter(
        (b) =>
            b.characterId === '蘇映雪' &&
            (b.addressed === '柳生春' || /生春/.test(b.text)) &&
            WRONG_FOR_LIU.some((w) => b.text.includes(w)),
    ).length;
    // V3: 柳生春 addressing 蘇映雪 with anything other than 師姐.
    const WRONG_FOR_SU = ['師妹', '蘇老板', '蘇小姐', '映雪姑娘'];
    const liuAddressSuWrong = all.filter(
        (b) =>
            b.characterId === '柳生春' &&
            (b.addressed === '蘇映雪' || /映雪/.test(b.text)) &&
            WRONG_FOR_SU.some((w) => b.text.includes(w)),
    ).length;
    return { misgenderLiu, suAddressLiuWrong, liuAddressSuWrong };
}

// ─────────────────────────────────────────────────────────────────────────────
// Report
// ─────────────────────────────────────────────────────────────────────────────
function descHistory(acc: ArmAcc): string {
    const lines: string[] = [];
    for (const n of CAST_NAMES) {
        lines.push(`\n### ${n}`);
        const initial = acc.initialWants.filter((w) => w.characterId === n);
        for (const w of initial) {
            lines.push(`- [${w.layer}] (id=${w.id}) 初始：${w.desc}`);
            const evs = acc.events.filter((e) => e.wantId === w.id).sort((a, b) => a.tick - b.tick);
            for (const e of evs) {
                if (e.kind === 'mutate') lines.push(`    → t${e.tick} 改寫：${e.toDesc}　〔${e.note ?? ''}〕`);
                else if (e.kind === 'close') lines.push(`    → t${e.tick} 放下（close）〔${e.note ?? ''}〕`);
            }
        }
        const spawned = acc.events.filter((e) => e.kind === 'spawn' && e.characterId === n);
        for (const e of spawned) lines.push(`- （t${e.tick} 新生 spawn）${e.toDesc}　〔${e.note ?? ''}〕`);
        const rejected = acc.events.filter((e) => e.kind === 'spawn-rejected' && e.characterId === n);
        for (const e of rejected) lines.push(`- （t${e.tick} spawn 被拒：${e.note}）${e.toDesc}`);
    }
    return lines.join('\n');
}

function beatDump(acc: ArmAcc): string {
    const lines: string[] = [];
    for (let t = 0; t < acc.beatsByTick.length; t++) {
        lines.push(`\n**Tick ${t} — ${CLOCKS[t]}**`);
        const beats = acc.beatsByTick[t] ?? [];
        if (beats.length === 0) lines.push('（無 beat）');
        for (const b of beats) {
            lines.push(`- ${b.name}${b.addressed ? `→${b.addressed}` : ''}：${b.text}`);
            if (b.inner) lines.push(`    〔心：${b.inner}〕`);
        }
    }
    return lines.join('\n');
}

function fmtPct(x: number): string {
    return `${(x * 100).toFixed(1)}%`;
}

async function main(): Promise<void> {
    console.log('=== deriving genesis wants (shared) ===');
    const initialWants = await deriveInitialWants();

    console.log('\n=== ARM A (control) ===');
    const accA = await runArmWithRestart('A', initialWants);
    console.log('\n=== ARM B (living want) ===');
    const accB = await runArmWithRestart('B', initialWants);

    // Counters
    const repA = repetition(accA);
    const repB = repetition(accB);
    const novA = noveltyCurve(accA);
    const novB = noveltyCurve(accB);
    const ledA = ledgerDynamics(accA);
    const ledB = ledgerDynamics(accB);
    const provB = provenance(accB);
    const paA = personaAnchors(accA);
    const paB = personaAnchors(accB);

    const fmtLive = (led: ReturnType<typeof ledgerDynamics>) =>
        led.liveByTick.map((c, t) => `t${t}:{${CAST_NAMES.map((n) => `${n[0]}${c?.[n] ?? '-'}`).join(',')}}`).join(' ');

    // ── Counter table ──
    const table: string[] = [];
    table.push('| 指標 | Arm A（現況） | Arm B（活 want） |');
    table.push('|---|---|---|');
    table.push(`| 1. 重複 max cross-tick Jaccard（arm mean） | ${repA.mean.toFixed(3)} | ${repB.mean.toFixed(3)} |`);
    for (const n of CAST_NAMES)
        table.push(`| 　└ ${n} | ${repA.perChar[n]?.toFixed(3) ?? 'n/a'} | ${repB.perChar[n]?.toFixed(3) ?? 'n/a'} |`);
    table.push(`| 2. 新穎度曲線（每 tick 未見 bigram 比例） | ${novA.map(fmtPct).join(' → ')} | ${novB.map(fmtPct).join(' → ')} |`);
    table.push(`| 3. ledger：mutate / close / spawn | ${ledA.mutations} / ${ledA.closes} / ${ledA.spawns} | ${ledB.mutations} / ${ledB.closes} / ${ledB.spawns} |`);
    table.push(`| 　└ spawn 被拒（額度） | ${ledA.spawnRejected} | ${ledB.spawnRejected} |`);
    table.push(`| 　└ live-want/角色/tick | ${fmtLive(ledA)} | ${fmtLive(ledB)} |`);
    table.push(`| 　└ budget>4 違規 | ${ledA.budgetViolations} | ${ledB.budgetViolations} |`);
    table.push(`| 4. provenance 引用通過率（B） | n/a | ${provB.passed}/${provB.total} = ${fmtPct(provB.rate)} |`);
    table.push(`| 5. persona 錨：柳生春被稱「他」候選 | ${paA.misgenderLiu} | ${paB.misgenderLiu} |`);
    table.push(`| 　└ 蘇映雪對柳生春稱謂違規 | ${paA.suAddressLiuWrong} | ${paB.suAddressLiuWrong} |`);
    table.push(`| 　└ 柳生春對蘇映雪稱謂違規 | ${paA.liuAddressSuWrong} | ${paB.liuAddressSuWrong} |`);
    const tableStr = table.join('\n');

    // ── Report file ──
    const report: string[] = [];
    report.push('# Living-want rewrite — A/B raw data + counters');
    report.push('');
    report.push('Decoupled experiment on `feat/engine-core`. Real LLM beats via `@endless-story/llm`');
    report.push('(POE / GLM). Both arms share identical cast, genesis wants (deep-copied), scene, and');
    report.push('memory channel; the ONLY difference is Arm B\'s per-participant post-scene ledger rewrite.');
    report.push('No LLM judged this output — every counter below is computed mechanically in code.');
    report.push('');
    report.push('## Setup');
    report.push(`- Cast: ${CAST_NAMES.join('、')} (real persona/secret/first-3 memories from spring-snow.json)`);
    report.push(`- Scene: ${SCENE_NAME} (public), ${CLOCKS.length} ticks ${CLOCKS.join('→')}, maxTurns ${MAX_TURNS}`);
    report.push('- Genesis wants derived once (with secret), capped 3/char, deep-copied to both arms.');
    report.push('- Memory channel (both arms): last 4 of a character\'s own beats fed as `memories` next tick.');
    report.push('- Bigram method: CJK/alnum char-bigrams after stripping whitespace + punctuation.');
    report.push('');
    report.push('## Counter table');
    report.push('');
    report.push(tableStr);
    report.push('');
    report.push('Counter 5 are mechanical heuristics (documented in code): V1 counts beats mentioning');
    report.push('生春 with 他/no 她 — an UPPER bound, since 江聞鶴 is male and 他 can be legitimate.');
    if (provB.misses.length) {
        report.push('');
        report.push('Provenance misses (B):');
        for (const m of provB.misses) report.push(`- t${m.tick} ${m.characterId} ${m.kind}: ${m.toDesc}`);
    }
    report.push('');
    report.push('## Genesis wants (shared initial set)');
    for (const n of CAST_NAMES) {
        report.push(`\n### ${n}`);
        for (const w of initialWants.filter((w) => w.characterId === n))
            report.push(`- [${w.layer}] ${w.desc}　（w=${w.weight} sat=${w.sat} R=${w.resistance}${w.target ? ` →${w.target}` : ''}）`);
    }
    report.push('');
    report.push('## Arm A — every beat verbatim');
    report.push(beatDump(accA));
    report.push('');
    report.push('## Arm B — every beat verbatim');
    report.push(beatDump(accB));
    report.push('');
    report.push('## Arm B — want-desc history per character');
    report.push(descHistory(accB));
    report.push('');
    report.push('## Arm A — want-desc history per character (control: engine scalar/retire only)');
    report.push(descHistory(accA));
    report.push('');

    const outPath = path.resolve(__dirname, 'rewrite-ab-report.md');
    fs.writeFileSync(outPath, report.join('\n'), 'utf8');

    console.log('\n\n========== COUNTER TABLE ==========\n');
    console.log(tableStr);
    console.log(`\nReport written to ${outPath}`);
}

main().catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
});
