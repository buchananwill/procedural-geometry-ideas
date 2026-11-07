// Journal decision 101: step 4 must build on any valid union. The WP3 correctness reviewer's pitch sweep (F36, F37)
// and its 80 random Ring fixtures (F36), every case built and checked against spec decision 32's invariants and the
// net's own. No case is skipped; the sweep is not thinned.
import {describe, expect, it} from 'vitest';
import {cornerBisector} from '../src/cells.ts';
import {SHELL_TOLERANCE_CM} from '../src/constants.ts';
import {buildShellDetailed} from '../src/shell.ts';
import type {Vec3} from '../src/tags.ts';
import {dot3} from '../src/vec3.ts';
import {STOREY_HEIGHT_CM} from '../src/fixture.ts';
import {REVIEWER_STOREY_HEIGHT_CM, randomFixtures, sweepFixture, sweepFixtures} from './robustness-fixtures.ts';
import {ShellExpectation, invariantViolations} from './shell-invariants.ts';

/** Every sweep case is a box, alone or with one storey on its wall: no tunnel, and no Cheek survives (measured). */
const SWEEP_EXPECTED: ShellExpectation = {genus: 0, cheeks: 0};

/**
 * The random fixtures as measured: genus 0 and no Cheek face for all 80 (rectangles overlapping at a corner never
 * close a tunnel). One case keeps a residual above the area tolerance, pinned exactly, per storey height:
 * - **Fuzz46** at 300 cm storeys: its Hip between Roof faces 11 and 12 runs 559 cm through one mesh vertex 2.47e-4 cm
 *   off the chord, float32 noise in the union's intersection. Each face's loop keeps only the run's ends, so both
 *   faces' loop areas fall 0.042 cm² short of their triangles'. The cleaning cannot reach it: there is no short edge
 *   and no cap, and the case is cleaned of nothing.
 * - **Fuzz46** at 250 cm storeys: the same Hip, 50 cm lower, with the same gap.
 */
const RANDOM_RESIDUALS: Record<number, Record<string, number>> = {300: {Fuzz46: 0.0846}, 250: {Fuzz46: 0.0846}};

/** The reviewer's storey height, so its measured cases reproduce, and the fixtures' (journal decision 102). */
const HEIGHTS = [REVIEWER_STOREY_HEIGHT_CM, STOREY_HEIGHT_CM];

describe.each(HEIGHTS)('the pitch sweep (journal decision 101, F36 and F37) at %i cm storeys: 20 to 70 degrees in 0.173 degree steps', h => {
  const cases = sweepFixtures(h);

  it('has all 580 of the reviewer\'s cases', () => {
    expect(cases).toHaveLength(580);
  });

  it.each(cases.map(f => [f.name, f] as const))('%s builds and keeps every invariant', async (_, f) => {
    const b = await buildShellDetailed(f);
    expect(invariantViolations(b, SWEEP_EXPECTED)).toEqual([]);
  });
});

describe.each(HEIGHTS)('the random Ring fixtures (journal decision 101, F36) at %i cm storeys: seed 1, 80 fixtures', h => {
  const random = randomFixtures(1, 80, h);

  it('pins residuals only for fixtures of the run', () => {
    for (const name of Object.keys(RANDOM_RESIDUALS[h])) expect(random.map(f => f.name)).toContain(name);
  });

  it.each(random.map(f => [f.name, f] as const))('%s builds and keeps every invariant', async (name, f) => {
    const b = await buildShellDetailed(f);
    expect(invariantViolations(b, {genus: 0, cheeks: 0, areaResidual: RANDOM_RESIDUALS[h][name]})).toEqual([]);
  });
});

describe('F37: a Cell corner is placed in the fan by its bisector', () => {
  it('builds the [0, 0, 600, 400] box gabled on y = 0 at 26.574 degrees, its rake apex 0.059 cm over z = 450', async () => {
    const b = await buildShellDetailed(sweepFixture(26.574, false));
    expect(invariantViolations(b, SWEEP_EXPECTED)).toEqual([]);
    const {vertices, netEdges} = b.shell;
    const apex = vertices.filter(v => Math.abs(v.p[0] - 300) <= SHELL_TOLERANCE_CM && Math.abs(v.p[1]) <= SHELL_TOLERANCE_CM)
      .sort((p, q) => q.p[2] - p.p[2])[0];
    expect(apex.p[2] - 450).toBeCloseTo(0.0586, 3);
    // Its two Verge NetEdges are 0.131 cm long, under the 17 cm the 1e-4 rad nudge needed.
    const verges = apex.edges.map(e => netEdges[e]).filter(n => n.kind === 'Verge');
    expect(verges).toHaveLength(2);
    for (const n of verges) {
      const o = vertices[n.v[0] === apex.id ? n.v[1] : n.v[0]].p;
      expect(Math.hypot(o[0] - apex.p[0], o[1] - apex.p[1], o[2] - apex.p[2])).toBeCloseTo(0.131, 3);
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
