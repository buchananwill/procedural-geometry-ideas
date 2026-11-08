// The genus a fixture's shell should measure, predicted from its Rings alone, so an ingested file's genus is checked
// against its input and never pinned to what the build measured.
//
// Each Ring is a box, its rect over storeys [baseStorey, baseStorey + storeys). A storey's roof is a cap on its own
// plan, which leaves its solid's topology that of the plan extruded, so the shell is the union of the boxes up to
// homotopy. For a compact solid in R³ the boundary's Euler characteristic is twice the solid's, and Manifold's genus is
// 1 - χ(boundary) / 2, so the prediction is 1 - χ(union of boxes). χ is counted exactly on the cubical complex of the
// boxes' coordinates: every open cell whose centre lies in some closed box counts (-1)^dimension.
//
// Not covered: a roof tall enough to reach a storey two above its own where the storey between is absent. There the
// roof could join solids the boxes leave apart, and the genus check reports it.
import type {ShellFixture} from '../src/fixture.ts';

/** The cell positions along one axis: each coordinate, then the midpoint of each gap, as [value, dimension]. */
function axisCells(values: number[]): [number, number][] {
  const v = [...new Set(values)].sort((a, b) => a - b);
  return v.flatMap((x, i): [number, number][] => (i + 1 < v.length ? [[x, 0], [(x + v[i + 1]) / 2, 1]] : [[x, 0]]));
}

/** The Euler characteristic of the union of a fixture's Ring boxes, in storey units on z. */
export function ringBoxEuler(f: ShellFixture): number {
  const boxes = f.rings.map(r => ({x0: r.rect[0], y0: r.rect[1], x1: r.rect[2], y1: r.rect[3], z0: r.baseStorey, z1: r.baseStorey + r.storeys}));
  const xs = axisCells(boxes.flatMap(b => [b.x0, b.x1]));
  const ys = axisCells(boxes.flatMap(b => [b.y0, b.y1]));
  const zs = axisCells(boxes.flatMap(b => [b.z0, b.z1]));
  let chi = 0;
  for (const [x, dx] of xs) {
    const bx = boxes.filter(b => b.x0 <= x && x <= b.x1);
    if (!bx.length) continue;
    for (const [y, dy] of ys) {
      const bxy = bx.filter(b => b.y0 <= y && y <= b.y1);
      if (!bxy.length) continue;
      for (const [z, dz] of zs) if (bxy.some(b => b.z0 <= z && z <= b.z1)) chi += (dx + dy + dz) % 2 ? -1 : 1;
    }
  }
  return chi;
}

/** The genus Manifold should measure on a fixture's shell: 1 - χ of its Ring boxes. */
export const predictedGenus = (f: ShellFixture): number => 1 - ringBoxEuler(f);
