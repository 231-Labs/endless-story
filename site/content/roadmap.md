# Roadmap

The repository contains deployed contracts, live product paths, feature-gated experiments, and offline research harnesses. This page keeps those categories separate.

The checked-in deployment snapshot points to Sui testnet and was last written on 16 June 2026. This review did not query the live network, so “deployed” below refers to that repository snapshot rather than a fresh RPC confirmation.

## In the current product path

| Capability | Evidence in the repository |
|---|---|
| Character recruiting | Voucher preview, shared `RedeemIntent`, storyteller redemption, owner-directed `OwnerCap`, and Saga-held `ControlCap`. |
| Default autonomous tick | Perception, plan, move, drama, social, ask, give, settle, act, POV, reflection, and gazette phases are connected in the web tick loop. |
| Event spine | The default real tick opens, carries, resolves, and publishes one spine event; plain resolution is available as a failure fallback. |
| Director-created scarcity | New dramatic resources are enabled by default unless explicitly disabled. |
| Showrunner heartbeat | World audit, bounded repair, persistent arc plan, Director tool registry, admin surface, and headless API route. |
| Private character memory | Seal encryption, character-scoped capability checks, owner-side decryption, three-factor recall, and the self-hosted relayer implementation. |
| Chain-first publication reads | Feed and character pages reconstruct chapters from on-chain commitments and Walrus blobs. |
| Published-asset operations | Asset service, admin upload, status inspection, manual renewal, and publisher-wallet checks. |
| Troupe production | The production pipeline is callable through the Director tool and has a separate offline harness for its creative stages. |

These rows describe code paths, not a guarantee that every external service is healthy at this moment.

## Implemented but still conditional

| Capability | What is already present | What still prevents an unconditional claim |
|---|---|---|
| On-chain character economy | Move modules and generated SDK bindings for balances, owner funding, transfers, and settlement. | The product UI still reads a process-local settlement shadow; accepted gifts are applied in SETTLE within the same tick, but on-chain `transfer_between_characters` is not executed yet. |
| Kiosk still trading | Mint, list, purchase, delist, and proceeds helpers plus buyer and admin UI paths. | Requires the active package, TransferPolicy, StillRegistry, Kiosk ids, wallet funding, and a verified live transaction. |
| Personal chamber | PersonalVault creation and discovery are wired. | Saved arrangements remain local until the `decorate` write path is connected in the UI. |
| Automatic Walrus renewal | The asset service runs a renewal sweep that extends near-expiry `autoRenew` assets, driven by an in-process interval and a `POST /api/assets/renew-due` endpoint, with a wallet-balance floor and unit tests. | Not yet exercised against a funded publisher wallet on the VPS; the in-process sweeper is gated by `RENEW_SWEEP_INTERVAL_MS`. |
| Parallel event simulation | Parallel events, attention coupling, and rival gravity exist behind controls with pure tests. | They are not the default tick path and still need sustained live-world validation. |
| LLM event framing | Sanitized LLM framing with deterministic fallback. | Remains opt-in because it changes language quality, cost, and latency rather than protocol correctness. |

## Next milestones

1. Make on-chain economy balances the product read source after one complete wage, cost, owner-funding, and aid cycle is executed and verified.
2. Complete PersonalVault layout writes and verify the Kiosk flow with connected wallets.
3. Validate the renewal sweep against a funded publisher wallet on the VPS and add low-balance alerting beyond the dashboard.
4. Run longer live-world trials for parallel events, attention coupling, rival gravity, and pacing.
5. Turn the strongest chapters and troupe productions into a repeatable video pipeline.
6. Design Saga succession and long-term archival without confusing ownership of a character with ownership of its Walrus Blob objects.

## Evidence labels

Public documents use these terms consistently:

- **Implemented** means the code path exists in this repository.
- **Deployed** means the checked-in deployment snapshot identifies live objects.
- **Verified** means a relevant test or recorded run exercised the behavior.
- **Default** means the normal product path enables it without an opt-in flag.

None of those labels implies the others.
