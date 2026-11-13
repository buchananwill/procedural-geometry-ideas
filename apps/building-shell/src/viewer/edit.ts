// Viewer editing decisions 1 to 5: the pure edit functions. Each takes a `ShellFixture` and returns a new one, and never
// mutates its argument (decision 2). No DOM, no scene, and no validity test: a draft is valid when the wire accepts it
// (decision 6, journal decision 193), which `draft.ts` asks; an edit is never blocked (decision 9).
import {RING_SIDES} from '../fixture.ts';
import type {FixtureRing, RingForm, RingSide, RingSides, ShellFixture, SideForm, SideRun} from '../fixture.ts';
import {ringSideLines} from '../ring-forms.ts';
import type {Rect} from '../roof/model.ts';

/** Decision 4: a new Ring is 500 x 500 cm, a hip at 45 degrees, one storey, at base storey 0. */
export const NEW_RING_SIZE_CM = 500;
export const NEW_RING_DEG = 45;

/** Decision 5: the step of a pitch field, in degrees. */
export const PITCH_STEP_DEG = 0.5;

/** A Ring's box in the world, for the viewport's highlight: its rect, from its lowest floor to its highest plate. */
export interface RingBox { rect: Rect; zLo: number; zHi: number }

/**
 * The listed sides, copied by spread so a field a side or a run gains later is copied with it, runs included (journal
 * decision 210). An absent `sides` is an empty one.
 */
const cloneSides = (sides: RingSides | undefined): RingSides => {
  const out: RingSides = {};
  for (const side of RING_SIDES) {
    const s = sides?.[side];
    if (s) out[side] = s.runs ? {...s, runs: s.runs.map(run => ({...run}))} : {...s};
  }
  return out;
};

/** A deep copy: no Ring, rect or side is shared with the original. Spread, so a field a Ring gains later is copied too. */
export const cloneRing = (r: FixtureRing): FixtureRing => ({...r, rect: [...r.rect], sides: cloneSides(r.sides)});

/** A deep copy of a fixture. */
export const cloneFixture = (f: ShellFixture): ShellFixture => ({...f, rings: f.rings.map(cloneRing)});

/**
 * Viewer editing decision 14 as amended (journal decision 198, M1): a listed side always carries its own pitch, because
 * the wire cannot tell a listed side that follows the default from one pinned at the default's value. A copy of `f` in
 * which every listed side without a pitch has the Ring's `defaultDeg`, which is what it already resolved to. The amendment
 * of journal decision 210 gives a run the same: a run without a pitch has its side's.
 */
export function pinListedPitches(f: ShellFixture): ShellFixture {
  const next = cloneFixture(f);
  for (const r of next.rings) {
    for (const side of RING_SIDES) {
      const s = r.sides?.[side];
      if (!s) continue;
      s.deg ??= r.defaultDeg;
      for (const run of s.runs ?? []) run.deg ??= s.deg;
    }
  }
  return next;
}

/** `v` rounded to the nearest multiple of `cell` (decision 5). The `+ 0` turns a negative zero into 0, so equal rects compare equal. */
export const snapToCell = (v: number, cell: number): number => Math.round(v / cell) * cell + 0;

function assertIndex(f: ShellFixture, index: number): void {
  if (!Number.isInteger(index) || index < 0 || index >= f.rings.length) {
    throw new RangeError(`Ring ${index} does not exist: the fixture has ${f.rings.length}`);
  }
}

/** A copy of `f` with Ring `index` replaced by `change` of a copy of it. */
function withRing(f: ShellFixture, index: number, change: (r: FixtureRing) => void): ShellFixture {
  assertIndex(f, index);
  const next = cloneFixture(f);
  change(next.rings[index]);
  return next;
}

/**
 * Decision 4: a new 500 x 500 cm hip Ring at 45 degrees, one storey, base storey 0, appended last (so it is the lowest
 * priority on a contested wall) and placed beside the east side of Ring `beside`, level with its south side. Without a
 * `beside` it stands beside the last Ring; in an empty fixture it stands at the origin. Interpretation: the proposal
 * says "the selected Ring", and names no fallback for no selection.
 */
