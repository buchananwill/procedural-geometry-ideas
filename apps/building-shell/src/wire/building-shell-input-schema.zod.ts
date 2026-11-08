// STAND-IN, HAND-WRITTEN. Not generated.
//
// Journal decisions 125 to 127: the wire format's schemas are generated from the C++ port's wire USTRUCTs by the UE
// project's Zod generator (`PistePerfectEditor/Interop/ZodSchemaGenerator.cpp`), one `<family>-schema.zod.ts` per
// family. Those USTRUCTs arrive with the port's first increment and do not exist yet, so this file stands in for the
// generated one, written to the generator's mapping as journal F47 records it:
// - a USTRUCT is a `z.strictObject`, a UENUM a `z.enum`, a TArray a `z.array`;
// - field names are camelCased;
// - every field is `.optional()`, on purpose: a field the import codec omits stays at its C++ default;
// - no `TOptional`: an unset value is explicit (a side's request includes `Auto`; `wallHeightCm` 0 is no override);
// - vectors are explicit `double` fields, never `FVector`.
//
// The generated file replaces this one when it exists, vendored with a header naming the UE commit and generator
// version. Required-field policy does not live here: see `refinements/building-shell-input.ts`.
import {z} from 'zod';

/** The player's per-wall request: a PlateRun Stroke (journal F46), with `Auto` as the explicit unset value. */
export const ERoofSideRequestSchema = z.enum(['Auto', 'Pitched', 'GableEnd']);

/** `EModularRoofForm` (journal F46), the solved run's form. */
export const EModularRoofFormSchema = z.enum(['None', 'Pitched', 'GableEnd', 'Monopitch', 'Flat']);

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

export const FShellWireQuatSchema = z.strictObject({
  x: z.number().optional(),
  y: z.number().optional(),
  z: z.number().optional(),
  w: z.number().optional(),
});

/** The actor's world transform, carried for provenance only: no geometry is converted by it (journal decision 126). */
export const FShellWireTransformSchema = z.strictObject({
  translation: FShellWireVec3Schema.optional(),
  rotation: FShellWireQuatSchema.optional(),
  scale3D: FShellWireVec3Schema.optional(),
});

/** Journal decision 127: provenance is a nested USTRUCT. */
export const FShellWireProvenanceSchema = z.strictObject({
  gameBuild: z.string().optional(),
  sessionId: z.string().optional(),
  /** ISO 8601. */
  timestamp: z.string().optional(),
  actorTransform: FShellWireTransformSchema.optional(),
});

/** `FModularRoofRun {Form, PitchDegrees}` (journal F46): the solved run of one side. */
export const FModularRoofRunSchema = z.strictObject({
  form: EModularRoofFormSchema.optional(),
  pitchDegrees: z.number().optional(),
});

/** Journal decision 126: per side, both the request and the solve. */
export const FShellWireSideSchema = z.strictObject({
  request: ERoofSideRequestSchema.optional(),
  solved: FModularRoofRunSchema.optional(),
});

/** `FCellNetRingStoreys {BaseStorey, Storeys, WallHeightCm}` (journal F46); `wallHeightCm` 0 is no override. */
export const FCellNetRingStoreysSchema = z.strictObject({
  baseStorey: z.number().optional(),
  storeys: z.number().optional(),
  wallHeightCm: z.number().optional(),
});

/**
 * One Ring: four corners in slot order, side i from corner i to corner i + 1, owned by corner i (journal F46). It
 * carries both its ring index (root order) and its parent `FBuildableComponentModel` index (journal decision 126).
 */
export const FShellWireRingSchema = z.strictObject({
  ringIndex: z.number().optional(),
  modelIndex: z.number().optional(),
  corners: z.array(FShellWireVec2Schema).optional(),
  storeys: FCellNetRingStoreysSchema.optional(),
  sides: z.array(FShellWireSideSchema).optional(),
});

/** `building-shell/input@1`: the building as authored. `schemaVersion` is the int32 first field (journal decision 127). */
export const FBuildingShellInputSchema = z.strictObject({
  schemaVersion: z.number().optional(),
  /** Journal decision 126: the frame the file's numbers are in, declared. */
  frame: z.string().optional(),
  provenance: FShellWireProvenanceSchema.optional(),
  storeyHeightCm: z.number().optional(),
  cellSizeCm: z.number().optional(),
  rings: z.array(FShellWireRingSchema).optional(),
});

export type FBuildingShellInput = z.infer<typeof FBuildingShellInputSchema>;
