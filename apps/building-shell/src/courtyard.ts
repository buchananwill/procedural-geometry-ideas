// Spec decision 2 as amended (journal decisions 115, 132, 135 and 278): a storey plan with a hole is roofed through a cut
// along a segment of one raw Ring wall, spliced into a slit polygon of width 0 exactly as roof-gable's `buildCourtyard` does. Every test here is
// segment arithmetic on the plan's own loops: no point is tested for lying inside anything.
import {RING_SIDES, RingSide, StoreyRing} from './fixture.ts';
import {UnionWall, ringSideLines, unionWallForms} from './ring-forms.ts';
import {Pt, pt} from './roof/model.ts';

/**
 * The chosen cut: `a` on the island's outer loop, `b` on the hole's loop, the Ring wall it runs along, the index of
 * the outer loop it reaches, and the pitch its two cut walls take (spec decision 2 as amended, journal decision 135).
 */
export interface CourtyardCut { a: Pt; b: Pt; ring: number; side: RingSide; outer: number; deg: number }

/** An axis-aligned segment's ends. */
export interface Seg { p: Pt; q: Pt }

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

/** Every point of segment `s` that some loop segment touches, in order along `s` and each once. */
function breakpoints(s: Seg, segs: readonly Seg[]): Pt[] {
  const sv = s.p.x === s.q.x;
  const found: Pt[] = [];
  for (const e of segs) {
    const ev = e.p.x === e.q.x;
    if (sv === ev) {
      if (sv ? e.p.x !== s.p.x : e.p.y !== s.p.y) continue;
      for (const x of [e.p, e.q, s.p, s.q]) if (onSeg(x, s) && onSeg(x, e)) found.push(x);
    } else {
      const x = pt(sv ? s.p.x : e.p.x, sv ? e.p.y : s.p.y);
      if (onSeg(x, s) && onSeg(x, e)) found.push(x);
    }
  }
  const along = (p: Pt): number => (sv ? p.y : p.x);
  return found.sort((m, n) => along(m) - along(n)).filter((x, k, xs) => k === 0 || !samePt(x, xs[k - 1]));
}

/**
 * The pitch a cut collinear with no union wall takes (spec decision 2 as amended, journal decisions 151 and 153): the
 * steepest derived pitch among all the walls of its island, hip and gable, the outer loop and the hole's loop it joins
 * (`islandWalls`). A cut shallower than the island's steepest walls breaks the roof beside it (decision 150's split
 * bands, 96 of 1057). A gable's pitch is geometry in algorithm B, and the wire carries it (decision 153), so it counts.
 */
export function freeCutPitch(islandWalls: readonly UnionWall[]): number {
  if (!islandWalls.length) throw new Error('a free cut on an island with no wall');
  return Math.max(...islandWalls.map(w => w.deg));
}

/**
 * The pitch the cut from `a` to `b` takes (spec decision 2 as amended, journal decisions 135, 143 and 151): the derived
 * pitch of the union wall it is collinear with at an end, or `freeCutPitch` of its island where it is collinear with
 * none. Undefined where it is collinear with walls of different pitch at its two ends, so the segment does not qualify:
 * the skeleton refuses a weight change at a straight vertex.
 */
function cutPitch(a: Pt, b: Pt, walls: readonly UnionWall[], islandWalls: () => readonly UnionWall[]): number | undefined {
  const vertical = a.x === b.x;
  const at = vertical ? a.x : a.y;
  const degs = new Set<number>();
  for (const end of [a, b]) {
    const along = vertical ? end.y : end.x;
    for (const w of walls) if (w.axis === (vertical ? 'x' : 'y') && w.at === at && (w.lo === along || w.hi === along)) degs.add(w.deg);
  }
  if (degs.size > 1) return undefined;
  return degs.size ? [...degs][0] : freeCutPitch(islandWalls());
}

/**
 * Whether the cut from `b` on the hole's loop to `a` on the outer loop leaves the building on both sides of its line at
 * `a` (spec decision 2 as amended, journal decision 278): no loop segment on the cut's line runs on past `a`. Where one
 * does, `a` is a corner of the outline with a wall carrying on in line with the cut, the footprint continues past `a` on
 * one side of the line, and algorithm B reads that cut side's extent, and its end planes, from beyond the cut (journal
 * finding 89). Only the outer end is read: at the hole end the courtyard's own wall always carries on along the slit.
 */
