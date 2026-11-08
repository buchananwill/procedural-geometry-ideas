// The fixtures the wire round-trip identity test builds twice (journal decisions 143, F1, 148, F2, and 151), the
// fixture as the wire reads it back, and the hand-edited documents written from fixtures (decisions 152, 164 and 179).
// A module of its own, so a measurement script reads exactly the test's cases.
import {COURTYARD_RECTS, EXPORTED_FIXTURES, FixtureRing, RING_SIDES, ShellFixture, ring} from '../src/fixture.ts';
import type {CanonicalDiff} from '../src/wire/canonical.ts';
import {writeInput} from '../src/wire/input-adapter.ts';
import {BuildingShellInputV1, WIRE_GABLE_ONLY_DEG} from '../src/wire/input-types.ts';
import {SPLIT_BAND_LAYOUTS, splitBandFixture, splitBandName} from './robustness-fixtures.ts';
import {shellFixture} from './test-builds.ts';

/**
 * The asymmetric L: a 1000 by 400 wing and a 400 by 800 wing, so no reflection or rotation maps it onto itself, gabled
 * on one side only, the long wing's W side (x = 0).
 */
export const ASYMMETRIC_L: ShellFixture = {
  name: 'AsymmetricL', cellSize: 50, storeyHeight: 250,
  rings: [ring([0, 0, 1000, 400], 0, 1, 40, {W: {form: 'gable'}}), ring([600, 0, 1000, 800], 0, 1, 40)],
};

/** The asymmetric L at a 100 cm lattice: a file whose cell size is not 50 (decision 148, F2's gate). */
export const ASYMMETRIC_L_100: ShellFixture = {...ASYMMETRIC_L, name: 'AsymmetricL100', cellSize: 100};

/**
 * Decision 143, F1's reproducers: courtyards whose cut is collinear with no wall, which read the cutting Ring's
 * `defaultDeg` until WP3.7. The wire carries no `defaultDeg`, so before that fix the round trip changed or broke the
 * shell.
 */
export const CUT_REPRODUCERS: ShellFixture[] = [
  {name: 'CourtyardSOverride', cellSize: 50, storeyHeight: 250, rings: COURTYARD_RECTS.map(r => ring(r, 0, 1, 30, {S: {form: 'hip', deg: 45}}))},
  {name: 'CourtyardMixedPitch', cellSize: 50, storeyHeight: 250, rings: COURTYARD_RECTS.map(r => ring(r, 0, 1, 30, {S: {form: 'hip', deg: 30}, E: {form: 'hip', deg: 35}, N: {form: 'hip', deg: 40}, W: {form: 'hip', deg: 45}}))},
];

/**
 * Journal decision 151: split-band courtyards whose free cut reads the island's hip walls, with gables on union walls
 * the round trip must not let into the cut's pitch: the cutting Ring's W side (the whole x = 0 wall) and the far
 * band's N side gabled, at 45 and 60 degrees (`WN`), and every side gabled but the far band's, at 60 (`n`).
 */
export const GABLED_SPLIT_BANDS: ShellFixture[] = SPLIT_BAND_LAYOUTS.flatMap(l => {
  const gable = {form: 'gable'} as const;
  const twoGables = [45, 60].map(d => {
    const f = splitBandFixture(`${splitBandName(l)}D${d}WN`, ...l, {a: d, w: d});
    f.rings[0] = {...f.rings[0], sides: {...f.rings[0].sides, W: gable}};
    f.rings[4] = {...f.rings[4], sides: {N: gable}};
    return f;
  });
  const farHip = splitBandFixture(`${splitBandName(l)}D60n`, ...l, {a: 60, w: 60});
  farHip.rings = farHip.rings.map((r, i) => ({...r, sides: i === 4 ? {} : {S: gable, E: gable, N: gable, W: gable}}));
  return [...twoGables, farHip];
});

/** Every fixture the byte-identical round trip builds. */
export const IDENTITY_FIXTURES: readonly ShellFixture[] = [...EXPORTED_FIXTURES, ...CUT_REPRODUCERS, ASYMMETRIC_L_100, ...GABLED_SPLIT_BANDS];

/** Decision 140, F4: the default pitch a wire Ring is read with: its first hip's in compass order, else 45. */
export function expectedDefaultDeg(r: FixtureRing): number {
  const hip = RING_SIDES.find(s => (r.sides?.[s]?.form ?? 'hip') === 'hip');
  return hip ? r.sides?.[hip]?.deg ?? r.defaultDeg : WIRE_GABLE_ONLY_DEG;
}

/**
 * A fixture as the wire reads it back (decisions 136, 140, F4, and 153): every side listed at its own pitch or its
 * Ring's default, a gable's included, and each Ring's default replaced by the one the wire derives, which no listed
 * side then reads.
 */
export const withWireDefaults = (f: ShellFixture): ShellFixture => ({
  ...f,
  rings: f.rings.map(r => ({
    ...r,
    defaultDeg: expectedDefaultDeg(r),
    sides: Object.fromEntries(RING_SIDES.map(s => [s, {form: r.sides?.[s]?.form ?? 'hip', deg: r.sides?.[s]?.deg ?? r.defaultDeg}])),
  })),
});

/**
 * The one flag a file whose Rings are listed out of model order raises (decisions 126 and 152): its root order no longer
 * follows its model order (journal decision 166, N3).
 */
export const ORDER_FLAG = /^model-index order and ring \(root\) order disagree/;

