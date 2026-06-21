/**
 * Resolve hook for `node --test`: retry relative `*.js` specifiers as `*.ts`.
 *
 * The SDK source writes relative imports with `.js` extensions (the on-disk
 * files are `.ts`), the standard TS/ESM convention that bundlers + `tsc`
 * understand. Node's native type-stripping (`node --test`) does NOT rewrite
 * the extension, so loading a read module fails on its `.js` imports. This
 * hook makes those resolve to the real `.ts` files without converting the
 * whole SDK to `.ts` specifiers (a much larger, out-of-scope change).
 *
 * Loaded via `--import` (see the `test` script). Uses the synchronous
 * in-thread `registerHooks` (Node 22.15+/23.5+) so no extra worker is spun up.
 */
import { registerHooks } from 'node:module';

registerHooks({
    resolve(specifier, context, nextResolve) {
        const isRelative = specifier.startsWith('./') || specifier.startsWith('../');
        if (isRelative && specifier.endsWith('.js')) {
            try {
                return nextResolve(specifier, context);
            } catch (err) {
                if (err && err.code === 'ERR_MODULE_NOT_FOUND') {
                    return nextResolve(`${specifier.slice(0, -3)}.ts`, context);
                }
                throw err;
            }
        }
        return nextResolve(specifier, context);
    },
});
