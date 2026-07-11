/**
 * Character Agent — BEAT PROMPT (pure leaf, node-clean).
 * ============================================================================
 * Everything here is a pure string builder / derivation with ZERO imports — no
 * `@endless-story/llm`, no `.js` specifiers — so it loads under plain
 * `node --test` type-stripping. The engine package's mechanical tests import
 * this file directly (exports entry `./services/character-agent/beat-prompt`)
 * to assert prompt content (pronoun guard, gender note) without dragging the
 * tsx-only runner barrel into the module graph. `beat.ts` re-exports the whole
 * surface, so package consumers are unaffected.
 */

export type BeatForcing = 'idle' | 'pressing' | 'edge' | 'breaking';

export interface ActBeatInput {
    name: string;
    persona: string;
    /** Memory snippets — surface only when the moment calls (§2.45 暗號 echoes). */
    memories?: string[];
    /** Saga tone line (profile-sourced; e.g. warm base). */
    tone?: string;
    /** Clock label, e.g. 黃昏. */
    clock: string;
    sceneName: string;
    isPrivate: boolean;
    /** Co-present characters (empty = alone). `role` = 行當; `tie` = the actor's
     *  OWN canon feeling toward them (e.g. 你對TA：師承) so address forms come
     *  from the graph, not guesswork. Never carries the reverse edge — the
     *  other's inner state reaches an actor only through enacted behavior.
     *  `bodyFact` = a short in-world phrase for that co-present person's 身/sex,
     *  used ONLY to make the intimacy register gender-correct (data-driven). */
    others: Array<{ name: string; role?: string; tie?: string; bodyFact?: string }>;
    /** This character's OWN 身/sex phrase — half of the gender-aware intimacy note
     *  (the other half is each co-present other's bodyFact). Never a name special-case. */
    bodyFact?: string;
    /** This beat CONTINUES a still-warm encounter (same pair, same private venue, the
     *  immediately preceding tick): pick up mid-moment, no fresh entrance / re-locking.
     *  Only ever set on a scene's first beat. */
    continuation?: boolean;
    /** The tail of the prior scene, as opening context for a continuation. */
    priorTail?: string;
    /** External pressure line (風聲), first beat only. */
    stake?: string;
    want: { desc: string; target?: string };
    forcing: BeatForcing;
    /** Private scene, exactly two present, and the want's target is the other one. */
    privateAlone: boolean;
    /** Last few beats of this scene's exchange. */
    sceneLog: string;
    /** Daily-life undertone line (state block), optional. */
    stateLine?: string;
    /** This character's own private inner-life secret; never another actor's.
     *  Colours the beat's subtext; hidden by default, but whether it ever
     *  surfaces is the character's own in-scene choice (§2.43: never script it). */
    innerSecret?: string;
    /** Canon honorifics facts (identity guardrail, e.g. 蘇映雪為師姐). */
    etiquette?: string;
    /** §2.47/§2.53: saga stance is consummate AND this beat is privateAlone on
     *  a love-layer want — unlocks the classical literary-erotic register and
     *  a longer beat. Anywhere else the beat is byte-identical to before. */
    consummate?: boolean;
}

/**
 * GENERAL pronoun derivation from a 身/sex phrase (data-driven, never name-cased):
 * a bodyFact naming 男 → 他, everything else → 她. Used to name each co-present
 * person's correct pronoun so the prose stops defaulting 她 onto a male co-star.
 */
export function pronounFromBody(bodyFact?: string): '他' | '她' {
    return bodyFact && bodyFact.includes('男') ? '他' : '她';
}

/**
 * GENERAL pronoun-guard line composed from the ACTUAL cast's bodyFacts (this actor +
 * each co-present other that carries a 身 phrase). No names or pairings hardcoded —
 * the correct 他/她 for each present person is derived from their bodyFact.
 */
function pronounNote(input: ActBeatInput): string {
    const people: string[] = [`${input.name}是${pronounFromBody(input.bodyFact)}`];
    for (const o of input.others) {
        if (o.bodyFact) people.push(`${o.name}是${pronounFromBody(o.bodyFact)}`);
    }
    if (people.length <= 1) return '';
    return `【稱呼在場的人用對的代詞】${people.join('、')}——別張冠李戴、別把男子寫成「她」。`;
}

