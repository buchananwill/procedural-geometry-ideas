// `building-shell/input@1` to and from the prototype's Ring-authored `ShellFixture` (spec decisions 1 to 3 and 16;
// journal decisions 124 to 128 and 136 to 143). Browser-safe: no Node globals.
//
// - Frame: none converted. A file's numbers are UE actor-local cm, and the prototype uses the same numbers and the same
//   signed-area test, so winding agrees (decision 126).
// - Corners within `WIRE_CORNER_SNAP_CM` of the 1/1024 cm grid are snapped by `snapCm`, the app's one rounding; one
//   beyond it is refused. Rectangularity is then tested exactly on the snapped corners (decision 137).
// - A Ring is four corners; side i runs from corner i to corner i + 1 and is owned by corner i. Each side is matched to
//   the compass side of the Ring's rect it lies on, so a Ring may start at any corner.
// - The fixture is built from each side's solve (decisions 126, 136 and 140): Pitched is a hip at its solved pitch;
//   GableEnd is a gable at the Ring's `defaultDeg`, never at its wire pitch, which the skeleton would read as a weight;
//   None is an unlisted side, refused only where it wins a union wall. The request is carried, never read.
// - Rings are ordered by model index, the key the conflict rule reads (spec decision 3, journal decision 128).
//
// "Every reason at once" holds within each layer, never across them (decision 143, F7). A file the refinement refuses
// reports every shape issue and stops there. A file it accepts reports every refusal of the first adapter layer
// (subject, indices, corners, shape, wall height, solved forms and pitches) together. Only a file clean of those is read
// into a fixture, where a None side that wins a union wall is the last layer's refusal.
import type {FixtureRing, RingForm, RingSide, RingSides, ShellFixture} from '../fixture.ts';
import {RING_SIDES, storeyRings, storeysOf} from '../fixture.ts';
import {SHELL_TOLERANCE_CM} from '../constants.ts';
import {PlanRefusal} from '../errors.ts';
import {storeyLoops, unionWallForms} from '../ring-forms.ts';
import type {Rect} from '../roof/model.ts';
import {snapCm} from '../weld.ts';
import {
  BuildingShellInputV1, INPUT_FRAME, INPUT_SCHEMA_VERSION, RING_CORNERS, RefusedInput, WIRE_CORNER_SNAP_CM,
  WIRE_GABLE_ONLY_DEG, WIRE_MAX_PITCH_DEG, WIRE_MIN_PITCH_DEG, WireProvenance, WireRequest, WireRing, WireSide,
  WireSolvedForm, WireVec2, refineInput,
} from './input-types.ts';

/**
 * What the diff report carries from the input side (decisions 126, 136, 137 and 140):
 * - `flags`: what is raised with the user, and pinned by a playtest file (model-index and root order disagreeing);
 * - `info`: what is carried as information, never asserted (a request that disagrees with its solve, `bEmptied`,
 *   `bOutlineRefused`, and every gable's wire pitch the fixture does not use);
 * - `maxCornerDriftCm`: the largest distance any corner coordinate was snapped.
 */
export interface InputReport { flags: string[]; info: string[]; maxCornerDriftCm: number }

/** A file the adapter reads: the fixture it builds, and what the diff report carries. */
export interface AdaptedInput { ok: true; fixture: ShellFixture; input: BuildingShellInputV1; report: InputReport }

export type ReadInputResult = AdaptedInput | RefusedInput;

/** A solved side the fixture lists, with its Ring form. */
export interface ListedSide { kind: 'listed'; form: RingForm }
/** A solved side the fixture leaves unlisted: None (decision 140, F2). */
export interface UnlistedSide { kind: 'unlisted' }
/** A solved side the adapter refuses, with why. */
export interface RefusedSide { kind: 'refused'; reason: string }

/** How one solved side enters the fixture (decisions 138, B4, and 142, B5). */
export type SideReading = ListedSide | UnlistedSide | RefusedSide;

