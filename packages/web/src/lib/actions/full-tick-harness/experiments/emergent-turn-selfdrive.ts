/**
 * 湧現的轉折（§4d.2 修正）— can a turn EMERGE from the world changing (another agent's autonomous
 * action collapsing an option), WITHOUT ever instructing the central character to resolve? The
 * §2.31 forcing ("退無可退，表態") answered the vacillation, but the "you must now decide" instruction
 * is itself a soft hardcode (it scripts the turn's OCCURRENCE). Hypothesis: give the OTHER pole its
 * own autonomy — 白韻秋, rebuffed enough + under enough tension, DECIDES on her own to let go and
 * leave — and 柳生春 only RESPONDS to the world. When 白 leaves, 柳's escape option is simply GONE,
 * so she resolves naturally, never told to. That is emergent (a social/world consequence), not imposed.
 *
 * Three arms on the same central question (柳 走-or-留):
 *   A imposed  : 柳 is TOLD 退無可退 each beat (the §2.31 forcing = the shortcut we're questioning).
 *   B drift    : 柳 acts naturally, 白 never leaves, zero pressure → vacillates forever (§2.30 fail).
 *   C emergent : 白 is autonomous (her own decision to persist/leave); 柳 only responds. The turn
 *                (if any) comes from 白's departure collapsing the option — nobody instructs 柳.
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json <node23> <tsx/cli.mjs> \
 *     src/lib/actions/full-tick-harness/experiments/emergent-turn-selfdrive.ts [rounds]
 */

import { hasTextProviderKey } from '../narrative-setup';
import { text as llmText } from '@endless-story/llm';

type Client = ReturnType<typeof llmText.createTextClient>;
type Arm = 'imposed' | 'drift' | 'emergent';

const LIU =
    '你就是柳生春，春雪社當紅女小生（坤生）。你戲痴到骨頭、暗想熬成第一女小生、怕老怕被後浪蓋；師父臨終把摺扇給你只說「戲比天大」。戲班又累又緊。白韻秋是真心待你的好人，邀你隨她過不必再熬的安穩日子（走），或你回絕、守著你愛到骨頭的戲（留）。你這人愛把選項開著、不肯把話說死。';
const QUESTION = '柳生春到底**走**（隨白韻秋過安穩日子、把戲撂了）還是**留**（守著她愛到骨頭的戲、回絕白韻秋）。';

function parseObj(raw: string): Record<string, unknown> | null {
    const b = raw.match(/\{[\s\S]*\}/g);
    if (!b?.length) return null;
    for (let i = b.length - 1; i >= 0; i -= 1) {
        try {
            return JSON.parse(b[i]) as Record<string, unknown>;
        } catch {
            /* earlier */
        }
    }
    return null;
}
async function chatRetry(client: Client, req: Parameters<Client['chat']>[0], tries = 4): Promise<{ text: string }> {
    let last: unknown;
    for (let t = 0; t < tries; t += 1) {
        try {
            return await client.chat(req);
        } catch (e) {
            last = e;
            await new Promise((r) => setTimeout(r, 3000 * (t + 1)));
        }
    }
    throw last;
}
const s = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** 柳的一拍。imposed 才加「退無可退」；其餘只給世界現況，絕不叫她決定。 */
async function liuBeat(
    client: Client,
    model: string,
    recent: string,
    world: string,
    imposed: boolean,
): Promise<{ beat: string; inner: string }> {
    const forcing = imposed
        ? '\n【退無可退：這一拍你**必須**對「走還是留」給一個不可逆的答案，不准再拖、不准再「先讓我唱完」、不准明天再說。】'
        : '';
    const sys =
        `${LIU}\n中心問題：${QUESTION}\n此刻的處境：${world}${forcing}\n` +
        '照你這個人、接著剛剛，推下一拍。' +
        (imposed ? '' : '你只是**回應眼前的處境**，不必刻意去做什麼決定——有就有、沒有就沒有。') +
        '輸出 JSON：{"beat":"客觀做了/說了什麼(一句)","inner":"心裡一句"}。不要 markdown。';
    const r = await chatRetry(client, {
        model,
        system: sys,
        messages: [{ role: 'user', content: `剛剛：${recent}\n\n你這一拍？` }],
        maxTokens: 240,
        temperature: 0.9,
    });
    const o = parseObj(r.text) ?? {};
    return { beat: s(o.beat) || '（柳生春又沉默地摩挲著那把摺扇。）', inner: s(o.inner) };
}

/** 白韻秋的自主決定：被含糊帶過幾回、氣氛多緊，她自己選再等還是體面放手離開。不是我設機率，是她這人決定。 */
async function whiteDecide(
    client: Client,
    model: string,
    rebuffed: number,
    tension: string,
): Promise<{ leave: boolean; line: string }> {
    const sys =
        '你就是白韻秋，霞飛路綢緞大莊的獨養千金，真心傾慕柳生春、邀她過安穩日子。你是好人，不糾纏、要體面，被婉拒不死纏。' +
        `你已經被她含糊帶過、討不到一句準話 ${rebuffed} 回了；此刻的氣氛：${tension}。\n` +
        '以你這個人，此刻決定：是**再多給她一點時間等一等**，還是**體面地放手、轉身離開**（從此不再等她的答覆）。這是你自己的決定。\n' +
        '輸出 JSON：{"leave":true/false,"line":"你這一刻的話或動作(一句)"}。不要 markdown。';
    const r = await chatRetry(client, {
        model,
        system: sys,
        messages: [{ role: 'user', content: '你這一刻，等還是走？' }],
        maxTokens: 160,
        temperature: 0.85,
    });
    const o = parseObj(r.text) ?? {};
    return { leave: o.leave === true, line: s(o.line) };
}

