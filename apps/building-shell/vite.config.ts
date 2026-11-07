import {fileURLToPath} from 'node:url';
import {defineConfig} from 'vite';

/**
 * `@proc-geo/core` resolves to its source, not to `dist/`, as core's own jest config does (spec decision 31,
 * journal decision 47): core's package.json points at the last build, which the copy-integrity test must not measure.
 */
export const CORE_SOURCE = fileURLToPath(new URL('../../packages/core/src/index.ts', import.meta.url));

export default defineConfig({
  resolve: {
    alias: [{find: /^@proc-geo\/core$/, replacement: CORE_SOURCE}],
  },
});
