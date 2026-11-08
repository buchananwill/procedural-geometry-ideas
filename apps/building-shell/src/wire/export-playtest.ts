// A node CLI seeding `fixtures/playtest/` with real `input@1` files written from the prototype's own fixtures, so the
// ingestion test (tests/playtest-ingest.test.ts) is never vacuous (journal decision 124).
//
// Run from the app as `node --experimental-strip-types --disable-warning=ExperimentalWarning src/wire/export-playtest.ts`.
// As `export.ts` does, it loads the fixtures and the adapter through Vite's module runner with the app's own config.
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import type {InlineConfig} from 'vite';
import {errorMessage} from '../errors.ts';

const APP_ROOT = fileURLToPath(new URL('../..', import.meta.url));

/** The ingestion folder: every JSON in it is loaded, validated and run through every invariant. */
export const PLAYTEST_DIR = path.join(APP_ROOT, 'fixtures', 'playtest');

/**
 * The seeded fixtures: one Ring, a T, two storeys over an L, a tunnel (genus 1), a courtyard (genus 1), a Ring
 * conflict decided by model index, and a port layout at 300 cm storeys.
 */
export const SEED_FIXTURES: readonly string[] = [
  'DefaultChalet', 'SingleStoreyT', 'ValleyWings', 'BridgeOverBlock', 'Courtyard', 'OverlapRingConflictSwapped', 'PortPokeOut300',
];

async function main(): Promise<void> {
  const {runnerImport} = await import('vite');
  const config: InlineConfig = {root: APP_ROOT, configFile: path.join(APP_ROOT, 'vite.config.ts'), logLevel: 'error'};
  const src = (file: string): string => path.join(APP_ROOT, 'src', file);
  const {module: fixtures} = await runnerImport<typeof import('../fixture.ts')>(src('fixture.ts'), config);
  const {module: adapter} = await runnerImport<typeof import('./input-adapter.ts')>(src('wire/input-adapter.ts'), config);
  await mkdir(PLAYTEST_DIR, {recursive: true});
  for (const name of SEED_FIXTURES) {
    const file = path.join(PLAYTEST_DIR, `${name}.json`);
    await writeFile(file, `${JSON.stringify(adapter.writeInput(fixtures.fixtureByName(name)), null, 2)}\n`, 'utf8');
    console.log(`wrote ${path.relative(APP_ROOT, file)}`);
  }
}

const invokedAsCli = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsCli) {
  main().catch((e: unknown) => {
    console.error(`export-playtest: ${errorMessage(e)}`);
    process.exit(1);
  });
}
