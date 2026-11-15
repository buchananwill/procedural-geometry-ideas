// Holed roof decisions 9 to 17 and 41 to 43: an island is roofed by the skeleton of its outline and its holes, each wall
// at its own pitch, and an island the skeleton refuses is a hard error naming it and its cause, never a roof.
import {describe, expect, it} from 'vitest';
import {solveSkeleton} from '@proc-geo/core';
import type {SkeletonSolveResult, Strip} from '@proc-geo/core';
import {computeMaxOffset, computeStrips} from '@proc-geo/core';
import {COURTYARD_RECTS, ring} from '../src/fixture.ts';
import {loopWeights} from '../src/roof/algoB.ts';
import {Comp, Rect, buildCourtyard, buildFromRects, compLoops, polyArea} from '../src/roof/model.ts';
import {HOLED_CAUSES, facesOfSolve, facesOfStrips, footprintArea, solveFaces} from '../src/roof/skeleton.ts';
import {planStorey} from '../src/storey.ts';
import {HOLED_REFUSALS, HOLED_REFUSAL_ISSUES} from './robustness-fixtures.ts';
import {shellFixture} from './test-builds.ts';

const t30 = Math.tan(Math.PI / 6);

/** The Courtyard's one island, every wall hipped at 30 degrees. */
const courtyardComp = (): Comp => buildFromRects(COURTYARD_RECTS, [], t30).comps[0];

/** A complete holed solve of `comp`, as `solveFaces` makes it. */
const solveOf = (comp: Comp): SkeletonSolveResult => {
  const w = loopWeights(comp);
  return solveSkeleton(comp.outer, {weights: w[0], holes: comp.holes.map((h, k) => ({vertices: h, weights: w[k + 1]}))});
};

describe('the holed Comp (holed roof decisions 4 to 8)', () => {
  it('lists the outer loop\'s walls in loop order, then the hole\'s, each wall naming its loop and edge', () => {
    const c = courtyardComp();
    expect(compLoops(c)).toEqual([c.outer, ...c.holes]);
    expect(polyArea(c.outer)).toBeGreaterThan(0);
    expect(polyArea(c.holes[0])).toBeLessThan(0);
    expect(c.walls.map(w => [w.loop, w.edge])).toEqual([...c.outer.map((_, j) => [0, j]), ...c.holes[0].map((_, j) => [1, j])]);
    for (const w of c.walls) {
      const loop = compLoops(c)[w.loop];
      expect([w.a, w.b]).toEqual([loop[w.edge], loop[(w.edge + 1) % loop.length]]);
    }
  });

  it('builds a courtyard as one Comp with its hole, and its weights per loop', () => {
    const c = buildCourtyard([0, 0, 1000, 1000], [200, 200, 800, 800]).comps[0];
    expect(c.holes).toHaveLength(1);
    expect(loopWeights(c)).toEqual([[1, 1, 1, 1], [1, 1, 1, 1]]);
  });

  // Decision 8: a hole joins the outer loop of least area containing it, so an island in another's courtyard holds its own.
  it('gives a hole to the outer loop of least area that contains it', () => {
    const rects: Rect[] = [
      [0, 0, 2000, 300], [0, 1700, 2000, 2000], [0, 300, 300, 1700], [1700, 300, 2000, 1700],
      [600, 600, 1400, 850], [600, 1150, 1400, 1400], [600, 850, 850, 1150], [1150, 850, 1400, 1150],
    ];
    const comps = buildFromRects(rects, []).comps;
    expect(comps.map(c => [Math.abs(polyArea(c.outer)), c.holes.map(h => Math.abs(polyArea(h)))])).toEqual([[2000 * 2000, [1400 * 1400]], [800 * 800, [300 * 300]]]);
  });
});

