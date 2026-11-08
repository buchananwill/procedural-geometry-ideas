// Journal decisions 101, 108 and 110: step 4 must build on any valid union. Every case here is built and checked
// against spec decision 32's invariants and the net's own (`invariantViolations`):
// - the WP3 correctness reviewer's pitch sweep (F36, F37), at 300 and 250 cm storeys;
// - decision 108's grid of pitch by storey height;
// - random Ring fixtures, seeds 1 to 4 at both storey heights (C4);
// - random courtyards from the full Ring family, and the same layouts with one wing removed (U shapes), seeds 1 and 2
//   at both storey heights (journal decisions 115, 132 and 135, F50), each measured defect enrolled with exactly its
//   signature;
// - journal decision 122's δ-nudge sweeps, each measured defect enrolled the same way;
// - the named regression fixtures C1 and C2, decision 122's and decision 135's reproducers, and decision 140's;
// - opt-in: with `SHELL_FUZZ_SEEDS` set (for example `5-12`), a larger seeded fuzz of `SHELL_FUZZ_COUNT` Ring fixtures
//   per seed at the storey heights `SHELL_FUZZ_HEIGHTS` (default `300,250`); with `SHELL_COURT_SEEDS` set, the
//   courtyard and U generators the same way, 40 per seed.
// No case is skipped and no sweep is thinned.
import {describe, expect, it} from 'vitest';
import {cornerBisector} from '../src/cells.ts';
import {SHELL_TOLERANCE_CM} from '../src/constants.ts';
import {errorMessage} from '../src/errors.ts';
import {STOREY_HEIGHT_CM, ShellFixture} from '../src/fixture.ts';
import {ShellBuild, buildShellDetailed} from '../src/shell.ts';
import type {Vec3} from '../src/tags.ts';
import {dot3} from '../src/vec3.ts';
import {
  CAP_CHAIN_SEED, PINCH_SEEDS, REVIEWER_STOREY_HEIGHT_CM, flushOverReflexFixture, gridFixtures, nudgeFixtures, randomCourtyardFixtures,
  pitchEndFixtures, randomFixtures, randomSplitCourtyards, randomUFixtures, seededFixture, sweepFixture, sweepFixtures,
} from './robustness-fixtures.ts';
import {planStorey} from '../src/storey.ts';
import {FixtureRing, ring} from '../src/fixture.ts';
import {ShellExpectation, dist, invariantViolations} from './shell-invariants.ts';

/**
 * Every sweep, grid and random case as measured: genus 0 and no Cheek face (a box with a storey on its wall, or
 * rectangles overlapping at a corner, never close a tunnel). Fuzz46, whose 559 cm Hip passes through one mesh vertex
 * 2.47e-4 cm off its chord, is held by the loop checks like every other case, with no pin of its own.
 */
const EXPECTED: ShellExpectation = {genus: 0, cheeks: 0};

/** The reviewer's storey height, so its measured cases reproduce, and the fixtures' (journal decision 102). */
const HEIGHTS = [REVIEWER_STOREY_HEIGHT_CM, STOREY_HEIGHT_CM];

/** Journal decision 110, C4: the random seeds gated on every run, 140 fixtures each (the reviewer's run). */
const SEEDS = [1, 2, 3, 4];
const PER_SEED = 140;

const holds = async (f: ShellFixture): Promise<ShellBuild> => {
  const b = await buildShellDetailed(f);
  expect(invariantViolations(b, EXPECTED)).toEqual([]);
  return b;
};

describe.each(HEIGHTS)('the pitch sweep (journal decision 101, F36 and F37) at %i cm storeys: 20 to 70 degrees in 0.173 degree steps', h => {
  const cases = sweepFixtures(h);

  it('has all 580 of the reviewer\'s cases', () => {
    expect(cases).toHaveLength(580);
  });

  it.each(cases.map(f => [f.name, f] as const))('%s builds and keeps every invariant', async (_, f) => {
    await holds(f);
  });
});

