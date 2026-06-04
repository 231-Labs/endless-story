'use server';

/**
 * Server action — snapshot of current deployment + env-var readiness.
 * The admin /deploy page calls this on mount + after each script run.
 */

import { ENDLESS_STORY_DEPLOYMENT, isDeployed } from '@endless-story/sdk';
import { loadKeypair } from '@endless-story/sdk/node';
import { access } from 'node:fs/promises';
import path from 'node:path';

export interface EnvCheck {
    key: string;
    present: boolean;
    /** Human-readable explanation of what this var is for. */
    purpose: string;
}

export interface RuntimeCheck {
    key: string;
    label: string;
    status: 'ok' | 'warn' | 'missing' | 'fail';
    detail: string;
    url?: string;
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
    /** Address derived from SUI_ADMIN_PRIVATE_KEY, when configured. */
    adminSignerAddress: string;
    adminSignerError: string;
    adminFaucetUrl: string;
    runtimeChecks: RuntimeCheck[];
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
        {
            key: 'TICK_LOOP_SECRET',
            present: Boolean(process.env.TICK_LOOP_SECRET),
            purpose: '/api/tick bearer secret (required before public deploy)',
        },
        {
            key: 'MEMWAL_SERVER_URL',
            present: Boolean(process.env.MEMWAL_SERVER_URL),
            purpose: 'Self-hosted MemWal relayer base URL; also controls runner pause fallback',
        },
        {
            key: 'MEMWAL_PRIVATE_KEY',
            present: Boolean(process.env.MEMWAL_PRIVATE_KEY || process.env.MEMWAL_DELEGATE_KEY),
            purpose: 'MemWal delegate key for remember/recall',
        },
        {
            key: 'MEMWAL_ACCOUNT_ID',
            present: Boolean(process.env.MEMWAL_ACCOUNT_ID),
            purpose: 'MemWal account id for relayer/indexing',
        },
        {
            key: 'DEMO_CLIPS',
            present: Boolean(process.env.DEMO_CLIPS_URL || process.env.DEMO_CLIPS_FILE),
            purpose: 'Optional homepage trailer override (else public/demo-clips.json or mock)',
        },
    ];

    let adminSignerAddress = '';
    let adminSignerError = '';
    try {
        adminSignerAddress = loadKeypair().toSuiAddress();
    } catch (err) {
        adminSignerError = err instanceof Error ? err.message : String(err);
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
        adminSignerAddress,
        adminSignerError,
        adminFaucetUrl: adminSignerAddress ? `https://faucet.sui.io/?address=${adminSignerAddress}` : '',
        runtimeChecks: await getRuntimeChecks(),
    };
}

async function getRuntimeChecks(): Promise<RuntimeCheck[]> {
    const checks = await Promise.all([
        checkRelayerHealth(),
        checkRunnerControl(),
        checkDemoClips(),
        checkChainReadCache(),
    ]);
    return checks;
}

async function checkRelayerHealth(): Promise<RuntimeCheck> {
    const base = process.env.MEMWAL_SERVER_URL?.trim();
    if (!base) {
        return {
            key: 'relayer-health',
            label: 'MemWal relayer',
            status: 'missing',
            detail: 'MEMWAL_SERVER_URL 未設定；會走 managed relayer / 既有 fallback。',
        };
    }
    const url = `${base.replace(/\/$/, '')}/health`;
    try {
        const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
        if (!res.ok) {
            return { key: 'relayer-health', label: 'MemWal relayer', status: 'fail', detail: `${res.status} ${res.statusText}`, url };
        }
        const body = await res.json() as { ok?: unknown; memories?: unknown; namespaces?: unknown; walrus?: unknown };
        return {
            key: 'relayer-health',
            label: 'MemWal relayer',
            status: body.ok === true ? 'ok' : 'warn',
            detail: `memories=${body.memories ?? '—'}, namespaces=${body.namespaces ?? '—'}, walrus=${body.walrus ?? '—'}`,
            url,
        };
    } catch (err) {
        return { key: 'relayer-health', label: 'MemWal relayer', status: 'fail', detail: errorText(err), url };
    }
}

