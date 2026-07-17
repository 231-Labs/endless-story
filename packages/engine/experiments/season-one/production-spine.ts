/**
 * Production spine — the PROFESSIONAL backbone of Season Two.
 *
 * Replaces the flat open-action "排新戲" (everyone free-writes → amateur mush) with
 * the validated `packages/troupe` production STATE MACHINE, tick-paced under the
 * 会串 deadline:
 *
 *   PROPOSED → SCRIPTED → CAST → SCORED → VERSIFIED → REHEARSING → PREMIERED
 *
 * The troupe pipeline is reused VERBATIM (no edits to packages/troupe): we drive
 * it with troupe's own `advance()` and inject the two seams via advance()'s
 * idempotency guards — advance() only does a stage's work `if (!prod.cast)` /
 * `if (!prod.ci)`, so pre-populating those fields lets our seam versions win while
 * every other stage (propose / writeScript / composeAll / rehearse) stays the
 * packaged code.
 *
 * The two seams (the troupe decoupled test's honest gaps), wired here:
 *   Seam 1 — WANT-CONTESTED casting. The packaged caster is skill+bond only. Here
 *     casting weight = wantStrength(live want for the part) × skillFit(行當) ×
 *     bondBoost(couple), read from the SEASON's living wants — so 江 and 柳 can both
 *     bid for 許仙 and the winner reflects contention, not just the strongest bond.
 *     行當 constraints (坤生/乾旦, gender ⊥ role) are preserved.
 *   Seam 2 — FULL relational field into the lyricist. The packaged 有感而發 pass
 *     gates emergent 詞 on the other party being on-stage (`inCast.has`). Here each
 *     performer is handed their WHOLE relational field, so an OFF-STAGE debt (柳's
 *     金鳳) surfaces in that performer's private 詞 even though 金鳳 is not in the
 *     会串 cast.
 */

import {
    advance,
    crossCastLabel,
    fitScore,
    newProduction,
    qualityBand,
    resolvePlay,
    skill,
    bestFor,
    askOr,
    CRAFT,
    type Ask,
    type CastAssignment,
    type Ci,
    type Lifecycle,
    type Part,
    type Production,
    type Scene,
    type Score,
    type Script,
    type TroupeMember,
} from '@endless-story/troupe';
import { newWant, type WorldState } from '../../src/index.ts';
import {
    advocate,
    arbitrateCasting,
    deliberateLiyi,
    noteOnCi,
    noteOnRehearsal,
    rebut,
    refuseVerdict,
    CASTING_ROUND_CAP,
    LIGHT_ROUND_CAP,
    type AdvocacyMove,
    type AdvocateCard,
    type DiscussionRecord,
    type DiscussionTurn,
    type Reshape,
} from './discussion.ts';

// ── The season troupe "casting sheet" — 行當 / skills / voice lifted from the
//    validated tick-paced-production fixture, keyed by the WORLD character name so
//    every id in the built TroupeMember graph is a live world id (c0…). Memories
//    carry aboutName (relational, aboutId-tagged) for the lyricist; relationships
//    carry withName. `bids` are the parts a member DESIRES — seeded into the world
//    as living wants so casting reads live heat, not a static table. ──
interface CastingSheet {
    worldName: string;
    hangdang: TroupeMember['hangdang'];
    yinggong: TroupeMember['yinggong'];
    actorGender: TroupeMember['actorGender'];
    voice: string;
    skills: TroupeMember['skills'];
    memories: Array<{ id: string; text: string; mood?: TroupeMember['memories'][number]['mood']; aboutName?: string }>;
    relationships: Array<{ withName: string; kind: string; intensity: number; note?: string }>;
    /** parts this member self-bids for (partId + genesis desire strength 0..1). */
    bids?: Array<{ partId: string; strength: number; desc: string; partName: string }>;
    /** a part this member LOBBIES another member to get (蘇 pushes 柳 for 許仙). */
    lobby?: { forWorldName: string; partId: string; partName: string; strength: number; desc: string };
    /** a strong want NO existing part satisfies (連翹 wants 台心/被沈看見). When live
     *  heat is high, the casting DISCUSSION lets 班主 reshape the production for it. */
    spotlightWant?: { desc: string; strength: number };
}

