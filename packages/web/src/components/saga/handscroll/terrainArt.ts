/**
 * Generated terrain art (郎世寧 half-西洋 oil set), one painting per location.
 * Name-matched so any saga covering these places gets the painted scroll; an
 * unmatched location falls back to a plain paper panel (never the old abstract
 * ink scenery — the illustration is the single source of scenery now).
 */
const TERRAIN_ART: Array<{ match: RegExp; src: string }> = [
  { match: /霞飛路/, src: '/handscroll/o-xiafeilu.jpg' },
  { match: /雲錦台|戲園|戲院/, src: '/handscroll/o-yunjintai.jpg' },
  { match: /四馬路|報館/, src: '/handscroll/o-simalu.jpg' },
  { match: /碼頭|蘇州河/, src: '/handscroll/o-matou.jpg' },
  { match: /會樂里/, src: '/handscroll/o-huileli.jpg' },
  { match: /會館|紹興/, src: '/handscroll/o-huiguan.jpg' },
  { match: /大世界|遊樂/, src: '/handscroll/o-dashijie.jpg' },
];

export function terrainArtFor(name: string | undefined): string | null {
  if (!name) return null;
  for (const a of TERRAIN_ART) if (a.match.test(name)) return a.src;
  return null;
}
