// Spec decision 3 as amended (journal decision 116, then gable rise decisions 3 to 7): roof forms are authored per Ring
// side, and per run of a side (gable rise decision 1), and derived onto the storey's union walls before step 1's roof
// solve. At each point of a union wall the lowest-index Ring whose side lies there wins, and its run there gives the
// form: the wall's extents. A wall whose every extent is a gable is a whole-wall gable; any other wall is a hip at the
// pitch of its lowest-index hip extent, and its gable extents are rises. The result is roof-gable `Sel`s, so roof-gable
// is unchanged. No Ring identity passes this point: the roof, the parts and the union see only the walls' forms.
import {RING_SIDES, RISE_LIMITS, RiseLimit, RingForm, RingSide, SideForm, SideRun, StoreyRing} from './fixture.ts';
import {PlanRefusal} from './errors.ts';
import {Pt, Rect, Sel, unionLoops} from './roof/model.ts';

/** A wall's inward normal, as roof-gable's `Sel.n` names it. */
export type InwardNormal = NonNullable<Sel['n']>;

/** Which world coordinate a straight wall line holds fixed: `x` for a vertical line, `y` for a horizontal one. */
export type LineAxis = 'x' | 'y';

/** A straight axis-aligned stretch: the line `axis = at`, its inward normal, and its span `[lo, hi]` along the line. */
export interface WallLine { axis: LineAxis; at: number; n: InwardNormal; lo: number; hi: number }

/**
 * What one Ring side says at a point of its line: the winning Ring's index, and the run holding the point (else the
 * side's own form and pitch), as `SideRun` names them, its pitch and limit resolved.
 */
export type Claim = {ring: number} & Required<Pick<SideRun, 'form' | 'deg' | 'limit'>> & Pick<SideRun, 'maxHeight'>;

/**
 * One extent of a union wall (gable rise decision 3): a stretch `[lo, hi]` won by one Ring side's run, adjacent agreeing
 * ones merged. `ring` is the lowest index among the merged pieces (journal decision 209, H1), and `sideFrom` where that
 * Ring's piece starts along its own side, in cm from the side's start, the tie-break within one Ring (decision 5 as
 * amended, M2).
 */
export type WallExtent = Claim & {lo: number; hi: number; sideFrom: number};

/**
 * Gable rise decision 6: one rise of a union wall, a stretch `[lo, hi]` along the wall's line of adjacent gable extents
 * that agree in pitch and limits, with its rake pitch, its own `maxHeight` when authored (decision 12) and its limit
 * policy (decision 11).
 */
export type GableRise = Pick<WallExtent, 'lo' | 'hi' | 'deg' | 'maxHeight' | 'limit'>;

/** The limit a gable run takes when it names none (gable rise decision 11, journal decision 204). */
export const DEFAULT_RISE_LIMIT: RiseLimit = RISE_LIMITS[0];

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

/** Which line a wall stands on and which way it faces: a `WallLine` without its span. */
export type LineId = Pick<WallLine, 'axis' | 'at' | 'n'>;

const sameLine = (p: LineId, q: LineId): boolean => p.axis === q.axis && p.at === q.at && p.n === q.n;

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
 * Gable rise decision 1 (journal decision 209, L2): a side's runs lie inside the side, are not empty, are in order and
 * do not overlap. Any other is a `PlanRefusal` naming the Ring, side and run, so `writeInput` never writes runs
 * `readInput` refuses for their geometry.
 */
function checkedRunSpans(index: number, rect: Rect, side: RingSide, runs: readonly SideRun[]): void {
  const l = ringSideLines(rect)[side], length = l.hi - l.lo;
  runs.forEach((r, k) => {
    const at = `Ring ${index} side ${side} run ${k} spans ${r.from} to ${r.to} cm`;
    if (!(r.from < r.to)) throw new PlanRefusal(`${at}: a run is not empty, its from below its to (gable rise decision 1)`);
    if (r.from < 0 || r.to > length) throw new PlanRefusal(`${at}: a run lies inside its side, 0 to ${length} cm (gable rise decision 1)`);
    const prev = runs[k - 1];
    if (prev && r.from < prev.from) throw new PlanRefusal(`${at}: runs are listed in order along their side, and run ${k - 1} starts at ${prev.from} cm (gable rise decision 1)`);
    if (prev && r.from < prev.to) throw new PlanRefusal(`${at}: runs do not overlap, and run ${k - 1} ends at ${prev.to} cm (gable rise decision 1)`);
  });
}

