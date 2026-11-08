// `building-shell/input@1` (journal decisions 124 to 128, as amended by 126): the stand-in generated schema, its
// refinement layer, and the adapter's refusals and flags.
import {describe, expect, it} from 'vitest';
import {fixtureByName, ring} from '../src/fixture.ts';
import {FBuildingShellInput, FBuildingShellInputSchema} from '../src/wire/building-shell-input-schema.zod.ts';
import {WIRE_SIDE_ORDER, readInput, writeInput} from '../src/wire/input-adapter.ts';
import {BuildingShellInputV1, INPUT_FRAME, refineInput} from '../src/wire/refinements/building-shell-input.ts';

/** Decision 125's drift guard, in its stand-in form: the refined type is a generated value, so `typecheck` fails on drift. */
const refinedIsGenerated = (v: BuildingShellInputV1): FBuildingShellInput => v;
void refinedIsGenerated;

/** A valid file: the flush Ring-conflict pair, two Rings whose S sides share y = 0. */
const valid = (): BuildingShellInputV1 => writeInput(fixtureByName('FlushRingConflict'));

/** The adapter's errors for a file, or [] when it is accepted. */
const errorsOf = (json: unknown): string[] => {
  const r = readInput(json, 'probe');
  return r.ok ? [] : r.errors;
};

describe('the stand-in generated schema', () => {
  it('makes every field optional, as the UE generator emits: an empty document parses', () => {
    expect(FBuildingShellInputSchema.safeParse({}).success).toBe(true);
    expect(FBuildingShellInputSchema.safeParse({rings: [{corners: [{}]}]}).success).toBe(true);
  });

  it('is strict, as a USTRUCT is: an unknown field is refused', () => {
    expect(FBuildingShellInputSchema.safeParse({schemaVersion: 1, colour: 'red'}).success).toBe(false);
  });
});

describe('the refinement layer', () => {
  it('accepts a file the prototype writes, with schemaVersion its int32 first field', () => {
    const v = valid();
    expect(refineInput(JSON.parse(JSON.stringify(v)))).toEqual({ok: true, value: v});
    expect(Object.keys(v)[0]).toBe('schemaVersion');
    expect(v.frame).toBe(INPUT_FRAME);
  });

  it('requires every field', () => {
    const {cellSizeCm: _, ...rest} = valid();
    expect(errorsOf(rest)).toEqual(['cellSizeCm: Invalid input: expected number, received undefined']);
    const v = valid();
    delete (v.rings[1].sides[2] as Partial<typeof v.rings[1]['sides'][2]>).request;
    expect(errorsOf(v)).toEqual(['rings.1.sides.2.request: Invalid input: expected nonoptional, received undefined']);
  });

  it('pins schemaVersion 1 and the frame', () => {
    expect(errorsOf({...valid(), schemaVersion: 2})).toEqual(['schemaVersion: Invalid input: expected 1']);
    expect(errorsOf({...valid(), frame: 'UE world, cm'})).toEqual([`frame: Invalid input: expected "${INPUT_FRAME}"`]);
  });

  it('requires four corners and four sides', () => {
    const v = valid();
    v.rings[0].corners.pop();
    v.rings[1].sides.push(v.rings[1].sides[0]);
    expect(errorsOf(v)).toEqual(['rings.0.corners: Too small: expected array to have >=4 items', 'rings.1.sides: Too big: expected array to have <=4 items']);
  });

  it('requires integer storeys and indices', () => {
    const v = valid();
    v.rings[0].storeys.storeys = 1.5;
    v.rings[1].modelIndex = -1;
    expect(errorsOf(v)).toEqual(['rings.0.storeys.storeys: Invalid input: expected int, received number', 'rings.1.modelIndex: Too small: expected number to be >=0']);
  });
});

