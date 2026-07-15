/**
 * Domain types for the season harness — a chain-decoupled model of
 * INDIVIDUALISED memory formation.
 *
 * The thesis (from docs/narrative/NARRATIVE_AGENTS.md §5, "主觀記憶 / 不強制
 * canon"): the interesting unit is not "can a character remember a conversation"
 * but "how one shared experience leaves a DIFFERENT change in each character, and
 * how that difference produces observable, differentiated future behaviour."
 *
 * So a single objective Scene fans out into one PrivateSceneMemory PER present
 * character, each shaped by that character's prior persona + relationships (the
 * personality acts BEFORE distillation — it decides what she even notices and how
 * she reads it), and each write feeds back to slowly move the persona. The loop:
 *
 *   人格／關係 → 如何理解對話 → 記住什麼 → 如何重新解釋自己與對方
 *              → 人格／關係緩慢改變 → 下一次採取不同的行動
 *
 * Deliberately self-contained — NO dependency on @endless-story/shared or any
 * on-chain type, exactly like packages/economy and packages/troupe. Wiring the
 * five layers onto the live MemWal kinds (observation/reflection/relationship/
 * genesis/plan) is a gate-after step; see WRITEUP.md §"Port path".
 */

// ── How a line lands emotionally (the reading, not the fact) ──────────────
/** 體貼 / 敷衍 / 試探 / 羞辱 / 威脅 / 安撫 / 迴避（停頓）/ 中性. */
export type Valence =
  | 'tender'
  | 'perfunctory'
  | 'testing'
  | 'humiliating'
  | 'threatening'
  | 'reassuring'
  | 'evasive'
  | 'neutral';

/** Human labels for a report / prompt. */
export const VALENCE_LABEL: Record<Valence, string> = {
  tender: '體貼',
  perfunctory: '敷衍',
  testing: '試探',
  humiliating: '羞辱',
  threatening: '威脅',
  reassuring: '安撫',
  evasive: '迴避',
  neutral: '中性',
};

// ── The shakeable inner structure (NOT "柳生春深愛金鳳") ──────────────────
/**
 * A disposition is accumulable and shakeable — e.g. 「親密時傾向用照顧代替承諾」,
 * 「害怕被要求明確選擇」. Distillation reinforces or erodes these; it never writes
 * a crude verdict. Strength is bounded and can only move a little per scene
 * (see integrate.ts) so personality drifts, never flips on one conversation.
 */
export interface Disposition {
  id: string;
  text: string;
  /** 0..1 */
  strength: number;
  /** readings that reinforce this disposition when a scene lands that way. */
  growsOn?: Valence[];
  originScene: string;
  updatedScene: string;
}

/**
 * A's SUBJECTIVE stance toward B — per-character, private, may be wrong. This is
 * NOT the shared/objective relationship canon (that stays on the director side).
 * A and B can hold asymmetric, mutually-inconsistent stances about each other.
 */
export interface Stance {
  withId: string;
  /** -1..1 */
  trust: number;
  /** 0..1 */
  fear: number;
  /** 0..1 — 虧欠. */
  debt: number;
  /** 0..1 — 懷疑. */
  suspicion: number;
  /** one-line current subjective read of the other. */
  read: string;
  updatedScene: string;
}

// ── Future-redeemable hooks a scene can seed ─────────────────────────────
/** 承諾 / 怨懟 / 疑問 / 風險. */
export type LedgerKind = 'promise' | 'grudge' | 'question' | 'risk';
export const LEDGER_LABEL: Record<LedgerKind, string> = {
  promise: '承諾',
  grudge: '怨懟',
  question: '疑問',
  risk: '風險',
};

export interface LedgerItem {
  id: string;
  kind: LedgerKind;
  text: string;
  /** the other character this is aimed at, if any. */
  toward?: string;
  openedScene: string;
  redeemedScene?: string;
  status: 'open' | 'redeemed';
}

// ── A character's seed identity ──────────────────────────────────────────
export interface Persona {
  id: string;
  name: string;
  /** 行當 / 身份. */
  role: string;
  /** 聲口 — one-line voice hint. */
  voice: string;
  /** prose seed that biases perception from day one. */
  temperament: string;
  /**
   * Salience priors — what this persona is primed to NOTICE and how she is primed
   * to READ it. The deterministic (mock) perceiver reads these to make the same
   * transcript land differently on each character; the real-LLM perceiver ignores
   * them and infers attention from `temperament` + accumulated state.
   */
  primed: {
    /** topic/act/tone tags this persona snaps to (drives attention). */
    attendsTo: string[];
    /** default reading for a tag when she attends to it. */
    reads: Record<string, Valence>;
  };
  seedDispositions: Disposition[];
  seedStances: Stance[];
}

// ── The evolving private state (the thing that is "self-optimised") ──────
export interface CharacterState {
  id: string;
  persona: Persona;
  dispositions: Disposition[];
  stances: Stance[];
  ledger: LedgerItem[];
  /** the per-scene private memory stream, newest last. */
  memories: PrivateSceneMemory[];
}

