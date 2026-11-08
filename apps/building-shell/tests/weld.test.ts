// The weld-and-snap primitive (spec decision 11, journal decision 51).
import {describe, expect, it} from 'vitest';
import {SNAP_STEPS_PER_CM, snapCm, weldAndSnap} from '../src/weld.ts';

describe('snapCm', () => {
  it('rounds to the 1/1024 cm grid', () => {
    expect(SNAP_STEPS_PER_CM).toBe(1024);
    expect(snapCm(819.6152422706632)).toBe(839286 / 1024);
    expect(snapCm(1 / 3)).toBe(341 / 1024);
    expect(snapCm(-0.0001)).toBe(0);
    expect(Object.is(snapCm(-0.0001), 0)).toBe(true);
  });

  it('is exact in float32 below 16384 cm', () => {
    for (const v of [0.1, 299.99, 819.6152422706632, 16383.9]) {
      const s = snapCm(v);
      expect(Math.fround(s)).toBe(s);
    }
  });
});

describe('weldAndSnap', () => {
  it('welds vertices within tolerance and snaps the survivor', () => {
    const {soup, stats} = weldAndSnap({
      positions: [0, 0, 0, 10, 0, 0, 0, 10, 0, 10.004, 0.003, 0, 10, 10, 0],
      tris: [0, 1, 2, 3, 4, 2],
      faceIDs: [7, 8],
    });
    expect(stats.welded).toBe(1);
    expect(soup.positions.length).toBe(12);
    expect(soup.positions.slice(3, 6)).toEqual([10, 0, 0]);
    // Both triangles now share the welded corner.
    const corners = new Set(soup.tris);
    expect(corners.size).toBe(4);
    expect(soup.faceIDs.sort()).toEqual([7, 8]);
  });

  it('drops a triangle whose corners weld together', () => {
    const {soup, stats} = weldAndSnap({positions: [0, 0, 0, 0.005, 0, 0, 0, 10, 0], tris: [0, 1, 2], faceIDs: [1]});
    expect(stats.collapsed).toBe(1);
    expect(soup.tris).toEqual([]);
  });

  it('splits an edge holding another vertex (a T-junction)', () => {
    // Triangle (0,0)-(10,0)-(0,10) and a vertex at (5,0) from a neighbour lying on its bottom edge.
    const {soup, stats} = weldAndSnap({
      positions: [0, 0, 0, 10, 0, 0, 0, 10, 0, 5, 0.004, 0, 5, -5, 0],
      tris: [0, 1, 2, 0, 4, 3, 3, 4, 1],
      faceIDs: [1, 2, 2],
    });
    expect(stats.splits).toBe(1);
    expect(soup.tris.length / 3).toBe(4);
    expect(soup.faceIDs.filter(f => f === 1).length).toBe(2);
  });

  it('drops a sliver whose own third vertex lies on its opposite edge, never splitting it', () => {
    // (0,0)-(10,0)-(5,0.004): the apex lies within tolerance of the base, so the triangle has no height.
    const {soup, stats} = weldAndSnap({positions: [0, 0, 0, 10, 0, 0, 5, 0.004, 0], tris: [0, 1, 2], faceIDs: [3]});
    expect(stats.slivers).toBe(1);
    expect(stats.splits).toBe(0);
    expect(soup.tris).toEqual([]);
  });
});
