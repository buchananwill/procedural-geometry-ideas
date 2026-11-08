// Journal decisions 101, 108 and 110: step 4 must build on any valid union. Every case here is built and checked
// against spec decision 32's invariants and the net's own (`invariantViolations`):
// - the WP3 correctness reviewer's pitch sweep (F36, F37), at 300 and 250 cm storeys;
// - decision 108's grid of pitch by storey height;
// - random Ring fixtures, seeds 1 to 4 at both storey heights (C4);
// - random courtyards, seeds 1 and 2 at both storey heights (journal decision 115), each measured defect enrolled with
//   exactly its signature;
// - the named regression fixtures C1 and C2 enrolled;
// - with `SHELL_FUZZ_SEEDS` set (for example `5-20`), a larger seeded fuzz, opt-in.
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
  CAP_CHAIN_SEED, PINCH_SEEDS, REVIEWER_STOREY_HEIGHT_CM, flushOverReflexFixture, gridFixtures, randomCourtyardFixtures,
  randomFixtures, seededFixture, sweepFixture, sweepFixtures,
} from './robustness-fixtures.ts';
import {ShellExpectation, dist, invariantViolations} from './shell-invariants.ts';

/**
 * Every sweep, grid and random case as measured: genus 0 and no Cheek face (a box with a storey on its wall, or
 * rectangles overlapping at a corner, never close a tunnel). Fuzz46, whose 559 cm Hip passes through one mesh vertex
 * 2.47e-4 cm off its chord, is held by C5's area accounting like every other case, with no pin of its own.
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
 * Measured at WP3.6, findings, not waivers: every random courtyard that breaks an invariant, keyed `s<seed>h<height>/
 * <name>`, with exactly its violations (or `throws:` and the error a build raised). A case not listed keeps every
 * invariant. A cure breaks the suite as surely as a new defect, and either is re-measured, never softened.
 * - Unclassified Edges, with gables over several storeys: the same class appears on these layouts with one wing removed
 *   (a U, no hole), so it is not the courtyard's.
 * - `cleanMesh` refusals (a pinching collapse, a stuck cap), with gables on one storey: courtyard-only, none on the Us.
 * - A Cheek face, and a surviving Internal cut face with Unclassified Edges, on gabled or multi-storey courtyards.
 */
const COURTYARD_DEFECTS: Readonly<Record<string, readonly string[]>> = {
  's1h250/Court1': ['2 Unclassified Edges'],
  's1h250/Court4': ['2 Unclassified Edges'],
  's1h250/Court7': ['6 Unclassified Edges'],
  's1h250/Court16': ['throws: cleanMesh: collapsing the short edge 35-37 would pinch the surface'],
  's1h250/Court19': ['4 Unclassified Edges'],
  's1h250/Court20': ['4 Unclassified Edges'],
  's1h250/Court22': ['throws: cleanMesh: collapsing the short edge 50-52 would pinch the surface'],
  's1h250/Court29': ['4 Unclassified Edges'],
  's1h250/Court36': ['2 Unclassified Edges'],
  's1h300/Court4': ['2 Unclassified Edges'],
  's1h300/Court5': ['throws: cleanMesh: cap 114 (55-14, apex 47) can neither flip nor merge its apex into its long edge'],
  's1h300/Court7': ['4 Unclassified Edges'],
  's1h300/Court16': ['throws: cleanMesh: collapsing the short edge 36-38 would pinch the surface'],
  's1h300/Court19': ['4 Unclassified Edges'],
  's1h300/Court22': ['throws: cleanMesh: collapsing the short edge 51-53 would pinch the surface'],
  's1h300/Court29': ['4 Unclassified Edges'],
  's2h250/Court15': ['survivingInternal 1', '3 Unclassified Edges'],
  's2h250/Court29': ['cheeks 1, expected 0'],
  's2h250/Court37': ['2 Unclassified Edges'],
  's2h300/Court15': ['survivingInternal 1', '3 Unclassified Edges'],
  's2h300/Court29': ['cheeks 1, expected 0'],
  's2h300/Court37': ['2 Unclassified Edges'],
};

/** A courtyard's measured outcome: its invariant violations, or the error its build raised. */
async function courtyardOutcome(f: ShellFixture): Promise<string[]> {
  try {
    return invariantViolations(await buildShellDetailed(f), COURTYARD_EXPECTED);
  } catch (e) {
    return [`throws: ${errorMessage(e)}`];
  }
}

describe.each(COURTYARD_SEEDS.flatMap(s => HEIGHTS.map(h => [s, h] as const)))('random courtyards (journal decision 115): seed %i at %i cm storeys', (seed, h) => {
  it.each(randomCourtyardFixtures(seed, PER_COURTYARD_SEED, h).map(f => [f.name, f] as const))('%s keeps every invariant, or exactly its measured defect', async (name, f) => {
    expect(await courtyardOutcome(f)).toEqual(COURTYARD_DEFECTS[`s${seed}h${h}/${name}`] ?? []);
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

// ---- The opt-in fuzz (journal decision 110, C4) ---------------------------------------------------------------------

/** `SHELL_FUZZ_SEEDS`, a test-only setting: `a-b` or a comma list of seeds, each run at both storey heights. */
function fuzzSeeds(): number[] {
  const spec = process.env.SHELL_FUZZ_SEEDS ?? '';
  if (!spec) return [];
  const range = /^(\d+)-(\d+)$/.exec(spec);
  if (range) return Array.from({length: Number(range[2]) - Number(range[1]) + 1}, (_, i) => Number(range[1]) + i);
  return spec.split(',').map(Number);
}

if (fuzzSeeds().length) {
  describe.each(fuzzSeeds().flatMap(s => HEIGHTS.map(h => [s, h] as const)))('the opt-in fuzz: seed %i at %i cm storeys', (seed, h) => {
    it.each(randomFixtures(seed, Number(process.env.SHELL_FUZZ_COUNT ?? PER_SEED), h).map(f => [f.name, f] as const))('%s', async (_, f) => {
      await holds(f);
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
