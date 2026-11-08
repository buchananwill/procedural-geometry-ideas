// Journal decisions 140 (F11), 148 (F7) and 149: every seed in `fixtures/playtest/` is `writeInput` of its fixture, as
// `export-playtest.ts` writes it, ignoring line endings, under its per-solve name; and the one seed with an output holds
// `writeOutput` of the prototype's own shell. A fixture changed without re-seeding fails here, not as a silent drift.
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {fixtureByName} from '../src/fixture.ts';
import {buildShell} from '../src/shell.ts';
import {writeOutput} from '../src/wire/canonical-output-schema.ts';
import {INPUT_SUFFIX, OUTPUT_SUFFIX, PROTOTYPE_ENGINE} from '../src/wire/dump.ts';
import {PLAYTEST_DIR, SEED_FIXTURES, SEED_WITH_OUTPUT, seedStem, seedText} from '../src/wire/export-playtest.ts';
import {writeInput} from '../src/wire/input-adapter.ts';

const lf = (s: string): string => s.replace(/\r\n/g, '\n');
const seedFile = (name: string): string => readFileSync(path.join(PLAYTEST_DIR, name), 'utf8');

describe('the playtest seeds', () => {
  it.each(SEED_FIXTURES)('%s: is writeInput of its fixture, named <basename>.<SolveIndex>.<Subject>.<Seed>.input.json', name => {
    expect(seedStem(name)).toMatch(new RegExp(`^[^.]+\\.\\d+\\.${name}\\.\\d+$`));
    expect(lf(seedFile(`${seedStem(name)}${INPUT_SUFFIX}`))).toBe(seedText(writeInput(fixtureByName(name))));
  });

  it(`${SEED_WITH_OUTPUT}: carries an output, writeOutput of the prototype's own shell`, async () => {
    expect(SEED_FIXTURES).toContain(SEED_WITH_OUTPUT);
    const shell = await buildShell(fixtureByName(SEED_WITH_OUTPUT));
    expect(lf(seedFile(`${seedStem(SEED_WITH_OUTPUT)}${OUTPUT_SUFFIX}`))).toBe(seedText(writeOutput(PROTOTYPE_ENGINE, shell)));
  });
});