describe('the pitch by storey-height grid (journal decision 108): 250 to 300 cm by 20 to 70 degrees', () => {
  const cases = gridFixtures();

  it('has 612 cases', () => {
    expect(cases).toHaveLength(612);
  });

  it.each(cases.map(f => [f.name, f] as const))('%s builds and keeps every invariant', async (_, f) => {
    await holds(f);
  });
});

describe.each(SEEDS.flatMap(s => HEIGHTS.map(h => [s, h] as const)))('the random Ring fixtures (journal decision 110, C4): seed %i at %i cm storeys', (seed, h) => {
  it.each(randomFixtures(seed, PER_SEED, h).map(f => [f.name, f] as const))('%s builds and keeps every invariant', async (_, f) => {
    await holds(f);
  });
});

// ---- Random courtyards (journal decision 115) -----------------------------------------------------------------------

/** The courtyard seeds gated on every run, 40 fixtures each, at both storey heights. */
const COURTYARD_SEEDS = [1, 2];
const PER_COURTYARD_SEED = 40;

/** A courtyard runs from the ground to the sky: genus 1. */
const COURTYARD_EXPECTED: ShellExpectation = {genus: 1, cheeks: 0};

/**
 * Measured at WP3.7, findings, not waivers: every random courtyard that breaks an invariant, keyed `s<seed>h<height>/
 * <name>`, with exactly its violations (or `throws:` and the error a build raised). A case not listed keeps every
 * invariant. A cure breaks the suite as surely as a new defect, and either is re-measured, never softened.
 * - A surviving Cheek face (Court14), and a surviving Internal cut face with Unclassified Edges (Court15): roof-gable
 *   algorithm B's inherited defects, its CHEEK class and its cut-piece overshoot (`CutOvershootProbe`), in the frozen
 *   copy (spec decision 31).
 * - Court25: two storeys' faces touching face to face on one plane over part of each, a Gable facing +x against a Wall
 *   facing -x, which the union leaves unfused and the cleaning's sheet removal (journal decision 122, G1) does not
 *   reach, since the two regions differ.
 * WP3.6's table (decision 135, F2) held two `cleanMesh` refusals that floor-standing holed hip solids caused, s1h300/
 * Court5 (a stuck cap) and s1h250/Court16 (a pinching collapse); clustering (decision 122, F-C) cures both, and they are
 * kept as named regressions below, since the generator now draws other layouts under those names.
 */
const COURTYARD_DEFECTS: Readonly<Record<string, readonly string[]>> = {
  's1h300/Court14': ["cheeks 1, expected 0"],
  's1h300/Court25': ["throws: cell 847: side 24-292 reads ShellEdge 63, its NetEdge -1"],
  's1h250/Court14': ["cheeks 1, expected 0"],
  's1h250/Court25': ["throws: cell 729: side 24-278 reads ShellEdge 63, its NetEdge -1"],
  's2h300/Court15': ["survivingInternal 1","3 Unclassified Edges"],
  's2h250/Court15': ["survivingInternal 1","3 Unclassified Edges"],
};

/** Measured at WP3.7: every U-shape case that breaks an invariant, in the same form. None does. */
const U_DEFECTS: Readonly<Record<string, readonly string[]>> = {
};

/** A build's measured outcome: its invariant violations, or the error it raised. */
async function outcome(f: ShellFixture, want: ShellExpectation): Promise<string[]> {
  try {
    return invariantViolations(await buildShellDetailed(f), want);
  } catch (e) {
    return [`throws: ${errorMessage(e)}`];
  }
}

/** A courtyard's measured outcome. */
const courtyardOutcome = (f: ShellFixture): Promise<string[]> => outcome(f, COURTYARD_EXPECTED);