describe('the solve (holed roof decisions 9 to 12)', () => {
  // The outer loop keeps the Rings' corners, so 12 walls; canonicalisation merges each straight run, 4 outer and 4 hole.
  it('tiles the footprint, the outer loop less its hole, with one face per straight run of wall', () => {
    const c = courtyardComp();
    expect(c.walls).toHaveLength(12);
    const r = solveFaces(c, loopWeights(c));
    if (!r.ok) throw new Error(`${r.kind}: ${r.cause}`);
    expect(r.faces).toHaveLength(8);
    expect(new Set(r.faces.map(f => f.wall.id)).size).toBe(8);
    expect(r.faces.filter(f => f.wall.loop === 1)).toHaveLength(4);
    expect(footprintArea(c)).toBe(1000 * 1000 - 400 * 400);
    expect(r.tilingError).toBeLessThan(1e-9);
  });

  it('maps every hole face to a hole wall, its face on the wall\'s inward side', () => {
    const c = courtyardComp();
    const r = solveFaces(c, loopWeights(c));
    if (!r.ok) throw new Error(r.cause);
    for (const f of r.faces.filter(x => x.wall.loop === 1)) {
      const cx = f.poly.reduce((s, p) => s + p.x, 0) / f.poly.length, cy = f.poly.reduce((s, p) => s + p.y, 0) / f.poly.length;
      expect((cx - f.wall.a.x) * f.wall.n.x + (cy - f.wall.a.y) * f.wall.n.y).toBeGreaterThan(0);
    }
  });
});

describe('the refusals (holed roof decisions 11, 13, 14 and 16)', () => {
  it('refuses a strip with fewer than three points, and never skips it (constructed strips)', () => {
    const c = courtyardComp();
    const result = solveOf(c);
    const strips: Strip[] = computeStrips(result, {depth: computeMaxOffset(result)});
    expect(facesOfStrips(c, result, strips).ok).toBe(true);
    const emptied = strips.map((s, k) => (k === 5 ? {...s, boundary: s.boundary.slice(0, 2)} : s));
    expect(facesOfStrips(c, result, emptied)).toMatchObject({ok: false, kind: 'strip-missing'});
    expect(facesOfStrips(c, result, strips.slice(1))).toMatchObject({ok: false, kind: 'strip-missing'});
    expect(facesOfStrips(c, result, [...strips.slice(1), strips[1]])).toMatchObject({ok: false, kind: 'strip-missing'});
  });

  it('refuses a holed result that carries a causality violation, and names it (constructed result)', () => {
    const c = courtyardComp();
    const result = solveOf(c);
    const r = facesOfSolve(c, {...result, diagnostics: [...result.diagnostics, {kind: 'causality-violation', detail: 'edge 9 runs back', oracle: 'offset', elementId: 9, magnitude: 1}]});
    expect(r).toMatchObject({ok: false, kind: 'incomplete'});
    if (!r.ok) expect(r.cause).toContain(HOLED_CAUSES['causality-violation']);
  });

  it('counts a single-loop causality violation and goes on, as before (constructed result)', () => {
    const c = buildFromRects([[0, 0, 400, 300]], []).comps[0];
    const result = solveOf(c);
    const r = facesOfSolve(c, {...result, diagnostics: [...result.diagnostics, {kind: 'causality-violation', detail: 'x', oracle: 'offset', elementId: 4, magnitude: 1}]});
    expect(r).toMatchObject({ok: true, causality: 1});
  });

  it('refuses complete: false, listing every blocking kind by its cause, and an unknown kind verbatim (constructed result)', () => {
    const c = courtyardComp();
    const result = solveOf(c);
    const r = facesOfSolve(c, {...result, complete: false, diagnostics: [
      {kind: 'holed-unculled-self-loop', detail: 'informational'}, {kind: 'unresolved-edges', detail: '2 edges'},
      {kind: 'some-future-kind' as 'step-failure', detail: 'new'},
    ]});
    expect(r).toMatchObject({ok: false, kind: 'incomplete'});
    if (r.ok) return;
    expect(r.cause).toContain(`${HOLED_CAUSES['unresolved-edges']} (unresolved-edges: 2 edges)`);
    expect(r.cause).toContain('some-future-kind (some-future-kind: new)');
    expect(r.cause).not.toContain('informational');
  });

  it('roofs a complete holed result with an un-culled self-loop: the kind is informational (decision 55)', () => {
    const c = courtyardComp();
    const result = solveOf(c);
    expect(facesOfSolve(c, {...result, diagnostics: [...result.diagnostics, {kind: 'holed-unculled-self-loop', detail: 'edge 20'}]}).ok).toBe(true);
  });

  // BSA.D326: the solver refuses a pitch change at a vertex with no visible turn, so the cause names walls in line and
  // not a corner. Two flush boxes leave straight vertices at (500, 0) and (500, 400) on the outline; wall 0, x [0, 500]
  // on y = 0, is given another pitch than wall 1, x [500, 1000] on the same line (constructed weights).
  it('refuses a pitch change between two walls in line, and its cause names walls in line, not a corner', () => {
    const c = buildFromRects([[0, 0, 500, 400], [500, 0, 1000, 400]], []).comps[0];
    const [w0, w1] = c.walls;
    expect([w0.a, w0.b, w1.b]).toEqual([{x: 0, y: 0}, {x: 500, y: 0}, {x: 1000, y: 0}]);
    const weights = loopWeights(c).map((loop, k) => (k === 0 ? loop.map((w, j) => (j === 0 ? 2 * w : w)) : loop));
    const r = solveFaces(c, weights);
    expect(r).toMatchObject({ok: false, kind: 'door-turn'});
    if (r.ok) return;
    expect(r.message).toContain('visible corner');
    expect(r.cause).toContain('two walls in line');
    expect(r.cause).not.toContain('meeting at a corner');
  });

  it('names every blocking kind of the skeleton and the loops door in HOLED_CAUSES', () => {
    expect(Object.keys(HOLED_CAUSES).sort()).toEqual([
      'causality-violation', 'door-loops', 'holed-equal-time-violation', 'holed-planarity-violation', 'holed-time-order-violation',
      'holed-topology-violation', 'multi-ring-step-refused', 'simultaneous-across-rings', 'step-failure', 'unresolved-edges',
    ]);
  });
});

