/**
 * Deterministic mechanism core — faithful to the on-chain design, but in-memory.
 * Drama ranking, event spine (open→resolve), deterministic verdict from card
 * intents, + the three wiring fixes (structured cost, targeted secret recall,
 * arcContext/chapter numbering). NO LLM here — pure decisions + framing.
 */

/* ── 牌組（忠實對齊代碼：catalog + 發手牌 + intent 強弱 + card_weight 屬性加權）──
 * 不是石頭剪刀布式克制；而是「越決絕(intent 越小)底牌越強，再按角色屬性加成」。
 * 每張牌綁一個角色屬性，讓不同行當在不同牌上各擅勝場（破壟斷的關鍵之一）。 */
export const CARD_CATALOG = [
    { card: '斬', intent: 0, attr: null, gestures: ['把話說死、半分餘地不留', '當場撕破臉、寸土不讓', '一句頂死、絕了轉圜'] },
    { card: '攻', intent: 1, attr: 'constitution', gestures: ['正面進逼、步步搶上', '當仁不讓地爭、氣勢逼人', '直取要害、毫不遮掩'] },
    { card: '守', intent: 2, attr: 'constitution', gestures: ['穩住不退、也不出手搶', '按住陣腳、以靜待變', '立定如釘、任風浪不動'] },
    { card: '誘', intent: 4, attr: 'disposition', gestures: ['不來硬的、以軟語身段拉攏', '遞個人情、把人往自己這邊引', '用三分情面暗暗使力'] },
    { card: '亮', intent: 5, attr: 'appearance', gestures: ['亮相奪目、用風采壓場', '把一身光彩抖出來、奪盡眼目', '當場顯真本事、要人記住'] },
    { card: '觀', intent: 6, attr: 'acuity', gestures: ['按兵不動、冷眼等破綻', '袖手旁觀、看誰先露馬腳', '不動聲色、坐看局勢'] },
    { card: '讓', intent: 9, attr: null, gestures: ['退開一步、主動讓位', '把位置空出來、不爭', '收手退後、成全旁人'] },
];
export const CARD_BY_NAME = Object.fromEntries(CARD_CATALOG.map((c) => [c.card, c]));
export const VALID_CARDS = CARD_CATALOG.map((c) => c.card);
/** 依 seed 取一個 gesture 變體（同局同人穩定，但跨章跨人會變，破套語）。 */
export function gestureOf(card, seedStr = '') {
    const c = CARD_BY_NAME[card];
    if (!c) return '';
    return c.gestures[hashStr(String(seedStr)) % c.gestures.length];
}

/** 一張牌對某角色的有效強度 = 決絕底分 + 屬性加成。讓=主動退讓，最低。 */
export function cardScore(cardName, character) {
    const c = CARD_BY_NAME[cardName];
    if (!c) return 0;
    const base = (10 - c.intent) * 10;
    const bonus = c.attr ? (character[c.attr] ?? 0) * 0.5 : 0;
    return Math.round(base + bonus);
}

