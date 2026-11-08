// Spec decision 2 as amended (journal decision 115): a storey plan with a hole is roofed through a cut along a raw Ring
// wall. The cut's selection, its splice, the Courtyard fixture's assertions, and the layouts the rule refuses.
import {beforeAll, describe, expect, it} from 'vitest';
import {SHELL_TOLERANCE_CM} from '../src/constants.ts';
import {selectCut, spliceCourtyard} from '../src/courtyard.ts';
import {COURTYARD_RECTS, ShellFixture, fixtureByName, ring, storeyRings} from '../src/fixture.ts';
import {runB} from '../src/roof/algoB.ts';
import {Pt, polyArea, pt, unionLoops} from '../src/roof/model.ts';
import {ShellBuild, buildShellDetailed} from '../src/shell.ts';
import {planStorey} from '../src/storey.ts';
import type {Vec3} from '../src/tags.ts';
import {invariantViolations} from './shell-invariants.ts';

/** A storey plan's union loops, split into outer loops and holes. */
interface CourtyardLoops { outers: Pt[][]; holes: Pt[][] }

const courtyardLoops = (f: ShellFixture): CourtyardLoops => {
  const loops = unionLoops(storeyRings(f, 0).map(r => r.ring.rect));
  return {outers: loops.filter(l => polyArea(l) > 0), holes: loops.filter(l => polyArea(l) < 0)};
};

/** The Courtyard's cut, as decision 2 chooses it: the shortest raw Ring wall across the ring, then the lowest x, then y. */
const CUT = {a: pt(0, 300), b: pt(300, 300)};
const tol = SHELL_TOLERANCE_CM;

let b: ShellBuild;
beforeAll(async () => { b = await buildShellDetailed(fixtureByName('Courtyard')); }, 60_000);

describe('the cut (spec decision 2 as amended)', () => {
  it("runs along the west wing's S side, y = 300 over x 0 to 300: of four 300 cm walls, the lowest x, then the lowest y", () => {
    const f = fixtureByName('Courtyard');
    const {outers, holes} = courtyardLoops(f);
    expect(holes).toHaveLength(1);
    const cut = selectCut(storeyRings(f, 0), outers, holes[0]);
    expect(cut).toEqual({...CUT, ring: 2, side: 'S', outer: 0});
  });

  it('is what the storey Building is spliced through: two cut walls on it, every other wall hipped at 30 degrees', () => {
    const {building} = planStorey(fixtureByName('Courtyard'), 0);
    expect(building.comps).toHaveLength(1);
    const [comp] = building.comps;
    expect(comp.holes).toHaveLength(1);
    const cuts = comp.walls.filter(w => w.form === 'cut');
    expect(cuts.map(w => [w.a, w.b])).toEqual([[CUT.a, CUT.b], [CUT.b, CUT.a]]);
    for (const w of comp.walls) {
      if (w.form !== 'cut') expect(w.form).toBe('hip');
      expect(Math.abs(w.tan - Math.tan(Math.PI / 6))).toBeLessThan(1e-12);
    }
  });

  it("splices like roof-gable's buildCourtyard at slit 0: A, the outer loop, A, B, the hole's loop, B", () => {
    const outer = [pt(0, 0), pt(10, 0), pt(10, 10), pt(0, 10)];
    const hole = [pt(4, 4), pt(4, 6), pt(6, 6), pt(6, 4)];
    const {ring: r, cutWalls} = spliceCourtyard(outer, hole, {a: pt(10, 0), b: pt(6, 4), ring: 0, side: 'S', outer: 0});
    expect(r).toEqual([pt(10, 0), pt(10, 10), pt(0, 10), pt(0, 0), pt(10, 0), pt(6, 4), pt(4, 4), pt(4, 6), pt(6, 6), pt(6, 4)]);
    expect(cutWalls).toEqual([4, 9]);
  });
});