describe.each(COURTYARD_SEEDS.flatMap(s => HEIGHTS.map(h => [s, h] as const)))('random courtyards (journal decisions 115, 132 and 135): seed %i at %i cm storeys', (seed, h) => {
  it.each(randomCourtyardFixtures(seed, PER_COURTYARD_SEED, h).map(f => [f.name, f] as const))('%s keeps every invariant, or exactly its measured defect', async (name, f) => {
    expect(await courtyardOutcome(f)).toEqual(COURTYARD_DEFECTS[`s${seed}h${h}/${name}`] ?? []);
  });
});

/**
 * Measured at WP3.8: every split-band courtyard (journal decisions 150 and 151) that breaks an invariant, in the same
 * form. Split mode makes the free cut, collinear with no wall, the shortest, so every one of these reads the free
 * branch and takes the island's steepest hip wall.
 */
const SPLIT_COURTYARD_DEFECTS: Readonly<Record<string, readonly string[]>> = {
  's2h250/SplitCourt10': ["throws: cleanMesh: cap 38 (31-36, apex 34) can neither flip nor merge its apex into its long edge"],
  's2h263/SplitCourt10': ["throws: cleanMesh: cap 38 (31-36, apex 34) can neither flip nor merge its apex into its long edge"],
  's2h300/SplitCourt10': ["throws: cleanMesh: cap 38 (31-37, apex 34) can neither flip nor merge its apex into its long edge"],
  's5h250/SplitCourt29': ["throws: cell 790: side 334-11 reads ShellEdge 59, its NetEdge -1"],
};

describe.each(COURTYARD_SEEDS.flatMap(s => HEIGHTS.map(h => [s, h] as const)))('random split-band courtyards (journal decisions 150 and 151): seed %i at %i cm storeys', (seed, h) => {
  const draws = randomSplitCourtyards(seed, PER_COURTYARD_SEED, h);

  // The gate on the free branch: removing it moves every cut off its split line.
  it.each(draws.map(d => [d.fixture.name, d] as const))('%s is cut along its split, the free cut', (_, {fixture, split}) => {
    const cuts = planStorey(fixture, 0).building.walls.filter(w => w.form === 'cut');
    expect(cuts).toHaveLength(2);
    for (const w of cuts) expect([w.a, w.b].map(p => (split.axis === 'x' ? p.x : p.y))).toEqual([split.at, split.at]);
  });

  it.each(draws.map(d => [d.fixture.name, d.fixture] as const))('%s keeps every invariant, or exactly its measured defect', async (name, f) => {
    expect(await courtyardOutcome(f)).toEqual(SPLIT_COURTYARD_DEFECTS[`s${seed}h${h}/${name}`] ?? []);
  });
});

describe.each(COURTYARD_SEEDS.flatMap(s => HEIGHTS.map(h => [s, h] as const)))('random U shapes (F50): seed %i at %i cm storeys', (seed, h) => {
  it.each(randomUFixtures(seed, PER_COURTYARD_SEED, h).map(f => [f.name, f] as const))('%s keeps every invariant, or exactly its measured defect', async (name, f) => {
    expect(await outcome(f, EXPECTED)).toEqual(U_DEFECTS[`s${seed}h${h}/${name}`] ?? []);
  });
});

// ---- Journal decision 122's δ-nudge sweeps ------------------------------------------------------------------------

/**
 * Measured at WP3.7: every nudge that breaks an invariant, with exactly its violations. All are decision 122's G5:
 * an apex or ridge 5/1024 to 12/1024 cm through the floor above, under its eave, leaves roof features 0.004 to 0.012
 * cm across, above the cleaning's tolerance and at the shell's, whose Edges read Indeterminate, so Unclassified. The
 * nudges of 0.5/1024 to 4/1024 cm, which C8's link check and the 0.005 cm move limit refused (F-C, G2), all build.
 */