export function addRing(f: ShellFixture, beside?: number): ShellFixture {
  if (beside !== undefined) assertIndex(f, beside);
  const next = cloneFixture(f);
  const anchor = beside === undefined ? next.rings.at(-1) : next.rings[beside];
  const x0 = anchor ? snapToCell(anchor.rect[2], f.cellSize) : 0;
  const y0 = anchor ? snapToCell(anchor.rect[1], f.cellSize) : 0;
  next.rings.push({
    rect: [x0, y0, x0 + NEW_RING_SIZE_CM, y0 + NEW_RING_SIZE_CM],
    baseStorey: 0,
    storeys: 1,
    defaultDeg: NEW_RING_DEG,
    sides: {},
  });
  return next;
}

/** Removes Ring `index`; the Rings after it move up one index. */
export function removeRing(f: ShellFixture, index: number): ShellFixture {
  assertIndex(f, index);
  const next = cloneFixture(f);
  next.rings.splice(index, 1);
  return next;
}

/** Inserts an exact copy of Ring `index` right after it. Interpretation: the proposal gives a duplicate no offset. */
export function duplicateRing(f: ShellFixture, index: number): ShellFixture {
  assertIndex(f, index);
  const next = cloneFixture(f);
  next.rings.splice(index + 1, 0, cloneRing(f.rings[index]));
  return next;
}

/** Sets Ring `index`'s rect, each coordinate snapped to the fixture's `cellSize` (decision 5). It does not reorder the corners. */
export function setRect(f: ShellFixture, index: number, rect: Readonly<Rect>): ShellFixture {
  return withRing(f, index, r => { r.rect = [snapToCell(rect[0], f.cellSize), snapToCell(rect[1], f.cellSize), snapToCell(rect[2], f.cellSize), snapToCell(rect[3], f.cellSize)]; });
}

/**
 * Sets one coordinate of Ring `index`'s rect (`coord` 0 to 3: x0, y0, x1, y1), snapped to the fixture's `cellSize`. The
 * other three stay as they are: a rect that is off the grid (a loaded file's) is not moved by an edit to its neighbour.
 */
export function setRectCoord(f: ShellFixture, index: number, coord: 0 | 1 | 2 | 3, value: number): ShellFixture {
  return withRing(f, index, r => {
    const rect: Rect = [...r.rect];
    rect[coord] = snapToCell(value, f.cellSize);
    r.rect = rect;
  });
}

export const setBaseStorey =(f: ShellFixture, index: number, baseStorey: number): ShellFixture =>
  withRing(f, index, r => { r.baseStorey = baseStorey; });

export const setStoreys = (f: ShellFixture, index: number, storeys: number): ShellFixture =>
  withRing(f, index, r => { r.storeys = storeys; });

/** The pitch of every side of Ring `index` that has none of its own. Not snapped: the 0.5 degree step belongs to the field (decision 5). */
export const setDefaultDeg = (f: ShellFixture, index: number, deg: number): ShellFixture =>
  withRing(f, index, r => { r.defaultDeg = deg; });

/**
 * Lists one side of Ring `index` with `form`, at the pitch it has now: its own, or the Ring's `defaultDeg` for a side
 * not yet listed. A listed side always carries its own pitch (decision 14 as amended, journal decision 198, M1).
 */
export function setSideForm(f: ShellFixture, index: number, side: RingSide, form: RingForm): ShellFixture {
  // Spread, so what the side has besides its form and pitch, its runs (journal decision 210), stays.
  return withRing(f, index, r => {
    const was = r.sides?.[side];
    r.sides = {...r.sides, [side]: {...was, form, deg: was?.deg ?? r.defaultDeg}};
  });
}

