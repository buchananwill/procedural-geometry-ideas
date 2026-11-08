// Journal decisions 129, 131 and 152: writes the golden set, `golden/`, from `tests/golden-fixtures.ts`, and removes
// any golden JSON the set no longer names. Run from the app as `pnpm --filter @proc-geo/building-shell golden`.
// tests/golden.test.ts fails when a fresh export differs from the committed files, so the commit's hash names the bytes.
//
// The pipeline loads through Vite's module runner with the core-source alias restated: the runner does not read
// `configFile` (journal manual, decision 150, F7), and the golden set must measure core's source, never its `dist/`.
import {mkdir, readdir, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import type {InlineConfig} from 'vite';
import {CORE_SOURCE} from '../vite.config.ts';

const APP_ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Where the golden set lives. */
export const GOLDEN_DIR = path.join(APP_ROOT, 'golden');

async function main(): Promise<void> {
  const {runnerImport} = await import('vite');
  const config: InlineConfig = {root: APP_ROOT, logLevel: 'error', resolve: {alias: [{find: /^@proc-geo\/core$/, replacement: CORE_SOURCE}]}};
  const {module: golden} = await runnerImport<typeof import('../tests/golden-fixtures.ts')>(path.join(APP_ROOT, 'tests', 'golden-fixtures.ts'), config);
  const files = await golden.goldenFiles();
  await mkdir(GOLDEN_DIR, {recursive: true});
  for (const name of await readdir(GOLDEN_DIR)) if (name.endsWith('.json') && !files.has(name)) await rm(path.join(GOLDEN_DIR, name));
  for (const [name, text] of files) await writeFile(path.join(GOLDEN_DIR, name), text, 'utf8');
  console.log(`wrote ${files.size} files to ${path.relative(APP_ROOT, GOLDEN_DIR)}`);
}

main().catch((e: unknown) => {
  console.error(`export-golden: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