const SEASON_SHEET: CastingSheet[] = [
    {
        worldName: '沈雪笙', // 班主 — must be troupe[0] so advance()'s director = 沈雪笙
        hangdang: '生',
        yinggong: ['文小生', '老生'],
        actorGender: 'female',
        voice: '半是賬房半是戲魂，話裡有舊事，不站台心卻壓得住全台。',
        skills: [
            { key: 'playwriting', label: '編劇', value: 60 },
            { key: 'literati', label: '文墨', value: 80 },
            { key: 'vocal', label: '唱腔', value: 70 },
            { key: 'lyricism', label: '填詞', value: 52 },
        ],
        memories: [
            { id: 'sx2', text: '那只停了的懷錶我一直收著，停在那個人走的那一天。箱底還壓著一件本不該在小生箱裡的旦角戲衣，是我放的。', mood: 'sorrow', aboutName: '柳安春' },
            { id: 'sx3', text: '看柳安春在台上做小生，我有時心軟，有時心驚：她那柄扇，開合之間太像當年的我自己。', mood: 'longing', aboutName: '柳安春' },
        ],
        relationships: [
            { withName: '柳安春', kind: '班主與角兒（心軟心驚）', intensity: 60, note: '她的扇太像當年的我；我護她，也怕她走上我的舊路。' },
        ],
    },
    {
        worldName: '蘇映雪', // 花旦/青衣 — the wordsmith (填詞 74)
        hangdang: '旦',
        yinggong: ['花旦', '青衣'],
        actorGender: 'female',
        voice: '嬌而不媚，替全班圓場，唱到傷處眼神先到；穩，是拿一輩子分寸換的殼。',
        skills: [
            { key: 'vocal', label: '唱腔', value: 88 },
            { key: 'lyricism', label: '填詞', value: 74 },
            { key: 'literati', label: '文墨', value: 78 },
            { key: 'movement', label: '身段', value: 72 },
        ],
        memories: [
            { id: 'sy1', text: '八年前我二十歲，同十七歲的生春頭一回合演《驚夢》。下了戲誰也沒醒，在我廂房裡越了那道線。', mood: 'longing', aboutName: '柳安春' },
            { id: 'sy3', text: '水袖第三道的暗號是某年除夕我定的：往後台上我接你揚到第三道的水袖，就是只唱給你。', mood: 'longing', aboutName: '柳安春' },
        ],
        relationships: [
            { withName: '柳安春', kind: '八年生旦·暗戀·除夕暗號', intensity: 92, note: '台上千百回杜麗娘與柳夢梅，台下最貼近那一步我總收住手。' },
        ],
        bids: [{ partId: 'bai', partName: '白素貞', strength: 0.5, desc: '想演白素貞，與生春配一齣生旦' }],
        lobby: { forWorldName: '柳安春', partId: 'xu', partName: '許仙', strength: 0.3, desc: '想讓柳安春演許仙，好與我配對' },
    },
    {
        worldName: '柳安春', // 坤生 小生 — body-not-brush (填詞 45, gated out of commissioned 詞)
        hangdang: '生',
        yinggong: ['文小生', '武小生'],
        actorGender: 'female',
        voice: '清俊中性，一柄摺扇撩動滿堂春水；人前滿不在乎的漂亮。',
        skills: [
            { key: 'vocal', label: '唱腔', value: 82 },
            { key: 'movement', label: '身段', value: 80 },
            { key: 'lyricism', label: '填詞', value: 45 },
        ],
        memories: [
            { id: 'lc1', text: '十七歲頭一回跟師姐同台《驚夢》，我演柳夢梅、她演杜麗娘。散了戲兩人都沒醒，在她廂房裡越了線。', mood: 'longing', aboutName: '蘇映雪' },
            { id: 'lc4', text: '我欠金鳳一句交代，一年年拖著，還騙自己說她也膩了。心裡清楚，是我先鬆的手。會樂里那條弄堂，我繞著走。', mood: 'sorrow', aboutName: '金鳳' },
        ],
        relationships: [
            { withName: '蘇映雪', kind: '師姐·給魂·暗戀', intensity: 90, note: '她給的是魂；在她跟前我一向聽話。' },
            { withName: '金鳳', kind: '六七年身之情·欠一句交代', intensity: 80, note: '身子的門道是她教的；我欠她一句交代，一年年拖著。' },
        ],
        bids: [{ partId: 'xu', partName: '許仙', strength: 0.55, desc: '想演許仙，與師姐配生旦、對著她唱' }],
    },
    {
        worldName: '江聞鶴', // 男小生 — 對台 rival, also bids 許仙
        hangdang: '生',
        yinggong: ['文小生', '武小生'],
        actorGender: 'male',
        voice: '紹興男班北上，台步跪在青石板上磨出來，嘴上挑剔，台上肯接戲、肯托人。',
        skills: [
            { key: 'vocal', label: '唱腔', value: 80 },
            { key: 'movement', label: '身段', value: 78 },
            { key: 'martial', label: '武場', value: 60 },
            { key: 'literati', label: '文墨', value: 55 },
        ],
        memories: [
            { id: 'jw2', text: '我越怕，越想留下來，同這位柳老板唱一場真正漂亮的對手戲。輸贏在其次，戲得是真的。', mood: 'tense', aboutName: '柳安春' },
        ],
        relationships: [
            { withName: '柳安春', kind: '同行較勁·想唱一場真對手戲', intensity: 55, note: '爭的不是男女高下，是怎樣把少年郎唱得可信。' },
        ],
        bids: [{ partId: 'xu', partName: '許仙', strength: 0.45, desc: '想演許仙，唱一場真對手戲' }],
    },
    {
        worldName: '連翹', // 刀馬旦 — bids 小青
        hangdang: '旦',
        yinggong: ['武旦', '刀馬旦'],
        actorGender: 'female',
        voice: '從京班武場滾出來，槍花翻身靠旗亮相，每一次出手都要有緣故。',
        skills: [
            { key: 'movement', label: '身段', value: 85 },
            { key: 'martial', label: '武場', value: 82 },
            { key: 'vocal', label: '唱腔', value: 60 },
        ],
        memories: [
            { id: 'lq2', text: '我遠遠見過沈雪笙一回。記住的是那人往台心一站，滿場人都不得不安靜。若我也站到台心，上海會不會終於看見我。', mood: 'longing', aboutName: '沈雪笙' },
        ],
        relationships: [
            { withName: '沈雪笙', kind: '想被看見·台心', intensity: 45, note: '想問若我也站到台心，上海會不會終於看見我。' },
        ],
        bids: [{ partId: 'qing', partName: '小青', strength: 0.5, desc: '想演小青，紮靠亮相守在姐姐身側' }],
        // slot-less: 小青 is a second; what she really wants (站台心/被沈看見) no part
        // holds. The casting discussion gives 班主 a lever to reshape the show for it.
        spotlightWant: { desc: '想站到台心、被沈雪笙看見，替自己寫一段鎮場武戲', strength: 0.7 },
    },
    {
        worldName: '金鳳', // 歌女 — NOT 梨園; 行當不撐戲，選角不會中 → stays OFF-STAGE (seam-2)
        hangdang: '旦',
        yinggong: ['花旦'],
        actorGender: 'female',
        voice: '霞飛路掛頭牌的紅歌女，爽利、看得出誰真誰假，認準的事拖多久都不鬆手。',
        skills: [
            { key: 'vocal', label: '唱腔', value: 80 },
            { key: 'lyricism', label: '填詞', value: 50 },
        ],
        memories: [
            { id: 'jf3', text: '我不要拆散誰，我要她當面認一句欠我的。等真拿到那句話，我留不留，連我自己都不知道。', mood: 'wrath', aboutName: '柳安春' },
        ],
        relationships: [
            { withName: '柳安春', kind: '六七年身之情·要一句交代', intensity: 85, note: '她的心從頭到尾在那個花旦身上；我要的是她當面認一句欠我的。' },
        ],
    },
    {
        worldName: '白韻秋', // 戲迷/恩客 — NOT a performer; off-stage warmth feeds box-office
        hangdang: '旦',
        yinggong: ['花旦'],
        actorGender: 'female',
        voice: '綢緞莊千金，捧角捧得體面，被婉拒也不糾纏；體面底下還不甘心退場。',
        skills: [{ key: 'vocal', label: '唱腔', value: 40 }],
        memories: [
            { id: 'by1', text: '有一回她卸了妝、不設防地朝我笑了一下。我最想要的其實是那個人，不是台上那位少年郎。', mood: 'longing', aboutName: '柳安春' },
        ],
        relationships: [
            { withName: '柳安春', kind: '捧角·不甘退場', intensity: 50, note: '想要的是卸了妝那個人；不想贏過誰，只想弄明白自己輸在哪裡。' },
        ],
    },
];