/** Decisions 126, 136 and 140: every solved form's reading, as an exhaustive table (decision 142, N4). */
export const SIDE_READINGS: Readonly<Record<WireSolvedForm, SideReading>> = {
  Pitched: {kind: 'listed', form: 'hip'},
  GableEnd: {kind: 'listed', form: 'gable'},
  None: {kind: 'unlisted'},
  Monopitch: {kind: 'refused', reason: 'a solved Monopitch, refused until mono is supported (journal decision 126)'},
  Flat: {kind: 'refused', reason: 'a solved Flat, which is a polyline clamp, never a run form (journal decision 126)'},
};

/** The solved form a fixture's Ring form writes, as an exhaustive table (decision 142, N4). */
export const WIRE_FORMS: Readonly<Record<RingForm, Extract<WireSolvedForm, WireRequest>>> = {hip: 'Pitched', gable: 'GableEnd'};

const label = (r: WireRing, i: number): string => `Ring ${i} (model index ${r.modelIndex})`;

/** The compass side the segment `a` to `b` of `rect` lies on. The segment is known axis-aligned and on the rect. */
function compassOf(a: WireVec2, b: WireVec2, rect: Rect): RingSide {
  const [, y0, x1] = rect;
  if (a.y === b.y) return a.y === y0 ? 'S' : 'N';
  return a.x === x1 ? 'E' : 'W';
}

/** The signed area Σ (x·y′ − x′·y) / 2 over a corner loop's sides: the C++'s `SignedArea`. */
const signedArea = (cs: WireVec2[]): number =>
  cs.reduce((s, a, i) => { const b = cs[(i + 1) % cs.length]; return s + a.x * b.y - b.x * a.y; }, 0) / 2;

/** A Ring's corners snapped to the 1/1024 cm grid, with their largest drift and a refusal per corner beyond the slack. */
export interface SnappedCorners { corners: WireVec2[]; drift: number; errors: string[] }

function snapCorners(r: WireRing, at: string): SnappedCorners {
  let drift = 0;
  const errors: string[] = [];
  const corners = r.corners.map((c, k) => {
    const snapped = {x: snapCm(c.x), y: snapCm(c.y)};
    for (const axis of ['x', 'y'] as const) {
      const d = Math.abs(c[axis] - snapped[axis]);
      drift = Math.max(drift, d);
      if (d > WIRE_CORNER_SNAP_CM) {
        errors.push(`${at} corner ${k}'s ${axis} = ${c[axis]} lies ${d} cm off the 1/1024 cm grid, beyond WIRE_CORNER_SNAP_CM = ${WIRE_CORNER_SNAP_CM} cm (journal decision 137)`);
      }
    }
    return snapped;
  });
  return {corners, drift, errors};
}

/**
 * Decisions 126 and 137: a Ring that is not an axis-aligned rectangle is refused, tested exactly on its snapped corners.
 * Every side must hold exactly one coordinate fixed, the sides alternating between the axes, and the loop's signed
 * area must be positive, as the C++'s `ArchitectureRings` validator requires.
 */
function ringShapeErrors(cs: WireVec2[], at: string): string[] {
  const notRect = 'is not an axis-aligned rectangle (journal decision 126)';
  const ends = (i: number): [WireVec2, WireVec2] => [cs[i], cs[(i + 1) % RING_CORNERS]];
  /** Which coordinate side i holds fixed, or null when it holds both (degenerate) or neither (oblique). */
  const fixedAxis = (i: number): 'x' | 'y' | null => {
    const [a, b] = ends(i);
    return a.x === b.x && a.y !== b.y ? 'x' : a.y === b.y && a.x !== b.x ? 'y' : null;
  };
  const axes = [0, 1, 2, 3].map(fixedAxis);
  const out = axes.flatMap((ax, i) => {
    const [a, b] = ends(i);
    return ax ? [] : [`${at} side ${i} runs (${a.x}, ${a.y}) to (${b.x}, ${b.y}), not along one axis: the Ring ${notRect}`];
  });
  if (out.length) return out;
  if (axes[0] === axes[1] || axes[1] === axes[2] || axes[2] === axes[3]) return [`${at} has two consecutive sides on one axis: the Ring ${notRect}`];
  const area = signedArea(cs);
  if (area <= 0) {
    return [`${at} has signed area x·y′ − x′·y ≤ 0 (${area} cm²), the C++'s SignedArea test; a Ring's corners run with positive signed area (journal decisions 126 and 140)`];
  }
  return [];
}

