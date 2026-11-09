// Runs one experiment probe through Vite's module runner, with `@proc-geo/core` aliased to its source (the runner
// ignores `configFile`). Findings and setup: docs/notes/building-shell-covered-storeys-and-sections-findings.md
//
//   node run.mjs <probe> [probe args]
//   node run.mjs <roof-drop probe> --candidate <app dir of a tree with roof-drop.patch applied> [probe args]
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(HERE, '../..');
const CORE_SOURCE = path.resolve(APP_ROOT, '../../packages/core/src/index.ts');

const argv = process.argv.slice(2);
const flag = argv.indexOf('--candidate');
const candidate = flag >= 0 ? path.resolve(argv[flag + 1]) : null;
const [probe, ...args] = flag >= 0 ? argv.filter((_, i) => i !== flag && i !== flag + 1) : argv;
if (!probe) throw new Error('name a probe: node run.mjs <probe> [--candidate <app dir>]');
if (probe.startsWith('roof-drop') && !candidate) throw new Error(`${probe} compares against a patched tree: pass --candidate <app dir>`);

process.env.EXPERIMENT_RESULTS = path.join(HERE, 'results');
const require = createRequire(path.join(APP_ROOT, 'package.json'));
const viteEntry = path.join(path.dirname(require.resolve('vite/package.json')), 'dist/node/index.js');
const {runnerImport} = await import(pathToFileURL(viteEntry).href);
const alias = [{find: /^@proc-geo\/core$/, replacement: CORE_SOURCE}];
if (candidate) alias.push({find: /^@candidate\//, replacement: `${candidate.replaceAll('\\', '/')}/`});
const {module} = await runnerImport(path.join(HERE, `${probe}.ts`), {root: APP_ROOT, configFile: false, logLevel: 'error', resolve: {alias}});
await module.main(args);
process.exit(0);
