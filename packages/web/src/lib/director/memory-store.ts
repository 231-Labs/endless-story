/**
 * Director memory — the Showrunner's persistent "synthetic memory"
 * (NARRATIVE_AGENTS.md §12.3): arc plan, director log, chat history.
 *
 * Storage: JSON file at `web/data/director-memory.json`, same single-writer
 * pattern as recruitments-store. The eventual home is the MemWal `saga_<id>`
 * namespace (or chain saga state); the interface here is deliberately small so
 * that swap stays local. IRON RULE (§5): none of this may ever be written into
 * a character's MemWal namespace — director memory is saga-level and objective.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ToolCallRecord } from './tools';

export interface ShowrunnerLogEntry {
  /** ISO timestamp of the heartbeat. */
  at: string;
  /** Narrative day at run time, when known. */
  day?: number;
  /** 導演日誌 — what it saw / did / plans next (markdown). */
  report: string;
  toolCalls: ToolCallRecord[];
}

export interface ChatTurn {
  role: 'admin' | 'director';
  text: string;
  at: string;
}

export interface DirectorMemory {
  /** 弧線計畫 — current theme, live tension lines, planted seeds (markdown). */
  arcPlan: string;
  arcPlanUpdatedAt?: string;
  /** Newest-last. Capped. */
  log: ShowrunnerLogEntry[];
  /** Newest-last. Capped. */
  chat: ChatTurn[];
}

const DATA_DIR = path.join(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'director-memory.json');
const LOG_CAP = 60;
const CHAT_CAP = 200;

const EMPTY: DirectorMemory = { arcPlan: '', log: [], chat: [] };

export function readDirectorMemory(): DirectorMemory {
  if (!fs.existsSync(STORE_PATH)) return { ...EMPTY };
  try {
    const raw = JSON.parse(fs.readFileSync(STORE_PATH, 'utf-8')) as Partial<DirectorMemory>;
    return {
      arcPlan: typeof raw.arcPlan === 'string' ? raw.arcPlan : '',
      arcPlanUpdatedAt: raw.arcPlanUpdatedAt,
      log: Array.isArray(raw.log) ? raw.log : [],
      chat: Array.isArray(raw.chat) ? raw.chat : [],
    };
  } catch (err) {
    console.warn('[director-memory] corrupt JSON, treating as empty:', err);
    return { ...EMPTY };
  }
}

function persist(mem: DirectorMemory) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(mem, null, 2), 'utf-8');
}

/** Append one heartbeat's outcome; updates the arc plan when provided. */
export function appendShowrunnerEntry(
  entry: ShowrunnerLogEntry,
  arcPlan?: string,
): DirectorMemory {
  const mem = readDirectorMemory();
  mem.log = [...mem.log, entry].slice(-LOG_CAP);
  if (typeof arcPlan === 'string' && arcPlan.trim()) {
    mem.arcPlan = arcPlan.trim();
    mem.arcPlanUpdatedAt = entry.at;
  }
  persist(mem);
  return mem;
}

/** Append chat turns (admin question/command + director reply). */
export function appendChatTurns(turns: ChatTurn[]): DirectorMemory {
  const mem = readDirectorMemory();
  mem.chat = [...mem.chat, ...turns].slice(-CHAT_CAP);
  persist(mem);
  return mem;
}

/** Overwrite the arc plan (used by the update_arc_plan tool — chat 大方向). */
export function saveArcPlan(arcPlan: string): DirectorMemory {
  const mem = readDirectorMemory();
  mem.arcPlan = arcPlan.trim();
  mem.arcPlanUpdatedAt = new Date().toISOString();
  persist(mem);
  return mem;
}

/** Wipe arc plan, heartbeat log, and chat — e.g. after redeploy when old saga context is stale. */
export function clearDirectorMemory(): { ok: true; cleared: { log: number; chat: number; hadArcPlan: boolean } } {
  const mem = readDirectorMemory();
  const cleared = {
    log: mem.log.length,
    chat: mem.chat.length,
    hadArcPlan: mem.arcPlan.trim().length > 0,
  };
  persist({ ...EMPTY });
  return { ok: true, cleared };
}
