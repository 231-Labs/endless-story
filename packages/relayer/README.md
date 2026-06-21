# @endless-story/relayer

Self-hosted **MemWal relayer** — replaces the managed `relayer.memwal.ai` so recall can do a
**real three-factor ranking over the whole namespace** instead of top-K-by-distance + client
re-rank. Plaintext-blind (stores only vector + scalar metadata + Walrus blob id; never sees
content). Zero npm deps — runs under Node ≥ 23.6 native TS type-stripping.

See `docs/narrative/CHARACTER_ECONOMY.md` is unrelated; the design rationale is in `docs/narrative/DEPLOYMENT.md`
(§ relayer) and the MemWal discussion.

## Run
```bash
node src/server.ts                 # dev: no Walrus → blobs stored locally, served at /api/blob/:id
# or with a real Walrus publisher:
WALRUS_PUBLISHER_URL=https://publisher.walrus-testnet.walrus.space node src/server.ts
```

## Endpoints
| method + path | purpose |
|---|---|
| `GET /health` | `{ ok, memories, namespaces, walrus }` |
| `POST /api/remember/manual` | `{ encrypted_data(base64), vector, namespace, importance?, day?, kind?, anchored? }` → uploads blob to Walrus, indexes `{vector, metadata}` |
| `POST /api/recall/manual` | `{ vector, namespace, limit?, today?, halfLife?, relevanceFloor? }` → `{ results: [{blob_id, distance, score}], total }` ranked by `importance × recency × relevance` over the **full** namespace |
| `GET /control` | `{ paused }` — the world-loop runner reads this each cycle |
| `POST /control` | `{ paused: boolean }` — the admin "Runner 開關" writes this |
| `GET /api/blob/:id` | dev-local blob fetch (no-Walrus mode only; prod clients use the Walrus aggregator) |

## Env
| var | default | note |
|---|---|---|
| `PORT` | `8787` | |
| `DATA_DIR` | `./data` | index.json + control.json (+ dev blobs) |
| `WALRUS_PUBLISHER_URL` | — | unset → dev-local blob mode |
| `WALRUS_EPOCHS` | `5` | storage duration |
| `RELAYER_SECRET` | — | set → `/api/*` + `POST /control` require `Authorization: Bearer <secret>` |
| `RELAYER_CORS_ORIGIN` | `*` | lock to your web origin in prod |

## Client changes to unlock full three-factor (in `packages/web/.../memory.ts`)
1. `rememberForCharacter` → also send `importance, day, kind, anchored` (today they live only
   inside the encrypted text). Embed the **raw** text (strip the `[[m|...]]` tag) so the tag
   stops polluting the vector.
2. `recallForCharacter` → send `today` (current narrative day); drop the client-side over-fetch
   (`limit*3`) + re-rank — the relayer already returns the true top-N.

## Swapping the store
`InMemoryStore` (JSON-persisted) is plenty for ≤ ~100k vectors. Implement the `MemoryStore`
interface with sqlite-vec / pgvector when you outgrow it; nothing else changes.

## Deploy (Zeabur → Contabo VPS)
Root dir `packages/relayer`, start command `node src/server.ts`, persistent volume on
`DATA_DIR`, set `WALRUS_PUBLISHER_URL` + `RELAYER_SECRET` + `RELAYER_CORS_ORIGIN`. Point the web
app's `MEMWAL_SERVER_URL` at this service. See `docs/narrative/DEPLOYMENT.md`.
