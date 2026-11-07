// Raw parts (spec decisions 5 to 11) and the storey's hard errors (decision 2, journal decisions 51, 64 and 73).
import {beforeAll, describe, expect, it} from 'vitest';
import {SHELL_TOLERANCE_CM} from '../src/constants.ts';
import {SHELL_FIXTURES, ShellFixture, fixtureByName, storeysOf} from '../src/fixture.ts';
import {Wasm, getManifold} from '../src/manifold.ts';
import {Piece, solveRoofParts} from '../src/roof/algoB.ts';
import {Building, Rect, Sel, Wall, buildFromRects} from '../src/roof/model.ts';
import {
  Generating, RawPart, StoreyPlan, buildStoreyParts, makePartContext, matchGenerating, planBuilding, planStorey,
} from '../src/storey.ts';
import {FaceTag, ShellTags, Vec3, makeShellTags} from '../src/tags.ts';
import {ShellUnion, partManifold, triArea, unionPlans} from '../src/union.ts';
import {TriSoup, snapCm} from '../src/weld.ts';

let wasm: Wasm;
beforeAll(async () => { wasm = await getManifold(); });

const RECT_400_300: Rect[] = [[0, 0, 400, 300]];

const oneStorey = (name: string, sels: Sel[], rects: Rect[] = RECT_400_300): ShellFixture => ({
  name, cellSize: 50, storeyHeight: 300,
  rings: rects.map(rect => ({rect, baseStorey: 0, storeys: 1})),
  roofs: {0: {sels, defaultDeg: 45}},
});

/**
 * Two monopitches, each rising from the other's dead high-end wall: x = 400 rises from (400, 0), which kills y = 300;
 * x = 0 rises from (0, 300), which kills y = 0. Each one's only end wall is dead, so `buildPieces` drops both.
 */
const NO_PLANE_SELS: Sel[] = [{x: 400, form: 'mono', low: [400, 0]}, {x: 0, form: 'mono', low: [0, 300]}];

function wallOn(b: Building, test: (w: Wall) => boolean, what: string): Wall {
  const w = b.walls.find(test);
  if (!w) throw new Error(`no wall ${what}`);
  return w;
}

/** A plan whose roof is replaced by one hand-made piece, for paths `buildPieces` never takes. */
function planWithPiece(label: string, rects: Rect[], piece: (b: Building) => Piece): StoreyPlan {
  const plan = planBuilding(label, 0, 0, 300, buildFromRects(rects, []));
  return {...plan, roof: {...plan.roof, pieces: [piece(plan.building)]}};
}

function gableOf(plan: StoreyPlan, tags: ShellTags = makeShellTags()): RawPart {
  const parts = buildStoreyParts(makePartContext(wasm, tags), plan);
  const g = parts.find(p => p.kind === 'gable');
  if (!g) throw new Error('no gable part built');
  return g;
}

/** Output area matching `pred` on the plane x = 200 facing +x, and off it. */
interface OnX200 { on: number; off: number }

function onX200(u: ShellUnion, pred: (t: FaceTag) => boolean): OnX200 {
  const out: OnX200 = {on: 0, off: 0};
  u.triTags.forEach((tag, t) => {
    if (!pred(tag)) return;
    const pl = u.tags.planes[u.mesh.faceIDs[t]];
    const on = Math.abs(pl.n[0] - 1) < 1e-9 && Math.abs(pl.d - 200) <= SHELL_TOLERANCE_CM;
    out[on ? 'on' : 'off'] += triArea(u.mesh, t);
  });
  return out;
}

const vertices = (p: RawPart): Vec3[] =>
  Array.from({length: p.soup.positions.length / 3}, (_, i) => [p.soup.positions[3 * i], p.soup.positions[3 * i + 1], p.soup.positions[3 * i + 2]]);

