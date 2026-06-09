/**
 * 廂房 Chamber — room-generation prompts.
 *
 * The agent does NOT grow 3D geometry. It reads a character's saga context and,
 * on a fixed prop catalog, *chooses* items / gives parameters / picks stills /
 * places them — emitting a structured Scene Spec (JSON). A second pass critiques
 * the spec against the chapters (the self-check loop = the run record / scoring
 * centrepiece). See `docs/chamber/07_生成管線_詳解`.
 *
 * Coordinate convention given to the model: metres, origin at the room centre,
 * x→right, y→up, z→toward viewer; keep |x|,|z| ≲ 2.5 (platform radius ~3 m),
 * y ≥ 0 (floor) or atop furniture. The web mapper offset-encodes these into the
 * on-chain millimetre layout.
 */
import type { BuildPromptResult } from './moderation.js';

/** A catalog entry, flattened for the prompt (no blob ids / urls). */
export interface CatalogEntryForPrompt {
  id: string;
  /** 'static' | 'parametric' | 'still' */
  type: string;
  /** semantic tags, e.g. ['家具','書房']. */
  tags: string[];
  /** for parametric items: allowed parameter ranges/options. */
  paramsSchema?: Record<string, unknown>;
}

export interface SceneSpecObject {
  catalogId: string;
  /** parametric items: a chosen, in-range parameter set. */
  params?: Record<string, unknown>;
  /** still items: which moment / who is in the frame. */
  stillRef?: { characters?: string[]; moment?: string };
  /** metres, origin at room centre. */
  pos: [number, number, number];
  /** degrees, 0..359. */
  yaw: number;
  /** percent, 100 = 1.0x. */
  scale: number;
  /** one-line justification tying the object to the saga (for the critic + log). */
  reason: string;
}

export interface SceneSpec {
  room: {
    style: string;
    palette: string[];
    lighting: string;
  };
  objects: SceneSpecObject[];
}

export interface Critique {
  ok: boolean;
  issues: string[];
}

export interface BuildSceneSpecPromptOptions {
  name: string;
  role: string;
  /** distilled persona phrases or a short profile line. */
  personaLine: string;
  /** recent chapter excerpts (most-recent first), already trimmed. */
  chapters: string[];
  catalog: CatalogEntryForPrompt[];
  /** labels of available stills for 掛軸 (人物誌 / 章回 key-art). */
  stills: string[];
  /** issues from a prior critique pass, to repair. */
  issues?: string[];
}

const SYSTEM = `你是「無盡故事」說書平台的廂房佈置師。給你一個戲曲角色的本色與近況、一份固定的「道具目錄」、以及可用的劇照清單，你要為這個角色佈置一座漂浮在虛空中的廂房。

規則：
- 只能從目錄挑 catalog_id，不可自創物件。
- static 直接擺；still 必須指定劇照（誰在畫面、哪個時刻）。
- 座標用公尺，原點在房間正中，x→右、y→上、z→朝觀者；|x|、|z| 控制在 2.4 以內，y≥0（落地）或擺在家具上。
- 構圖規則（重要，避免擠成一堆）：家具盡量靠平台邊緣或後方（z 取負值、或 |x| 較大）；中前方（z>0 一帶）留給角色站位，不要放大型家具擋住角色。物件彼此至少間隔 0.6m，不可重疊堆疊。
- 每件物件給一句 reason，把它扣回角色的近況/本色。
- 至少放 1 張劇照掛軸。控制在 4~6 件，克制、有敘事密度，不要塞滿。
- 只輸出 JSON，不要任何解釋或 markdown。`;

export function buildSceneSpecPrompt(opts: BuildSceneSpecPromptOptions): BuildPromptResult {
  const catalogLines = opts.catalog
    .map((c) => {
      const schema = c.paramsSchema ? ` · 參數schema:${JSON.stringify(c.paramsSchema)}` : '';
      return `- ${c.id}（${c.type}）tags:${c.tags.join('/')}${schema}`;
    })
    .join('\n');
  const chapterLines = opts.chapters.length
    ? opts.chapters.map((c, i) => `${i + 1}. ${c}`).join('\n')
    : '（暫無章回，依本色佈置）';
  const stillLines = opts.stills.length ? opts.stills.map((s) => `- ${s}`).join('\n') : '（無）';
  const repair = opts.issues?.length
    ? `\n\n上一版的問題，請修正：\n${opts.issues.map((i) => `- ${i}`).join('\n')}`
    : '';

  const user = `角色：${opts.name}（${opts.role}）
本色：${opts.personaLine}

近況章回：
${chapterLines}

道具目錄：
${catalogLines}

可用劇照：
${stillLines}
${repair}

輸出 JSON，嚴格格式：
{"room":{"style":"…","palette":["…"],"lighting":"…"},"objects":[{"catalogId":"…","params":{},"stillRef":{"characters":["…"],"moment":"…"},"pos":[x,y,z],"yaw":0,"scale":100,"reason":"…"}]}`;

  return {
    system: SYSTEM,
    messages: [{ role: 'user', content: user }],
    maxTokens: 1600,
  };
}

