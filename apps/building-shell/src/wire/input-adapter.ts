// `building-shell/input@1` to and from the prototype's Ring-authored `ShellFixture` (spec decisions 1 to 3; journal
// decisions 124 to 128, as amended by 126). Browser-safe: no Node globals.
//
// - Frame: none converted. A file's numbers are UE actor-local cm, and the prototype uses the same numbers and the same
//   counter-clockwise test, so winding agrees (journal decision 126).
// - A Ring is four corners; side i runs from corner i to corner i + 1 and is owned by corner i. Each side is matched to
//   the compass side of the fixture's rect it lies on, so a Ring may start at any corner.
// - The fixture is built from each side's solve, Pitched to hip and GableEnd to gable; the request is carried, not read.
// - Rings are ordered by model index, the key the conflict rule reads (spec decision 3, journal decision 128). A file
//   whose model-index order disagrees with its ring (root) order is accepted and flagged.
import {SHELL_TOLERANCE_CM} from '../constants.ts';
import type {FixtureRing, RingForm, RingSide, RingSides, ShellFixture} from '../fixture.ts';
import type {Rect} from '../roof/model.ts';
import {
  BuildingShellInputV1, INPUT_FRAME, INPUT_SCHEMA_VERSION, RING_CORNERS, WireProvenance, WireRing, WireRoofForm, WireSide,
  WireVec2, refineInput,
} from './refinements/building-shell-input.ts';

/** Spec decision 1 as amended: the compass sides in wire side order, S = side 0, E = 1, N = 2, W = 3. */
export const WIRE_SIDE_ORDER: readonly RingSide[] = ['S', 'E', 'N', 'W'];

/** A file the adapter reads: the fixture it builds, and what the diff report must flag. */
export interface AdaptedInput { ok: true; fixture: ShellFixture; flags: string[]; input: BuildingShellInputV1 }

/** A file the adapter refuses, with every reason found. */
export interface RefusedInput { ok: false; errors: string[] }

export type ReadInputResult = AdaptedInput | RefusedInput;

/** One wire side's form, as a Ring side form, or the reason it is refused. */
function sideForm(form: WireRoofForm): RingForm | string {
  switch (form) {
    case 'Pitched': return 'hip';
    case 'GableEnd': return 'gable';
    case 'Monopitch': return 'a solved Monopitch, refused until mono is supported (journal decision 126)';
    case 'Flat': return 'a solved Flat, which is a polyline clamp, never a run form (journal decision 126)';
    case 'None': return 'no solved run (form None)';
  }
}

/** The compass side the segment `a` to `b` of `rect` lies on. The segment is known axis-aligned and on the rect. */
function compassOf(a: WireVec2, b: WireVec2, rect: Rect): RingSide {
  const [, y0, x1] = rect;
  if (a.y === b.y) return a.y === y0 ? 'S' : 'N';
  return a.x === x1 ? 'E' : 'W';
}

/** Signed plan area of a corner loop: positive counter-clockwise from above. */
const signedArea = (cs: WireVec2[]): number =>
  cs.reduce((s, a, i) => { const b = cs[(i + 1) % cs.length]; return s + a.x * b.y - b.x * a.y; }, 0) / 2;

/**
 * Journal decision 126: a Ring that is not an axis-aligned rectangle is refused, never snapped. Every side must hold
 * exactly one coordinate fixed, exactly, with the sides alternating between the axes; the loop must wind
 * counter-clockwise from above, since a clockwise Ring is what a mirrored frame produces.
 */
function ringShapeErrors(r: WireRing, label: string): string[] {
  const cs = r.corners;
  const notRect = `is not an axis-aligned rectangle (journal decision 126)`;
  const ends = (i: number): [WireVec2, WireVec2] => [cs[i], cs[(i + 1) % RING_CORNERS]];
  /** Which coordinate side i holds fixed, or null when it holds both (degenerate) or neither (oblique). */
  const fixedAxis = (i: number): 'x' | 'y' | null => {
    const [a, b] = ends(i);
    return a.x === b.x && a.y !== b.y ? 'x' : a.y === b.y && a.x !== b.x ? 'y' : null;
  };
  const axes = [0, 1, 2, 3].map(fixedAxis);
  const out = axes.flatMap((ax, i) => {
    const [a, b] = ends(i);
    return ax ? [] : [`${label} side ${i} runs (${a.x}, ${a.y}) to (${b.x}, ${b.y}), not along one axis: the Ring ${notRect}`];
  });
  if (out.length) return out;
  if (axes[0] === axes[1] || axes[1] === axes[2] || axes[2] === axes[3]) return [`${label} has two consecutive sides on one axis: the Ring ${notRect}`];
  if (signedArea(cs) <= 0) return [`${label} winds clockwise from above; a Ring's corners run counter-clockwise (journal decision 126)`];
  return [];
}

