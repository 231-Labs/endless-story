/**
 * DISTILL — turn one character's Perception of one Scene into her five-layer
 * private memory. This is where "同一場談話 → 三份不同的私人現實" is produced.
 *
 * The five layers (only the first is near-fact; the rest are allowed to be biased,
 * to misread, to rationalise — that gap is the drama, per NARRATIVE_AGENTS.md §5):
 *   1 經歷   experience         — what I saw / heard / did
 *   2 解釋   interpretation     — what I think it meant
 *   3 關係   relationshipUpdates— who I now trust / fear / owe / doubt
 *   4 自我   selfNarrative      — what this proves about who I am
 *   5 傾向   dispositionUpdates — next time, I'm more likely to …
 * plus ledgerSeeds — 承諾 / 怨懟 / 疑問 / 風險 that a later scene can redeem.
 *
 * Distillation NEVER writes a crude verdict ("柳生春深愛金鳳"). It nudges the
 * shakeable inner structure (dispositions / stances) a little, and clamping in
 * integrate.ts keeps any one scene from flipping the person.
 */

import type {
  CharacterState,
  LedgerKind,
  Perception,
  PrivateSceneMemory,
  Scene,
  Valence,
} from './types.ts';
import type { Ctx } from './ctx.ts';
import { nameOf } from './ctx.ts';
import { askJson } from './llm.ts';

const READING_LINE: Record<Valence, (o: string) => string> = {
  tender: (o) => `${o}到底還是心疼我的`,
  perfunctory: (o) => `${o}不過是敷衍`,
  testing: (o) => `${o}是在試探我`,
  humiliating: () => `這是當眾要折我的臉`,
  threatening: (o) => `${o}這一下，是衝著我來的`,
  reassuring: (o) => `${o}是在安撫我`,
  evasive: (o) => `${o}那一頓，就是答案`,
  neutral: () => `沒什麼要緊`,
};

// Raw stance intent per reading (scaled by confidence, then clamped in integrate).
const REL_DELTA: Record<Valence, { t: number; f: number; d: number; s: number }> = {
  tender: { t: +0.6, f: -0.2, d: +0.4, s: -0.2 },
  reassuring: { t: +0.5, f: -0.5, d: +0.1, s: -0.3 },
  perfunctory: { t: -0.4, f: 0, d: 0, s: +0.2 },
  testing: { t: -0.3, f: +0.2, d: 0, s: +0.6 },
  evasive: { t: -0.4, f: +0.1, d: 0, s: +0.8 },
  humiliating: { t: -0.7, f: +0.5, d: 0, s: +0.4 },
  threatening: { t: -0.4, f: +0.7, d: 0, s: +0.5 },
  neutral: { t: 0, f: 0, d: 0, s: 0 },
};

// When a strong reading finds no matching disposition, seed a new one from this.
const NEW_DISPOSITION: Partial<Record<Valence, string>> = {
  evasive: '越來越信不過對方給的解釋',
  testing: '一被追問就先繃起來自保',
  humiliating: '把顏面看得比什麼都重',
  threatening: '遇到針對先想退到安全處',
  tender: '容易被一點體貼收買',
  perfunctory: '對敷衍越來越不耐',
};

const acts = (scene: Scene, ref: string): string => scene.transcript.find((l) => l.ref === ref)?.tags?.act ?? '';
const CARE_OR_DODGE = new Set(['照顧', '迴避', '沉默', '停頓', '許諾']);

