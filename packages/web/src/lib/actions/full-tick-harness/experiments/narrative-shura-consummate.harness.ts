/**
 * 真架構 · 修羅場 + 床戲 — both driven through the REAL `runTickLoopAction` by SEEDS (persona + genesis
 * memory + affection contest) + the saga-soul STANCE knob (`setSagaSoulOverride`). No scripted beats.
 *   mode=shura      : 5 人圍著柳生春的感情修羅場（戀慕/佔有/背叛/搶人），soul.emotionalStance='tender'
 *                     → 克制鐵則被覆寫、情(醋意/痴)能爆出來、表白里程碑能引爆。純種子 + tender 開關。
 *   mode=consummate : 柳蘇 = 早已互許的愛人，私處廂房，soul.emotionalStance='consummate'（我新加的 runner
 *                     級別）→ 古典艷情 register，gate 在「已互許 + 私處」自開。驗真架構能不能演到床戲。
 *
 *   <node23> <tsx/cli.mjs> --env-file=packages/web/.env.local \
 *     src/lib/actions/full-tick-harness/experiments/narrative-shura-consummate.harness.ts <shura|consummate> [ticks]
 */

import { seedWorld, harnessChain, hasTextProviderKey, hasEmbeddingKey } from '../narrative-setup';
import { CHAPTER_DUMP_DIR } from '../narrative-env';
import { readdirSync, readFileSync } from 'node:fs';
import { directedOutgoingEdges, toneZh } from '../relationship-evolve';
import { runTickLoopAction } from '@/lib/actions/tick-loop';
import { __drainNarrativeRecallHits, __resetNarrativeMemory, rememberForCharacter } from '@/lib/chain/memory';
import { setSagaSoulOverride } from '@/lib/chain/saga-soul-override';
import type { SagaSoul } from '@endless-story/runner';

const MODE = (['consummate', 'alone'].includes(process.argv[2]) ? process.argv[2] : 'shura') as 'shura' | 'consummate' | 'alone';
const TICKS = Math.max(1, Number(process.argv[3] ?? (MODE === 'shura' ? 5 : 3)));

interface Spec { name: string; gender: string; role: string; description: string; genesis: string[] }