const NUDGE_DEFECTS: Readonly<Record<string, readonly string[]>> = {
  ApexEdge5: ["1 Unclassified Edges","interior NetEdge 469 borders cells 214","interior NetEdge 537 borders cells 255","NetEdge 574 on ShellEdge 20 borders faces 8, expected 15,8","NetEdge 575 on ShellEdge 14 borders faces 8, expected 5,8","NetEdge 576 on ShellEdge 18 borders faces 9, expected 7,9","NetEdge 577 on ShellEdge 23 borders faces 9, expected 15,9","interior NetEdge 921 borders cells 450","interior NetEdge 924 borders cells 451"],
  RidgeEdge5: ["2 Unclassified Edges"],
  OverhangApexOnEave5: ["1 Unclassified Edges","interior NetEdge 469 borders cells 214","interior NetEdge 537 borders cells 255","NetEdge 574 on ShellEdge 20 borders faces 8, expected 14,8","NetEdge 575 on ShellEdge 14 borders faces 8, expected 5,8","NetEdge 686 on ShellEdge 18 borders faces 10, expected 10,7","NetEdge 687 on ShellEdge 23 borders faces 10, expected 10,14","interior NetEdge 1016 borders cells 494","interior NetEdge 1019 borders cells 495"],
  ApexEdge8: ["4 Unclassified Edges"],
  RidgeEdge8: ["3 Unclassified Edges"],
  OverhangApexOnEave8: ["5 Unclassified Edges"],
  ApexEdge12: ["4 Unclassified Edges"],
  RidgeEdge12: ["3 Unclassified Edges"],
  OverhangApexOnEave12: ["4 Unclassified Edges"],
};

describe("journal decision 122's δ-nudges at 250 cm storeys: an apex or ridge a hair under, at or over the floor above", () => {
  it.each(nudgeFixtures().map(f => [f.name, f] as const))('%s keeps every invariant, or exactly its measured defect', async (name, f) => {
    expect(await outcome(f, EXPECTED)).toEqual(NUDGE_DEFECTS[name] ?? []);
  });
});

// ---- The named regression fixtures (journal decision 110) ---------------------------------------------------------

const near = (p: Vec3, q: Vec3): boolean => dist(p, q) <= SHELL_TOLERANCE_CM;

/**
 * C1's pinch at `p`: one ShellVertex whose faces are its sheets' faces, sheet by sheet, the sheets in order of lowest
 * face id. `below` says which faces form the sheet under the overhang (the lower walls and the upper Underside).
 */
function expectPinch(b: ShellBuild, p: Vec3, below: (f: number) => boolean): void {
  const v = b.shell.vertices.filter(x => near(x.p, p));
  expect(v, `one vertex at (${p})`).toHaveLength(1);
  const {faces, cells} = v[0];
  const sheets = [faces.filter(below), faces.filter(f => !below(f))];
  expect(sheets.map(s => s.length > 0)).toEqual([true, true]);
  const [first, second] = [...sheets].sort((a, c) => Math.min(...a) - Math.min(...c));
  expect(faces).toEqual([...first, ...second]);
  // Cells follow the same sheets, in the same order.
  const cellFaces = cells.map(c => b.shell.cells[c].face);
  const firstCells = cellFaces.findIndex(f => !first.includes(f));
  expect(cellFaces.slice(0, firstCells).every(f => first.includes(f))).toBe(true);
  expect(cellFaces.slice(firstCells).every(f => second.includes(f))).toBe(true);
}

describe.each(HEIGHTS)('C1: an upper wall flush over a lower reflex corner (journal decision 110) at %i cm storeys', h => {
  it('FlushOverReflex: one ShellVertex carries both sheets at the corner, and the overhang foot is two coincident ShellEdges', async () => {
    const b = await holds(flushOverReflexFixture(h));
    const tag = (f: number) => b.shell.faces[f].tag;
    const P: Vec3 = [300, 300, h], Q: Vec3 = [450, 300, h];
    expectPinch(b, P, f => (tag(f).kind === 'Wall' && tag(f).storey === 0) || tag(f).kind === 'Underside');
    const foot = b.shell.edges.filter(e => (near(e.a, P) && near(e.b, Q)) || (near(e.a, Q) && near(e.b, P)));
    expect(foot.map(e => e.kind).sort()).toEqual(['RingJunction', 'SoffitJunction']);
    expect(new Set(foot.map(e => [...e.v].sort().join(','))).size).toBe(1);
  });

  it.each(PINCH_SEEDS.map(([s, k]) => [`Seed${s}Fuzz${k}`, s, k] as const))('%s builds and keeps every invariant', async (_, s, k) => {
    await holds(seededFixture(s, k, h));
  });
});

