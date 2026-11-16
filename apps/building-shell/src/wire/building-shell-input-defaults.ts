// STAND-IN, HAND-WRITTEN, beside `building-shell-input-schema.zod.ts`: the USTRUCT default of every input@1 field,
// in one table (journal decision 140, F7, as the port lead pinned it).
//
// The refinement mirrors the C++ import codec: a field a file omits keeps its USTRUCT default. The C++ exporter writes
// every field, so only a hand-written file omits one. The general rule is 0 for numbers, false for bools, "" for
// strings, [] for arrays and an enum's first member, and a nested struct is default-constructed. The exceptions are
// `schemaVersion` 1, `frame` its one literal, `ringIndex` and `modelIndex` -1 (the unset sentinel, which the adapter
// refuses), `storeys` 1, and `provenance.scale` {1, 1, 1}.

export const INPUT_USTRUCT_DEFAULTS = {
  FShellWireVec2: {x: 0, y: 0},
  FShellWireVec3: {x: 0, y: 0, z: 0},
  /** `provenance.scale` only. */
  FShellWireScale: {x: 1, y: 1, z: 1},
  FShellWireProvenance: {gameBuild: '', sessionId: '', timestamp: '', subject: ''},
  FShellWireSolvedRun: {startCm: 0, endCm: 0, form: 'None', pitchDegrees: 0, bEmptied: false, bOutlineRefused: false, maxHeightCm: 0, facing: 'CentreLine', bStandsApart: false},
  FShellWireSide: {request: 'Auto'},
  FShellWireRing: {ringIndex: -1, modelIndex: -1, baseStorey: 0, storeys: 1, wallHeightCm: 0},
  FBuildingShellInput: {schemaVersion: 1, frame: 'UE actor-local, cm, Z up, left-handed', storeyHeightCm: 0, cellSizeCm: 0},
} as const;
