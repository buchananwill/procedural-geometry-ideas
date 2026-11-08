// STAND-IN, HAND-WRITTEN: the refinement layer over `building-shell-input-schema.zod.ts` (journal decision 127).
//
// Every generated field is `.optional()` by design. Required-field policy lives here, in the place the UE repo
// establishes for it (`generated-interop/src/refinements/<family>.ts`): each schema below is its generated twin with
// every field required, plus the shape rules the generator cannot state (int32 fields are integers, a Ring has four
// corners and four sides, `schemaVersion` is pinned). The prototype vendors the UE refinement alongside the generated
// file once both exist; until then this file stands in for it.
//
// Shape only. What the prototype refuses on meaning (a Ring that is not a rectangle, a solved Monopitch, a differing
// wall height, duplicate model indices) is the adapter's (`input-adapter.ts`), since it is the prototype's policy and
// not the wire's.
import {z} from 'zod';
import {
  FBuildingShellInputSchema, FCellNetRingStoreysSchema, FModularRoofRunSchema, FShellWireProvenanceSchema,
  FShellWireQuatSchema, FShellWireRingSchema, FShellWireSideSchema, FShellWireTransformSchema, FShellWireVec2Schema,
  FShellWireVec3Schema,
} from '../building-shell-input-schema.zod.ts';

/** The `schemaVersion` this prototype reads and writes (journal decision 127: the prototype pins its value). */
export const INPUT_SCHEMA_VERSION = 1;

/** Journal decision 126: the frame every file's numbers are in. Geometry is never converted. */
export const INPUT_FRAME = 'UE actor-local, cm, Z up, left-handed';

/** A wire Ring has exactly four corners and four sides (journal decision 126). */
export const RING_CORNERS = 4;

const int32 = z.int32();

export const Vec2 = FShellWireVec2Schema.required();
export const Vec3 = FShellWireVec3Schema.required();
export const Quat = FShellWireQuatSchema.required();
export const Transform = FShellWireTransformSchema.required().extend({translation: Vec3, rotation: Quat, scale3D: Vec3});
export const Provenance = FShellWireProvenanceSchema.required().extend({actorTransform: Transform});
export const RoofRun = FModularRoofRunSchema.required();
export const Side = FShellWireSideSchema.required().extend({solved: RoofRun});
export const RingStoreys = FCellNetRingStoreysSchema.required().extend({
  baseStorey: int32.nonnegative(),
  storeys: int32.positive(),
  wallHeightCm: z.number().nonnegative(),
});
export const Ring = FShellWireRingSchema.required().extend({
  ringIndex: int32.nonnegative(),
  modelIndex: int32.nonnegative(),
  corners: z.array(Vec2).length(RING_CORNERS),
  storeys: RingStoreys,
  sides: z.array(Side).length(RING_CORNERS),
});

/** `building-shell/input@1` with every field required: what the adapter reads. */
export const BuildingShellInputV1Schema = FBuildingShellInputSchema.required().extend({
  schemaVersion: z.literal(INPUT_SCHEMA_VERSION),
  frame: z.literal(INPUT_FRAME),
  provenance: Provenance,
  storeyHeightCm: z.number().positive(),
  cellSizeCm: z.number().positive(),
  rings: z.array(Ring).min(1),
});

export type BuildingShellInputV1 = z.infer<typeof BuildingShellInputV1Schema>;
export type WireRing = z.infer<typeof Ring>;
export type WireSide = z.infer<typeof Side>;
export type WireVec2 = z.infer<typeof Vec2>;
export type WireProvenance = z.infer<typeof Provenance>;
export type WireRoofForm = WireSide['solved']['form'];
export type WireRequest = WireSide['request'];

/** The result of refining a parsed JSON value: the required shape, or every issue found, one line each. */
export type RefineResult = {ok: true; value: BuildingShellInputV1} | {ok: false; errors: string[]};

/** One Zod issue as a line naming its path. */
const issueLine = (i: z.core.$ZodIssue): string => `${i.path.length ? i.path.join('.') : '(root)'}: ${i.message}`;

/** Tightens any JSON value to `input@1`'s required shape. */
export function refineInput(json: unknown): RefineResult {
  const r = BuildingShellInputV1Schema.safeParse(json);
  return r.success ? {ok: true, value: r.data} : {ok: false, errors: r.error.issues.map(issueLine)};
}
