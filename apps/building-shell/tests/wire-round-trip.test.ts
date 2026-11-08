// Journal decisions 125, 126 and 140: the asymmetric-building test. An L with one gabled side goes from fixture to
// `input@1` JSON and back, and winding and side ownership survive: the wire's corners have positive signed area with
// each side on its compass side, the fixture read back means the one written, and the two shells' canonical forms
// agree. The L is asymmetric, so a mirrored reading cannot pass: its mirror image measures a different canonical form.
import {beforeAll, describe, expect, it} from 'vitest';
import {COURTYARD_RECTS, EXPORTED_FIXTURES, FixtureRing, RING_SIDES, RingSide, ShellFixture, fixtureByName, ring} from '../src/fixture.ts';
import {ringSideLines} from '../src/ring-forms.ts';
import {BuildingShell, buildShell, buildShellDetailed} from '../src/shell.ts';
import {canonicalOfShell, diffCanonical, isEmptyDiff} from '../src/wire/canonical.ts';
import {SEED_FIXTURES} from '../src/wire/export-playtest.ts';
import {readInput, writeInput} from '../src/wire/input-adapter.ts';
import {WIRE_GABLE_ONLY_DEG, WIRE_MAX_PITCH_DEG, WIRE_MIN_PITCH_DEG, WireVec2} from '../src/wire/input-types.ts';
import {wireInvariantViolations} from './slab-genus.ts';

/**
 * The asymmetric L: a 1000 by 400 wing and a 400 by 800 wing, so no reflection or rotation maps it onto itself, gabled
 * on one side only, the long wing's W side (x = 0).
 */
const ASYMMETRIC_L: ShellFixture = {
  name: 'AsymmetricL', cellSize: 50, storeyHeight: 250,
  rings: [ring([0, 0, 1000, 400], 0, 1, 40, {W: {form: 'gable'}}), ring([600, 0, 1000, 800], 0, 1, 40)],
};

/** The L reflected in x = 500: the W gable becomes an E gable on x = 1000. */
const MIRRORED_L: ShellFixture = {
  name: 'AsymmetricLMirrored', cellSize: 50, storeyHeight: 250,
  rings: [ring([0, 0, 1000, 400], 0, 1, 40, {E: {form: 'gable'}}), ring([0, 0, 400, 800], 0, 1, 40)],
};

/** A wire file through JSON and the adapter, read back. */
function read(json: unknown, name: string): ShellFixture {
  const r = readInput(JSON.parse(JSON.stringify(json)), name);
  if (!r.ok) throw new Error(`${name} refused: ${r.errors.join('; ')}`);
  expect(r.report.flags).toEqual([]);
  return r.fixture;
}
const throughWire = (f: ShellFixture): ShellFixture => read(writeInput(f), f.name);

/** Decision 140, F4: the default pitch a wire Ring is read with: its first hip's in compass order, else 45. */
function expectedDefaultDeg(r: FixtureRing): number {
  const hip = RING_SIDES.find(s => (r.sides?.[s]?.form ?? 'hip') === 'hip');
  return hip ? r.sides?.[hip]?.deg ?? r.defaultDeg : WIRE_GABLE_ONLY_DEG;
}

/**
 * A Ring's meaning as spec decision 3 reads it: its rect and storeys, each compass side's form, a hip's pitch and the
 * default pitch, which a gable takes (decision 140, F1). A fixture gable's own `deg` is not part of it.
 */
const resolved = (r: FixtureRing, defaultDeg: number) => ({
  rect: r.rect, baseStorey: r.baseStorey, storeys: r.storeys, defaultDeg,
  sides: Object.fromEntries(RING_SIDES.map(s => {
    const form = r.sides?.[s]?.form ?? 'hip';
    return [s, form === 'gable' ? {form} : {form, deg: r.sides?.[s]?.deg ?? r.defaultDeg}];
  })),
});
const meaning = (f: ShellFixture, defaults: (r: FixtureRing) => number) =>
  ({name: f.name, cellSize: f.cellSize, storeyHeight: f.storeyHeight, rings: f.rings.map(r => resolved(r, defaults(r)))});