describe.each(HEIGHTS)('C2: two caps sharing a long edge (journal decision 110) at %i cm storeys', h => {
  it(`Seed${CAP_CHAIN_SEED[0]}Fuzz${CAP_CHAIN_SEED[1]} builds and keeps every invariant, its cap chain merged`, async () => {
    const b = await holds(seededFixture(CAP_CHAIN_SEED[0], CAP_CHAIN_SEED[1], h));
    expect(b.union.clean.merged).toBeGreaterThan(0);
  });
});

describe.each(HEIGHTS)('C2 and F-D at %i cm storeys: the cap chain moves no vertex further than the bound', h => {
  it(`Seed${CAP_CHAIN_SEED[0]}Fuzz${CAP_CHAIN_SEED[1]} moves no vertex further than SHELL_TOLERANCE_CM`, async () => {
    const b = await holds(seededFixture(CAP_CHAIN_SEED[0], CAP_CHAIN_SEED[1], h));
    expect(b.union.clean.maxMoveCm).toBeLessThanOrEqual(SHELL_TOLERANCE_CM);
  });
});

// ---- Journal decision 143: the wire format's pitch ends -------------------------------------------------------------

/**
 * Measured at WP3.7 for the wire format's proposed pitch bounds, 5 to 75 degrees: every failing case found, with
 * exactly its violations. Below 7 degrees the 0.173 degree sweep and finer scans find narrow pockets, all but one a
 * Cell side that lies on no ShellEdge, lattice line or split line; from 6.91 degrees up, every case scanned is green.
 */
