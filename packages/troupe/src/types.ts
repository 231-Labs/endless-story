/**
 * Domain types for the standalone troupe-production harness.
 *
 * Deliberately self-contained — NO dependency on @endless-story/shared or any
 * on-chain type. This package only proves the creative pipeline produces
 * coherent, usable artifacts; chain wiring (skills DOF, production.move, Walrus)
 * is a gate-after step, exactly like packages/economy is to the live economy.
 */

// ── 行當 (role-type) ──────────────────────────────────────────────
/** Top-level 行當. 樂 = 文武場 (the musicians: 琴師 / 鼓師). */
export type Hangdang = '生' | '旦' | '淨' | '丑' | '樂';

/** 應工 (sub-type within a 行當). A member may be 兩門抱 (hold several). */
export type Yinggong =
  | '文小生' | '武小生' | '老生' | '武生' | '紅生' | '娃娃生'
  | '青衣' | '花旦' | '花衫' | '武旦' | '刀馬旦' | '老旦'
  | '銅錘花臉' | '架子花臉' | '武淨'
  | '文丑' | '武丑'
  | '琴師' | '鼓師';

/** Actor's real gender — kept ORTHOGONAL to a role's gender (乾旦/坤生). */
export type Gender = 'male' | 'female';

export type Mood = 'sorrow' | 'longing' | 'tense' | 'joy' | 'wrath' | 'serene';

// ── A living troupe member ───────────────────────────────────────
export interface Skill {
  /** craft/competence key, e.g. 編劇 / 作曲 / 填詞 / 唱腔 / 身段 / 文墨 / 武場. */
  key: string;
  label: string;
  /** 0..100 — gates "who can author what" + dials "how good". */
  value: number;
}

export interface MemoryNote {
  id: string;
  text: string;
  mood?: Mood;
  /** the other member this memory is about, if any (fuels emergent craft). */
  aboutId?: string;
}

export interface Relationship {
  withId: string;
  /** e.g. 青梅竹馬 / 同台夫妻 / 師徒 / 班主與角兒. */
  kind: string;
  /** 0..100 emotional intensity — high intensity can move a character to create. */
  intensity: number;
  note?: string;
}

export interface TroupeMember {
  id: string;
  /** on-chain Character object id (0x…) — the key into MemWal. Absent for offline fixtures. */
  chainId?: string;
  name: string;
  hangdang: Hangdang;
  /** 應工 the member is trained for (first = primary). */
  yinggong: Yinggong[];
  actorGender: Gender;
  skills: Skill[];
  memories: MemoryNote[];
  relationships: Relationship[];
  /** one-line in-world voice hint (the role-traits.ts idea, kept local). */
  voice?: string;
}

// ── Production artifacts (what each 行當 outputs) ─────────────────
export interface Part {
  partId: string;
  /** 許仙 / 白素貞 / 小青. */
  partName: string;
  hangdang: Hangdang;
  yinggong: Yinggong;
  /** the ROLE's gender (orthogonal to whoever plays it). */
  roleGender: Gender;
  martial: '文' | '武' | '文武';
}

export interface CastAssignment extends Part {
  assignedId: string | null;
  assignedName: string | null;
  actorGender: Gender | null;
  /** actorGender !== roleGender — a feature (prestige), never an error. */
  isCrossCast: boolean;
  crossCastLabel: '乾旦' | '坤生' | null;
  /** 兩門抱 understudies (other members who could fit). */
  alternates: string[];
  note?: string;
}

export interface SceneBeat {
  beat: number;
  summary: string;
  /** 0..1 dramatic tension. */
  tension: number;
  mood: Mood;
}

/** One structured line of a scene — either a 科介 (stage direction) or a spoken/sung line. */
export type ScriptLine =
  | { type: 'stage'; text: string }
  | { type: 'line'; who: string; mode: '念' | '唱'; text: string };

export interface Scene {
  sceneId: string;
  title: string;
  /** partIds on stage. */
  parts: string[];
  mood: Mood;
  beats: SceneBeat[];
  /** structured body — ordered 科介 / 念白 / 唱 lines (LLM JSON, or templated in mock). */
  lines: ScriptLine[];
}

export interface Script {
  title: string;
  premise: string;
  parts: Part[];
  scenes: Scene[];
  authorId: string;
  authorName: string;
}

/** A 琴師's composition — a human-playable SCORE, not an audio file. */
export interface NoteEvent {
  /** 简谱 degree token, e.g. '6' / '6̣' (low) / '6̇' (high). */
  degree: string;
  /** MIDI pitch, for the .mid render. */
  midi: number;
  /** duration in quarter-note beats. */
  beats: number;
}

export interface Score {
  forSceneId: string;
  title: string;
  /** 板式, e.g. 二黃·反調 慢板. */
  banshi: string;
  /** 調式, e.g. 羽調式（la 為主音）. */
  mode: string;
  /** key for a human player (e.g. guitar): '1=C（當 Am 彈）'. */
  keyForPlayer: string;
  tempoBpm: number;
  /** human-readable 简谱 line. */
  jianpu: string;
  notes: NoteEvent[];
  articulation: { at: string; tech: string }[];
  composerId: string;
  composerName: string;
}

/** 詞 — may be commissioned for a scene, OR emergent from a character's heart. */
export interface Ci {
  forSceneId: string | null;
  title: string;
  lines: string[];
  authorId: string;
  authorName: string;
  source: 'commissioned' | 'emergent';
  /** for emergent 詞: where the feeling came from. */
  provenance?: { kind: 'relationship' | 'memory'; refId: string; why: string };
}

export interface PerformanceTake {
  partId: string;
  partName: string;
  actorId: string;
  actorName: string;
  /** first-person account of performing the role this run. */
  pov: string;
}

// ── The Production (a durable state machine) ─────────────────────
/**
 * Lifecycle = the PENDING step (durable-execution style: state names the next
 * transition to perform, one per "narrative day"). The harness advances one
 * step per loop; in the product this is one step per tick, gated on a day
 * boundary + treasury check.
 */
export type Lifecycle =
  | 'PROPOSED'   // pending: 班主 proposes the production
  | 'SCRIPTED'   // pending: 編劇 writes the script
  | 'CAST'       // pending: 導演 casts the 行當
  | 'SCORED'     // pending: 琴師 composes
  | 'VERSIFIED'  // pending: 花旦 writes 詞
  | 'REHEARSING' // pending: ensemble performs + weave 戲中戲
  | 'PREMIERED'; // terminal

export interface ProductionBrief {
  /** repertoire key the 班主 chose (e.g. 'baishe' / 'honglou'). */
  classicKey: string;
  classicSource: string;
  title: string;
  premise: string;
  /** 氣質 — the production's temperament. */
  qizhi: string;
  budget: number;
  sceneOutline: { title: string; mood: Mood; summary: string; parts: string[] }[];
  directorId: string;
  directorName: string;
}

export interface Production {
  productionId: string;
  sagaId: string;
  /** repertoire key chosen at creation; the 班主 proposes from it. */
  classicKey: string;
  /** skip the 琴師 SCORED step (--no-score) — pure 排戲, no 音律. */
  skipScore?: boolean;
  /** autonomy mode (--auto): characters self-judge 有感而發 instead of a threshold. */
  auto?: boolean;
  state: Lifecycle;
  brief?: ProductionBrief;
  script?: Script;
  cast?: CastAssignment[];
  scores?: Score[];
  ci?: Ci[];
  takes?: PerformanceTake[];
  /** the woven 戲中戲 章回 (Rashomon of the cast's POVs). */
  chapter?: string;
  /** human-readable transition log. */
  log: string[];
}
