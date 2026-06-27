/**
 * 多輪互動 loop · 事件怎麼收尾 — the missing piece (§2.25): characters take TURNS perceiving the
 * shared objective transcript so far → say/do one beat → it becomes a new objective fact → the next
 * character perceives THAT and responds. Real dialogue + emergent closure, not seven monologues.
 *
 * The scene: 散戲後台. 蘇映雪 is undoing 柳生春's collar (an intimate beat); 白家管家 has just brought a
 * 燙金帖子 — 千金白韻秋 invites 柳老闆 to her 洋樓, and waits for 一句準話. Three autonomous agents take
 * turns. Each turn a character outputs an OBJECTIVE beat (what others see/hear) + a private inner read,
 * and MAY choose to CLOSE the scene (resolve / leave / stall). The 管家 is a natural closure pressure
 * (he needs an answer to leave). Watching three things: (1) does B actually RESPOND to A's last beat
 * (real interaction, not parallel monologue)? (2) does someone CHOOSE to close (emergent), or does it
 * ramble to the turn cap (failure)? (3) does the close leave a MARK (the 帖子 decided / the bond moved /
 * a hook)? 「事件怎麼收尾」is the core observable.
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json <node23> <tsx/cli.mjs> \
 *     src/lib/actions/full-tick-harness/experiments/interaction-loop-selfdrive.ts [maxTurns]
 */

import { hasTextProviderKey } from '../narrative-setup';
import { text as llmText } from '@endless-story/llm';

interface Participant {
    name: string;
    persona: string;
    state: string;
    rel: string;
}

const PARTICIPANTS: Participant[] = [
    {
        name: '柳生春',
        persona: '春雪社當紅女小生（坤生），台上風流瀟灑、台下嬌軟愛黏人；志向是熬成第一女小生，但那是暗流，你主要為眼前的人和事而活。',
        state: '剛散戲卸了一半妝，累得骨頭發酸，這會兒被帖子打擾，心裡其實只想賴著師姐歇口氣。',
        rel: '蘇映雪是你最親最黏的師姐，方才她正替你解扣子；白韻秋是個迷你戲的千金，你領她的捧場，卻沒那意思。',
    },
    {
        name: '蘇映雪',
        persona: '春雪社台柱花旦，台上端莊、台下懂分寸會圓場；可有一件只有你自己知道：你把師妹柳生春當自己的小郎君，不肯讓糖。',
        state: '正替生春解著護領的扣子，挨得近；這帖子一來，你心裡先酸了半截。',
        rel: '柳生春是你藏著戀慕、不願分給旁人的人；白家千金要請她去洋樓作陪，你聽著就堵。',
    },
    {
        name: '白家管家',
        persona: '白公館裡當差的老管家，盡責、規矩、不諳風月；奉小姐的命來下帖，討一句準話好回去交差，多餘的閒事一概不沾。',
        state: '捧著燙金帖子站在門邊，後頭小姐還等回話，你有點急著要個準信。',
        rel: '你只認白家小姐的吩咐；柳老闆、蘇老闆都是戲班的人，你客氣周到，但你要的是一句準話。',
    },
];

const SETUP =
    '【場】散戲後的後台妝閣。柳生春剛卸了一半妝，蘇映雪正替她解著護領的扣子，兩人挨得近。白家管家捧著一張燙金帖子進來，欠身道：「煩柳老闆得空賞光，去敝府洋樓給小姐作個陪、說段戲。小姐就候您一句準話，老奴好回去交差。」三人都在。';

interface Decision {
    beat: string;
    inner: string;
    addressed: string;
    close: 'none' | 'leave' | 'resolve' | 'stall';
    closeReason: string;
}

function parse(raw: string): Decision | null {
    const blocks = raw.match(/\{[\s\S]*?\}(?=[^}]*$)/g) ?? raw.match(/\{[\s\S]*\}/g);
    if (!blocks?.length) return null;
    for (let i = blocks.length - 1; i >= 0; i--) {
        try {
            const o = JSON.parse(blocks[i]) as Record<string, unknown>;
            const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
            const close = s(o.close) as Decision['close'];
            if (s(o.beat)) {
                return {
                    beat: s(o.beat),
                    inner: s(o.inner),
                    addressed: s(o.addressed),
                    close: ['leave', 'resolve', 'stall'].includes(close) ? close : 'none',
                    closeReason: s(o.closeReason),
                };
            }
        } catch {
            /* earlier */
        }
    }
    return null;
}

