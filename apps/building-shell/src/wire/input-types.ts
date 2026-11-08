// The prototype's own input@1 surface (journal decision 138, B2): its constants, its types (each a `z.output` of a
// refined schema, as decision 125 asks), and refinement as a function. The refinement file holds schemas only, since
// the vendored UE refinement will overwrite it. Browser-safe.
import type {z} from 'zod';
import {RING_SIDES} from '../fixture.ts';
import {
  BuildingShellInputV1Schema, ProvenanceV1Schema, RingV1Schema, SideV1Schema, Vec2V1Schema,
} from './refinements/building-shell-input.ts';

export type BuildingShellInputV1 = z.output<typeof BuildingShellInputV1Schema>;

/**
 * The `schemaVersion` this prototype reads and writes (decision 127: the prototype pins its value), typed from the
 * refined schema (decision 142, N2).
 */
export const INPUT_SCHEMA_VERSION: BuildingShellInputV1['schemaVersion'] = 1;

/** Decision 126: the frame every file's numbers are in, typed from the refined schema. Geometry is never converted. */
export const INPUT_FRAME: BuildingShellInputV1['frame'] = 'UE actor-local, cm, Z up, left-handed';

/**
 * A wire Ring has one corner per side, four (decision 126), derived from the compass sides (decision 142, N5).
 * tests/wire-types.test.ts checks the refinement's array lengths against it.
 */
export const RING_CORNERS: typeof RING_SIDES.length = RING_SIDES.length;

/**
 * Journal decision 143, F4: a Pitched side's solved pitch must lie in [WIRE_MIN_PITCH_DEG, WIRE_MAX_PITCH_DEG], or
 * it is refused. The open range (0, 90) admitted pitches that crash the build. Decision 144 narrowed the floor from 5°
 * to 7°: WP3.7's sweep found narrow failing pockets between 5.86° and 6.9°, and is green from 6.91° to 75°. Content's
 * own pitches are 22.5°, 30° and 45°.
 */
export const WIRE_MIN_PITCH_DEG = 7;
export const WIRE_MAX_PITCH_DEG = 75;

/**
 * Spec decision 16 as amended (journal decision 137): the wire format's corner slack, the second exception to
 * `SHELL_TOLERANCE_CM`. A corner within it of the 1/1024 cm grid is snapped by `snapCm`; one beyond it is refused.
 */
export const WIRE_CORNER_SNAP_CM = 1e-6;

/**
 * Journal decision 140, F4: the `defaultDeg` of a wire Ring with no Pitched side. In range by construction, and read
 * only by its unlisted sides (decision 153): a gable carries its own run's pitch.
 */
export const WIRE_GABLE_ONLY_DEG = 45;

export type WireRing = z.output<typeof RingV1Schema>;
export type WireSide = z.output<typeof SideV1Schema>;
export type WireVec2 = z.output<typeof Vec2V1Schema>;
export type WireProvenance = z.output<typeof ProvenanceV1Schema>;
/** One solved run along a side (decision 149). */
export type WireRun = WireSide['runs'][number];
export type WireSolvedForm = WireRun['form'];
export type WireRequest = WireSide['request'];

/** A file refused, with every reason found, one line each. */
export interface RefusedInput { ok: false; errors: string[] }

/** A parsed JSON value tightened to input@1's required shape. */
export interface RefinedInput { ok: true; value: BuildingShellInputV1 }

export type RefineResult = RefinedInput | RefusedInput;

/** One Zod issue as a line naming its path. */
export const issueLine = (i: z.core.$ZodIssue): string => `${i.path.length ? i.path.join('.') : '(root)'}: ${i.message}`;

/** Tightens any JSON value to input@1's required shape, omitted fields at their USTRUCT defaults. */
export function refineInput(json: unknown): RefineResult {
  const r = BuildingShellInputV1Schema.safeParse(json);
  return r.success ? {ok: true, value: r.data} : {ok: false, errors: r.error.issues.map(issueLine)};
}
