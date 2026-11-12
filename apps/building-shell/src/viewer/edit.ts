// Viewer editing decisions 1 to 5: the pure edit functions. Each takes a `ShellFixture` and returns a new one, and never
// mutates its argument (decision 2). No DOM, no scene, and no validity test: a draft is valid when the wire accepts it
// (decision 6, journal decision 193), which `draft.ts` asks; an edit is never blocked (decision 9).
import {RING_SIDES} from '../fixture.ts';
import type {FixtureRing, RingForm, RingSide, ShellFixture, SideForm} from '../fixture.ts';
import type {Rect} from '../roof/model.ts';

/** Decision 4: a new Ring is 500 x 500 cm, a hip at 45 degrees, one storey, at base storey 0. */
export const NEW_RING_SIZE_CM = 500;
export const NEW_RING_DEG = 45;

/** Decision 5: the step of a pitch field, in degrees. */
export const PITCH_STEP_DEG = 0.5;

/** A Ring's box in the world, for the viewport's highlight: its rect, from its lowest floor to its highest plate. */
export interface RingBox { rect: Rect; zLo: number; zHi: number }

const cloneSides = (sides: FixtureRing['sides']): FixtureRing['sides'] => {
  const out: Partial<Record<RingSide, SideForm>> = {};
  for (const side of RING_SIDES) {
    const s = sides?.[side];
    if (s) out[side] = s.deg === undefined ? {form: s.form} : {form: s.form, deg: s.deg};
  }
  return out;
};

/** A deep copy: no Ring, rect or side is shared with the original. */
export function cloneRing(r: FixtureRing): FixtureRing {
  return {rect: [...r.rect], baseStorey: r.baseStorey, storeys: r.storeys, defaultDeg: r.defaultDeg, sides: cloneSides(r.sides)};
}

/** A deep copy of a fixture. */
export const cloneFixture = (f: ShellFixture): ShellFixture =>
  ({name: f.name, cellSize: f.cellSize, storeyHeight: f.storeyHeight, rings: f.rings.map(cloneRing)});

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

export const setBaseStorey = (f: ShellFixture, index: number, baseStorey: number): ShellFixture =>
  withRing(f, index, r => { r.baseStorey = baseStorey; });

export const setStoreys = (f: ShellFixture, index: number, storeys: number): ShellFixture =>
  withRing(f, index, r => { r.storeys = storeys; });

/** The pitch of every side of Ring `index` that has none of its own. Not snapped: the 0.5 degree step belongs to the field (decision 5). */
export const setDefaultDeg = (f: ShellFixture, index: number, deg: number): ShellFixture =>
  withRing(f, index, r => { r.defaultDeg = deg; });

/** Lists one side of Ring `index` with `form`, keeping the pitch it already has. */
export function setSideForm(f: ShellFixture, index: number, side: RingSide, form: RingForm): ShellFixture {
  return withRing(f, index, r => {
    const sides = {...r.sides};
    const was = sides[side];
    sides[side] = was?.deg === undefined ? {form} : {form, deg: was.deg};
    r.sides = sides;
  });
}

/** Lists one side of Ring `index` at its own pitch, keeping the form it already has (a hip when it had none). */
export function setSidePitch(f: ShellFixture, index: number, side: RingSide, deg: number): ShellFixture {
  return withRing(f, index, r => {
    r.sides = {...r.sides, [side]: {form: r.sides?.[side]?.form ?? 'hip', deg}};
  });
}

/** Clears one side of Ring `index` back to the default: a hip at the Ring's `defaultDeg`. */
export function clearSide(f: ShellFixture, index: number, side: RingSide): ShellFixture {
  return withRing(f, index, r => {
    const sides = {...r.sides};
    delete sides[side];
    r.sides = sides;
  });
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