/** Lists one side of Ring `index` at its own pitch, keeping the form it already has (a hip when it had none) and its runs. */
export function setSidePitch(f: ShellFixture, index: number, side: RingSide, deg: number): ShellFixture {
  return withRing(f, index, r => {
    const was = r.sides?.[side];
    r.sides = {...r.sides, [side]: {...was, form: was?.form ?? 'hip', deg}};
  });
}

/** Clears one side of Ring `index` back to the default: a hip at the Ring's `defaultDeg`. Its runs go with it (journal decision 210). */
export function clearSide(f: ShellFixture, index: number, side: RingSide): ShellFixture {
  return withRing(f, index, r => {
    const sides = {...r.sides};
    delete sides[side];
    r.sides = sides;
  });
}

// ---- Runs (journal decision 210) ---------------------------------------------------------------------------------------------

/**
 * A side's length in cm, which its runs' ends are measured along. Every side runs counter-clockwise from its start (gable
 * rise decision 1; `runSpan` in `ring-forms.ts`): S from its west end (x0) toward the east, E from its south end (y0)
 * toward the north, N from its east end (x1) toward the west, W from its north end (y1) toward the south.
 */
export const sideLengthCm = (rect: Rect, side: RingSide): number => {
  const l = ringSideLines(rect)[side];
  return l.hi - l.lo;
};

/**
 * What a side's runs write to the wire, one entry per written run: the index of the fixture run it is, or null for a
 * stretch between runs (or before the first, or after the last), which `writeInput` fills with the side's own form. It
 * repeats `writeInput`'s layout, which is outside this package's roster; a test holds the two to the same count.
 */
export function writtenRunSources(runs: readonly Pick<SideRun, 'from' | 'to'>[], length: number): (number | null)[] {
  const out: (number | null)[] = [];
  let at = 0;
  runs.forEach((run, k) => {
    if (run.from > at) out.push(null);
    out.push(k);
    at = Math.max(at, run.to);
  });
  if (at < length) out.push(null);
  return out;
}

/** The largest stretch of a side no run covers that holds a whole cell, its ends snapped inward to the grid; undefined when none does. */
export function largestUncovered(runs: readonly Pick<SideRun, 'from' | 'to'>[], length: number, cell: number): [number, number] | undefined {
  const stretches: [number, number][] = [];
  let at = 0;
  for (const run of [...runs].sort((a, b) => a.from - b.from)) {
    if (run.from > at) stretches.push([at, run.from]);
    at = Math.max(at, run.to);
  }
  if (length > at) stretches.push([at, length]);
  let best: [number, number] | undefined;
  for (const [lo, hi] of stretches) {
    const from = Math.ceil(lo / cell) * cell + 0, to = Math.floor(hi / cell) * cell + 0;
    if (from < to && (!best || to - from > best[1] - best[0])) best = [from, to];
  }
  return best;
}

/**
 * The middle third of a stretch, its ends snapped inward to the grid, or the whole stretch where that leaves no whole cell.
 * A new run takes it so that the side's own form is left on both flanks: a gable run that covered the whole of a hip side
 * would be a whole-wall gable, which `input@1` reads back as the side's own form (journal decision 210).
 */
export function middleThird([from, to]: readonly [number, number], cell: number): [number, number] {
  const third = (to - from) / 3;
  const a = Math.ceil((from + third) / cell) * cell + 0, b = Math.floor((to - third) / cell) * cell + 0;
  return a < b ? [a, b] : [from, to];
}

function assertRun(f: ShellFixture, index: number, side: RingSide, run: number): void {
  assertIndex(f, index);
  const n = f.rings[index].sides?.[side]?.runs?.length ?? 0;
  if (!Number.isInteger(run) || run < 0 || run >= n) throw new RangeError(`Ring ${index} side ${side} has no run ${run}: it has ${n}`);
}

/** A copy of `f` with one existing run of one side changed by `change` of a copy of it. */
function withRun(f: ShellFixture, index: number, side: RingSide, run: number, change: (r: SideRun) => void): ShellFixture {
  assertRun(f, index, side, run);
  return withRing(f, index, r => {
    const target = r.sides?.[side]?.runs?.[run];
    if (target) change(target);
  });
}

