// Walrus asset registry — an in-memory map persisted to a JSON file
// (DATA_DIR/walrus-assets.json). Same pattern as MemWAL's memory index (InMemoryStore
// in store.ts) but a separate file. Scale is tiny (tens to hundreds of curated assets),
// so JSON is plenty; swap in sqlite later behind the same interface if needed.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { WalrusAsset } from "./asset-types.ts";

export class AssetStore {
  private data = new Map<string, WalrusAsset>();
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
      const raw = JSON.parse(readFileSync(this.file, "utf8")) as WalrusAsset[] | Record<string, WalrusAsset>;
      const rows = Array.isArray(raw) ? raw : Object.values(raw);
      for (const a of rows) this.data.set(a.id, a);
    } catch (err) {
      console.warn(`[asset-store] failed to load ${this.file}:`, err);
    }
  }

  flush(): void {
    if (!this.dirty) return;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      writeFileSync(this.file, JSON.stringify([...this.data.values()], null, 2));
      this.dirty = false;
    } catch (err) {
      console.warn(`[asset-store] failed to flush ${this.file}:`, err);
    }
  }

  upsert(a: WalrusAsset): void {
    this.data.set(a.id, a);
    this.dirty = true;
  }

  get(id: string): WalrusAsset | undefined {
    return this.data.get(id);
  }

  /** Shallow-merge a partial; id is immutable, updatedAt bumped. Returns the new row (or undefined if absent). */
  patch(id: string, partial: Partial<WalrusAsset>): WalrusAsset | undefined {
    const cur = this.data.get(id);
    if (!cur) return undefined;
    const next: WalrusAsset = { ...cur, ...partial, id: cur.id, updatedAt: Date.now() };
    this.data.set(id, next);
    this.dirty = true;
    return next;
  }

  remove(id: string): boolean {
    const ok = this.data.delete(id);
    if (ok) {
      this.dirty = true;
      this.flush(); // delete is rare + important → persist immediately
    }
    return ok;
  }

  list(): WalrusAsset[] {
    return [...this.data.values()];
  }
}
