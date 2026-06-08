/**
 * clip-thumbs — backfill SceneClip.thumbnailUrl from each video's first frame.
 *
 * For every clip in a clips JSON that has no thumbnailUrl, extract the video's
 * first frame (ffmpeg), upload it to Walrus, and write the resulting URL back
 * into the JSON. Run once after authoring clips: the home page then serves a
 * cached image instead of loading every video's metadata per card.
 *
 * Usage:
 *   pnpm --filter @endless-story/cli clip-thumbs <input> [options]
 *
 *   <input>          local path OR http(s) URL of the clips JSON
 *                    (an array of clips, or { "clips": [...] })
 *   --out <path>     where to write the updated JSON
 *                    (default: same file when <input> is a local path;
 *                     required when <input> is a URL)
 *   --force          re-extract even for clips that already have a thumbnailUrl
 *   --epochs <n>     Walrus storage epochs for the uploaded thumbs (default 53)
 *   --width <px>     downscale the frame to this width (default 640)
 *
 * ffmpeg resolution order: $FFMPEG_PATH → `ffmpeg-static` (if installed) → `ffmpeg` in PATH.
 *   No system ffmpeg? `pnpm add -D -F @endless-story/cli ffmpeg-static` (self-contained)
 *   or `brew install ffmpeg`.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { blob } from '@endless-story/memwal';

interface Args {
    input: string;
    out?: string;
    force: boolean;
    dryRun: boolean;
    epochs: number;
    width: number;
}

function parseArgs(argv: string[]): Args {
    const rest = argv.slice(2);
    const positionals: string[] = [];
    let out: string | undefined;
    let force = false;
    let dryRun = false;
    let epochs = 53;
    let width = 640;
    for (let i = 0; i < rest.length; i += 1) {
        const a = rest[i];
        if (a === '--force') force = true;
        else if (a === '--dry-run') dryRun = true;
        else if (a === '--out') out = rest[++i];
        else if (a === '--epochs') epochs = Number(rest[++i]) || epochs;
        else if (a === '--width') width = Number(rest[++i]) || width;
        else positionals.push(a);
    }
    const input = positionals[0];
    if (!input) {
        console.error(
            'usage: clip-thumbs <clips.json|url> [--out path] [--force] [--dry-run] [--epochs n] [--width px]',
        );
        process.exit(1);
    }
    return { input, out, force, dryRun, epochs, width };
}

function isUrl(s: string): boolean {
    return /^https?:\/\//i.test(s);
}

/** $FFMPEG_PATH → ffmpeg-static (optional, non-literal import so tsc stays happy) → PATH. */
async function resolveFfmpeg(): Promise<string> {
    if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
    const specifier = 'ffmpeg-static';
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mod: any = await import(specifier);
        const p: string | undefined = mod?.default ?? mod;
        // Only use it if the bundled binary was actually downloaded — pnpm blocks
        // ffmpeg-static's postinstall by default (run `pnpm approve-builds`), in
        // which case the path exists in the manifest but the file does not.
        if (p && typeof p === 'string' && existsSync(p)) return p;
    } catch {
        /* not installed → fall through to PATH */
    }
    return 'ffmpeg';
}

function run(cmd: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] });
        let stderr = '';
        child.stderr?.on('data', (d) => {
            stderr += String(d);
        });
        child.on('error', reject);
        child.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`${path.basename(cmd)} exited ${code}: ${stderr.slice(-500)}`));
        });
    });
}

