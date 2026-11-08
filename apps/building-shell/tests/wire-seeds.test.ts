// Journal decisions 140 (F11), 148 (F7) and 149: every seed in `fixtures/playtest/` is `writeInput` of its fixture, as
// `export-playtest.ts` writes it, ignoring line endings, under its per-solve name; and the one seed with an output holds
// `writeOutput` of the prototype's own shell. A fixture changed without re-seeding fails here, not as a silent drift.
// The hand-edited multi-run seed (decision 179, finding 1) is held to `multiRunDocument` the same way.
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {fixtureByName} from '../src/fixture.ts';
import {NOT_ONE_WHOLE_RUN, cppReplayabilityOf} from '../src/golden.ts';
import {buildShell} from '../src/shell.ts';
import {writeOutput} from '../src/wire/canonical-output-schema.ts';
import {INPUT_SUFFIX, OUTPUT_SUFFIX, PROTOTYPE_ENGINE} from '../src/wire/dump.ts';
import {PLAYTEST_DIR, SEED_FIXTURES, SEED_WITH_OUTPUT, seedStem, seedText} from '../src/wire/export-playtest.ts';
import {readInput, snapRunSpans, writeInput} from '../src/wire/input-adapter.ts';
import type {AdaptedInput} from '../src/wire/input-adapter.ts';
import type {BuildingShellInputV1} from '../src/wire/input-types.ts';
import {playtestPin} from './playtest-pins.ts';
import {MULTI_RUN_SEED, MULTI_RUN_SIDE_LENGTH_CM, MULTI_RUN_SLOTS, multiRunDocument} from './wire-round-trip-cases.ts';

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

// Journal decisions 167, finding 1, and 179, finding 1: the only file with multi-run sides, read through spec 16's snap
// order. Each feature leans on one snap step: as written, side 0's first start lies below 0, its second start inside the
// first run and its last end past the side, and side 2's second start within the slack of 0, so a reader that skipped
// or misordered a step refuses it, and its ingestion (tests/playtest-ingest.test.ts) fails.
describe(`the hand-edited seed ${MULTI_RUN_SEED}`, () => {
  const stem = seedStem(MULTI_RUN_SEED);
  /** The seed as `readInput` reads it (journal decision 181, N4): its accepted document, never a cast of the JSON. */
  const read = (): AdaptedInput => {
    const r = readInput(JSON.parse(seedFile(`${stem}${INPUT_SUFFIX}`)), stem);
    if (!r.ok) throw new Error(r.errors.join('; '));
    return r;
  };
  const doc = (): BuildingShellInputV1 => read().input;

  it('is multiRunDocument, named <basename>.<SolveIndex>.<Subject>.<Seed>.input.json, its subject its provenance\'s, and pinned', () => {
    expect(stem).toMatch(new RegExp(`^[^.]+\\.\\d+\\.${MULTI_RUN_SEED}\\.\\d+$`));
    expect(lf(seedFile(`${stem}${INPUT_SUFFIX}`))).toBe(seedText(multiRunDocument()));
    expect(doc().provenance.subject).toBe(MULTI_RUN_SEED);
    expect(playtestPin(stem)).toEqual({kind: 'accepted', genus: [0]});
  });

  it('holds end slack, a junction inside the slack and a gap on its S side, the reviewer\'s sliver on its N side, and each snaps by spec 16', () => {
    const sides = doc().rings[0].sides;
    expect(sides.map(s => s.runs.length)).toEqual([3, 1, 2, 1]);
    for (const {slot, runs} of MULTI_RUN_SLOTS) {
      expect(sides[slot].runs.map(r => [r.startCm, r.endCm])).toEqual(runs.map(t => [...t]));
      expect(sides[slot].runs.map(r => [r.form, r.pitchDegrees])).toEqual(runs.map(() => ['Pitched', 45]));
    }
    const [first, second, last] = sides[0].runs;
    expect([first.startCm < 0, second.startCm < first.endCm, last.endCm > MULTI_RUN_SIDE_LENGTH_CM]).toEqual([true, true, true]);
    expect(snapRunSpans(sides[0].runs, MULTI_RUN_SIDE_LENGTH_CM)).toEqual([{start: 0, end: 400}, {start: 400, end: 600}, {start: 700, end: MULTI_RUN_SIDE_LENGTH_CM}]);
    expect(snapRunSpans(sides[2].runs, MULTI_RUN_SIDE_LENGTH_CM)).toEqual([{start: 0, end: 1.5e-6}, {start: 1.5e-6, end: MULTI_RUN_SIDE_LENGTH_CM}]);
    expect(read().fixture.rings[0].sides).toMatchObject({S: {form: 'hip', deg: 45}, N: {form: 'hip', deg: 45}});
  });

  // Decision 179, finding 1: a multi-run side is never C++-replayable, so the seed never joins the golden set.
  it('is not C++-replayable, by the run-shape reason alone', () => {
    expect(cppReplayabilityOf(doc())).toEqual({cppReplayable: false, reasons: [NOT_ONE_WHOLE_RUN]});
  });
});