/**
 * Adds a run to one side of Ring `index`: over the middle third of the largest stretch no run covers (ends snapped to the
 * cell size), in the form opposite to the side's, at the side's pitch, so it changes the roof at once. It is put in order
 * along the side. The side is listed if it was not. A side with no whole cell left uncovered is left as it was.
 */
export function addRun(f: ShellFixture, index: number, side: RingSide): ShellFixture {
  assertIndex(f, index);
  const r0 = f.rings[index];
  const stretch = largestUncovered(r0.sides?.[side]?.runs ?? [], sideLengthCm(r0.rect, side), f.cellSize);
  if (!stretch) return cloneFixture(f);
  const gap = middleThird(stretch, f.cellSize);
  return withRing(f, index, r => {
    const was = r.sides?.[side];
    const own: SideForm = {...was, form: was?.form ?? 'hip', deg: was?.deg ?? r.defaultDeg};
    const run: SideRun = {from: gap[0], to: gap[1], form: own.form === 'hip' ? 'gable' : 'hip', deg: own.deg};
    own.runs = [...(own.runs ?? []), run].sort((a, b) => a.from - b.from);
    r.sides = {...r.sides, [side]: own};
  });
}

/** Removes run `run` of one side. A side left with no run is a plain side again. */
export function removeRun(f: ShellFixture, index: number, side: RingSide, run: number): ShellFixture {
  assertRun(f, index, side, run);
  return withRing(f, index, r => {
    const s = r.sides?.[side];
    if (!s?.runs) return;
    s.runs.splice(run, 1);
    if (!s.runs.length) delete s.runs;
  });
}

/** Sets where run `run` starts, in cm from the side's start, snapped to the cell size. Not reordered: a run out of order is for the wire to refuse. */
export const setRunFrom = (f: ShellFixture, index: number, side: RingSide, run: number, value: number): ShellFixture =>
  withRun(f, index, side, run, r => { r.from = snapToCell(value, f.cellSize); });

/** Sets where run `run` ends, in cm from the side's start, snapped to the cell size. */
export const setRunTo = (f: ShellFixture, index: number, side: RingSide, run: number, value: number): ShellFixture =>
  withRun(f, index, side, run, r => { r.to = snapToCell(value, f.cellSize); });

/** Sets run `run`'s form. Its pitch, and any `maxHeight` or `limit` it carries, stay. */
export const setRunForm = (f: ShellFixture, index: number, side: RingSide, run: number, form: RingForm): ShellFixture =>
  withRun(f, index, side, run, r => { r.form = form; });

/** Sets run `run`'s own pitch. Not clamped or snapped, as the side's is not (decisions 5 and 9). */
export const setRunPitch = (f: ShellFixture, index: number, side: RingSide, run: number, deg: number): ShellFixture =>
  withRun(f, index, side, run, r => { r.deg = deg; });

/** Moves Ring `index` one place up (`-1`, toward index 0) or down (`1`). The first Ring cannot move up, nor the last down: the copy is unchanged. */
export function moveRing(f: ShellFixture, index: number, direction: -1 | 1): ShellFixture {
  assertIndex(f, index);
  const next = cloneFixture(f);
  const to = index + direction;
  if (to >= 0 && to < next.rings.length) [next.rings[index], next.rings[to]] = [next.rings[to], next.rings[index]];
  return next;
}

export function setStoreyHeight(f: ShellFixture, storeyHeight: number): ShellFixture {
  const next = cloneFixture(f);
  next.storeyHeight = storeyHeight;
  return next;
}

/** Where Ring `index` stands: its rect, from the floor of its base storey to the plate of its top storey. */
export function ringBox(f: ShellFixture, index: number): RingBox {
  assertIndex(f, index);
  const r = f.rings[index];
  return {rect: [...r.rect], zLo: r.baseStorey * f.storeyHeight, zHi: (r.baseStorey + r.storeys) * f.storeyHeight};
}