/** WHO advanced each stage — for the stage-per-tick timeline log. */
const WHO_BY_STATE: Record<Lifecycle, (p: Production, spine: ProductionSpine) => string> = {
    PROPOSED: () => '班主 沈雪笙（提案·壓時間線）',
    SCRIPTED: (p) => `編劇 ${p.script?.authorName ?? '?'}（成稿）`,
    CAST: (_p, s) => `導演 沈雪笙（意欲選角：${s.castingReason}）`,
    SCORED: (p) => `琴師 ${p.scores?.[0]?.composerName ?? '（略）'}（作曲出譜）`,
    VERSIFIED: (p) => `填詞 ${[...new Set((p.ci ?? []).map((c) => c.authorName))].join('、') || '?'}`,
    REHEARSING: () => '全體（排演·織戲中戲）',
    PREMIERED: () => '—',
};

export interface CastingBid {
    partId: string;
    partName: string;
    worldId: string;
    name: string;
    /** live want heat for this part (0..1). */
    wantStrength: number;
    /** fitScore(member, part) / 100. */
    skillFit: number;
    /** 1 + couple bond boost. */
    bondBoost: number;
    /** wantStrength × skillFit × bondBoost. */
    weight: number;
    lobbiedBy?: string;
}

export interface CiMeta {
    title: string;
    authorName: string;
    source: 'commissioned' | 'emergent';
    refName?: string;
    /** for emergent 詞: is the other party OFF the 会串 cast? (seam-2 proof) */
    offStage: boolean;
    /** a RECALLED thick+warm memory that grounded this 詞 (thick-memory→詞 wiring). */
    memoryProvenance?: string;
    /** true = the grounding memory came from the merged recall store, not the fixture. */
    fromRecall?: boolean;
}

export interface StageStep {
    tick: number;
    days: number;
    from: Lifecycle;
    to: Lifecycle;
    who: string;
    log: string;
}

/**
 * The production spine: builds a season TroupeMember graph over live world ids,
 * seeds casting-desire wants, and advances the troupe state machine one stage per
 * call with the two seams injected.
 */
export class ProductionSpine {
    readonly troupe: TroupeMember[];
    readonly prod: Production;
    readonly classicKey: string;
    /** worldId → accumulated rehearsal effort for box-office. */
    readonly rehearsalEffort: Record<string, number> = {};
    readonly timeline: StageStep[] = [];
    /** per contested part: every bid considered + the winner. */
    readonly castingBids: Record<string, CastingBid[]> = {};
    readonly ciMeta: CiMeta[] = [];
    castingReason = '（未選）';
    /** every JUDGMENT-stage discussion (立意 / 選角 / 提意見 / 排練), for audit. */
    readonly discussions: DiscussionRecord[] = [];
    /** a production reshape a hot slot-less want earned from the casting arbiter. */
    reshapeApplied: Reshape | null = null;
    /** debated 立意 line that overrode the repertoire default (選劇 discussion). */
    liyiDecided: string | null = null;
    /**
     * Optional bridge to the MERGED thick+warm memories (recall store): given a
     * performer + the party a 詞 is about, return a real recalled memory to ground
     * the 有感而發 詞. Wired by the harness; absent → the fixture memory is used.
     */
    recallMemory?: (worldId: string, aboutId: string, query: string) => Promise<string | null>;

    private readonly world: WorldState;
    private readonly idByName: (n: string) => string;

    constructor(world: WorldState, classicKey = 'baishe') {
        this.world = world;
        this.classicKey = classicKey;
        this.idByName = (n: string) => world.idByName(n) ?? n;

        // Build the troupe graph over live world ids (drop anyone not in the world).
        this.troupe = SEASON_SHEET.filter((s) => world.idByName(s.worldName)).map((s) => this.buildMember(s));
        this.prod = newProduction(world.data.sagaId, classicKey, { skipScore: false });
    }

    private buildMember(s: CastingSheet): TroupeMember {
        return {
            id: this.idByName(s.worldName),
            name: s.worldName,
            hangdang: s.hangdang,
            yinggong: s.yinggong,
            actorGender: s.actorGender,
            voice: s.voice,
            skills: s.skills,
            memories: s.memories.map((m) => ({ id: m.id, text: m.text, mood: m.mood, aboutId: m.aboutName ? this.idByName(m.aboutName) : undefined })),
            relationships: s.relationships.map((r) => ({ withId: this.idByName(r.withName), kind: r.kind, intensity: r.intensity, note: r.note })),
        };
    }

