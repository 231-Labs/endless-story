/** 編劇 — writes a STRUCTURED script (SCRIPTED → CAST). Skill-gated. */

import type { ProductionBrief, Scene, Script, ScriptLine, TroupeMember } from '../types.ts';
import { askJson, mapPool, type Ask } from '../llm.ts';
import { resolvePlay } from '../repertoire.ts';
import { bestFor, qualityBand, skill, CRAFT } from '../skills.ts';

function isScriptLines(v: unknown): v is ScriptLine[] {
  return (
    Array.isArray(v) &&
    v.length > 0 &&
    v.every((x) => {
      if (!x || typeof x !== 'object') return false;
      const t = (x as { type?: unknown }).type;
      return t === 'stage' || t === 'line';
    })
  );
}

/** Coerce loose model output into clean ScriptLine[] (mode defaults to 念). */
function normalize(lines: ScriptLine[], names: string[]): ScriptLine[] {
  return lines
    .map((l): ScriptLine | null => {
      if (l.type === 'stage') return { type: 'stage', text: String((l as { text?: unknown }).text ?? '') };
      const who = String((l as { who?: unknown }).who ?? names[0] ?? '');
      const mode = (l as { mode?: unknown }).mode === '唱' ? '唱' : '念';
      return { type: 'line', who, mode, text: String((l as { text?: unknown }).text ?? '') };
    })
    .filter((l): l is ScriptLine => l !== null && (l.type === 'stage' ? l.text.length > 0 : l.text.length > 0));
}

function fallbackScene(
  o: { summary: string; mood: string },
  names: string[],
  premise: string,
): ScriptLine[] {
  const closer =
    o.mood === 'sorrow' ? '琴起反二黃，水袖掩面。' : o.mood === 'tense' ? '鑼鼓四擊頭，急急風。' : '小鑼輕點，雙影入場。';
  return [
    { type: 'stage', text: o.summary },
    ...names.map(
      (n, idx): ScriptLine => ({ type: 'line', who: n, mode: idx === 0 ? '唱' : '念', text: idx === 0 ? premise : o.summary }),
    ),
    { type: 'stage', text: closer },
  ];
}

export async function writeScript(brief: ProductionBrief, troupe: TroupeMember[], ask: Ask): Promise<Script> {
  const play = resolvePlay(brief.classicKey);
  const parts = play.parts;
  const nameById = new Map(parts.map((p) => [p.partId, p.partName]));

  const author =
    bestFor(troupe, CRAFT.編劇, 50) ??
    [...troupe].sort((a, b) => skill(b, CRAFT.文墨) - skill(a, CRAFT.文墨))[0];
  const band = qualityBand(skill(author, CRAFT.編劇));

  // Scenes are independent → generate concurrently, capped (a 大戲 has many scenes).
  const scenes: Scene[] = await mapPool(brief.sceneOutline, 3, async (o, i): Promise<Scene> => {
      const names = o.parts.map((id) => nameById.get(id) ?? id);

      const lines = await askJson<ScriptLine[]>(
        ask,
        {
          system:
            `你是春雪社編劇${author.name}（編劇火候：${band}）。為《${brief.title}》寫一場戲。` +
            `**只輸出 JSON 陣列**，每個元素是一行：科介用 {"type":"stage","text":"…"}；念白或唱用 {"type":"line","who":"角色姓名","mode":"念"或"唱","text":"…"}。` +
            `8–12 行，文白相間，至少 2 條科介。一律繁體中文；who 只能是在場角色姓名（${names.join('、')}），不可用代號。` +
            `立意：「${brief.premise}」。只輸出 JSON，不要任何其他文字。`,
          user: `第${i + 1}場〈${o.title}〉（${o.mood}）：${o.summary}。在場：${names.join('、')}。`,
          maxTokens: 800,
          temperature: 0.9,
        },
        () => fallbackScene(o, names, brief.premise),
        isScriptLines,
      );

      return {
        sceneId: `s${i + 1}`,
        title: o.title,
        parts: o.parts,
        mood: o.mood,
        beats: [
          { beat: 1, summary: o.summary, tension: o.mood === 'sorrow' ? 0.8 : o.mood === 'tense' ? 0.9 : 0.3, mood: o.mood },
        ],
        lines: normalize(lines, names),
      };
  });

  return {
    title: brief.title,
    premise: brief.premise,
    parts,
    scenes,
    authorId: author.id,
    authorName: author.name,
  };
}
