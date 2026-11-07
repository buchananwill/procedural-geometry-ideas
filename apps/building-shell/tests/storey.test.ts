// Raw parts (spec decisions 5 to 11) and the storey's hard errors (decision 2, journal decisions 51 and 64).
import {beforeAll, describe, expect, it} from 'vitest';
import {SHELL_TOLERANCE_CM} from '../src/constants.ts';
import {SHELL_FIXTURES, ShellFixture, fixtureByName, storeysOf} from '../src/fixture.ts';
import {Wasm, getManifold} from '../src/manifold.ts';
import {solveRoofParts} from '../src/roof/algoB.ts';
import {buildFromRects} from '../src/roof/model.ts';
import {buildStoreyParts, makePartContext, planStorey} from '../src/storey.ts';
import {makeShellTags} from '../src/tags.ts';
import {partManifold} from '../src/union.ts';
import {snapCm} from '../src/weld.ts';

let wasm: Wasm;
beforeAll(async () => { wasm = await getManifold(); });

const oneStorey = (name: string, sels: ShellFixture['roofs'][number]['sels'], rects: [number, number, number, number][] = [[0, 0, 400, 300]]): ShellFixture => ({
  name, cellSize: 50, storeyHeight: 300,
  rings: rects.map(rect => ({rect, baseStorey: 0, storeys: 1})),
  roofs: {0: {sels, defaultDeg: 45}},
});

/** A monopitch whose only end wall is a cut: `buildPieces` finds no plane for it. */
const NO_PLANE_SELS = [{x: 0, form: 'mono' as const, low: [0, 0] as [number, number]}, {y: 0, form: 'cut' as const}];

describe('storey hard errors', () => {
  it('solveRoofParts returns buildPieces notes, NoPlane among them', () => {
    const parts = solveRoofParts(buildFromRects([[0, 0, 400, 300]], NO_PLANE_SELS), {far: 'plane'});
    expect(parts.notes.some(n => n.includes('line x=0') && n.includes('NoPlane'))).toBe(true);
    expect(parts.pieces).toEqual([]);
  });

  it('a piece dropped as NoPlane is a hard error naming the fixture, storey and line', () => {
    expect(() => planStorey(oneStorey('NoPlaneProbe', NO_PLANE_SELS), 0))
      .toThrow(/NoPlaneProbe storey 0: gable piece dropped as NoPlane: line x=0/);
  });

  it('a hole is refused with an error naming the fixture and storey', () => {
    const ring: [number, number, number, number][] = [[0, 0, 300, 100], [0, 200, 300, 300], [0, 100, 100, 200], [200, 100, 300, 200]];
    expect(() => planStorey(oneStorey('HoleProbe', [], ring), 0)).toThrow(/HoleProbe storey 0: holes need a cut/);
  });

  it('a storey with no roof authored is refused', () => {
    const f = {...oneStorey('NoRoofProbe', []), roofs: {}};
    expect(() => planStorey(f, 0)).toThrow(/NoRoofProbe storey 0: no roof authored/);
  });
});

describe('raw parts', () => {
  it.each(SHELL_FIXTURES.map(f => [f.name, f] as const))('%s: every part is a closed manifold, tagged and on the grid', (_n, f) => {
    const tags = makeShellTags();
    const ctx = makePartContext(wasm, tags);
    for (const n of storeysOf(f)) {
      const plan = planStorey(f, n);
      const parts = buildStoreyParts(ctx, plan);
      // Decision 5: one wall prism and one hip solid per island, at most one solid per gable piece.
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
    const kinds = (p: typeof prism): string[] => [...new Set(p.soup.faceIDs.map(id => tags.table[id].kind))].sort();
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