/** §2.53-validated L3 register (the quality/stability sweet spot; L5-style
 *  "maximally explicit" wording regresses output and is deliberately absent). */
const CONSUMMATE_BEAT_NOTE = [
    '【此刻分寸（僅此私處、兩情相悅時）】容許寬衣解帶、肌膚相親、雲雨纏綿，並可細狀其實——',
    '身體的反應、氣息的亂、節奏的緩急、手與唇的門道、情動到極處的失守，皆可落筆，',
    '不必每到關頭就化開。以古典艷情話本筆法（敢於露骨、卻仍是綺麗）：艷而有情、露而不穢。',
    '忌現代醫學詞、忌髒字、忌器官說明書式冷描。',
].join('');

/**
 * GENERAL, data-driven gender note for a consummate beat — composed at call time
 * from the ACTUAL participants' bodyFacts (this actor's own 身 + each co-present
 * other's 身). NO names or pairings are hardcoded; the LLM judges gender + state +
 * style from the data, so it works for 女女 / 男女 / 男男 alike. When the pair share
 * a long history, the bodies/years lead the beat, not the transactional errand.
 */
function genderNote(input: ActBeatInput): string {
    const you = input.bodyFact ? `${input.name}（${input.bodyFact}）` : input.name;
    const withBody = input.others.filter((o) => o.bodyFact);
    const them = withBody.length
        ? withBody.map((o) => `${o.name}（${o.bodyFact}）`).join('、')
        : input.want.target ?? '對方';
    // SAME-SEX detection is data-driven (both 身 derive to the same 他/她) and only
    // fires when we hold both bodyFacts. It bans heteronormative penetration + the
    // invent-an-organ hedge (「沒根的東西」-type) that a 女女 床戲 wrongly produced.
    const other = withBody[0];
    const sameSex =
        !!input.bodyFact && !!other?.bodyFact && pronounFromBody(input.bodyFact) === pronounFromBody(other.bodyFact);
    const sameSexNote = sameSex
        ? '【同性之間的分寸】你二人是同一種身子，這場親密在手、在口、在身體相貼、在廝磨廝纏、在腿股腰背的糾纏，' +
          '**不在插入**；切勿寫成一方「進入」另一方，更**不許無中生有**寫出兩人身上都沒有的物事' +
          '（「那沒根的東西」「下身那物」這類含糊器官一概不許）。露骨可以，但要合乎兩具真實的身子。'
        : '';
    return (
        `【此刻兩人的身】此間${you}與${them}赤誠相對——` +
        '依兩人各自的身與此刻情狀，如實寫這場雲雨，合乎兩人性別，勿張冠李戴、' +
        '勿憑空生出對方身上沒有的器官；筆法、主動被動、剛柔皆隨兩人性情，不落套。' +
        '若兩人本有多年情分，就讓那身子與歲月裡的熟稔牽著這一段走——那樁熱望不過是個由頭，' +
        '真正承著這一刻的，是兩具早已相識的身與那些年。' +
        sameSexNote +
        // §金瓶梅 is talk-heavy: keep it dialogue-rich, and let the lead pass back and
        // forth (no fixed 純受). General — no names, no pairing assumptions.
        '【筆法】金瓶梅式的艷情是話多的：這一拍要嘛有一句話、要嘛有一個帶著性子的反應，別只是乾寫身體；' +
        '主動與被動要來回流轉，別讓某一方每一拍都是不出聲的純受——有取有予，兩個人都在這場裡。'
    );
}

export interface BeatResult {
    /** Objective act/say, one line. */
    beat: string;
    /** Private thought, one line. */
    inner: string;
    /** Who this beat addresses (co-present name), if anyone. */
    addressed?: string;
    /** Scene name to move to, if leaving. */
    move?: string;
}