/** Every value of `key` that two or more Rings share, with the file positions holding it. */
function duplicates(rings: WireRing[], key: (r: WireRing) => number): Map<number, number[]> {
  const at = new Map<number, number[]>();
  rings.forEach((r, i) => at.set(key(r), [...(at.get(key(r)) ?? []), i]));
  return new Map([...at].filter(([, is]) => is.length > 1));
}

/** The refusals that need no fixture: indices, corners, shape, wall height and solved forms, one line each. */
function inputRefusals(input: BuildingShellInputV1, snapped: SnappedCorners[], name: string): string[] {
  const out: string[] = [];
  if (!name.trim()) out.push('the dump has an empty subject: a fixture needs a name (journal decision 143)');
  input.rings.forEach((r, i) => {
    for (const field of ['ringIndex', 'modelIndex'] as const) {
      if (r[field] === -1) out.push(`${label(r, i)} has ${field} -1, the USTRUCT default for an unset index: the file does not write it (journal decision 140)`);
    }
  });
  for (const [k, is] of duplicates(input.rings, r => r.modelIndex)) {
    if (k !== -1) out.push(`Rings at file positions ${is.join(', ')} share model index ${k}; the conflict rule needs a unique key per Ring (journal decision 128)`);
  }
  for (const [k, is] of duplicates(input.rings, r => r.ringIndex)) {
    if (k !== -1) out.push(`Rings at file positions ${is.join(', ')} share ring index ${k}; root order needs a unique index per Ring`);
  }
  input.rings.forEach((r, i) => {
    const at = label(r, i);
    out.push(...snapped[i].errors);
    if (!snapped[i].errors.length) out.push(...ringShapeErrors(snapped[i].corners, at));
    const w = r.wallHeightCm;
    if (w !== 0 && Math.abs(w - input.storeyHeightCm) > SHELL_TOLERANCE_CM) {
      out.push(`${at} overrides its wall height to ${w} cm, which differs from the building's storey height ${input.storeyHeightCm} cm (journal decision 126)`);
    }
    r.sides.forEach((s, j) => {
      const reading = SIDE_READINGS[s.solved.form];
      if (reading.kind === 'refused') out.push(`${at} side ${j} has ${reading.reason}`);
      const p = s.solved.pitchDegrees;
      if (s.solved.form === 'Pitched' && !(p >= WIRE_MIN_PITCH_DEG && p <= WIRE_MAX_PITCH_DEG)) {
        out.push(`${at} side ${j} is solved Pitched at ${p} degrees, outside [${WIRE_MIN_PITCH_DEG}, ${WIRE_MAX_PITCH_DEG}] (journal decisions 143 and 144)`);
      }
    });
  });
  return out;
}

/** Journal decision 126: a file whose model-index order and ring (root) order disagree is flagged, not refused. */
function orderFlags(input: BuildingShellInputV1): string[] {
  const byModel = [...input.rings].sort((a, b) => a.modelIndex - b.modelIndex).map(r => r.ringIndex);
  const byRoot = [...input.rings].sort((a, b) => a.ringIndex - b.ringIndex).map(r => r.ringIndex);
  if (byModel.join(',') === byRoot.join(',')) return [];
  return [`model-index order and ring (root) order disagree: by model index the ring indices run ${byModel.join(', ')}; the conflict rule keys on the model index (journal decision 126)`];
}

/** One wire side as read: where it lies on the Ring, and how it enters the fixture. */
export interface ReadSide { slot: number; compass: RingSide; side: WireSide }

/** A wire Ring's sides by compass side, from its snapped corners. */
function readSides(r: WireRing, corners: WireVec2[], rect: Rect): ReadSide[] {
  return r.sides.map((side, slot) => ({slot, side, compass: compassOf(corners[slot], corners[(slot + 1) % RING_CORNERS], rect)}));
}

