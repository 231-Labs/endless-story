/**
 * AGENT-SEASON · WORLD (venues + cast) — the clean rebuild's world model.
 * ============================================================================
 * The gravity-well fix is STRUCTURAL, seeded here:
 *   - every character carries an OCCUPATION with a time-driven rhythm (rhythm.ts),
 *     so they anchor to THEIR OWN life, not all converge on 柳生春 / the 戲台;
 *   - each character's PRIMARY want is VENUE-ANCHORED to their occupation (troupe →
 *     the 戲台 / craft; 金鳳 → 歌女 livelihood at the 舞廳/會樂里; 白韻秋 → her own
 *     world + pursuit). Only a MINORITY of wants point at 柳生春 (his own debt to
 *     金鳳, 金鳳's demand, 蘇 secondary, 白 pursuit) — the drama, layered on rhythm.
 *
 * Seed memories are loaded VERBATIM from canon-seed.ts (spring-snow.json), never
 * thinned. The self-model (coreIdentity + relationshipViews) is seeded from the
 * same canon. See CLAUDE.md memory: the 柳↔金鳳 肌膚/companionship history and the
 * 柳↔蘇 師姐妹/暗戀 must surface in recall/self-model when relevant.
 */

import { newWant, type Want } from '../../src/index.ts';
import { CANON, type SeedMemory } from './canon-seed.ts';
import { abilityOf } from './production.ts';

export type Occupation = 'troupe' | 'banzhu' | 'geinu' | 'guest';

/**
 * PINNED world-premise (always injected) — stops the LLM drifting into
 * anachronistic tropes. Concretely: 柳生春 is a 1920s PROFESSIONAL opera star
 * (坤生/當紅小生); performing is her career CHOICE, she is NOT indentured and 贖身
 * does NOT apply to her. 金鳳's own 從良/redeeming HERSELF is period-accurate for a
 * 長三 歌女, but that concept must never bleed onto 柳 (who needs no redemption).
 */
export const WORLD_PREMISE =
    '一九二〇年代的上海，一個戲班與歌場的世界。戲子（如柳生春）是憑本事掛牌的職業名角，坤生扮小生是她自己選的營生，不是被買來的，更無所謂「贖身」；春雪社眾人都是職業梨園人。歌女（如金鳳）是長三堂子掛頭牌的紅倌人，替自己攢一筆從良的體己是這一行的常情——那是她自己的盤算，與贖誰無關。白韻秋是綢緞莊的獨養千金。切莫把「贖身」這種舊套安到柳生春或別的職業戲子身上。';

export interface Venue {
    name: string;
    kind: 'stage' | 'practice' | 'backstage' | 'home' | 'nightclub' | 'public';
    hint: string;
    /** true → a rendered scene here is PUBLIC (woven into the 章回 as public). */
    isPublic: boolean;
}

export const VENUES: Venue[] = [
    { name: '雲錦台戲台', kind: 'stage', hint: '春雪社的戲台，排戲、登台都在這', isPublic: true },
    { name: '練功房', kind: 'practice', hint: '戲台後頭的練功房，清早吊嗓、走位', isPublic: true },
    { name: '後台妝閣', kind: 'backstage', hint: '沈班主坐鎮的後台妝閣，管戲、管帳、管人心', isPublic: true },
    { name: '衣箱房', kind: 'backstage', hint: '後台最裡頭那間，封了十五年的樟木戲箱堆在裡頭，沈班主上了鎖', isPublic: false },
    { name: '後台小廂房', kind: 'home', hint: '柳生春在戲台後頭的住處', isPublic: false },
    { name: '二樓書寓', kind: 'home', hint: '蘇映雪的書寓', isPublic: false },
    { name: '後進廂房', kind: 'home', hint: '江聞鶴的住處', isPublic: false },
    { name: '戲班大通鋪', kind: 'home', hint: '連翹和武行們的大通鋪', isPublic: false },
    { name: '沈宅小樓', kind: 'home', hint: '沈雪笙的家', isPublic: false },
    { name: '霞飛路歌場', kind: 'nightclub', hint: '霞飛路的歌場舞廳，金鳳入夜掛頭牌唱曲的地方', isPublic: true },
    { name: '會樂里寓所', kind: 'home', hint: '金鳳在會樂里的寓所，深宵歸處', isPublic: false },
    { name: '白公館繡樓', kind: 'home', hint: '白韻秋娘家的繡樓', isPublic: false },
    { name: '包廂茶座', kind: 'public', hint: '戲園子邊上的雅座，白韻秋常來聽戲的地方', isPublic: true },
    { name: '霞飛路', kind: 'public', hint: '霞飛路，逛街、看洋片、兜風的十里洋場', isPublic: true },
    // STREET / FOOD grounds — neutral meeting places AND where people eat (攤子/小吃/食肆).
    { name: '霞飛路商店街', kind: 'public', hint: '霞飛路上一長排店鋪食攤，綢緞洋貨、餛飩生煎樣樣有，逛街的、討生活的都在這打尖', isPublic: true },
    { name: '戲園前街', kind: 'public', hint: '戲園門前那條街，擺著茶湯、麵攤、糖粥的小吃攤子，散戲進戲的人在這歇腳吃食', isPublic: true },
];

