import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

test('constructing the production session agent is provider-lazy for build imports', () => {
    const env = { ...process.env };
    for (const key of ['ZAI_API_KEY', 'POE_API_KEY', 'ANTHROPIC_API_KEY']) delete env[key];
    const result = spawnSync(
        process.execPath,
        [
            '--import',
            'tsx',
            '--input-type=module',
            '-e',
            "import { RunnerSceneAgent } from './src/adapters/runner-scene-agent.ts'; new RunnerSceneAgent({ sessionDir: '/tmp/endless-story-lazy-agent-test' });",
        ],
        { cwd: process.cwd(), env, encoding: 'utf8' },
    );
    assert.equal(
        result.status,
        0,
        `Next.js-style module import must not require an LLM provider:\n${result.stderr}`,
    );
});