/** Parse the Scene Spec JSON (tolerant of fences / prose). null if malformed. */
export function parseSceneSpecResponse(text: string): SceneSpec | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const obj = JSON.parse(text.slice(start, end + 1)) as Partial<SceneSpec>;
    const room = obj.room ?? { style: '', palette: [], lighting: '' };
    const rawObjects = Array.isArray(obj.objects) ? obj.objects : [];
    const objects: SceneSpecObject[] = [];
    for (const o of rawObjects) {
      const oo = o as Partial<SceneSpecObject>;
      if (!oo.catalogId || !Array.isArray(oo.pos) || oo.pos.length !== 3) continue;
      objects.push({
        catalogId: String(oo.catalogId),
        params: typeof oo.params === 'object' && oo.params ? oo.params : undefined,
        stillRef:
          typeof oo.stillRef === 'object' && oo.stillRef
            ? {
                characters: Array.isArray(oo.stillRef.characters)
                  ? oo.stillRef.characters.map(String)
                  : undefined,
                moment: oo.stillRef.moment ? String(oo.stillRef.moment) : undefined,
              }
            : undefined,
        pos: [Number(oo.pos[0]) || 0, Number(oo.pos[1]) || 0, Number(oo.pos[2]) || 0],
        yaw: clampDeg(Number(oo.yaw) || 0),
        scale: clampScale(Number(oo.scale) || 100),
        reason: oo.reason ? String(oo.reason) : '',
      });
    }
    if (objects.length === 0) return null;
    return {
      room: {
        style: String(room.style ?? ''),
        palette: Array.isArray(room.palette) ? room.palette.map(String) : [],
        lighting: String(room.lighting ?? ''),
      },
      objects,
    };
  } catch {
    return null;
  }
}

export interface BuildCritiquePromptOptions {
  spec: SceneSpec;
  chapters: string[];
  catalog: CatalogEntryForPrompt[];
}

const CRITIC_SYSTEM = `你是廂房佈置的審稿人。對照角色近況章回，檢查這版佈置有沒有「漏掉重要意象」「擺了矛盾的東西」「沒有任何劇照掛軸」「物件擠成一堆」等問題。
- 若佈置已能呼應近況、合理，回 {"ok":true,"issues":[]}。
- 否則回 {"ok":false,"issues":["…","…"]}，每條 issue 是一句可執行的修正建議。
只輸出 JSON。`;

export function buildCritiquePrompt(opts: BuildCritiquePromptOptions): BuildPromptResult {
  const chapterLines = opts.chapters.length
    ? opts.chapters.map((c, i) => `${i + 1}. ${c}`).join('\n')
    : '（無）';
  const user = `近況章回：
${chapterLines}

這版佈置：
${JSON.stringify(opts.spec)}

輸出 JSON：{"ok":true|false,"issues":["…"]}`;
  return {
    system: CRITIC_SYSTEM,
    messages: [{ role: 'user', content: user }],
    maxTokens: 600,
  };
}

/** Parse the critique JSON. Defaults to ok=true on malformed (don't block). */
export function parseCritiqueResponse(text: string): Critique | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const obj = JSON.parse(text.slice(start, end + 1)) as Partial<Critique>;
    const issues = Array.isArray(obj.issues) ? obj.issues.map(String).filter(Boolean) : [];
    const ok = typeof obj.ok === 'boolean' ? obj.ok : issues.length === 0;
    return { ok, issues };
  } catch {
    return null;
  }
}

function clampDeg(n: number): number {
  const m = Math.round(n) % 360;
  return m < 0 ? m + 360 : m;
}

function clampScale(n: number): number {
  return Math.max(10, Math.min(400, Math.round(n)));
}
