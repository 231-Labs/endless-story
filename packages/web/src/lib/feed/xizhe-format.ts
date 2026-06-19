/**
 * Parse an assembled 戲折 (the markdown @endless-story/troupe `assembleXiZhe`
 * anchors on chain) into a structured playbill, so the feed can lay it out as a
 * 戲單 instead of dumping raw markdown. Pure + dependency-free — both the card
 * excerpt (ProductionList) and the detail playbill (XiZheView) read from this,
 * and it's offline-testable against assembleXiZhe's output.
 *
 * Tolerant by design: it parses the CURRENT format but degrades gracefully on
 * older/odd blobs (missing sections just come back empty) and strips the legacy
 * "可收藏" promo line so it never renders.
 */

export interface XiZheCastRow {
    /** 角色 (役名), e.g. 白素貞. */
    part: string;
    /** 演員 (角兒), e.g. 連翹. null when 缺角. */
    actor: string | null;
    /** 行當, e.g. 旦. */
    hangdang?: string;
    /** 應工, e.g. 青衣. */
    yinggong?: string;
    /** 反串 label 坤生/乾旦, when the actor's gender ≠ the role's. */
    cross?: string;
}

export interface XiZheScene {
    n: number;
    title: string;
    /** mood key (joy/serene/…); render via moodLabel() for a Chinese tag. */
    mood?: string;
}

/** One actor's first-person take on the 戲中戲 climax — the attributed 視角. */
export interface XiZhePov {
    /** 角兒 (the performer), e.g. 連翹. */
    actorName: string;
    /** 角色 (the role played), e.g. 白素貞. */
    partName: string;
    /** 反串 label 坤生/乾旦, when the actor's gender ≠ the role's. */
    cross?: string;
    /** the first-person account. */
    text: string;
}

export interface XiZheDoc {
    /** inner title without 《》, e.g. 白蛇傳·全本. */
    title: string | null;
    /** the line under the title, e.g. 白蛇傳　純排戲折（無音律）　·　6 角 7 場. */
    subtitle: string | null;
    /** 立意. */
    premise: string | null;
    /** 班主. */
    director: string | null;
    /** 氣質. */
    qizhi: string | null;
    cast: XiZheCastRow[];
    scenes: XiZheScene[];
    /** the 折子 climax scene name, e.g. 斷橋. */
    climaxTitle: string | null;
    /** the 戲中戲 narrative prose (markdown/plain). */
    prose: string;
    /** per-actor attributed 視角 of the climax (the source POVs of the woven prose). */
    povs: XiZhePov[];
    /** 角兒私詞 (有感而發), when present. */
    song: { title: string | null; lines: string[] } | null;
}

const MOOD_ZH: Record<string, string> = {
    joy: '喜',
    serene: '和',
    longing: '念',
    tense: '驚',
    wrath: '怒',
    sorrow: '悲',
};

/** English mood key → a single elegant Chinese tag for the 戲單 (pass-through if unknown). */
export function moodLabel(mood?: string): string | null {
    if (!mood) return null;
    return MOOD_ZH[mood] ?? mood;
}

/** Drop the legacy promo footer + horizontal rules so they never render. */
function isNoise(line: string): boolean {
    const t = line.trim();
    return (
        t === '---' ||
        t === '***' ||
        /春雪社\s*出品\s*·\s*此折可收藏/.test(t) ||
        /上鏈為數位藏品/.test(t)
    );
}

const reTitle = /《(.+?)》/;
const reCast = /^[-*]\s*\*\*(.+?)\*\*\s*[—–-]\s*(.+?)\s*(?:（(.*?)）)?\s*(?:〔(.+?)〕)?\s*$/;
const reScene = /^(\d+)\.\s*〈(.+?)〉\s*(?:（(.+?)）)?\s*$/;
const reClimax = /折子\s*·\s*戲中戲\s*〈(.+?)〉/;
const reSong = /角兒私詞\s*·\s*《(.+?)》/;
const reTakeHead = /^###\s+(.+?)\s*飾\s*(.+?)\s*(?:〔(.+?)〕)?\s*$/;