/**
 * Gable rise decision 15 (journal decision 211): the hip stretches of one Ring side agree in pitch, in memory as on the
 * wire. They are its hip runs, each at its own pitch or the side's, and, where the side is a hip, every stretch no run
 * covers, at the side's pitch: what `writeInput` writes as the side's Pitched runs. Two pitches are a `PlanRefusal`.
 * Runs are known to lie in order inside the side (`checkedRunSpans`).
 */
function checkedHipPitches(index: number, rect: Rect, side: RingSide, s: SideForm, defaultDeg: number): void {
  const runs = s.runs ?? [];
  const deg = s.deg ?? defaultDeg;
  const l = ringSideLines(rect)[side], length = l.hi - l.lo;
  const uncovered = runs.length === 0 || runs[0].from > 0 || runs.some((r, k) => k > 0 && r.from > runs[k - 1].to) || runs[runs.length - 1].to < length;
  const pitches = [...(s.form === 'hip' && uncovered ? [deg] : []), ...runs.filter(r => r.form === 'hip').map(r => r.deg ?? deg)];
  const other = pitches.find(p => p !== pitches[0]);
  if (other !== undefined) {
    throw new PlanRefusal(`Ring ${index} side ${side}'s hip stretches disagree in pitch (${pitches[0]} and ${other}): the hip runs of one side agree in pitch, since a union wall has one hip pitch (gable rise decision 15)`);
  }
}

/** Where a world coordinate `s` of a side's line lies along the side, in cm from its start (`runSpan`'s inverse). */
const sideOffset = (rect: Rect, side: RingSide, s: number): number => {
  const [x0, y0, x1, y1] = rect;
  return side === 'S' ? s - x0 : side === 'E' ? s - y0 : side === 'N' ? x1 - s : y1 - s;
};

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

function claimAt(index: number, rect: Rect, defaultDeg: number, side: RingSide, s: SideForm | undefined, m: number): Claim {
  const deg = s?.deg ?? defaultDeg;
  for (const run of s?.runs ?? []) {
    const [lo, hi] = runSpan(rect, side, run);
    if (m > lo && m < hi) return {ring: index, form: run.form, deg: run.deg ?? deg, maxHeight: run.maxHeight, limit: run.limit ?? DEFAULT_RISE_LIMIT};
  }
  return {ring: index, form: s?.form ?? 'hip', deg, limit: DEFAULT_RISE_LIMIT};
}

/** A union wall's line and its extents, in order along it. */
export interface WallExtents { line: WallLine; extents: WallExtent[] }

/** Gable rise decision 3: every union wall of `loops` with its extents. Ring sides and runs are not checked here. */
export const unionWallExtents = (rings: StoreyRing[], loops: Pt[][]): WallExtents[] =>
  loops.flatMap(loop => loopRuns(loop)).map(line => ({line, extents: extentsOf(rings, line)}));

/**
 * Gable rise decision 3: a union wall's extents. The wall is cut at every Ring side end and run end on its line; on each
 * piece the lowest-index Ring whose side lies there wins, and its run there gives the form. Adjacent pieces with the
 * same form, pitch and limits merge (decision 6, across Rings too), keeping the lowest index among them (journal
 * decision 209, H1) and, within that Ring, where its first piece along its own side starts (M2).
 */
