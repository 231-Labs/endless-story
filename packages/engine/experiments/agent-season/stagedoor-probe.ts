/**
 * AGENT-SEASON · STAGE-DOOR PROBE (下戲送客短片, stage 1: script + voice).
 * ============================================================================
 * The in-world packaging for a character's recurring virtual appearance: on a
 * performance day, after the show, she sees guests off at the theatre gate
 * (名角 stage-door culture, period-accurate, no fourth wall). This probe runs
 * the first two stages of that pipeline, decoupled:
 *
 *   1. SCRIPT — her agent writes a ~30s 送客白 from HER state + the day's real
 *      events (never an operator's copy; the non-control axiom holds: a bad
 *      box-office day may make her curt — that too is the product).
 *   2. VOICE — MiniMax T2A v2 (speech-02-hd) renders it as mp3 with a stock
 *      voice approximating her 坤生 register. Voice DESIGN (a locked custom
 *      voice_id as her second anchor) is the follow-up once the voice is chosen.
 *
 * Stage 3 (Hedra/HeyGen talking-head from the anchor portrait) needs its own
 * key and is out of scope here.
 *
 * Run:
 *   AI_PROVIDER=poe POE_MODEL_PRIMARY=GLM-5.1-FW MINIMAX_API_KEY=… \
 *   pnpm exec tsx --env-file-if-exists=../web/.env.local experiments/agent-season/stagedoor-probe.ts
 *
 * Without MINIMAX_API_KEY it still writes the script and tells you what to set.
 * Optional: MINIMAX_VOICE_ID (default female-yujie), MINIMAX_GROUP_ID.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildCast } from './world.ts';

/** The day being seen off — W3's real finale (compact, from the run archive). */
const TODAY = [
    '今日是年底大會串。春雪社在雲錦台獻演新排的《白蛇傳》，你與蘇映雪領銜——台上她水袖揚到第三道，',
    '你接住那半寸，當著滿堂目光把這齣戲收了。台下滿座，同行都來了。連翹的武戲槍頓台心，一聲響鎮住滿場。',
    '散戲後，看客們往外走，你站在戲園門口送客。',
].join('');

async function main(): Promise<void> {
    const { text: llmText } = await import('@endless-story/llm');
    const [liu] = buildCast(['柳安春']);
    const outDir = import.meta.dirname;

    // ── stage 1: HER script ──
    const client = llmText.createTextClient({ kind: 'primary' });
    const res = await client.chat({
        model: client.defaultModel,
        system: [
            `你就是${liu.name}。${liu.persona}`,
            `【你心底的事（只有你自己知道）】${liu.secret}`,
            '',
            '散了戲，你站在戲園門口送客。看客們一邊往外走，一邊朝你拱手道賀。',
            '說一段你此刻真會說的送客白：對著這些看客，30 秒上下（90-140字），',
            '貼你的口吻——台上是小生，台下這身段收不收、話裡帶不帶戲，由你。',
            '可以謝場、可以自嘲、可以留一句懸念叫人明天再來；今日心緒如何，話就如何。',
            '只輸出這段話本身，不要舞台指示、不要引號、不要換行成清單。',
        ].join('\n'),
        messages: [{ role: 'user', content: `【今日】${TODAY}\n\n輪到你（${liu.name}）開口。` }],
        maxTokens: 300,
        temperature: 0.9,
    });
    const script = res.text.trim();
    const scriptPath = path.join(outDir, 'stagedoor-script.txt');
    fs.writeFileSync(scriptPath, script);
    console.log(`── 送客白（她自己寫的）──\n\n${script}\n`);
    console.log(`script: ${scriptPath}`);

    // ── stage 2: HER voice (MiniMax T2A v2) ──
    const key = process.env.MINIMAX_API_KEY;
    if (!key) {
        console.log('\n（未設 MINIMAX_API_KEY — 跳過配音。把 key 放進 packages/web/.env.local 再跑一次即可出 mp3。）');
        return;
    }
    const group = process.env.MINIMAX_GROUP_ID;
    const url = `https://api.minimax.io/v1/t2a_v2${group ? `?GroupId=${group}` : ''}`;
    const body = {
        model: process.env.MINIMAX_TTS_MODEL ?? 'speech-02-hd',
        text: script,
        // Stock voice approximating the 坤生 register (mature female, lower, steady).
        // The follow-up is voice DESIGN: lock a custom voice_id as her second anchor.
        voice_setting: {
            voice_id: process.env.MINIMAX_VOICE_ID ?? 'female-yujie',
            speed: 0.95,
            vol: 1,
            pitch: -1,
        },
        audio_setting: { sample_rate: 32000, bitrate: 128000, format: 'mp3' },
    };
    const resp = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!resp.ok) {
        console.error(`MiniMax T2A failed: ${resp.status} ${await resp.text()}`);
        process.exit(1);
    }
    const data = (await resp.json()) as { data?: { audio?: string }; base_resp?: { status_code?: number; status_msg?: string } };
    if (data.base_resp?.status_code && data.base_resp.status_code !== 0) {
        console.error(`MiniMax T2A error: ${data.base_resp.status_code} ${data.base_resp.status_msg}`);
        process.exit(1);
    }
    const audio = data.data?.audio;
    if (!audio) {
        console.error('MiniMax T2A: no audio in response:', JSON.stringify(data).slice(0, 300));
        process.exit(1);
    }
    // t2a_v2 returns hex-encoded audio; fall back to base64 if it isn't hex.
    const isHex = /^[0-9a-fA-F]+$/.test(audio.slice(0, 64));
    const buf = Buffer.from(audio, isHex ? 'hex' : 'base64');
    const mp3Path = path.join(outDir, 'stagedoor.mp3');
    fs.writeFileSync(mp3Path, buf);
    console.log(`\nvoice: ${mp3Path} (${(buf.length / 1024).toFixed(0)}KB, voice_id=${body.voice_setting.voice_id})`);
}

main().catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
});