    /** Seed each member's part-desires into the world as living wants (志向 layer,
     *  target = part NAME) so the seam caster reads LIVE heat, and the per-tick
     *  living-want rewrite carries them forward. Idempotent-ish: call once at t0. */
    seedCastingWants(): number {
        let n = 0;
        for (const s of SEASON_SHEET) {
            const id = this.world.idByName(s.worldName);
            if (!id) continue;
            for (const b of s.bids ?? []) {
                this.world.data.wants.push(
                    newWant({ characterId: id, layer: '志向', desc: b.desc, target: b.partName, weight: b.strength, sat: 0.25, resistance: 5, kind: 'narrative', source: 'owner', bornTick: 0 }),
                );
                n++;
            }
            if (s.lobby) {
                // lobby is a want targeting the LOBBIED member (柳安春), desc names the part.
                this.world.data.wants.push(
                    newWant({ characterId: id, layer: '志向', desc: s.lobby.desc, target: s.lobby.forWorldName, weight: s.lobby.strength, sat: 0.25, resistance: 5, kind: 'narrative', source: 'owner', bornTick: 0 }),
                );
                n++;
            }
            if (s.spotlightWant) {
                // a want NO part satisfies — target sentinel '台心' matches no partName,
                // so the caster can't slot it; only a discussion RESHAPE can honour it.
                this.world.data.wants.push(
                    newWant({ characterId: id, layer: '志向', desc: s.spotlightWant.desc, target: '台心', weight: s.spotlightWant.strength, sat: 0.2, resistance: 6, kind: 'narrative', source: 'owner', bornTick: 0 }),
                );
                n++;
            }
        }
        return n;
    }

    /** A one-line production summary for the character layer's worldFact context. */
    summaryLine(): string {
        const st = this.prod.state;
        const castLine = this.prod.cast?.map((c) => `${c.assignedName ?? '缺'}飾${c.partName}${c.crossCastLabel ? `[${c.crossCastLabel}]` : ''}`).join('、');
        return `班裡正把《${this.prod.brief?.title ?? '新戲'}》往${st}推${castLine ? `（選角：${castLine}）` : ''}。趕在會串之前。`;
    }

    /** True once the production is done (PREMIERED). */
    get premiered(): boolean {
        return this.prod.state === 'PREMIERED';
    }

    /** box-office contributions for the finale — assigned cast, ability from role. */
    contributions(abilityOf: (worldId: string) => number): Array<{ characterId: string; ability: number; rehearsalEffort: number }> {
        return (this.prod.cast ?? [])
            .filter((c) => c.assignedId)
            .map((c) => ({ characterId: c.assignedId!, ability: abilityOf(c.assignedId!), rehearsalEffort: this.rehearsalEffort[c.assignedId!] ?? 0 }));
    }

    // ── Seam 1 (audit formula): want × 行當 × 緣分 ──────────────────────────────
    /** Compute per-part bids (fills `castingBids`) over every 行當-eligible member.
     *  This weight formula STILL RUNS: it is the audit trail, and it still picks the
     *  winner for UNCONTESTED parts. Contested parts are decided by discussion. */
    private computeBids(script: Script): void {
        const couple = resolvePlay(this.prod.brief!.classicKey).couple;
        // lobbies: lobbiedWorldId → { forPart, strength, byName } (蘇 pushes 柳 for 許仙)
        const lobbies = new Map<string, { partId: string; strength: number; byName: string }>();
        for (const s of SEASON_SHEET) {
            if (!s.lobby) continue;
            const byId = this.world.idByName(s.worldName);
            const forId = this.world.idByName(s.lobby.forWorldName);
            if (!byId || !forId) continue;
            const live = this.world.liveWantsOf(byId).find((w) => w.target === s.lobby!.forWorldName);
            const heat = live ? live.weight * (1 - live.sat) : s.lobby.strength;
            lobbies.set(`${forId}|${s.lobby.partId}`, { partId: s.lobby.partId, strength: heat, byName: s.worldName });
        }
        const strongestBond = (m: TroupeMember): number => Math.max(0, ...m.relationships.map((r) => r.intensity));
        for (const part of script.parts) {
            const bids: CastingBid[] = [];
            for (const m of this.troupe) {
                const fit = fitScore(m, part);
                if (fit <= 0) continue; // 行當 utterly wrong — not eligible at all
                const selfWant = this.world.liveWantsOf(m.id).find((w) => w.target === part.partName);
                let wantStrength = selfWant ? selfWant.weight * (1 - selfWant.sat) : 0.15; // 0.15 = a body can be drafted
                const lob = lobbies.get(`${m.id}|${part.partId}`);
                if (lob) wantStrength = Math.min(1, wantStrength + lob.strength * 0.5);
                const bondBoost = couple.includes(part.partId) ? 1 + 0.5 * (strongestBond(m) / 100) : 1;
                const weight = wantStrength * (fit / 100) * bondBoost;
                bids.push({ partId: part.partId, partName: part.partName, worldId: m.id, name: m.name, wantStrength, skillFit: fit / 100, bondBoost, weight, lobbiedBy: lob?.byName });
            }
            bids.sort((a, b) => b.weight - a.weight);
            this.castingBids[part.partId] = bids;
        }
    }

    /** A part is CONTESTED when ≥2 行當-eligible members each carry a live want
     *  (>0.15) for it — exactly 許仙 (柳安春 + 江聞鶴). The formula used to settle
     *  this silently; the discussion now argues it out. */
    private contestedPartIds(): string[] {
        return Object.entries(this.castingBids)
            .filter(([, bs]) => bs.filter((b) => b.wantStrength > 0.15).length > 1)
            .map(([partId]) => partId);
    }

