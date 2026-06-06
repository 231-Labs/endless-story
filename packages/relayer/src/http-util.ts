// Tiny zero-dep HTTP helpers shared by the asset service (assets-server.ts).
// Mirrors the inline helpers in server.ts but kept separate so the MemWAL relayer
// (server.ts) is *not touched* by this feature. Auth + CORS env names are reused.

import type { IncomingMessage, ServerResponse } from "node:http";

const CORS_ORIGIN = process.env.RELAYER_CORS_ORIGIN ?? "*";
const SECRET = process.env.RELAYER_SECRET; // optional bearer auth

export function cors(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", CORS_ORIGIN);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
}

export function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

export function authed(req: IncomingMessage): boolean {
  if (!SECRET) return true;
  return req.headers["authorization"] === `Bearer ${SECRET}`;
}

export async function readJson<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
}

export async function readBytes(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}
