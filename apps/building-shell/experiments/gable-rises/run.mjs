// Runs one gable-rise probe through Vite's module runner, with `@proc-geo/core` aliased to its source (the runner
// ignores `configFile`). Findings and setup: docs/notes/building-shell-gable-rise-findings.md
//
//   node run.mjs <probe> [probe args]
//   node run.mjs <probe> --limit farSlope    (WP-G1's default limit; the default is ridgeSlope since WP-G1.1)
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(HERE, '../..');
const CORE_SOURCE = path.resolve(APP_ROOT, '../../packages/core/src/index.ts');

const argv = process.argv.slice(2);
const flag = argv.indexOf('--limit');
if (flag >= 0) process.env.RISE_LIMIT = argv[flag + 1];
const [probe, ...args] = flag >= 0 ? argv.filter((_, i) => i !== flag && i !== flag + 1) : argv;
if (!probe) throw new Error('name a probe: node run.mjs <probe> [probe args]');

process.env.EXPERIMENT_RESULTS = path.join(HERE, 'results');
const require = createRequire(path.join(APP_ROOT, 'package.json'));
const viteEntry = path.join(path.dirname(require.resolve('vite/package.json')), 'dist/node/index.js');
const {runnerImport} = await import(pathToFileURL(viteEntry).href);
const alias = [{find: /^@proc-geo\/core$/, replacement: CORE_SOURCE}];
const {module} = await runnerImport(path.join(HERE, `${probe}.ts`), {root: APP_ROOT, configFile: false, logLevel: 'error', resolve: {alias}});
await module.main(args);
process.exit(0);