/** Whether a wire side's segment lies on the compass side of its Ring's rect. */
function onCompass(a: WireVec2, b: WireVec2, rect: FixtureRing['rect'], side: RingSide): boolean {
  const l = ringSideLines(rect)[side];
  return l.axis === 'y' ? a.y === l.at && b.y === l.at : a.x === l.at && b.x === l.at;
}

// The authored shells are built once; the round trip's is built in each test that reads it, so an adapter that breaks
// the build fails those tests by name and never skips the file.
const shells = new Map<string, BuildingShell>();
beforeAll(async () => {
  shells.set('original', await buildShell(ASYMMETRIC_L));
  shells.set('mirrored', await buildShell(MIRRORED_L));
}, 60_000);
const get = (k: string): BuildingShell => {
  const s = shells.get(k);
  if (!s) throw new Error(`no shell built for ${k}`);
  return s;
};
const roundTripShell = (): Promise<BuildingShell> => buildShell(throughWire(ASYMMETRIC_L));

describe('the asymmetric L round trip', () => {
  it('writes every Ring with positive signed area, each side i on its compass side and owned by corner i', () => {
    const wire = writeInput(ASYMMETRIC_L);
    wire.rings.forEach((r, k) => {
      const cs = r.corners;
      const area = cs.reduce((s, a, i) => s + a.x * cs[(i + 1) % 4].y - cs[(i + 1) % 4].x * a.y, 0) / 2;
      expect(area).toBeGreaterThan(0);
      RING_SIDES.forEach((side, i) => expect(onCompass(cs[i], cs[(i + 1) % 4], ASYMMETRIC_L.rings[k].rect, side)).toBe(true));
    });
    expect(wire.rings.map(r => r.sides.map(s => s.solved.form))).toEqual([
      ['Pitched', 'Pitched', 'Pitched', 'GableEnd'],
      ['Pitched', 'Pitched', 'Pitched', 'Pitched'],
    ]);
    expect(wire.rings[0].corners[3]).toEqual({x: 0, y: 400}); // the gabled side 3 runs from corner 3 at x = 0
  });

  it('reads back the fixture it wrote', () => {
    expect(meaning(throughWire(ASYMMETRIC_L), r => r.defaultDeg)).toEqual(meaning(ASYMMETRIC_L, expectedDefaultDeg));
  });

  it("builds a shell whose canonical form is the original's", async () => {
    expect(diffCanonical(canonicalOfShell(get('original')), canonicalOfShell(await roundTripShell()))).toEqual({facesOnlyA: [], facesOnlyB: [], edgesOnlyA: [], edgesOnlyB: []});
  }, 60_000);

  it('keeps its one Gable on x = 0', async () => {
    const gables = (await roundTripShell()).faces.filter(f => f.tag.kind === 'Gable');
    expect(gables).toHaveLength(1);
    expect(gables[0].loops[0].every(p => p[0] === 0)).toBe(true);
  });

  it('is asymmetric: its mirror image differs in canonical form, so a mirrored adapter cannot pass', () => {
    expect(isEmptyDiff(diffCanonical(canonicalOfShell(get('original')), canonicalOfShell(get('mirrored'))))).toBe(false);
  });
});

describe('a wire gable pitch the skeleton would refuse (decision 140, F1)', () => {
  it.each([0, 90])('builds the L clean with its gable solved at %s degrees, at the Ring default instead', async deg => {
    const wire = writeInput(ASYMMETRIC_L);
    wire.rings[0].sides[3].solved.pitchDegrees = deg;
    const f = read(wire, `AsymmetricLGable${deg}`);
    const b = await buildShellDetailed(f);
    expect(wireInvariantViolations(b, f, 0)).toEqual([]);
    expect(isEmptyDiff(diffCanonical(canonicalOfShell(get('original')), canonicalOfShell(b.shell)))).toBe(true);
  });
});

