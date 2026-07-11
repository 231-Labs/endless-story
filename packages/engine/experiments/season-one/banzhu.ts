/**
 * 班主-as-agent milestone layer — the validated `banzhu-milestone/run.ts`
 * mechanism, ported into the season so PRODUCTION is AGENT-DRIVEN and VISIBLE
 * instead of a silent state-machine advance.
 *
 * Three surfaces, all LLM-authored (troupe `askJson`, so the FAKE-LLM smoke runs
 * a deterministic in-world fallback with zero keys, and the real run hits GLM-4.6):
 *
 *   1. announceMilestone — on 沈雪笙's spotlight she decomposes the season goal
 *      (春雪社 must mount+perform a new play by the 年底會串) into the NEXT rung of
 *      the production ladder (定角 / 排練 / 催場) and SPEAKS it to the troupe as an
 *      in-world scene (§2.43: sets target + deadline, never scripts the others).
 *      The harness weaves these as narrated beats in the chapter stream.
 *
 *   2. noteAbsence — when the daily rhythm routes a troupe member to the rehearsal
 *      venue but a hot want pulls them elsewhere, they are PHYSICALLY ABSENT from
 *      the rehearsal scene. 班主 / a co-present actor NOTICES in-world; the
 *      displeasure emerges diegetically (the consequence is the absence itself,
 *      surfaced in narration — NO standing/number penalty).
 *
 *   3. computeRehearsalRouting — the DAY-slot sibling of the night home router
 *      (§2.50): during a 排練 milestone's day slots the rhythm routes each troupe
 *      member to the rehearsal venue, the same way night routes them home — unless
 *      a hot want out-weighs the pull to the floor, in which case they go to the
 *      want's object and the floor runs without them.
 */

import { askJson, type Ask } from '@endless-story/troupe';

// ── The production ladder the 班主 decomposes (world-knowledge, NOT scripted words) ─
export interface LadderRung {
    kind: '定角' | '排練' | '催場';
    stageLabel: string;
    whatItMeans: string;
}
export const RUNGS: Record<LadderRung['kind'], LadderRung> = {
    定角: { kind: '定角', stageLabel: '選角', whatItMeans: '把《斷橋》的許仙、白素貞、小青定到人' },
    排練: { kind: '排練', stageLabel: '開排', whatItMeans: '角定了，開排斷橋那一場，把它排出戲來' },
    催場: { kind: '催場', stageLabel: '催場', whatItMeans: '會串在即，一遍遍摳戲，摳到立得住' },
};

export interface BanzhuSelf {
    name: string;
    persona: string;
    secret: string;
    /** 風格 — a characterful prompt fragment injected into her voice. */
    style: string;
}

/** A 班主 in-world milestone announcement (she decomposes the season goal). */
export interface Milestone {
    tick: number;
    kind: LadderRung['kind'];
    stageLabel: string;
    /** her spoken scene — LLM-authored, her voice (the narrated beat). */
    announcement: string;
    target: string;
    dueDays: number;
    daysLeftAtAnnounce: number;
    live: boolean;
}

export async function announceMilestone(
    ask: Ask,
    shen: BanzhuSelf,
    rung: LadderRung,
    play: { title: string; qizhi: string },
    daysLeft: number,
    progressSoFar: string,
    lastAnnouncement: string | null,
    tick: number,
): Promise<Milestone> {
    const v = await askJson<{ announcement: string; target: string; dueDays: number }>(
        ask,
        {
            system:
                '你是春雪社班主沈雪笙，昔年工小生，如今封箱坐鎮後台。這是你的高光時刻。' +
                '排一齣戲有它的步子：立意→定角→開排→催場→年底會串。你的活兒，是把「春雪社要在年底會串上排出並演一齣新戲」這件大事，' +
                '拆成眼下該走的下一步，當眾對一班角兒放一句話——把它說成戲裡的一句話，帶班主的分量。' +
                '你不替角兒決定誰演什麼，只把「下一步幹什麼、限到哪天」擺明，逼他們拿出真東西。' +
                `你的聲口：${shen.style}。民初梨園白話，短、狠、底下有暖，不要旁白、不要現代腔。`,
            user:
                `── 你這個人 ──\n${shen.persona}\n你的心事（沒人知道）：${shen.secret}\n` +
                `── 眼下 ──\n這齣戲：《${play.title}》，立意「${play.qizhi}」。距年底會串還有 ${daysLeft} 天。\n` +
                `已經走到的步：${progressSoFar}\n你上一句放的話：${lastAnnouncement ?? '（還沒開口）'}\n` +
                `眼下該拆出的下一步（步子的名目）：${rung.kind}——${rung.whatItMeans}\n\n` +
                `現在你當眾放話。只輸出 JSON：\n` +
                `{"announcement":"你當眾放的那句話，用你自己的聲口，1到3句","target":"這一步要達成的具體事","dueDays":限期還剩幾天的數字}`,
            maxTokens: 500,
            temperature: 0.9,
        },
        () => fallbackAnnounce(rung.kind, daysLeft),
        (x): x is { announcement: string; target: string; dueDays: number } =>
            !!x && typeof (x as { announcement?: unknown }).announcement === 'string',
    );
    const dueDays = Number.isFinite(v.dueDays) ? v.dueDays : Math.max(1, Math.round(daysLeft / 2));
    return {
        tick,
        kind: rung.kind,
        stageLabel: rung.stageLabel,
        announcement: String(v.announcement || '').trim(),
        target: String(v.target || rung.whatItMeans).trim(),
        dueDays,
        daysLeftAtAnnounce: daysLeft,
        live: !ask.mock,
    };
}