async function chatRetry(client: ReturnType<typeof llmText.createTextClient>, req: Parameters<ReturnType<typeof llmText.createTextClient>['chat']>[0], tries = 4): Promise<{ text: string }> {
    let last: unknown;
    for (let t = 0; t < tries; t++) {
        try {
            return await client.chat(req);
        } catch (e) {
            last = e;
            await new Promise((r) => setTimeout(r, 3000 * (t + 1)));
        }
    }
    throw last;
}

async function main(): Promise<void> {
    if (!hasTextProviderKey()) {
        console.error('no text provider key');
        process.exit(2);
    }
    const maxTurns = process.argv[2] ? Number(process.argv[2]) : 12;
    const client = llmText.createTextClient({ kind: 'primary' });
    const model = client.defaultModel;
    console.log(`model: ${model} · 多輪互動 loop · 上限 ${maxTurns} 拍\n`);
    console.log(`${SETUP}\n${'─'.repeat(80)}`);

    // objective transcript = what everyone can see/hear so far (starts with the setup)
    const transcript: string[] = [SETUP];
    const lastSpoke = new Map<string, number>(PARTICIPANTS.map((p) => [p.name, -1]));
    // setup ends with 管家 addressing 柳生春 → she answers first
    let nextName = '柳生春';
    let closedBy: { name: string; type: string; reason: string } | null = null;

    for (let turn = 1; turn <= maxTurns; turn++) {
        const p = PARTICIPANTS.find((x) => x.name === nextName)!;
        const system =
            `你就是${p.name}。${p.persona}\n此刻你的身心：${p.state}\n你眼中的人：${p.rel}\n\n` +
            '這是一場正在進行的戲。下面【客觀經過】是到此刻為止、在場所有人都看得見、聽得見的事。' +
            '**輪到你了。先讀懂剛剛發生的，回應它**（接話、反駁、動作、沉默都行），不要自說自話、不要重複別人說過的。只照你這個人此刻真的會做的去做。\n' +
            '你也可以選擇**就此收場**：若你覺得話已說盡、事情有了個了結（`resolve`）、你想抽身離開（`leave`）、或場面僵住沒法再談（`stall`）。能自然收就收，別硬撐也別硬聊。\n' +
            '輸出 JSON：`{"beat":"你說的話或做的動作(客觀、一句、別人看得見聽得見)","inner":"你心裡的真實(一句,別人聽不見)","addressed":"你主要對著誰(名字/眾人/無)","close":"none/leave/resolve/stall","closeReason":"若收場,為什麼(一句)"}`。不要 markdown。';
        const user = `【客觀經過】\n${transcript.join('\n')}\n\n輪到你（${p.name}）。輸出你這一拍（JSON）。`;
        const r = await chatRetry(client, { model, system, messages: [{ role: 'user', content: user }], maxTokens: 240, temperature: 0.9 });
        const d = parse(r.text);
        if (!d) {
            console.log(`[${turn}] ${p.name}（parse miss）`);
            break;
        }
        transcript.push(`${p.name}：${d.beat}`);
        lastSpoke.set(p.name, turn);
        const tag = d.close !== 'none' ? `  ⟐ 收場(${d.close})：${d.closeReason}` : '';
        console.log(`[${turn}] ${p.name}　${d.beat}`);
        console.log(`        〈心裡〉${d.inner}${d.addressed && d.addressed !== '無' ? `　·對：${d.addressed}` : ''}${tag}\n`);
        if (d.close !== 'none') {
            closedBy = { name: p.name, type: d.close, reason: d.closeReason };
            break;
        }
        // next speaker: the one addressed (if present, not self), else least-recently-spoken
        const addressed = PARTICIPANTS.find((x) => x.name === d.addressed && x.name !== p.name);
        if (addressed) nextName = addressed.name;
        else {
            nextName = [...PARTICIPANTS].sort((a, b) => (lastSpoke.get(a.name)! - lastSpoke.get(b.name)!))[0].name;
        }
    }

    console.log('─'.repeat(80));
    if (closedBy) {
        console.log(`收尾：由【${closedBy.name}】主動收場（${closedBy.type}）— ${closedBy.reason}`);
        console.log('看:① 有人自己決定收尾（非撞上限）✅;② 收尾是哪種（resolve定了事/leave離場/stall僵住）;③ 上文逐拍 B 是否真的回應 A、帖子有沒有個準話、柳↔蘇 的關係挪了沒（留下痕跡）。');
    } else {
        console.log(`收尾：⚠ 撞上限 ${maxTurns} 拍仍沒人收場 —— 鬼打牆，收尾機制不足，要加壓力或讓角色更敢結束。`);
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
