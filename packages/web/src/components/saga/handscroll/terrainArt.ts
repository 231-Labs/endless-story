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

/**
 * Generated scene 團扇 art (same oil style), matched by scene name. Used as the
 * fan face until a real still exists on the scene (scene.imageUrl overrides).
 */
const SCENE_ART: Array<{ match: RegExp; src: string }> = [
  // Specific names FIRST — first match wins (報館閣樓 must not fall into 報館).
  { match: /小廂房/, src: '/handscroll/s-xiaoxiangfang.jpg' },
  { match: /後進廂房/, src: '/handscroll/s-houjin.jpg' },
  { match: /大通鋪/, src: '/handscroll/s-datongpu.jpg' },
  { match: /閣樓/, src: '/handscroll/s-gelou.jpg' },
  { match: /花廳|長三/, src: '/handscroll/s-changsan.jpg' },
  { match: /書寓/, src: '/handscroll/s-shuyu.jpg' },
  { match: /鄉賢|正堂/, src: '/handscroll/s-xiangxian.jpg' },
  { match: /寓所/, src: '/handscroll/s-jinfeng.jpg' },
  { match: /沈宅/, src: '/handscroll/s-shenzhai.jpg' },
  { match: /白公館|繡樓/, src: '/handscroll/s-baigongguan.jpg' },
  { match: /戲園前街|霞飛路/, src: '/handscroll/s-xiafeilu-jie.jpg' },
  { match: /戲台|雲錦台/, src: '/handscroll/s-yunjintai-tai.jpg' },
  { match: /包廂|茶座/, src: '/handscroll/s-baoxiang.jpg' },
  { match: /妝閣/, src: '/handscroll/s-zhuangge.jpg' },
  { match: /衣箱/, src: '/handscroll/s-yixiang.jpg' },
  { match: /報館/, src: '/handscroll/s-baoguan.jpg' },
  { match: /碼頭/, src: '/handscroll/s-matou.jpg' },
];

export function sceneArtFor(name: string | undefined): string | null {
  if (!name) return null;
  for (const a of SCENE_ART) if (a.match.test(name)) return a.src;
  return null;
}
