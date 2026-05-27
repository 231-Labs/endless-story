/**
 * Chain explorer URL helpers.
 *
 * Single place to switch explorers / wire deep links. Today we use
 * Sui Scan (the legacy choice already in use by RecruitmentTicket).
 * Network suffix derived from `ENDLESS_STORY_DEPLOYMENT.network` so
 * devnet / testnet / mainnet links Just Work.
 *
 * If we ever want to switch explorers (Sui Vision, the official sui.io
 * one, etc.), this is the only file to edit.
 */

import { ENDLESS_STORY_DEPLOYMENT } from '@endless-story/sdk';

const BASE = 'https://suiscan.xyz';

function networkSegment(): string {
    return ENDLESS_STORY_DEPLOYMENT.network;
}

export function txUrl(digest: string): string {
    return `${BASE}/${networkSegment()}/tx/${digest}`;
}

export function objectUrl(objectId: string): string {
    return `${BASE}/${networkSegment()}/object/${objectId}`;
}

export function accountUrl(address: string): string {
    return `${BASE}/${networkSegment()}/account/${address}`;
}
