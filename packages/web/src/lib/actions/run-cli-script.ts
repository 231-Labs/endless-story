'use server';

/**
 * Server action — execute a cli script via pnpm filter and return its output.
 *
 * Used by the admin UI to trigger deploy / bootstrap / preflight / e2e from a button
 * instead of dropping to a terminal. Output is captured (not streamed) so
 * the UI receives the full log after the script exits.
 *
 * Constraints:
 * - Node runtime only (uses child_process). Must NOT run on edge.
 * - The `sui` binary needs to be on PATH for deploy.
 * - CLI deploy/bootstrap use the same SUI_ADMIN_PRIVATE_KEY env var as web
 *   server actions; no keypair-file fallback.
 * - `sui client active-env` must match the --env passed.
 */

import { spawn } from 'node:child_process';
import * as path from 'node:path';

export type CliScript =
    | 'deploy-preflight'
    | 'deploy'
    | 'bootstrap'
    | 'upgrade'
    | 'create-mint-config'
    | 'test-e2e';

export interface RunCliScriptInput {
    script: CliScript;
    env: 'devnet' | 'testnet' | 'mainnet' | 'localnet';
    extraArgs?: string[];
}

export interface RunCliScriptResult {
    ok: boolean;
    code: number;
    stdout: string;
    stderr: string;
    durationMs: number;
}

const REPO_ROOT = path.resolve(process.cwd(), '..', '..');

export async function runCliScript(input: RunCliScriptInput): Promise<RunCliScriptResult> {
    // Note: server actions run from /packages/web; REPO_ROOT resolves to repo root.
    // `run` is REQUIRED — `pnpm deploy` (without `run`) is a built-in pnpm
    // command for deploying a workspace package, which would shadow our cli
    // script and error with ERR_PNPM_INVALID_DEPLOY_TARGET.
    const args = [
        '--filter',
        '@endless-story/cli',
        'run',
        input.script,
        '--',
        '--env',
        input.env,
        ...(input.extraArgs ?? []),
    ];
    const started = Date.now();

    return new Promise((resolve) => {
        let stdout = '';
        let stderr = '';
        const proc = spawn('pnpm', args, {
            cwd: REPO_ROOT,
            shell: false,
            env: { ...process.env, FORCE_COLOR: '0' },
        });
        proc.stdout.on('data', (d: Buffer) => {
            stdout += d.toString();
        });
        proc.stderr.on('data', (d: Buffer) => {
            stderr += d.toString();
        });
        proc.on('error', (err: Error) => {
            resolve({
                ok: false,
                code: -1,
                stdout,
                stderr: stderr + `\n[spawn error] ${err.message}`,
                durationMs: Date.now() - started,
            });
        });
        proc.on('close', (code: number | null) => {
            resolve({
                ok: code === 0,
                code: code ?? -1,
                stdout,
                stderr,
                durationMs: Date.now() - started,
            });
        });
    });
}
