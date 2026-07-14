/**
 * One-off: weave the 江連 replay beats (bed-probe-jianlian ceiling run) into the
 * 說書人 章回 prose a season reader would actually see — raw beats are the actors'
 * turn-based moves with no connective tissue; this is the missing weave step.
 *
 *   AI_PROVIDER=poe POE_MODEL_PRIMARY=GLM-5.1-FW \
 *   pnpm exec tsx --env-file-if-exists=../web/.env.local \
 *     experiments/agent-season/weave-jianlian.ts
 */

import { buildCast } from './world.ts';

const VENUE = '戲班大通鋪';
const BEATS: Array<{ name: string; text: string }> = [
    { name: '江聞鶴', text: '他伸手將鋪邊那根白蠟桿往裡推了推，低聲道：「連翹，今日練功房你那幾下子勁使得真，這蠻勁砸穿了，就怕日子不等人再砸一回。」' },
    { name: '連翹', text: '她一把攥回白蠟桿，腳尖挑起靴底朝他一亮那金線連翹花，沉聲道：「日子等不等人我不管，這腳底下的板子，我認得哪塊是空的。」' },
    { name: '江聞鶴', text: '他反手扣住她攥桿的手腕，順勢將人往鋪上帶，膝蓋抵進她腿間，貼著她耳根啞聲道：「空板子踩不得，那踩實的...你敢不敢？」' },
    { name: '連翹', text: '手腕一翻反扣住他手背，腰胯借勁往上挺迎那抵進的膝，咬著牙從嗓子眼裡擠出一聲短促的笑：「江聞鶴，踩實的板子不會叫，你倒是讓我聽聽你的響。」' },
    { name: '江聞鶴', text: '他反手將她扣著手背的手指一根根掰開，十指絞緊釘在枕畔，腰胯沈下去，實打實地碾進去，貼著她鼻尖咬著字道：「響不響，你聽著。」' },
    { name: '連翹', text: '她猛仰頸，喉間漏出半聲啞吟，腰背繃成滿弓死死迎住那碾進的力，十指絞著他指節收緊，腿根絞纏他腰胯，喘著氣咬字：「響……還不夠，江聞鶴，這點聲音壓不滿場！」' },
    { name: '江聞鶴', text: '他猛地鬆開釘在枕畔的一手，虎口卡住她下頜扳回來，牙關咬著她微張的唇不輕不重地碾過去，腰腹間那股蠻勁全數砸下，逼得兩人身下鋪板悶聲一震，貼著她水光瀲灩的唇縫啞聲道：「場子滿了，你這嗓子還敢不敢亮？」' },
    { name: '連翹', text: "下頜被虎口鉗著，她不躲，反倒迎著那力道將唇貼上他咬著的唇，舌尖狠劃過他牙關撬開，趁他鬆緊交替之際翻身將他反壓在鋪，腿根死死夾緊他腰胯將那撞進的狠勁全數吞下，掌心按住他胸口撐起身，汗濕的發梢甩落，盯著他眼咬字：'敢。我亮給你聽——'隨即挺腰重重坐落，逼得喉間那聲啞吟再也兜不住，破出來撞在悶響的鋪板上。" },
    { name: '江聞鶴', text: '他任她按著胸口，腰腹借那坐落的狠勁直頂上去，虎口順著她下頜滑落死死掐住她腰側，指節幾乎陷進皮肉裡，頂得她身子一晃，咬著後槽牙從喉底逼出半聲濁啞的悶哼：「亮——別給我留半口氣。」' },
    { name: '連翹', text: '她五指猛地扣緊他胸口，身子隨那狠頂的力道重重一沉，腰胯死死碾住他往深處絞吞，汗珠順著下頷砸落他鎖骨，喉間那聲本要碎裂的啞吟被她生生咬作一聲又高又亮的拔高尾音，硬生生撞穿鋪板悶響，逼進暗夜裡去' },
    { name: '江聞鶴', text: '他腰腹那股蠻勁被她這聲亮音徹底砸穿，渾身筋骨猛地一顫，掐在她腰側的十指死死收緊將她整個人往懷裡一掼，胸膛貼著她汗濕的脊背，下頜抵著她後頸，咬著牙將那最深的一頂全數搗進去，喉底溢出破碎的濁啞氣音：「連翹——這聲，我接了。」' },
];

async function main(): Promise<void> {
    const cast = buildCast(['江聞鶴', '連翹']);
    const { RunnerSceneAgent } = await import('../../src/adapters/runner-scene-agent.ts');
    const agent = new RunnerSceneAgent();
    const woven = await agent.weaveTickChapter({
        clock: '第2日·深宵',
        lines: BEATS.map((b) => `[${VENUE}] ${b.name}：${b.text}`),
        castBodies: cast.map((c) => ({ name: c.name, bodyFact: c.bodyFact })),
    });
    if (!woven) throw new Error('weave returned null');
    console.log('── 織回（說書人）──\n');
    console.log(woven);
}

main().catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
});
