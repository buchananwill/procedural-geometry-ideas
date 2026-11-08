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
  // The viewer (spec decision 26, journal decision 95): vite's dependency pre-bundler rewrites `manifold-3d` into
  // `.vite/deps/`, where its `new URL('manifold.wasm', import.meta.url)` no longer finds the .wasm and the dev server
  // answers with index.html. Excluding it serves the package as it stands, next to its .wasm. One config serves dev,
  // test and export.
  optimizeDeps: {exclude: ['manifold-3d']},
});