/**
 * Journal decision 140, F1 and F4: a wire Ring's `defaultDeg` is the solved pitch of its first Pitched side in compass
 * order (S, E, N, W), or `WIRE_GABLE_ONLY_DEG` with no Pitched side. It never depends on the Ring's start corner.
 */
export function wireDefaultDeg(sides: ReadSide[]): number {
  for (const c of RING_SIDES) {
    const s = sides.find(x => x.compass === c);
    if (s?.side.solved.form === 'Pitched') return s.side.solved.pitchDegrees;
  }
  return WIRE_GABLE_ONLY_DEG;
}

/** One wire Ring as a `FixtureRing`: Pitched sides listed as hips at their pitch, GableEnd as gables, None unlisted. */
function fixtureRing(r: WireRing, sides: ReadSide[], rect: Rect): FixtureRing {
  const out: RingSides = {};
  for (const {compass, side} of sides) {
    const reading = SIDE_READINGS[side.solved.form];
    if (reading.kind !== 'listed') continue;
    out[compass] = reading.form === 'hip' ? {form: 'hip', deg: side.solved.pitchDegrees} : {form: 'gable'};
  }
  return {rect, baseStorey: r.baseStorey, storeys: r.storeys, defaultDeg: wireDefaultDeg(sides), sides: out};
}

/**
 * Whether an error is one of the plan refusals the build would also throw (decisions 142, N6, and 146): the pipeline's
 * named `PlanRefusal`, from `storeyLoops` and `unionWallForms`.
 */
export const isPlanRefusal = (e: unknown): e is PlanRefusal => e instanceof PlanRefusal;

/** A None side of one fixture Ring, with its file label. */
export interface NoneSide { ring: number; compass: RingSide; text: string }

/**
 * Journal decision 140, F2: a None side that wins a union wall is refused, since its form there is undefined. The
 * winner is read by spec decision 3's own rule (`unionWallForms`) on a probe fixture in which each None side is listed
 * as a hip at a unique negative sentinel pitch: a wall that takes a sentinel was won by that side. A storey whose plan
 * the pipeline refuses (`isPlanRefusal`) is left to the build, which refuses it too; any other error is rethrown
 * (decision 142, N6).
 */
export function noneWinnerRefusals(f: ShellFixture, nones: NoneSide[]): string[] {
  if (!nones.length) return [];
  const probe: ShellFixture = {
    ...f,
    rings: f.rings.map((r, i) => {
      const sides: RingSides = {...r.sides};
      nones.forEach((n, k) => { if (n.ring === i) sides[n.compass] = {form: 'hip', deg: -(k + 1)}; });
      return {...r, sides};
    }),
  };
  const out: string[] = [];
  for (const storey of storeysOf(probe)) {
    const rings = storeyRings(probe, storey);
    let walls;
    try {
      walls = unionWallForms(rings, storeyLoops(rings.map(r => r.ring.rect)));
    } catch (e) {
      if (isPlanRefusal(e)) continue;
      throw e;
    }
    for (const w of walls) {
      if (w.deg >= 0) continue;
      out.push(`${nones[-w.deg - 1].text} is solved None but wins the union wall ${w.axis} = ${w.at} [${w.lo}, ${w.hi}] on storey ${storey}, where its form is undefined (journal decision 140)`);
    }
  }
  return out;
}

/** Decisions 136, 137 and 140: what each side carries as information. */
function sideInfo(at: string, sides: ReadSide[], defaultDeg: number): string[] {
  return sides.flatMap(({slot, compass, side}) => {
    const where = `${at} side ${slot} (${compass})`;
    const s = side.solved;
    const out: string[] = [];
    if (side.request !== 'Auto' && side.request !== s.form) out.push(`${where} requests ${side.request} but is solved ${s.form}`);
    if (s.bEmptied) out.push(`${where} is bEmptied`);
    if (s.bOutlineRefused) out.push(`${where} is bOutlineRefused`);
    if (s.form === 'GableEnd' && s.pitchDegrees !== defaultDeg) out.push(`${where} is a gable solved at ${s.pitchDegrees} degrees; the shell builds it at the Ring's default ${defaultDeg}`);
    return out;
  });
}

