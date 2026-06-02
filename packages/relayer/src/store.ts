// Memory index store. Default = in-memory map per namespace, persisted to a JSON file so it
// survives restart WITHOUT ever re-embedding (so the relayer never needs a decryption key).
//
// At our scale this is plenty (vectors are ~6 KB each; 10k memories ≈ 60 MB). Swap this class
// for a sqlite-vec / pgvector implementation behind the same interface when you outgrow it —
// the rest of the relayer doesn't change.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { MemoryRecord } from "./types.ts";

export interface MemoryStore {
  remember(namespace: string, rec: MemoryRecord): void;
  recall(namespace: string): MemoryRecord[];
  count(): number;
  namespaces(): string[];
}

export class InMemoryStore implements MemoryStore {
  private data = new Map<string, MemoryRecord[]>();
  private file: string;
  private dirty = false;

  constructor(file: string) {
    this.file = file;
    this.load();
    // periodic flush so a crash loses at most a few seconds of writes
    setInterval(() => this.flush(), 5_000).unref();
  }

  private load(): void {
    if (!existsSync(this.file)) return;
    try {
      const raw = JSON.parse(readFileSync(this.file, "utf8")) as Record<string, MemoryRecord[]>;
      for (const ns of Object.keys(raw)) this.data.set(ns, raw[ns]);
    } catch (err) {
      console.warn(`[store] failed to load ${this.file}:`, err);
    }
  }

  flush(): void {
    if (!this.dirty) return;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const obj: Record<string, MemoryRecord[]> = {};
      for (const [ns, recs] of this.data) obj[ns] = recs;
      writeFileSync(this.file, JSON.stringify(obj));
      this.dirty = false;
    } catch (err) {
      console.warn(`[store] failed to flush ${this.file}:`, err);
    }
  }

  remember(namespace: string, rec: MemoryRecord): void {
    const arr = this.data.get(namespace) ?? [];
    arr.push(rec);
    this.data.set(namespace, arr);
    this.dirty = true;
  }

  recall(namespace: string): MemoryRecord[] {
    return this.data.get(namespace) ?? [];
  }

  count(): number {
    let n = 0;
    for (const recs of this.data.values()) n += recs.length;
    return n;
  }

  namespaces(): string[] {
    return [...this.data.keys()];
  }
}