describe('storey hard errors', () => {
  it('solveRoofParts returns buildPieces notes, NoPlane among them', () => {
    const parts = solveRoofParts(buildFromRects(RECT_400_300, NO_PLANE_SELS), {far: 'plane'});
    expect(parts.notes.some(n => n.includes('line x=0') && n.includes('NoPlane'))).toBe(true);
    expect(parts.notes.some(n => n.includes('line x=400') && n.includes('NoPlane'))).toBe(true);
    expect(parts.pieces).toEqual([]);
  });

  it('a dropped piece is a hard error naming the fixture, storey and line', () => {
    expect(() => planStorey(oneStorey('NoPlaneProbe', NO_PLANE_SELS), 0))
      .toThrow(/NoPlaneProbe storey 0: gable piece dropped: .*line x=/);
  });

  it('a cut wall is a hard error naming the fixture, storey and wall', () => {
    expect(() => planStorey(oneStorey('CutProbe', [{y: 0, form: 'cut'}]), 0))
      .toThrow(/CutProbe storey 0: a cut wall needs a courtyard, which is deferred: y=0 x\[0,400\]/);
  });

  it('a hole is refused with an error naming the fixture and storey', () => {
    const ring: Rect[] = [[0, 0, 300, 100], [0, 200, 300, 300], [0, 100, 100, 200], [200, 100, 300, 200]];
    expect(() => planStorey(oneStorey('HoleProbe', [], ring), 0)).toThrow(/HoleProbe storey 0: holes need a cut/);
  });

  it('a storey with no roof authored is refused', () => {
    const f = {...oneStorey('NoRoofProbe', []), roofs: {}};
    expect(() => planStorey(f, 0)).toThrow(/NoRoofProbe storey 0: no roof authored/);
  });
});

describe('gable piece construction (decision 8)', () => {
  // An L with its notch at x < 600, y > 400. The piece stands on y = 0 across the whole line and reaches without
  // limit, so only the bounding-box cap stops it at y = 1000 and only the footprint trim keeps it out of the notch.
  const L_RECTS: Rect[] = [[0, 0, 1000, 400], [600, 0, 1000, 1000]];
  const reachingPiece = (b: Building): Piece => {
    const w = wallOn(b, x => x.a.y === 0 && x.b.y === 0, 'on y = 0');
    return {wall: w, bandLo: 0, bandHi: 1000, farDist: Infinity, planes: [w.plane], label: 'line y=0 hand-made'};
  };

  it('is trimmed to the island footprint', () => {
    const inNotch = vertices(gableOf(planWithPiece('FootprintProbe', L_RECTS, reachingPiece)))
      .filter(([x, y]) => x < 600 - SHELL_TOLERANCE_CM && y > 400 + SHELL_TOLERANCE_CM);
    expect(inNotch).toEqual([]);
  });

  it('is capped at the storey bounding box', () => {
    const plan = planWithPiece('BboxProbe', L_RECTS, reachingPiece);
    const {x0, y0, x1, y1} = plan.building.bbox;
    const outside = vertices(gableOf(plan)).filter(([x, y, z]) => !Number.isFinite(x + y + z)
      || x < x0 - SHELL_TOLERANCE_CM || x > x1 + SHELL_TOLERANCE_CM || y < y0 - SHELL_TOLERANCE_CM || y > y1 + SHELL_TOLERANCE_CM);
    expect(outside).toEqual([]);
    // The cap is reached: the piece runs all the way to y = 1000 inside the L's tall wing.
    expect(Math.max(...vertices(gableOf(plan)).map(v => v[1]))).toBeCloseTo(1000, 6);
  });

  it('with no height over its band is a hard error naming the fixture, storey and line', () => {
    const plan = planWithPiece('FlatProbe', RECT_400_300, b => {
      const w = wallOn(b, x => x.a.y === 0 && x.b.y === 0, 'on y = 0');
      return {wall: w, bandLo: 0, bandHi: 400, farDist: 0, planes: [w.plane], label: 'line y=0 zero depth'};
    });
    expect(() => gableOf(plan)).toThrow(/FlatProbe storey 0: gable piece 0 \(line y=0 zero depth\) is empty/);
  });

  it('with nothing left after the trims is a hard error naming the fixture, storey and line', () => {
    const plan = planWithPiece('OffFootprintProbe', RECT_400_300, b => {
      const w = wallOn(b, x => x.a.y === 0 && x.b.y === 0, 'on y = 0');
      return {wall: w, bandLo: 2000, bandHi: 2100, farDist: 100, planes: [w.plane], label: 'line y=0 off the footprint'};
    });
    expect(() => gableOf(plan)).toThrow(/OffFootprintProbe storey 0: gable piece 0 \(line y=0 off the footprint\) is empty/);
  });
});