// ── The objective, shared stage ──────────────────────────────────────────
/** One objective line of a scene — the SAME words reach everyone present. */
export interface TranscriptLine {
  /** stable id, e.g. "s2.l3". */
  ref: string;
  /** speaker id, or 'stage' for a 科介 (stage direction). */
  who: string;
  /** the words / action, stated objectively (no interpretation). */
  text: string;
  /**
   * Lightweight, character-agnostic semantic tags. The deterministic perceiver
   * scores attention off these; the real-LLM perceiver ignores them and reads
   * `text`. Keeping them neutral (not per-character) is what makes divergence
   * EMERGE from the personas rather than being hand-fed per character.
   */
  tags?: { topic?: string; act?: string; tone?: string };
}

export type SceneKind = 'scripted' | 'enacted';
export interface Scene {
  id: string;
  title: string;
  /**
   * scripted = a controlled stimulus (fixed transcript, same words hit everyone) —
   * the clean way to test differentiated distillation.
   * enacted  = present characters ACT from their accumulated state to produce the
   *            transcript — the way to test that memory changes behaviour.
   */
  kind: SceneKind;
  /** character ids on stage. */
  present: string[];
  setting: string;
  /** narrative day (recency + gradual-drift observation). */
  day: number;
  /** scripted: the fixed transcript. enacted: filled in by the engine. */
  transcript: TranscriptLine[];
  /** enacted scenes: the situation each present character is reacting to. */
  situation?: string;
  /** enacted scenes: topic tag stamped on the lines the characters produce. */
  topic?: string;
}

// ── PERCEIVE output: attention + reading, BEFORE distillation ────────────
export interface Perception {
  charId: string;
  sceneId: string;
  /** which objective lines snagged her, why, and how each landed. */
  attended: { ref: string; why: string; valence: Valence; weight: number }[];
  /** her overall reading of the scene. */
  reading: { valence: Valence; confidence: number };
}

// ── The five layers: ONE character's private memory of ONE scene ─────────
export interface RelationshipUpdate {
  withId: string;
  dTrust: number;
  dFear: number;
  dDebt: number;
  dSuspicion: number;
  because: string;
}

export interface DispositionUpdate {
  /** matches (fuzzily) an existing disposition, or seeds a new one. */
  text: string;
  dStrength: number;
}

export interface LedgerSeed {
  kind: LedgerKind;
  text: string;
  toward?: string;
}

export interface PrivateSceneMemory {
  sceneId: string;
  charId: string;
  day: number;
  /** Layer 0 · 注意 — which objective moments she even registered, and why. */
  attended: { ref: string; why: string }[];
  /** Layer 1 · 經歷 — near-fact, first person, observable (the only near-objective layer). */
  experience: string;
  /** Layer 2 · 解釋 — the biased reading (體貼／敷衍／試探／羞辱…). */
  interpretation: { reading: string; valence: Valence; confidence: number };
  /** Layer 3 · 關係更新 — deltas she applies to her subjective stances. */
  relationshipUpdates: RelationshipUpdate[];
  /** Layer 4 · 自我敘事 — what this proves about who she is. */
  selfNarrative: string;
  /** Layer 5 · 行為傾向 — dispositions reinforced / created / weakened. */
  dispositionUpdates: DispositionUpdate[];
  /** future-redeemable hooks this scene seeds. */
  ledgerSeeds: LedgerSeed[];
}

// ── A character's differentiated action in an enacted scene ──────────────
export interface Enactment {
  charId: string;
  sceneId: string;
  /** a compact tag for the move, e.g. 'deflect' / 'confront' / 'withdraw'. */
  move: string;
  /** the character this move is aimed at. */
  toward: string;
  /** the visible line (≤ ~40 字). */
  line: string;
  /** the private WHY driving it (inner thought). */
  because: string;
  /** which accumulated memories/dispositions drove it (provenance = causality). */
  drivenBy: string[];
}

// ── Config knobs (bounded drift) ─────────────────────────────────────────
export interface SeasonConfig {
  /** max |Δ| a single scene may move any stance axis — the gradual-drift clamp. */
  maxStanceStep: number;
  /** max |Δ| a single scene may move a disposition strength. */
  maxDispositionStep: number;
}

export const DEFAULT_CONFIG: SeasonConfig = {
  maxStanceStep: 0.15,
  maxDispositionStep: 0.2,
};

// ── What one season run records (drives artifacts + metrics) ─────────────
export interface SceneRun {
  scene: Scene;
  /** per present character, in scene.present order. */
  perceptions: Perception[];
  memories: PrivateSceneMemory[];
  /** enacted scenes only: what each present character did. */
  enactments?: Enactment[];
  /** snapshot of EVERY cast member's state just before this scene was integrated. */
  castBefore: Record<string, CharacterState>;
}

export interface SeasonResult {
  cast: string[];
  names: Record<string, string>;
  config: SeasonConfig;
  /** initial (seed) states. */
  seeds: Record<string, CharacterState>;
  /** states after the whole season. */
  finalStates: Record<string, CharacterState>;
  runs: SceneRun[];
}