export const venueByName = new Map(VENUES.map((v) => [v.name, v]));
export const isPublicVenue = (name: string): boolean => venueByName.get(name)?.isPublic ?? false;

/** Street/food venues — a character standing here on a non-scene turn can EAT (§ economy).
 *  DATA (venue names), never character-name logic. */
export const FOOD_VENUES = new Set<string>(['霞飛路商店街', '戲園前街']);
export const isFoodVenue = (name: string): boolean => FOOD_VENUES.has(name);

// ── Character ────────────────────────────────────────────────────────────────
export interface Char {
    id: string;
    name: string;
    role: string;
    occupation: Occupation;
    homeVenue: string;
    /** Occupation work anchor (戲台 for troupe, 歌場 for 金鳳, …). */
    workVenue: string;
    persona: string;
    secret: string;
    /** Pinned, always-injected social position (era-accurate) — anti-anachronism. */
    socialFact: string;
    /** Short in-world phrase stating this character's 身/sex, so intimacy writing is
     *  gender-correct for ANY pairing. DATA, not logic: the register note in beat.ts
     *  is composed from the actual participants' bodyFacts (never name-special-cased). */
    bodyFact: string;
    /** VERBATIM canon memories (never thinned). */
    thickMemories: SeedMemory[];
    /** Mutable self-model — always-injected identity facts (latest-wins nightly). */
    coreIdentity: string[];
    /** otherId → current one-line view (the mutable self-model, latest-wins). */
    relationshipViews: Map<string, string>;
    wants: Want[];
    /** current location. */
    venue: string;
    /** otherId → verbatim of what passed between them TODAY (feeds night reflect). */
    todayLedger: Map<string, string>;
    /** scenes this character was in TODAY (fatigue signal; reset each day). */
    scenesToday: number;
    /** did this character already act in a rendered scene THIS 時辰 (dedup). */
    sceneThisRound: boolean;
    /** otherIds this character had a rendered scene with TODAY — so a settled/
     *  addressed encounter never re-plans as if it never happened (outcome
     *  propagation; reset each day). */
    addressedToday: Set<string>;
    /** 0..1 physical health. Awake 時辰 drain it, sleep recovers it; ≤0 → death.
     *  Exposed in planning so self-preservation drives sleep (sleep has teeth). */
    health: number;
    /** accumulating fatigue 0..1 (the felt tiredness surfaced to the agent). */
    fatigue: number;
    /** how much coin the character carries (a small economy: spent on meals). Seeded per
     *  character in SPECS (DATA). Never goes negative (floored at 0 when they try to eat
     *  broke). Persisted in the season snapshot. */
    money: number;
    /** Items carried on the person (隨身物/行頭 with provenance, e.g. gifts). The
     *  character alone decides if/when one comes out in a scene (gift-and-see). */
    carried: string[];
    /** 0..1 felt hunger. Rises a little each active 時辰 (like fatigue), resets low when
     *  the character EATS at a street/food venue. Surfaced as a soft driver in the 身 line. */
    hunger: number;
    /** Standing intent to catch a specific person: the character POSTS UP at a venue
     *  and re-attempts to engage `target` across 時辰 until they meet or patience runs
     *  out. This is how a seeker who knows the other's routine WAITS for them (rather
     *  than re-guessing a stale coordinate and oscillating). null → not waiting. */
    waitingFor: { target: string; venue: string; intent: string; since: number } | null;
    /** OPPORTUNITY COST (time is the scarce resource): set true when a LONG/deep scene
     *  this 時辰 (e.g. a 深宵-scale 床戲) consumed the character — they are "still abed /
     *  spent" and take no further active turn for the REST of the day. Reset each day. */
    occupiedRestOfDay: boolean;
    dead: boolean;
    /** How many seasons (weeks) this character has already lived through — 0 on a fresh
     *  seed, +1 each time a snapshot is restored. Surfaced nightly as FINITUDE (the year
     *  closing, chances thinning) so want-regeneration is grounded in a lifecycle, not an
     *  immortal drift. Persisted in the season snapshot. */
    seasonsLived: number;
}