/** One run's raw start and end along its side, in cm, as a file writes them (journal decision 166, N5). */
export type RunTuple = readonly [start: number, end: number];

/** The sparse model index `rotatedSparse` gives fixture Ring `i`: 7 + 13 i (journal decision 166, N4). */
export const sparseModelIndex = (i: number): number => 7 + 13 * i;

/**
 * Decisions 148, F2, 152 and 156, F1: a file written with each Ring's corners rotated to start at a corner of its own
 * (sides rotated with them, so side i keeps corner i and its runs), fixture Ring i under the sparse model index
 * `sparseModelIndex(i)`. Its Rings are listed in model order, so no flag is raised.
 */
export function rotatedSparse(f: ShellFixture): BuildingShellInputV1 {
  const w = writeInput(f);
  w.rings.forEach((r, i) => {
    const k = (i + 1) % RING_SIDES.length;
    r.corners = [...r.corners.slice(k), ...r.corners.slice(0, k)];
    r.sides = [...r.sides.slice(k), ...r.sides.slice(0, k)];
    r.modelIndex = sparseModelIndex(i);
  });
  return w;
}

/**
 * Decisions 148, F2, 152 and 164, finding 2: `rotatedSparse`, its Rings then listed in reverse, so the file's order
 * reverses its model order for any two or more Rings. Only the model indices carry the order: each `ringIndex` is its
 * array position, as the C++ replay requires, so the file's root order disagrees with its model order and is flagged.
 * Ordering is then covered by shell identity too. (Before decision 164 the list was rotated by one and then reversed,
 * which leaves a two-Ring list in model order.)
 */
export function scrambled(f: ShellFixture): BuildingShellInputV1 {
  const w = rotatedSparse(f);
  w.rings.reverse();
  w.rings.forEach((r, i) => { r.ringIndex = i; });
  return w;
}

/**
 * The subject of the hand-edited multi-run playtest seed (journal decisions 167, finding 1, and 179, finding 1), its
 * dump `seedStem(MULTI_RUN_SEED)`.
 */
export const MULTI_RUN_SEED = 'MultiRunSide';

/** The length of both sides the multi-run seed splits into runs, its 1000 cm S and N sides. */
export const MULTI_RUN_SIDE_LENGTH_CM = 1000;

/** One side of the multi-run seed, by its file slot, and the runs it holds as written. */
export interface MultiRunSlot { slot: number; runs: readonly RunTuple[] }

/**
 * Journal decision 167, finding 1: the multi-run seed's split sides, each run Pitched at its Ring's 45°, in spec 16's
 * order. Each feature leans on one snap step, so a reader that skips or misorders it refuses the file:
 * - side 0 (S), three runs:
 *   - the first start, 4e-7 below 0, within `WIRE_CORNER_SNAP_CM` of it: step 2 snaps it to 0;
 *   - a junction inside the slack: the second start, 6e-7 below the first run's end, 400, overlaps it as written, and
 *     step 3 snaps it to 400;
 *   - a gap, 600 to 700, accepted, since a party wall or a missing run leaves one;
 *   - end slack: the last end, 3e-7 past the side's length, which step 4 snaps to it;
 * - side 2 (N), decision 164's reviewer case: a first run 1.5e-6 cm long, then a run starting 8e-7 from 0, within the
 *   slack of both 0 and the first run's end. Step 3 snaps it to that end, never to 0, where it would overlap the first.
 */
export const MULTI_RUN_SLOTS: readonly MultiRunSlot[] = [
  {slot: 0, runs: [[-4e-7, 400], [400 - 6e-7, 600], [700, MULTI_RUN_SIDE_LENGTH_CM + 3e-7]]},
  {slot: 2, runs: [[0, 1.5e-6], [8e-7, MULTI_RUN_SIDE_LENGTH_CM]]},
];

/**
 * Journal decisions 167, finding 1, and 179, finding 1: the hand-edited multi-run document, `writeInput` of a 1000 by
 * 400 box hipped at 45° with its S and N sides split as `MULTI_RUN_SLOTS` lists. `writeInput` writes one run per side,
 * so no other file the prototype writes exercises spec 16's snap order. Every run of a side agrees, so each side reads
 * as the box's own hip. It is a playtest seed, never a golden: the C++ does not snap, and under containment replay
 * (decision 152) a lone box's plate run is its whole side, which no split run contains, so it is not C++-replayable.
 */
export function multiRunDocument(): BuildingShellInputV1 {
  const w = writeInput(shellFixture(MULTI_RUN_SEED, [ring([0, 0, MULTI_RUN_SIDE_LENGTH_CM, 400], 0, 1, 45)]));
  for (const {slot, runs} of MULTI_RUN_SLOTS) {
    const side = w.rings[0].sides[slot];
    const [whole] = side.runs;
    side.runs = runs.map(([startCm, endCm]) => ({...whole, startCm, endCm}));
  }
  return w;
}

/**
 * How many records a canonical diff holds on each side: the pin a gable-weight dependence carries. Mapped from
 * `CanonicalDiff` (journal decision 155, B9), so `diffCounts` fails `typecheck` if a field is added and not counted.
 */
export type DiffCounts = {[K in keyof CanonicalDiff]: number};

export const diffCounts = (d: CanonicalDiff): DiffCounts =>
  ({facesOnlyA: d.facesOnlyA.length, facesOnlyB: d.facesOnlyB.length, edgesOnlyA: d.edgesOnlyA.length, edgesOnlyB: d.edgesOnlyB.length});
