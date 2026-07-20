/**
 * Make the POV presentation contract deterministic without rewriting prose.
 * Models occasionally ignore the requested 4–6 paragraphs and return one long
 * block. We preserve every character and only insert blank lines at existing
 * Chinese sentence boundaries. Existing well-shaped prose is left untouched.
 */

/**
 * The 述 (per-tick, per-character POV) body is pure first-person prose — the 述 UI
 * already prints its own eyebrow (第X日·第Y拍·場景), so the body must NOT carry a
 * heading of its own. Models sometimes ignore that and open with a `# 場景題`
 * markdown heading or a guessed 「第X回」 chapter line (the 回 numbering was
 * unstable — the model invents it). This strips any such LEADING title line(s)
 * deterministically, so `eventPovs[].body` never starts with a heading regardless
 * of what the model emitted. Conservative: it only removes a heading-shaped first
 * line, never a real sentence of prose.
 */
function isPovTitleLine(line: string): boolean {
    const t = line.trim();
    if (!t) return false;
    // Any markdown heading, e.g. 「#」「## 場景題」「### 雪夜對唱」.
    if (/^#{1,6}(\s|$)/.test(t)) return true;
    // A 「第X回」/「第X折」chapter marker: the chapter word is followed by end-of-line
    // or a separator (：/space/、/dash) — so real prose like 「第三回想起那年」(回 = a
    // time) is NOT matched — and the line carries no sentence-ending punctuation and
    // stays short, the tells of a heading rather than a narrated sentence.
    if (
        /^第[〇零一二三四五六七八九十百千兩两0-9]+[回折](?:$|[：:、　\s—-])/.test(t) &&
        !/[。！？]/.test(t) &&
        t.length <= 24
    ) {
        return true;
    }
    return false;
}

/** Remove any leading heading line(s) (a `#` heading and/or a 「第X回」 chapter
 *  number) plus the blank line that follows. Returns pure prose. If stripping
 *  would empty the passage (a title-only reply), the original is kept. */
export function stripPovTitle(raw: string): string {
    const text = raw.trim();
    if (!text) return '';
    const lines = text.split('\n');
    let start = 0;
    while (start < lines.length) {
        if (isPovTitleLine(lines[start])) {
            start += 1;
            // also swallow blank separator lines under the stripped heading
            while (start < lines.length && !lines[start].trim()) start += 1;
            continue;
        }
        break;
    }
    const stripped = lines.slice(start).join('\n').trim();
    return stripped || text;
}

function existingParagraphs(text: string): string[] {
    return text.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
}

function sentences(text: string): string[] {
    return text
        .replace(/\s*\n\s*/g, '')
        .match(/[^。！？]+[。！？][」』”]?|[^。！？]+$/gu)
        ?.map((sentence) => sentence.trim())
        .filter(Boolean) ?? [];
}

export function formatPovSceneParagraphs(raw: string): string {
    const text = raw.trim();
    if (!text) return '';
    const shaped = existingParagraphs(text);
    if (shaped.length >= 3) return shaped.join('\n\n');

    const units = sentences(text);
    if (units.length < 3) return shaped.join('\n\n');
    const paragraphCount = Math.min(4, units.length);
    const groups: string[] = [];
    let cursor = 0;
    for (let group = 0; group < paragraphCount; group += 1) {
        const remainingUnits = units.length - cursor;
        const remainingGroups = paragraphCount - group;
        const take = Math.ceil(remainingUnits / remainingGroups);
        groups.push(units.slice(cursor, cursor + take).join(''));
        cursor += take;
    }
    return groups.join('\n\n');
}

export function povParagraphs(raw: string): string[] {
    return existingParagraphs(formatPovSceneParagraphs(raw));
}
