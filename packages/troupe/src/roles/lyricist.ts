/**
 * 填詞 (VERSIFIED → REHEARSING) — TWO-SOURCE, the heart of "各司其職 ≠ 派工".
 *
 *  1. COMMISSIONED: the production needs 詞 for a scene → an eligible writer
 *     fits words to the score's mood/板式 (skill-gated).
 *  2. EMERGENT (有感而發): a cast member, moved by her own memory/relationship,
 *     spontaneously writes a 詩詞. She need NOT be the assigned 詞作者 — a strong
 *     enough bond licenses the act. That personal 詞 is then offered to the play.
 *
 * This is where the 花旦 who loves the 坤生 since childhood writes about THAT,
 * and the play borrows her real feeling. Provenance is recorded so the artifact
 * shows where the emotion came from.
 */

import type { Ci, Score, Script, CastAssignment, TroupeMember } from '../types.ts';
import { askOr, askJson, type Ask } from '../llm.ts';
import { bestFor, movedToCreate, qualityBand, skill, CRAFT } from '../skills.ts';

export async function writeCi(
  script: Script,
  cast: CastAssignment[],
  scores: Score[],
  troupe: TroupeMember[],
  ask: Ask,
  auto = false,
): Promise<Ci[]> {
  const byId = new Map(troupe.map((m) => [m.id, m]));
  const out: Ci[] = [];

  // ── 1. Commissioned 詞 for the climactic scene ──
  const climax = script.scenes.find((s) => s.mood === 'sorrow') ?? script.scenes[script.scenes.length - 1];
  const score = scores.find((s) => s.forSceneId === climax.sceneId);
  const writer =
    bestFor(troupe, CRAFT.填詞, 50) ??
    [...troupe].sort((a, b) => skill(b, CRAFT.文墨) - skill(a, CRAFT.文墨))[0];
  const band = qualityBand(skill(writer, CRAFT.填詞));

  const commissioned = await askOr(
    ask,
    {
      system: `你是春雪社${writer.name}（填詞火候：${band}）。為《${script.title}》第〈${climax.title}〉場填一段唱詞，貼著「${score?.banshi ?? '二黃'}」的哀調，4 句，每句 7 字左右，押韻。只給 4 句詞。一律使用繁體中文。`,
      user: `場景：${climax.beats[0]?.summary ?? climax.title}。曲：${score?.banshi}（${score?.mode}）。`,
      maxTokens: 240,
      temperature: 0.9,
    },
    () =>
      ['西湖橋斷水猶寒', '十年一夢隔生關', '雄黃不誤緣先誤', '腸斷青衫只自看'].join('\n'),
  );
  out.push({
    forSceneId: climax.sceneId,
    title: `〈${climax.title}〉唱詞`,
    lines: commissioned.split('\n').map((l) => l.trim()).filter(Boolean),
    authorId: writer.id,
    authorName: writer.name,
    source: 'commissioned',
  });

  // ── 2. Emergent 詞 — 有感而發. WHO is moved is decided either by a hard
  //    threshold (default) or, with `auto`, by the character HERSELF (she reads
  //    her memories + who's in this cast and judges) — so it emerges instead of
  //    being pre-wired. Candidates = anyone bonded to a castmate, strongest first.
  const inCast = new Set(cast.map((c) => c.assignedId).filter(Boolean) as string[]);
  const candidates = troupe
    .map((member) => ({
      member,
      bond: [...member.relationships].filter((r) => inCast.has(r.withId)).sort((a, b) => b.intensity - a.intensity)[0],
    }))
    .filter((x): x is { member: TroupeMember; bond: NonNullable<typeof x.bond> } => !!x.bond)
    .sort((a, b) => b.bond.intensity - a.bond.intensity);

  let made = 0;
  for (const { member, bond } of candidates) {
    if (made >= 2) break; // keep it focused
    const other = byId.get(bond.withId);
    if (!other) continue;
    const aboutMemory = member.memories.find((m) => m.aboutId === other.id)?.text;

    // Is she moved? — her own judgment (auto) or the threshold (default).
    let moved: boolean;
    let why = `${bond.kind}，深度 ${bond.intensity}`;
    if (auto && !ask.mock) {
      const j = await askJson<{ moved: boolean; why?: string }>(
        ask,
        {
          kind: 'cheap',
          system: `你是${member.name}（${member.hangdang}行）。此刻在排《${script.title}》，台上對手有${other.name}（你與他/她：${bond.kind}，深度${bond.intensity}）。憑你心裡的事，你此刻是否「有感而發」、想私下寫一首詞？只輸出 JSON：{"moved":true或false,"why":"一句話"}。一律繁體中文。`,
          user: `你記得的事：${aboutMemory ?? '（無特別記憶）'}。`,
          maxTokens: 80,
          temperature: 0.8,
        },
        () => ({ moved: movedToCreate(member, CRAFT.填詞) && bond.intensity >= 75 }),
        (v): v is { moved: boolean; why?: string } => !!v && typeof (v as { moved?: unknown }).moved === 'boolean',
      );
      moved = j.moved;
      if (j.why) why = j.why;
    } else {
      moved = movedToCreate(member, CRAFT.填詞) && bond.intensity >= 75;
    }
    if (!moved) continue;

    const emergent = await askOr(
      ask,
      {
        system: `你是${member.name}（${member.hangdang}行）。不是被派去填詞——是此刻有感而發。你與${other.name}（${bond.kind}）情牽，這次又台上配對。寫一首私心的小詞/詩，4 句，含蓄、不點破，像寫給自己看的。只給 4 句。一律使用繁體中文。`,
        user: `關係：${bond.kind}（深度${bond.intensity}）。她/他的事：${aboutMemory ?? '自小一處學戲'}。`,
        maxTokens: 220,
        temperature: 0.95,
      },
      () => ['同學一曲到如今', '台上夫妻假亦真', '一隻手放肩頭暖', '我裝沒事到天明'].join('\n'),
    );

    out.push({
      forSceneId: null,
      title: `${member.name}·有感（贈${other.name}）`,
      lines: emergent.split('\n').map((l) => l.trim()).filter(Boolean),
      authorId: member.id,
      authorName: member.name,
      source: 'emergent',
      provenance: {
        kind: 'relationship',
        refId: other.id,
        why: `${why}；台上又配${cast.find((c) => c.assignedId === other.id)?.partName ?? '對手'}。`,
      },
    });
    made++;
  }

  return out;
}
