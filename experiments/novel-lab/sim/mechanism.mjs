/**
 * Deterministic mechanism core — faithful to the on-chain design, but in-memory.
 * Drama ranking, event spine (open→resolve), deterministic verdict from card
 * intents, + the three wiring fixes (structured cost, targeted secret recall,
 * arcContext/chapter numbering). NO LLM here — pure decisions + framing.
 */

export const CARD_RANK = { 斬: 0, 攻: 1, 誘: 2, 守: 3, 觀: 4, 讓: 5 };
export const VALID_CARDS = Object.keys(CARD_RANK);

// ── 翻譯層：機制 token → 敘事表面（絕不讓卡名/原始 label 進寫作 prompt）──
export const CARD_GESTURE = {
    斬: '把話說死、半分餘地不留，寧撕破臉也要爭到底',
    攻: '正面進逼，要把這事爭到手',
    誘: '不來硬的，用軟語與身段把人往自己這邊拉',
    守: '穩住不退，也不出手去搶',
    觀: '按兵不動，冷眼看著局勢',
    讓: '退開一步，主動把位置讓出去',
};
const RESOURCE_DISPLAY = {
    'recording:首張唱片灌錄權': '春雪社第一張唱片的灌錄權',
    'partnership:柳生春': '柳生春台上對戲的固定搭檔位',
    'spotlight:春雪社頭牌名額': '春雪社頭牌的名分',
};
export function resourceDisplay(label) {
    return RESOURCE_DISPLAY[label] ?? (String(label).split(':')[1] ?? label);
}

/** Rank resources by contention = # present desirers who don't already hold it. */
export function rankContention(world) {
    const byId = new Map(world.cast.map((c) => [c.id, c]));
    return world.resources
        .map((r) => {
            const desirers = world.cast.filter(
                (c) => c.desires.includes(r.label) && r.holder !== c.id,
            );
            return { resource: r, desirers, score: desirers.length };
        })
        .filter((x) => x.score >= 1)
        .sort((a, b) => b.score - a.score || a.resource.label.localeCompare(b.resource.label));
    void byId;
}

/** Open an event on the top-contended resource. Participants converge to one scene. */
export function openEvent(world) {
    const ranked = rankContention(world);
    if (ranked.length === 0) return null;
    const top = ranked[0];
    const r = top.resource;
    const participants = [...top.desirers];
    const holder = r.holder ? world.cast.find((c) => c.id === r.holder) : null;
    if (holder && !participants.includes(holder)) participants.push(holder);
    if (participants.length < 2) return null; // need a real contest

    const sceneId = 'sc_yunjin';
    const sceneName = sceneNameOf(world, sceneId);
    for (const p of participants) p.sceneId = sceneId; // MOVE: converge

    const kind = r.label.split(':')[0];
    const label = framingFor(kind, r);
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
    if (kind === 'partnership') return '誰是柳生春台上對戲的固定搭檔';
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
        return { id, name: c.name, role: c.role, card: play.card, why: play.why, rank: CARD_RANK[play.card] ?? 3 };
    });
    const sorted = [...plays].sort((a, b) => {
        if (a.rank !== b.rank) return a.rank - b.rank;
        if (r.holder === a.id) return -1; // tie → current holder keeps it
        if (r.holder === b.id) return 1;
        return 0;
    });
    const winner = sorted[0];
    const prevHolder = r.holder;
    r.holder = winner.id;

    const others = plays.filter((p) => p.id !== winner.id);
    const display = resourceDisplay(ev.resourceLabel);
    const fromName = prevHolder ? world.cast.find((c) => c.id === prevHolder)?.name : null;
    // verdict (DEBUG, with card tokens) — for the mechanism log ONLY, never fed to prose.
    const verdict =
        `${winner.name}的〔${winner.card}〕` +
        (others.length ? `壓過${others.map((o) => `${o.name}的〔${o.card}〕`).join('、')}，` : '，') +
        `這一局${winner.name}奪下了「${ev.resourceLabel}」` +
        (prevHolder && prevHolder !== winner.id ? `（從${fromName ?? '前手'}手中易手）` : '');
    // verdictNarrative (CLEAN) — translated gestures + human resource name; this is what POV/cut see.
    const verdictNarrative =
        `${winner.name}${CARD_GESTURE[winner.card]}，` +
        (others.length ? `壓過了${others.map((o) => `${o.name}（${CARD_GESTURE[o.card]}）`).join('、')}，` : '') +
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
            if (play) beats.push(`${c.name}的姿態：${CARD_GESTURE[play.card]}`);
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
const RAWLABEL_RE = /recording:|partnership:|spotlight:/;

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
    // 女角誤用「他」：POV 角色為女且正文以其名搭「他」。
    if (c && c.gender === '女' && new RegExp(`${c.name}[\\s\\S]{0,16}?他(?!們)`).test(text)) {
        v.push(`性別代詞錯誤：${c.name}是女性，第三人稱應用「她」`);
    }
    // 合本等 c 非蘇映雪本人時，仍要抓到蘇映雪被誤寫成「他」（單篇 POV 已由上一條涵蓋）。
    if ((!c || c.id !== 'su') && /蘇映雪[\s\S]{0,16}?他(?!們)/.test(text))
        v.push('性別代詞錯誤：蘇映雪是女性花旦，應用「她」');
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

/** Recent-events digest for showrunner / plan prompts. */
export function recentDigest(world, n = 4) {
    return world.history.slice(-n).map((h) => `第${h.day}日：${h.text}`).join('\n') || '（尚無）';
}