function extentsOf(rings: StoreyRing[], run: WallLine): WallExtent[] {
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
  const out: WallExtent[] = [];
  for (let k = 0; k + 1 < stops.length; k++) {
    const m = (stops[k] + stops[k + 1]) / 2;
    let piece: WallExtent | undefined;
    for (const {index, ring} of rings) {
      const lines = ringSideLines(ring.rect);
      const side = RING_SIDES.find(sd => sameLine(lines[sd], run) && lines[sd].lo < m && m < lines[sd].hi);
      if (!side) continue;
      const claim = claimAt(index, ring.rect, ring.defaultDeg, side, ring.sides?.[side], m);
      const sideFrom = Math.min(sideOffset(ring.rect, side, stops[k]), sideOffset(ring.rect, side, stops[k + 1]));
      piece = {...claim, lo: stops[k], hi: stops[k + 1], sideFrom};
      break;
    }
    if (!piece) throw new PlanRefusal(`the union wall ${run.axis}=${run.at} [${run.lo},${run.hi}] lies on no Ring side at ${m}`);
    const last = out[out.length - 1];
    const agrees = last && last.form === piece.form && last.deg === piece.deg && last.maxHeight === piece.maxHeight && last.limit === piece.limit;
    // Hip extents of one pitch merge only within one Ring, so decision 4 still reads each Ring's index.
    if (agrees && (piece.form === 'gable' || last.ring === piece.ring)) {
      last.hi = piece.hi;
      // Journal decision 209, H1 and M2: the merge keeps the lowest index, and that Ring's first piece along its side.
      if (piece.ring < last.ring || (piece.ring === last.ring && piece.sideFrom < last.sideFrom)) { last.ring = piece.ring; last.sideFrom = piece.sideFrom; }
    } else {
      out.push(piece);
    }
  }
  return out;
}

/**
 * Gable rise decision 5 as amended (journal decisions 219 and 220): a gable belongs to the Ring side that asked for it.
 * A **claimed band** is a maximal stretch of `line` that Ring sides claim as gable, at each point by the lowest-index
 * Ring whose side lies there, buried stretches included; adjacent claims that differ in pitch, limit or `maxHeight` are
 * separate bands (decision 6). The bands of the line, in order along it, each in a rise's shape. Whether a band counts
 * (part of it on a union wall) is the caller's: `claimedWalls` takes only the bands overlapping a wall. Ported from the
 * WP-G4.1 probe (`experiments/gable-rises/claimed-band.ts`, `claimedBands`).
 */
export function claimedBands(rings: StoreyRing[], line: LineId): GableRise[] {
  const stops = new Set<number>();
  for (const {ring} of rings) {
    const lines = ringSideLines(ring.rect);
    for (const side of RING_SIDES) {
      if (!sameLine(lines[side], line)) continue;
      for (const s of [lines[side].lo, lines[side].hi, ...(ring.sides?.[side]?.runs ?? []).flatMap(r => runSpan(ring.rect, side, r))]) stops.add(s);
    }
  }
  const st = [...stops].sort((a, b) => a - b);
  const out: GableRise[] = [];
  let cur: GableRise | undefined;
  for (let k = 0; k + 1 < st.length; k++) {
    const m = (st[k] + st[k + 1]) / 2;
    let claim: Claim | undefined;
    for (const {index, ring} of rings) {
      const lines = ringSideLines(ring.rect);
      const side = RING_SIDES.find(sd => sameLine(lines[sd], line) && lines[sd].lo < m && m < lines[sd].hi);
      if (side) { claim = claimAt(index, ring.rect, ring.defaultDeg, side, ring.sides?.[side], m); break; }
    }
    if (!claim || claim.form !== 'gable') { cur = undefined; continue; }
    if (cur && cur.deg === claim.deg && cur.limit === claim.limit && cur.maxHeight === claim.maxHeight) { cur.hi = st[k + 1]; continue; }
    cur = claim.maxHeight === undefined
      ? {lo: st[k], hi: st[k + 1], deg: claim.deg, limit: claim.limit}
      : {lo: st[k], hi: st[k + 1], deg: claim.deg, maxHeight: claim.maxHeight, limit: claim.limit};
    out.push(cur);
  }
  return out;
}

/**
 * The lowest-index extent of `xs`. Gable rise decision 5 as amended (journal decision 209, M2): among one Ring's extents
 * (one side of it, since a Ring has one side on a line), the first along that side's own direction from its start.
 */
const lowestIndex = (xs: readonly WallExtent[]): WallExtent =>
  xs.reduce((a, b) => (b.ring < a.ring || (b.ring === a.ring && b.sideFrom < a.sideFrom) ? b : a));

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
      checkedRunSpans(index, ring.rect, side, s.runs ?? []);
      checkedHipPitches(index, ring.rect, side, s, ring.defaultDeg);
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
