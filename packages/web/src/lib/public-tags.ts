import type { CharacterCandidate, RolledAttribute } from '@endless-story/llm/prompts';

export const PUBLIC_TAG_LIMIT = 6;

export interface PublicTagContext {
    candidate: CharacterCandidate;
    rolledValues: RolledAttribute[];
    recruitmentSpecialty?: string;
    recruitmentIntent?: string;
}

export function deriveFallbackPublicTags(input: PublicTagContext): string[] {
    const tags: string[] = [];
    const roleTag = rolePublicTag(input.recruitmentSpecialty);
    if (roleTag) tags.push(roleTag);

    const text = [
        input.recruitmentSpecialty,
        input.recruitmentIntent,
        input.candidate.name,
        input.candidate.description,
        input.candidate.physicalFacts.body,
    ]
        .filter(Boolean)
        .join(' ');
    const appearance = attr(input.rolledValues, 'appearance', '外貌');
    const constitution = attr(input.rolledValues, 'constitution', '筋骨');
    const acuity = attr(input.rolledValues, 'acuity', '機敏');
    const disposition = attr(input.rolledValues, 'disposition', '心性');

    if (appearance >= 90) tags.push('麗質天生');
    else if (appearance >= 78) tags.push('容色出眾');
    if (constitution >= 84) tags.push('筋骨清健');
    else if (constitution > 0 && constitution <= 34) tags.push('身骨單薄');
    if (acuity >= 84) tags.push('眉目機敏');
    if (disposition >= 84) tags.push('心性沉著');
    else if (disposition > 0 && disposition <= 36) tags.push('性情難馴');

    if (hasAny(text, ['刀馬旦', '武旦', '武場', '槍', '馬', '拳'])) tags.push('武場底子');
    if (hasAny(text, ['花旦', '正旦', '台柱', '頭牌'])) tags.push('台緣出眾');
    if (hasAny(text, ['小生', '坤生', '乾生', '文生', '武生'])) tags.push('台口風流');
    if (hasAny(text, ['老生', '淨行', '大面'])) tags.push('台口沉穩');
    if (hasAny(text, ['彩旦', '小丑', '丑角'])) tags.push('急智生趣');
    if (hasAny(text, ['主胡', '樂師', '琴', '鼓板', '弓弦'])) tags.push('弓弦老到');
    if (hasAny(text, ['班主', '票房', '包廂', '掮客', '經理', '茶會'])) tags.push('交際伶俐');
    if (hasAny(text, ['副刊', '報館', '唱片', '文墨', '學生', '書'])) tags.push('文墨清通');
    if (hasAny(text, ['摩登', '模特', '百貨', '照相', '租界', '洋場', '舞廳'])) tags.push('摩登新派');

    const publicTags = sanitizePublicTags(tags);
    if (publicTags.length > (roleTag ? 1 : 0)) return publicTags.slice(0, PUBLIC_TAG_LIMIT);
    return sanitizePublicTags([...publicTags, '初露鋒芒']).slice(0, PUBLIC_TAG_LIMIT);
}

export function mergePublicTags(primary: string[], extra: string[], limit = PUBLIC_TAG_LIMIT): string[] {
    const base = sanitizePublicTags(primary);
    const socialExtra = socialTagsOnly(sanitizePublicTags(extra));
    return sanitizePublicTags([...base, ...socialExtra]).slice(0, limit);
}

export function rolePublicTag(role: string | undefined): string | null {
    const clean = role?.trim().replace(/\s+/g, '');
    if (!clean) return null;
    return `role:${clean.slice(0, 24)}`;
}

export function socialTagsOnly(tags: string[]): string[] {
    return tags.filter((tag) => !tag.startsWith('role:'));
}

export function sanitizePublicTags(tags: string[]): string[] {
    const out: string[] = [];
    for (const tag of tags) {
        const raw = tag.trim();
        const clean = raw.startsWith('role:') ? cleanRoleTag(raw) : cleanSocialTag(raw);
        if (!clean || out.includes(clean)) continue;
        out.push(clean);
    }
    return out;
}

function cleanRoleTag(raw: string): string | null {
    const role = raw.slice('role:'.length).trim().replace(/\s+/g, '');
    if (!role) return null;
    return `role:${role.slice(0, 24)}`;
}

function cleanSocialTag(raw: string): string | null {
    const cleaned = raw
        .trim()
        .replace(/^#+/, '')
        .replace(/\s+/g, '')
        .replace(/[，、。；;：:|/\\()[\]{}"'`~!@#$%^&*_+=<>?？！,.-]/g, '');
    if (!cleaned) return null;
    if (SOCIAL_TAG_BANNED_TERMS.some((term) => cleaned.includes(term))) return null;
    if (cleaned.startsWith('role')) return null;
    if (cleaned.length < 2 || cleaned.length > 6) return null;
    return cleaned;
}

const SOCIAL_TAG_BANNED_TERMS = ['秘密', '未來', '將來', '命定', '官配', 'CP', 'cp'];

function attr(values: RolledAttribute[], key: string, label: string): number {
    return values.find((v) => v.key === key || v.label === label)?.value ?? 0;
}

function hasAny(text: string, needles: string[]): boolean {
    return needles.some((needle) => text.includes(needle));
}
