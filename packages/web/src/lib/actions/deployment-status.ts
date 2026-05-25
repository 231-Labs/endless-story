'use server';

/**
 * Server action — snapshot of current deployment + env-var readiness.
 * The admin /deploy page calls this on mount + after each script run.
 */

import { ENDLESS_STORY_DEPLOYMENT, isDeployed } from '@endless-story/sdk';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

export interface EnvCheck {
    key: string;
    present: boolean;
    /** Human-readable explanation of what this var is for. */
    purpose: string;
}

export interface DeploymentStatus {
    network: string;
    isDeployed: boolean;
    isBootstrapped: boolean;
    packageId: string;
    adminCapId: string;
    worldId: string;
    sagaId: string;
    storytellerCapId: string;
    faucetId: string;
    faucetAdminCapId: string;
    locationIds: string[];
    sceneIds: string[];
    deployedAt: string;
    envChecks: EnvCheck[];
    /** True if ~/.endless-wuxia/keypair.json exists. */
    keypairFilePresent: boolean;
}

export async function getDeploymentStatus(): Promise<DeploymentStatus> {
    const d = ENDLESS_STORY_DEPLOYMENT;

    const envChecks: EnvCheck[] = [
        {
            key: 'POE_API_KEY',
            present: Boolean(process.env.POE_API_KEY),
            purpose: 'LLM text (character + portrait curate + moderation)',
        },
        {
            key: 'OPENAI_API_KEY',
            present: Boolean(process.env.OPENAI_API_KEY),
            purpose: 'Portrait image generation (gpt-image-2)',
        },
        {
            key: 'SUI_ADMIN_PRIVATE_KEY',
            present: Boolean(process.env.SUI_ADMIN_PRIVATE_KEY),
            purpose: 'Storyteller co-sign for redeem voucher (suiprivkey1...)',
        },
        {
            key: 'RECRUITMENT_MOD_SECRET',
            present: Boolean(process.env.RECRUITMENT_MOD_SECRET),
            purpose: 'HMAC secret for moderation signatures (defaults to dev value)',
        },
    ];

    let keypairFilePresent = false;
    try {
        const p = path.join(os.homedir(), '.endless-wuxia', 'keypair.json');
        keypairFilePresent = fs.existsSync(p);
    } catch {
        keypairFilePresent = false;
    }

    return {
        network: d.network,
        isDeployed: isDeployed(d),
        isBootstrapped: d.worldId.length > 0 && d.sagaId.length > 0 && d.faucetId.length > 0,
        packageId: d.packageId,
        adminCapId: d.adminCapId,
        worldId: d.worldId,
        sagaId: d.sagaId,
        storytellerCapId: d.storytellerCapId,
        faucetId: d.faucetId,
        faucetAdminCapId: d.faucetAdminCapId,
        locationIds: d.locationIds,
        sceneIds: d.sceneIds,
        deployedAt: d.deployedAt,
        envChecks,
        keypairFilePresent,
    };
}