function leavesBothSides(a: Pt, b: Pt, segs: readonly Seg[]): boolean {
  const vertical = a.x === b.x;
  const along = (p: Pt): number => (vertical ? p.y : p.x);
  const outward = Math.sign(along(a) - along(b));
  const onLine = (e: Seg): boolean => (e.p.x === e.q.x) === vertical && (vertical ? e.p.x === a.x : e.p.y === a.y);
  return !segs.some(e => onLine(e) && onSeg(a, e) && [e.p, e.q].some(p => (along(p) - along(a)) * outward > 0));
}

/**
 * Spec decision 2's cut for one hole (as amended by journal decisions 132 and 135): a segment of one of the storey's
 * raw Ring walls, within that wall's span, with one end on the hole's loop, the other on an outer loop, and nothing
 * of any loop on the open segment between, so the island's interior lies on both sides along its whole length. Its
 * ends are consecutive points where loops touch the wall, so either may be a loop vertex. The shortest wins, then the
 * lowest x, then the lowest y (each read at its lower end), then the lowest Ring index; a segment whose two ends are
 * collinear with walls of different pitch (`walls`, the storey's derived union walls) does not qualify, nor does one
 * whose outer end does not leave the building on both sides of its line (`leavesBothSides`, journal decision 278), and
 * the next is tried. Its pitch is `cutPitch`'s. Undefined when none qualifies.
 */
export function selectCut(rings: StoreyRing[], outers: Pt[][], hole: Pt[], walls: readonly UnionWall[]): CourtyardCut | undefined {
  const holeSegs = loopSegs(hole);
  const outerSegs = outers.map(loopSegs);
  const all = [holeSegs, ...outerSegs].flat();
  // Each island's union walls (its outer loop and this hole's), derived once, on the first free cut that reads them.
  const islands = new Map<number, readonly UnionWall[]>();
  const islandWalls = (outer: number) => (): readonly UnionWall[] => {
    let w = islands.get(outer);
    if (!w) { w = unionWallForms(rings, [outers[outer], hole]); islands.set(outer, w); }
    return w;
  };
  const found: CourtyardCut[] = [];
  for (const {index, ring} of rings) {
    const lines = ringSideLines(ring.rect);
    for (const side of RING_SIDES) {
      const l = lines[side];
      const wall: Seg = l.axis === 'x' ? {p: pt(l.at, l.lo), q: pt(l.at, l.hi)} : {p: pt(l.lo, l.at), q: pt(l.hi, l.at)};
      const stops = breakpoints(wall, all);
      for (let k = 0; k + 1 < stops.length; k++) {
        const s: Seg = {p: stops[k], q: stops[k + 1]};
        if (all.some(e => touchesOpen(s, e))) continue;
        for (const [b, a] of [[s.p, s.q], [s.q, s.p]]) {
          if (!holeSegs.some(e => onSeg(b, e))) continue;
          const outer = outerSegs.findIndex(segs => segs.some(e => onSeg(a, e)));
          if (outer < 0 || !leavesBothSides(a, b, all)) continue;
          const deg = cutPitch(a, b, walls, islandWalls(outer));
          if (deg !== undefined) found.push({a, b, ring: index, side, outer, deg});
        }
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

/** A courtyard's slit ring, and the indices of its two cut walls in it. */
export interface SplicedCourtyard { ring: Pt[]; cutWalls: [number, number] }

/**
 * Roof-gable's `buildCourtyard` with a slit width of 0, on any outer loop and hole: the outer loop and the hole's loop
 * spliced at the cut's two ends, as `[A, outer..., A, B, hole..., B]`. Returns the ring and the indices of its two cut
 * walls, `A -> B` and `B -> A`.
 */
export function spliceCourtyard(outer: Pt[], hole: Pt[], cut: CourtyardCut): SplicedCourtyard {
  const outerSeq = from(outer, cut.a, 'outer');
  const holeSeq = from(hole, cut.b, 'hole');
  const ring = [cut.a, ...outerSeq, cut.a, cut.b, ...holeSeq, cut.b];
  return {ring, cutWalls: [outerSeq.length + 1, ring.length - 1]};
}
