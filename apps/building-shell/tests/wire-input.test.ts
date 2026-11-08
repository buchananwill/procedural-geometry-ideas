// `building-shell/input@1` (journal decisions 124 to 128 and 136 to 140): the stand-in generated schema, its
// refinement layer with the USTRUCT defaults, and the adapter's refusals, snapping, flags and information.
import {describe, expect, it} from 'vitest';
import {PlanRefusal} from '../src/errors.ts';
import {COURTYARD_RECTS, RING_SIDES, RingForm, RingSides, ShellFixture, fixtureByName, ring} from '../src/fixture.ts';
import {storeyLoops} from '../src/ring-forms.ts';
import {planStorey} from '../src/storey.ts';
import {FBuildingShellInputSchema} from '../src/wire/building-shell-input-schema.zod.ts';
import {AdaptedInput, SIDE_READINGS, WIRE_FORMS, isPlanRefusal, noneWinnerRefusals, readInput, writeInput} from '../src/wire/input-adapter.ts';
import {
  BuildingShellInputV1, INPUT_FRAME, WIRE_GABLE_ONLY_DEG, WIRE_MAX_PITCH_DEG, WIRE_MIN_PITCH_DEG, WireRun, refineInput,
} from '../src/wire/input-types.ts';
import {shellFixture} from './test-builds.ts';
import {mutableJson} from './wire-json.ts';

/** A valid file: the flush Ring-conflict pair, two Rings whose S sides share y = 0, Ring 0 winning it. */
const valid = (): BuildingShellInputV1 => writeInput(fixtureByName('FlushRingConflict'));

/** The adapter's errors for a file, or [] when it is accepted. */
const errorsOf = (json: unknown): string[] => {
  const r = readInput(json, 'probe');
  return r.ok ? [] : r.errors;
};

/** The adapted file, or a throw naming its errors. */
const adapted = (json: unknown, name = 'probe'): AdaptedInput => {
  const r = readInput(json, name);
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r;
};

/** A JSON copy, so a test can delete fields the types require. */
const loose = mutableJson;

/** A file's Rings rotated to start at slot `s`, corners and sides together. */
function rotated(v: BuildingShellInputV1, s: number): BuildingShellInputV1 {
  const w = structuredClone(v);
  for (const r of w.rings) {
    r.corners = [...r.corners.slice(s), ...r.corners.slice(0, s)];
    r.sides = [...r.sides.slice(s), ...r.sides.slice(0, s)];
  }
  return w;
}

describe('the stand-in generated schema', () => {
  it('makes every field optional, as the UE generator emits: an empty document parses', () => {
    expect(FBuildingShellInputSchema.safeParse({}).success).toBe(true);
    expect(FBuildingShellInputSchema.safeParse({rings: [{corners: [{}], sides: [{runs: [{}]}]}]}).success).toBe(true);
  });

  it('is strict, as a USTRUCT is: an unknown field is refused', () => {
    expect(FBuildingShellInputSchema.safeParse({schemaVersion: 1, colour: 'red'}).success).toBe(false);
  });

  it('keys every field as MB.D507 lists it (decision 139)', () => {
    const v = valid();
    expect(Object.keys(v)).toEqual(['schemaVersion', 'frame', 'storeyHeightCm', 'cellSizeCm', 'rings', 'provenance']);
    expect(Object.keys(v.rings[0])).toEqual(['ringIndex', 'modelIndex', 'baseStorey', 'storeys', 'wallHeightCm', 'corners', 'sides']);
    expect(Object.keys(v.rings[0].sides[0])).toEqual(['request', 'runs']);
    expect(Object.keys(v.rings[0].sides[0].runs[0])).toEqual(['startCm', 'endCm', 'form', 'pitchDegrees', 'bEmptied', 'bOutlineRefused']);
    expect(Object.keys(v.provenance)).toEqual(['gameBuild', 'sessionId', 'timestamp', 'subject', 'location', 'rotation', 'scale']);
  });
});