/** §2.43-validated pressure language: removes stalling, never writes the answer. */
function forceNote(forcing: BeatForcing, privateAlone: boolean): string {
    if (forcing === 'idle')
        return privateAlone
            ? '此處只你二人、沒有眼睛，這是難得能這樣挨著的時候，順著心。'
            : '這事藏著就藏著、緩著就緩著。';
    if (forcing === 'pressing')
        return privateAlone
            ? '無人看著，藏了多年的，在這方寸裡有點按不住了。'
            : '心裡翻著，可人前多半還是按下不表。';
    if (forcing === 'breaking')
        // H3: past the edge — the want has become unbearable. Cross the line
        // this beat; the answer is still yours (confess, reckon, break, or bolt).
        return privateAlone
            ? '到頭了，一個字也壓不回去——只你二人，這一刻把積在心底最深的那句話、那個動作做出來，放不回頭也認了。'
            : '到頭了，再壓下去人就要散了——就在這些眼睛底下，做出那件放不回頭的事，由你的心。';
    return privateAlone
        ? '再也按不住了——只你二人、沒有眼睛，這年頭唯一能這樣的地方，這一刻全由你的心。'
        : '再也按不住了——這一刻你得做一件放不回頭的事，由你的心。';
}

export function buildBeatSystemPrompt(input: ActBeatInput): string {
    const mem = input.memories?.length
        ? `\n你心底偶爾翻起的舊事(對景就讓它浮上來、不對景別硬提)：\n- ${input.memories.join('\n- ')}`
        : '';
    const where = `你在【${input.sceneName}】${input.isPrivate ? '(私房)' : ''}，同場：${
        input.others.length
            ? input.others
                  .map((o) => {
                      const facts = [o.role, o.tie].filter(Boolean).join('｜');
                      return facts ? `${o.name}（${facts}）` : o.name;
                  })
                  .join('、')
            : '只你一人'
    }。`;
    const state = input.stateLine ? `\n${input.stateLine}` : '';
    const innerSecret = input.innerSecret
        ? `\n【心底藏著、外人不知的事（只有你自己知道。平日它藏著、只從言外之意漏出來；藏不藏得住、要不要讓它見光，由你在這一拍自己拿主意）】${input.innerSecret}`
        : '';
    return [
        `你就是${input.name}。${input.persona}${mem}`,
        input.tone ?? '',
        `【此刻】${input.clock}。${where}${input.stake ? `\n【風聲】${input.stake}` : ''}${state}${innerSecret}`,
        pronounNote(input),
        input.etiquette ? `【稱謂鐵則】${input.etiquette}——輩分與稱呼不可顛倒、不可自創。` : '',
        // A continuation picks up a still-warm private encounter mid-moment (general;
        // keyed by caller on pair+venue+consecutive-tick). No fresh entrance, no re-lock.
        input.continuation
            ? `【承接前情】你們方才已在此處相擁纏綿，這一刻是同一段未了的光景往下走，不是重新進門、不必再敲門落鎖，順著剛才的姿態與氣息接續。${input.priorTail ? `方才到這裡：${input.priorTail}` : ''}`
            : '',
        input.consummate ? CONSUMMATE_BEAT_NOTE + genderNote(input) : '',
        `你心裡最重的：「${input.want.desc}」${input.want.target ? `（牽涉${input.want.target}）` : ''}。`,
        '一場戲裡，別把同一個比方、同一句口頭禪翻來覆去地用，話要活。',
        forceNote(input.forcing, input.privateAlone),
        input.consummate
            ? '**這是一段正在進行的來回，接著剛剛的話與動作往下、回應在場的人，別自說自話。** 做你此刻真會做或說的一件事——可以是一個動作、一句話、或床笫間的一下進退(一到三句，容許上述分寸的露骨)。' +
              '輸出 JSON：{"beat":"客觀做了/說了什麼","inner":"心裡一句","addressed":"你這拍對著誰(在場某人名/無)","move":"要去別處就填場景名/否則無"}。不要 markdown。'
            : '**這是一段正在進行的來回，接著剛剛的話往下、回應在場的人，別自說自話。** 做你此刻真會做或說的一件事(開放一句)。' +
              '輸出 JSON：{"beat":"客觀做了/說了什麼(一句)","inner":"心裡一句","addressed":"你這拍對著誰(在場某人名/無)","move":"要去別處就填場景名/否則無"}。不要 markdown。',
    ]
        .filter(Boolean)
        .join('\n');
}