/** Deterministic distiller — same shape as the LLM path, no external call. */
export function distillMock(state: CharacterState, scene: Scene, per: Perception, ctx: Ctx): PrivateSceneMemory {
  const conf = per.reading.confidence;
  const valence = per.reading.valence;

  // Who is this memory about? The strongest attended non-self speaker, else a present other.
  const focusId =
    per.attended
      .map((a) => scene.transcript.find((l) => l.ref === a.ref)?.who)
      .find((w) => w && w !== 'stage' && w !== state.id) ??
    scene.present.find((id) => id !== state.id) ??
    '';
  const other = focusId ? nameOf(ctx, focusId) : '對方';

  // Layer 1 · 經歷 — near-fact, from the slice she actually attended to.
  const attendedLines = per.attended
    .map((a) => scene.transcript.find((l) => l.ref === a.ref))
    .filter((l): l is Scene['transcript'][number] => !!l);
  const experience =
    attendedLines
      .map((l) => (l.who === 'stage' ? l.text : `${l.who === state.id ? '我' : nameOf(ctx, l.who)}：「${l.text}」`))
      .join('；') || `我在${scene.setting}，沒太往心裡去。`;

  // Layer 2 · 解釋 — the biased reading.
  const reading = READING_LINE[valence](other);

  // Layer 3 · 關係更新 — one stance move toward the focus.
  const relationshipUpdates = [] as PrivateSceneMemory['relationshipUpdates'];
  if (focusId && valence !== 'neutral') {
    const raw = REL_DELTA[valence];
    const k = conf * 0.6; // sub-cap; integrate clamps the magnitude regardless.
    relationshipUpdates.push({
      withId: focusId,
      dTrust: Number((raw.t * k).toFixed(3)),
      dFear: Number((raw.f * k).toFixed(3)),
      dDebt: Number((raw.d * k).toFixed(3)),
      dSuspicion: Number((raw.s * k).toFixed(3)),
      because: reading,
    });
  }

  // Layer 5 · 行為傾向 — reinforce matching dispositions, else seed one from a strong reading.
  const dispositionUpdates = [] as PrivateSceneMemory['dispositionUpdates'];
  let reinforced = '';
  for (const d of state.dispositions) {
    const grows = d.growsOn?.includes(valence);
    const keyed = per.attended.some((a) => d.text.includes(acts(scene, a.ref)) && acts(scene, a.ref).length > 0);
    if (grows || keyed) {
      dispositionUpdates.push({ text: d.text, dStrength: Number((0.12 * conf).toFixed(3)) });
      if (!reinforced) reinforced = d.text;
    }
  }
  if (dispositionUpdates.length === 0 && conf >= 0.6 && NEW_DISPOSITION[valence]) {
    dispositionUpdates.push({ text: NEW_DISPOSITION[valence]!, dStrength: Number((0.1 * conf).toFixed(3)) });
    reinforced = NEW_DISPOSITION[valence]!;
  }

  // Layer 4 · 自我敘事 — what it proves about her, echoing the reinforced tendency.
  const selfNarrative = reinforced
    ? `${reading}。我大概真是${reinforced}的人。`
    : `${reading}。這一場，我沒讓自己露出太多。`;

  // Ledger — future-redeemable hooks.
  const ledgerSeeds = [] as PrivateSceneMemory['ledgerSeeds'];
  const susp = state.stances.find((s) => s.withId === focusId)?.suspicion ?? 0;
  const seedFor: Partial<Record<Valence, LedgerKind>> = {
    humiliating: 'grudge',
    threatening: 'risk',
    testing: 'question',
    evasive: susp >= 0.5 ? 'grudge' : 'question',
    perfunctory: 'grudge',
    tender: 'promise',
  };
  const lk = seedFor[valence];
  if (lk && focusId) {
    const txt: Record<LedgerKind, string> = {
      grudge: `記著${other}今天這一下`,
      question: `${other}到底是不是那個意思，我要弄清楚`,
      risk: `${other}這一步，往後會出事`,
      promise: `${other}對我這份好，我記著`,
    };
    ledgerSeeds.push({ kind: lk, text: txt[lk], toward: focusId });
  }
  // Her OWN evasion/care in a relationship matter = a liability she just created.
  const selfDodged = per.attended.some((a) => {
    const l = scene.transcript.find((x) => x.ref === a.ref);
    return l?.who === state.id && CARE_OR_DODGE.has(l?.tags?.act ?? '');
  });
  if (selfDodged) {
    ledgerSeeds.push({ kind: 'risk', text: `我把話含糊過去了，這筆遲早要還`, toward: focusId || undefined });
  }

  return {
    sceneId: scene.id,
    charId: state.id,
    day: scene.day,
    attended: per.attended.map((a) => ({ ref: a.ref, why: a.why })),
    experience,
    interpretation: { reading, valence, confidence: conf },
    relationshipUpdates,
    selfNarrative,
    dispositionUpdates,
    ledgerSeeds,
  };
}

