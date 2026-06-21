# Walrus storage model · Walrus 儲存模型

The protocol's persistence layer. Everything a character is made of (portraits, scene anchors, chapter text, hero clips, and encrypted memory) lives on Walrus, and that choice shapes the economy.

## Blobs are on-chain objects on a rental clock

A Walrus blob is content-addressed: its `blobId` is a hash of the bytes, and it is backed by a Sui `Blob` object. Storage is not permanent by default. It is rented by **epoch** and it expires. Extending a blob's life means calling `extend` on its on-chain `Blob` object, and only the object's **owner** can do that. Whoever uploaded it (the publisher wallet) owns it.

Two things follow:

- To keep an asset alive long-term you must own its `Blob` object. That is why the project runs its own publisher rather than relying on a public one. A blob seeded by a public publisher cannot be renewed by us.
- Storage duration is a real, recurring cost. That cost is the basis for the in-world economy: a character pays "memory rent" because its memories genuinely cost epochs of Walrus storage. See [Character economy](../narrative/CHARACTER_ECONOMY.md).

Epoch length depends on the network (testnet is about 1 day, mainnet about 14 days, with the chain as the source of truth), so expiry is `now + (endEpoch − currentEpoch) × epochDuration`.

## Private memory: Seal and caps

Character memory is encrypted with **Seal** before it is written to Walrus. Decryption is gated by on-chain capabilities: the character owner can read the full memory, while subscribers see only what their access allows. Public output such as the gazette and published chapters is unencrypted. This is the protocol-level guarantee behind "the owner holds the IP, and memory stays private until it is shared."

## What lives on Walrus, and what does not

Long-lived, ownable assets (character images, scene anchors, chapter text, hero clips) are tracked and renewed. High-churn runner memory blobs are left to the MemWal lifecycle, not the manual tooling, because the two would fight over the same objects.

---

The operational side of this model (uploading, tracking expiry, renewing, the admin panel) is the asset-management tool. See [Asset management](../narrative/ASSET_MANAGEMENT.md).