    /** Assemble an advocate's card from world (secret + live wants) + troupe member. */
    private advocateCard(worldName: string): AdvocateCard | null {
        const id = this.world.idByName(worldName);
        const member = this.troupe.find((m) => m.id === id);
        if (!id || !member) return null;
        const c = this.world.castById(id);
        const live = this.world.liveWantsOf(id);
        const wantLine = live.slice(0, 3).map((w) => `${w.desc}${w.target ? `（指向：${w.target}）` : ''}`).join('；') || '（此刻無強烈想望）';
        const relLine = member.relationships.map((r) => `對${this.world.nameById(r.withId) ?? r.withId}：${r.kind}`).join('；') || '（無深緣）';
        const canPlay = (this.prod.script?.parts ?? []).filter((p) => fitScore(member, p) > 0).map((p) => p.partName);
        return { id, name: worldName, role: `${member.hangdang}行·${member.yinggong.join('/')}`, canPlay, description: member.voice ?? '', secret: c?.secret ?? '', want: wantLine, relationships: relLine };
    }

    /** The slot-less hot want (連翹's 站台心) — a live want no part can satisfy. */
    private slotlessAdvocate(): { card: AdvocateCard; want: string } | null {
        for (const s of SEASON_SHEET) {
            if (!s.spotlightWant) continue;
            const id = this.world.idByName(s.worldName);
            if (!id) continue;
            const live = this.world.liveWantsOf(id).find((w) => w.target === '台心');
            const heat = live ? live.weight * (1 - live.sat) : 0;
            if (heat > 0.3) {
                const card = this.advocateCard(s.worldName);
                if (card) return { card, want: live?.desc ?? s.spotlightWant.desc };
            }
        }
        return null;
    }

    // ── Seam 1 (JUDGMENT): casting-by-DISCUSSION for contested parts ────────────
    /** Contested parts are cast by the validated discussion scene (aspirants
     *  advocate → rebut → 班主 沈雪笙 arbitrates → cast crystallizes). Uncontested
     *  parts keep the cheap formula (top bid). A slot-less hot want can RESHAPE the
     *  production (連翹's 亮相). Records a `DiscussionRecord`. */
    private async seamCastDiscussion(ask: Ask, script: Script): Promise<CastAssignment[]> {
        this.computeBids(script);
        const memberById = new Map(this.troupe.map((m) => [m.id, m]));
        const contested = this.contestedPartIds();
        let arbCast: Record<string, string> | null = null;

        if (contested.length > 0) {
            const partLine = script.parts.map((p) => `${p.partName}（${p.hangdang}／${p.yinggong}）`).join('、');
            const contestedNames = contested.map((pid) => this.castingBids[pid][0]?.partName ?? pid);
            const brief = `排的戲：《${this.prod.brief?.title ?? '斷橋·新唱'}》，一場会串。要定的角：${partLine}。爭議角：${contestedNames.join('、')}（兩人以上都唱得了、都想要）。班主沈雪笙不上台，她拍板。`;

            // speakers: contested contenders + the lobbyist(蘇) + the slot-less holder(連翹)
            const speakerNames: string[] = [];
            const seen = new Set<string>();
            const addSpeaker = (n: string) => { if (n && !seen.has(n)) { seen.add(n); speakerNames.push(n); } };
            for (const s of SEASON_SHEET) {
                const id = this.world.idByName(s.worldName);
                if (!id) continue;
                const isContender = contested.some((pid) => this.castingBids[pid].some((b) => b.worldId === id && b.wantStrength > 0.15));
                if (isContender || s.lobby || s.spotlightWant) addSpeaker(s.worldName);
            }
            const slotless = this.slotlessAdvocate();

            const turns: DiscussionTurn[] = [];
            let transcript = '';
            const append = (name: string, m: AdvocacyMove, phase: string) => {
                transcript += `${name}：「${m.speech}」\n`;
                turns.push({ phase, speaker: name, said: m.speech, inner: m.inner });
            };

            // Round 1 — advocacy (each speaker once), each seeing the prior turns.
            const moves: Array<{ name: string; move: AdvocacyMove }> = [];
            for (const name of speakerNames) {
                const card = this.advocateCard(name);
                if (!card) continue;
                const m = await advocate(ask, card, brief, transcript);
                moves.push({ name, move: m });
                append(name, m, '自薦');
            }
            // Round 2 — rebuttal: the contested self-aspirants answer the room, once.
            const rebutters = speakerNames.filter((name) => {
                const id = this.world.idByName(name);
                return !!id && contested.some((pid) => this.castingBids[pid].some((b) => b.worldId === id && b.wantStrength > 0.15));
            });
            for (const name of rebutters) {
                const card = this.advocateCard(name);
                if (!card) continue;
                const m = await rebut(ask, card, brief, transcript);
                moves.push({ name, move: m });
                append(name, m, '再爭');
            }

            // 班主 arbitrates — always reaches a decision (no deadlock).
            const shenId = this.world.idByName('沈雪笙');
            const arbiter = {
                name: '沈雪笙',
                description: (shenId ? memberById.get(shenId)?.voice : '') ?? '',
                secret: (shenId ? this.world.castById(shenId)?.secret : '') ?? '',
            };
            const arb = await arbitrateCasting(ask, arbiter, brief, transcript, script.parts.map((p) => p.partName), slotless ? { name: slotless.card.name, want: slotless.want } : null);
            arbCast = arb.cast;
            turns.push({ phase: '拍板', speaker: '沈雪笙', said: arb.arbitration, inner: arb.reasoning });
            this.reshapeApplied = arb.reshape ?? null;

            const aspirants = [...new Set(moves.filter((x) => contestedNames.some((cn) => x.move.self_want?.includes(cn)) || x.move.push?.some((pp) => contestedNames.some((cn) => pp.part?.includes(cn)))).map((x) => x.name))];

            // ONE optional refusal by a losing contested aspirant — their choice.
            let refusal: { by: string; line: string } | null = null;
            const contestedPartName = contestedNames[0];
            const winnerName = arbCast[contestedPartName];
            const loser = rebutters.find((n) => n !== winnerName);
            if (loser) {
                const card = this.advocateCard(loser);
                if (card) {
                    const r = await refuseVerdict(ask, card, `${contestedPartName} 歸 ${winnerName}`);
                    if (r.refuse) { refusal = { by: loser, line: r.line }; turns.push({ phase: '不服（一次）', speaker: loser, said: r.line }); }
                }
            }

            this.discussions.push({
                stage: '選角',
                contestedPart: contestedPartName,
                aspirants,
                turns,
                arbiter: '沈雪笙',
                arbitrationLine: arb.arbitration,
                decision: script.parts.map((p) => `${p.partName}=${arbCast![p.partName] ?? '?'}`).join('、'),
                rounds: 1 + (rebutters.length > 0 ? 1 : 0),
                cap: CASTING_ROUND_CAP,
                decided: script.parts.every((p) => !!arbCast![p.partName]),
                reshape: arb.reshape ?? null,
                refusal,
                revision: null,
            });
        }

        // ── Build the final cast: discussion winner for contested parts, formula
        //    winner for the rest; uniqueness by a taken set. ──
        const taken = new Set<string>();
        const result: CastAssignment[] = [];
        for (const part of script.parts) {
            const bids = this.castingBids[part.partId] ?? [];
            let winnerId: string | null = null;
            if (contested.includes(part.partId) && arbCast) {
                const nm = arbCast[part.partName];
                const wid = nm ? this.world.idByName(nm) : undefined;
                if (wid && !taken.has(wid) && bids.some((b) => b.worldId === wid)) winnerId = wid;
            }
            if (!winnerId) winnerId = bids.find((b) => !taken.has(b.worldId))?.worldId ?? null;
            const winner = winnerId ? memberById.get(winnerId) ?? null : null;
            const alternates = bids.filter((b) => b.worldId !== winnerId).slice(0, 2).map((b) => memberById.get(b.worldId)!).filter(Boolean);
            result.push(this.buildAssignment(part, winner, alternates, bids));
            if (winner) taken.add(winner.id);
        }

        // ── Apply the RESHAPE: add a spotlight 亮相 part+scene for the slot-less want
        //    (連翹 替自己寫一段鎮場戲), so a hot want reshapes the production. ──
        if (this.reshapeApplied) {
            const forId = this.world.idByName(this.reshapeApplied.forName);
            const member = forId ? memberById.get(forId) : undefined;
            if (member) {
                const part: Part = { partId: 'liang', partName: this.reshapeApplied.beatTitle, hangdang: '旦', yinggong: '武旦', roleGender: 'female', martial: '武' };
                script.parts.push(part);
                const scene: Scene = { sceneId: 'sc_liang', title: this.reshapeApplied.beatTitle, parts: ['liang'], mood: 'wrath', beats: [{ beat: 1, summary: this.reshapeApplied.desc, tension: 0.85, mood: 'wrath' }], lines: [] };
                script.scenes.push(scene);
                result.push(this.buildAssignment(part, member, [], []));
            } else {
                this.reshapeApplied = null;
            }
        }

        const castRec = this.discussions.find((d) => d.stage === '選角');
        const winnerOf = arbCast && castRec?.contestedPart ? arbCast[castRec.contestedPart] : null;
        this.castingReason = arbCast
            ? `${castRec?.contestedPart ?? '許仙'} 經討論由 ${winnerOf ?? '—'} 定案（班主拍板，非公式）`
            : (result.find((c) => c.assignedName)?.assignedName ?? '—') + ' 等就位';
        return result;
    }

