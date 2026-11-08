// Journal decision 138, B1: the stand-in's drift guard, two-way. The refined type must equal the generated type made
// deeply required, on every key and every value type, except the two pinned literals, which are checked apart. A key
// the refinement adds or drops, or a value type it changes, fails `typecheck`.
//
// This is NOT decision 125's output check, which waits on the port's output structs (decision 126). It guards only
// the input refinement against the generated input schema.
import type {z} from 'zod';
import {describe, expect, it} from 'vitest';
import {INPUT_USTRUCT_DEFAULTS} from '../src/wire/building-shell-input-defaults.ts';
import {FBuildingShellInputSchema} from '../src/wire/building-shell-input-schema.zod.ts';
import {BuildingShellInputV1, INPUT_FRAME, INPUT_SCHEMA_VERSION, refineInput} from '../src/wire/input-types.ts';
import {BuildingShellInputV1Schema} from '../src/wire/refinements/building-shell-input.ts';

type DeepRequired<T> = T extends readonly (infer U)[]
  ? DeepRequired<U>[]
  : T extends object ? {[K in keyof T]-?: DeepRequired<NonNullable<T[K]>>} : T;

/** Mutual assignability: neither side has a key, or a value type, the other lacks. */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

type Generated = DeepRequired<z.output<typeof FBuildingShellInputSchema>>;
type Pinned = 'schemaVersion' | 'frame';

const sameKeysAndTypes: Same<Omit<Generated, Pinned>, Omit<BuildingShellInputV1, Pinned>> = true;
const sameTopKeys: Same<keyof Generated, keyof BuildingShellInputV1> = true;
const versionIsGenerated: BuildingShellInputV1['schemaVersion'] extends Generated['schemaVersion'] ? true : false = true;
const frameIsGenerated: BuildingShellInputV1['frame'] extends Generated['frame'] ? true : false = true;

describe('the refinement against the generated schema', () => {
  it('compiles the two-way type check (decision 138, B1)', () => {
    expect([sameKeysAndTypes, sameTopKeys, versionIsGenerated, frameIsGenerated]).toEqual([true, true, true, true]);
  });

  it('pins the literals the prototype names, and defaults omitted ones to them (decision 140, F7)', () => {
    expect(BuildingShellInputV1Schema.shape.schemaVersion.parse(undefined)).toBe(INPUT_SCHEMA_VERSION);
    expect(BuildingShellInputV1Schema.shape.frame.parse(undefined)).toBe(INPUT_FRAME);
    expect(INPUT_USTRUCT_DEFAULTS.FBuildingShellInput.schemaVersion).toBe(INPUT_SCHEMA_VERSION);
    expect(INPUT_USTRUCT_DEFAULTS.FBuildingShellInput.frame).toBe(INPUT_FRAME);
    expect(refineInput({schemaVersion: 2}).ok).toBe(false);
  });
});