/** Decision 17's message, for an island at storey 0 of fixture `name`. */
const refusalPattern = (name: string, holes: number): RegExp =>
  new RegExp(`^${name} storey 0: solveRoofParts: island 0 at \\(-?\\d+, -?\\d+\\) with ${holes} holes cannot be roofed: .+ \\[incomplete: `);

describe('the layouts the holed solve refuses (holed roof decisions 41 to 43)', () => {
  it('holds the 8 layouts that built under the cut, TwoHolesProbe and the draft\'s TwoCourtyards, each with its issue note', () => {
    expect(HOLED_REFUSALS.map(r => r.fixture.name)).toEqual([
      'CourtL', 'JutMidWall', 'BandRunsOnPastWing', 'BandRunsOnPastWingMirrorY', 'JutAlignedS', 'JutAlignedN', 'JutBelowWing', 'JutBelowWingMirrorY',
      'TwoHolesProbe', 'TwoCourtyardsDraft',
    ]);
    for (const r of HOLED_REFUSALS) expect(r.issue).toBe(HOLED_REFUSAL_ISSUES[r.kind]);
  });

  it.each(HOLED_REFUSALS.map(r => [r.fixture.name, r] as const))('%s is a hard error naming the island, its cause and its kind', (name, r) => {
    const holes = name === 'TwoHolesProbe' || name === 'TwoCourtyardsDraft' ? 2 : 1;
    let message = '';
    try {
      planStorey(r.fixture, 0);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(refusalPattern(name, holes));
    expect(message).toContain(`${HOLED_CAUSES[r.kind]} (${r.kind}: `);
  });
});

describe('the roofed courtyards keep their weights (holed roof decision 20)', () => {
  it('a mixed-pitch courtyard\'s hole wall stands at its own pitch: the face of the 45 degree wall rises at tan 45', () => {
    const f = shellFixture('HoleSide45', COURTYARD_RECTS.map((r, i) => ring(r, 0, 1, 30, i === 0 ? {N: {form: 'hip', deg: 45}} : {})));
    const plan = planStorey(f, 0);
    const wall = plan.building.walls.find(w => w.loop === 1 && w.a.y === 300 && w.b.y === 300);
    if (!wall) throw new Error('no hole S wall');
    expect(wall.tan).toBeCloseTo(1, 12);
    // The face of the hole's S wall reaches 150 cm from it only where the 30 degree walls behind it allow: its deepest
    // point is the S band's ridge, which a 45 degree front reaches at 150 tan 30 / tan 45 short of the band's middle.
    const face = plan.roof.faces.find(x => x.wall === wall);
    if (!face) throw new Error('no face');
    const depth = Math.max(...face.poly.map(p => 300 - p.y));
    expect(depth).toBeCloseTo(300 * t30 / (1 + t30), 6);
  });
});
