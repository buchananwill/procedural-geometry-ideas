// STAND-IN, HAND-WRITTEN. Not generated.
//
// Journal decisions 125 to 127 and 137 to 139: the wire format's schemas are generated from the C++ port's wire
// USTRUCTs by the UE project's Zod generator (`PistePerfectEditor/Interop/ZodSchemaGenerator.cpp`), one
// `<family>-schema.zod.ts` per family. Those USTRUCTs arrive with the port's first increment, so this file stands in
// for the generated one. It is written to the generator's mapping as journal F47 and decisions 137 and 138 record it:
// - a USTRUCT is a `z.strictObject`, a UENUM a `z.enum` of its bare member names in declaration order, a TArray a
//   `z.array`;
// - every key is `FJsonObjectConverter::StandardizeCase` of its UE name: the first letter lowercased, "ID" as "Id",
//   so `bEmptied` stays `bEmptied`;
// - every field is `.optional()`, on purpose: a field the import codec omits keeps its USTRUCT default
//   (`building-shell-input-defaults.ts`);
// - no `TOptional`, and vectors are explicit `double` fields, never `FVector`.
//
// The keys follow the C++ input@1 spec, MB.D507 (decision 139). The generated module stays authoritative: the port
// lead reports any difference once it is built. This file exports schemas only, as the generator does.
import {z} from 'zod';

/** The player's per-wall request, a PlateRun Stroke (journal F46), `Auto` first as the explicit unset value. */
export const ERoofSideRequestSchema = z.enum(['Auto', 'Pitched', 'GableEnd']);

/** `EModularRoofForm` (journal F46), in its declaration order. */
export const EModularRoofFormSchema = z.enum(['None', 'Pitched', 'GableEnd', 'Monopitch', 'Flat']);

/**
 * Per-stretch gable settings decisions 5 and 12: how a gable run's rise tests the gables facing it, in the prototype's
 * order, `CentreLine` first as the default (an enum's first member, as for every UENUM here).
 */
export const EGableFacingSchema = z.enum(['CentreLine', 'Whole', 'Split']);

/** A plan point in actor-local cm. */
export const FShellWireVec2Schema = z.strictObject({
  x: z.number().optional(),
  y: z.number().optional(),
});

export const FShellWireVec3Schema = z.strictObject({
  x: z.number().optional(),
  y: z.number().optional(),
  z: z.number().optional(),
});

/**
 * Decision 139: provenance only, never used to convert geometry (decision 126). `timestamp` is ISO 8601 UTC,
 * `rotation` is in degrees, and `subject` names the dump.
 */
export const FShellWireProvenanceSchema = z.strictObject({
  gameBuild: z.string().optional(),
  sessionId: z.string().optional(),
  timestamp: z.string().optional(),
  subject: z.string().optional(),
  location: FShellWireVec3Schema.optional(),
  rotation: FShellWireVec3Schema.optional(),
  scale: FShellWireVec3Schema.optional(),
});

/**
 * One solved run along a side: `FModularRoofRun {Form, PitchDegrees}` (journal F46), the stretch of the side it covers
 * (decision 149: `startCm` to `endCm`, each measured along the side from its corner i), the two booleans the
 * port's exporter writes for a run the solve did not solve (decision 137), and a GableEnd run's three settings
 * (per-stretch gable settings decision 12, journal decision 253): its maximum height in cm above the plate (0 for none,
 * the USTRUCT default, since the generator emits no `TOptional`), its facing strategy, and whether it stands apart.
 */
export const FShellWireSolvedRunSchema = z.strictObject({
  startCm: z.number().optional(),
  endCm: z.number().optional(),
  form: EModularRoofFormSchema.optional(),
  pitchDegrees: z.number().optional(),
  bEmptied: z.boolean().optional(),
  bOutlineRefused: z.boolean().optional(),
  maxHeightCm: z.number().optional(),
  facing: EGableFacingSchema.optional(),
  bStandsApart: z.boolean().optional(),
});

/**
 * Journal decisions 126 and 149: per side, the request, and the solve as zero, one or several runs, ordered along the
 * side from corner i. An upper Ring flush on a wall splits that wall's plate run in two; a party wall holds none.
 */
export const FShellWireSideSchema = z.strictObject({
  request: ERoofSideRequestSchema.optional(),
  runs: z.array(FShellWireSolvedRunSchema).optional(),
});

/**
 * One Ring (decision 139): its ring index (root order) and parent `FBuildableComponentModel` index, its storeys flat
 * on the Ring (`wallHeightCm` 0 is no override), and four corners in slot order. Side i runs from corner i to
 * corner i + 1 and is owned by corner i (journal F46).
 */
export const FShellWireRingSchema = z.strictObject({
  ringIndex: z.number().optional(),
  modelIndex: z.number().optional(),
  baseStorey: z.number().optional(),
  storeys: z.number().optional(),
  wallHeightCm: z.number().optional(),
  corners: z.array(FShellWireVec2Schema).optional(),
  sides: z.array(FShellWireSideSchema).optional(),
});

/** `building-shell/input@1`: the building as authored. `schemaVersion` is the int32 first field (decision 127). */
export const FBuildingShellInputSchema = z.strictObject({
  schemaVersion: z.number().optional(),
  frame: z.string().optional(),
  storeyHeightCm: z.number().optional(),
  cellSizeCm: z.number().optional(),
  rings: z.array(FShellWireRingSchema).optional(),
  provenance: FShellWireProvenanceSchema.optional(),
});