const VALENCES: Valence[] = ['tender', 'perfunctory', 'testing', 'humiliating', 'threatening', 'reassuring', 'evasive', 'neutral'];
function isMemory(v: unknown): v is PrivateSceneMemory {
  if (!v || typeof v !== 'object') return false;
  const m = v as PrivateSceneMemory;
  return typeof m.experience === 'string' && !!m.interpretation && VALENCES.includes(m.interpretation.valence) && Array.isArray(m.relationshipUpdates);
}

/** Real-LLM distiller — the five layers written in her own voice, from her own reading. */
export async function distill(state: CharacterState, scene: Scene, per: Perception, ctx: Ctx): Promise<PrivateSceneMemory> {
  const fallback = () => distillMock(state, scene, per, ctx);
  if (ctx.ask.mock) return fallback();

  const present = scene.present.map((id) => nameOf(ctx, id)).join('、');
  const attended = per.attended.map((a) => `[${a.ref}] ${scene.transcript.find((l) => l.ref === a.ref)?.text ?? ''}（她盯住：${a.why}）`).join('\n');
  const dispo = state.dispositions.map((d) => `- ${d.text}（${d.strength.toFixed(2)}）`).join('\n') || '（暫無）';
  const stanceOf = (id: string) => state.stances.find((s) => s.withId === id);

  const req = {
    system:
      `你是「${state.persona.name}」（${state.persona.role}）。聲口：${state.persona.voice}。性情：${state.persona.temperament}。\n` +
      `把剛經歷的一場，蒸餾成你私密的五層記憶。第一層貼近事實，其餘允許偏見、誤解、甚至自欺——這是你一個人的版本，別人看不到。\n` +
      `不要寫「我深愛某某」這種粗暴結論；只微調你內在的傾向與對人的看法。\n` +
      `只輸出 JSON：{"experience":"經歷·近乎事實","interpretation":{"reading":"我認為那代表什麼","valence":"tender|perfunctory|testing|humiliating|threatening|reassuring|evasive|neutral","confidence":0..1},` +
      `"relationshipUpdates":[{"withId":"角色id","dTrust":-1..1,"dFear":-1..1,"dDebt":-1..1,"dSuspicion":-1..1,"because":"…"}],` +
      `"selfNarrative":"這件事證明我是怎樣的人","dispositionUpdates":[{"text":"一句可累積的傾向","dStrength":-1..1}],` +
      `"ledgerSeeds":[{"kind":"promise|grudge|question|risk","text":"…","toward":"角色id或省略"}]}。只輸出 JSON。`,
    user:
      `在場：${present}（各人 id：${scene.present.map((id) => `${nameOf(ctx, id)}=${id}`).join('，')}）。\n` +
      `你既有的行為傾向：\n${dispo}\n\n你對焦點人物的私自看法：\n${scene.present.filter((id) => id !== state.id).map((id) => { const s = stanceOf(id); return `- ${nameOf(ctx, id)}(${id})：${s ? `信任${s.trust.toFixed(2)}/畏懼${s.fear.toFixed(2)}/虧欠${s.debt.toFixed(2)}/懷疑${s.suspicion.toFixed(2)}（${s.read}）` : '（初見）'}`; }).join('\n')}\n\n` +
      `【${scene.title}】你反覆想起的片段：\n${attended || '（沒什麼特別入心的）'}\n\n你此刻對整場的定調：${per.reading.valence}（confidence ${per.reading.confidence}）。`,
    maxTokens: 900,
    temperature: 0.75,
    kind: 'primary' as const,
  };
  const raw = await askJson<PrivateSceneMemory>(ctx.ask, req, fallback, isMemory);
  return { ...raw, sceneId: scene.id, charId: state.id, day: scene.day, attended: per.attended.map((a) => ({ ref: a.ref, why: a.why })) };
}