/** A knows B's ROUTINE only if they KNOW each other — A carries a relationship view
 *  of B, or a seed memory that names B. Strangers cannot predict each other's
 *  whereabouts (this gate also fits the future lazy-generated bystanders). */
export function knowsRoutine(a: Char, b: Char): boolean {
    if (a.relationshipViews.has(b.id)) return true;
    const bname = b.name.slice(0, 2);
    return a.thickMemories.some((m) => m.text.includes(bname) || m.tag.includes(b.name.slice(0, 1)));
}

/** Established-lover pairs, DERIVED from canon: both carry 肌膚 (carnal-history)
 *  memories referencing each other. For such a pair, physical intimacy alone in a
 *  private venue at night is natural/correct (consummate register). Any other pair
 *  stays restrained (forbidden/unconfessed → high resistance, rare). This is the
 *  recall-driven, relationship-dependent intimacy the decide-by-recall model validated. */
export function areEstablishedLovers(a: Char, b: Char): boolean {
    const aCarnalB = a.thickMemories.some((m) => m.tag.startsWith('肌膚') && m.tag.includes(b.name.slice(0, 1)));
    const bCarnalA = b.thickMemories.some((m) => m.tag.startsWith('肌膚') && m.tag.includes(a.name.slice(0, 1)));
    return aCarnalB && bCarnalA;
}

interface CastSpec {
    id: string;
    occupation: Occupation;
    homeVenue: string;
    workVenue: string;
    socialFact: string;
    bodyFact: string;
    /** Starting coin (DATA, per character — never name-logic in code). 白韻秋 rich, 金鳳/沈
     *  comfortable, troupe modest, 連翹 poor. */
    money: number;
    coreIdentity: string[];
    views: Array<[string, string]>;
    wants: Array<Omit<Parameters<typeof newWant>[0], 'characterId' | 'kind' | 'source' | 'bornTick'>>;
}

