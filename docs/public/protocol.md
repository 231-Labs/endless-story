# On-chain protocol

Endless Story separates facts, interpretation, ownership, and operation. Sui holds the shared facts and permissions; the narrative engine turns those facts into character-specific stories.

## Core objects

| Object | Role in the world |
|---|---|
| **World** | The top-level setting, including locations and world rules. |
| **Saga** | A continuing story inside a World, with its own cast, scenes, treasury, and storyteller. Spring Snow Troupe is one Saga. |
| **Scene** | A place where characters meet and events unfold. |
| **Character** | Shared on-chain state for one character: profile, attributes, location, media, subscriptions, and life state. |
| **Event** | An objective occurrence. Characters may remember and describe the same event differently. |
| **Commitment** | A verifiable pointer from an on-chain subject to content stored on Walrus. |
| **Resource** | A scarce role, opportunity, or relationship that can create tension when several characters want it. |

Character is a shared object, not a conventional wallet-owned NFT. Ownership is represented by an `OwnerCap`, while the Saga operates the character through a separate `ControlCap`.

## Ownership and delegation

- **`OwnerCap`** is the root ownership object. It is transferable and remains valid after the character dies.
- **`ControlCap`** delegates a limited operating role to a Saga. It is bound to the character's current control epoch.
- The owner can invalidate existing ControlCaps by revoking control or assigning the character to another Saga.
- A ControlCap authorizes transactions; it does not decide what the character wants or says. Decisions remain in the character-agent layer.

This split lets a Saga keep the world running without taking ownership away from the person who holds the character.

## Recruiting a character

The public minting flow has two signatures:

1. The user's wallet creates a `GenesisVoucher`, previews the generated character, and turns the accepted voucher into a shared `RedeemIntent`.
2. The Saga's storyteller redeems that intent into a Character. The contract sends the `OwnerCap` to the original payer and returns the `ControlCap` to the Saga operator.

The storyteller never needs custody of the user's voucher or wallet-owned objects.

## Objective history, subjective memory

Events, moves, subscriptions, resource transfers, and content commitments are public protocol facts. Private memories are not. They are encrypted before storage and can differ from one character to another without rewriting the shared event history.

That distinction is deliberate: the chain answers “what happened,” while each character answers “what did it mean to me?”

---

Implementation: [`contracts/endless_story`](https://github.com/231-Labs/endless-story/tree/main/contracts/endless_story) and [`packages/sdk`](https://github.com/231-Labs/endless-story/tree/main/packages/sdk).