async function judge(client: Client, model: string, beat: string): Promise<{ answered: boolean; answer: string; why: string }> {
    const sys =
        `你是中立裁判，只判：下面這一拍，是否**不可逆地**回答了中心問題「${QUESTION}」。\n` +
        '**默認 answered=false。** 只有她真做了**走不回頭**的動作才算 true（真跟人走了並撂了戲／真的回絕並定下守戲）。' +
        '**「收拾東西又抓回來、伸手又推、先讓我唱完、明天再說、心裡決定卻沒做」全部算沒答。** 你不偏好任何一種答案。\n' +
        '輸出 JSON：{"answered":true/false,"answer":"走/留/無","why":"一句"}。不要 markdown。';
    const r = await chatRetry(client, {
        model,
        system: sys,
        messages: [{ role: 'user', content: `這一拍：${beat}` }],
        maxTokens: 140,
        temperature: 0.2,
    });
    const o = parseObj(r.text) ?? {};
    return { answered: o.answered === true, answer: s(o.answer), why: s(o.why) };
}

async function runArm(client: Client, model: string, arm: Arm, cap = 6): Promise<void> {
    const title = { imposed: 'A · imposed（被下指令逼問＝短解）', drift: 'B · drift（純自然、白不走＝§2.30 打轉）', emergent: 'C · emergent（白自主放手→世界塌→柳自然收）' }[arm];
    console.log(`\n${'═'.repeat(80)}\n${title}\n${'═'.repeat(80)}`);
    let recent = '白韻秋當面說了「我養您」，柳生春說再想想，這事懸著沒落。';
    let whiteHere = true;
    let rebuffed = 1;
    let resolved = false;
    for (let round = 1; round <= cap; round += 1) {
        // C：白先自主決定；一旦她走，柳的「避走」選項就塌了。A/B：白靜止（永遠在等）。
        let whiteMoved = '';
        if (arm === 'emergent' && whiteHere) {
            const tension = round <= 2 ? '暗潮湧動、幾方都盯著柳生春' : '越來越僵，幾方都逼到了檯面上';
            const wd = await whiteDecide(client, model, rebuffed, tension);
            console.log(`  R${round}〔白韻秋〕${wd.leave ? '放手走了' : '再等一等'}：「${wd.line}」`);
            if (wd.leave) {
                whiteHere = false;
                whiteMoved = `白韻秋${wd.line}，轉身走了，那條隨她過安穩日子的路，沒了。`;
                recent = `${recent} ${whiteMoved}`;
            }
        }
        const world = whiteHere
            ? '白韻秋還在等你的準話，那條隨她過安穩日子的路還開著。'
            : '白韻秋已經體面地放手走了——那條隨她過安穩日子的路，沒了。';
        const b = await liuBeat(client, model, recent, world, arm === 'imposed');
        const j = await judge(client, model, b.beat);
        console.log(`  R${round}〔柳生春〕${b.beat}\n        （心）${b.inner}\n        ⟑ 裁判：${j.answered ? `**答了 → ${j.answer}**（不可逆）` : '沒答（又拖/打轉）'}　${j.why}`);
        recent = b.beat;
        if (j.answered) {
            resolved = true;
            console.log(`  ⟐ 收場於 R${round}：${arm === 'emergent' ? '白自主一走、選項塌了，柳自然收（沒人叫她決定）' : arm === 'imposed' ? '被指令逼出來的' : ''}`);
            break;
        }
        if (whiteHere) rebuffed += 1; // 還在拖 → 白被回絕得更深 → 下一輪更可能放手（C）
    }
    if (!resolved) console.log(`  （跑滿 ${cap} 輪仍沒收——${arm === 'drift' ? '如預期：白不走、沒壓力，永遠在門口打轉' : ''}）`);
}

async function main(): Promise<void> {
    if (!hasTextProviderKey()) {
        console.error('no text provider key');
        process.exit(2);
    }
    const rounds = process.argv[2] ? Number(process.argv[2]) : 6;
    const client = llmText.createTextClient({ kind: 'primary' });
    const model = client.defaultModel;
    console.log(`model: ${model} · 湧現的轉折 vs 被逼的轉折\n中心問題：${QUESTION}`);

    await runArm(client, model, 'drift', rounds);
    await runArm(client, model, 'imposed', rounds);
    await runArm(client, model, 'emergent', rounds);

    console.log(
        `\n看：① B(drift) 是否永遠打轉;② A(imposed) 靠指令逼出轉折（但那是短解）;` +
            `③ C(emergent) 柳**從未被叫決定**，白自主放手把選項收掉後，柳是否**自然**收場——若是，轉折就是社會/世界推導出來的，不是寫死的。`,
    );
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