/** The rect `[x0, y0, x1, y1]` a valid Ring's corners span. */
function rectOf(cs: WireVec2[]): Rect {
  const xs = cs.map(c => c.x), ys = cs.map(c => c.y);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/** Every value of `key` that two or more Rings share, with the file positions holding it. */
function duplicates(rings: WireRing[], key: (r: WireRing) => number): Map<number, number[]> {
  const at = new Map<number, number[]>();
  rings.forEach((r, i) => at.set(key(r), [...(at.get(key(r)) ?? []), i]));
  return new Map([...at].filter(([, is]) => is.length > 1));
}

/** Every refusal of journal decisions 126 and 128 in one refined file, one line each. */
export function inputRefusals(input: BuildingShellInputV1): string[] {
  const out: string[] = [];
  for (const [k, is] of duplicates(input.rings, r => r.modelIndex)) {
    out.push(`Rings at file positions ${is.join(', ')} share model index ${k}; the conflict rule needs a unique key per Ring (journal decision 128)`);
  }
  for (const [k, is] of duplicates(input.rings, r => r.ringIndex)) {
    out.push(`Rings at file positions ${is.join(', ')} share ring index ${k}; root order needs a unique index per Ring`);
  }
  input.rings.forEach((r, i) => {
    const label = `Ring ${i} (model index ${r.modelIndex})`;
    out.push(...ringShapeErrors(r, label));
    const w = r.storeys.wallHeightCm;
    if (w !== 0 && Math.abs(w - input.storeyHeightCm) > SHELL_TOLERANCE_CM) {
      out.push(`${label} overrides its wall height to ${w} cm, which differs from the building's storey height ${input.storeyHeightCm} cm (journal decision 126)`);
    }
    r.sides.forEach((s, j) => {
      const f = sideForm(s.solved.form);
      if (f !== 'hip' && f !== 'gable') out.push(`${label} side ${j} has ${f}`);
      const p = s.solved.pitchDegrees;
      if (!(p > 0 && p < 90)) out.push(`${label} side ${j} is solved at ${p} degrees, outside (0, 90)`);
    });
  });
  return out;
}

/** Journal decision 126: a file whose model-index order and ring (root) order disagree is flagged, not refused. */
export function inputFlags(input: BuildingShellInputV1): string[] {
  const byModel = [...input.rings].sort((a, b) => a.modelIndex - b.modelIndex).map(r => r.ringIndex);
  const byRoot = [...input.rings].sort((a, b) => a.ringIndex - b.ringIndex).map(r => r.ringIndex);
  if (byModel.join(',') === byRoot.join(',')) return [];
  return [`model-index order and ring (root) order disagree: by model index the ring indices run ${byModel.join(', ')}; the conflict rule keys on the model index (journal decision 126)`];
}

/**
 * One wire Ring as a `FixtureRing`. Every side is listed with its solved form and pitch. The wire carries no Ring
 * default pitch, which the prototype also reads as a courtyard cut's pitch (spec decision 2), so `defaultDeg` is the
 * pitch of the first side in slot order whose request is `Auto`, else side 0's.
 */
function fixtureRing(r: WireRing): FixtureRing {
  const rect = rectOf(r.corners);
  const sides: RingSides = {};
  r.sides.forEach((s, i) => {
    const compass = compassOf(r.corners[i], r.corners[(i + 1) % RING_CORNERS], rect);
    sides[compass] = {form: sideForm(s.solved.form) as RingForm, deg: s.solved.pitchDegrees};
  });
  const auto = r.sides.find(s => s.request === 'Auto') ?? r.sides[0];  return {rect, baseStorey: r.storeys.baseStorey, storeys: r.storeys.storeys, defaultDeg: auto.solved.pitchDegrees, sides};
}

/** Reads one parsed JSON value as `input@1`: the fixture named `name` it builds, or every reason it is refused. */
export function readInput(json: unknown, name: string): ReadInputResult {
  const refined = refineInput(json);
  if (!refined.ok) return refined;
  const input = refined.value;
  const errors = inputRefusals(input);
  if (errors.length) return {ok: false, errors};
  const rings = [...input.rings].sort((a, b) => a.modelIndex - b.modelIndex).map(fixtureRing);
  return {ok: true, input, flags: inputFlags(input), fixture: {name, cellSize: input.cellSizeCm, storeyHeight: input.storeyHeightCm, rings}};
}

/** The provenance of a file the prototype writes from its own fixtures: fixed, so a re-export is byte-identical. */
export const PROTOTYPE_PROVENANCE: WireProvenance = {
  gameBuild: 'prototype @proc-geo/building-shell',
  sessionId: 'fixture-export',
  timestamp: '2026-11-08T00:00:00Z',
  actorTransform: {translation: {x: 0, y: 0, z: 0}, rotation: {x: 0, y: 0, z: 0, w: 1}, scale3D: {x: 1, y: 1, z: 1}},
};

/** One fixture side as a wire side: `Auto` where the fixture lists none, the side's form where it does. */
function wireSide(ring: FixtureRing, side: RingSide): WireSide {
  const s = ring.sides?.[side];
  const form: WireRoofForm = s?.form === 'gable' ? 'GableEnd' : 'Pitched';
  return {request: s ? form : 'Auto', solved: {form, pitchDegrees: s?.deg ?? ring.defaultDeg}};
}

/**
 * A fixture as `input@1`. Corners run in the prototype's canonical order, (x0,y0), (x1,y0), (x1,y1), (x0,y1),
 * counter-clockwise from above, so side 0 is y = y0 (journal decision 126). The fixture's ring index is both the ring
 * index and the model index. No Ring overrides its wall height.
 */
export function writeInput(f: ShellFixture, provenance: WireProvenance = PROTOTYPE_PROVENANCE): BuildingShellInputV1 {
  return {
    schemaVersion: INPUT_SCHEMA_VERSION,
    frame: INPUT_FRAME,
    provenance,
    storeyHeightCm: f.storeyHeight,
    cellSizeCm: f.cellSize,
    rings: f.rings.map((ring, i) => {
      const [x0, y0, x1, y1] = ring.rect;
      return {
        ringIndex: i,
        modelIndex: i,
        corners: [{x: x0, y: y0}, {x: x1, y: y0}, {x: x1, y: y1}, {x: x0, y: y1}],
        storeys: {baseStorey: ring.baseStorey, storeys: ring.storeys, wallHeightCm: 0},
        sides: WIRE_SIDE_ORDER.map(side => wireSide(ring, side)),
      };
    }),
  };
}