export function parseXiZhe(bodyRaw: string): XiZheDoc {
    const lines = bodyRaw.replace(/\r\n/g, '\n').split('\n');
    const doc: XiZheDoc = {
        title: null,
        subtitle: null,
        premise: null,
        director: null,
        qizhi: null,
        cast: [],
        scenes: [],
        climaxTitle: null,
        prose: '',
        povs: [],
        song: null,
    };

    type Section = 'head' | 'cast' | 'scenes' | 'prose' | 'povs' | 'song';
    let section: Section = 'head';
    const proseLines: string[] = [];
    const songLines: string[] = [];
    let currentPov: XiZhePov | null = null;

    for (const raw of lines) {
        const line = raw.replace(/\s+$/, '');
        const t = line.trim();
        if (isNoise(t)) continue;

        // section switches — only on KNOWN headings. An unknown "## …" falls
        // through to the section-body handling below, so a stray heading inside
        // the 折子 prose stays prose instead of truncating the chapter.
        const h2 = t.match(/^##\s+(.+)$/);
        if (h2) {
            const h = h2[1];
            if (h.startsWith('班底')) {
                section = 'cast';
                continue;
            }
            if (h.startsWith('分場')) {
                section = 'scenes';
                continue;
            }
            if (reClimax.test(h)) {
                section = 'prose';
                doc.climaxTitle = h.match(reClimax)?.[1] ?? null;
                continue;
            }
            if (h.startsWith('各角視角') || h.startsWith('視角')) {
                section = 'povs';
                continue;
            }
            if (reSong.test(h)) {
                section = 'song';
                doc.song = { title: h.match(reSong)?.[1] ?? null, lines: [] };
                continue;
            }
            // unknown ## → fall through (kept as prose/song content)
        }

        // Title + meta blockquotes live ONLY in the head region — inside the 折子
        // prose a `#`/`>` line is chapter content (e.g. a quoted line), not
        // metadata, so it must reach proseLines rather than be consumed here.
        if (section === 'head') {
            const h1 = t.match(/^#\s+(.+)$/);
            if (h1) {
                const inner =
                    h1[1].match(reTitle)?.[1] ??
                    h1[1].replace(/^春雪社\s*·\s*戲折\s*·\s*/, '').replace(/[《》]/g, '').trim();
                doc.title = inner || null; // 「《》」(no title) → null so downstream fallbacks fire
                continue;
            }
            const q = t.match(/^>\s*(.+)$/);
            if (q) {
                const m = q[1];
                if (m.startsWith('立意')) doc.premise = m.replace(/^立意[：:]\s*/, '').trim();
                else if (m.startsWith('班主')) {
                    const parts = m.split(/　?·　?氣質[：:]/);
                    doc.director = parts[0].replace(/^班主[：:]\s*/, '').trim();
                    if (parts[1]) doc.qizhi = parts[1].trim();
                }
                continue;
            }
        }

        if (section === 'cast') {
            const c = t.match(reCast);
            if (c) {
                const actor = c[2].trim();
                const hy = (c[3] ?? '').split('/');
                doc.cast.push({
                    part: c[1].trim(),
                    actor: !actor || actor === '（缺角）' ? null : actor,
                    hangdang: hy[0]?.trim() || undefined,
                    yinggong: hy[1]?.trim() || undefined,
                    cross: c[4]?.trim() || undefined,
                });
            }
            continue;
        }

        if (section === 'scenes') {
            const s = t.match(reScene);
            if (s) doc.scenes.push({ n: Number(s[1]), title: s[2].trim(), mood: s[3]?.trim() || undefined });
            continue;
        }

        if (section === 'povs') {
            const th = t.match(reTakeHead);
            if (th) {
                currentPov = { actorName: th[1].trim(), partName: th[2].trim(), cross: th[3]?.trim() || undefined, text: '' };
                doc.povs.push(currentPov);
            } else if (t && currentPov) {
                currentPov.text = currentPov.text ? `${currentPov.text}\n${t}` : t;
            }
            continue;
        }

        if (section === 'prose') {
            proseLines.push(line.replace(/^#{1,6}\s+/, '')); // demote a stray heading → plain prose
            continue;
        }

        if (section === 'song') {
            if (t) songLines.push(t);
            continue;
        }

        // head region, a bare line → the subtitle (first one wins)
        if (t && doc.subtitle == null) doc.subtitle = t;
    }

    doc.prose = proseLines.join('\n').trim();
    if (doc.song) doc.song.lines = songLines;
    return doc;
}

/** A clean one-line summary for the card excerpt — 立意 if present, else the prose opening. */
export function xiZheExcerpt(doc: XiZheDoc, max = 110): string {
    const base = doc.premise || doc.prose.replace(/[#*_`>]/g, '').replace(/\s+/g, ' ').trim();
    return base.length > max ? `${base.slice(0, max)}…` : base;
}