/**
 * Decision 143, F1's reproducers: courtyards whose cut is collinear with no wall, which read the cutting Ring's
 * `defaultDeg` until WP3.7's `CUT_FREE_DEG` (040c93e). The wire carries no `defaultDeg`, so before that fix the round
 * trip changed or broke the shell.
 */
const CUT_REPRODUCERS: ShellFixture[] = [
  {name: 'CourtyardSOverride', cellSize: 50, storeyHeight: 250, rings: COURTYARD_RECTS.map(r => ring(r, 0, 1, 30, {S: {form: 'hip', deg: 45}}))},
  {name: 'CourtyardMixedPitch', cellSize: 50, storeyHeight: 250, rings: COURTYARD_RECTS.map(r => ring(r, 0, 1, 30, {S: {form: 'hip', deg: 30}, E: {form: 'hip', deg: 35}, N: {form: 'hip', deg: 40}, W: {form: 'hip', deg: 45}}))},
];

describe('every exported fixture through the wire', () => {
  const EXPORTED = [...EXPORTED_FIXTURES, ...CUT_REPRODUCERS].map(f => [f.name, f] as const);

  it.each(EXPORTED)('%s: reads back the fixture it wrote', (_, f) => {
    expect(meaning(throughWire(f), r => r.defaultDeg)).toEqual(meaning(f, expectedDefaultDeg));
  });

  // Decision 143, F1: shell identity, buildShell(f) against buildShell(readInput(writeInput(f))).
  it.each(EXPORTED)('%s: builds the same shell after the round trip, with an empty canonical diff', async (_, f) => {
    expect(diffCanonical(canonicalOfShell(await buildShell(f)), canonicalOfShell(await buildShell(throughWire(f))))).toEqual({facesOnlyA: [], facesOnlyB: [], edgesOnlyA: [], edgesOnlyB: []});
  }, 60_000);
});

describe("a Pitched side at the wire's pitch bounds builds clean (decision 143, F4)", () => {
  /** A file with every Pitched side solved at `deg`. */
  const atPitch = (f: ShellFixture, deg: number): ShellFixture => {
    const wire = writeInput(f);
    for (const r of wire.rings) for (const s of r.sides) if (s.solved.form === 'Pitched') s.solved.pitchDegrees = deg;
    return read(wire, `${f.name}At${deg}`);
  };
  const CASES = [...SEED_FIXTURES.map(fixtureByName), {name: 'Ring1000x400', cellSize: 50, storeyHeight: 250, rings: [ring([0, 0, 1000, 400], 0, 1, 30)]}]
    .flatMap(f => [WIRE_MIN_PITCH_DEG, WIRE_MAX_PITCH_DEG].map(deg => [`${f.name} at ${deg}°`, f, deg] as const));

  /**
   * Measured at WP5.2, a finding, not a waiver: BridgeOverBlock's block roof, steep enough (40° and up), reaches the
   * bridge's floor across the tunnel between the towers. From 40° to 50° the shell measures genus 2 with 4 Unclassified
   * Edges, from 55° genus 0 with 2. Its Rings predict 1: a roof reaching the storey two above is the slab prediction's
   * documented gap (`TallRoofThroughTunnel60`), and the Unclassified Edges are the pipeline's. Every other seed, and
   * the 1000×400 Ring, is clean at both bounds. Pinned exactly, so a cure or a narrowed bound breaks it.
   */
  const KNOWN: Readonly<Record<string, string[]>> = {
    'BridgeOverBlock at 75°': ['summed genus 0, predicted 1 from the Rings (journal decision 143)', '2 Unclassified Edges: (200, 533.0126953125, 500) to (800, 533.0126953125, 500); (200, 66.9873046875, 500) to (800, 66.9873046875, 500)'],
  };

  it.each(CASES)('%s', async (name, f, deg) => {
    const g = atPitch(f, deg);
    expect(wireInvariantViolations(await buildShellDetailed(g), g, 0)).toEqual(KNOWN[name] ?? []);
  }, 60_000);
});