    /** Replicates troupe hangdang.assign() locally (assign is not barrel-exported),
     *  preserving 坤生/乾旦 cross-cast labels (gender ⊥ role). */
    private buildAssignment(part: Part, member: TroupeMember | null, alternates: TroupeMember[], bids: CastingBid[]): CastAssignment {
        if (!member) {
            return { ...part, assignedId: null, assignedName: null, actorGender: null, isCrossCast: false, crossCastLabel: null, alternates: alternates.map((m) => m.name) };
        }
        const label = crossCastLabel(part.hangdang, member.actorGender, part.roleGender);
        const contenders = bids.filter((b) => b.wantStrength > 0.15);
        let note: string | undefined;
        if (contenders.length > 1) {
            const win = bids.find((b) => b.worldId === member.id)!;
            const runnerUp = bids.find((b) => b.worldId !== member.id && b.wantStrength > 0.15);
            note = `爭角：${contenders.map((b) => `${b.name}(欲${b.wantStrength.toFixed(2)})`).join('、')} → ${member.name} 勝（權重 ${win.weight.toFixed(2)} vs ${runnerUp?.name} ${runnerUp?.weight.toFixed(2)}；欲望×行當×緣分）。`;
        }
        if (label) note = `${note ? note + ' ' : ''}${label}：${member.name}（坤伶）反串${part.partName}（${part.roleGender === 'male' ? '男' : '女'}角），是看點不是錯誤。`;
        return { ...part, assignedId: member.id, assignedName: member.name, actorGender: member.actorGender, isCrossCast: label !== null || member.actorGender !== part.roleGender, crossCastLabel: label, alternates: alternates.map((m) => m.name), note };
    }

