// Spec decision 3 as amended (journal decision 116): roof forms are authored per Ring side and derived onto the storey's
// union walls before step 1's roof solve. Among the Rings whose side lies on a union wall and overlaps it, the lowest
// index wins, and the whole wall takes that side's form and pitch. The result is roof-gable `Sel`s, so roof-gable is
// unchanged. No Ring identity passes this point: the roof, the parts and the union see only the walls' forms.
import {RingForm, RingSide, SideForm, StoreyRing} from './fixture.ts';
import {Pt, Rect, Sel} from './roof/model.ts';

/** A wall's inward normal, as roof-gable's `Sel.n` names it. */
export type InwardNormal = NonNullable<Sel['n']>;

/** Which world coordinate a straight wall line holds fixed: `x` for a vertical line, `y` for a horizontal one. */
export type LineAxis = 'x' | 'y';

/** A straight axis-aligned stretch: the line `axis = at`, its inward normal, and its span `[lo, hi]` along the line. */
export interface WallLine { axis: LineAxis; at: number; n: InwardNormal; lo: number; hi: number }

/** A union wall (a maximal straight run of one storey loop) with the form and pitch it takes. */
export interface UnionWall extends WallLine { form: RingForm; deg: number }

/** The four sides of a Ring rectangle, each with its inward normal. */
export function ringSideLines(r: Rect): Record<RingSide, WallLine> {
  const [x0, y0, x1, y1] = r;
  return {
    S: {axis: 'y', at: y0, n: '+y', lo: x0, hi: x1},
    E: {axis: 'x', at: x1, n: '-x', lo: y0, hi: y1},
    N: {axis: 'y', at: y1, n: '-y', lo: x0, hi: x1},
    W: {axis: 'x', at: x0, n: '+x', lo: y0, hi: y1},
  };
}

export const RING_SIDES: readonly RingSide[] = ['S', 'E', 'N', 'W'];

/** The line one loop edge `a` to `b` stands on; the footprint lies to its left, as `unionLoops` traces it. */
export function edgeLine(a: Pt, b: Pt): WallLine {
  if (a.x === b.x) return {axis: 'x', at: a.x, n: b.y > a.y ? '-x' : '+x', lo: Math.min(a.y, b.y), hi: Math.max(a.y, b.y)};
  return {axis: 'y', at: a.y, n: b.x > a.x ? '+y' : '-y', lo: Math.min(a.x, b.x), hi: Math.max(a.x, b.x)};
}

const sameLine = (p: WallLine, q: WallLine): boolean => p.axis === q.axis && p.at === q.at && p.n === q.n;

/** Spec decision 3: a union wall is a maximal straight run of a loop, however many Ring corners break it. */
export function loopRuns(loop: Pt[]): WallLine[] {
  const lines = loop.map((a, i) => edgeLine(a, loop[(i + 1) % loop.length]));
  const start = lines.findIndex((l, i) => !sameLine(l, lines[(i - 1 + lines.length) % lines.length]));
  if (start < 0) throw new Error('a loop with every edge on one line');
  const runs: WallLine[] = [];
  for (let k = 0; k < lines.length; k++) {
    const l = lines[(start + k) % lines.length];
    const last = runs[runs.length - 1];
    if (last && sameLine(last, l)) {
      last.lo = Math.min(last.lo, l.lo);
      last.hi = Math.max(last.hi, l.hi);
    } else {
      runs.push({...l});
    }
  }
  return runs;
}

/** A side form outside `RingForm` is a hard error: only the courtyard rule places a cut (spec decision 2). */
function checkedSide(index: number, side: RingSide, s: SideForm): SideForm {
  const form: string = s.form;
  if (form !== 'hip' && form !== 'gable') {
    throw new Error(`Ring ${index} side ${side} is authored ${form}; a Ring side is hip or gable, and only the courtyard rule places a cut`);
  }
  return s;
}

/**
 * Spec decision 3: each union wall's form and pitch, from the lowest-index Ring whose side lies on it and overlaps it.
 * A Ring side lying inside the union lies on no union wall, so its form is dropped. Every authored side of `rings` is
 * checked, a buried one included.
 */
export function unionWallForms(rings: StoreyRing[], loops: Pt[][]): UnionWall[] {
  for (const {index, ring} of rings) for (const side of RING_SIDES) { const s = ring.sides?.[side]; if (s) checkedSide(index, side, s); }
  return loops.flatMap(loop => loopRuns(loop)).map(run => {
    for (const {index, ring} of rings) {
      const lines = ringSideLines(ring.rect);
      for (const side of RING_SIDES) {
        const l = lines[side];
        if (!sameLine(l, run) || Math.min(l.hi, run.hi) - Math.max(l.lo, run.lo) <= 0) continue;
        const s = ring.sides?.[side];
        return {...run, form: s?.form ?? 'hip', deg: s?.deg ?? ring.defaultDeg};
      }
    }
    throw new Error(`the union wall ${run.axis}=${run.at} [${run.lo},${run.hi}] lies on no Ring side`);
  });
}

/** Spec decision 3: one roof-gable `Sel` over each union wall's span, carrying its form and pitch. */
export function wallSel(w: UnionWall): Sel {
  const line: Sel = w.axis === 'x' ? {x: w.at} : {y: w.at};
  return {...line, from: w.lo, to: w.hi, n: w.n, form: w.form, deg: w.deg};
}

/**
 * Whether `sel` picks the traced wall `a` to `b`, by roof-gable's own reading of a selector (its line, its span
 * overlap and its inward normal); for a ring `buildFromRects` cannot take, a courtyard's.
 */
export function selPicks(sel: Sel, a: Pt, b: Pt): boolean {
  const l = edgeLine(a, b);
  if (sel.x !== undefined && (l.axis !== 'x' || l.at !== sel.x)) return false;
  if (sel.y !== undefined && (l.axis !== 'y' || l.at !== sel.y)) return false;
  if (sel.from !== undefined && l.hi <= sel.from) return false;
  if (sel.to !== undefined && l.lo >= sel.to) return false;
  return sel.n === undefined || sel.n === l.n;
}

export const tanDeg = (deg: number): number => Math.tan((deg * Math.PI) / 180);
