/**
 * MIND-WORLD PHYSICS — the pure, unit-testable core of the postman.
 * ============================================================================
 * Every rule about WHO perceives WHAT lives here as a pure function, so each
 * mechanism is testable in isolation (research-line rule: 實驗必對照＋機械
 * counter). run.ts wires these to the LLM loop; tests drive them with
 * scripted acts and assert deliveries.
 */

/** function-word characters — a bigram containing one is too weak to prove
 *  an object mention (「的舊」 once matched 白蘭的舊事 against 舊懷錶). */
const STOP_CHAR = /[的了一是在把那這只之其個裡]/;

/** bigram overlap — does the narration mention this object? */
export function mentionsItem(text: string, itemDesc: string): boolean {
    const clean = itemDesc.replace(/[（(].*?[)）]/g, '');
    for (let i = 0; i + 2 <= clean.length; i++) {
        const gram = clean.slice(i, i + 2);
        if (!/[一-鿿]{2}/.test(gram) || STOP_CHAR.test(gram)) continue;
        if (text.includes(gram)) return true;
    }
    return false;
}

/** looser matcher for EXPLICIT intent (贈 field): a short colloquial item
 *  name (「摺扇」) must still find its ledger entry (「對扇・情債柄」) —
 *  fall back to a shared content CHARACTER when the name is short. */
export function matchesItemName(itemName: string, itemDesc: string): boolean {
    if (mentionsItem(itemName, itemDesc) || mentionsItem(itemDesc, itemName)) return true;
    if (itemName.length <= 3) {
        const clean = itemDesc.replace(/[（(].*?[)）]/g, '');
        for (const ch of itemName) {
            if (/[一-鿿]/.test(ch) && !STOP_CHAR.test(ch) && clean.includes(ch)) return true;
        }
    }
    return false;
}

const GIVE_VERB = /留給|遞給|送給|交給|留下|相贈|贈與/;

/** Narrated giving: verb and object must be CLAUSE-NEIGHBOURS (±14 chars) —
 *  a sentence with boxes-given-to-X and keys elsewhere must not hand over
 *  the keys. Returns the carried index and the receiver name found in the
 *  same window (undefined receiver = caller may fall back to a two-person
 *  scene's other party). */
export function parseGiftNarration(
    text: string,
    carried: string[],
    otherNames: string[],
): { itemIdx: number; receiverName?: string } | null {
    const vm = text.match(GIVE_VERB);
    if (!vm || vm.index === undefined) return null;
    const win = text.slice(Math.max(0, vm.index - 14), vm.index + vm[0].length + 14);
    const itemIdx = carried.findIndex((d) => mentionsItem(win, d));
    if (itemIdx < 0) return null;
    const receiverName = otherNames.find((n) => win.includes(n));
    return { itemIdx, receiverName };
}

/** Explicit 贈 field: "物件｜給誰". */
export function parseGiftField(
    field: string,
    carried: string[],
    otherNames: string[],
): { itemIdx: number; itemName: string; receiverName?: string } | null {
    const [itemName, rcvName] = field.split(/[｜|]/).map((s) => s.trim());
    if (!itemName) return null;
    const itemIdx = carried.findIndex((d) => matchesItemName(itemName, d));
    const receiverName = otherNames.find((n) => rcvName && (rcvName.includes(n) || n.includes(rcvName)));
    return { itemIdx, itemName, receiverName };
}

/** Whisper: "對誰｜說什麼" → target must be co-present. */
export function parseWhisper(
    field: string,
    presentNames: string[],
): { targetName: string; content: string } | null {
    const [rcvName, content] = field.split(/[｜|]/).map((s) => s.trim());
    if (!rcvName || !content) return null;
    const targetName = presentNames.find((n) => rcvName.includes(n) || n.includes(rcvName));
    return targetName ? { targetName, content } : null;
}

/** Letter (捎信): "給誰｜信裡的話" → recipient may be ANYWHERE. Unlike a
 *  whisper (co-present, instant), a letter crosses distance and arrives on a
 *  DELAY (the postman's real job) — the physic that unblocks cross-venue
 *  contact when腿 alone can't reach. Recipient resolves against the whole
 *  cast, not just the present room. */
export function parseLetter(
    field: string,
    castNames: string[],
): { toName: string; content: string } | null {
    const [rcvName, content] = field.split(/[｜|]/).map((s) => s.trim());
    if (!rcvName || !content) return null;
    const toName = castNames.find((n) => rcvName.includes(n) || n.includes(rcvName));
    return toName ? { toName, content } : null;
}

/** Bolting/opening one's own door is an act the world parses. */
export function parseDoorIntent(narration: string): 'lock' | 'unlock' | null {
    if (/閉門|落閂|上閂|插上門|鎖上門|閂上/.test(narration)) return 'lock';
    if (/開門|拔閂|啟門|把門敞/.test(narration)) return 'unlock';
    return null;
}

export interface Move {
    name: string;
    fromCluster: string;
    toCluster: string;
    to: string;
}

/** Street sightings: two same-hour movers glimpse each other ONLY when
 *  (a) they are not converging on the same venue, and (b) their routes
 *  plausibly cross — the cluster sets of the two routes overlap. */
export function sightingPairs(moves: Move[]): Array<[Move, Move]> {
    const pairs: Array<[Move, Move]> = [];
    for (let i = 0; i < moves.length; i++)
        for (let j = i + 1; j < moves.length; j++) {
            const a = moves[i];
            const b = moves[j];
            if (a.to === b.to) continue;
            const aClusters = new Set([a.fromCluster, a.toCluster]);
            if (!aClusters.has(b.fromCluster) && !aClusters.has(b.toCluster)) continue;
            pairs.push([a, b]);
        }
    return pairs;
}

/** SCENE FEED — the fix for the single-slot carry hole: every participant
 *  hears EVERYTHING since their own last turn, not just the previous
 *  speaker. Departures stop hearing at the moment they leave; whatever a
 *  participant never got prompted with is flushed to them at scene end. */
export class SceneFeed {
    private entries: Array<{ by: string; note: string }> = [];
    private cursor = new Map<string, number>();
    private departAt = new Map<string, number>();

    /** record an act/event visible to the whole room. */
    push(by: string, note: string): void {
        this.entries.push({ by, note });
    }

    markDeparted(name: string): void {
        this.departAt.set(name, this.entries.length);
    }

    /** everything this participant hasn't been shown yet (their own acts
     *  excluded); advances their cursor. */
    unseen(name: string): string {
        const from = this.cursor.get(name) ?? 0;
        const to = this.departAt.get(name) ?? this.entries.length;
        const slice = this.entries.slice(from, Math.max(from, to)).filter((e) => e.by !== name);
        this.cursor.set(name, Math.max(from, to));
        return slice.map((e) => e.note).join(' ');
    }

    /** scene-end flush: what they witnessed but were never prompted with. */
    flush(name: string): string {
        return this.unseen(name);
    }
}