const PITCH_END_DEFECTS: Readonly<Record<string, readonly string[]>> = {
  'G5.86h250': ["throws: cell 276: side 107-109 is neither on a ShellEdge, a lattice line nor a split line"],
  'G5.86h250u': ["throws: cell 201: side 109-111 is neither on a ShellEdge, a lattice line nor a split line"],
  'G5.86h300': ["throws: cell 316: side 111-113 is neither on a ShellEdge, a lattice line nor a split line"],
  'G5.86h300u': ["throws: cell 241: side 113-115 is neither on a ShellEdge, a lattice line nor a split line"],
  'G5.865h250': ["throws: cell 276: side 107-109 is neither on a ShellEdge, a lattice line nor a split line"],
  'G5.865h250u': ["throws: cell 201: side 109-111 is neither on a ShellEdge, a lattice line nor a split line"],
  'G5.865h300': ["throws: cell 316: side 111-113 is neither on a ShellEdge, a lattice line nor a split line"],
  'G5.865h300u': ["throws: cell 241: side 113-115 is neither on a ShellEdge, a lattice line nor a split line"],
  'G5.87h250': ["throws: cell 276: side 107-109 is neither on a ShellEdge, a lattice line nor a split line"],
  'G5.87h250u': ["throws: cell 201: side 109-111 is neither on a ShellEdge, a lattice line nor a split line"],
  'G5.87h300': ["throws: cell 316: side 111-113 is neither on a ShellEdge, a lattice line nor a split line"],
  'G5.87h300u': ["throws: cell 241: side 113-115 is neither on a ShellEdge, a lattice line nor a split line"],
  'G6.015h250': ["throws: cell 276: side 107-109 is neither on a ShellEdge, a lattice line nor a split line"],
  'G6.015h250u': ["throws: cell 201: side 109-111 is neither on a ShellEdge, a lattice line nor a split line"],
  'G6.015h300': ["throws: cell 316: side 111-113 is neither on a ShellEdge, a lattice line nor a split line"],
  'G6.015h300u': ["throws: cell 241: side 113-115 is neither on a ShellEdge, a lattice line nor a split line"],
  'G6.02h250': ["throws: cell 276: side 107-109 is neither on a ShellEdge, a lattice line nor a split line"],
  'G6.02h250u': ["throws: cell 201: side 109-111 is neither on a ShellEdge, a lattice line nor a split line"],
  'G6.02h300': ["throws: cell 316: side 111-113 is neither on a ShellEdge, a lattice line nor a split line"],
  'G6.02h300u': ["throws: cell 241: side 113-115 is neither on a ShellEdge, a lattice line nor a split line"],
  'G6.15h250': ["throws: cell 276: side 107-109 is neither on a ShellEdge, a lattice line nor a split line"],
  'G6.15h250u': ["throws: cell 201: side 109-111 is neither on a ShellEdge, a lattice line nor a split line"],
  'G6.27h250': ["throws: cell 276: side 107-109 is neither on a ShellEdge, a lattice line nor a split line"],
  'G6.27h250u': ["throws: cell 201: side 109-111 is neither on a ShellEdge, a lattice line nor a split line"],
  'G6.38h250': ["throws: cell 276: side 107-109 is neither on a ShellEdge, a lattice line nor a split line"],
  'G6.38h250u': ["throws: cell 201: side 109-111 is neither on a ShellEdge, a lattice line nor a split line"],
  'G6.48h250u': ["throws: cell 201: side 109-111 is neither on a ShellEdge, a lattice line nor a split line"],
  'G6.57h250u': ["throws: cell 201: side 109-111 is neither on a ShellEdge, a lattice line nor a split line"],
  'G6.66h250u': ["throws: cell 201: side 109-111 is neither on a ShellEdge, a lattice line nor a split line"],
  'G6.9h250u': ["2 Unclassified Edges"],
};

describe("the wire format's pitch ends (journal decision 143): the sweep's box from 5 to 20 and from 70 to 75 degrees", () => {
  it.each(pitchEndFixtures().map(f => [f.name, f] as const))('%s keeps every invariant, or exactly its measured defect', async (name, f) => {
    expect(await outcome(f, EXPECTED)).toEqual(PITCH_END_DEFECTS[name] ?? []);
  });
});

// ---- Journal decision 122's reproducers, and decisions 135's and 140's ---------------------------------------------

describe("journal decision 122's fresh-seed reproducers, each cured", () => {
  it.each([[250], [263], [300]] as const)('G1: Seed5Fuzz46 at %i cm, its unfused pillow dropped as a zero-volume sheet', async h => {
    expect((await holds(seededFixture(5, 46, h))).union.clean.sheetTris).toBeGreaterThan(0);
  });

  it.each([[12, 17, 250], [8, 73, 300]] as const)('G1: Seed%iFuzz%i at %i cm, its prism top and gable bottom left unfused, dropped and stitched', async (s, k, h) => {
    expect((await holds(seededFixture(s, k, h))).union.clean.sheetTris).toBeGreaterThan(0);
  });

  it.each([[250], [263], [300]] as const)('F-C: Seed5Fuzz89 at %i cm, three vertices 1.2e-4 cm apart clustered, where the link check refused the collapse', async h => {
    expect((await holds(seededFixture(5, 89, h))).union.clean.merged).toBeGreaterThan(0);
  });

  it('G3: Seed11Fuzz10 at 300 cm, a lattice square holding a hole of its Roof, split into pieces of one lattice index', async () => {
    const b = await holds(seededFixture(11, 10, 300));
    const keys = b.shell.cells.map(c => `${c.face}|${c.lattice}`);
    expect(keys.length).toBeGreaterThan(new Set(keys).size);
  });

  it.each([[false], [true]] as const)('G4: P61.866 at 263 cm (upper storey %s), a rake vertex 0.0089 cm from a lattice crossing in plan, 0.019 in 3D', async upper => {
    await holds(sweepFixture(61.866, upper, 263));
  });
});

