/**
 * Deterministic mechanism core — faithful to the on-chain design, but in-memory.
 * Drama ranking, event spine (open→resolve), deterministic verdict from card
 * intents, + the three wiring fixes (structured cost, targeted secret recall,
 * arcContext/chapter numbering). NO LLM here — pure decisions + framing.
 */

export const CARD_RANK = { 斬: 0, 攻: 1, 誘: 2, 守: 3, 觀: 4, 讓: 5 };
export const VALID_CARDS = Object.keys(CARD_RANK);

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
    const verdict =
        `${winner.name}的〔${winner.card}〕` +
        (others.length ? `壓過${others.map((o) => `${o.name}的〔${o.card}〕`).join('、')}，` : '，') +
        `這一局${winner.name}奪下了「${ev.resourceLabel}」` +
        (prevHolder && prevHolder !== winner.id
            ? `（從${world.cast.find((c) => c.id === prevHolder)?.name ?? '前手'}手中易手）`
            : '');

    return { ev, resource: r, winner, plays, losers: others, verdict, prevHolder };
}

/** FIX 1 — structured cost: tie the loser's loss to their own plan/desire. */
export function structuredCost(world, charId, resolution) {
    const c = world.cast.find((x) => x.id === charId);
    const means = world.resourceMeans[resolution.resource.label] ?? resolution.resource.label;
    if (resolution.winner.id === charId) {
        return `你奪下了「${resolution.resource.label}」（${means}）。但贏得的方式、欠下的人情，會跟著你——想清楚你得到的同時失了什麼。`;
    }
    return `你沒能奪下「${resolution.resource.label}」（${means}）——而這正是你打算裡所求。` +
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
            if (play) beats.push(`${c.name}打出〔${play.card}〕的姿態`);
        }
    }
    return beats;
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
