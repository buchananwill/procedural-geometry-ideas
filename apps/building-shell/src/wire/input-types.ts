// The prototype's own input@1 surface (journal decision 138, B2): its constants, its types (each a `z.output` of a
// refined schema, as decision 125 asks), and refinement as a function. The refinement file holds schemas only, since
// the vendored UE refinement will overwrite it. Browser-safe.
import type {z} from 'zod';
import {
  BuildingShellInputV1Schema, ProvenanceV1Schema, RingV1Schema, SideV1Schema, Vec2V1Schema,
} from './refinements/building-shell-input.ts';

/** The `schemaVersion` this prototype reads and writes (decision 127: the prototype pins its value). */
export const INPUT_SCHEMA_VERSION = 1;

/** Decision 126: the frame every file's numbers are in. Geometry is never converted. */
export const INPUT_FRAME = 'UE actor-local, cm, Z up, left-handed';

/** A wire Ring has exactly four corners and four sides (decision 126). */
export const RING_CORNERS = 4;

/**
 * Spec decision 16 as amended (journal decision 137): the wire format's corner slack, the second exception to
 * `SHELL_TOLERANCE_CM`. A corner within it of the 1/1024 cm grid is snapped by `snapCm`; one beyond it is refused.
 */
export const WIRE_CORNER_SNAP_CM = 1e-6;

/**
 * Journal decision 140, F4: the `defaultDeg` of a wire Ring with no Pitched side. In range by construction, and read
 * only by a gable side and a courtyard cut collinear with no wall.
 */
export const WIRE_GABLE_ONLY_DEG = 45;

export type BuildingShellInputV1 = z.output<typeof BuildingShellInputV1Schema>;
export type WireRing = z.output<typeof RingV1Schema>;
export type WireSide = z.output<typeof SideV1Schema>;
export type WireVec2 = z.output<typeof Vec2V1Schema>;
export type WireProvenance = z.output<typeof ProvenanceV1Schema>;
export type WireSolvedForm = WireSide['solved']['form'];
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
