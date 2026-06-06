// Walrus 資產 registry — in-memory map persisted to a JSON file (DATA_DIR/walrus-assets.json),
// 與 MemWAL 的 memory index 同模式(見 store.ts 的 InMemoryStore)、但 *獨立檔案*,互不干擾。
//
// 規模很小(數十~數百筆策展資產),JSON 綽綽有餘。要 sqlite 等之後換實作、介面不變即可。

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