async function checkRunnerControl(): Promise<RuntimeCheck> {
    const url = resolveControlUrl();
    if (!url) {
        return {
            key: 'runner-control',
            label: 'Runner control',
            status: 'missing',
            detail: 'RUNNER_CONTROL_URL / MEMWAL_SERVER_URL 未設定；後台 Runner 開關無法遙控 VPS。',
        };
    }
    try {
        const res = await fetch(url, {
            cache: 'no-store',
            headers: controlHeaders(),
            signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) {
            return { key: 'runner-control', label: 'Runner control', status: 'fail', detail: `${res.status} ${res.statusText}`, url };
        }
        const body = await res.json() as { paused?: unknown; updated_at?: unknown };
        return {
            key: 'runner-control',
            label: 'Runner control',
            status: 'ok',
            detail: `state=${body.paused === true ? 'paused' : 'running'}${typeof body.updated_at === 'number' ? `, updated=${new Date(body.updated_at).toLocaleString('zh-TW')}` : ''}`,
            url,
        };
    } catch (err) {
        return { key: 'runner-control', label: 'Runner control', status: 'fail', detail: errorText(err), url };
    }
}

async function checkDemoClips(): Promise<RuntimeCheck> {
    const url = process.env.DEMO_CLIPS_URL?.trim();
    if (url) {
        try {
            const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
            return {
                key: 'demo-clips',
                label: 'Homepage clips',
                status: res.ok ? 'ok' : 'fail',
                detail: res.ok ? 'DEMO_CLIPS_URL 可讀' : `${res.status} ${res.statusText}`,
                url,
            };
        } catch (err) {
            return { key: 'demo-clips', label: 'Homepage clips', status: 'fail', detail: errorText(err), url };
        }
    }
    const explicitFile = process.env.DEMO_CLIPS_FILE?.trim();
    const file = explicitFile || path.join(process.cwd(), 'public', 'demo-clips.json');
    try {
        await access(file);
        return {
            key: 'demo-clips',
            label: 'Homepage clips',
            status: 'ok',
            detail: explicitFile ? `DEMO_CLIPS_FILE exists: ${explicitFile}` : 'public/demo-clips.json exists',
        };
    } catch {
        return {
            key: 'demo-clips',
            label: 'Homepage clips',
            status: 'missing',
            detail: '尚未放 demo-clips.json；首頁會 fallback 到 mock clips。',
        };
    }
}

async function checkChainReadCache(): Promise<RuntimeCheck> {
    const raw = process.env.CHAIN_READ_CACHE_TTL_MS;
    if (raw == null || raw === '') {
        return {
            key: 'chain-read-cache',
            label: 'Chain read cache',
            status: 'ok',
            detail: '預設啟用：公開 Saga/World/Scene reads 10–15s TTL。',
        };
    }
    const n = Number(raw);
    return {
        key: 'chain-read-cache',
        label: 'Chain read cache',
        status: Number.isFinite(n) && n >= 0 ? 'ok' : 'warn',
        detail: Number.isFinite(n) && n >= 0 ? `CHAIN_READ_CACHE_TTL_MS=${n}` : `無效值：${raw}`,
    };
}

function resolveControlUrl(): string {
    const explicit = process.env.RUNNER_CONTROL_URL?.trim();
    if (explicit) return explicit;
    const relayer = process.env.MEMWAL_SERVER_URL?.trim();
    return relayer ? `${relayer.replace(/\/$/, '')}/control` : '';
}

function controlHeaders(): HeadersInit {
    const secret = process.env.RUNNER_CONTROL_SECRET ?? process.env.RELAYER_SECRET;
    return secret ? { authorization: `Bearer ${secret}` } : {};
}

function errorText(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}
