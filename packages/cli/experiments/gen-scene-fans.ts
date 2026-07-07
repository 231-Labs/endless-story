/**
 * Generate handscroll fan art for scenes that have none (one-off asset run).
 * Style = the preset's art_style; square 1:1 (SceneFan clips to a circle).
 *
 *   pnpm --filter @endless-story/cli exec tsx --env-file=../web/.env.local experiments/gen-scene-fans.ts
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as url from 'node:url';
import { createImageClient } from '@endless-story/llm/image';

// 郎世寧 half-Western oil — MUST match the location paintings (o-*.jpg) + the
// already-correct fans (s-yunjintai-tai etc.), not the old 工筆 silk look.
const STYLE =
    '郎世寧半西洋油彩畫風：中西合璧的清宮油畫感，細膩寫實的光影立體、溫潤古典的油彩設色、柔和側光塑形，質地厚潤如陳年絹本油畫；1930 年代民國上海的場景';
const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '../../web/public/handscroll');

const FANS: Array<{ file: string; name: string; desc: string }> = [
    { file: 's-changsan.jpg', name: '長三堂子花廳', desc: '會樂里長三堂子的花廳，紅木桌椅、水煙與琵琶，簾外人影往來' },
    { file: 's-shuyu.jpg', name: '二樓書寓', desc: '樓上書寓，茶煙與算盤，窗欞漏進午後的光，桌上攤著戲約與銀票' },
    { file: 's-xiangxian.jpg', name: '鄉賢正堂', desc: '紹興會館的正堂，匾額楹聯、太師椅與香案，鄉音繚繞' },
    { file: 's-houjin.jpg', name: '後進廂房', desc: '會館後進的廂房，一床一桌一箱籠，窗外天井竹影' },
    { file: 's-xiaoxiangfang.jpg', name: '後台小廂房', desc: '後台盡頭的小廂房，一盞燈一張榻一面舊鏡，門閂半落' },
    { file: 's-jinfeng.jpg', name: '金鳳寓所', desc: '會樂里的歌女寓所，梳妝台、留聲機與一架舊琵琶，繡簾半掩' },
    { file: 's-shenzhai.jpg', name: '沈宅小樓', desc: '戲園後身的兩層小樓，樓下帳冊筆墨，樓梯轉角一盞孤燈' },
    { file: 's-datongpu.jpg', name: '戲班大通鋪', desc: '後台頂樓的大通鋪，被褥挨著被褥，牆上掛滿練功的靠旗與水袖' },
    { file: 's-baigongguan.jpg', name: '白公館繡樓', desc: '綢緞大莊的繡樓，緞面成匹、留聲機與妝匣，滿室安靜的體面' },
    { file: 's-gelou.jpg', name: '報館閣樓', desc: '報館樓上的小閣樓，稿紙剪報堆疊，一盞煤油燈，牆角鋪蓋捲' },
];

async function main() {
    const client = createImageClient();
    for (const f of FANS) {
        const dest = path.join(OUT, f.file);
        if (fs.existsSync(dest)) {
            console.log(`skip ${f.file} (exists)`);
            continue;
        }
        const prompt = `${STYLE}。空景無人的場景：${f.name}——${f.desc}。構圖居中、留出圓形裁切的餘裕；畫面無任何文字、題字、書法、印章、標籤、邊框或浮水印。`;
        try {
            const res = await client.generate({ prompt, aspectRatio: '1:1', n: 1 });
            const b64 = res.images[0]?.base64;
            if (!b64) {
                console.warn(`FAIL ${f.file}: no image`);
                continue;
            }
            fs.writeFileSync(dest, Buffer.from(b64, 'base64'));
            console.log(`✓ ${f.file} (${Math.round(Buffer.from(b64, 'base64').length / 1024)}KB)`);
        } catch (err) {
            console.warn(`FAIL ${f.file}:`, err instanceof Error ? err.message : err);
        }
    }
}

main();