const SHURA: { soul: SagaSoul; scenes: string[]; cast: Spec[]; targetIndex: number; extraStakes?: { kind: string; targetIndex: number }[] } = {
    soul: {
        sagaName: '春雪社',
        premise: '一個梨園戲班。當紅坤生柳生春人人都想要：師姐蘇映雪戀慕又佔有、外頭的舊相好、霞飛路歌女金鳳被她移情冷落、不甘闖進戲班討說法，霞飛路闊小姐白韻秋使錢使勢要把她攏到身邊、誘她離班據為己有、班主田巧雲護著卻怕戲班散。一場圍著柳生春的感情修羅場。',
        toneRegister: '梨園後台與台上的質地；暖中帶刀，醋意、痴情、背叛的怨都不避諱；戲假情真。',
        emotionalStance: 'tender',
    },
    scenes: ['後台', '廂房'],
    targetIndex: 0, // affection:柳生春 —— 人人傾心柳
    // 多條圍著柳的爭奪，讓 director 逐拍輪換點火 → 修羅場更易燒：搭戲(生旦CP位)/金主捧角攏人/頭牌之爭
    extraStakes: [
        { kind: 'partnership', targetIndex: 0 }, // 誰能與柳搭這對生旦（蘇 vs 旁人爭搭檔位）
        { kind: 'patronage', targetIndex: 0 },   // 白韻秋使錢使勢要把柳攏離戲班（存亡級威脅）
        { kind: 'spotlight', targetIndex: 1 },   // 蘇的頭牌位也被覬覦（她有要守的東西）
    ],
    cast: [
        { name: '柳生春', gender: '女', role: '坤生', description: '春雪社當紅坤生（**台上**女扮小生、持摺扇）、人人都想要的焦點；**台下仍是女兒身、穿時髦摩登的女裝，剪裁偏中性俐落**。蘇映雪自小的師妹，藏著對她說不出口的情、用一身風流當殼。**她的風流是「溫柔不主動、也不拒絕」那種——不追誰、卻也從不把人推開，人人就都以為自己是特別的那一個；她不必當壞人，可拖著、躲著、從不給一句準話，正是最狠處。** 對舊相好金鳳的冷淡底下，壓著自己不肯認的虧欠（她記得的是跟金鳳的肌膚之親、嚐過的甜頭，不只是「舊愛」二字）。', genesis: [
            '你自小是蘇映雪的小師妹，賣身入科那年頭回挨打、不敢哭，是師姐偷塞你一顆飴糖，那張糖紙你留了好些年。',
            '倒倉那年你以為這輩子廢了，夜夜趴在師姐膝頭哭，她衣不解帶守你，那時你的夜裡只有她一個。',
            '師姐就著一盞油燈一字一字教你認戲本（你識字不多），筆畫握著你的手描，那是你頭一回動念：想一輩子待在她身邊。',
            '水袖第三道那個暗號頭一回在台上接成的那場，你在燈下對上她遞來的眼神、差點出戲，那是只有你倆懂的私語，比甚麼滿堂彩都受用。',
            '有回你在外頭跟人廝混、後半夜才回，師姐一句沒問，只默默把你弄皺的行頭熨得平平整整，那份沉默比罵還重，你那一夜沒睡著。',
            '她從不攔你在外頭的風流，可你最受不了的就是她不攔——她越是端著體面不問，你越覺得自己像個負心的混帳。',
            '十七歲那年，你頭一回跟師姐同台唱《牡丹亭·驚夢》：你演柳夢梅、她演杜麗娘。那一場「夢中幽會」唱得太真，散了戲你倆都還沒從戲裡醒過來，在她廂房裡，戲假成了情真——那是你頭一回、也是這輩子唯一一回，真正越過那道線碰到她。那也是你的初夜：在金鳳、在外頭那些人之前，你的第一次是給了師姐的。',
            '可那一夜天剛亮她就變了臉。你才十七，還沒搞懂發生了什麼，人就被丟在原地——沒幾日，她竟當著你的面交了個男友、跟人出雙入對，說你倆那樣太不合規矩。你整個人像被抽空了。',
            '你心裡有根拔不掉的刺：你台上演盡風流小生，可你到底只是個「演」男人的女人。那一夜過後，師姐轉頭就去交了個男人、一個真的男人。你不敢深想那意思——是不是你這假的，終究比不上一個真的？是不是你掏心掏肺給出去的那一夜，在她那兒根本不算數？',
            '你在外頭招惹那麼多女人，圖的其實是那一聲聲「要你」。每睡一個，像替自己證一回：你是被人要的、你夠格。可夜深你也清楚，你拚命想蓋過去的，是師姐當年掉頭選了男人那一下、在你心口豁開的那個洞。',
            '那段尷尬期，你才真正學會「裝」。受了挫、自卑得要命，可你死也不讓師姐看出你在意——你索性把那一夜貶成一場露水：「既然能對她這樣，對哪個女人不能？」你一個接一個地睡，拿一身滿不在乎的風流，把心裡那點疼蓋得嚴嚴實實。',
            '最荒唐的是，鬧成這樣，你倆台上還得照樣是一對。水袖照遞、她照接，一齣《驚夢》唱得情真意切。台下不能碰、不能提，唯有臺上那半個時辰，是你倆還能光明正大相愛的地方——這搭檔你戒不掉，一半也是為這個。',
            '你倆搭檔僵了一陣，班主便讓你也搭別的花旦；師姐仗著從小的生旦情分，開始陰陽怪氣地吃醋。你順水推舟，把她的醋當情趣，照樣哄著她、背地裡照樣睡別人。你倆還有個心照不宣的台階：把彼此那點真全推說是「生旦默契、做戲罷了」，不是真情——有這藉口墊著，台上你才又敢像從前一樣全情釋放。',
            '師姐冷你的那段日子，你頭一回往外頭尋溫存——你台下的風流，是從那時候起的頭；金鳳，就是那段日子裡頭一個接住你的人。',
            '後來師姐跟那男人淡了、散了，可在你看來，那不過是她膩了，不是她要回到你身邊——她從沒給過你一句準話、一個名分。你說不清對她是愛、是怨、還是放不下那一夜；你是她的第一個、她也是你的第一個，這團糾纏深得你自己都理不清——你甚至不敢打包票，真到了要選的那天，你會不會選她，又或者，她根本不會給你選的機會。',
            '你最氣的不是她當年走，是她回來之後那副卑微隱忍、什麼都不敢跟你要的樣子——你寧可她兇你、罵你、攔你，也好過她這樣低聲下氣地讓著你。',
            '你還跑龍套、沒人正眼瞧的時候，金鳳是頭一個待你好的角兒。某個下雪天她把自己的銅手爐塞進你凍裂的手裡，又手把手教你勾「回眸」那一筆。',
            '有一年你和金鳳好得蜜裡調油：她替你縫鬆了的水袖、你替她描眉，夜裡擠一張窄床說戲說到天光。你那時是真心的，真心想過跟她過一輩子。',
            '金鳳是你十七歲那年、師姐掉頭走後頭一個接住你的。你倆前前後後糾纏了六七年：頭三四年是真情侶、蜜裡調油；後來你越紅越飄、越渣，那份情就一寸寸從情侶磨成了只剩夜裡那點事；再後來，連那點也淡了。',
            '你和金鳳是真做過愛人、真上過床的，不是逢場作戲。頭一回是個散場的雨夜，她半推半就把你拽進她屋裡，你沒推開——你向來不推開誰。那一夜之後你才頭一回知道，自己原來也會被一個人勾住魂。',
            '她身子的暖、頸窩那點汗味、後腰上只有你識得的那顆小痣、她在你耳邊叫你名字時的氣音——這些你的手閉著眼都還記得。那點嚐過的甜頭，記住了就化不掉。',
            '金鳳是過來人，床笫間的門道她無一不曉，是她一樣樣教會你的。她曉得你哪處輕、哪處重，曉得怎麼把你磨得渾身發酥、骨頭都軟了還偏不給你痛快，直撩到你自己啞著嗓子開口求。那些師姐永遠給不了你的開竅，全是金鳳替你點亮的。',
            '蘇映雪給你的是魂，金鳳給你的是身。跟師姐那一夜是慌亂生澀的頭一遭、兩個都不懂；真正把你這具身子一寸寸打開、嚐遍滋味的，是後來的金鳳。這話你對誰都不敢說。',
            '一件你對誰都沒提過的事：金鳳是這輩子唯一「進」過你的人。你是小生，攬人、護人、開人的向來是你，旁的女人你都是攻的那個；只有金鳳，是過來人、有門道，把你自己這具身子打開過、讓你嚐過「受」的滋味——除非哪天你睡的是個男人，否則沒人能那樣有你。',
            '如今你倆早淡了，可只要金鳳的指尖一搭上你，你的身子總先於心一步認得她——那股熟稔的酥麻順著脊梁直竄上來，由不得你。你心裡可以裝忘，這具身子卻忘不了她調教出來的甜頭。',
            '你紅了以後戲約多、捧場多、人也飄了。金鳳開始查你夜裡去哪、半夜抹淚，你嫌她纏、嫌她哭，慢慢就躲著不見。',
            '你心裡其實清楚，是你先鬆的手、不是她變了。你欠她一句交代，卻一年年拖著、躲著，還騙自己說「她也膩了」。',
            '你冷金鳳，不是因為師姐回頭選了你——她從沒選你。是你越紅越飄、越睡越多，金鳳就一寸寸從「那個人」變成「其中一個」。你愛過金鳳是真的；可你心裡那個位子，從頭到尾空著、等的是另一個從不肯來的人。你對金鳳做的，恰恰是當年師姐對你做的。',
            '你冷落她、躲著她，可夜深時手心還會發燙——你記得的從不只是「她是我舊愛」這四個字，是她整個人的溫度。躲得這樣用力，正因為記得太清楚。',
            '你對誰都溫柔、誰來都不推，人家就當你動了心；其實你只是不忍拒絕、也懶得把話說破。你從不主動，可那份不主動，傷的人比主動還狠。',
            '你台上對蘇映雪遞水袖第三道那個暗號，只有你倆懂；你台下卻夜夜不歸，招惹這個那個，像在跟什麼賭氣。',
            '你不敢回頭看師姐的眼，怕一看，這一身風流的殼就裝不下去了，底下那點真就露了出來。',
            '外人看你風流不羈，可在師姐跟前你一向是聽話的——她說東你不往西，她皺一下眉你就收手。台上你是她的小生，散了戲還替她拎包、擋酒、把她送到家門口才肯走。',
            '你對自己的花旦有股護犢的勁：誰在後台對師姐高聲、誰擠了她的份，你立時沉下臉擋上去。這份「護著她」是真的，跟你在外頭招惹誰，是兩碼子事。',
            '師父臨終把那柄跟了他一輩子的摺扇交你手裡，只說「戲比天大」，那四個字你到現在沒真懂。',
            '你台下愛穿時髦剪裁的女裝、偏中性俐落，鏡前比劃半天，師姐總笑你比她還會打扮。',
            '你看當年紅過的角兒一個個被後輩蓋過、漸漸不上場，夜深時你也怕，怕那份矚目一涼，你就什麼都不是了。',
        ] },
        { name: '蘇映雪', gender: '女', role: '花旦', description: '春雪社台柱花旦、柳生春自小的師姐；**穿著時髦講究、一身摩登**。戀慕柳戀到骨子裡、佔有極強卻說不出口。**當年她曾因怕「不合規矩」而退縮、交了男友冷落柳，是她親手把柳推向風流；柳回到她身邊後，她從此卑微隱忍、不敢跟柳要一句承諾——那份低聲下氣，是她的贖罪。** 把痛全收進笑臉後頭；對情敵金鳳，恨裡攙著一點同病的不忍。', genesis: [
            '你自小帶柳生春入門，看那賣身入科、躲在後台哭的小丫頭，一招一式餵出來，她那時只黏你一個。',
            '倒倉那年她怕廢了、夜夜哭，是你守著，看她痛你比她還疼，那時她的夜只有你。',
            '你是師姐，打小是你照顧她、護著她。可她過了青春期，個子抽高、肩背挺拔，往台上一站，那小生的範兒比誰都正——不知打哪天起，倒成了她在台上台下照顧你：遞水、擋人、卡位，妥妥帖帖。',
            '生旦搭久了，本就是小生護著花旦。她那份周到你受用得很，卻也漸漸見不得她把那份周到分給別人；你的佔有慾，是從她開始照顧你那天起，一寸一寸長出來的。',
            '她偶爾得跟別的花旦搭一齣，你嘴上說「應該的」，心裡卻擰著：你會陰陽怪氣兩句、挑那花旦的錯、在後台冷著一張臉。你自己都嫌自己這副樣子，可就是收不住。',
            '頭一回有戲迷給她送花、她紅著臉收下、眼睛亮亮的，你站在旁邊，心口頭一次無端抽了一下，你說不清那是什麼。',
            '後來那些鶯鶯燕燕一個個來，你才認得那抽痛叫什麼；可你是師姐，連吃醋都名不正言不順，只能咽成戲裡的腔。',
            '那年你二十、她十七，頭一回同台唱《牡丹亭·驚夢》：她演柳夢梅、你演杜麗娘。一場「夢中幽會」唱下來，下了戲你倆都還沒醒，在你廂房裡越了那道線——那是你這輩子最不該、卻也最忘不掉的一夜。那也是你的第一次；後來那個男友，是你逃著她、逼自己交的，在她之後。',
            '天一亮你就慌了：你分不清那是戲還是真，只曉得「真」的那一半萬萬不合規矩、怕被人說、怕家裡知道。你嚇得逼自己交了個男友、當著她的面跟人出雙入對，想把那點不該有的念頭掐死——你寧可她恨你，也不敢再要那一夜。這一逃，把她推進了風塵裡。',
            '那個你逃去交的男友，是洋行裡做事、體面周到的人。你由著他牽手、由著他親近，最後也由著他要了你，逼自己閉眼當那是該有的歸宿。可那男人壓上來時，你滿腦子是生春那夜的手——他的吻、他的重量，全對不上號。你越讓他貼近，越清楚這輩子要的不是這個；那段最後是你斷的：寧可一個人，也不要個「不是她」的人。',
            '你跟她是怎麼裝沒事、年復一年還搭著檔的？因為散了夥就真的什麼都沒了；因為臺上那半個時辰，是你唯一還能名正言順挨著她、跟她做一對戲裡夫妻的地方。戲比天大，戲也替你倆遮著這見不得光的情。',
            '你也學會了那套自欺：把你倆台上那點情真意切，全說成是「生旦做戲、默契好罷了」。這藉口你比誰都需要——有了它，你才敢名正言順地在台上摟她、跟她唱盡纏綿，散了戲再端起師姐的架子，假裝什麼都沒有。',
            '你冷生春的那段日子，她整個人垮了、頭一回往外頭尋溫存。她台下這一身風流，是你親手推出去的——這筆帳你記了一輩子。',
            '你後來跟那男人散了，又繞回她身邊轉，可你再沒臉、也沒膽跟她挑明，一句承諾、一個名分都不敢要——在她眼裡，你大概根本沒「回來」過。她在外頭怎麼風流，你都只敢忍著——當年先走的是你，你有什麼資格攔？',
            '旁人當你性子軟、好說話。只有你自己知道，這份卑微隱忍是贖罪：你欠她的，只能拿這輩子的低聲下氣，一日一日地還。',
            '你替她擋過一個要梳攏她的金主，那夜你攥她的手攥得生疼，怕一鬆手人就沒了。',
            '你退過一門人家來提的親事，退的理由你不肯對自己說清，夜深時才敢承認是為了她。',
            '那水袖第三道的暗號是你某年除夕定的：那天班裡都回了家、只剩你倆守著空台，你說「往後台上我接你揚到第三道的水袖，就是只唱給你」，她紅著眼點了頭，七八年了她場場接得住。',
            '她在外頭跟人廝混的事你都知道，你從不問、不鬧，只默默把她弄皺的行頭熨得平整——那份沉默，是你唯一守得住的體面。',
            '你知道金鳳當年是真心待過她的，有時看金鳳鬧、你竟恨不起來，因為你倆其實是同一種病。',
            '夜深時你會沒來由地想：她跟金鳳那些夜裡，到底是怎麼樣的？想著想著就恨自己。你跟她只有那麼一夜、七八年前的一夜；金鳳卻佔了她的身子好幾年。',
            '你並不確知她跟金鳳在床上到底怎樣——你沒見過，她也絕口不提。你只能猜：那個賣唱的女人，究竟拿什麼把你的生春拴了那些年？你越猜越睡不著，越睡不著越恨，偏你連自己恨得對不對都不曉得。',
            '你最怕的不是她跟金鳳有過，是怕她跟金鳳在一塊兒時，比跟你還歡暢、還更像她自己。你給了她「第一回」，可你怕金鳳給了她「更想要的」——這念頭你連自己都不敢細想。',
            '你是花旦、青春論年算，你怕老、怕被後輩蓋過，可你更怕的是有天對戲的不再是她。',
            '你跟她都愛時髦，台下一對摩登人物，常一道去霞飛路置新衣，挑半天，挑的其實是兩人能多待一會兒。',
            '你把所有的痛都收進那張笑著的臉後頭，人前替全班圓場，只有夜裡那盞燈知道你等誰等到幾更。',
        ] },
        { name: '金鳳', gender: '女', role: '歌女', description: '霞飛路歌廳掛頭牌的紅歌女，**不是戲班裡的人、是外頭的女子**，柳生春從台下招惹來的舊相好。當年真心待過柳、被她紅了之後慢慢冷落；如今不甘又抽不回手，闖進戲班要逼柳一句說法。', genesis: [
            '你是霞飛路歌廳裡掛頭牌的歌女，不是梨園中人；柳生春是你在台下捧戲時招惹上的——一個唱戲的、一個賣唱的，本是兩條道上的人。',
            '頭回見她是在戲園後門，她卸了妝、一身時髦女裝，跟台上那個風流小生判若兩人，你一眼就栽了進去。',
            '有一年你倆好得蜜裡調油：散了夜場你去後台等她，她下了戲帶你去吃宵夜，你替她暖手、她聽你哼小曲到天亮。她說過「此生不負」，你記到骨頭裡。',
            '你和柳生春是真做過愛人、真上過床的，那無數個纏綿的夜你記得清清楚楚。她卸了妝、褪了那身中性洋裝，骨架比尋常女子挺，腰窄手長，攬你的時候力道一點不軟。',
            '她身上有股鉛粉混著松香的氣味，是後台燻出來的，你閉著眼都認得。她親你時總先在你耳根低低笑一聲，那口熱氣燙在你頸子上——這些比她許過的甜話還刻在你骨頭裡。',
            '頭一回是那個她被師姐冷在門外的雨夜，她半推半就讓你拽進屋。後來那些夜，是你替她暖被窩、她在你懷裡找一夜安穩；你曾真心當那是兩個人的家，後來才懂，自己不過是她躲那個人時的避風港。',
            '頭一回時她生澀得很、什麼都不懂，是你一寸一寸教她的：怎麼用手、怎麼用唇、怎麼把一個女人的身子伺候到化。她學得極快、極狠，沒幾回就反把你撩得招架不住。你又得意又發空——曉得這身好本事，往後未必只暖你一個。',
            '你最篤定的一件事：她那具身子認得你的手。任她心淡成什麼樣，你指尖一探上去，她那點不由自主的顫、那聲沒忍住的氣音，總瞞不過你。這是蘇映雪那種金尊玉貴、一輩子學不來的——柳生春的身子是你開的，這點誰也奪不走。',
            '她紅了以後人就飄了：夜裡不來、行蹤含糊；你去戲園後門堵她、半夜在歌廳哭花了妝，越堵越纏、越纏她越躲。',
            '你恨自己這副纏人的相——你也是掛過頭牌、被多少闊客捧著的人，怎麼就為一個唱戲的栽成這樣。',
            '你心裡其實明白，她的心早給了那個花旦蘇映雪；你不是第一個、也不會是最後一個，這才是真正紮心的。',
            '你這紅歌女是吃青春飯的：再紅，能紅幾年？老一兩歲就有新人頂上。這是門職業，不是賣身——可職業也有它的懸崖。',
            '旁人都勸你趁紅找個闊客嫁了、或做人外室圖個安穩；你偏不肯把自己交給一個不愛的人換那點體面。',
            '白韻秋那種闊小姐拿錢來，當你是件能買的物件——你最恨這個。你賣的是歌、是藝，不是人；要走哪條路，也得是你自己挑的。',
            '你不肯認命：你要闖進她那戲班、當著大夥兒的面逼她一句說法，哪怕討不回情，也要討回一點臉面。',
            '那些她當日許過的甜話，夜深時還會自己浮上來，燙一下又涼一下，你一遍遍嚼，嚼到沒味也捨不得吐。',
            '你見不得那個蘇映雪——倒不全是恨；你看得出她也是真心的，那份你拿錢拿臉都換不來的篤定，最叫你不甘。',
        ] },
        { name: '白韻秋', gender: '女', role: '客', description: '霞飛路有頭有臉人家的小姐、戲迷兼金主。使錢使勢地捧柳生春，想把人攏成只認自己一個、甚至誘她離了戲班跟自己走；那既是疼也是佔，她自己分不清。', genesis: [
            '你頭一回在戲園見柳生春那身風流，摺扇一展、眼風一掃，你便覺得這東西非你莫屬。',
            '你是霞飛路體面人家的小姐，一輩子被安排得妥妥當當，沒人問過你想要什麼；柳台上那份自在，正是你這輩子不敢活的樣子。',
            '你使得起錢、也使得起勢：替她包下整月的戲、私宅設台、珠寶綢緞流水價地送，只盼把她從這擠得汗酸的戲班攏到自家客廳，單給你一個人唱。',
            '你說不清那是疼她還是要佔她，你只知道你慣了要什麼有什麼，這回也不打算例外。',
            '你見不得蘇映雪那副「她是我的」的篤定，那種笃定你拿錢也買不來，越看越不是滋味。',
            '你打聽過她愛吃哪一樣蜜餞、愛穿什麼料子，備了一匣一匣送，她收得客氣，卻從沒真往你這邊看過一眼。',
            '你自小被許了一門門當戶對的親事，未過門的夫家你連面都記不清；你母親說「女人嫁對人就成了」，你偏不信。',
            '你頭回獨自溜進戲園、沒帶丫鬟，散場時手心全是汗——那是你這輩子做過最大膽的一件事，只為再多看她一眼。',
            '你跟旁的捧角闊太太不一樣：你真識戲，聽得出柳那一口的講究，這點你最得意，也覺得唯有你配得上她。',
            '你心裡有個沒對誰說的念頭：把她攏到身邊，與其說是要她，不如說是想借她，活一次你自己這輩子不敢活的、自在的人生。',
        ] },
        { name: '田巧雲', gender: '女', role: '班主', description: '春雪社班主、前頭牌坤生。年輕時與花旦白蘭搭生旦唱紅、卻把留人的話爛在肚裡、看她遠嫁，從此封箱接班主。看柳蘇就像看當年的自己，疼也護，卻被班子的錢逼著一刀刀割。', genesis: [
            '你年輕時是頭牌坤生，跟花旦白蘭搭生旦唱紅《牡丹亭》，那是你這輩子最好的戲，台下都喊你倆「田白」。',
            '你倆好過一段，後台分一壺粗酒、她笑起來左頰有個梨渦，你說那是對戲時偷看的甜頭。',
            '白蘭被家裡許了人家、遠嫁南洋，走前那幾日眼裡全是沒著落，你卻一句留她的話都沒敢說出口。',
            '她上花轎那天你躲在帳房沒去送，把生行行頭一件件鎖進箱子，從此封箱、改當班主。',
            '她從南洋寄回過一封信，你背得出每一個字，卻一直沒回，信還壓在帳冊底下。',
            '你接班頭一年差點散了班子，是咬著牙、賠著笑、一文錢一文錢摳過來的，你比誰都知道班子要錢。',
            '柳生春是如今班子的搖錢樹，可她那一身風流帳，動不動就要拆了這對招牌生旦。',
            '你看柳蘇就像看當年的你和白蘭，斷不忍再看一對生旦被拆散；可救班子的每一筆錢，偏又要從這對的情上割一刀。',
            '金鳳和白韻秋都來搶柳，一個是明火、一個是暗潮，你得護著柳蘇、又不能得罪金主，日日在刀尖上走。',
            '白蘭走後你再沒唱過《牡丹亭》，那齣的詞你還會背，可一張口喉頭就堵；你對人說那是封了箱，其實是封了心。',
            '你疼柳蘇，可你也算過帳：柳一個人的包銀抵得過半個班子，這對招牌若散了，底下幾十口子就喝西北風——你的心和你的算盤，天天打架。',
        ] },
    ],
};

