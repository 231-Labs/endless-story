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

const SYSTEM = `你是「無盡故事」說書平台的廂房佈置師，懂中國戲曲的舞台美學。給你一個戲曲角色的本色與近況、一份固定的「道具目錄」、以及可用的劇照清單，你要為這個角色佈置一座青綠山水間的水台廂房。

核心美學——意境，不是堆砌：
- 戲曲講究「一桌二椅」：寥寥數件即可代表萬象，重的是意境、象徵、留白，不是把東西擺滿。
- 寧少勿多、寧空勿擠。每一件都要有存在的理由，能以一當十。

規則：
- 只能從目錄挑 catalog_id，不可自創物件。
- static 直接擺；still 必須指定劇照（誰在畫面、哪個時刻）。
- 座標用公尺，原點在房間正中，x→右、y→上、z→朝觀者；|x|、|z| 控制在 2.4 以內，y≥0（落地）或擺在家具上。
- 構圖：物件盡量靠邊或後方，中前方留給角色；物件彼此至少間隔 0.7m，不可重疊；大量留白。
- 每件物件給一句 reason，把它扣回角色的近況/本色，且說明它「象徵什麼意境」。
- 總數 **2~5 件**（含至多 1 張劇照掛軸）。少即是多。
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

export interface BuildVisionScenePromptOptions {
  name: string;
  role: string;
  catalog: CatalogEntryForPrompt[];
  /** data: URL (base64) of the reference image. */
  imageDataUrl: string;
}

/**
 * Vision room-gen — feed a reference image to a multimodal model (glm-4.6v):
 * "look at this 戲曲 stage, capture its 意境, lay out the chamber from our
 * catalog accordingly." Output is the same Scene Spec as the text path, so
 * `parseSceneSpecResponse` decodes it.
 */
export function buildVisionScenePrompt(opts: BuildVisionScenePromptOptions): BuildPromptResult {
  const catalogLines = opts.catalog
    .map((c) => `- ${c.id}（${c.type}）tags:${c.tags.join('/')}`)
    .join('\n');
  const text = `這是一張中國戲曲舞台的參考圖。請仔細觀察它的構圖、意境、用色、留白、道具配置與整體氛圍。

然後為角色「${opts.name}（${opts.role}）」佈置一座「同樣意境」的青綠山水水台廂房——抓住參考圖的精神（青綠、空靈、留白、一桌二椅、以少勝多），但只能從下面的道具目錄挑件。

道具目錄：
${catalogLines}

座標用公尺、原點房中、x→右、y→上、z→朝觀者、|x|及|z|≤2.4、物件間隔≥0.7m、總數 2~5 件、至多 1 張掛軸、大量留白。
輸出 JSON：
{"room":{"style":"…","palette":["…"],"lighting":"…"},"objects":[{"catalogId":"…","pos":[x,y,z],"yaw":0,"scale":100,"reason":"它呼應參考圖的什麼意境"}]}
只輸出 JSON，不要任何解釋或 markdown。`;

  return {
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text },
          { type: 'image_url', image_url: { url: opts.imageDataUrl } },
        ],
      },
    ],
    maxTokens: 1600,
  };
}

export interface BuildCodeScenePromptOptions {
  name: string;
  role: string;
  imageDataUrl: string;
}

const CODE_SYSTEM = `你是 Three.js 場景生成器。看參考圖後，**只輸出一段 JavaScript 箭頭函式**（不要 markdown、不要解釋、不要 import），形如：
(THREE) => { const group = new THREE.Group(); /* …建場景… */ return group; }

硬規則：
- 只能用注入的 THREE；**絕不可**使用 window/document/fetch/eval/import/require/setTimeout。
- 迴圈不可超過 200 次。
- 單位公尺；地面在 y=0；場景約 8×8m，正面俯視觀賞。
- 自己建地板、背景（可用大球 BackSide + 顏色當天）、物件、必要的燈（AmbientLight + DirectionalLight）。
- 抓住參考圖意境：青綠山水、鏡面水台、月洞門、竹、太湖石、留白、以少勝多。`;

export function buildCodeScenePrompt(opts: BuildCodeScenePromptOptions): BuildPromptResult {
  const text = `為角色「${opts.name}（${opts.role}）」，依這張中國戲曲舞台參考圖的意境，寫一段 Three.js 程式碼重建整個場景。只輸出 (THREE)=>{…return group} 的函式，其餘規則見 system。`;
  return {
    system: CODE_SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text },
          { type: 'image_url', image_url: { url: opts.imageDataUrl } },
        ],
      },
    ],
    maxTokens: 3000,
  };
}

const FORBIDDEN = /\b(window|document|fetch|eval|import|require|setTimeout|setInterval|XMLHttpRequest|globalThis|process)\b/;

/**
 * Extract the generated scene function. Strips fences, basic-validates it's a
 * `(THREE)=>{…}` that returns, and rejects obviously unsafe tokens. Returns null
 * if it looks malformed/unsafe (→ caller falls back to the spec scene).
 */
export function parseCodeResponse(text: string): string | null {
  let code = text.trim();
  const fence = code.match(/```(?:js|javascript)?\s*([\s\S]*?)```/);
  if (fence) code = fence[1].trim();
  const start = code.indexOf('(THREE)');
  if (start >= 0) code = code.slice(start);
  if (!code.includes('THREE') || !code.includes('return')) return null;
  if (FORBIDDEN.test(code)) return null;
  if (code.length > 12000) return null;
  return code;
}

export interface BuildCritiquePromptOptions {
  spec: SceneSpec;
  chapters: string[];
  catalog: CatalogEntryForPrompt[];
}

const CRITIC_SYSTEM = `你是懂戲曲意境的廂房審稿人。戲曲重「一桌二椅」的留白與象徵，少即是多——**不要因為「缺某物件」就要求補滿**，除非那個意象對角色近況真的關鍵。重點檢查：
- 物件是否重疊/穿模、是否擠成一堆（該疏不疏）。
- 是否有與角色近況「矛盾」的東西。
- 整體意境是否成立（寧可空靈，不要雜亂）。
- 若已疏朗、合理、有意境，回 {"ok":true,"issues":[]}。
- 否則回 {"ok":false,"issues":["…"]}，每條是一句可執行修正（優先「移除/挪開」而非「再加」）。
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