describe('Courtyard (journal decision 115)', () => {
  it("keeps spec decision 32's invariants with genus 1", () => {
    expect(invariantViolations(b, {genus: 1, cheeks: 0})).toEqual([]);
  });

  it('has a Wall face on each of the four courtyard walls, each 400 by 250', () => {
    const walls: [Vec3, number][] = [[[1, 0, 0], 300], [[-1, 0, 0], -700], [[0, 1, 0], 300], [[0, -1, 0], -700]];
    for (const [n, d] of walls) {
      const on = b.shell.faces.filter(f => f.tag.kind === 'Wall' && f.normal.every((c, i) => Math.abs(c - n[i]) < 1e-9) && Math.abs(f.offset - d) <= tol);
      expect(on, `Wall facing (${n}) at ${d}`).toHaveLength(1);
      expect(Math.abs(on[0].area - 400 * 250)).toBeLessThan(0.05);
    }
  });

  it("tags every raw face on the cut's vertical plane Internal, and none survives", () => {
    const {parts, tags, survivingInternal} = b.union;
    let onCut = 0;
    for (const p of parts) {
      const P = p.soup.positions;
      p.soup.faceIDs.forEach((f, t) => {
        const vs = [0, 1, 2].map(j => p.soup.tris[3 * t + j]);
        const inSpan = vs.every(v => Math.abs(P[3 * v + 1] - 300) <= tol && P[3 * v] >= -tol && P[3 * v] <= 300 + tol);
        if (!inSpan) return;
        onCut++;
        expect(tags.table[f].kind, `${p.name} triangle ${t}`).toBe('Internal');
      });
    }
    expect(onCut).toBeGreaterThan(0);
    expect(survivingInternal).toBe(0);
  });

  it("leaves no trace: no ShellEdge on the cut's line within its span, and none ending inside it", () => {
    const onCutPlane = (p: Vec3): boolean => Math.abs(p[1] - 300) <= tol && p[0] >= -tol && p[0] <= 300 + tol;
    const inside = (p: Vec3): boolean => onCutPlane(p) && p[0] > tol && p[0] < 300 - tol;
    const along = b.shell.edges.filter(e => onCutPlane(e.a) && onCutPlane(e.b) && inside([(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2, 0]));
    expect(along.map(e => `${e.kind} (${e.a}) to (${e.b})`)).toEqual([]);
    expect(b.shell.edges.filter(e => inside(e.a) || inside(e.b)).map(e => `${e.kind} (${e.a}) to (${e.b})`)).toEqual([]);
  });

  it("has an empty report in spec decision 40's sense", () => {
    const {report} = b.shell;
    expect([report.conflicts, report.survivingInternal, report.unclassifiedEdges, report.cheeks, report.newEdgeKinds]).toEqual([[], 0, 0, 0, []]);
  });
});

describe('layouts the rule refuses (spec decision 2 as amended)', () => {
  const courtyard = (name: string, rects: [number, number, number, number][]): ShellFixture => ({
    name, cellSize: 50, storeyHeight: 250, rings: rects.map(r => ring(r, 0, 1, 30)),
  });

  // WP3.6's stop-and-report finding: wings at full height and bands between them. Every raw Ring wall touching the hole
  // runs along it (the bands' inner sides, the wings' inner sides), and every other one lies on the outline, so no raw
  // Ring wall crosses the ring with the interior on both sides along its whole length.
  it('refuses wings at full height with the bands between them: no raw Ring wall crosses the ring', () => {
    const f = courtyard('FullWingsProbe', [[0, 0, 1000, 300], [0, 700, 1000, 1000], [0, 0, 300, 1000], [700, 0, 1000, 1000]]);
    expect(() => planStorey(f, 0)).toThrow(/FullWingsProbe storey 0: no raw Ring wall cuts the courtyard ring from the hole at/);
  });

  it('refuses an island with two holes', () => {
    const f = courtyard('TwoHolesProbe', [[0, 0, 700, 100], [0, 200, 700, 300], [0, 100, 100, 200], [300, 100, 400, 200], [600, 100, 700, 200]]);
    expect(() => planStorey(f, 0)).toThrow(/TwoHolesProbe storey 0: the island at .* holds 2 holes; a courtyard roof takes one/);
  });

  it('roofs the hole the old storey refused (the HoleProbe ring) through its cut', () => {
    const f = courtyard('HoleProbe', [[0, 0, 300, 100], [0, 200, 300, 300], [0, 100, 100, 200], [200, 100, 300, 200]]);
    const plan = planStorey(f, 0);
    expect(plan.building.walls.filter(w => w.form === 'cut').map(w => [w.a, w.b])).toEqual([[pt(0, 100), pt(100, 100)], [pt(100, 100), pt(0, 100)]]);
  });

  // WP3.6's finding, enrolled with its measured signature, not waived: roof-gable's algorithm B, unchanged, overshoots
  // the true roof when the cut is longer than twice the depth of the band beyond it. Both cut pieces read the shorter
  // side's end planes (here x = 0 and the hole's x = 250, rising to 125 at the cut's middle), and the wing-side piece's
  // far wall is the far band's, so nothing caps it at the near band's depth, 100. Its face on the cut then stands
  // higher than its partner's across the slit, and survives.
  it('enrols the cut-piece overshoot (CutOvershootProbe): runB stands 21 cm above the true roof, and one Internal cut face survives', async () => {
    const f = courtyard('CutOvershootProbe', [[0, 250, 250, 600], [0, 600, 650, 850], [400, 250, 650, 600], [0, 150, 650, 250]]);
    const plan = planStorey(f, 0);
    const truth = (x: number, y: number): number => Math.tan(Math.PI / 6) * Math.min(Math.min(x, 650 - x, y - 150, 850 - y), Math.max(250 - x, x - 400, 250 - y, y - 600));
    const at = {x: 127.3, y: 251.7};
    const got = runB(plan.building, {far: 'plane'}).eval(at);
    expect(got?.h ?? NaN).toBeCloseTo(122.7 * Math.tan(Math.PI / 6), 1);
    expect(truth(at.x, at.y)).toBeCloseTo(101.7 * Math.tan(Math.PI / 6), 1);
    expect(invariantViolations(await buildShellDetailed(f), {genus: 1, cheeks: 0})).toEqual(['survivingInternal 1', '3 Unclassified Edges']);
  });

  it('builds the Courtyard from COURTYARD_RECTS', () => {
    expect(fixtureByName('Courtyard').rings.map(r => r.rect)).toEqual(COURTYARD_RECTS);
  });
});