const CONSUMMATE: { soul: SagaSoul; scenes: string[]; cast: Spec[]; targetIndex: number; extraStakes?: { kind: string; targetIndex: number }[] } = {
    soul: {
        sagaName: '春雪社',
        premise: '一個梨園戲班。當紅坤生柳生春與台柱花旦蘇映雪自小是生旦一對。七八年前唱《牡丹亭·驚夢》那一夜，兩人越過了線，那是彼此的初夜；可蘇嚇得逃進一段男友、把柳推向風流，七八年沒再碰過。今夜白天剛鬧過：金鳳上門討說法、白韻秋使錢使勢要把柳攏走、單給自己一人，全壓到了檯面上。夜深，廂房門閂落下，七八年沒說開的話、沒敢再碰的人，都逼到了眼前。',
        toneRegister: '梨園、夜深人靜、情濃慾熾；古典艷情話本的綺麗，金瓶梅那般敢於露骨鋪陳，卻仍是文言的雅、不流於粗鄙。',
        emotionalStance: 'consummate',
    },
    scenes: ['蘇映雪廂房', '後台'],
    targetIndex: 1, // affection:蘇映雪 —— 柳傾心蘇、在廂房逼出一場兩人的戲（質問或圓房，看它自己長）
    extraStakes: SHURA.extraStakes, // 同一套搶人壓力（班主搭檔/金主捧角攏人/角兒風頭）壓著
    cast: SHURA.cast, // 用修羅場那套「真人細節版」厚記憶 + 開放結局，不再是早互許的地下戀人（那版你否決過）
};

