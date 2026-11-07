// Spec decision 33: a node CLI writing `out/<fixture>.json`, one BuildingShell per fixture.
//
// Run as `node --experimental-strip-types src/export.ts` (the package's `export` script). Node loads only this file,
// `errors.ts` and `vite`; the pipeline is loaded through Vite's module runner with the app's own `vite.config.ts`, so
// `@proc-geo/core` resolves to its source exactly as it does under vitest (spec decision 31, journal decision 47),
// never to core's last `dist/` build.
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import type {InlineConfig} from 'vite';
import {errorMessage} from './errors.ts';
import type {ShellFixture} from './fixture.ts';
import type {BuildingShell} from './shell.ts';

const APP_ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Where the export writes: `out/` under the app. */
export const OUT_DIR = path.join(APP_ROOT, 'out');

/** One fixture's file name. */
export const shellFileName = (fixture: string): string => `${fixture}.json`;

/** What builds one fixture's shell: `buildShell`, however it was loaded. */
export type ShellBuilder = (f: ShellFixture) => Promise<BuildingShell>;

/** Writes one JSON file per fixture into `outDir`, and returns the paths written. */
export async function writeShells(outDir: string, fixtures: readonly ShellFixture[], build: ShellBuilder): Promise<string[]> {
  await mkdir(outDir, {recursive: true});
  const written: string[] = [];
  for (const f of fixtures) {
    const file = path.join(outDir, shellFileName(f.name));
    await writeFile(file, `${JSON.stringify(await build(f), null, 1)}\n`, 'utf8');
    written.push(file);
  }
  return written;
}

/** The CLI: the fixture roster and the pipeline loaded through Vite's module runner, then every fixture written. */
async function main(): Promise<void> {
  const {runnerImport} = await import('vite');
  const config: InlineConfig = {root: APP_ROOT, configFile: path.join(APP_ROOT, 'vite.config.ts'), logLevel: 'error'};
  const src = (file: string): string => path.join(APP_ROOT, 'src', file);
  const {module: fixtures} = await runnerImport<typeof import('./fixture.ts')>(src('fixture.ts'), config);
  const {module: shell} = await runnerImport<typeof import('./shell.ts')>(src('shell.ts'), config);
  const written = await writeShells(OUT_DIR, fixtures.SHELL_FIXTURES, shell.buildShell);
  for (const file of written) console.log(`wrote ${path.relative(APP_ROOT, file)}`);
}

const invokedAsCli = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsCli) {
  main().catch((e: unknown) => {
    console.error(`export: ${errorMessage(e)}`);
    process.exit(1);
  });
}