/** Journal decision 135, F2: WP3.6's two cleanMesh refusals under floor-standing holed hip solids, stated literally. */
const F2_COURTYARDS: [string, number, FixtureRing[]][] = [
  ['s1h300/Court5', 300, [
    ring([300, 200, 500, 550], 0, 1, 37), ring([50, 550, 500, 650], 0, 1, 37),
    ring([50, 50, 500, 200], 0, 3, 37, {E: {form: 'gable'}, N: {form: 'gable'}, W: {form: 'gable'}}), ring([50, 200, 200, 550], 0, 2, 37),
  ]],
  ['s1h250/Court16', 250, [
    ring([100, 450, 650, 550], 0, 3, 30, {N: {form: 'gable'}, W: {form: 'gable'}}), ring([500, 200, 650, 450], 0, 1, 30, {S: {form: 'gable'}, W: {form: 'gable'}}),
    ring([100, 100, 650, 200], 0, 2, 30, {W: {form: 'gable'}}), ring([100, 200, 300, 450], 0, 2, 30, {E: {form: 'gable'}}),
  ]],
];

describe("journal decision 135, F2: floor-standing holed hip solids' two cleanMesh refusals, cured", () => {
  it.each(F2_COURTYARDS)('%s keeps every invariant', async (name, storeyHeight, rings) => {
    expect(await courtyardOutcome({name, cellSize: 50, storeyHeight, rings})).toEqual([]);
  });
});

describe('journal decision 140, F5: storeys joined by edge contact', () => {
  // WP5's review: storey 1's U stands on storey 0 by its wings, and its band touches storey 0 only along storey 0's
  // north eave, y = 400 at z = 250. The band's Underside runs straight past the U's inner corners there, so a Cell
  // corner at a corner lies inside a ShellEdge whose faces the corner's own triangle fans never reach.
  it('UpperUJoinedByEdgeContact keeps every invariant', async () => {
    await holds({
      name: 'UpperUJoinedByEdgeContact', cellSize: 50, storeyHeight: 250,
      rings: [ring([0, 0, 1000, 400], 0, 1, 45), ring([0, 0, 200, 400], 1, 1, 45), ring([800, 0, 1000, 400], 1, 1, 45), ring([0, 400, 1000, 600], 1, 1, 45)],
    });
  });
});

// ---- The opt-in fuzz (journal decision 110, C4) ---------------------------------------------------------------------

/** A test-only seed setting: `a-b` or a comma list of seeds. */
function seedList(spec: string): number[] {
  if (!spec) return [];
  const range = /^(\d+)-(\d+)$/.exec(spec);
  if (range) return Array.from({length: Number(range[2]) - Number(range[1]) + 1}, (_, i) => Number(range[1]) + i);
  return spec.split(',').map(Number);
}

/** `SHELL_FUZZ_HEIGHTS`, a test-only setting: the opt-in fuzz's storey heights, a comma list, by default both heights. */
const FUZZ_HEIGHTS: number[] = process.env.SHELL_FUZZ_HEIGHTS ? process.env.SHELL_FUZZ_HEIGHTS.split(',').map(Number) : HEIGHTS;
const FUZZ_SEEDS = seedList(process.env.SHELL_FUZZ_SEEDS ?? '');
const COURT_FUZZ_SEEDS = seedList(process.env.SHELL_COURT_SEEDS ?? '');

