// Journal decisions 138 (B1) and 142 (N1, B4, N5): the stand-in's drift guards. Every check here is a TYPE, so this
// test RELIES ON `typecheck` (`tsc -p tsconfig.json --noEmit`, which includes tests/): vitest strips the types, and
// its run only confirms the module loads and the runtime halves hold. A drift fails `typecheck`, not vitest.
//
// The refined input type must equal the generated type made deeply required, strictly, on every key and value type,
// so an added, dropped or `any`-typed field fails. The two pinned literals are checked apart, two ways. This is NOT
// decision 125's output check, which waits on the port's output structs (decision 126).
import type {z} from 'zod';
import {describe, expect, it} from 'vitest';
import {RING_SIDES} from '../src/fixture.ts';
import type {ShellKind} from '../src/tags.ts';
import {INPUT_USTRUCT_DEFAULTS} from '../src/wire/building-shell-input-defaults.ts';
import {FBuildingShellInputSchema} from '../src/wire/building-shell-input-schema.zod.ts';
import {CanonicalFace, SHELL_KINDS} from '../src/wire/canonical.ts';
import {CanonicalFaceSchema} from '../src/wire/canonical-output-schema.ts';
import {BuildingShellInputV1, INPUT_FRAME, INPUT_SCHEMA_VERSION, RING_CORNERS, refineInput} from '../src/wire/input-types.ts';
import {BuildingShellInputV1Schema, RingV1Schema} from '../src/wire/refinements/building-shell-input.ts';

type DeepRequired<T> = T extends readonly (infer U)[]
  ? DeepRequired<U>[]
  : T extends object ? {[K in keyof T]-?: DeepRequired<NonNullable<T[K]>>} : T;

/** Strict type equality: false for `any` against anything but `any`, and for any key or modifier that differs. */
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

/** Flattens intersections and mapped types to one object type at every depth, so `Equal` compares shapes, not spellings. */
type Flat<T> = T extends readonly (infer U)[] ? Flat<U>[] : T extends object ? {[K in keyof T]: Flat<T[K]>} : T;

type Generated = Flat<DeepRequired<z.output<typeof FBuildingShellInputSchema>>>;
type Refined = Flat<BuildingShellInputV1>;
type Pinned = 'schemaVersion' | 'frame';

const sameShape: Equal<Omit<Generated, Pinned>, Omit<Refined, Pinned>> = true;
const sameKeys: Equal<keyof Generated, keyof Refined> = true;
const versionPinned: Equal<Refined['schemaVersion'], 1> = true;
const versionConstant: Equal<typeof INPUT_SCHEMA_VERSION, Refined['schemaVersion']> = true;
const versionGenerated: Equal<Generated['schemaVersion'], number> = true;
const framePinned: Equal<Refined['frame'], 'UE actor-local, cm, Z up, left-handed'> = true;
const frameConstant: Equal<typeof INPUT_FRAME, Refined['frame']> = true;
const frameGenerated: Equal<Generated['frame'], string> = true;

/** Decision 142, B4: the output's face schema and `CanonicalFace`, strictly equal. */
const faceSchema: Equal<Flat<z.output<typeof CanonicalFaceSchema>>, Flat<CanonicalFace>> = true;

/** Decisions 142, N5, and 147, N7: `SHELL_KINDS` (tags.ts's one list) and `ShellKind`, equal both ways. */
const shellKinds: Equal<(typeof SHELL_KINDS)[number], ShellKind> = true;

/** Decision 147, N5: the canary. `Equal` rejects `any`, so a drift that types a field `any` cannot pass. */
const anyCanary: Equal<any, number> = false; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Decision 142, N5: four corners, one per compass side. */
const fourCorners: Equal<typeof RING_CORNERS, 4> = true;

describe('the stand-in drift guards (relies on typecheck)', () => {
  it('compiles every strict type equality: refined against generated, pinned literals, faces, kinds and corners', () => {
    const checks = [sameShape, sameKeys, versionPinned, versionConstant, versionGenerated, framePinned, frameConstant, frameGenerated, faceSchema, shellKinds, fourCorners];
    expect(checks.every(c => c === true)).toBe(true);
    expect(anyCanary).toBe(false);
  });

  it('pins the literals the prototype names, and defaults omitted ones to them (decision 140, F7)', () => {
    expect(BuildingShellInputV1Schema.shape.schemaVersion.parse(undefined)).toBe(INPUT_SCHEMA_VERSION);
    expect(BuildingShellInputV1Schema.shape.frame.parse(undefined)).toBe(INPUT_FRAME);
    expect(INPUT_USTRUCT_DEFAULTS.FBuildingShellInput.schemaVersion).toBe(INPUT_SCHEMA_VERSION);
    expect(INPUT_USTRUCT_DEFAULTS.FBuildingShellInput.frame).toBe(INPUT_FRAME);
    expect(refineInput({schemaVersion: 2}).ok).toBe(false);
  });

  it('takes exactly RING_CORNERS corners and sides, one per compass side (decision 142, N5)', () => {
    expect(RING_CORNERS).toBe(RING_SIDES.length);
    const lengths = (n: number) => [RingV1Schema.shape.corners.safeParse(new Array(n).fill({x: 0, y: 0})).success, RingV1Schema.shape.sides.safeParse(new Array(n).fill({})).success];
    expect([RING_CORNERS - 1, RING_CORNERS, RING_CORNERS + 1].map(lengths)).toEqual([[false, false], [true, true], [false, false]]);
  });
});