describe('the refusals', () => {
  it('refuses a Ring that is not an axis-aligned rectangle, never snapping it', () => {
    const v = valid();
    v.rings[0].corners[2] = {x: 500.001, y: 400};
    expect(errorsOf(v)).toEqual([
      'Ring 0 (model index 0) side 1 runs (500, 0) to (500.001, 400), not along one axis: the Ring is not an axis-aligned rectangle (journal decision 126)',
    ]);
  });

  it('refuses a degenerate Ring and a Ring whose consecutive sides lie on one axis', () => {
    const v = valid();
    v.rings[0].corners = [{x: 0, y: 0}, {x: 500, y: 0}, {x: 500, y: 0}, {x: 0, y: 0}];
    expect(errorsOf(v).every(e => e.includes('not an axis-aligned rectangle'))).toBe(true);
    const w = valid();
    w.rings[0].corners = [{x: 0, y: 0}, {x: 200, y: 0}, {x: 500, y: 0}, {x: 500, y: 400}];
    expect(errorsOf(w).length).toBeGreaterThan(0);
    expect(errorsOf(w).every(e => e.includes('not an axis-aligned rectangle'))).toBe(true);
  });

  it('refuses a Ring winding clockwise, as a mirrored frame would write it', () => {
    const v = valid();
    v.rings[1].corners.reverse();
    expect(errorsOf(v)).toEqual(["Ring 1 (model index 1) winds clockwise from above; a Ring's corners run counter-clockwise (journal decision 126)"]);
  });

  it('refuses a solved Monopitch, a solved Flat and a side with no solved run', () => {
    const v = valid();
    v.rings[0].sides[0].solved.form = 'Monopitch';
    v.rings[0].sides[1].solved.form = 'Flat';
    v.rings[1].sides[3].solved.form = 'None';
    expect(errorsOf(v)).toEqual([
      'Ring 0 (model index 0) side 0 has a solved Monopitch, refused until mono is supported (journal decision 126)',
      'Ring 0 (model index 0) side 1 has a solved Flat, which is a polyline clamp, never a run form (journal decision 126)',
      'Ring 1 (model index 1) side 3 has no solved run (form None)',
    ]);
  });

  it('refuses a pitch outside (0, 90)', () => {
    const v = valid();
    v.rings[0].sides[2].solved.pitchDegrees = 90;
    expect(errorsOf(v)).toEqual(['Ring 0 (model index 0) side 2 is solved at 90 degrees, outside (0, 90)']);
  });

  it("refuses a wall-height override that differs from the building's storey height, and accepts 0 or an equal one", () => {
    const v = valid();
    v.rings[1].storeys.wallHeightCm = 300;
    expect(errorsOf(v)).toEqual(["Ring 1 (model index 1) overrides its wall height to 300 cm, which differs from the building's storey height 250 cm (journal decision 126)"]);
    v.rings[1].storeys.wallHeightCm = 250;
    expect(errorsOf(v)).toEqual([]);
  });

  it('refuses two Rings sharing a model index (journal decision 128)', () => {
    const v = valid();
    v.rings[1].modelIndex = 0;
    expect(errorsOf(v)).toEqual(['Rings at file positions 0, 1 share model index 0; the conflict rule needs a unique key per Ring (journal decision 128)']);
  });

  it('refuses two Rings sharing a ring index', () => {
    const v = valid();
    v.rings[1].ringIndex = 0;
    expect(errorsOf(v)).toEqual(['Rings at file positions 0, 1 share ring index 0; root order needs a unique index per Ring']);
  });

  it('reports every reason at once', () => {
    const v = valid();
    v.rings[1].modelIndex = 0;
    v.rings[0].sides[0].solved.form = 'Monopitch';
    expect(errorsOf(v)).toHaveLength(2);
  });
});

describe('ordering', () => {
  it('orders the fixture by model index, so the conflict rule keys on it, whatever order the file lists the Rings in', () => {
    const v = valid();
    v.rings.reverse();
    const r = readInput(v, 'listed backwards');
    if (!r.ok) throw new Error(r.errors.join('; '));
    expect(r.fixture.rings.map(x => x.rect)).toEqual(fixtureByName('FlushRingConflict').rings.map(x => x.rect));
    expect(r.flags).toEqual([]);
  });

  it('accepts a file whose model-index order disagrees with its root order, flagged, and follows the model index', () => {
    const v = valid();
    v.rings[0].modelIndex = 7;
    v.rings[1].modelIndex = 3;
    const r = readInput(v, 'disagreeing');
    if (!r.ok) throw new Error(r.errors.join('; '));
    expect(r.flags).toEqual(['model-index order and ring (root) order disagree: by model index the ring indices run 1, 0; the conflict rule keys on the model index (journal decision 126)']);
    expect(r.fixture.rings.map(x => x.rect)).toEqual(fixtureByName('FlushRingConflictSwapped').rings.map(x => x.rect));
  });
});

describe('side mapping', () => {
  it('writes side i from corner i to corner i + 1 on the compass side S, E, N, W in turn', () => {
    const [r] = writeInput({name: 'One', cellSize: 50, storeyHeight: 250, rings: [ring([10, 20, 110, 220], 0, 1, 30, {N: {form: 'gable'}})]}).rings;
    expect(r.corners).toEqual([{x: 10, y: 20}, {x: 110, y: 20}, {x: 110, y: 220}, {x: 10, y: 220}]);
    expect(WIRE_SIDE_ORDER).toEqual(['S', 'E', 'N', 'W']);
    expect(r.sides.map(s => s.request)).toEqual(['Auto', 'Auto', 'GableEnd', 'Auto']);
  });

  it('reads a Ring starting at any corner by where each side lies, not by its slot', () => {
    const v = writeInput({name: 'One', cellSize: 50, storeyHeight: 250, rings: [ring([10, 20, 110, 220], 0, 1, 30, {N: {form: 'gable', deg: 40}})]});
    const r0 = v.rings[0];
    r0.corners = [...r0.corners.slice(1), r0.corners[0]];
    r0.sides = [...r0.sides.slice(1), r0.sides[0]];
    const r = readInput(v, 'rotated');
    if (!r.ok) throw new Error(r.errors.join('; '));
    expect(r.fixture.rings[0].rect).toEqual([10, 20, 110, 220]);
    expect(r.fixture.rings[0].sides).toEqual({S: {form: 'hip', deg: 30}, E: {form: 'hip', deg: 30}, N: {form: 'gable', deg: 40}, W: {form: 'hip', deg: 30}});
    expect(r.fixture.rings[0].defaultDeg).toBe(30);
  });
});
