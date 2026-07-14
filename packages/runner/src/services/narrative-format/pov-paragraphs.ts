/**
 * Make the POV presentation contract deterministic without rewriting prose.
 * Models occasionally ignore the requested 4–6 paragraphs and return one long
 * block. We preserve every character and only insert blank lines at existing
 * Chinese sentence boundaries. Existing well-shaped prose is left untouched.
 */

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