// 確定性 RNG（可由 --seed 重現）：發牌用，讓「不見得抽到強牌」可重跑。
function hashStr(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i += 1) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}
function makeRng(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6d2b79f5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
/** 發 n 張不重複手牌（catalog 洗牌取前 n）。角色不見得拿到強牌。 */
export function dealHand(character, n, seedStr) {
    const rng = makeRng(hashStr(seedStr));
    const pool = CARD_CATALOG.map((c) => c.card);
    for (let i = pool.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rng() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, Math.min(n, pool.length));
}
const RESOURCE_DISPLAY = {
    'recording:首張唱片灌錄權': '春雪社第一張唱片的灌錄權',
    'partnership:蘇映雪': '蘇映雪台上對戲的固定小生搭檔位',
    'spotlight:春雪社頭牌名額': '春雪社頭牌的名分',
};
export function resourceDisplay(label) {
    return RESOURCE_DISPLAY[label] ?? (String(label).split(':')[1] ?? label);
}
/** Display that also covers director-created resources (their own `.display`). */
export function displayOf(world, label) {
    return world.resources.find((r) => r.label === label)?.display ?? resourceDisplay(label);
}

/** Rank resources by contention = # present desirers who don't already hold it.
 *  Skips locked + 剛結算冷卻中的標的；平手時偏好「最久沒結算」的軸（破鬼打牆）。 */
export function rankContention(world) {
    const rester = world.restNextTick ?? null;
    return world.resources
        .filter((r) => !r.locked && !r.retired && (r.cooldownUntil ?? 0) <= world.tick)
        .map((r) => {
            const desirers = world.cast.filter(
                (c) => c.desires.includes(r.label) && r.holder !== c.id && c.id !== rester,
            );
            return { resource: r, desirers, score: desirers.length };
        })
        .filter((x) => x.score >= 1)
        .sort(
            (a, b) =>
                b.score - a.score ||
                (a.resource.lastResolved ?? -99) - (b.resource.lastResolved ?? -99) ||
                a.resource.label.localeCompare(b.resource.label),
        );
}

/** 一人同時握有 ≥2 個標的 = 樹大招風，回傳其 id 供班主介入。
 *  已退場/已鎖定（班主裁過）的標的不算——否則持有退場資源會被誤判成永久壟斷、被反覆罰輪空。 */
export function detectMonopoly(world) {
    const counts = {};
    for (const r of world.resources) {
        if (r.holder && !r.retired && !r.locked) counts[r.holder] = (counts[r.holder] ?? 0) + 1;
    }
    for (const [id, n] of Object.entries(counts)) if (n >= 2) return id;
    return null;
}

/** Open an event on the top-contended resource. Participants converge to one scene. */
export function openEvent(world) {
    const ranked = rankContention(world);
    if (ranked.length === 0) return null;
    const top = ranked[0];
    const r = top.resource;
    const rester = world.restNextTick ?? null;
    const participants = [...top.desirers];
    const holder = r.holder ? world.cast.find((c) => c.id === r.holder) : null;
    if (holder && holder.id !== rester && !participants.includes(holder)) participants.push(holder);
    if (participants.length < 2) return null; // need a real contest

    const sceneId = 'sc_yunjin';
    const sceneName = sceneNameOf(world, sceneId);
    for (const p of participants) p.sceneId = sceneId; // MOVE: converge

    const kind = r.label.split(':')[0];
    const label = r.framing ?? framingFor(kind, r);
    world.openEvent = {
        id: `ev_${world.tick}`,
        resourceLabel: r.label,
        label,
        sceneId,
        sceneName,
        participantIds: participants.map((p) => p.id),
        cards: {}, // charId -> {card, why}
    };
    return world.openEvent;
}

function framingFor(kind, r) {
    if (kind === 'recording') return '誰的腔灌進春雪社第一張唱片';
    if (kind === 'partnership') return '誰當蘇映雪台上對戲的固定小生搭檔';
    if (kind === 'spotlight') return '上海這季把誰捧成春雪社的頭牌';
    return r.label;
}

/** Deterministic verdict from played cards: lowest rank wins; tie → keeps holder, else first. */
export function resolveEvent(world) {
    const ev = world.openEvent;
    if (!ev) return null;
    const r = world.resources.find((x) => x.label === ev.resourceLabel);
    const plays = ev.participantIds.map((id) => {
        const c = world.cast.find((x) => x.id === id);
        const play = ev.cards[id] ?? { card: '守', why: '' };
        return { id, name: c.name, role: c.role, card: play.card, why: play.why, score: cardScore(play.card, c) };
    });
    // 持有者黏性：守成者 +18，避免 capacity-1 標的每 tick 翻盤（一張碟不該 6 天換 4 主）。
    const HOLDER_BONUS = 18;
    const eff = (p) => p.score + (r.holder === p.id ? HOLDER_BONUS : 0);
    const sorted = [...plays].sort(
        (a, b) => eff(b) - eff(a) || (r.holder === a.id ? -1 : r.holder === b.id ? 1 : 0),
    );
    const winner = sorted[0];
    const prevHolder = r.holder;
    r.holder = winner.id;
    r.lastResolved = world.tick;
    r.cooldownUntil = world.tick + 2; // 剛爭過的標的冷卻 2 tick，逼世界轉去別的軸

    const others = plays.filter((p) => p.id !== winner.id);
    const display = displayOf(world, ev.resourceLabel);
    const fromName = prevHolder ? world.cast.find((c) => c.id === prevHolder)?.name : null;
    // verdict (DEBUG, with card tokens) — for the mechanism log ONLY, never fed to prose.
    const verdict =
        `${winner.name}的〔${winner.card}〕` +
        (others.length ? `壓過${others.map((o) => `${o.name}的〔${o.card}〕`).join('、')}，` : '，') +
        `這一局${winner.name}奪下了「${ev.resourceLabel}」` +
        (prevHolder && prevHolder !== winner.id ? `（從${fromName ?? '前手'}手中易手）` : '');
    // verdictNarrative (CLEAN) — translated gestures + human resource name; this is what POV/cut see.
    const verdictNarrative =
        `${winner.name}${gestureOf(winner.card, `${ev.id}:${winner.id}`)}，` +
        (others.length ? `壓過了${others.map((o) => `${o.name}（${gestureOf(o.card, `${ev.id}:${o.id}`)}）`).join('、')}，` : '') +
        `奪下了${display}` +
        (prevHolder && prevHolder !== winner.id ? `（從${fromName ?? '前手'}手中易手）` : '');

    return { ev, resource: r, winner, plays, losers: others, verdict, verdictNarrative, display, prevHolder };
}

/** FIX 1 — structured cost: tie the loser's loss to their own plan/desire. */
export function structuredCost(world, charId, resolution) {
    const display = resolution.display ?? resourceDisplay(resolution.resource.label);
    if (resolution.winner.id === charId) {
        return `你奪下了${display}。但贏得的方式、欠下的人情，會跟著你——想清楚你得到的同時失了什麼。`;
    }
    return `你沒能爭到${display}——而這正是你打算裡所求。` +
        `它落到了${resolution.winner.name}手裡。寫你失去它對你意味著什麼，以及下一步。`;
}

/** FIX 2 — targeted private-ledger recall: surface ONE secret-memory, rotated by chapter. */
export function targetedRecall(world, charId) {
    const c = world.cast.find((x) => x.id === charId);
    const mems = c.privateMemories ?? [];
    if (mems.length === 0) return c.secret;
    const idx = (world.chapterNo ?? 0) % mems.length;
    return mems[idx];
}

/** FIX 3 — arcContext: pull the arc line relevant to this event + chapter number. */
export function arcContext(world, resourceLabel) {
    const arc = world.arc;
    const kind = (resourceLabel ?? '').split(':')[0];
    const line =
        arc.lines.find((l) => (l.name || '').includes(displayKind(kind))) ?? arc.lines[0] ?? null;
    return {
        throughline: arc.throughline,
        lastBeat: line?.state ?? '（這條線剛起頭）',
        thisPush: line?.nextPush ?? '推進這條線一步',
    };
}

function displayKind(kind) {
    return kind === 'recording' ? '唱片' : kind === 'partnership' ? '搭檔' : kind === 'spotlight' ? '頭牌' : kind;
}

/** Objective shared facts for a scene this tick (card plays + talks). */
export function buildSceneBeats(world, sceneId, selfId) {
    const ev = world.openEvent;
    const beats = [];
    if (ev && ev.sceneId === sceneId) {
        for (const id of ev.participantIds) {
            if (id === selfId) continue;
            const c = world.cast.find((x) => x.id === id);
            const play = ev.cards[id];
            if (play) beats.push(`${c.name}的姿態：${gestureOf(play.card, `${ev.id}:${id}`)}`);
        }
    }
    return beats;
}

/* ── 自檢步驟 (NARRATIVE_AGENTS 缺口)：行當/性別/道具/機制 token 一致性 lint ──
 * 純規則、零成本、低誤報；違反項回給 run.mjs 觸發「指出硬傷→改寫一次」。 */
const NO_BEARD_ROLES = ['坤生', '乾生', '小生', '花旦', '旦', '青衣', '刀馬旦', '武旦'];
const BEARD_RE = /髯口|三髯|黲髯|白滿|黑三|掛髯|鬍鬚|鬚口/;
const LAOSHENG_PLAY_RE = /定軍山|烏盆記|捉放曹|碰碑|搜孤救孤|空城計|轅門斬子|文昭關|斬經堂/;
const TOKEN_RE = /〔[斬攻誘守觀讓]〕/;
// 任何 <ascii-kind>:<中文> 形狀都算機制 label 洩漏（含 director 新標的）。
const RAWLABEL_RE = /[a-z][a-z0-9_]{2,}:[一-鿿]/;

export function auditProse(text, c) {
    const v = [];
    if (TOKEN_RE.test(text)) v.push('機制 token 洩漏：正文出現卡牌符號〔斬/攻/…〕，應改寫成可觀察的動作');
    if (RAWLABEL_RE.test(text)) v.push('機制 token 洩漏：正文出現資源原始標籤（recording:/partnership:/…），應用人話');
    if (c && NO_BEARD_ROLES.includes(c.role) && BEARD_RE.test(text)) {
        const kindNote = c.role.includes('生') ? '小生是俊扮' : '旦行';
        v.push(`行當錯誤：${c.name}是${c.role}（${kindNote}），絕不掛髯口/鬍鬚——髯口屬老生/淨`);
    }
    if (c && NO_BEARD_ROLES.includes(c.role)) {
        const m = text.match(LAOSHENG_PLAY_RE);
        if (m) v.push(`戲碼錯誤：「${m[0]}」是老生戲，非${c.role}應工`);
    }
    // 本班無「師兄/師哥」：蘇映雪為師姐(女)、柳生春為師妹。出現即稱謂/性別錯亂。
    if (/師哥|師兄/.test(text)) v.push('稱謂錯誤：本班無師兄；蘇映雪是師姐(女)、柳生春是師妹，勿用師哥/師兄');
    // 性別代詞：只查「明確女性」(蘇映雪/沈雪笙/連翹/唐桂蘭)。
    // 柳生春是坤生、活在男裝裡，別人(尤其江聞鶴)以「柳爺/他」稱她是合理的，不查。
    // 規則排除中間出現「柳」字的情況，避免「蘇映雪…柳生春…他(=柳)」的誤報。
    const FEMALE_NAMES = ['蘇映雪', '沈雪笙', '連翹', '唐桂蘭'];
    for (const name of FEMALE_NAMES) {
        if (new RegExp(`${name}(?:(?!柳|。|？|！)[\\s\\S]){0,8}他(?!們)`).test(text)) {
            v.push(`性別代詞錯誤：${name}是女性，第三人稱應用「她」`);
        }
    }
    return [...new Set(v)];
}

export function relationshipHints(world, charId) {
    const c = world.cast.find((x) => x.id === charId);
    // light: name the others present in the same scene + a one-line stance from secret-adjacent desire
    return world.cast
        .filter((o) => o.id !== charId && o.sceneId === c.sceneId)
        .map((o) => `${o.name}（${o.role}）也在場`);
}

export function sceneNameOf(world, sceneId) {
    return world.scenes.find((s) => s.id === sceneId)?.name ?? sceneId;
}

/* ── D5：Showrunner 開新標的 / 退場舊標的（對齊 propose-resources.ts 的護欄）──
 * LLM 掌「意義」（要不要新開一條衝突軸），但永不繞過守恆：kind 須 ascii slug、
 * 不可撞內建軸、不可重複、渴望者須 ≥2 且在卡司內、導演標的有總量上限。 */
export const MAX_DIRECTOR_RESOURCES = 3;
const BUILTIN_KINDS = ['recording', 'partnership', 'spotlight'];

function resolveCastId(world, s) {
    const c = world.cast.find((x) => x.id === s || x.name === s);
    return c ? c.id : null;
}

export function validateResourceOps(world, ops) {
    const accepted = [];
    const rejected = [];
    let added = 0;
    const liveDirector = world.resources.filter((r) => r.director && !r.retired).length;
    for (const op of ops ?? []) {
        if (!op || typeof op !== 'object') {
            rejected.push({ op, reason: '格式錯誤' });
            continue;
        }
        if (op.op === 'retire') {
            const r = world.resources.find((x) => x.label === op.label && !x.retired);
            if (!r) {
                rejected.push({ op, reason: '找不到可退場的標的' });
                continue;
            }
            // 仍有 ≥2 人想爭（持有者除外）= 活軸，不可退場，免得殺掉熱戲讓世界變薄。
            const stillWanted = world.cast.filter(
                (c) => c.desires.includes(r.label) && r.holder !== c.id,
            ).length;
            if (stillWanted >= 2) {
                rejected.push({ op, reason: '此標的仍有≥2人想爭、未死，不可退場' });
                continue;
            }
            accepted.push({ op: 'retire', label: r.label, why: op.why });
            continue;
        }
        if (op.op === 'instantiate') {
            const label = String(op.label ?? '');
            const kind = label.split(':')[0];
            const display = String(op.display ?? '').trim();
            const framing = String(op.framing ?? display).trim();
            const seekers = (Array.isArray(op.seekers) ? op.seekers : [])
                .map((s) => resolveCastId(world, s))
                .filter((x, i, a) => x && a.indexOf(x) === i);
            if (!/^[a-z][a-z0-9_]*$/.test(kind)) {
                rejected.push({ op, reason: 'kind 須 ascii slug' });
                continue;
            }
            if (BUILTIN_KINDS.includes(kind)) {
                rejected.push({ op, reason: '不可撞內建軸' });
                continue;
            }
            if (world.resources.some((r) => r.label === label && !r.retired)) {
                rejected.push({ op, reason: '標的已存在' });
                continue;
            }
            if (!display) {
                rejected.push({ op, reason: 'display 空' });
                continue;
            }
            if (seekers.length < 2) {
                rejected.push({ op, reason: '渴望者 <2，不成爭' });
                continue;
            }
            if (liveDirector + added >= MAX_DIRECTOR_RESOURCES) {
                rejected.push({ op, reason: '導演標的已達上限' });
                continue;
            }
            accepted.push({ op: 'instantiate', label, kind, display, framing, seekers, why: op.why });
            added += 1;
            continue;
        }
        rejected.push({ op, reason: '未知 op' });
    }
    return { accepted, rejected };
}

export function applyResourceOps(world, accepted) {
    const log = [];
    for (const op of accepted) {
        if (op.op === 'retire') {
            const r = world.resources.find((x) => x.label === op.label && !x.retired);
            if (!r) continue;
            r.retired = true;
            for (const c of world.cast) c.desires = c.desires.filter((d) => d !== r.label);
            log.push(`退場舊標的：「${r.display ?? r.label}」${op.why ? `（${op.why}）` : ''}`);
        } else if (op.op === 'instantiate') {
            world.resources.push({
                label: op.label,
                capacity: 1,
                holder: null,
                director: true,
                display: op.display,
                framing: op.framing,
                means: op.display,
            });
            world.resourceMeans[op.label] = op.display;
            for (const id of op.seekers) {
                const c = world.cast.find((x) => x.id === id);
                if (c && !c.desires.includes(op.label)) c.desires.push(op.label);
            }
            const names = op.seekers.map((id) => world.cast.find((c) => c.id === id).name).join('、');
            log.push(`新開標的：「${op.display}」（爭：${names}）${op.why ? `　— ${op.why}` : ''}`);
        }
    }
    return log;
}

/** 渴望衰減：對同一標的連敗 ≥2 回，就死心退出爭奪——讓熱軸自然收掉、人物移向新欲望。 */
export function applyDesireDecay(world, res) {
    world.lossCount = world.lossCount ?? {};
    const out = [];
    for (const loser of res.losers) {
        const key = `${loser.id}:${res.resource.label}`;
        world.lossCount[key] = (world.lossCount[key] ?? 0) + 1;
        if (world.lossCount[key] >= 2) {
            const c = world.cast.find((x) => x.id === loser.id);
            if (c && c.desires.includes(res.resource.label)) {
                c.desires = c.desires.filter((d) => d !== res.resource.label);
                out.push(`${c.name} 連敗兩回，對「${res.display}」死了心，不再爭`);
            }
        }
    }
    return out;
}

/** Recent-events digest for showrunner / plan prompts. */
export function recentDigest(world, n = 4) {
    return world.history.slice(-n).map((h) => `第${h.day}日：${h.text}`).join('\n') || '（尚無）';
}