const SPECS: CastSpec[] = [
    {
        id: '柳生春', occupation: 'troupe', homeVenue: '後台小廂房', workVenue: '雲錦台戲台',
        socialFact: '你是憑本事掛牌的職業當紅小生（坤生），登台是你自己選的營生；你不是被買來的，也無所謂贖身。',
        bodyFact: '女兒身，坤生（台上扮男、台下是女子）',
        money: 18, // 當紅小生，戲子營生 modest 偏上
        coreIdentity: [
            '我是柳生春，春雪社當紅小生，坤生，這身男兒氣是一寸一寸從骨頭裡練出來的。',
            '戲比天大，台上不能塌。',
            '師姐給的是魂，金鳳給的是身——這話我對誰都不敢說。',
        ],
        views: [
            ['金鳳', '會樂里的舊人，教會我這身子的人，我欠她一句了斷，繞著會樂里走了這些年'],
            ['蘇映雪', '師姐，搭了八年生旦，我在她跟前一向聽話，那點心思只敢在台上'],
        ],
        wants: [
            { layer: '情', desc: '欠金鳳一句了斷，這些年一直沒給她個交代', target: '金鳳', weight: 0.82, sat: 0.24, resistance: 4 },
            { layer: '戲', desc: '排一齣新戲，把雲錦台重新撐起來，站回台心', weight: 0.6, sat: 0.4, resistance: 5 },
        ],
    },
    {
        id: '金鳳', occupation: 'geinu', homeVenue: '會樂里寓所', workVenue: '霞飛路歌場',
        socialFact: '你是長三堂子掛頭牌的紅歌女，替自己攢一筆從良的體己是你自己的盤算，與贖誰無關；柳生春是職業名角，你要的是她當面一句交代，不是替她贖什麼身。',
        bodyFact: '女子',
        money: 45, // 掛頭牌紅歌女，手頭 comfortable
        coreIdentity: [
            '我是金鳳，霞飛路掛頭牌的紅歌女，不是梨園中人。',
            '人前不哭不鬧，認準的事拖多久都不鬆手。',
        ],
        views: [['柳生春', '那個跑龍套時我接住的人，如今心淡了，我只要他當面認一句欠我的']],
        wants: [
            { layer: '情', desc: '要柳生春當面認一句欠我的，那樁舊帳當面了斷', target: '柳生春', weight: 0.86, sat: 0.2, resistance: 4 },
            { layer: '生', desc: '把這個月的堂會唱下來，撐住會樂里的門面', weight: 0.55, sat: 0.5, resistance: 5 },
        ],
    },
    {
        id: '蘇映雪', occupation: 'troupe', homeVenue: '二樓書寓', workVenue: '雲錦台戲台',
        socialFact: '你是春雪社掛牌的職業台柱花旦，梨園中人，靠本事吃飯。',
        bodyFact: '女子',
        money: 20, // 台柱花旦，戲子營生 modest
        coreIdentity: [
            '我是蘇映雪，春雪社台柱花旦，滿上海都說我穩得住場。',
            '這份穩，是我拿一輩子的分寸換來的殼。',
        ],
        views: [['柳生春', '搭了八年的師妹，我這輩子只真給過她一個，偏是我自己先逃的']],
        wants: [
            { layer: '戲', desc: '去雲錦台把新戲的旦角戲排出彩，掙一個立得住的台柱', weight: 0.72, sat: 0.34, resistance: 4 },
            { layer: '情', desc: '私心想跟柳生春多對幾場生旦戲，那點心思不敢認', target: '柳生春', weight: 0.5, sat: 0.42, resistance: 6 },
        ],
    },
    {
        id: '白韻秋', occupation: 'guest', homeVenue: '白公館繡樓', workVenue: '包廂茶座',
        socialFact: '你是霞飛路綢緞大莊的獨養千金，養尊處優，捧角是你的心意，不是交易。',
        bodyFact: '女子',
        money: 120, // 綢緞大莊獨養千金，rich
        coreIdentity: [
            '我是白韻秋，霞飛路綢緞大莊的獨養千金。',
            '認準的事，這偌大家業也換不來我真想要的那個笑。',
        ],
        views: [['柳生春', '我捧的角兒，我要的其實是她卸了妝、不設防的那個人']],
        wants: [
            { layer: '癡', desc: '想法子親近柳生春，捧他捧成名角', target: '柳生春', weight: 0.7, sat: 0.3, resistance: 5 },
            { layer: '世', desc: '弄明白自己要的到底是台上那位，還是卸了妝那個人', weight: 0.48, sat: 0.4, resistance: 5 },
        ],
    },
    {
        id: '沈雪笙', occupation: 'banzhu', homeVenue: '沈宅小樓', workVenue: '後台妝閣',
        socialFact: '你是春雪社的班主，昔年工小生的名角，如今掌一個職業戲班的生意與人心。',
        bodyFact: '女子（昔年工小生、坤生出身）',
        money: 50, // 班主，掌一班生意，comfortable
        coreIdentity: [
            '我是沈雪笙，春雪社班主，昔年霞飛路上最亮的少年郎。',
            '我看得出誰正要成角、誰快被名聲壓壞、誰只差一場戲就能站起來。',
            '疼人，我藏得很深。',
        ],
        views: [['柳生春', '她那柄扇太像當年的我，我有時心軟有時心驚']],
        wants: [
            { layer: '志', desc: '把封了多年的春雪社重新撐起來，排一齣立得住的新戲', weight: 0.68, sat: 0.38, resistance: 4 },
            // GUARDED: the 封箱/白蘭/懷錶 grief is a HIDDEN 心底祕密 (it lives in `secret`,
            // ridden by the beat prompt's innerSecret channel — hidden by default, only
            // surfacing from 言外之意 or when truly pressed). The OPEN want must NOT recite
            // the 懷錶/那句話 tokens, or she volunteers the grief as an anecdote. So this
            // want only gestures at "an old sealed thing" — the concrete material stays sealed.
            { layer: '心', desc: '心口封了多年的那樁舊事，究竟該就這麼壓著，還是有朝一日鬆手', weight: 0.5, sat: 0.5, resistance: 6 },
        ],
    },
    {
        id: '江聞鶴', occupation: 'troupe', homeVenue: '後進廂房', workVenue: '雲錦台戲台',
        socialFact: '你是從紹興男班北上的職業小生，靠一身跪步真功夫吃飯。',
        bodyFact: '男子（紹興男班小生）',
        money: 12, // 北上搭班的小生，戲子營生 modest 偏緊
        coreIdentity: [
            '我是江聞鶴，從紹興男班北上的小生，跪步是拿命換的真本事。',
            '我怕的不是輸給誰，是怕這身本事在新上海不夠人看。',
        ],
        views: [['柳生春', '同演小生的對手，嘴上不服，心裡認她那口氣']],
        wants: [
            { layer: '藝', desc: '在雲錦台站住，跟柳生春唱一場誰也不讓誰的對手戲', target: '柳生春', weight: 0.66, sat: 0.36, resistance: 4 },
        ],
    },
    {
        id: '連翹', occupation: 'troupe', homeVenue: '戲班大通鋪', workVenue: '雲錦台戲台',
        socialFact: '你是春雪社新來的職業刀馬旦，從雜技場滾出來，靠身體吃飯。',
        bodyFact: '女子',
        money: 4, // 新來的刀馬旦，poor，一頓好的都要掂量
        coreIdentity: [
            '我是連翹，春雪社新來的刀馬旦，從雜技場滾出來的。',
            '我這輩子的名字要靠自己在戲單上一筆一筆掙出來。',
        ],
        views: [['沈雪笙', '當年台心那個滿場皆靜的名角，我急著趁還站得住，站上去給她看']],
        wants: [
            { layer: '名', desc: '在一班名角裡，讓上海記住一個靠身體站上台心的人', weight: 0.64, sat: 0.38, resistance: 4 },
        ],
    },
];