describe('wall-line Gable is bounded by the wall (journal decision 80)', () => {
  // The correctness reviewer's U: the spine's y = 0 wall is gabled over [0, 200] only. The piece's band end at x = 200
  // stands over the spine for y 0 to 200, where no wall stands, and on the left arm's wall x = 200 for y 200 to 600.
  const U_RECTS: Rect[] = [[0, 0, 200, 600], [0, 0, 1000, 200], [800, 0, 1000, 600]];
  const U_SELS: Sel[] = [{y: 0, to: 200, form: 'gable'}];

  it('has one surviving Cheek, on x = 200 over the spine, and Gable on the arm wall only within its span', () => {
    const f = oneStorey('UProbe', U_SELS, U_RECTS);
    const plan = planStorey(f, 0);
    const u = unionPlans(wasm, f.name, [plan]);
    expect(u.cheeks).toBe(1);
    const cheek = onX200(u, t => t.kind === 'Cheek');
    expect(cheek.off).toBeLessThan(SHELL_TOLERANCE_CM ** 2);
    // Over the spine: 200 tall less the spine hip beneath it, 40000 - 10000.
    expect(Math.abs(cheek.on - 30000)).toBeLessThan(0.05);
    const arm = wallOn(plan.building, w => w.a.x === 200 && w.b.x === 200, 'on x = 200');
    // The arm wall's own span, y 200 to 600, under min(200, 600 - y).
    expect(Math.abs(onX200(u, t => t.kind === 'Gable' && t.wall === arm.id).on - 60000)).toBeLessThan(0.05);
  });
});

describe('own wall first (journal decision 80)', () => {
  it('tags a piece on the later of two collinear walls Gable with its own wall over the whole band', () => {
    // [0, 400] x [0, 300] traced from two rects keeps a corner at (200, 0), so y = 0 is two collinear walls.
    const tags = makeShellTags();
    let own = -1, earlier = -1;
    const part = gableOf(planWithPiece('CollinearProbe', [[0, 0, 200, 300], [200, 0, 400, 300]], b => {
      const onY0 = b.walls.filter(x => x.a.y === 0 && x.b.y === 0).sort((p, q) => p.id - q.id);
      if (onY0.length !== 2) throw new Error(`expected two walls on y = 0, found ${onY0.length}`);
      earlier = onY0[0].id;
      const w = onY0[1];
      own = w.id;
      const end = (x: number): number => wallOn(b, o => o.a.x === x && o.b.x === x, `on x = ${x}`).plane;
      return {wall: w, bandLo: 0, bandHi: 400, farDist: 300, planes: [end(0), end(400)], label: 'line y=0 on the later wall'};
    }), tags);
    // Only the y = 0 plane: the far side at y = 300 is Gable on walls of its own, within their spans.
    const onY0 = part.soup.faceIDs.filter(id => tags.planes[id].n[1] < -0.5 && Math.abs(tags.planes[id].d) <= SHELL_TOLERANCE_CM);
    const gables = onY0.map(id => tags.table[id]).filter(t => t.kind === 'Gable');
    expect(onY0.length).toBe(gables.length);
    expect(own).toBeGreaterThan(earlier);
    expect(gables.length).toBeGreaterThan(0);
    expect([...new Set(gables.map(t => t.wall))]).toEqual([own]);
  });
});