async function checkFfmpeg(ffmpeg: string): Promise<void> {
    try {
        await run(ffmpeg, ['-version']);
    } catch (err) {
        throw new Error(
            `ffmpeg not runnable (${ffmpeg}). Provide it by one of:\n` +
                `  pnpm approve-builds   → pick ffmpeg-static   (downloads a bundled binary)\n` +
                `  brew install ffmpeg                          (system, on PATH)\n` +
                `  or set FFMPEG_PATH=/path/to/ffmpeg\n` +
                `cause: ${err instanceof Error ? err.message : String(err)}`,
        );
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadClips(input: string): Promise<{ rows: any[]; wrapped: boolean }> {
    const raw = isUrl(input)
        ? await (await fetch(input)).text()
        : await readFile(input, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return { rows: parsed, wrapped: false };
    if (parsed && Array.isArray(parsed.clips)) return { rows: parsed.clips, wrapped: true };
    throw new Error('clips JSON must be an array or { "clips": [...] }');
}

async function extractFrame(
    ffmpeg: string,
    videoUrl: string,
    width: number,
    workdir: string,
    idx: number,
): Promise<Uint8Array> {
    // Download the bytes first (don't depend on the ffmpeg build's https support).
    const res = await fetch(videoUrl, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`download ${res.status}`);
    const inputPath = path.join(workdir, `in_${idx}`);
    const outputPath = path.join(workdir, `out_${idx}.jpg`);
    await writeFile(inputPath, Buffer.from(await res.arrayBuffer()));
    // -ss 0.1 skips a possible black 0th frame; scale keeps aspect (even height).
    await run(ffmpeg, [
        '-y',
        '-ss',
        '0.1',
        '-i',
        inputPath,
        '-frames:v',
        '1',
        '-vf',
        `scale=${width}:-2`,
        '-q:v',
        '4',
        outputPath,
    ]);
    return new Uint8Array(await readFile(outputPath));
}

async function main() {
    const args = parseArgs(process.argv);
    const outPath = args.out ?? (isUrl(args.input) ? undefined : args.input);
    if (!args.dryRun && !outPath) {
        console.error('--out <path> is required when <input> is a URL');
        process.exit(1);
    }

    const ffmpeg = await resolveFfmpeg();
    await checkFfmpeg(ffmpeg);
    console.log(`[clip-thumbs] ffmpeg: ${ffmpeg}`);

    const { rows, wrapped } = await loadClips(args.input);
    console.log(`[clip-thumbs] ${rows.length} clip(s) loaded from ${args.input}`);

    const workdir = await mkdtemp(path.join(tmpdir(), 'clip-thumbs-'));
    let filled = 0;
    let skipped = 0;
    let failed = 0;
    try {
        for (let i = 0; i < rows.length; i += 1) {
            const clip = rows[i];
            const id = clip?.id ?? `#${i + 1}`;
            if (!clip?.videoUrl) {
                skipped += 1;
                continue;
            }
            if (clip.thumbnailUrl && !args.force) {
                skipped += 1;
                continue;
            }
            try {
                process.stdout.write(`[clip-thumbs] ${id}: extracting… `);
                const bytes = await extractFrame(ffmpeg, clip.videoUrl, args.width, workdir, i);
                if (args.dryRun) {
                    filled += 1;
                    console.log(`✓ ${bytes.length} bytes (dry-run, not uploaded)`);
                } else {
                    const put = await blob.putBlob(bytes, {
                        network: 'testnet',
                        contentType: 'image/jpeg',
                        epochs: args.epochs,
                    });
                    clip.thumbnailUrl = put.url;
                    filled += 1;
                    console.log(`→ ${put.url}`);
                }
            } catch (err) {
                failed += 1;
                console.log(`FAILED: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
    } finally {
        await rm(workdir, { recursive: true, force: true }).catch(() => {});
    }

    if (args.dryRun) {
        console.log(
            `[clip-thumbs] dry-run — extracted ${filled}, skipped ${skipped}, failed ${failed}. nothing uploaded or written.`,
        );
    } else if (outPath) {
        const output = wrapped ? { clips: rows } : rows;
        await writeFile(outPath, `${JSON.stringify(output, null, 2)}\n`, 'utf-8');
        console.log(
            `[clip-thumbs] done — filled ${filled}, skipped ${skipped}, failed ${failed}. wrote ${outPath}`,
        );
    }
}

main().catch((err) => {
    console.error('[clip-thumbs] fatal:', err instanceof Error ? err.message : err);
    process.exit(1);
});
