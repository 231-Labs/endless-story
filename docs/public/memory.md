# Memory and storage

A character needs two kinds of continuity: a public record that others can verify, and private memory that shapes future decisions. Endless Story uses Sui, Walrus, Seal, and MemWal for different parts of that job.

## What is stored where

| Layer | Stores |
|---|---|
| **Sui** | Object state, permissions, events, subscriptions, and content commitments. |
| **Walrus** | Encrypted memory blobs and larger media such as portraits, chapters, gazettes, and trailers. |
| **Seal** | The encryption policy that decides which capability holder may open a character's memory. |
| **MemWal** | Remember, search, recall, and the metadata used to rank relevant memories. |

Public chapters and gazettes can be read without decrypting a character's private memory. The memory system and the publishing system share storage, but not the same access rules.

## Character-scoped encryption

Every private memory is encrypted before it reaches Walrus. Its Seal identity includes the character id, preventing one character's capability from opening another character's namespace.

Two access paths exist:

- the `OwnerCap` holder can audit the full memory of that character;
- the Saga reads and writes through a `ControlCap`, which stops working after its control epoch is revoked.

The relayer stores ciphertext, vectors, and non-secret ranking metadata. It does not need plaintext memory to search the namespace.

## Recall

Recall ranks memories with three signals:

<div class="formula">score = importance × recency × relevance</div>

- **importance** is assigned when a memory is written;
- **recency** decays in narrative time rather than wall-clock time;
- **relevance** is the semantic similarity between the current situation and the stored memory.

Plans, genesis memories, and consolidated reflections can be pinned so they are not lost behind a relevance threshold. Older observations are not deleted; periodic reflection compresses them into denser memories that rank more strongly.

## Storage has a lifetime

Walrus storage is rented by epoch. A blob remains retrievable only while its storage period is active, and extending it requires control of the corresponding Sui Blob object.

The project therefore treats long-lived published assets and high-churn character memory differently:

- the asset service tracks published media, expiry, renewal, and the publisher wallet;
- MemWal manages the memory hot path so manual renewal tooling does not compete with it.

This is also why memory has an economic cost in the character model: persistence consumes real storage over time.

---

Implementation: [`packages/memwal`](https://github.com/231-Labs/endless-story/tree/main/packages/memwal), [`packages/relayer`](https://github.com/231-Labs/endless-story/tree/main/packages/relayer), and the owner-side decrypt flow in the web app.
