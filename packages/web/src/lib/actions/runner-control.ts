'use server';

interface RunnerControlResponse {
    paused?: unknown;
    updated_at?: unknown;
}

export interface RunnerControlState {
    configured: boolean;
    url: string;
    paused: boolean;
    updatedAt: number;
    error?: string;
}

function resolveControlUrl(): string {
    const explicit = process.env.RUNNER_CONTROL_URL?.trim();
    if (explicit) return explicit;
    const relayer = process.env.MEMWAL_SERVER_URL?.trim();
    return relayer ? `${relayer.replace(/\/$/, '')}/control` : '';
}

function controlHeaders(): HeadersInit {
    const secret = process.env.RUNNER_CONTROL_SECRET ?? process.env.RELAYER_SECRET;
    return {
        ...(secret ? { authorization: `Bearer ${secret}` } : {}),
    };
}

export async function getRunnerControlStateAction(): Promise<RunnerControlState> {
    const url = resolveControlUrl();
    if (!url) {
        return { configured: false, url: '', paused: false, updatedAt: 0 };
    }
    try {
        const res = await fetch(url, {
            method: 'GET',
            headers: controlHeaders(),
            cache: 'no-store',
            signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) {
            return {
                configured: true,
                url,
                paused: false,
                updatedAt: 0,
                error: `${res.status} ${res.statusText}`,
            };
        }
        const body = (await res.json()) as RunnerControlResponse;
        return {
            configured: true,
            url,
            paused: body.paused === true,
            updatedAt: typeof body.updated_at === 'number' ? body.updated_at : 0,
        };
    } catch (err) {
        return {
            configured: true,
            url,
            paused: false,
            updatedAt: 0,
            error: err instanceof Error ? err.message : String(err),
        };
    }
}

export async function setRunnerPausedAction(input: { paused: boolean }): Promise<RunnerControlState> {
    const url = resolveControlUrl();
    if (!url) {
        return {
            configured: false,
            url: '',
            paused: false,
            updatedAt: 0,
            error: 'RUNNER_CONTROL_URL or MEMWAL_SERVER_URL is not configured',
        };
    }
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                ...controlHeaders(),
            },
            body: JSON.stringify({ paused: input.paused }),
            cache: 'no-store',
            signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) {
            return {
                configured: true,
                url,
                paused: input.paused,
                updatedAt: 0,
                error: `${res.status} ${res.statusText}`,
            };
        }
        const body = (await res.json()) as RunnerControlResponse;
        return {
            configured: true,
            url,
            paused: body.paused === true,
            updatedAt: typeof body.updated_at === 'number' ? body.updated_at : 0,
        };
    } catch (err) {
        return {
            configured: true,
            url,
            paused: input.paused,
            updatedAt: 0,
            error: err instanceof Error ? err.message : String(err),
        };
    }
}