if (FUZZ_SEEDS.length) {
  describe.each(FUZZ_SEEDS.flatMap(s => FUZZ_HEIGHTS.map(h => [s, h] as const)))('the opt-in fuzz: seed %i at %i cm storeys', (seed, h) => {
    it.each(randomFixtures(seed, Number(process.env.SHELL_FUZZ_COUNT ?? PER_SEED), h).map(f => [f.name, f] as const))('%s', async (_, f) => {
      await holds(f);
    });
  });
}

if (COURT_FUZZ_SEEDS.length) {
  describe.each(COURT_FUZZ_SEEDS.flatMap(s => FUZZ_HEIGHTS.map(h => [s, h] as const)))('the opt-in courtyard and U fuzz: seed %i at %i cm storeys', (seed, h) => {
    it.each(randomCourtyardFixtures(seed, PER_COURTYARD_SEED, h).map(f => [f.name, f] as const))('courtyard %s', async (_, f) => {
      expect(await courtyardOutcome(f)).toEqual([]);
    });
    it.each(randomUFixtures(seed, PER_COURTYARD_SEED, h).map(f => [f.name, f] as const))('U %s', async (_, f) => {
      expect(await outcome(f, EXPECTED)).toEqual([]);
    });
  });
}

// ---- F37 ------------------------------------------------------------------------------------------------------------

describe('F37: a Cell corner is placed in the fan by its bisector', () => {
  it('builds the [0, 0, 600, 400] box gabled on y = 0 at 26.574 degrees, its rake apex 0.059 cm over z = 450', async () => {
    const b = await holds(sweepFixture(26.574, false));
    const {vertices, netEdges} = b.shell;
    const apex = vertices.filter(v => Math.abs(v.p[0] - 300) <= SHELL_TOLERANCE_CM && Math.abs(v.p[1]) <= SHELL_TOLERANCE_CM)
      .sort((p, q) => q.p[2] - p.p[2])[0];
    expect(apex.p[2] - 450).toBeCloseTo(0.0586, 3);
    // Its two Verge NetEdges are 0.131 cm long, under the 17 cm the 1e-4 rad nudge needed.
    const verges = apex.edges.map(e => netEdges[e]).filter(n => n.kind === 'Verge');
    expect(verges).toHaveLength(2);
    for (const n of verges) {
      const o = vertices[n.v[0] === apex.id ? n.v[1] : n.v[0]].p;
      expect(dist(o, apex.p)).toBeCloseTo(0.131, 3);
    }
    expect(apex.cells.length).toBeGreaterThan(0);
  });

  it('points strictly inside a corner at any angle, a straight or reflex one included', () => {
    const n: Vec3 = [0, 0, 1];
    const pos: Vec3[] = [[0, 0, 0], [10, 0, 0], [0, 10, 0], [-10, 0, 0], [0, -10, 0], [10, 0.001, 0]];
    const corner = (prev: number, next: number): Vec3 =>
      cornerBisector({id: 0, face: 0, lattice: [0, 0], polygon: [], corners: [prev, 0, next], sides: [], whole: false}, 0, pos, n);
    // Leaving along +x, arriving from +y: a right angle, bisected at 45 degrees.
    const right = corner(2, 1);
    expect(right[0]).toBeCloseTo(Math.SQRT1_2, 9);
    expect(right[1]).toBeCloseTo(Math.SQRT1_2, 9);
    // Leaving along +x, arriving from -x: straight, bisected along +y.
    expect(dot3(corner(3, 1), [0, 1, 0])).toBeCloseTo(1, 9);
    // Leaving along +x, arriving from -y: reflex (270 degrees), bisected along (-1, 1).
    const reflex = corner(4, 1);
    expect(reflex[0]).toBeCloseTo(-Math.SQRT1_2, 9);
    expect(reflex[1]).toBeCloseTo(Math.SQRT1_2, 9);
    // A corner of 1e-4 rad: the bisector still lies strictly between its sides.
    const thin = corner(5, 1);
    expect(thin[1]).toBeGreaterThan(0);
    expect(thin[1] / thin[0]).toBeLessThan(0.001 / 10);
  });
});
