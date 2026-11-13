// Spec decision 3 as amended (journal decision 116, then gable rise decisions 3 to 7): roof forms are authored per Ring
// side, and per run of a side (gable rise decision 1), and derived onto the storey's union walls before step 1's roof
// solve. At each point of a union wall the lowest-index Ring whose side lies there wins, and its run there gives the
// form: the wall's extents. A wall whose every extent is a gable is a whole-wall gable; any other wall is a hip at the
// pitch of its lowest-index hip extent, and its gable extents are rises. The result is roof-gable `Sel`s, so roof-gable
// is unchanged. No Ring identity passes this point: the roof, the parts and the union see only the walls' forms.
import {RING_SIDES, RiseLimit, RingForm, RingSide, SideForm, SideRun, StoreyRing} from './fixture.ts';
import {PlanRefusal} from './errors.ts';
import {Pt, Rect, Sel, unionLoops} from './roof/model.ts';

/** A wall's inward normal, as roof-gable's `Sel.n` names it. */
export type InwardNormal = NonNullable<Sel['n']>;

/** Which world coordinate a straight wall line holds fixed: `x` for a vertical line, `y` for a horizontal one. */
export type LineAxis = 'x' | 'y';

/** A straight axis-aligned stretch: the line `axis = at`, its inward normal, and its span `[lo, hi]` along the line. */
export interface WallLine { axis: LineAxis; at: number; n: InwardNormal; lo: number; hi: number }

/**
 * Gable rise decision 6: one rise of a union wall, a stretch `[lo, hi]` along the wall's line of adjacent gable extents
 * that agree in pitch and limits, with its rake pitch, its own `maxHeight` when authored (decision 12) and its limit
 * policy (decision 11).
 */
export interface GableRise { lo: number; hi: number; deg: number; maxHeight?: number; limit: RiseLimit }

/** The limit a gable run takes when it names none (gable rise decision 11, journal decision 204). */
export const DEFAULT_RISE_LIMIT: RiseLimit = 'ridgeSlope';

/**
 * A union wall (a maximal straight run of one storey loop) with the form and pitch it enters the roof solve with, and
 * its rises (gable rise decisions 4 to 6): `form` is `hip` and `deg` its hip pitch wherever `rises` is non-empty.
 */
export interface UnionWall extends WallLine { form: RingForm; deg: number; rises?: GableRise[] }

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
  if (start < 0) throw new PlanRefusal('a loop with every edge on one line');
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

/**
 * A side form outside `RingForm` is a hard error: only the courtyard rule places a cut (spec decision 2). It reads the
 * form as any string, as an authored file may hold (journal decision 145, N1), and asserts a `SideForm`.
 */
function checkedSide(index: number, side: RingSide, s: {form: string}): asserts s is SideForm {
  if (s.form !== 'hip' && s.form !== 'gable') {
    throw new Error(`Ring ${index} side ${side} is authored ${s.form}; a Ring side is hip or gable, and only the courtyard rule places a cut`);
  }
}

/** A run's form is checked as a side's is. */
function checkedRun(index: number, side: RingSide, k: number, r: {form: string}): asserts r is SideRun {
  if (r.form !== 'hip' && r.form !== 'gable') {
    throw new Error(`Ring ${index} side ${side} run ${k} is authored ${r.form}; a run is hip or gable, and only the courtyard rule places a cut`);
  }
}

/**
 * Gable rise decision 1: where a side's run `[from, to]` lies on its line, as a world stretch `[lo, hi]`. Every side runs
 * counter-clockwise: S from x0, E from y0, N from x1, W from y1.
 */
export function runSpan(rect: Rect, side: RingSide, run: Pick<SideRun, 'from' | 'to'>): [number, number] {
  const [x0, y0, x1, y1] = rect;
  const at = (s: number): number => (side === 'S' ? x0 + s : side === 'E' ? y0 + s : side === 'N' ? x1 - s : y1 - s);
  const a = at(run.from), b = at(run.to);
  return [Math.min(a, b), Math.max(a, b)];
}

/**
 * What one Ring side says at a point of its line: the winning Ring's index, and the run holding the point, else the
 * side's own form and pitch.
 */
export interface Claim { ring: number; form: RingForm; deg: number; maxHeight?: number; limit: RiseLimit }

function claimAt(index: number, rect: Rect, defaultDeg: number, side: RingSide, s: SideForm | undefined, m: number): Claim {
  const deg = s?.deg ?? defaultDeg;
  for (const run of s?.runs ?? []) {
    const [lo, hi] = runSpan(rect, side, run);
    if (m > lo && m < hi) return {ring: index, form: run.form, deg: run.deg ?? deg, maxHeight: run.maxHeight, limit: run.limit ?? DEFAULT_RISE_LIMIT};
  }
  return {ring: index, form: s?.form ?? 'hip', deg, limit: DEFAULT_RISE_LIMIT};
}

/** One extent of a union wall (gable rise decision 3): a stretch won by one Ring side's run, adjacent agreeing ones merged. */
export interface WallExtent extends Claim { lo: number; hi: number }
type Extent = WallExtent;

/** A union wall's line and its extents, in order along it. */
export interface WallExtents { line: WallLine; extents: WallExtent[] }