describe('generating-plane matching (journal decision 80, N2)', () => {
  const up = (d: number): Generating => ({plane: {n: [0, 0, 1], d}, tag: {kind: 'Cheek', storey: 0, wall: 0, plane: -1}});
  /** A one-triangle soup with these corners. */
  const soupAt = (corners: Vec3[]): TriSoup => ({positions: corners.flat(), tris: [0, 1, 2], faceIDs: [-1]});

  it('matches a low triangle whose float32-noisy normal is far beyond 1e-5', () => {
    // 1 cm altitude, one corner 2e-4 cm high: the normal tilts by about 2e-4.
    expect(matchGenerating('probe', soupAt([[0, 0, 0], [100, 0, 0], [50, 1, 2e-4]]), 0, [up(0)])).toBe(0);
  });

  it('is a hard error when no plane holds the triangle', () => {
    expect(() => matchGenerating('NoMatchProbe', soupAt([[0, 0, 5], [100, 0, 5], [0, 100, 5]]), 0, [up(0)]))
      .toThrow(/NoMatchProbe: triangle 0 at .* matches no generating plane/);
  });

  it('is a hard error when two planes both hold it', () => {
    expect(() => matchGenerating('TieProbe', soupAt([[0, 0, 0.0025], [100, 0, 0.0025], [0, 100, 0.0025]]), 0, [up(0), up(0.005)]))
      .toThrow(/TieProbe: triangle 0 at .* ties between generating planes 0 and 1/);
  });

  it('rejects a plane its normal faces away from', () => {
    const down: Generating = {plane: {n: [0, 0, -1], d: 0}, tag: {kind: 'Cheek', storey: 0, wall: 0, plane: -1}};
    expect(() => matchGenerating('FacingProbe', soupAt([[0, 0, 0], [100, 0, 0], [0, 100, 0]]), 0, [down]))
      .toThrow(/matches no generating plane/);
  });
});

describe('raw parts', () => {
  it.each(SHELL_FIXTURES)('$name: every part is a closed manifold, tagged and on the grid', f => {
    const tags = makeShellTags();
    const ctx = makePartContext(wasm, tags);
    for (const n of storeysOf(f)) {
      const plan = planStorey(f, n);
      const parts = buildStoreyParts(ctx, plan);
      // Decision 5: one wall prism and one hip solid per island, one solid per gable piece.
      expect(parts.filter(p => p.kind === 'wallPrism').length).toBe(plan.building.comps.length);
      expect(parts.filter(p => p.kind === 'hip').length).toBe(plan.building.comps.length);
      expect(parts.filter(p => p.kind === 'gable').length).toBe(plan.roof.pieces.length);
    }
    for (const part of ctx.parts) {
      const m = partManifold(wasm, part);
      expect(m.status()).toBe('NoError');
      expect(m.volume()).toBeGreaterThan(0);
      m.delete();
      expect(part.soup.faceIDs.length * 3).toBe(part.soup.tris.length);
      for (const f of part.soup.faceIDs) {
        expect(tags.table[f].part).toBe(part.id);
        expect(tags.table[f].storey).toBe(part.storey);
      }
      for (const v of part.soup.positions) expect(snapCm(v)).toBe(v);
    }
  });

  it('tags NarrowUpperStorey storey 0 by kind: wall prism, hip solid and the y = 0 gable piece', () => {
    const f = fixtureByName('NarrowUpperStorey');
    const tags = makeShellTags();
    const ctx = makePartContext(wasm, tags);
    const [prism, hip, gable] = buildStoreyParts(ctx, planStorey(f, 0));
    const kinds = (p: RawPart): string[] => [...new Set(p.soup.faceIDs.map(id => tags.table[id].kind))].sort();
    expect(kinds(prism)).toEqual(['Ground', 'Internal', 'Wall']);
    expect(kinds(hip)).toEqual(['Internal', 'Roof']);
    expect(gable.kind).toBe('gable');
    // The gable piece: its three Roof planes, the Gable on y = 0, and the Cheek on the plate.
    expect(kinds(gable)).toEqual(['Cheek', 'Gable', 'Roof']);
    const gableTags = gable.soup.faceIDs.map(id => tags.table[id]);
    expect(new Set(gableTags.filter(t => t.kind === 'Roof').map(t => t.plane)).size).toBe(3);
    expect(gableTags.filter(t => t.kind === 'Gable').every(t => t.wall === 0)).toBe(true);
    // Gable area on y = 0: half of 600 by 300 tan 60.
    let gableArea = 0;
    const P = gable.soup.positions;
    gable.soup.faceIDs.forEach((id, t) => {
      if (tags.table[id].kind !== 'Gable') return;
      const [a, b, c] = [0, 1, 2].map(j => 3 * gable.soup.tris[3 * t + j]);
      gableArea += Math.abs((P[b] - P[a]) * (P[c + 2] - P[a + 2]) - (P[c] - P[a]) * (P[b + 2] - P[a + 2])) / 2;
    });
    expect(Math.abs(gableArea - 90000 * Math.sqrt(3))).toBeLessThan(SHELL_TOLERANCE_CM);
  });
});