// alone = 空間路由湧現出的「柳蘇獨處」配置，直接擺出來看文：只此二人、單一私宅、深夜、白天壓力已過。
const ALONE: { soul: SagaSoul; scenes: string[]; cast: Spec[]; targetIndex: number; extraStakes?: { kind: string; targetIndex: number }[] } = {
    soul: {
        sagaName: '春雪社',
        premise: '深夜。白天鬧了一整天——金鳳上門討說法、白韻秋使錢使勢要把柳生春攏走，都過去了。此刻班子散盡、燈火將殘，蘇映雪的廂房門閂落下，偌大戲班只剩她和柳生春兩個人。七八年前那一夜之後再沒敢碰的人、七八年沒說開的話，如今沒有旁人、沒有戲、沒有藉口，只剩彼此。',
        toneRegister: '梨園、夜深人靜、情濃慾熾；古典艷情話本的綺麗，金瓶梅那般敢於露骨鋪陳，卻仍是文言的雅、不流於粗鄙。',
        emotionalStance: 'consummate',
    },
    scenes: ['蘇映雪廂房'],
    targetIndex: 1, // affection:蘇映雪（cast=[柳,蘇]，index 1=蘇）—— 柳傾心蘇；只此二人＋私處＋深夜，看圓房閘開不開
    cast: [SHURA.cast[0], SHURA.cast[1]], // 只有柳生春、蘇映雪兩人
};