/** Romantic want-layers (mirror of round.ts's ROMANTIC_LAYERS) — a want on any of these
 *  is a love thread; anything else is the character's craft/professional line. */
const ROMANTIC_LAYERS = /情|愛|暗戀|癡/;
/** Modest, TUNABLE nudge to the troupe LEAD's own craft want so it competes with the
 *  romance nexus (the lead carries the 大會串; their professional line must not starve).
 *  Kept small so it never flips the lead's hottest want or disturbs dispersion. */
export const LEAD_CRAFT_WEIGHT_BUMP = 0.12;

/** Build the cast. `only` restricts to a subset (the small slice). */
export function buildCast(only?: string[]): Char[] {
    const specs = only ? SPECS.filter((s) => only.includes(s.id)) : SPECS;
    const cast: Char[] = specs.map((s): Char => {
        const canon = CANON[s.id];
        if (!canon) throw new Error(`no canon seed for ${s.id}`);
        return {
            id: s.id,
            name: canon.name,
            role: canon.role,
            occupation: s.occupation,
            homeVenue: s.homeVenue,
            workVenue: s.workVenue,
            persona: canon.description,
            secret: canon.secret,
            socialFact: s.socialFact,
            bodyFact: s.bodyFact,
            thickMemories: canon.memories, // VERBATIM — never thinned
            coreIdentity: [...s.coreIdentity],
            relationshipViews: new Map(s.views),
            wants: s.wants.map((w) => newWant({ ...w, characterId: s.id, kind: 'narrative', source: 'genesis', bornTick: 0 })),
            venue: s.homeVenue,
            todayLedger: new Map(),
            scenesToday: 0,
            sceneThisRound: false,
            addressedToday: new Set(),
            health: 1,
            fatigue: 0,
            money: s.money, // DATA-seeded starting coin
            hunger: 0,
            carried: [],
            waitingFor: null,
            occupiedRestOfDay: false,
            dead: false,
            seasonsLived: 0,
        };
    });

    // LEAD CRAFT-WEIGHT NUDGE (data-driven, no names): the highest-ability TROUPE member
    // carries the 大會串, so give their own craft/professional want a modest edge over the
    // romance nexus. Bumped small enough that it never overtakes their hottest want.
    let lead: Char | null = null;
    for (const c of cast) {
        if (c.occupation !== 'troupe') continue;
        if (!lead || abilityOf(c.id) > abilityOf(lead.id)) lead = c;
    }
    if (lead) {
        const craft = lead.wants
            .filter((w) => !ROMANTIC_LAYERS.test(w.layer))
            .sort((a, b) => b.weight - a.weight)[0];
        if (craft) craft.weight = Math.min(1, craft.weight + LEAD_CRAFT_WEIGHT_BUMP);
    }

    return cast;
}
