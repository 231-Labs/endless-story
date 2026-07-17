/**
 * AGENT-SEASON · SPACE ACCESS (soft, owned, delegable) — v1.
 * ============================================================================
 * Private spaces have an OWNER; entry is a SOCIAL fact, not a wall. A character
 * knows which private rooms it may enter (own + granted); it normally respects
 * that. An owned room it lacks access to it cannot simply be inside — it waits at
 * the door — UNLESS it BREAKS IN (a deliberate, costly transgression; this is what
 * lets a jealous third 破門抓姦). Unowned venues (stage, practice room, the street,
 * the 歌場) are public — free to enter.
 *
 * v1 keeps the grant table STATIC (relationship-encoded): the seed relationships
 * decide who already holds a standing key (old lovers, the 師姐, the 金主). Dynamic
 * grant/revoke as a character tool is deferred until private-meeting + 抓姦 verify.
 */

/** venue → owning characterId. A venue absent here is PUBLIC (free to enter). */
export const VENUE_OWNER: Record<string, string> = {
    後台小廂房: '柳安春',
    二樓書寓: '蘇映雪',
    後進廂房: '江聞鶴',
    戲班大通鋪: '連翹', // communal武行 quarters (grants open it to the troupe)
    沈宅小樓: '沈雪笙',
    會樂里寓所: '金鳳',
    白公館繡樓: '白韻秋',
    後台妝閣: '沈雪笙', // 班主 controls the backstage 妝閣
    衣箱房: '沈雪笙', // the sealed 樟木戲箱 room — locked 15 years, nobody granted
};

/** venue → characterIds who hold a STANDING key (relationship-encoded from canon). */
export const STANDING_GRANTS: Record<string, string[]> = {
    後台小廂房: ['金鳳', '蘇映雪'], // 金鳳 = old lover; 蘇 = 師姐 who tends her things
    會樂里寓所: ['柳安春'], // 柳 = old lover, always let in
    二樓書寓: ['柳安春'], // 師妹
    戲班大通鋪: ['柳安春', '蘇映雪', '江聞鶴', '連翹'], // communal to the troupe
    後台妝閣: ['柳安春', '蘇映雪', '江聞鶴', '連翹', '白韻秋'], // troupe backstage + 白韻秋 the 金主
    // 衣箱房: (none) — sealed
    // 沈宅小樓 / 白公館繡樓 / 後進廂房: (none) — strictly private
};

/** Is this venue access-controlled at all (has an owner)? Else it is public. */
export const isOwned = (venue: string): boolean => venue in VENUE_OWNER;
export const ownerOf = (venue: string): string | undefined => VENUE_OWNER[venue];

/** May `charId` enter `venue`? Public venues: yes. Owned: only owner or a standing key. */
export function canEnter(charId: string, venue: string): boolean {
    const owner = VENUE_OWNER[venue];
    if (!owner) return true; // public / unowned
    if (owner === charId) return true;
    return (STANDING_GRANTS[venue] ?? []).includes(charId);
}

/** The private rooms this character may enter (own + granted) — for the plan prompt. */
export function accessibleOwnedVenues(charId: string): string[] {
    const out: string[] = [];
    for (const v of Object.keys(VENUE_OWNER)) if (canEnter(charId, v)) out.push(v);
    return out;
}

/** A one-line access note for the plan: where this character is welcome, where not. */
export function accessNote(charId: string): string {
    const yes = accessibleOwnedVenues(charId);
    const no = Object.keys(VENUE_OWNER).filter((v) => !canEnter(charId, v));
    const yesStr = yes.length ? yes.join('、') : '（沒有旁人的私處）';
    const noStr = no.length ? no.join('、') : '（無）';
    return `公共場所（戲台、練功房、歌場、霞飛路、包廂）你都能去。私處裡，你進得去：${yesStr}。進不去（要嘛有人領、要嘛硬闖）：${noStr}。`;
}
