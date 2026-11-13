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
  return withRing(f, index, r => {
    r.rect = [snapToCell(rect[0], f.cellSize), snapToCell(rect[1], f.cellSize), snapToCell(rect[2], f.cellSize), snapToCell(rect[3], f.cellSize)];
    refitSides(r);
  });
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
    refitSides(r);
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
 * not yet listed. A listed side always carries its own pitch (decision 14 as amended, journal decision 198, M1). On a
 * split side the stretches are the truth and the side's own form is derived from them (journal decision 214): this does
 * not act there, and the copy is unchanged.
 */
export function setSideForm(f: ShellFixture, index: number, side: RingSide, form: RingForm): ShellFixture {
  if (isSplit(f.rings[index]?.sides?.[side])) return cloneFixture(f);
  return withRing(f, index, r => {
    const was = r.sides?.[side];
    r.sides = {...r.sides, [side]: {...was, form, deg: was?.deg ?? r.defaultDeg}};
  });
}

/** Lists one side of Ring `index` at its own pitch, keeping the form it already has (a hip when it had none). Not on a split side, as `setSideForm`. */
export function setSidePitch(f: ShellFixture, index: number, side: RingSide, deg: number): ShellFixture {
  if (isSplit(f.rings[index]?.sides?.[side])) return cloneFixture(f);
  return withRing(f, index, r => {
    const was = r.sides?.[side];
    r.sides = {...r.sides, [side]: {...was, form: was?.form ?? 'hip', deg}};
  });
}

/** Clears one side of Ring `index` back to the default: a plain hip at the Ring's `defaultDeg`. A split side's stretches go with it (journal decision 214). */
export function clearSide(f: ShellFixture, index: number, side: RingSide): ShellFixture {
  return withRing(f, index, r => {
    const sides = {...r.sides};
    delete sides[side];
    r.sides = sides;
  });
}

// ---- Stretches (journal decision 214) ---------------------------------------------------------------------------------------

/** Where a stretch lies along its side, in cm from the side's start. */
export interface RunSpan { from: number; to: number }

/** One stretch of a side: a run that always carries its own pitch. A plain side is one stretch the whole of its length. */
export type Stretch = SideRun & {deg: number};

/**
 * A side's length in cm, which its stretches' ends are measured along. Every side runs counter-clockwise from its start
 * (gable rise decision 1; `runSpan` in `ring-forms.ts`): S from its west end (x0) toward the east, E from its south end (y0)
 * toward the north, N from its east end (x1) toward the west, W from its north end (y1) toward the south.
 */
export const sideLengthCm = (rect: Rect, side: RingSide): number => {
  const l = ringSideLines(rect)[side];
  return l.hi - l.lo;
};

/** Whether runs run from 0 to `length`, each starting where the one before ends, whatever their order or size: the layout `writeInput` writes as authored, with no stretch filled between. */
export const runsAreContiguous = (runs: readonly RunSpan[], length: number): boolean =>
  runs.length > 0 && runs[0].from === 0 && runs.at(-1)?.to === length && runs.every((r, i) => i === 0 || r.from === runs[i - 1].to);

/** Whether a side is split: it has runs. A plain side has none. */
const isSplit = (s: SideForm | undefined): s is SideForm & {runs: SideRun[]} => (s?.runs?.length ?? 0) > 0;

/** What a side reads as where no run covers it: its own form and pitch. */
interface Own { form: RingForm; deg: number }

/** Whether two stretches read the same in every way the editor spells, and so are one stretch. */
const sameStretch = (a: SideRun, b: SideRun): boolean =>
  a.form === b.form && a.deg === b.deg && a.maxHeight === b.maxHeight && a.limit === b.limit;

/**
 * A side's runs as stretches that cover its whole length in order, a stretch between runs, before the first or after the
 * last taking the side's own form and pitch; undefined when the runs are malformed (a run empty, out of order,
 * overlapping another, or outside the side), which no spelling can be given.
 */
function tile(runs: readonly SideRun[], own: Own, length: number): Stretch[] | undefined {
  const out: Stretch[] = [];
  let at = 0;
  for (const r of runs) {
    if (!(Number.isFinite(r.from) && Number.isFinite(r.to) && r.from < r.to && r.from >= at && r.to <= length)) return undefined;
    if (r.from > at) out.push({from: at, to: r.from, ...own});
    out.push({...r, deg: r.deg ?? own.deg});
    at = r.to;
  }
  if (at < length) out.push({from: at, to: length, ...own});
  return out;
}

/** Neighbouring stretches that read the same joined into one. */
function merge(stretches: readonly Stretch[]): Stretch[] {
  const out: Stretch[] = [];
  for (const s of stretches) {
    const last = out.at(-1);
    if (last && sameStretch(last, s)) last.to = s.to;
    else out.push({...s});
  }
  return out;
}

