// A wall's straight line, the primitives algorithm B reads along it: where a point stands along the line, the wall's
// span on it, a point at a distance inward from it, how far the line runs on inside the footprint, the walls standing
// across its ends and facing back across it. Read by algorithm B (`algoB.ts`), the gable rises (`rise.ts`) and the
// storey's gable pieces (`storey.ts`). Every wall is axis-aligned: it runs along x or along y.
import {Building, Comp, Pt, Wall, compLoops, dot, sub} from './model.ts';

/** How far inward of a wall's line a point is read as just inside it, and the least band overlap and depth that count. */
export const WALL_LINE_EPS = 0.01;

/** Whether the wall runs along x. */
export const alongX = (w: Wall): boolean => Math.abs(w.dir.x) > 0.5;

/** `p`'s coordinate along the wall's line. */
export const along = (w: Wall, p: Pt): number => (alongX(w) ? p.x : p.y);

/** The coordinate that is fixed on the wall's line. */
export const fixedOf = (w: Wall): number => (alongX(w) ? w.a.y : w.a.x);

/** The point at `s` along the wall's line, `d` inward of it. */
export const atAlong = (w: Wall, s: number, d: number): Pt => (alongX(w)
  ? {x: s, y: w.a.y + w.n.y * d}
  : {x: w.a.x + w.n.x * d, y: s});

/** The wall's own span along its line, low end first. */
export const spanOf = (w: Wall): [number, number] => {
  const a = along(w, w.a), b = along(w, w.b);
  return [Math.min(a, b), Math.max(a, b)];
};

/**
 * The wall's straight line, walked along its inward side until it leaves the footprint, breaking at every loop's
 * vertices: the wall's own span, run on past each end one vertex of the island's loops at a time (holed roof decision
 * 5), while the line just inside the wall stays inside the building. The span algorithm B's gable piece for `w` covers.
 */
export function extentOf(b: Building, comp: Comp, w: Wall): [number, number] {
  const breaks = [...new Set(compLoops(comp).flat().map(p => along(w, p)))].sort((p, q) => p - q);
  let [lo, hi] = spanOf(w);
  for (;;) {
    const prev = breaks.filter(s => s < lo).pop();
    if (prev === undefined || !b.inside(atAlong(w, (prev + lo) / 2, WALL_LINE_EPS))) break;
    lo = prev;
  }
  for (;;) {
    const next = breaks.find(s => s > hi);
    if (next === undefined || !b.inside(atAlong(w, (next + hi) / 2, WALL_LINE_EPS))) break;
    hi = next;
  }
  return [lo, hi];
}

/** The wall standing across the line's end at coordinate `s`, its inward normal pointing back along the line. */
export function endWall(comp: Comp, w: Wall, s: number, intoLine: number): Wall | undefined {
  const point = atAlong(w, s, WALL_LINE_EPS);
  const axis: Pt = alongX(w) ? {x: 1, y: 0} : {x: 0, y: 1};
  return comp.walls.find(o => {
    if (Math.abs(dot(o.n, axis)) < 0.5) return false;
    if (dot(o.n, axis) * intoLine < 0) return false;
    if (Math.abs(along(w, o.a) - s) > 1e-6) return false;
    const t = dot(sub(point, o.a), o.dir);
    return t >= -1e-6 && t <= o.len + 1e-6;
  });
}

/**
 * The nearest wall facing back at this one across the band `[lo, hi]`; of two at one distance, the first in
 * `comp.walls` (holed roof decision 23).
 */
export function farWall(comp: Comp, w: Wall, lo: number, hi: number): Wall | undefined {
  let best: Wall | undefined;
  let bestD = Infinity;
  for (const o of comp.walls) {
    if (dot(o.n, w.n) > -0.5) continue;
    const d = dot(sub(o.a, w.a), w.n);
    if (d <= WALL_LINE_EPS) continue;
    const [p, q] = spanOf(o);
    if (Math.min(q, hi) - Math.max(p, lo) <= WALL_LINE_EPS) continue;
    if (d < bestD) { bestD = d; best = o; }
  }
  return best;
}

/** How far the storey's bounding box reaches from the wall's line along its inward normal. */
export function bboxReach(b: Building, w: Wall): number {
  if (w.n.y > 0.5) return b.bbox.y1 - w.a.y;
  if (w.n.y < -0.5) return w.a.y - b.bbox.y0;
  if (w.n.x > 0.5) return b.bbox.x1 - w.a.x;
  return w.a.x - b.bbox.x0;
}
