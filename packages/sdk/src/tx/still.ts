/**
 * 劇照 Still (still.move) — collectible narrative moments with on-chain
 * edition tracking (one moment, many collectors; editions auto-increment in
 * the shared StillRegistry; 名場面 can be capped).
 *
 * Thin wrappers around `generated/endless_story/still.ts`; all entry points
 * are StorytellerCap-gated. The minted Still is transferred / Kiosk-placed by
 * the caller's PTB.
 *
 * Also exposes Kiosk helpers for trading Stills via the standard Sui Kiosk
 * protocol. A shared `TransferPolicy<Still>` (no rules in v1) is created at
 * deploy time and its ID is stored in `ENDLESS_STORY_DEPLOYMENT.stillTransferPolicyId`.
 */
import * as gen from '../generated/endless_story/still.js';
import type { Transaction, TransactionObjectArgument } from '@mysten/sui/transactions';
import { pkg } from './_package.js';

export { gen as raw };

/** Create + share the saga's StillRegistry (bootstrap, once per saga). */
export const createRegistry = (args: gen.CreateRegistryArguments) =>
    gen.createRegistry({ package: pkg(), arguments: args });

/** Cap a 名場面's editions (must not undercut already-minted count). */
export const setEditionLimit = (args: gen.SetEditionLimitArguments) =>
    gen.setEditionLimit({ package: pkg(), arguments: args });

/** Mint the next edition of a moment; returns the Still for transfer/Kiosk. */
export const mintStill = (args: gen.MintStillArguments) =>
    gen.mintStill({ package: pkg(), arguments: args });

// ─── self-serve (fee-gated) mint ──────────────────────────────────────
//
// `mint_still` above is StorytellerCap-gated and free (admin automation /
// gifting). The pair below lets fans mint editions themselves by paying
// `StillMintConfig.fee` ENDLESS into the saga treasury — no cap required.

/** Create + share the saga's self-serve StillMintConfig (bootstrap, once). */
export const createMintConfig = (args: gen.CreateMintConfigArguments) =>
    gen.createMintConfig({ package: pkg(), arguments: args });

/** Update the self-serve fee (ENDLESS base units, 6 decimals). Storyteller-gated. */
export const setMintFee = (args: gen.SetMintFeeArguments) =>
    gen.setMintFee({ package: pkg(), arguments: args });

/** Pause / resume the self-serve path (admin mint unaffected). Storyteller-gated. */
export const setMintPaused = (args: gen.SetMintPausedArguments) =>
    gen.setMintPaused({ package: pkg(), arguments: args });

/**
 * Self-serve mint: pay `config.fee` ENDLESS and get the next edition. `payment`
 * is a `Coin<CURRENCY>` arg (split it exact-fee client-side). Returns the Still
 * so the PTB transfers it to the buyer.
 */
export const mintStillPaid = (args: gen.MintStillPaidArguments) =>
    gen.mintStillPaid({ package: pkg(), arguments: args });

// ─── Kiosk trading helpers ────────────────────────────────────────────
//
// Standard Sui Kiosk flow for Still:
//   Seller: placeAndList → buyer sees listing → Buyer: purchase → still lands in wallet
//   Seller: delistAndWithdraw → still returns to seller's wallet
//
// Payment currency is SUI (Coin<SUI>) — the Kiosk standard uses SUI natively.

const stillType = () => `${pkg()}::still::Still`;

/**
 * Place a Still into the seller's Kiosk and list it at a fixed SUI price.
 * The Still is locked in the Kiosk until purchased or delisted.
 */
export function placeAndList(
    tx: Transaction,
    args: {
        kiosk: string;
        kioskCap: string | TransactionObjectArgument;
        still: string | TransactionObjectArgument;
        /** Listing price in MIST (1 SUI = 1_000_000_000 MIST) */
        priceMist: bigint;
    },
) {
    const T = stillType();
    tx.moveCall({
        package: '0x2',
        module: 'kiosk',
        function: 'place',
        typeArguments: [T],
        arguments: [
            tx.object(args.kiosk),
            typeof args.kioskCap === 'string' ? tx.object(args.kioskCap) : args.kioskCap,
            typeof args.still === 'string' ? tx.object(args.still) : args.still,
        ],
    });
    tx.moveCall({
        package: '0x2',
        module: 'kiosk',
        function: 'list',
        typeArguments: [T],
        arguments: [
            tx.object(args.kiosk),
            typeof args.kioskCap === 'string' ? tx.object(args.kioskCap) : args.kioskCap,
            tx.pure.id(typeof args.still === 'string' ? args.still : (args.still as any)),
            tx.pure.u64(args.priceMist),
        ],
    });
}