/** Reads one parsed JSON value as `input@1`: the fixture named `name` it builds, or every reason it is refused. */
export function readInput(json: unknown, name: string): ReadInputResult {
  const refined = refineInput(json);
  if (!refined.ok) return refined;
  const input = refined.value;
  const snapped = input.rings.map((r, i) => snapCorners(r, label(r, i)));
  const errors = inputRefusals(input, snapped, name);
  if (errors.length) return {ok: false, errors};

  const order = input.rings.map((_, i) => i).sort((a, b) => input.rings[a].modelIndex - input.rings[b].modelIndex);
  const info: string[] = [];
  const nones: NoneSide[] = [];
  const rings = order.map((i, position) => {
    const r = input.rings[i];
    const corners = snapped[i].corners;
    const xs = corners.map(c => c.x), ys = corners.map(c => c.y);
    const rect: Rect = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    const sides = readSides(r, corners, rect);
    const ring = fixtureRing(r, sides, rect);
    info.push(...sideInfo(label(r, i), sides, ring.defaultDeg));
    for (const s of sides) if (s.side.solved.form === 'None') nones.push({ring: position, compass: s.compass, text: `${label(r, i)} side ${s.slot} (${s.compass})`});
    return ring;
  });
  const fixture: ShellFixture = {name, cellSize: input.cellSizeCm, storeyHeight: input.storeyHeightCm, rings};
  const noneErrors = noneWinnerRefusals(fixture, nones);
  if (noneErrors.length) return {ok: false, errors: noneErrors};
  const maxCornerDriftCm = Math.max(0, ...snapped.map(s => s.drift));
  if (maxCornerDriftCm > 0) info.push(`the largest corner drift snapped is ${maxCornerDriftCm} cm`);
  return {ok: true, input, fixture, report: {flags: orderFlags(input), info, maxCornerDriftCm}};
}

/** The provenance of a file the prototype writes from its own fixture: fixed, so a re-export is byte-identical. */
export const prototypeProvenance = (subject: string): WireProvenance => ({
  gameBuild: 'prototype @proc-geo/building-shell',
  sessionId: 'fixture-export',
  timestamp: '2026-11-08T00:00:00Z',
  subject,
  location: {x: 0, y: 0, z: 0},
  rotation: {x: 0, y: 0, z: 0},
  scale: {x: 1, y: 1, z: 1},
});

/** One fixture side as a wire side: `Auto` where the fixture lists none, the side's form where it does. */
function wireSide(ring: FixtureRing, side: RingSide): WireSide {
  const s = ring.sides?.[side];
  const form = WIRE_FORMS[s?.form ?? 'hip'];
  return {request: s ? form : 'Auto', solved: {form, pitchDegrees: s?.deg ?? ring.defaultDeg, bEmptied: false, bOutlineRefused: false}};
}

/**
 * A fixture as `input@1`, every field written, as the C++ exporter writes them. Corners run in the prototype's
 * canonical order, (x0,y0), (x1,y0), (x1,y1), (x0,y1), positive in signed area, so side 0 is y = y0 (decision 126).
 * The fixture's ring index is both the ring index and the model index. No Ring overrides its wall height.
 */
export function writeInput(f: ShellFixture, provenance: WireProvenance = prototypeProvenance(f.name)): BuildingShellInputV1 {
  return {
    schemaVersion: INPUT_SCHEMA_VERSION,
    frame: INPUT_FRAME,
    storeyHeightCm: f.storeyHeight,
    cellSizeCm: f.cellSize,
    rings: f.rings.map((ring, i) => {
      const [x0, y0, x1, y1] = ring.rect;
      return {
        ringIndex: i,
        modelIndex: i,
        baseStorey: ring.baseStorey,
        storeys: ring.storeys,
        wallHeightCm: 0,
        corners: [{x: x0, y: y0}, {x: x1, y: y0}, {x: x1, y: y1}, {x: x0, y: y1}],
        sides: RING_SIDES.map(side => wireSide(ring, side)),
      };
    }),
    provenance,
  };
}