    // ── Seam 2: full-relational-field lyricist ────────────────────────────────
    /** Commissioned climax 詞 (skill-gated, unchanged) + emergent 有感而發 over each
     *  performer's WHOLE relational field, so an OFF-STAGE debt (柳→金鳳) surfaces. */
    private async seamWriteCi(script: Script, cast: CastAssignment[], scores: Score[], ask: Ask): Promise<Ci[]> {
        const out: Ci[] = [];
        const byId = new Map(this.troupe.map((m) => [m.id, m]));
        const inCast = new Set(cast.map((c) => c.assignedId).filter(Boolean) as string[]);

        // 1. Commissioned — the packaged behaviour: best 填詞 (≥50) writes the climax.
        const climax = script.scenes.find((s) => s.mood === 'sorrow') ?? script.scenes[script.scenes.length - 1];
        const score = scores.find((s) => s.forSceneId === climax.sceneId);
        const writer = bestFor(this.troupe, CRAFT.填詞, 50) ?? [...this.troupe].sort((a, b) => skill(b, CRAFT.文墨) - skill(a, CRAFT.文墨))[0];
        const band = qualityBand(skill(writer, CRAFT.填詞));
        const commissioned = await askOr(
            ask,
            { system: `你是春雪社${writer.name}（填詞火候：${band}）。為《${script.title}》第〈${climax.title}〉場填一段唱詞，貼著「${score?.banshi ?? '二黃'}」的哀調，4 句，每句 7 字左右，押韻。只給 4 句詞。一律使用繁體中文。`, user: `場景：${climax.beats[0]?.summary ?? climax.title}。曲：${score?.banshi}（${score?.mode}）。`, maxTokens: 240, temperature: 0.9 },
            () => ['西湖橋斷水猶寒', '十年一夢隔生關', '雄黃不誤緣先誤', '腸斷青衫只自看'].join('\n'),
        );
        out.push({ forSceneId: climax.sceneId, title: `〈${climax.title}〉唱詞`, lines: split(commissioned), authorId: writer.id, authorName: writer.name, source: 'commissioned' });
        this.ciMeta.push({ title: `〈${climax.title}〉唱詞`, authorName: writer.name, source: 'commissioned', offStage: false });

        // 2. Emergent — FULL field: iterate PERFORMERS, surface strongest ON-stage
        //    bond AND strongest OFF-stage debt (≥75). No inCast filter (the seam fix).
        let made = 0;
        for (const c of cast) {
            if (!c.assignedId) continue;
            const performer = byId.get(c.assignedId);
            if (!performer) continue;
            const bonds = [...performer.relationships].sort((a, b) => b.intensity - a.intensity);
            const onStage = bonds.find((b) => inCast.has(b.withId));
            const offStage = bonds.find((b) => !inCast.has(b.withId) && b.intensity >= 75);
            for (const [bond, off] of [[onStage, false] as const, [offStage, true] as const]) {
                if (!bond || made >= 4) continue;
                const other = byId.get(bond.withId);
                if (!other) continue;
                // Thick-memory→詞: ground the 詞 in a REAL recalled memory from the
                // merged thick+warm store (about the other party), not just the thin
                // fixture note. Falls back to the fixture memory if no recall wired.
                let mem = performer.memories.find((m) => m.aboutId === other.id)?.text;
                let fromRecall = false;
                if (this.recallMemory) {
                    const recalled = await this.recallMemory(performer.id, other.id, `${other.name} ${bond.kind} ${bond.note ?? ''}`);
                    if (recalled && recalled.trim()) { mem = recalled.trim(); fromRecall = true; }
                }
                const emergent = await askOr(
                    ask,
                    { system: `你是${performer.name}（${performer.hangdang}行）。不是被派去填詞——是此刻有感而發。你與${other.name}（${bond.kind}）情牽${off ? `，可${other.name}並不在這台會串戲裡，是台下一筆沒了的帳` : '，這齣又台上配對'}。寫一首私心的小詞/詩，4 句，含蓄、不點破。只給 4 句。一律使用繁體中文。`, user: `關係：${bond.kind}（深度${bond.intensity}）。你心裡浮起的那件事：${mem ?? '自小一處學戲'}。`, maxTokens: 220, temperature: 0.95 },
                    () => (off ? ['會樂里的燈我繞著走', '一句交代拖成幾年秋', '身是你教的魂不由我', '欠的那聲對不住沒開口'] : ['同學一曲到如今', '台上夫妻假亦真', '一隻手放肩頭暖', '我裝沒事到天明']).join('\n'),
                );
                out.push({
                    forSceneId: null,
                    title: `${performer.name}·有感（${off ? `念${other.name}·台下的帳` : `贈${other.name}`}）`,
                    lines: split(emergent),
                    authorId: performer.id,
                    authorName: performer.name,
                    source: 'emergent',
                    provenance: { kind: fromRecall ? 'memory' : 'relationship', refId: other.id, why: `${bond.kind}，深度 ${bond.intensity}${fromRecall ? `；由回憶生詞：「${(mem ?? '').slice(0, 24)}…」` : ''}${off ? `；${other.name}不在會串戲裡，這是台下欠的一句` : `；台上又配${cast.find((x) => x.assignedId === other.id)?.partName ?? '對手'}`}。` },
                });
                this.ciMeta.push({ title: `${performer.name}·有感（${off ? '台下' : '台上'}）`, authorName: performer.name, source: 'emergent', refName: other.name, offStage: off, memoryProvenance: fromRecall ? mem : undefined, fromRecall });
                made++;
            }
        }
        return out;
    }

    // ── Discussion at the other JUDGMENT stages (lighter than casting) ─────────
    /** 立意/選劇: a senior proposes an interpretation, 班主 rules, BEFORE the brief
     *  locks. Stores the decided 立意 (the spine injects it into brief.qizhi). */
    private async deliberateLiyiStage(ask: Ask): Promise<void> {
        const play = resolvePlay(this.classicKey);
        const senior = this.advocateCard('蘇映雪');
        const shenId = this.world.idByName('沈雪笙');
        if (!senior || !shenId) return;
        const member = this.troupe.find((m) => m.id === shenId);
        const arbiter = { name: '沈雪笙', description: member?.voice ?? '', secret: this.world.castById(shenId)?.secret ?? '' };
        const d = await deliberateLiyi(ask, arbiter, senior, { title: play.title, defaultQizhi: play.qizhi, premiseSeed: play.premiseSeed });
        this.liyiDecided = d.qizhi;
        this.discussions.push({
            stage: '選劇立意',
            aspirants: [d.seniorName],
            turns: [
                { phase: '進言', speaker: d.seniorName, said: d.seniorNote },
                { phase: '定案', speaker: '沈雪笙', said: d.line, inner: d.reasoning },
            ],
            arbiter: '沈雪笙',
            arbitrationLine: d.line,
            decision: `立意：${d.qizhi}`,
            rounds: LIGHT_ROUND_CAP,
            cap: LIGHT_ROUND_CAP,
            decided: !!d.qizhi,
            reshape: null,
            refusal: null,
            revision: null,
        });
    }