function fallbackAnnounce(kind: LadderRung['kind'], daysLeft: number): { announcement: string; target: string; dueDays: number } {
    if (kind === '定角')
        return { announcement: '後天定角。《斷橋》的許仙、白素貞、小青，都給我拿出真東西來——爭得上的自己開口。', target: '把三個角定到人', dueDays: Math.max(2, daysLeft - 2) };
    if (kind === '排練')
        return { announcement: '角定了，從明兒起排《斷橋》。斷橋那場，我要看見台下那對照見台上，別給我在台上晃。', target: '把斷橋一場排出戲來', dueDays: Math.max(1, daysLeft - 1) };
    return { announcement: `還剩${daysLeft}天。這戲得像個戲——今兒起一遍一遍摳，摳到它立得住為止。`, target: '把戲摳到立得住', dueDays: daysLeft };
}

// ── 班主 / co-present notices an ABSENCE from the rehearsal floor (diegetic) ────
export interface AbsenceNote {
    line: string;
    live: boolean;
}
export async function noteAbsence(
    ask: Ask,
    observer: BanzhuSelf,
    absent: { name: string },
    ctx: { venue: string; pulledTo: string; milestoneKind: string },
): Promise<AbsenceNote> {
    const v = await askJson<{ line: string }>(
        ask,
        {
            system:
                '你是春雪社班主沈雪笙，正在戲台上盯排《斷橋》。開了排，該到的角兒卻少了一個——' +
                '你不點破罰誰，只把這一少道出來，話裡有戲班的規矩，也有你藏得極深的疼與惱。' +
                `你的聲口：${observer.style}。民初梨園白話，短、真、一兩句，不要旁白、不要現代腔。`,
            user:
                `眼下這步：${ctx.milestoneKind}。排戲的地方：${ctx.venue}。\n` +
                `${absent.name} 沒到——人被別處的事牽走了（去了${ctx.pulledTo}）。\n` +
                `你當著在場的人說一句。只輸出 JSON：{"line":"你當場說的一句話"}`,
            maxTokens: 200,
            temperature: 0.9,
        },
        () => ({
            line: `${absent.name}呢？戲台上少一個人，這齣戲就短一塊骨頭。人心在別處，腳就到不了台上——罷了，先走能走的。`,
        }),
        (x): x is { line: string } => !!x && typeof (x as { line?: unknown }).line === 'string',
    );
    return { line: String(v.line || '').trim(), live: !ask.mock };
}

// ── DAY-slot rehearsal router (the sibling of the night home router, §2.50) ────
export interface RehearsalRoutingActor {
    id: string;
    /** where rehearsal happens (the 戲台/練功房 floor). */
    /** a hot want dragging them OFF the floor to its object's scene. */
    pull?: { toSceneId: string; w: number; targetName?: string };
}
export interface RehearsalRoutingResult {
    sceneId: string;
    absent: boolean;
    pulledTo?: string;
    targetName?: string;
    w: number;
}
export interface RehearsalRoutingOpts {
    /** the floor's own pull (a member shows up unless a want out-weighs this). */
    attendW?: number;
}
/**
 * During a 排練 milestone's day slot, route each floor member to the rehearsal
 * venue — UNLESS a hot want out-weighs the pull to the floor, in which case they
 * go to the want's object and are marked absent. Same candidate/max-weight shape
 * as `computeSpatialRouting`; the milestone is the "teeth", not an abstract
 * penalty (the consequence is the absence itself).
 */
export function computeRehearsalRouting(
    actors: readonly RehearsalRoutingActor[],
    rehearsalSceneId: string,
    opts: RehearsalRoutingOpts = {},
): Map<string, RehearsalRoutingResult> {
    const attendW = opts.attendW ?? 0.6;
    const out = new Map<string, RehearsalRoutingResult>();
    for (const a of actors) {
        const cands: Array<{ scene: string; w: number; targetName?: string }> = [{ scene: rehearsalSceneId, w: attendW }];
        if (a.pull && a.pull.toSceneId && a.pull.toSceneId !== rehearsalSceneId) {
            cands.push({ scene: a.pull.toSceneId, w: a.pull.w, targetName: a.pull.targetName });
        }
        cands.sort((x, y) => y.w - x.w);
        const chosen = cands[0];
        const absent = chosen.scene !== rehearsalSceneId;
        out.set(a.id, { sceneId: chosen.scene, absent, pulledTo: absent ? chosen.scene : undefined, targetName: absent ? chosen.targetName : undefined, w: chosen.w });
    }
    return out;
}
