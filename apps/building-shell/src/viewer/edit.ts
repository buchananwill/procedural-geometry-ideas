// Viewer editing decisions 1 to 5: the pure edit functions. Each takes a `ShellFixture` and returns a new one, and never
// mutates its argument (decision 2). No DOM, no scene, and no validity test: a draft is valid when the wire accepts it
// (decision 6, journal decision 193), which `draft.ts` asks; an edit is never blocked (decision 9).
import {RING_SIDES} from '../fixture.ts';
import type {FixtureRing, RingForm, RingSide, RingSides, RiseFacing, ShellFixture, SideForm, SideRun} from '../fixture.ts';
import {DEFAULT_RISE_FACING, DEFAULT_RISE_LIMIT, joins, ringSideLines, runSpan} from '../ring-forms.ts';
import type {Claim} from '../ring-forms.ts';
import {RISE_MIN_CAP_CM} from '../rise.ts';
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
    const was = r.rect;
    r.rect = [snapToCell(rect[0], f.cellSize), snapToCell(rect[1], f.cellSize), snapToCell(rect[2], f.cellSize), snapToCell(rect[3], f.cellSize)];
    refitSides(r, was);
  });
}

/**
 * Sets one coordinate of Ring `index`'s rect (`coord` 0 to 3: x0, y0, x1, y1), snapped to the fixture's `cellSize`. The
 * other three stay as they are: a rect that is off the grid (a loaded file's) is not moved by an edit to its neighbour.
 */