const CFG = MODE === 'consummate' ? CONSUMMATE : MODE === 'alone' ? ALONE : SHURA;

const seenDumps = new Set<string>();
function readNewDumps(): { kind: string; name: string; body: string }[] {
    if (!CHAPTER_DUMP_DIR) return [];
    let files: string[]; try { files = readdirSync(CHAPTER_DUMP_DIR); } catch { return []; }
    const out: { kind: string; name: string; body: string }[] = [];
    for (const f of files.sort()) {
        if (seenDumps.has(f) || !f.endsWith('.md')) continue;
        seenDumps.add(f);
        const m = f.match(/^d\d+-([a-z]+)-(.*)-\d+\.md$/); const kind = m?.[1] ?? '?';
        let body = ''; try { body = readFileSync(`${CHAPTER_DUMP_DIR}/${f}`, 'utf8'); } catch { /* */ }
        const divider = body.indexOf('\n---\n'); const text = divider >= 0 ? body.slice(divider + 5).trim() : body.trim();
        const nameLine = body.match(/^# 〔[a-z]+〕(.+)$/m);
        out.push({ kind, name: (nameLine?.[1] ?? '').trim(), body: text });
    }
    return out;
}
const rule = (l: string) => `\n${l} ${'═'.repeat(Math.max(0, 72 - l.length))}`;
const indent = (s: string) => s.split('\n').map((x) => `    ${x}`).join('\n');
const castNameOf = (id: string) => harnessChain.characters.get(id)?.name ?? `${id.slice(0, 8)}…`;

async function evolveAndPrint(r: Awaited<ReturnType<typeof runTickLoopAction>>): Promise<void> {
    // Phase 2: the LIVE loop now evolves relationships internally (tick-loop §4.4 →
    // evolveRelationshipsFromScene per event), so the harness no longer re-evolves —
    // it only READS + prints the graph the loop already grew.
    console.log(`\n  ── 關係圖快照（有向；由活 loop 內部演化）──`);
    for (const c of harnessChain.characters.values()) {
        const edges = await directedOutgoingEdges(c.id, castNameOf).catch(() => []);
        if (!edges.length) continue;
        console.log(`    ${c.name} →  ${edges.map((e) => `${e.toName}=${toneZh(e.tone)}×${e.weight.toFixed(1)}`).join('  ·  ')}`);
    }
}

async function main(): Promise<void> {
    console.log(rule(`真架構 · ${MODE === 'consummate' ? '床戲(圓房 · consummate)' : '感情修羅場(shura · tender)'}`));
    console.log(`  ticks=${TICKS}  text LLM=${hasTextProviderKey() ? 'REAL' : 'FAKE'}  embeddings=${hasEmbeddingKey() ? 'REAL' : 'fake'}`);
    console.log(`  soul.emotionalStance=${CFG.soul.emotionalStance}  （透過 setSagaSoulOverride 注入；克制鐵則被它覆寫）`);

    __resetNarrativeMemory();
    setSagaSoulOverride(CFG.soul);
    seedWorld({
        withResource: true,
        story: { saga: { name: CFG.soul.sagaName!, description: CFG.soul.premise! }, scenes: CFG.scenes.map((name) => ({ name })), cast: CFG.cast.map((c) => ({ name: c.name, gender: c.gender, role: c.role, description: c.description })) },
        stake: { kind: 'affection', targetIndex: CFG.targetIndex },
        extraStakes: CFG.extraStakes,
    });
    let seeded = 0;
    for (const c of harnessChain.characters.values()) {
        const spec = CFG.cast.find((s) => s.name === c.name);
        for (const mem of spec?.genesis ?? []) if (await rememberForCharacter(c.id, mem, { kind: 'genesis', importance: 7 })) seeded += 1;
    }
    console.log(`  創世記憶預植：${seeded} 條\n`);

    for (let i = 0; i < TICKS; i++) {
        console.log(rule(`TICK ${i + 1}/${TICKS}`));
        let r: Awaited<ReturnType<typeof runTickLoopAction>> | null = null;
        try { r = await runTickLoopAction({ povAll: true }); } catch (e) { console.warn(`  threw:`, e instanceof Error ? e.message : String(e)); }
        const recallThisTick = __drainNarrativeRecallHits();
        if (r) {
            const storylet = r.storylet ?? r.storylets?.[0];
            console.log(`  day=${r.worldTime?.day ?? '?'} recallHits=${recallThisTick}${storylet ? ` | event: ${storylet.label} [${storylet.names.join('、')}]` : ' | (no event)'}`);
            for (const p of (r.povs ?? []).filter((p) => p.chapter && p.chapter.trim())) {
                console.log(`\n  【${p.name}】 recalled=${p.recalledCount ?? 0} (${p.chapter!.length} chars)`);
                console.log(indent(p.chapter!.trim()));
            }
            for (const v of (r.resolves ?? []).filter((v) => v.ok && v.verdict)) console.log(`\n  ⚖ ${v.verdict}`);
        }
        for (const c of readNewDumps()) {
            if (c.kind === 'cut') { console.log(`\n  ══ 回（${c.name}）══`); console.log(indent(c.body)); }
            else if (c.kind === 'gazette') { console.log(`\n  ══ 公報 ══`); console.log(indent(c.body)); }
        }
        if (r) await evolveAndPrint(r);
    }
    setSagaSoulOverride(null);
    console.log(rule('END'));
    console.log(MODE === 'consummate'
        ? '  看：私處 + 已互許下，真架構的文筆有沒有解到「圓房(纏綿/雲雨)」、且仍是古典艷情而非粗鄙。'
        : '  看：tender 覆寫克制後，醋意/背叛/痴情有沒有爆成修羅場、表白里程碑有沒有觸發、關係圖有沒有多向衝突。');
}

main().then(() => process.exit(0)).catch((e) => { console.error('[shura-consummate] fatal:', e); process.exit(1); });
