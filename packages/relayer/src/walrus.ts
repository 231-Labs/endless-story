// Walrus blob upload relay. On remember the client sends SEAL-encrypted bytes; the relayer
// stores them on Walrus and keeps the returned blob id. (On recall the CLIENT fetches the blob
// from a Walrus aggregator directly — the relayer only returns ids, never blob content.)
//
// Two modes:
//   - WALRUS_PUBLISHER_URL set → PUT bytes to the real Walrus publisher.
//   - unset (dev) → store bytes under DATA_DIR/blobs/<id> and serve via GET /api/blob/:id,
//     so the relayer is fully runnable offline for local testing.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PUBLISHER = process.env.WALRUS_PUBLISHER_URL?.replace(/\/$/, "");
const EPOCHS = Number(process.env.WALRUS_EPOCHS ?? 5);

export class Walrus {
  private blobDir: string;
  readonly local: boolean;

  constructor(dataDir: string) {
    this.blobDir = join(dataDir, "blobs");
    this.local = !PUBLISHER;
    if (this.local) mkdirSync(this.blobDir, { recursive: true });
  }

  /** Upload encrypted bytes, return the blob id. */
  async upload(bytes: Uint8Array): Promise<string> {
    if (PUBLISHER) {
      const res = await fetch(`${PUBLISHER}/v1/blobs?epochs=${EPOCHS}&deletable=true`, {
        method: "PUT",
        // fresh ArrayBuffer-backed copy (Buffer is Uint8Array<ArrayBufferLike>, which the
        // strict fetch BodyInit typing rejects); runtime cost is negligible.
        body: new Uint8Array(bytes),
      });
      if (!res.ok) throw new Error(`walrus publisher ${res.status}: ${await res.text()}`);
      const j = (await res.json()) as {
        newlyCreated?: { blobObject?: { blobId?: string } };
        alreadyCertified?: { blobId?: string };
      };
      const id = j.newlyCreated?.blobObject?.blobId ?? j.alreadyCertified?.blobId;
      if (!id) throw new Error(`walrus publisher: no blobId in response`);
      return id;
    }
    // dev-local
    const id = "local-" + createHash("sha256").update(bytes).digest("hex").slice(0, 48);
    writeFileSync(join(this.blobDir, id), bytes);
    return id;
  }

  /** dev-local read (production clients use the Walrus aggregator instead). */
  getLocal(id: string): Uint8Array | null {
    const p = join(this.blobDir, id);
    return existsSync(p) ? readFileSync(p) : null;
  }
}
