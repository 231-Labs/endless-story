/**
 * 全體 — the ensemble "performs" (REHEARSING → PREMIERED).
 *
 * "Performing" here is rendered as LITERATURE, not synthesized AV: each cast
 * member writes a first-person POV of playing their part this run, then the
 * takes are woven into one Rashomon-style 戲中戲 章回 (reusing the live repo's
 * event-cut idea, pointed at a production instead of an event).
 */

import type { CastAssignment, PerformanceTake, Production, Script, TroupeMember } from '../types.ts';
import { askOr, mapPool, type Ask } from '../llm.ts';

export async function rehearse(
  prod: Production,
  script: Script,
  cast: CastAssignment[],
  troupe: TroupeMember[],
  ask: Ask,
): Promise<{ takes: PerformanceTake[]; chapter: string }> {
  const byId = new Map(troupe.map((m) => [m.id, m]));
  const climax = script.scenes.find((s) => s.mood === 'sorrow') ?? script.scenes[script.scenes.length - 1];

  // Each cast member's POV is independent → write them concurrently.
  const onStage = cast.filter((c) => c.assignedId && climax.parts.includes(c.partId));
  const takes: PerformanceTake[] = await mapPool(onStage, 3, async (c): Promise<PerformanceTake> => {
      const actor = byId.get(c.assignedId!)!;
      const emergentCi = prod.ci?.find((x) => x.source === 'emergent' && x.authorId === actor.id);
      const pov = await askOr(
        ask,
        {
          system: `你是${actor.name}（${actor.hangdang}行${c.crossCastLabel ? '，' + c.crossCastLabel + '反串' : ''}）。用第一人稱寫你演〈${climax.title}〉裡「${c.partName}」的此刻——戲裡的情與戲外的你如何交疊。3-5 句，不要旁白腔。一律使用繁體中文。`,
          user: `你的聲口：${actor.voice ?? '——'}。${emergentCi ? '你心裡正藏著一首沒說出口的詞。' : ''}`,
          maxTokens: 280,
          temperature: 0.95,
        },
        () => {
          if (c.crossCastLabel === '坤生')
            return `我提袍邁步，扮的是${c.partName}，可這雙手是我的。台上她（${climax.title}裡的對手）望過來，我差點忘了這是戲。坤生扮生，扮的是別人的情，難的是收住自己的。`;
          switch (c.partName) {
            case '白素貞':
              return `水袖一揚，我是白素貞，也是我自己。對面那個許仙，台下我認得太久了。斷橋斷的是戲，台下這座橋，我們誰也不敢先過。`;
            case '小青':
              return `我使一對劍，守在姐姐身側。斷橋上她與許仙的眼風來去，我插不進、也不敢久看——我的本分是擋，是看著她疼而動不得。`;
            default:
              return `我演${c.partName}，到了〈${climax.title}〉這一場，戲裡的情緒漫上來，戲外的我一時分不清哪句是詞、哪句是真。`;
          }
        },
      );
      return { partId: c.partId, partName: c.partName, actorId: actor.id, actorName: actor.name, pov };
  });

  const woven = await askOr(
    ask,
    {
      system: `你是春雪社副刊筆人。把以下幾位角兒對同一場〈${climax.title}〉的第一人稱，織成一回「戲中戲」章回——羅生門式、各人視角交錯，戲裡戲外互相映照。不超過 12 行。一律使用繁體中文；直接成段成文，不要在每行前標行號或序號。`,
      user: takes.map((t) => `【${t.actorName}飾${t.partName}】${t.pov}`).join('\n'),
      maxTokens: 700,
      temperature: 0.9,
    },
    () =>
      [
        `第一回　〈${climax.title}〉——戲裡戲外，各看各的`,
        ``,
        `同一場〈${climax.title}〉，台上幾人各看見不同的光景。`,
        ...takes.map((t) => `　${t.actorName}飾${t.partName}：${t.pov}`),
        ``,
        `——這一場，台上演的是戲，台下演的是他們自己。觀者只道做戲，誰知做的是真。`,
      ].join('\n'),
  );

  return { takes, chapter: woven };
}
