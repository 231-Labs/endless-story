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
