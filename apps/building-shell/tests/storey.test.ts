// Raw parts (spec decisions 5 to 11) and the storey's hard errors (decision 2, journal decisions 51, 64 and 73).
import {beforeAll, describe, expect, it} from 'vitest';
import {SHELL_TOLERANCE_CM} from '../src/constants.ts';
import {SHELL_FIXTURES, ShellFixture, fixtureByName, storeysOf} from '../src/fixture.ts';
import {Wasm, getManifold} from '../src/manifold.ts';
import {Piece, solveRoofParts} from '../src/roof/algoB.ts';
import {Building, Rect, Sel, Wall, buildFromRects} from '../src/roof/model.ts';
import {RawPart, StoreyPlan, buildStoreyParts, makePartContext, planBuilding, planStorey} from '../src/storey.ts';
import {Vec3, makeShellTags} from '../src/tags.ts';
import {partManifold} from '../src/union.ts';
import {snapCm} from '../src/weld.ts';

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

function gableOf(plan: StoreyPlan): RawPart {
  const parts = buildStoreyParts(makePartContext(wasm, makeShellTags()), plan);
  const g = parts.find(p => p.kind === 'gable');
  if (!g) throw new Error('no gable part built');
  return g;
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