/**
 * The one spelling of a side (journal decision 214). A plain side has no runs. A split side's runs are stretches that
 * cover its whole length, in order, with neighbours that read the same merged; one that merges to a single stretch is a
 * plain side again, and so loses a `maxHeight` or `limit`, which only a rise has. A split side's own `form` and `deg` are
 * derived: its first hip stretch, else its first stretch, which is also what `input@1` reads back. A side whose runs are
 * malformed is left as typed, with its pitches pinned. `fallbackDeg` is the Ring's `defaultDeg`, for a side without a pitch.
 */
export function canonicalSide(side: SideForm, length: number, fallbackDeg: number): SideForm {
  const {runs, ...rest} = side;
  const own: Own = {form: side.form, deg: side.deg ?? fallbackDeg};
  if (!runs?.length) return {...rest, ...own};
  const tiled = tile(runs, own, length);
  if (!tiled) return {...rest, ...own, runs: runs.map(r => ({...r, deg: r.deg ?? own.deg}))};
  const merged = merge(tiled);
  const base = merged.find(s => s.form === 'hip') ?? merged[0];
  return merged.length === 1 ? {...rest, form: base.form, deg: base.deg} : {...rest, form: base.form, deg: base.deg, runs: merged};
}

/** Every Ring side's one spelling, and every listed side's pitch its own (journal decisions 198, M1, and 214). */
export function canonicalFixture(f: ShellFixture): ShellFixture {
  const next = pinListedPitches(f);
  for (const r of next.rings) {
    for (const side of RING_SIDES) {
      const s = r.sides?.[side];
      if (s && r.sides) r.sides[side] = canonicalSide(s, sideLengthCm(r.rect, side), r.defaultDeg);
    }
  }
  return next;
}

/** A side's stretches: its runs when split, else the one stretch it is. An unlisted side is a hip at `fallbackDeg`. */
export function stretchesOf(side: SideForm | undefined, length: number, fallbackDeg: number): Stretch[] {
  const own: Own = {form: side?.form ?? 'hip', deg: side?.deg ?? fallbackDeg};
  return isSplit(side) ? side.runs.map(r => ({...r, deg: r.deg ?? own.deg})) : [{from: 0, to: length, ...own}];
}

/** How many stretches a side has: 1 for a plain side, listed or not. */
export const stretchCount = (f: ShellFixture, index: number, side: RingSide): number => f.rings[index]?.sides?.[side]?.runs?.length || 1;

function assertStretch(f: ShellFixture, index: number, side: RingSide, k: number, first = 0): void {
  assertIndex(f, index);
  const n = stretchCount(f, index, side);
  if (!Number.isInteger(k) || k < first || k >= n) throw new RangeError(`Ring ${index} side ${side} has no stretch ${k} to edit: it has ${n}`);
}

/** The pitch of the first hip stretch of `list`, which is the one hip pitch a side may have; undefined with none. */
const hipPitchOf = (list: readonly Stretch[]): number | undefined => list.find(s => s.form === 'hip')?.deg;

/**
 * The middle third of a stretch, its ends snapped inward to the grid, or the whole stretch where that leaves no whole cell.
 */
export function middleThird([from, to]: readonly [number, number], cell: number): [number, number] {
  const third = (to - from) / 3;
  const a = Math.ceil((from + third) / cell) * cell + 0, b = Math.floor((to - third) / cell) * cell + 0;
  return a < b ? [a, b] : [from, to];
}

/**
 * What splitting stretch `s` makes: three stretches when its middle third holds a whole cell, the middle in the other
 * form, so the side's own form stays on both flanks; else two halves, the second in the other form; undefined when the
 * stretch is too short to split (it needs two whole cells). The other form is the stretch's pitch, except a hip, which
 * takes the side's one hip pitch where it has one (journal decision 214, Low 2). A split never makes equal neighbours,
 * which would merge at once.
 */
function splitParts(s: Stretch, list: readonly Stretch[], cell: number): Stretch[] | undefined {
  const other: Stretch = s.form === 'hip'
    ? {from: s.from, to: s.to, form: 'gable', deg: s.deg}
    : {from: s.from, to: s.to, form: 'hip', deg: hipPitchOf(list) ?? s.deg};
  const [a, b] = middleThird([s.from, s.to], cell);
  if (a > s.from && b < s.to) return [{...s, to: a}, {...other, from: a, to: b}, {...s, from: b}];
  const m = Math.round((s.from + s.to) / 2 / cell) * cell + 0;
  return m > s.from && m < s.to ? [{...s, to: m}, {...other, from: m}] : undefined;
}

