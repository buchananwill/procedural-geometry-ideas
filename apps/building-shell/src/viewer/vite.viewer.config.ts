// The viewer's dev-server config: the app's vite config plus one setting for the browser (spec decision 26).
//
// Vite's dependency pre-bundler rewrites `manifold-3d` into `.vite/deps/manifold-3d.js`, where its
// `new URL('manifold.wasm', import.meta.url)` no longer finds the .wasm and the dev server answers with index.html.
// Excluding it serves the package as it stands, next to its .wasm. `src/manifold.ts` is untouched.
import {defineConfig, mergeConfig} from 'vite';
import appConfig from '../../vite.config.ts';

export default mergeConfig(appConfig, defineConfig({
  optimizeDeps: {exclude: ['manifold-3d']},
}));
