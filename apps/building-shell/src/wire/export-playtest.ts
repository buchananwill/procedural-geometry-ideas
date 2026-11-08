// A node CLI seeding `fixtures/playtest/` with real `input@1` files written from the prototype's own fixtures, so the
// ingestion test (tests/playtest-ingest.test.ts) is never vacuous (journal decision 124). It writes one seed per
// `SEED_FIXTURES` entry, each a dump named per solve, `<dump basename>.<SolveIndex>.<Subject>.<Seed>.input.json`
// (decisions 140, F6, 149 and 152), and one seed also carries its output, the prototype's own canonical shell, so pair
// ingestion runs end to end (decision 148, F7). tests/wire-seeds.test.ts holds each of these seeds to `writeInput` and
// the output to `writeOutput`. The folder's one other seed, the hand-edited multi-run `MultiRunSide` (decision 179,
// finding 1), is not written here, and this CLI never touches it: the test holds it to `multiRunDocument` instead.
// fixtures/playtest/README.md says which seeds are C++-replayable and why (decision 182).
//
// Run from the app as `node --experimental-strip-types --disable-warning=ExperimentalWarning src/wire/export-playtest.ts`.
// As `export.ts` does, it loads the pipeline through Vite's module runner with the core-source alias restated, since
// the runner does not read `configFile` (journal manual, decision 150, F7).
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import type {InlineConfig} from 'vite';
import {errorMessage} from '../errors.ts';

const APP_ROOT = fileURLToPath(new URL('../..', import.meta.url));

/** The ingestion folder: every dump in it is loaded, validated and run through every invariant. */
export const PLAYTEST_DIR = path.join(APP_ROOT, 'fixtures', 'playtest');

/**
 * The seeded fixtures: one Ring, a T, two storeys over an L, a tunnel (genus 1), a courtyard (genus 1), a Ring
 * conflict decided by model index, and a port layout at 300 cm storeys.
 */
export const SEED_FIXTURES: readonly string[] = [
  'DefaultChalet', 'SingleStoreyT', 'ValleyWings', 'BridgeOverBlock', 'Courtyard', 'OverlapRingConflictSwapped', 'PortPokeOut300',
];

/** The one seed that also carries its output (decision 148, F7). */
export const SEED_WITH_OUTPUT = 'ValleyWings';

/** The dump basename the prototype's seeds take, standing in for a solve dump's own. */
export const SEED_BASENAME = 'prototype-seed';

/**
 * A seed's stem, `<dump basename>.<SolveIndex>.<Subject>.<Seed>` (decisions 149 and 152), the solve index and the seed
 * always 0. The subjects are fixture names, already sanitised.
 */
export const seedStem = (subject: string): string => `${SEED_BASENAME}.0.${subject}.0`;

/** A seed's text: a document as two-space JSON with a final newline. */
export const seedText = (doc: unknown): string => `${JSON.stringify(doc, null, 2)}\n`;

async function main(): Promise<void> {
  const {runnerImport} = await import('vite');
  const {CORE_SOURCE} = await import('../../vite.config.ts');
  const config: InlineConfig = {
    root: APP_ROOT, configFile: path.join(APP_ROOT, 'vite.config.ts'), logLevel: 'error',
    resolve: {alias: [{find: /^@proc-geo\/core$/, replacement: CORE_SOURCE}]},
  };
  const src = (file: string): string => path.join(APP_ROOT, 'src', file);
  const {module: fixtures} = await runnerImport<typeof import('../fixture.ts')>(src('fixture.ts'), config);
  const {module: adapter} = await runnerImport<typeof import('./input-adapter.ts')>(src('wire/input-adapter.ts'), config);
  const {module: dump} = await runnerImport<typeof import('./dump.ts')>(src('wire/dump.ts'), config);
  const {module: output} = await runnerImport<typeof import('./canonical-output-schema.ts')>(src('wire/canonical-output-schema.ts'), config);
  const {module: shell} = await runnerImport<typeof import('../shell.ts')>(src('shell.ts'), config);
  await mkdir(PLAYTEST_DIR, {recursive: true});
  for (const name of SEED_FIXTURES) {
    const file = path.join(PLAYTEST_DIR, `${seedStem(name)}${dump.INPUT_SUFFIX}`);
    await writeFile(file, seedText(adapter.writeInput(fixtures.fixtureByName(name))), 'utf8');
    console.log(`wrote ${path.relative(APP_ROOT, file)}`);
  }
  const out = path.join(PLAYTEST_DIR, `${seedStem(SEED_WITH_OUTPUT)}${dump.OUTPUT_SUFFIX}`);
  const built = await shell.buildShell(fixtures.fixtureByName(SEED_WITH_OUTPUT));
  await writeFile(out, seedText(output.writeOutput(dump.PROTOTYPE_ENGINE, built)), 'utf8');
  console.log(`wrote ${path.relative(APP_ROOT, out)}`);
}

const invokedAsCli = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsCli) {
  main().catch((e: unknown) => {
    console.error(`export-playtest: ${errorMessage(e)}`);
    process.exit(1);
  });
}
