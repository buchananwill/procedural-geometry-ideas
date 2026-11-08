// Journal decision 140, F11: every seed in `fixtures/playtest/` is `writeInput` of its fixture, as `export-playtest.ts`
// writes it, ignoring line endings. A fixture changed without re-seeding fails here, not as a silent drift.
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {fixtureByName} from '../src/fixture.ts';
import {INPUT_SUFFIX} from '../src/wire/dump.ts';
import {PLAYTEST_DIR, SEED_FIXTURES, seedText} from '../src/wire/export-playtest.ts';
import {writeInput} from '../src/wire/input-adapter.ts';

const lf = (s: string): string => s.replace(/\r\n/g, '\n');

describe('the playtest seeds', () => {
  it.each(SEED_FIXTURES)('%s: is writeInput of its fixture', name => {
    const file = readFileSync(path.join(PLAYTEST_DIR, `${name}${INPUT_SUFFIX}`), 'utf8');
    expect(lf(file)).toBe(seedText(writeInput(fixtureByName(name))));
  });
});