/** Whether stretch `k` of a side can be split: it holds two whole cells. The panel says so when it cannot. */
export function canSplitStretch(f: ShellFixture, index: number, side: RingSide, k: number): boolean {
  assertStretch(f, index, side, k);
  const r = f.rings[index];
  const list = stretchesOf(r.sides?.[side], sideLengthCm(r.rect, side), r.defaultDeg);
  return splitParts(list[k], list, f.cellSize) !== undefined;
}

/** A copy of `f` with one side's stretches changed by `change`, and the side given its one spelling. The side is listed if it was not. */
function withStretches(f: ShellFixture, index: number, side: RingSide, change: (list: Stretch[]) => Stretch[]): ShellFixture {
  return withRing(f, index, r => {
    const was = r.sides?.[side];
    const length = sideLengthCm(r.rect, side);
    const own: SideForm = {...was, form: was?.form ?? 'hip', deg: was?.deg ?? r.defaultDeg};
    const list = change(stretchesOf(own, length, r.defaultDeg));
    r.sides = {...r.sides, [side]: canonicalSide({...own, runs: list}, length, r.defaultDeg)};
  });
}

/**
 * Splits stretch `k` of one side of Ring `index` (a plain side has the one stretch 0): see `splitParts`. A stretch too
 * short to split is left as it is, and so is the side (`canSplitStretch` says whether it is).
 */
export function splitStretch(f: ShellFixture, index: number, side: RingSide, k: number): ShellFixture {
  if (!canSplitStretch(f, index, side, k)) return cloneFixture(f);
  return withStretches(f, index, side, list => {
    const parts = splitParts(list[k], list, f.cellSize) ?? [list[k]];
    return [...list.slice(0, k), ...parts, ...list.slice(k + 1)];
  });
}

/**
 * Moves the boundary between stretch `k - 1` and stretch `k` (`k` from 1) to `value` cm from the side's start, snapped to
 * the cell size. It moves both stretches that share it. A boundary moved past a neighbour's far end leaves a stretch
 * empty, which the wire refuses (decision 9: the edit is not blocked); the side is then left as typed.
 */
export function moveBoundary(f: ShellFixture, index: number, side: RingSide, k: number, value: number): ShellFixture {
  assertStretch(f, index, side, k, 1);
  const at = snapToCell(value, f.cellSize);
  return withStretches(f, index, side, list => list.map((s, i) => (i === k - 1 ? {...s, to: at} : i === k ? {...s, from: at} : s)));
}

/**
 * Sets stretch `k`'s form. A stretch made a hip takes the side's one hip pitch where another stretch is one, and loses its
 * `maxHeight` and `limit`, which belong to a rise (journal decision 214, Low 2 and Low 4). Equal neighbours merge.
 */
export function setStretchForm(f: ShellFixture, index: number, side: RingSide, k: number, form: RingForm): ShellFixture {
  assertStretch(f, index, side, k);
  return withStretches(f, index, side, list => list.map((s, i) => {
    if (i !== k) return s;
    if (form === 'gable') return {...s, form};
    const {maxHeight: _m, limit: _l, ...hip} = s;
    return {...hip, form, deg: hipPitchOf(list.filter((_, j) => j !== k)) ?? s.deg};
  }));
}

/** Sets stretch `k`'s own pitch. Not clamped or snapped, as the side's is not (decisions 5 and 9). Equal neighbours merge. */
export function setStretchPitch(f: ShellFixture, index: number, side: RingSide, k: number, deg: number): ShellFixture {
  assertStretch(f, index, side, k);
  return withStretches(f, index, side, list => list.map((s, i) => (i === k ? {...s, deg} : s)));
}

/**
 * A side's stretches after its length changed: the last one ends where the side does, and one that begins at or past the
 * end is dropped (the first is kept). A resize therefore keeps a split side tiled instead of leaving it for the wire to refuse.
 */
function refit(side: SideForm, length: number, fallbackDeg: number): SideForm {
  const runs = side.runs;
  if (!runs?.length || runs.at(-1)?.to === length || !(length > 0)) return side;
  const kept = runs.filter((r, i) => i === 0 || r.from < length).map(r => ({...r}));
  kept[kept.length - 1].to = length;
  return canonicalSide({...side, runs: kept}, length, fallbackDeg);
}

/** Refits every split side of a Ring to its sides' lengths (`refit`). */
function refitSides(r: FixtureRing): void {
  for (const side of RING_SIDES) {
    const s = r.sides?.[side];
    if (s && r.sides) r.sides[side] = refit(s, sideLengthCm(r.rect, side), r.defaultDeg);
  }
}

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