export function setRectCoord(f: ShellFixture, index: number, coord: 0 | 1 | 2 | 3, value: number): ShellFixture {
  return withRing(f, index, r => {
    const was = r.rect;
    const rect: Rect = [...r.rect];
    rect[coord] = snapToCell(value, f.cellSize);
    r.rect = rect;
    refitSides(r, was);
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

/** The four settings of a gable stretch (per-stretch gable settings decision 1), as `SideRun` names them. */
export type GableSettings = Pick<SideRun, 'maxHeight' | 'limit' | 'facing' | 'apart'>;

/**
 * A stretch's settings in their one spelling (per-stretch gable settings decisions 1 and 2): a hip stretch carries none, and
 * a gable stretch carries each only where it departs from its default, as `readInput` gives them. Interpretation: a
 * `maxHeight` of 0 is none, as the wire writes none (decision 12), so the editor never holds a 0 the pipeline refuses; a
 * `limit` at its one value is no limit, which is what it means.
 */
export function settledSettings(s: SideRun): GableSettings {
  if (s.form !== 'gable') return {};
  const {maxHeight, limit, facing, apart} = s;
  return {
    ...(maxHeight !== undefined && maxHeight !== 0 ? {maxHeight} : {}),
    ...(limit !== undefined && limit !== DEFAULT_RISE_LIMIT ? {limit} : {}),
    ...(facing !== undefined && facing !== DEFAULT_RISE_FACING ? {facing} : {}),
    ...(apart === true ? {apart} : {}),
  };
}

/**
 * Journal decision 257: whether a gable stretch's maximum height holds its rise within `RISE_MIN_CAP_CM` of the plate, so
 * the pipeline builds no gable there. Information for the author, not a refusal: the draft stays valid and builds.
 */
export const capTooLowToBuild = (s: SideRun): boolean => s.form === 'gable' && s.maxHeight !== undefined && s.maxHeight <= RISE_MIN_CAP_CM;

/** What the panel says beside a maximum height `capTooLowToBuild` holds too low, the threshold the pipeline's own. */
export const CAP_TOO_LOW_NOTE = `at or below ${RISE_MIN_CAP_CM} cm no gable is built here`;

/** A stretch with its settings in their one spelling (`settledSettings`). */
function settled(s: Stretch): Stretch {
  const {maxHeight: _m, limit: _l, facing: _f, apart: _a, ...bare} = s;
  return {...bare, ...settledSettings(s)};
}

/** Whether a stretch, settled, carries any setting: a side of one such stretch is not a plain side. */
const carriesSettings = (s: Stretch): boolean => Object.keys(settledSettings(s)).length > 0;

/**
 * Stretch `k` of a side as the pipeline's merge rule reads it: a claim of one Ring's side, every setting resolved to its
 * default where absent, as `claimAt` in `ring-forms.ts` resolves a run's. The Ring is the same for every stretch of a side,
 * and each stretch is its own.
 */
const claimOf = (s: Stretch, k: number): Claim => ({
  ring: 0, stretch: k, form: s.form, deg: s.deg, ...(s.maxHeight === undefined ? {} : {maxHeight: s.maxHeight}),
  limit: s.limit ?? DEFAULT_RISE_LIMIT, facing: s.facing ?? DEFAULT_RISE_FACING, apart: s.apart ?? false,
});

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

/**
 * Neighbouring stretches joined into one where the pipeline joins them: by `joins` in `ring-forms.ts` itself (per-stretch
 * gable settings decisions 8 and 17), each stretch read against the one before it, as `extentsOf` reads its pieces. Two
 * equal gable stretches of which either stands apart stay two.
 */
function merge(stretches: readonly Stretch[]): Stretch[] {
  const out: Stretch[] = [];
  stretches.forEach((s, k) => {
    const last = out.at(-1);
    if (last && joins(claimOf(stretches[k - 1], k - 1), claimOf(s, k))) last.to = s.to;
    else out.push({...s});
  });
  return out;
}

/**
 * The one spelling of a side (journal decision 214, per-stretch gable settings decision 17). A plain side has no runs. A
 * split side's runs are stretches that cover its whole length, in order, each with its settings in their one spelling
 * (`settledSettings`), and neighbours the pipeline would join merged (`merge`). One that merges to a single stretch is a
 * plain side again, unless that stretch carries a setting, which a plain side cannot: then it stays one run. A split side's
 * own `form` and `deg` are derived: its first hip stretch, else its first stretch, which is also what `input@1` reads back.
 * A side whose runs are malformed is left as typed, with its pitches pinned. `fallbackDeg` is the Ring's `defaultDeg`, for a
 * side without a pitch.
 */
export function canonicalSide(side: SideForm, length: number, fallbackDeg: number): SideForm {
  const {runs, ...rest} = side;
  const own: Own = {form: side.form, deg: side.deg ?? fallbackDeg};
  if (!runs?.length) return {...rest, ...own};
  const tiled = tile(runs, own, length);
  if (!tiled) return {...rest, ...own, runs: runs.map(r => ({...r, deg: r.deg ?? own.deg}))};
  const merged = merge(tiled.map(settled));
  const base = merged.find(s => s.form === 'hip') ?? merged[0];
  const plain = merged.length === 1 && !carriesSettings(base);
  return plain ? {...rest, form: base.form, deg: base.deg} : {...rest, form: base.form, deg: base.deg, runs: merged};
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
 * stretch is too short to split. Too short is less than two whole cells, or no point on the grid that leaves a whole cell
 * on each side: a stretch of a cell and a half is too short (journal decision 216), which is what the panel says. The other
 * form is the stretch's pitch, except a hip, which takes the side's one hip pitch where it has one (journal decision 214,
 * Low 2). A split never makes equal neighbours, which would merge at once.
 */
function splitParts(s: Stretch, list: readonly Stretch[], cell: number): Stretch[] | undefined {
  if (s.to - s.from < 2 * cell) return undefined;
  const other: Stretch = s.form === 'hip'
    ? {from: s.from, to: s.to, form: 'gable', deg: s.deg}
    : {from: s.from, to: s.to, form: 'hip', deg: hipPitchOf(list) ?? s.deg};
  const [a, b] = middleThird([s.from, s.to], cell);
  if (a > s.from && b < s.to) return [{...s, to: a}, {...other, from: a, to: b}, {...s, from: b}];
  const m = Math.round((s.from + s.to) / 2 / cell) * cell + 0;
  return m - s.from >= cell && s.to - m >= cell ? [{...s, to: m}, {...other, from: m}] : undefined;
}

/**
 * Per-stretch gable settings decision 18: what halving gable stretch `s` makes: two gable stretches at the grid point
 * nearest its middle, each keeping the stretch's settings and each standing apart, since two equal neighbours that do not
 * would merge at once. Undefined for a hip stretch, and for one with no grid point that leaves a whole cell on each side.
 */
function halfParts(s: Stretch, cell: number): Stretch[] | undefined {
  if (s.form !== 'gable') return undefined;
  const m = Math.round((s.from + s.to) / 2 / cell) * cell + 0;
  return m - s.from >= cell && s.to - m >= cell ? [{...s, to: m, apart: true}, {...s, from: m, apart: true}] : undefined;
}

/** Side `side` of Ring `index`'s stretches, a plain side as its one stretch. */
function stretchList(f: ShellFixture, index: number, side: RingSide): Stretch[] {
  const r = f.rings[index];
  return stretchesOf(r.sides?.[side], sideLengthCm(r.rect, side), r.defaultDeg);
}

/** Whether stretch `k` of a side can be split: it holds two whole cells. The panel says so when it cannot. */
export function canSplitStretch(f: ShellFixture, index: number, side: RingSide, k: number): boolean {
  assertStretch(f, index, side, k);
  const list = stretchList(f, index, side);
  return splitParts(list[k], list, f.cellSize) !== undefined;
}

/** Whether stretch `k` of a side can be halved into two gables (`halfParts`): it is a gable stretch of two whole cells or more. */
export function canHalveStretch(f: ShellFixture, index: number, side: RingSide, k: number): boolean {
  assertStretch(f, index, side, k);
  return halfParts(stretchList(f, index, side)[k], f.cellSize) !== undefined;
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
 * Per-stretch gable settings decision 18: halves gable stretch `k` of one side of Ring `index` into two gables, each
 * standing apart (`halfParts`). A plain gable side is its one stretch 0. A hip stretch, or a gable stretch too short to
 * halve, is left as it is, and so is the side (`canHalveStretch` says whether it can be halved).
 */
export function halveStretch(f: ShellFixture, index: number, side: RingSide, k: number): ShellFixture {
  if (!canHalveStretch(f, index, side, k)) return cloneFixture(f);
  return withStretches(f, index, side, list => [...list.slice(0, k), ...(halfParts(list[k], f.cellSize) ?? [list[k]]), ...list.slice(k + 1)]);
}

/**
 * Moves the boundary between stretch `k - 1` and stretch `k` (`k` from 1) to `value` cm from the side's start, snapped to
 * the cell size. It moves both stretches that share it. A boundary moved exactly onto a neighbour's far end leaves that
 * neighbour empty, so it is removed and the stretch beyond the boundary takes its place (journal decision 216). One moved
 * past the far end leaves a stretch reversed, which the wire refuses (decision 9: the edit is not blocked); the side is
 * then left as typed.
 */
export function moveBoundary(f: ShellFixture, index: number, side: RingSide, k: number, value: number): ShellFixture {
  assertStretch(f, index, side, k, 1);
  const at = snapToCell(value, f.cellSize);
  return withStretches(f, index, side, list => {
    const before = list[k - 1], after = list[k];
    if (at === after.to) return [...list.slice(0, k - 1), {...before, to: at}, ...list.slice(k + 1)];
    if (at === before.from) return [...list.slice(0, k - 1), {...after, from: at}, ...list.slice(k + 1)];
    return list.map((s, i) => (i === k - 1 ? {...s, to: at} : i === k ? {...s, from: at} : s));
  });
}

/**
 * Sets stretch `k`'s form. A stretch made a hip takes the side's one hip pitch where another stretch is one, and loses all
 * four of a gable's settings (journal decision 214, Low 2 and Low 4; per-stretch gable settings decision 1). Neighbours
 * the pipeline would join merge.
 */
export function setStretchForm(f: ShellFixture, index: number, side: RingSide, k: number, form: RingForm): ShellFixture {
  assertStretch(f, index, side, k);
  return withStretches(f, index, side, list => list.map((s, i) => {
    if (i !== k) return s;
    if (form === 'gable') return {...s, form};
    const {maxHeight: _m, limit: _l, facing: _f, apart: _a, ...hip} = s;
    return {...hip, form, deg: hipPitchOf(list.filter((_, j) => j !== k)) ?? s.deg};
  }));
}

/**
 * Per-stretch gable settings decision 16: sets one setting of gable stretch `k` with `change`. A hip stretch carries none
 * (decision 1), so on one the copy is unchanged. Neighbours the pipeline would join merge.
 */
function withGableStretch(f: ShellFixture, index: number, side: RingSide, k: number, change: (s: Stretch) => Stretch): ShellFixture {
  assertStretch(f, index, side, k);
  if (stretchList(f, index, side)[k].form !== 'gable') return cloneFixture(f);
  return withStretches(f, index, side, list => list.map((s, i) => (i === k ? change(s) : s)));
}

/**
 * Sets gable stretch `k`'s maximum height in cm above its plate; `undefined` is none. Not clamped (decision 9): a negative
 * height is applied and the wire refuses it. A height of 0 is none, as on the wire (`settledSettings`).
 */
export function setStretchMaxHeight(f: ShellFixture, index: number, side: RingSide, k: number, maxHeight: number | undefined): ShellFixture {
  return withGableStretch(f, index, side, k, ({maxHeight: _m, ...s}) => (maxHeight === undefined ? s : {...s, maxHeight}));
}

/** Sets gable stretch `k`'s facing strategy (per-stretch gable settings decisions 4 and 5). */
export const setStretchFacing = (f: ShellFixture, index: number, side: RingSide, k: number, facing: RiseFacing): ShellFixture =>
  withGableStretch(f, index, side, k, s => ({...s, facing}));

/** Sets whether gable stretch `k` stands apart from a gable stretch beside it (per-stretch gable settings decision 9). */
export const setStretchApart = (f: ShellFixture, index: number, side: RingSide, k: number, apart: boolean): ShellFixture =>
  withGableStretch(f, index, side, k, s => ({...s, apart}));

/** Sets stretch `k`'s own pitch. Not clamped or snapped, as the side's is not (decisions 5 and 9). Equal neighbours merge. */
export function setStretchPitch(f: ShellFixture, index: number, side: RingSide, k: number, deg: number): ShellFixture {
  assertStretch(f, index, side, k);
  return withStretches(f, index, side, list => list.map((s, i) => (i === k ? {...s, deg} : s)));
}

/** Where a world coordinate lies along a side, in cm from its start (`runSpan`'s inverse). */
const offsetAlong = (rect: Rect, side: RingSide, world: number): number => {
  const [x0, y0, x1, y1] = rect;
  return side === 'S' ? world - x0 : side === 'E' ? world - y0 : side === 'N' ? x1 - world : y1 - world;
};

/**
 * A split side's stretches after its Ring's rect changed (journal decision 216). Every boundary stays where it was in the
 * world, whichever end of the side moved: the stretches are carried to the new side by their world coordinates, not by their
 * distance from the side's start. The first and last stretch grow or shrink to the new ends; a stretch wholly outside the
 * new side is dropped, and one partly outside is clipped. A side left with nothing inside keeps the stretch nearest it. A
 * side whose stretches are not tiled (a malformed one), or whose new length is not positive, is left as it is.
 */
function refit(side: SideForm, from: Rect, to: Rect, name: RingSide, fallbackDeg: number): SideForm {
  const runs = side.runs;
  const was = sideLengthCm(from, name), length = sideLengthCm(to, name);
  if (!runs?.length || !(length > 0) || !runsAreContiguous(runs, was) || runs.some(r => !(r.from < r.to))) return side;
  const carried = runs.map(r => {
    const [a, b] = runSpan(from, name, r);
    const [p, q] = [offsetAlong(to, name, a), offsetAlong(to, name, b)];
    return {...r, from: Math.min(p, q) + 0, to: Math.max(p, q) + 0};
  });
  let inside = carried.filter(r => r.to > 0 && r.from < length);
  if (!inside.length) inside = [carried.every(r => r.to <= 0) ? carried[carried.length - 1] : carried[0]];
  const first = inside[0], last = inside[inside.length - 1];
  const kept = inside.map(r => ({...r, from: r === first ? 0 : Math.max(r.from, 0), to: r === last ? length : Math.min(r.to, length)}));
  return canonicalSide({...side, runs: kept}, length, fallbackDeg);
}

/** Refits every split side of a Ring whose rect changed from `from` to its own (`refit`). */
function refitSides(r: FixtureRing, from: Rect): void {
  for (const side of RING_SIDES) {
    const s = r.sides?.[side];
    if (s && r.sides) r.sides[side] = refit(s, from, r.rect, side, r.defaultDeg);
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
