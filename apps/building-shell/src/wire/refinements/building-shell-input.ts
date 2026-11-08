// STAND-IN, HAND-WRITTEN: the refinement layer over `building-shell-input-schema.zod.ts` (journal decisions 127,
// 137, 138 and 140). Schemas only: the vendored UE refinement will overwrite this file (decision 138, B2), so every
// prototype-owned constant, type and function lives in `../input-types.ts`.
//
// Every generated field is `.optional()` by design. Here each one is required in the output and, like the C++ import
// codec, an omitted field takes its USTRUCT default (`../building-shell-input-defaults.ts`, decision 140's F7). Each
// default is a `prefault`, parsed like a written value, so an omitted field is checked exactly as its default would be.
// The refinement adds the shape rules the generator cannot state: int32 fields are integers, a Ring has four corners
// and four sides, and `schemaVersion` and `frame` are pinned. `ringIndex` and `modelIndex` admit their unset
// sentinel -1, so the adapter can refuse it by name. Each struct lists its keys again, so a key that drifts from the
// generated file fails `typecheck` (tests/wire-types.test.ts, decision 138's B1).
import {z} from 'zod';
import {INPUT_USTRUCT_DEFAULTS as D} from '../building-shell-input-defaults.ts';
import {EModularRoofFormSchema, ERoofSideRequestSchema} from '../building-shell-input-schema.zod.ts';

const int32 = z.int32();

export const Vec2V1Schema = z.strictObject({
  x: z.number().prefault(D.FShellWireVec2.x),
  y: z.number().prefault(D.FShellWireVec2.y),
});

export const Vec3V1Schema = z.strictObject({
  x: z.number().prefault(D.FShellWireVec3.x),
  y: z.number().prefault(D.FShellWireVec3.y),
  z: z.number().prefault(D.FShellWireVec3.z),
});

/** `provenance.scale`, whose USTRUCT default is {1, 1, 1}. */
export const ScaleV1Schema = z.strictObject({
  x: z.number().prefault(D.FShellWireScale.x),
  y: z.number().prefault(D.FShellWireScale.y),
  z: z.number().prefault(D.FShellWireScale.z),
});

export const ProvenanceV1Schema = z.strictObject({
  gameBuild: z.string().prefault(D.FShellWireProvenance.gameBuild),
  sessionId: z.string().prefault(D.FShellWireProvenance.sessionId),
  timestamp: z.string().prefault(D.FShellWireProvenance.timestamp),
  subject: z.string().prefault(D.FShellWireProvenance.subject),
  location: Vec3V1Schema.prefault({}),
  rotation: Vec3V1Schema.prefault({}),
  scale: ScaleV1Schema.prefault({}),
});

export const SolvedRunV1Schema = z.strictObject({
  form: EModularRoofFormSchema.prefault(D.FShellWireSolvedRun.form),
  pitchDegrees: z.number().prefault(D.FShellWireSolvedRun.pitchDegrees),
  bEmptied: z.boolean().prefault(D.FShellWireSolvedRun.bEmptied),
  bOutlineRefused: z.boolean().prefault(D.FShellWireSolvedRun.bOutlineRefused),
});

export const SideV1Schema = z.strictObject({
  request: ERoofSideRequestSchema.prefault(D.FShellWireSide.request),
  solved: SolvedRunV1Schema.prefault({}),
});

export const RingV1Schema = z.strictObject({
  ringIndex: int32.min(-1).prefault(D.FShellWireRing.ringIndex),
  modelIndex: int32.min(-1).prefault(D.FShellWireRing.modelIndex),
  baseStorey: int32.nonnegative().prefault(D.FShellWireRing.baseStorey),
  storeys: int32.positive().prefault(D.FShellWireRing.storeys),
  wallHeightCm: z.number().nonnegative().prefault(D.FShellWireRing.wallHeightCm),
  corners: z.array(Vec2V1Schema).length(4).prefault([]),
  sides: z.array(SideV1Schema).length(4).prefault([]),
});

/** `building-shell/input@1` with every field present: what the adapter reads. */
export const BuildingShellInputV1Schema = z.strictObject({
  schemaVersion: z.literal(1).prefault(D.FBuildingShellInput.schemaVersion),
  frame: z.literal('UE actor-local, cm, Z up, left-handed').prefault(D.FBuildingShellInput.frame),
  storeyHeightCm: z.number().positive().prefault(D.FBuildingShellInput.storeyHeightCm),
  cellSizeCm: z.number().positive().prefault(D.FBuildingShellInput.cellSizeCm),
  rings: z.array(RingV1Schema).min(1).prefault([]),
  provenance: ProvenanceV1Schema.prefault({}),
});