describe('the refinement layer', () => {
  it('accepts a file the prototype writes, with schemaVersion its first field', () => {
    const v = valid();
    expect(refineInput(loose(v))).toEqual({ok: true, value: v});
    expect(v.frame).toBe(INPUT_FRAME);
  });

  it('gives an omitted field its USTRUCT default, as the C++ import codec does (decision 140, F7)', () => {
    const v = loose(valid());
    delete v.schemaVersion;
    delete v.frame;
    delete v.provenance;
    delete v.rings[0].baseStorey;
    delete v.rings[0].storeys;
    delete v.rings[0].wallHeightCm;
    delete v.rings[0].sides[1].request;
    delete v.rings[0].sides[1].runs[0].bEmptied;
    const r = refineInput(v);
    if (!r.ok) throw new Error(r.errors.join('; '));
    // Every deleted ring and side field held its default already; the provenance comes back default-constructed.
    const want = valid();
    want.provenance = {gameBuild: '', sessionId: '', timestamp: '', subject: '', location: {x: 0, y: 0, z: 0}, rotation: {x: 0, y: 0, z: 0}, scale: {x: 1, y: 1, z: 1}};
    expect(r.value).toEqual(want);
  });

  it('refuses through its defaults what a default cannot be: no storey height, no cell size, no Rings', () => {
    expect(errorsOf({})).toEqual([
      'storeyHeightCm: Too small: expected number to be >0',
      'cellSizeCm: Too small: expected number to be >0',
      'rings: Too small: expected array to have >=1 items',
    ]);
  });

  it('refuses an empty Ring through its defaults: no corners, no sides', () => {
    const v = loose(valid());
    v.rings[1] = {};
    expect(errorsOf(v)).toEqual(['rings.1.corners: Too small: expected array to have >=4 items', 'rings.1.sides: Too small: expected array to have >=4 items']);
  });

  it('refuses an unknown key at any depth', () => {
    const v = loose(valid());
    v.rings[0].sides[0].stroke = 3;
    expect(errorsOf(v)).toEqual(['rings.0.sides.0: Unrecognized key: "stroke"']);
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

  it('requires integer storeys and indices no lower than the unset sentinel -1', () => {
    const v = valid();
    v.rings[0].storeys = 1.5;
    v.rings[1].modelIndex = -2;
    expect(errorsOf(v)).toEqual(['rings.0.storeys: Invalid input: expected int, received number', 'rings.1.modelIndex: Too small: expected number to be >=-1']);
  });
});

describe('the refusals', () => {
  it('refuses a Ring whose ringIndex or modelIndex is the unset sentinel -1, naming the field (decision 140)', () => {
    const v = loose(writeInput(fixtureByName('DefaultChalet')));
    delete v.rings[0].ringIndex;
    delete v.rings[0].modelIndex;
    expect(errorsOf(v)).toEqual([
      'Ring 0 (model index -1) has ringIndex -1, the USTRUCT default for an unset index: the file does not write it (journal decision 140)',
      'Ring 0 (model index -1) has modelIndex -1, the USTRUCT default for an unset index: the file does not write it (journal decision 140)',
    ]);
  });

  it('refuses a Ring that is not an axis-aligned rectangle, tested on its snapped corners', () => {
    const v = valid();
    v.rings[0].corners[2] = {x: 500.5, y: 400};
    expect(errorsOf(v)).toEqual([
      'Ring 0 (model index 0) side 1 runs (500, 0) to (500.5, 400), not along one axis: the Ring is not an axis-aligned rectangle (journal decision 126)',
    ]);
  });

  it('refuses a degenerate Ring and a Ring whose consecutive sides lie on one axis', () => {
    const v = valid();
    v.rings[0].corners = [{x: 0, y: 0}, {x: 500, y: 0}, {x: 500, y: 0}, {x: 0, y: 0}];
    expect(errorsOf(v).length).toBeGreaterThan(0);
    expect(errorsOf(v).every(e => e.includes('not an axis-aligned rectangle'))).toBe(true);
    const w = valid();
    w.rings[0].corners = [{x: 0, y: 0}, {x: 200, y: 0}, {x: 500, y: 0}, {x: 500, y: 400}];
    expect(errorsOf(w).length).toBeGreaterThan(0);
    expect(errorsOf(w).every(e => e.includes('not an axis-aligned rectangle'))).toBe(true);
  });

  it("refuses a Ring of non-positive signed area, by the C++'s own test (decision 140, F10)", () => {
    const v = valid();
    v.rings[1].corners.reverse();
    expect(errorsOf(v)).toEqual([
      "Ring 1 (model index 1) has signed area x·y′ − x′·y ≤ 0 (-200000 cm²), the C++'s SignedArea test; a Ring's corners run with positive signed area (journal decisions 126 and 140)",
    ]);
  });

  it('refuses a solved Monopitch and a solved Flat', () => {
    const v = valid();
    v.rings[0].sides[0].runs[0].form = 'Monopitch';
    v.rings[0].sides[1].runs[0].form = 'Flat';
    expect(errorsOf(v)).toEqual([
      'Ring 0 (model index 0) side 0 run 0 has a solved Monopitch, refused until mono is supported (journal decision 126)',
      'Ring 0 (model index 0) side 1 run 0 has a solved Flat, which is a polyline clamp, never a run form (journal decision 126)',
    ]);
  });

  it("validates a gable's pitch as a Pitched side's: the shell builds it (decision 153, striking decision 136's exemption)", () => {
    const v = valid();
    v.rings[0].sides[2].runs[0].pitchDegrees = 90;
    expect(errorsOf(v)).toEqual(['Ring 0 (model index 0) side 2 run 0 is solved Pitched at 90 degrees, outside [7, 75] (journal decisions 143, 144 and 153)']);
    const w = valid();
    w.rings[1].sides[0].runs[0].pitchDegrees = 6.9; // Ring 1's S side is its GableEnd
    expect(w.rings[1].sides[0].runs[0].form).toBe('GableEnd');
    expect(errorsOf(w)).toEqual(['Ring 1 (model index 1) side 0 run 0 is solved GableEnd at 6.9 degrees, outside [7, 75] (journal decisions 143, 144 and 153)']);
    w.rings[1].sides[0].runs[0].pitchDegrees = 7;
    expect(adapted(w).fixture.rings[1].sides?.S).toEqual({form: 'gable', deg: 7});
  });

  it('refuses a Pitched side outside [WIRE_MIN_PITCH_DEG, WIRE_MAX_PITCH_DEG], and accepts both bounds (decision 143, F4)', () => {
    const at = (deg: number): string[] => {
      const v = valid();
      v.rings[0].sides[1].runs[0].pitchDegrees = deg;
      return errorsOf(v);
    };
    expect([WIRE_MIN_PITCH_DEG, WIRE_MAX_PITCH_DEG]).toEqual([7, 75]);
    expect(at(6.9)).toEqual(['Ring 0 (model index 0) side 1 run 0 is solved Pitched at 6.9 degrees, outside [7, 75] (journal decisions 143, 144 and 153)']);
    expect(at(75.1)).toEqual(['Ring 0 (model index 0) side 1 run 0 is solved Pitched at 75.1 degrees, outside [7, 75] (journal decisions 143, 144 and 153)']);
    expect(at(WIRE_MIN_PITCH_DEG)).toEqual([]);
    expect(at(WIRE_MAX_PITCH_DEG)).toEqual([]);
  });

  it("refuses an empty subject, read from provenance's subject (decisions 143, F7, and 149)", () => {
    const v = valid();
    v.provenance.subject = ' ';
    expect(readInput(v, 'a-stem.Subject.0')).toEqual({ok: false, errors: ['the dump has an empty subject: a fixture needs a name (journal decision 143)']});
    // Decision 149: the subject is provenance's, never the file name.
    expect(readInput(valid(), '').ok).toBe(true);
  });

  it("refuses a wall-height override that differs from the building's storey height, and accepts 0 or an equal one", () => {
    const v = valid();
    v.rings[1].wallHeightCm = 300;
    expect(errorsOf(v)).toEqual(["Ring 1 (model index 1) overrides its wall height to 300 cm, which differs from the building's storey height 250 cm (journal decision 126)"]);
    v.rings[1].wallHeightCm = 250;
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
    expect(errorsOf(v)).toEqual([
      'Rings at file positions 0, 1 share ring index 0; root order needs a unique index per Ring',
      "Ring 1 (model index 1) has ringIndex 0 at file position 1: a Ring's ringIndex is its array position, as the C++ replay requires (journal decision 152)",
    ]);
  });

  // Journal decision 152: the gate. Removing the refusal lets this file through.
  it("refuses a Ring whose ringIndex is not its array position, naming the field", () => {
    const v = valid();
    v.rings[0].ringIndex = 1;
    v.rings[1].ringIndex = 0;
    expect(errorsOf(v)).toEqual([
      "Ring 0 (model index 0) has ringIndex 1 at file position 0: a Ring's ringIndex is its array position, as the C++ replay requires (journal decision 152)",
      "Ring 1 (model index 1) has ringIndex 0 at file position 1: a Ring's ringIndex is its array position, as the C++ replay requires (journal decision 152)",
    ]);
  });

  it('reports every reason at once', () => {
    const v = valid();
    v.rings[1].modelIndex = 0;
    v.rings[0].sides[0].runs[0].form = 'Monopitch';
    expect(errorsOf(v)).toHaveLength(2);
  });
});

describe('a side solved None (decisions 136, 137 and 140, F2)', () => {
  it('is an unlisted side when it loses its union wall: FlushRingConflict\'s Ring 1 loses y = 0 to Ring 0', () => {
    const v = valid();
    v.rings[1].sides[0].runs[0].form = 'None';
    const r = adapted(v);
    expect(r.fixture.rings[1].sides?.S).toBeUndefined();
  });

  it('is an unlisted side when it is buried: SingleStoreyT\'s stem W side lies inside the union', () => {
    const v = writeInput(fixtureByName('SingleStoreyT'));
    v.rings[1].sides[3].runs[0].form = 'None';
    expect(adapted(v).fixture.rings[1].sides?.W).toBeUndefined();
  });

  it('is refused when it wins a union wall, where its form would be undefined', () => {
    const v = valid();
    v.rings[0].sides[2].runs[0].form = 'None';
    expect(errorsOf(v)).toEqual([
      'Ring 0 (model index 0) side 2 (N) is solved None but wins the union wall y = 400 [0, 1000] on storey 0, where its form is undefined (journal decision 140)',
    ]);
  });
});

describe("the None probe's error handling (decisions 142, N6, 146 and 148, F4)", () => {
  it("knows a plan refusal by the pipeline's named class, never by its message", () => {
    expect(isPlanRefusal(new PlanRefusal('pinch at 400,400: corner-only contact is not a footprint'))).toBe(true);
    expect(isPlanRefusal(new Error('pinch at 400,400: corner-only contact is not a footprint'))).toBe(false);
    expect(isPlanRefusal(new Error('Cannot read properties of undefined'))).toBe(false);
    expect(isPlanRefusal('pinch at 0,0')).toBe(false);
  });

  it('is what the pipeline throws for a pinch, through the storey label too', () => {
    const pinch: ShellFixture = {name: 'Pinch', cellSize: 50, storeyHeight: 250, rings: [ring([0, 0, 400, 400], 0, 1, 30), ring([400, 400, 800, 800], 0, 1, 30)]};
    expect(() => storeyLoops(pinch.rings.map(r => r.rect))).toThrow(PlanRefusal);
    expect(() => planStorey(pinch, 0)).toThrow(PlanRefusal);
  });

  // Decision 148, F4: the rethrow branch, convicted by mutation. A Ring side authored `cut` is no plan refusal (the
  // wire never writes one), so the probe must throw it rather than skip the storey.
  it('rethrows an error that is no plan refusal', () => {
    const f: ShellFixture = {name: 'CutSide', cellSize: 50, storeyHeight: 250, rings: [{...ring([0, 0, 400, 400], 0, 1, 30), sides: {S: {form: 'cut' as RingForm}}}]};
    expect(() => noneWinnerRefusals(f, [{ring: 0, compass: 'N', text: 'Ring 0 side 2 (N)'}])).toThrow(/authored cut/);
  });

  it('accepts a None side on a storey whose plan pinches: the build refuses it instead', () => {
    const v = writeInput({name: 'Pinch', cellSize: 50, storeyHeight: 250, rings: [ring([0, 0, 400, 400], 0, 1, 30), ring([400, 400, 800, 800], 0, 1, 30)]});
    v.rings[0].sides[1].runs[0].form = 'None';
    expect(errorsOf(v)).toEqual([]);
  });
});

describe('corner snapping (decision 137, spec 16)', () => {
  it('snaps double round-off onto the grid and reports the largest drift', () => {
    const v = valid();
    v.rings[0].corners[1].x = 500.00000000000006;
    const r = adapted(v);
    expect(r.fixture.rings[0].rect).toEqual([0, 0, 500, 400]);
    expect(r.report.maxCornerDriftCm).toBeCloseTo(5.7e-14, 15);
    expect(r.report.info).toContain(`the largest corner drift snapped is ${r.report.maxCornerDriftCm} cm`);
  });

  it('reports no drift for a file on the grid', () => {
    expect(adapted(valid()).report.maxCornerDriftCm).toBe(0);
  });

  it('refuses a corner beyond WIRE_CORNER_SNAP_CM of the grid, never snapping it', () => {
    const v = valid();
    v.rings[0].corners[1].x = 500.00001;
    expect(errorsOf(v)).toEqual([
      "Ring 0 (model index 0) corner 1's x = 500.00001 lies 0.000009999999974752427 cm off the 1/1024 cm grid, beyond WIRE_CORNER_SNAP_CM = 0.000001 cm (journal decision 137)",
    ]);
  });
});

describe('information the diff report carries, never refused', () => {
  it('carries a request that disagrees with its solve, bEmptied and bOutlineRefused', () => {
    const v = valid();
    v.rings[0].sides[1].request = 'GableEnd';
    v.rings[1].sides[3].runs[0].bEmptied = true;
    v.rings[1].sides[2].runs[0].bOutlineRefused = true;
    const r = adapted(v);
    expect(r.report.flags).toEqual([]);
    expect(r.report.info).toEqual([
      'Ring 0 (model index 0) side 1 (E) run 0 requests GableEnd but is solved Pitched',
      'Ring 1 (model index 1) side 2 (N) run 0 is bOutlineRefused',
      'Ring 1 (model index 1) side 3 (W) run 0 is bEmptied',
    ]);
  });
});

describe('ordering', () => {
  it('orders the fixture by model index, whatever order the file lists the Rings in', () => {
    const v = valid();
    v.rings.reverse();
    v.rings.forEach((r, i) => { r.ringIndex = i; });
    const r = adapted(v, 'listed backwards');
    expect(r.fixture.rings.map(x => x.rect)).toEqual(fixtureByName('FlushRingConflict').rings.map(x => x.rect));
    expect(r.report.flags).toEqual(['model-index order and ring (root) order disagree: by model index the ring indices run 1, 0; the conflict rule keys on the model index (journal decision 126)']);
  });

  it('accepts a file whose model-index order disagrees with its root order, flagged, and follows the model index (decision 152: modelIndex shuffled only)', () => {
    const v = valid();
    v.rings[0].modelIndex = 7;
    v.rings[1].modelIndex = 3;
    const r = adapted(v, 'disagreeing');
    expect(r.report.flags).toEqual(['model-index order and ring (root) order disagree: by model index the ring indices run 1, 0; the conflict rule keys on the model index (journal decision 126)']);
    expect(r.fixture.rings.map(x => x.rect)).toEqual(fixtureByName('FlushRingConflictSwapped').rings.map(x => x.rect));
  });
});

describe('side mapping and defaultDeg (decision 140, F1 and F4)', () => {
  const one = (sides: RingSides, deg = 30): ShellFixture => ({name: 'One', cellSize: 50, storeyHeight: 250, rings: [ring([10, 20, 110, 220], 0, 1, deg, sides)]});

  it('writes side i from corner i to corner i + 1 on the compass side S, E, N, W in turn', () => {
    const [r] = writeInput(one({N: {form: 'gable'}})).rings;
    expect(r.corners).toEqual([{x: 10, y: 20}, {x: 110, y: 20}, {x: 110, y: 220}, {x: 10, y: 220}]);
    expect(RING_SIDES).toEqual(['S', 'E', 'N', 'W']);
    expect(r.sides.map(s => s.request)).toEqual(['Auto', 'Auto', 'GableEnd', 'Auto']);
  });

  it('reads a Ring starting at any corner by where each side lies; every side, a gable included, at its own pitch (decision 153)', () => {
    const r = adapted(rotated(writeInput(one({N: {form: 'gable', deg: 40}, E: {form: 'hip', deg: 35}})), 1));
    expect(r.fixture.rings[0].rect).toEqual([10, 20, 110, 220]);
    expect(r.fixture.rings[0].sides).toEqual({S: {form: 'hip', deg: 30}, E: {form: 'hip', deg: 35}, N: {form: 'gable', deg: 40}, W: {form: 'hip', deg: 30}});
    expect(r.fixture.rings[0].defaultDeg).toBe(30);
  });

  it('takes defaultDeg from the first Pitched side in compass order, and WIRE_GABLE_ONLY_DEG with none', () => {
    expect(adapted(writeInput(one({S: {form: 'gable'}, E: {form: 'hip', deg: 35}}))).fixture.rings[0].defaultDeg).toBe(35);
    const allGable = one({S: {form: 'gable'}, E: {form: 'gable'}, N: {form: 'gable'}, W: {form: 'gable'}}, 60);
    expect(adapted(writeInput(allGable)).fixture.rings[0].defaultDeg).toBe(WIRE_GABLE_ONLY_DEG);
  });

  it('reads every form it writes back as that Ring form (decision 155, B1: the tables tied by value as well as by type)', () => {
    const forms: RingForm[] = ['hip', 'gable'];
    expect(forms.map(f => SIDE_READINGS[WIRE_FORMS[f]])).toEqual(forms.map(form => ({kind: 'listed', form})));
  });

  it("gives the reviewer's mixed-pitch Courtyard one defaultDeg at all four start corners", () => {
    const sides: RingSides = {S: {form: 'hip', deg: 30}, E: {form: 'hip', deg: 35}, N: {form: 'hip', deg: 40}, W: {form: 'hip', deg: 45}};
    const f: ShellFixture = {name: 'MixedCourtyard', cellSize: 50, storeyHeight: 250, rings: COURTYARD_RECTS.map(r => ring(r, 0, 1, 30, sides))};
    const degs = [0, 1, 2, 3].map(s => adapted(rotated(writeInput(f), s)).fixture.rings.map(x => x.defaultDeg));
    expect(degs).toEqual([[30, 30, 30, 30], [30, 30, 30, 30], [30, 30, 30, 30], [30, 30, 30, 30]]);
  });
});

describe('runs per side (journal decision 149)', () => {
  /** A Pitched or GableEnd run over [start, end) of a side. */
  const run = (startCm: number, endCm: number, form: WireRun['form'], pitchDegrees = 45): WireRun =>
    ({startCm, endCm, form, pitchDegrees, bEmptied: false, bOutlineRefused: false});

  it("writes one run per side, the side's whole length, measured from its corner i", () => {
    const [r] = valid().rings;
    expect(r.sides.map(s => s.runs.map(x => [x.startCm, x.endCm]))).toEqual([[[0, 500]], [[0, 400]], [[0, 500]], [[0, 400]]]);
  });

  it("reads runs that agree, a None run among them left out, as the side's one form", () => {
    // NarrowUpperStorey's lower side 0 holds two runs either side of the flush upper Ring, as the C++ net writes it.
    const v = valid();
    v.rings[0].sides[1].runs = [run(0, 150, 'Pitched'), run(150, 250, 'None'), run(250, 400, 'Pitched')];
    expect(adapted(v).fixture.rings[0].sides?.E).toEqual({form: 'hip', deg: 45});
  });

  it("refuses runs that disagree in pitch or in form, as a C++ inconsistency against spec 3's whole-wall rule", () => {
    const v = valid();
    v.rings[0].sides[1].runs = [run(0, 200, 'Pitched', 30), run(200, 400, 'Pitched', 45)];
    v.rings[1].sides[1].runs = [run(0, 200, 'Pitched'), run(200, 400, 'GableEnd')];
    expect(errorsOf(v)).toEqual([
      "Ring 0 (model index 0) side 1's runs disagree (Pitched 30, Pitched 45): spec 3 gives the whole wall one form and pitch, so this is a C++ inconsistency, raised with the port lead and never read silently (journal decision 149)",
      "Ring 1 (model index 1) side 1's runs disagree (Pitched 45, GableEnd 45): spec 3 gives the whole wall one form and pitch, so this is a C++ inconsistency, raised with the port lead and never read silently (journal decision 149)",
    ]);
  });

  // Journal decision 156, F2: a gable's pitch is geometry (decision 153), so two GableEnd runs at different pitches
  // disagree as two Pitched runs do. The gate: runs at 20 and 70 degrees are refused.
  it('refuses GableEnd runs that disagree in pitch', () => {
    const v = valid();
    v.rings[1].sides[0].runs = [run(0, 250, 'GableEnd', 20), run(250, 500, 'GableEnd', 70)];
    expect(errorsOf(v)).toEqual([
      "Ring 1 (model index 1) side 0's runs disagree (GableEnd 20, GableEnd 70): spec 3 gives the whole wall one form and pitch, so this is a C++ inconsistency, raised with the port lead and never read silently (journal decision 149)",
    ]);
    v.rings[1].sides[0].runs = [run(0, 250, 'GableEnd', 20), run(250, 500, 'GableEnd', 20)];
    expect(adapted(v).fixture.rings[1].sides?.S).toEqual({form: 'gable', deg: 20});
  });

  // Journal decision 156, F5: a run end carries the C++ transforms' double round-off as a corner does, so an end within
  // WIRE_CORNER_SNAP_CM of 0 or of the snapped side's length is taken as that end; anything further is refused.
  it("snaps a run end within WIRE_CORNER_SNAP_CM of 0 or of the side's length, and refuses one beyond", () => {
    const at = (start: number, end: number): string[] => {
      const v = valid();
      v.rings[0].sides[0].runs = [run(start, end, 'Pitched')];
      return errorsOf(v);
    };
    expect(at(0, 500 + 4e-7)).toEqual([]);
    expect(at(-1e-9, 500)).toEqual([]);
    expect(at(0, 500 - 4e-7)).toEqual([]);
    expect(at(0, 500 + 2e-6)).toEqual([
      "Ring 0 (model index 0) side 0 run 0 spans 0 to 500.000002 cm: a side's runs lie in order along it, 0 ≤ start < end ≤ its length 500 cm, with no overlap, each end within WIRE_CORNER_SNAP_CM = 0.000001 cm (journal decisions 149, 156 and 161)",
    ]);
    // Corners written with round-off within the slack, and the run at the unsnapped length, read as the C++ wrote them.
    const w = valid();
    w.rings[0].corners[1].x += 4e-7;
    w.rings[0].corners[2].x += 4e-7;
    w.rings[0].sides[0].runs = [run(0, 500 + 4e-7, 'Pitched')];
    expect(errorsOf(w)).toEqual([]);
  });

  // Journal decision 161, finding 4: the slack reaches an interior run junction. Two adjacent run ends within
  // WIRE_CORNER_SNAP_CM of each other meet at one point; further apart, they overlap and are refused. The gate: on a
  // 1000 cm side, [0, 500 + 4e-7] and [500 - 4e-7, 1000] are accepted, [0, 500 + 2e-6] and [500 - 2e-6, 1000] refused.
  it('snaps two adjacent run ends within WIRE_CORNER_SNAP_CM of each other to one point, and refuses ends further apart', () => {
    const junction = (end: number, start: number): string[] => {
      const v = writeInput(shellFixture('Long', [ring([0, 0, 1000, 400], 0, 1, 45)]));
      v.rings[0].sides[0].runs = [run(0, end, 'Pitched'), run(start, 1000, 'Pitched')];
      return errorsOf(v);
    };
    expect(junction(500 + 4e-7, 500 - 4e-7)).toEqual([]);
    expect(junction(500 - 4e-7, 500 + 4e-7)).toEqual([]);
    expect(junction(500 + 2e-6, 500 - 2e-6)).toEqual([
      "Ring 0 (model index 0) side 0 run 1 spans 499.999998 to 1000 cm: a side's runs lie in order along it, 0 ≤ start < end ≤ its length 1000 cm, with no overlap, each end within WIRE_CORNER_SNAP_CM = 0.000001 cm (journal decisions 149, 156 and 161)",
    ]);
  });

  it('refuses a run out of order, overlapping, empty, or past the side', () => {
    const v = valid();
    v.rings[0].sides[0].runs = [run(200, 500, 'Pitched'), run(100, 200, 'Pitched')];
    v.rings[0].sides[1].runs = [run(0, 300, 'Pitched'), run(250, 400, 'Pitched')];
    v.rings[0].sides[2].runs = [run(100, 100, 'Pitched')];
    v.rings[0].sides[3].runs = [run(0, 400.5, 'Pitched')];
    const span = (side: number, k: number, a: number, b: number, len: number): string =>
      `Ring 0 (model index 0) side ${side} run ${k} spans ${a} to ${b} cm: a side's runs lie in order along it, 0 ≤ start < end ≤ its length ${len} cm, with no overlap, each end within WIRE_CORNER_SNAP_CM = 0.000001 cm (journal decisions 149, 156 and 161)`;
    expect(errorsOf(v)).toEqual([span(0, 1, 100, 200, 500), span(1, 1, 250, 400, 400), span(2, 0, 100, 100, 500), span(3, 0, 0, 400.5, 400)]);
  });

  it('reads a side with no run, or only None runs, as formless: unlisted, and refused only where it wins a union wall', () => {
    const v = valid();
    v.rings[1].sides[0].runs = [];
    expect(adapted(v).fixture.rings[1].sides?.S).toBeUndefined();
    const w = valid();
    w.rings[0].sides[2].runs = [run(0, 500, 'None')];
    expect(errorsOf(w)).toEqual([
      'Ring 0 (model index 0) side 2 (N) is solved None but wins the union wall y = 400 [0, 1000] on storey 0, where its form is undefined (journal decision 140)',
    ]);
  });

  it("applies the pitch bounds and the request-against-solve flag per run, and carries each run's bEmptied and bOutlineRefused", () => {
    const v = valid();
    v.rings[0].sides[1].runs = [run(0, 200, 'Pitched'), run(200, 400, 'None', 0)];
    v.rings[0].sides[1].runs[1].bEmptied = true;
    v.rings[0].sides[1].request = 'Pitched';
    v.rings[0].sides[0].runs = [run(0, 250, 'Pitched', 80), run(250, 500, 'Pitched', 80)];
    expect(errorsOf(v)).toEqual([
      'Ring 0 (model index 0) side 0 run 0 is solved Pitched at 80 degrees, outside [7, 75] (journal decisions 143, 144 and 153)',
      'Ring 0 (model index 0) side 0 run 1 is solved Pitched at 80 degrees, outside [7, 75] (journal decisions 143, 144 and 153)',
    ]);
    v.rings[0].sides[0].runs = [run(0, 500, 'Pitched')];
    expect(adapted(v).report.info).toEqual([
      'Ring 0 (model index 0) side 1 (E) run 1 requests Pitched but is solved None',
      'Ring 0 (model index 0) side 1 (E) run 1 is bEmptied',
    ]);
  });
});
