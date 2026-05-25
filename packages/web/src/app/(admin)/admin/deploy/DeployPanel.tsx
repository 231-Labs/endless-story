'use client';

import { useState, useTransition } from 'react';
import { runCliScript, type CliScript, type RunCliScriptResult } from '@/lib/actions/run-cli-script';
import { getDeploymentStatus, type DeploymentStatus } from '@/lib/actions/deployment-status';
import { seedDefaultRecruitments } from '@/lib/actions/recruitments-store';

type Env = 'devnet' | 'testnet' | 'mainnet' | 'localnet';

interface Props {
    initialStatus: DeploymentStatus;
}

export function DeployPanel({ initialStatus }: Props) {
    const [status, setStatus] = useState<DeploymentStatus>(initialStatus);
    const [env, setEnv] = useState<Env>((initialStatus.network as Env) || 'devnet');
    const [log, setLog] = useState<string>('');
    const [lastResult, setLastResult] = useState<RunCliScriptResult | null>(null);
    const [isPending, startTransition] = useTransition();

    const handleRun = (script: CliScript) => {
        setLog(`Running ${script} on ${env}…\n`);
        setLastResult(null);
        startTransition(async () => {
            const res = await runCliScript({ script, env });
            const combined = `--- stdout ---\n${res.stdout}\n--- stderr ---\n${res.stderr}\n--- exit ${res.code} in ${res.durationMs}ms`;
            setLog(combined);
            setLastResult(res);
            const newStatus = await getDeploymentStatus();
            setStatus(newStatus);
        });
    };

    const handleSeedRecruitments = () => {
        setLog('Seeding default recruitments…\n');
        setLastResult(null);
        startTransition(async () => {
            const started = Date.now();
            try {
                const res = await seedDefaultRecruitments();
                const durationMs = Date.now() - started;
                setLog(res.log.join('\n'));
                setLastResult({
                    ok: res.ok,
                    code: res.ok ? 0 : 1,
                    stdout: res.log.join('\n'),
                    stderr: '',
                    durationMs,
                });
            } catch (err) {
                setLog(`FAIL ${err instanceof Error ? err.message : String(err)}`);
                setLastResult({
                    ok: false,
                    code: 1,
                    stdout: '',
                    stderr: err instanceof Error ? err.message : String(err),
                    durationMs: Date.now() - started,
                });
            }
        });
    };

    return (
        <div className="space-y-6">
            {/* ── Status snapshot ── */}
            <section className="es-soft-panel overflow-hidden">
                <div className="border-b border-hairline bg-surface/50 px-6 py-4 flex items-center justify-between">
                    <h2 className="font-serif text-lg text-ink">部署狀態</h2>
                    <span
                        className={`rounded-full px-3 py-0.5 text-xs ${
                            status.isBootstrapped
                                ? 'bg-jade/15 text-jade'
                                : status.isDeployed
                                  ? 'bg-cinnabar/15 text-cinnabar'
                                  : 'bg-mute/15 text-mute'
                        }`}
                    >
                        {status.isBootstrapped ? '已種子化' : status.isDeployed ? '已部署，未種子化' : '未部署'}
                    </span>
                </div>
                <dl className="grid grid-cols-1 gap-y-2 px-6 py-4 text-sm text-mute sm:grid-cols-[8rem_1fr]">
                    <Row label="網路">{status.network || '—'}</Row>
                    <Row label="packageId">{status.packageId || '—'}</Row>
                    <Row label="worldId">{status.worldId || '—'}</Row>
                    <Row label="sagaId">{status.sagaId || '—'}</Row>
                    <Row label="storytellerCap">{status.storytellerCapId || '—'}</Row>
                    <Row label="faucetId">{status.faucetId || '—'}</Row>
                    <Row label="locations">{status.locationIds.length ? `${status.locationIds.length} ids` : '—'}</Row>
                    <Row label="scenes">{status.sceneIds.length ? `${status.sceneIds.length} ids` : '—'}</Row>
                    <Row label="deployedAt">{status.deployedAt || '—'}</Row>
                </dl>
            </section>

            {/* ── Env readiness ── */}
            <section className="es-soft-panel overflow-hidden">
                <div className="border-b border-hairline bg-surface/50 px-6 py-4">
                    <h2 className="font-serif text-lg text-ink">環境變數</h2>
                    <p className="text-xs text-mute mt-1">
                        缺項不會立刻 fail，server actions 觸發時才報錯。請設在 web/.env.local
                    </p>
                </div>
                <ul className="divide-y divide-hairline">
                    {status.envChecks.map((c) => (
                        <li key={c.key} className="flex items-start justify-between px-6 py-3 text-sm">
                            <div>
                                <div className="font-mono text-ink">{c.key}</div>
                                <div className="text-xs text-mute">{c.purpose}</div>
                            </div>
                            <span
                                className={`shrink-0 rounded-full px-3 py-0.5 text-xs ${
                                    c.present ? 'bg-jade/15 text-jade' : 'bg-mute/15 text-mute'
                                }`}
                            >
                                {c.present ? '已設定' : '未設定'}
                            </span>
                        </li>
                    ))}
                    <li className="flex items-start justify-between px-6 py-3 text-sm">
                        <div>
                            <div className="font-mono text-ink">~/.endless-wuxia/keypair.json</div>
                            <div className="text-xs text-mute">cli 部署用 keypair (deploy.ts / bootstrap.ts)</div>
                        </div>
                        <span
                            className={`shrink-0 rounded-full px-3 py-0.5 text-xs ${
                                status.keypairFilePresent ? 'bg-jade/15 text-jade' : 'bg-mute/15 text-mute'
                            }`}
                        >
                            {status.keypairFilePresent ? '存在' : '未找到'}
                        </span>
                    </li>
                </ul>
            </section>

            {/* ── Actions ── */}
            <section className="es-soft-panel overflow-hidden">
                <div className="border-b border-hairline bg-surface/50 px-6 py-4 flex items-center justify-between">
                    <h2 className="font-serif text-lg text-ink">執行</h2>
                    <select
                        value={env}
                        onChange={(e) => setEnv(e.target.value as Env)}
                        className="es-field text-sm"
                        disabled={isPending}
                    >
                        <option value="devnet">devnet</option>
                        <option value="testnet">testnet</option>
                        <option value="mainnet">mainnet</option>
                        <option value="localnet">localnet</option>
                    </select>
                </div>
                <div className="grid grid-cols-1 gap-3 px-6 py-4 sm:grid-cols-3">
                    <ActionButton
                        label="① deploy"
                        sub="publish 合約 + 寫入 packageId"
                        onClick={() => handleRun('deploy')}
                        disabled={isPending}
                    />
                    <ActionButton
                        label="② bootstrap"
                        sub="種 World + Saga + Scenes + Faucet"
                        onClick={() => handleRun('bootstrap')}
                        disabled={isPending || !status.isDeployed}
                    />
                    <ActionButton
                        label="③ seed 職缺"
                        sub="批量開 5 個預設行當（武小生 / 富商 / 青衣 / 小報記者 / 老生）"
                        onClick={handleSeedRecruitments}
                        disabled={isPending || !status.isBootstrapped}
                    />
                </div>
            </section>

            {/* ── Log output ── */}
            {(log || isPending) && (
                <section className="es-soft-panel overflow-hidden">
                    <div className="border-b border-hairline bg-surface/50 px-6 py-4 flex items-center justify-between">
                        <h2 className="font-serif text-lg text-ink">輸出</h2>
                        {lastResult && (
                            <span
                                className={`rounded-full px-3 py-0.5 text-xs ${
                                    lastResult.ok ? 'bg-jade/15 text-jade' : 'bg-cinnabar/15 text-cinnabar'
                                }`}
                            >
                                {lastResult.ok ? `OK (${lastResult.durationMs}ms)` : `FAIL exit ${lastResult.code}`}
                            </span>
                        )}
                    </div>
                    <pre className="overflow-x-auto whitespace-pre-wrap px-6 py-4 text-xs text-ink bg-canvas dark:bg-canvas/40">
                        {isPending ? '執行中…\n' : ''}
                        {log}
                    </pre>
                </section>
            )}
        </div>
    );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <>
            <dt className="text-mute">{label}</dt>
            <dd className="font-mono text-ink truncate">{children}</dd>
        </>
    );
}

function ActionButton({
    label,
    sub,
    onClick,
    disabled,
}: {
    label: string;
    sub: string;
    onClick: () => void;
    disabled?: boolean;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className="es-choice-card flex flex-col items-start gap-1 text-left disabled:opacity-40 disabled:cursor-not-allowed"
        >
            <span className="font-serif text-base text-ink">{label}</span>
            <span className="text-xs text-mute">{sub}</span>
        </button>
    );
}
