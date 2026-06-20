/**
 * Chain explorer URL helpers.
 *
 * Single place to switch explorers / wire deep links. Today we use
 * SuiVision. The network is encoded as a subdomain (mainnet has none),
 * derived from `ENDLESS_STORY_DEPLOYMENT.network` so devnet / testnet /
 * mainnet links Just Work.
 *
 * If we ever want to switch explorers (Sui Scan, the official sui.io
 * one, etc.), this is the only file to edit. Note that explorers differ
 * in both host shape and path verbs (SuiVision uses `/txblock/`, Sui
 * Scan used a `/{network}/tx/` path), so swap with care.
 */

import { ENDLESS_STORY_DEPLOYMENT } from '@endless-story/sdk';

function baseUrl(): string {
    const network = ENDLESS_STORY_DEPLOYMENT.network;
    const subdomain = network === 'mainnet' ? '' : `${network}.`;
    return `https://${subdomain}suivision.xyz`;
}

export function txUrl(digest: string): string {
    return `${baseUrl()}/txblock/${digest}`;
}

export function objectUrl(objectId: string): string {
    return `${baseUrl()}/object/${objectId}`;
}

export function accountUrl(address: string): string {
    return `${baseUrl()}/account/${address}`;
}

/**
 * Link for a narrative event reference (`eventTx`). Despite the name, the spine
 * pipeline stamps `eventTx` with the BudgetEvent's STABLE object id (the default
 * path), while legacy immediate-mode storylets stamped it with the opener's tx
 * digest. They live at different explorer routes, so route by shape: a 0x + 64-hex
 * value is an object id (/object/); anything else (a base58 digest) is a
 * transaction (/txblock/). Passing an object id to /txblock/ resolves to nothing.
 */
export function eventUrl(eventRef: string): string {
    return isObjectId(eventRef) ? objectUrl(eventRef) : txUrl(eventRef);
}

function isObjectId(ref: string): boolean {
    return /^0x[0-9a-fA-F]{64}$/.test(ref);
}