/** Gable rise decision 3: every union wall of `loops` with its extents. Ring sides and runs are not checked here. */
export const unionWallExtents = (rings: StoreyRing[], loops: Pt[][]): WallExtents[] =>
  loops.flatMap(loop => loopRuns(loop)).map(line => ({line, extents: extentsOf(rings, line)}));

/**
 * Gable rise decision 3: a union wall's extents. The wall is cut at every Ring side end and run end on its line; on each
 * piece the lowest-index Ring whose side lies there wins, and its run there gives the form. Adjacent pieces with the
 * same form, pitch and limits merge (decision 6, across Rings too).
 */
function extentsOf(rings: StoreyRing[], run: WallLine): Extent[] {
  const cuts = new Set<number>([run.lo, run.hi]);
  for (const {ring} of rings) {
    const lines = ringSideLines(ring.rect);
    for (const side of RING_SIDES) {
      if (!sameLine(lines[side], run)) continue;
      for (const s of [lines[side].lo, lines[side].hi, ...(ring.sides?.[side]?.runs ?? []).flatMap(r => runSpan(ring.rect, side, r))]) {
        if (s > run.lo && s < run.hi) cuts.add(s);
      }
    }
  }
  const stops = [...cuts].sort((a, b) => a - b);
  const out: Extent[] = [];
  for (let k = 0; k + 1 < stops.length; k++) {
    const m = (stops[k] + stops[k + 1]) / 2;
    let claim: Claim | undefined;
    for (const {index, ring} of rings) {
      const lines = ringSideLines(ring.rect);
      const side = RING_SIDES.find(sd => sameLine(lines[sd], run) && lines[sd].lo < m && m < lines[sd].hi);
      if (side) { claim = claimAt(index, ring.rect, ring.defaultDeg, side, ring.sides?.[side], m); break; }
    }
    if (!claim) throw new PlanRefusal(`the union wall ${run.axis}=${run.at} [${run.lo},${run.hi}] lies on no Ring side at ${m}`);
    const last = out[out.length - 1];
    const agrees = last && last.form === claim.form && last.deg === claim.deg && last.maxHeight === claim.maxHeight && last.limit === claim.limit;
    // Hip extents of one pitch merge only within one Ring, so decision 4 still reads each Ring's index.
    if (agrees && (claim.form === 'gable' || last.ring === claim.ring)) last.hi = stops[k + 1];
    else out.push({...claim, lo: stops[k], hi: stops[k + 1]});
  }
  return out;
}

/** The lowest-index extent of `xs` (the first along the wall among equals). */
const lowestIndex = (xs: readonly Extent[]): Extent => xs.reduce((a, b) => (b.ring < a.ring ? b : a));

/**
 * Spec decision 3 as amended by gable rise decisions 3 to 7: each union wall's form and pitch, and its rises.
 * - A wall whose every extent is a gable is a whole-wall gable at its lowest-index extent's pitch (decision 5).
 * - Any other wall is a hip at its lowest-index hip extent's pitch (decision 4), and each of its gable extents, merged
 *   with its agreeing neighbours, is a rise (decision 6).
 * A wall that one Ring side wins whole, or whose winners all agree in form, takes exactly the form and pitch spec 3's
 * whole-wall rule gave it. A Ring side lying inside the union lies on no union wall, so its form and runs are dropped.
 * Every authored side and run of `rings` is checked, a buried one included.
 */
export function unionWallForms(rings: StoreyRing[], loops: Pt[][]): UnionWall[] {
  for (const {index, ring} of rings) {
    for (const side of RING_SIDES) {
      const s = ring.sides?.[side];
      if (!s) continue;
      checkedSide(index, side, s);
      (s.runs ?? []).forEach((r, k) => checkedRun(index, side, k, r));
    }
  }
  return unionWallExtents(rings, loops).map(({line: run, extents}): UnionWall => {
    const hips = extents.filter(e => e.form === 'hip');
    if (!hips.length) return {...run, form: 'gable', deg: lowestIndex(extents).deg};
    const rises = extents.filter(e => e.form === 'gable').map((e): GableRise => (e.maxHeight === undefined
      ? {lo: e.lo, hi: e.hi, deg: e.deg, limit: e.limit}
      : {lo: e.lo, hi: e.hi, deg: e.deg, maxHeight: e.maxHeight, limit: e.limit}));
    return rises.length ? {...run, form: 'hip', deg: lowestIndex(hips).deg, rises} : {...run, form: 'hip', deg: lowestIndex(hips).deg};
  });
}

/** The message prefix of roof-gable's `unionLoops` corner-only pinch, whose copied file throws a plain `Error`. */
const PINCH_PREFIX = 'pinch at ';

/**
 * Spec decision 2: a storey's union loops, traced by roof-gable's `unionLoops`, with its corner-only pinch refused as a
 * `PlanRefusal` (journal decision 146). The copied roof-gable file stays unchanged, so its message is matched here, at
 * the one place the pipeline calls it.
 */
export function storeyLoops(rects: Rect[]): Pt[][] {
  try {
    return unionLoops(rects);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith(PINCH_PREFIX)) throw new PlanRefusal(e.message, {cause: e});
    throw e;
  }
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
