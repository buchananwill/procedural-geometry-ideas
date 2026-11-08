// Spec decision 2 as amended (journal decision 115): a storey plan with a hole is roofed through a cut along one raw
// Ring wall, spliced into a slit polygon of width 0 exactly as roof-gable's `buildCourtyard` does. Every test here is
// segment arithmetic on the plan's own loops: no point is tested for lying inside anything.
import {RingSide, StoreyRing} from './fixture.ts';
import {RING_SIDES, ringSideLines} from './ring-forms.ts';
import {Pt, pt} from './roof/model.ts';

/** The chosen cut: `a` on the island's outer loop, `b` on the hole's loop, and the Ring wall it runs along. */
export interface CourtyardCut { a: Pt; b: Pt; ring: number; side: RingSide; outer: number }

/** An axis-aligned segment's ends. */
interface Seg { p: Pt; q: Pt }

const samePt = (p: Pt, q: Pt): boolean => p.x === q.x && p.y === q.y;
const between = (v: number, a: number, b: number): boolean => v >= Math.min(a, b) && v <= Math.max(a, b);

/** Whether `p` lies on segment `s`, its ends included. Both are axis-aligned. */
const onSeg = (p: Pt, s: Seg): boolean =>
  (s.p.x === s.q.x ? p.x === s.p.x && between(p.y, s.p.y, s.q.y) : p.y === s.p.y && between(p.x, s.p.x, s.q.x));

const loopSegs = (loop: Pt[]): Seg[] => loop.map((p, i) => ({p, q: loop[(i + 1) % loop.length]}));

/** Whether axis-aligned segment `e` shares any point with the open segment `s` (its ends excluded). */
function touchesOpen(s: Seg, e: Seg): boolean {
  const sv = s.p.x === s.q.x, ev = e.p.x === e.q.x;
  if (sv === ev) {
    if (sv ? s.p.x !== e.p.x : s.p.y !== e.p.y) return false;
    const [slo, shi] = sv ? [Math.min(s.p.y, s.q.y), Math.max(s.p.y, s.q.y)] : [Math.min(s.p.x, s.q.x), Math.max(s.p.x, s.q.x)];
    const [elo, ehi] = sv ? [Math.min(e.p.y, e.q.y), Math.max(e.p.y, e.q.y)] : [Math.min(e.p.x, e.q.x), Math.max(e.p.x, e.q.x)];
    return Math.max(slo, elo) < shi && Math.min(shi, ehi) > slo && Math.max(slo, elo) <= Math.min(shi, ehi);
  }
  const x = pt(sv ? s.p.x : e.p.x, sv ? e.p.y : s.p.y);
  return onSeg(x, s) && onSeg(x, e) && !samePt(x, s.p) && !samePt(x, s.q);
}

const segLength = (s: Seg): number => Math.abs(s.q.x - s.p.x) + Math.abs(s.q.y - s.p.y);

/**
 * Spec decision 2's cut for one hole: among the storey's raw Ring walls, those with one end on the hole's loop, the
 * other on an outer loop, and nothing of any loop on the open wall between, so the island's interior lies on both
 * sides along its whole length. The shortest wins, then the lowest x, then the lowest y (each read at the wall's lower
 * end), then the lowest Ring index. Undefined when none qualifies.
 */
export function selectCut(rings: StoreyRing[], outers: Pt[][], hole: Pt[]): CourtyardCut | undefined {
  const holeSegs = loopSegs(hole);
  const outerSegs = outers.map(loopSegs);
  const all = [holeSegs, ...outerSegs].flat();
  const found: CourtyardCut[] = [];
  for (const {index, ring} of rings) {
    const lines = ringSideLines(ring.rect);
    for (const side of RING_SIDES) {
      const l = lines[side];
      const s: Seg = l.axis === 'x' ? {p: pt(l.at, l.lo), q: pt(l.at, l.hi)} : {p: pt(l.lo, l.at), q: pt(l.hi, l.at)};
      if (all.some(e => touchesOpen(s, e))) continue;
      for (const [b, a] of [[s.p, s.q], [s.q, s.p]]) {
        if (!holeSegs.some(e => onSeg(b, e))) continue;
        const outer = outerSegs.findIndex(segs => segs.some(e => onSeg(a, e)));
        if (outer >= 0) found.push({a, b, ring: index, side, outer});
      }
    }
  }
  const key = (c: CourtyardCut): number[] => [segLength({p: c.a, q: c.b}), Math.min(c.a.x, c.b.x), Math.min(c.a.y, c.b.y), c.ring];
  found.sort((c, d) => {
    const kc = key(c), kd = key(d);
    for (let i = 0; i < kc.length; i++) if (kc[i] !== kd[i]) return kc[i] - kd[i];
    return 0;
  });
  return found[0];
}

/** `loop` from the vertex after `at` round to the vertex before it. `at` must be one of its vertices. */
function from(loop: Pt[], at: Pt, what: string): Pt[] {
  const k = loop.findIndex(p => samePt(p, at));
  if (k < 0) throw new Error(`the cut's end (${at.x}, ${at.y}) is no vertex of the ${what} loop`);
  return [...loop.slice(k + 1), ...loop.slice(0, k)];
}

/**
 * Roof-gable's `buildCourtyard` with a slit width of 0, on any outer loop and hole: the outer loop and the hole's loop
 * spliced at the cut's two ends, as `[A, outer..., A, B, hole..., B]`. Returns the ring and the indices of its two cut
 * walls, `A -> B` and `B -> A`.
 */
export function spliceCourtyard(outer: Pt[], hole: Pt[], cut: CourtyardCut): {ring: Pt[]; cutWalls: [number, number]} {
  const outerSeq = from(outer, cut.a, 'outer');
  const holeSeq = from(hole, cut.b, 'hole');
  const ring = [cut.a, ...outerSeq, cut.a, cut.b, ...holeSeq, cut.b];
  return {ring, cutWalls: [outerSeq.length + 1, ring.length - 1]};
}