/**
 * Purchase a listed Still from a seller's Kiosk.
 * Returns the Still result — the PTB caller should
 * `tx.transferObjects([still], buyerAddress)`.
 *
 * `payment` must be a `Coin<SUI>` with exactly the listing price.
 * Build it with `tx.splitCoins(tx.gas, [tx.pure.u64(priceMist)])` if needed.
 */
export function purchase(
    tx: Transaction,
    args: {
        /** Seller's Kiosk object ID */
        kiosk: string;
        /** Still NFT object ID being purchased */
        stillId: string;
        /** Coin<SUI> transaction argument (exact listing price) */
        payment: TransactionObjectArgument;
        /** Shared TransferPolicy<Still> — from ENDLESS_STORY_DEPLOYMENT.stillTransferPolicyId */
        transferPolicy: string;
    },
) {
    const T = stillType();
    const [still, request] = tx.moveCall({
        package: '0x2',
        module: 'kiosk',
        function: 'purchase',
        typeArguments: [T],
        arguments: [
            tx.object(args.kiosk),
            tx.pure.id(args.stillId),
            args.payment,
        ],
    });
    // Confirm the transfer request against the (no-rule) policy — resolves immediately.
    tx.moveCall({
        package: '0x2',
        module: 'transfer_policy',
        function: 'confirm_request',
        typeArguments: [T],
        arguments: [tx.object(args.transferPolicy), request],
    });
    return still;
}

/**
 * Delist a Still from the seller's Kiosk and withdraw it back to the wallet.
 * Returns the Still result — the PTB caller should
 * `tx.transferObjects([still], sellerAddress)`.
 */
export function delistAndWithdraw(
    tx: Transaction,
    args: {
        kiosk: string;
        kioskCap: string | TransactionObjectArgument;
        stillId: string;
    },
) {
    const T = stillType();
    const cap = typeof args.kioskCap === 'string' ? tx.object(args.kioskCap) : args.kioskCap;
    tx.moveCall({
        package: '0x2',
        module: 'kiosk',
        function: 'delist',
        typeArguments: [T],
        arguments: [tx.object(args.kiosk), cap, tx.pure.id(args.stillId)],
    });
    return tx.moveCall({
        package: '0x2',
        module: 'kiosk',
        function: 'take',
        typeArguments: [T],
        arguments: [tx.object(args.kiosk), cap, tx.pure.id(args.stillId)],
    });
}

/**
 * Withdraw SUI proceeds from the seller's Kiosk to their wallet.
 * `amountMist` — how much to withdraw; pass 0 to withdraw everything.
 */
export function withdrawProceeds(
    tx: Transaction,
    args: {
        kiosk: string;
        kioskCap: string | TransactionObjectArgument;
        amountMist?: bigint;
    },
) {
    const cap = typeof args.kioskCap === 'string' ? tx.object(args.kioskCap) : args.kioskCap;
    const coin = tx.moveCall({
        package: '0x2',
        module: 'kiosk',
        function: 'withdraw',
        typeArguments: ['0x2::sui::SUI'],
        arguments: [
            tx.object(args.kiosk),
            cap,
            tx.pure(
                // Option<u64>: some(amount) if specified, none to withdraw all
                args.amountMist != null
                    ? new Uint8Array([1, ...bigintToU64Le(args.amountMist)])
                    : new Uint8Array([0]),
            ),
        ],
    });
    return coin;
}

function bigintToU64Le(n: bigint): number[] {
    const bytes = [];
    for (let i = 0; i < 8; i++) {
        bytes.push(Number(n & 0xffn));
        n >>= 8n;
    }
    return bytes;
}
