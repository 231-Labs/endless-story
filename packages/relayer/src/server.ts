// Self-hosted MemWal relayer — HTTP server. Zero npm deps (node:http), runs under Node ≥ 23.6
// native TS type-stripping: `node src/server.ts`.
//
// Endpoints:
//   GET  /health                 → { ok, memories, namespaces }
//   POST /api/remember/manual     → store {vector, metadata} + relay encrypted blob to Walrus
//   POST /api/recall/manual       → full-namespace three-factor ranking (the real recall)
//   GET  /control                 → { paused }            (world-loop reads this each cycle)
//   POST /control { paused }      → set pause flag         (admin toggle writes this)
//   GET  /api/blob/:id            → dev-local blob fetch (only in no-Walrus dev mode)
//
// Auth: if RELAYER_SECRET is set, /api/* and POST /control require `Authorization: Bearer <s>`.
// CORS: RELAYER_CORS_ORIGIN (default "*") so the Vercel web app can call cross-origin.

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join } from "node:path";
import { Control } from "./control.ts";
import { scoreNamespace } from "./score.ts";
import { InMemoryStore } from "./store.ts";
import type { RecallRequest, RememberRequest } from "./types.ts";
import { Walrus } from "./walrus.ts";

const PORT = Number(process.env.PORT ?? 8787);
const DATA_DIR = process.env.DATA_DIR ?? join(process.cwd(), "data");
const SECRET = process.env.RELAYER_SECRET; // optional bearer auth
const CORS_ORIGIN = process.env.RELAYER_CORS_ORIGIN ?? "*";

const store = new InMemoryStore(join(DATA_DIR, "index.json"));
const control = new Control(join(DATA_DIR, "control.json"));
const walrus = new Walrus(DATA_DIR);

// ── helpers ──
function cors(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", CORS_ORIGIN);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
}
function send(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(json);
}
function authed(req: IncomingMessage): boolean {
  if (!SECRET) return true;
  return req.headers["authorization"] === `Bearer ${SECRET}`;
}
async function readJson<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
}

// ── routes ──
async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  cors(res);
  if (req.method === "OPTIONS") return void res.writeHead(204).end();

  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const path = url.pathname;

  if (req.method === "GET" && path === "/health") {
    return send(res, 200, { ok: true, memories: store.count(), namespaces: store.namespaces().length, walrus: walrus.local ? "dev-local" : "publisher" });
  }

  if (path === "/control") {
    if (req.method === "GET") return send(res, 200, control.get());
    if (req.method === "POST") {
      if (!authed(req)) return send(res, 401, { error: "unauthorized" });
      const body = await readJson<{ paused: boolean }>(req).catch(() => null);
      if (!body || typeof body.paused !== "boolean") return send(res, 400, { error: "paused (boolean) required" });
      return send(res, 200, control.set(body.paused));
    }
  }

  // per-namespace memory count — lets the web show a character's REAL memory thickness
  // (drives storage rent in the economy) instead of an age proxy. Open + cheap (just a length).
  if (req.method === "GET" && path === "/api/count") {
    const ns = url.searchParams.get("namespace");
    if (!ns) return send(res, 400, { error: "namespace query param required" });
    return send(res, 200, { namespace: ns, count: store.recall(ns).length });
  }

  // dev-local blob fetch
  if (req.method === "GET" && path.startsWith("/api/blob/")) {
    const id = decodeURIComponent(path.slice("/api/blob/".length));
    const bytes = walrus.getLocal(id);
    if (!bytes) return send(res, 404, { error: "not found (or not in dev-local mode)" });
    res.writeHead(200, { "Content-Type": "application/octet-stream" });
    return void res.end(Buffer.from(bytes));
  }

  if (req.method === "POST" && path === "/api/remember/manual") {
    if (!authed(req)) return send(res, 401, { error: "unauthorized" });
    const b = await readJson<RememberRequest>(req).catch(() => null);
    if (!b || !Array.isArray(b.vector) || !b.namespace || typeof b.encrypted_data !== "string") {
      return send(res, 400, { error: "encrypted_data, vector, namespace required" });
    }
    const bytes = Buffer.from(b.encrypted_data, "base64");
    const blob_id = await walrus.upload(bytes);
    store.remember(b.namespace, {
      blob_id,
      vector: b.vector,
      importance: b.importance ?? 5,
      day: b.day ?? 0,
      kind: b.kind ?? "unknown",
      anchored: !!b.anchored,
      created_at: Date.now(),
    });
    return send(res, 200, { blob_id, stored: true });
  }

  if (req.method === "POST" && path === "/api/recall/manual") {
    if (!authed(req)) return send(res, 401, { error: "unauthorized" });
    const b = await readJson<RecallRequest>(req).catch(() => null);
    if (!b || !Array.isArray(b.vector) || !b.namespace) {
      return send(res, 400, { error: "vector, namespace required" });
    }
    const records = store.recall(b.namespace);
    const results = scoreNamespace(records, b.vector, {
      today: b.today,
      halfLife: b.halfLife,
      relevanceFloor: b.relevanceFloor,
      limit: b.limit ?? 10,
    });
    return send(res, 200, { results, total: records.length });
  }

  return send(res, 404, { error: "not found" });
}

createServer((req, res) => {
  handle(req, res).catch((err) => {
    console.error("[relayer] error:", err);
    if (!res.headersSent) send(res, 500, { error: String(err) });
  });
}).listen(PORT, () => {
  console.log(`[relayer] listening on :${PORT}  walrus=${walrus.local ? "dev-local" : "publisher"}  auth=${SECRET ? "on" : "off"}`);
});