    /** 填詞提意見: a critic notes the commissioned 詞; the author revises one line. */
    private async ciNoteRound(ask: Ask): Promise<void> {
        const ci = (this.prod.ci ?? []).find((c) => c.source === 'commissioned');
        if (!ci) return;
        const critic = this.advocateCard('沈雪笙') ?? this.advocateCard('江聞鶴');
        if (!critic || critic.name === ci.authorName) return;
        const note = await noteOnCi(ask, critic, { name: ci.authorName }, { title: ci.title, lines: ci.lines });
        let revised = '';
        if (note.revisedLine && note.revisedLine.trim() && ci.lines.length > 0) {
            const before = ci.lines[ci.lines.length - 1];
            ci.lines[ci.lines.length - 1] = note.revisedLine.trim();
            revised = `「${before}」→「${note.revisedLine.trim()}」`;
        }
        this.discussions.push({
            stage: '填詞提意見',
            aspirants: [note.criticName],
            turns: [
                { phase: '提意見', speaker: note.criticName, said: note.note },
                { phase: '改詞', speaker: note.authorName, said: revised || '（收下意見，未動詞）' },
            ],
            arbiter: note.authorName,
            arbitrationLine: revised || note.note,
            decision: revised || '（收下意見，未動詞）',
            rounds: LIGHT_ROUND_CAP,
            cap: LIGHT_ROUND_CAP,
            decided: true,
            reshape: null,
            refusal: null,
            revision: revised ? { of: ci.title, note: note.note, newLine: note.revisedLine.trim() } : null,
        });
    }

    /** 排練身段: a craft-strong performer notes another's 台步; the target 找師姐對戲. */
    private async rehearsalNoteRound(ask: Ask): Promise<void> {
        const inCast = new Set((this.prod.cast ?? []).map((c) => c.assignedName));
        const critic = this.advocateCard('江聞鶴');
        const target = this.advocateCard('柳安春');
        if (!critic || !target || !inCast.has('柳安春')) return;
        const n = await noteOnRehearsal(ask, critic, target);
        this.discussions.push({
            stage: '排練身段',
            aspirants: [n.criticName],
            turns: [
                { phase: '點戲', speaker: n.criticName, said: n.note },
                { phase: '對戲', speaker: n.targetName, said: n.ack },
            ],
            arbiter: n.targetName,
            arbitrationLine: n.ack,
            decision: `${n.criticName} 點 ${n.targetName} 台步 → ${n.targetName} 找師姐對戲`,
            rounds: LIGHT_ROUND_CAP,
            cap: LIGHT_ROUND_CAP,
            decided: true,
            reshape: null,
            refusal: null,
            revision: null,
        });
    }

    // ── One stage per world-tick (the 班主 advances under deadline pressure) ────
    /** Advance the production ONE stage. Runs the JUDGMENT-stage discussions (立意 /
     *  選角 / 填詞提意見 / 排練身段), injects the two seams via advance()'s idempotency
     *  guards, accrues rehearsal effort, records the timeline. */
    async step(ask: Ask, daysLeft: number, tick: number): Promise<StageStep> {
        const from = this.prod.state;
        if (from === 'PREMIERED') {
            const step: StageStep = { tick, days: daysLeft, from, to: from, who: '—', log: '（已首演）' };
            this.timeline.push(step);
            return step;
        }
        // 立意/選劇 discussion BEFORE the brief locks (its result overrides qizhi below).
        if (from === 'PROPOSED' && this.discussions.every((d) => d.stage !== '選劇立意')) await this.deliberateLiyiStage(ask);
        // Seam injection — pre-populate so advance() skips its packaged version.
        // CONTESTED casting is now argued out (seamCastDiscussion); uncontested → formula.
        if (from === 'CAST' && !this.prod.cast) this.prod.cast = await this.seamCastDiscussion(ask, this.prod.script!);
        if (from === 'VERSIFIED' && !this.prod.ci) {
            this.prod.ci = await this.seamWriteCi(this.prod.script!, this.prod.cast!, this.prod.scores!, ask);
            await this.ciNoteRound(ask); // 填詞提意見 → revise
        }
        // 排練身段 notes before the ensemble rehearses (身段/台步; 找師姐對戲).
        if (from === 'REHEARSING' && this.discussions.every((d) => d.stage !== '排練身段')) await this.rehearsalNoteRound(ask);

        await advance(this.prod, this.troupe, ask);

        // Inject the debated 立意 into the just-created brief (選劇 discussion → qizhi).
        if (from === 'PROPOSED' && this.liyiDecided && this.prod.brief) this.prod.brief.qizhi = this.liyiDecided;
        // `who` is read AFTER advance so it names the artifact just produced (script
        // author / composer / 詞 authors), keyed by the stage that was processed.
        const who = WHO_BY_STATE[from](this.prod, this);

        // Rehearsal effort accrues on every production-work tick once casting exists
        // (the days the show is being built = the season's rehearsal investment).
        if (this.prod.cast && from !== 'PROPOSED' && from !== 'SCRIPTED') {
            for (const c of this.prod.cast) if (c.assignedId) this.rehearsalEffort[c.assignedId] = (this.rehearsalEffort[c.assignedId] ?? 0) + 1;
        }
        // REHEARSING's takes add a per-performer bonus (a real take = extra effort).
        if (from === 'REHEARSING') for (const t of this.prod.takes ?? []) this.rehearsalEffort[t.actorId] = (this.rehearsalEffort[t.actorId] ?? 0) + 1;

        const log = this.prod.log[this.prod.log.length - 1] ?? '';
        const step: StageStep = { tick, days: daysLeft, from, to: this.prod.state, who, log };
        this.timeline.push(step);
        return step;
    }
}

const split = (s: string): string[] => s.split('\n').map((l) => l.trim()).filter(Boolean);
