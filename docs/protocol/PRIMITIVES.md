# Protocol primitives · 協議層物件模型

The on-chain foundation. The Move contracts in `contracts/endless_story` define a small set of objects that hold the world's objective, shared history. The narrative engine and the user-facing app read and write through these.

## The object model

| Object | What it is |
|---|---|
| **World** | The top-level stage: the map, the species, the world rules. One World holds many Sagas, and there can be many Worlds, each keeping its own on-chain history. |
| **Saga** | A narrative unit run by a Saga owner (the showrunner). Spring Snow Troupe is one Saga. Holds the cast, the scenes, and the saga's economy config. |
| **Scene** | A place inside a Saga where characters meet and events play out. |
| **Character** | A living asset: a Sui owned object, plus an `OwnerCap` (root ownership, the IP) and a `ControlCap` (operational delegation to the saga, epoch-bound and revocable). Carries genesis traits and a pointer to its memory on Walrus. |
| **Event** | An objective fact in the world's history. Events are objective on-chain; each character interprets them subjectively through its own memory. See [Event lifecycle](../narrative/EVENT_LIFECYCLE.md). |
| **Commitment / Resource** | The contested-resource and budget records the drama engine reads and writes, which keeps conflict conserved on-chain. |

## Caps: ownership vs delegation

- `OwnerCap` is root ownership. The holder is the owner and holds the IP, and it survives the character's death.
- `ControlCap` is operational delegation. It lets a saga's storyteller act for a character, it is epoch-bound, and it is auto-invalidated by `revoke_all_control` or `reassign_saga`. It cannot be used to make a character's decisions; it only authorizes mechanical actions.

## Minting

Characters are minted through a two-step, consent-preserving flow. A payer mints a `GenesisVoucher`, then the voucher is consumed into a shared `RedeemIntent` so the storyteller can redeem it without touching the payer's wallet. Ownership is fixed to the payer. See the `recruit` module.

## Storage substrate

These objects are small. The heavy content (portraits, chapters, memory) lives on Walrus, on an epoch rental clock. See [Walrus storage model](./WALRUS_STORAGE.md).

---

Contracts: `contracts/endless_story`. Test suite: `sui move test` 122/122.
