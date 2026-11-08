// Journal decisions 125, 126, 140 and 148: the asymmetric-building test, and the byte-identical round trip. An L with one gabled side goes from fixture to
// `input@1` JSON and back, and winding and side ownership survive: the wire's corners have positive signed area with
// each side on its compass side, the fixture read back means the one written, and the two shells' canonical forms
// agree. The L is asymmetric, so a mirrored reading cannot pass: its mirror image measures a different canonical form.
import {beforeAll, describe, expect, it} from 'vitest';
import {EXPORTED_FIXTURES, FixtureRing, RING_SIDES, RingSide, ShellFixture, fixtureByName, ring} from '../src/fixture.ts';
import {ringSideLines} from '../src/ring-forms.ts';
import {BuildingShell, buildShell, buildShellDetailed} from '../src/shell.ts';
import {canonicalOfShell, diffCanonical, isEmptyDiff} from '../src/wire/canonical.ts';
import {SEED_FIXTURES} from '../src/wire/export-playtest.ts';
import {readInput, writeInput} from '../src/wire/input-adapter.ts';
import {WIRE_MAX_PITCH_DEG, WIRE_MIN_PITCH_DEG, WireVec2} from '../src/wire/input-types.ts';
import {
  ASYMMETRIC_L, CUT_REPRODUCERS, DiffCounts, IDENTITY_FIXTURES, diffCounts, expectedDefaultDeg, scrambled, withWireDefaults,
} from './wire-round-trip-cases.ts';
import {rosterGenus} from './roster-genus.ts';
import {invariantViolations} from './shell-invariants.ts';

/** The L reflected in x = 500: the W gable becomes an E gable on x = 1000. */
const MIRRORED_L: ShellFixture = {
  name: 'AsymmetricLMirrored', cellSize: 50, storeyHeight: 250,
  rings: [ring([0, 0, 1000, 400], 0, 1, 40, {E: {form: 'gable'}}), ring([0, 0, 400, 800], 0, 1, 40)],
};

/**
 * A wire file through JSON and the adapter, read back. It raises no flag, or with `allowed` only flags matching it.
 */
function read(json: unknown, name: string, allowed?: RegExp): ShellFixture {
  const r = readInput(JSON.parse(JSON.stringify(json)), name);
  if (!r.ok) throw new Error(`${name} refused: ${r.errors.join('; ')}`);
  expect(r.report.flags.filter(f => !allowed?.test(f))).toEqual([]);
  return r.fixture;
}

/** A scrambled file's one flag (decision 152): its root order no longer follows its model order. */
const ORDER_FLAG = /^model-index order and ring \(root\) order disagree/;
const throughWire = (f: ShellFixture): ShellFixture => read(writeInput(f), f.name);

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
    expect(wire.rings.map(r => r.sides.map(s => s.runs.map(run => run.form).join()))).toEqual([
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
    wire.rings[0].sides[3].runs[0].pitchDegrees = deg;
    const f = read(wire, `AsymmetricLGable${deg}`);
    const b = await buildShellDetailed(f);
    expect(invariantViolations(b, {genus: [0], cheeks: 0})).toEqual([]);
    expect(isEmptyDiff(diffCanonical(canonicalOfShell(get('original')), canonicalOfShell(b.shell)))).toBe(true);
  });
});

/**
 * Measured at WP3.8, a finding, not a waiver: where a fixture's shell depends on what the wire does not carry, the
 * authored shell and the one the wire reads back differ, with these canonical diff counts. Each is a split-band
 * courtyard every side of whose Rings is gabled but the far band's, authored at a Ring default of 60: the wire carries
 * no default, so an all-gable Ring reads its gables' skeleton weight as `WIRE_GABLE_ONLY_DEG = 45` (decision 140, F4),
 * and on an island whose gables meet one another the weight moves the roof. This contradicts decision 140, F1's
 * "between 20° and 89° it changes nothing" on such islands; no exported fixture reaches it.
 */
const WIRE_UNCARRIED: Readonly<Partial<Record<string, DiffCounts>>> = {
  'H300-700B100S310D60n': {"facesOnlyA":11,"facesOnlyB":11,"edgesOnlyA":21,"edgesOnlyB":21},
  'H300-700B100S500D60n': {"facesOnlyA":11,"facesOnlyB":11,"edgesOnlyA":21,"edgesOnlyB":21},
  'H300-700B150S310D60n': {"facesOnlyA":11,"facesOnlyB":11,"edgesOnlyA":21,"edgesOnlyB":21},
  'H300-700B150S500D60n': {"facesOnlyA":11,"facesOnlyB":11,"edgesOnlyA":21,"edgesOnlyB":21},
  'H300-700B200S310D60n': {"facesOnlyA":11,"facesOnlyB":11,"edgesOnlyA":21,"edgesOnlyB":21},
  'H300-700B200S500D60n': {"facesOnlyA":11,"facesOnlyB":11,"edgesOnlyA":21,"edgesOnlyB":21},
  'H400-600B100S410D60n': {"facesOnlyA":11,"facesOnlyB":11,"edgesOnlyA":21,"edgesOnlyB":21},
  'H400-600B100S500D60n': {"facesOnlyA":11,"facesOnlyB":11,"edgesOnlyA":21,"edgesOnlyB":21},
  'H400-600B150S410D60n': {"facesOnlyA":11,"facesOnlyB":11,"edgesOnlyA":21,"edgesOnlyB":21},
  'H400-600B150S500D60n': {"facesOnlyA":11,"facesOnlyB":11,"edgesOnlyA":21,"edgesOnlyB":21},
  'H400-600B200S410D60n': {"facesOnlyA":11,"facesOnlyB":11,"edgesOnlyA":21,"edgesOnlyB":21},
  'H400-600B200S500D60n': {"facesOnlyA":11,"facesOnlyB":11,"edgesOnlyA":21,"edgesOnlyB":21},
  'H450-550B100S460D60n': {"facesOnlyA":11,"facesOnlyB":11,"edgesOnlyA":21,"edgesOnlyB":21},
  'H450-550B100S500D60n': {"facesOnlyA":11,"facesOnlyB":11,"edgesOnlyA":21,"edgesOnlyB":21},
  'H450-550B150S460D60n': {"facesOnlyA":11,"facesOnlyB":11,"edgesOnlyA":21,"edgesOnlyB":21},
  'H450-550B150S500D60n': {"facesOnlyA":11,"facesOnlyB":11,"edgesOnlyA":21,"edgesOnlyB":21},
  'H450-550B200S460D60n': {"facesOnlyA":11,"facesOnlyB":11,"edgesOnlyA":21,"edgesOnlyB":21},
  'H450-550B200S500D60n': {"facesOnlyA":11,"facesOnlyB":11,"edgesOnlyA":21,"edgesOnlyB":21},
  'H470-530B100S480D60n': {"facesOnlyA":11,"facesOnlyB":11,"edgesOnlyA":21,"edgesOnlyB":21},
  'H470-530B100S500D60n': {"facesOnlyA":11,"facesOnlyB":11,"edgesOnlyA":21,"edgesOnlyB":21},
  'H470-530B150S480D60n': {"facesOnlyA":11,"facesOnlyB":11,"edgesOnlyA":21,"edgesOnlyB":21},
  'H470-530B150S500D60n': {"facesOnlyA":11,"facesOnlyB":11,"edgesOnlyA":21,"edgesOnlyB":21},
  'H470-530B200S480D60n': {"facesOnlyA":11,"facesOnlyB":11,"edgesOnlyA":21,"edgesOnlyB":21},
  'H470-530B200S500D60n': {"facesOnlyA":11,"facesOnlyB":11,"edgesOnlyA":21,"edgesOnlyB":21},
  'H490-510B100S500D60n': {"facesOnlyA":11,"facesOnlyB":11,"edgesOnlyA":21,"edgesOnlyB":21},
  'H490-510B150S500D60n': {"facesOnlyA":11,"facesOnlyB":11,"edgesOnlyA":21,"edgesOnlyB":21},
  'H490-510B200S500D60n': {"facesOnlyA":11,"facesOnlyB":11,"edgesOnlyA":21,"edgesOnlyB":21},
};

describe('every exported fixture through the wire', () => {
  const EXPORTED = [...EXPORTED_FIXTURES, ...CUT_REPRODUCERS].map(f => [f.name, f] as const);

  it.each(EXPORTED)('%s: reads back the fixture it wrote', (_, f) => {
    expect(meaning(throughWire(f), r => r.defaultDeg)).toEqual(meaning(f, expectedDefaultDeg));
  });

  // Decision 148, F2: the same engine on both sides is deterministic, so the BuildingShell JSON, Cells included, is
  // byte-identical after the round trip, written plainly and scrambled, to the fixture as the wire reads it.
  it.each(IDENTITY_FIXTURES.map(f => [f.name, f] as const))('%s: builds a byte-identical BuildingShell after the round trip, plain and scrambled', async (_, f) => {
    const want = JSON.stringify(await buildShell(withWireDefaults(f)));
    expect(JSON.stringify(await buildShell(throughWire(f)))).toBe(want);
    expect(JSON.stringify(await buildShell(read(scrambled(f), f.name, ORDER_FLAG)))).toBe(want);
  }, 60_000);

  it.each(IDENTITY_FIXTURES.map(f => [f.name, f] as const))('%s: builds the shell it was authored as, or exactly its measured difference', async (name, f) => {
    const authored = await buildShell(f), read = await buildShell(withWireDefaults(f));
    const counts = JSON.stringify(authored) === JSON.stringify(read) ? undefined : diffCounts(diffCanonical(canonicalOfShell(authored), canonicalOfShell(read)));
    expect(counts).toEqual(WIRE_UNCARRIED[name]);
  }, 60_000);
});

describe("a Pitched side at the wire's pitch bounds builds clean (decision 143, F4)", () => {
  /** A file with every Pitched side solved at `deg`. */
  const atPitch = (f: ShellFixture, deg: number): ShellFixture => {
    const wire = writeInput(f);
    for (const r of wire.rings) for (const s of r.sides) for (const run of s.runs) if (run.form === 'Pitched') run.pitchDegrees = deg;
    return read(wire, `${f.name}At${deg}`);
  };
  const CASES = [...SEED_FIXTURES.map(fixtureByName), {name: 'Ring1000x400', cellSize: 50, storeyHeight: 250, rings: [ring([0, 0, 1000, 400], 0, 1, 30)]}]
    .flatMap(f => [WIRE_MIN_PITCH_DEG, WIRE_MAX_PITCH_DEG].map(deg => [`${f.name} at ${deg}°`, f, deg] as const));

  /**
   * Measured at WP5.2 and WP3.8, a finding, not a waiver: BridgeOverBlock's block roof, steep enough (40° and up),
   * reaches the bridge's floor across the tunnel between the towers. From 40° to 51° the shell measures genus 2, from
   * 51.5° genus 0, against its roster genus 1; the edges there are SoffitJunction (decision 146, F52). Every other
   * seed, and the 1000×400 Ring, is clean at both bounds. The widened sweep in robustness.test.ts holds the rest.
   * Pinned exactly, so a cure or a narrowed bound breaks it.
   */
  const KNOWN: Readonly<Partial<Record<`${string} at ${number}°`, string[]>>> = {
    'BridgeOverBlock at 75°': ['genus per component 0, expected 1: genus 0 at (0, 0, 0)'],
  };

  it.each(CASES)('%s', async (name, f, deg) => {
    const g = atPitch(f, deg);
    const genus = f.name === 'Ring1000x400' ? [0] : rosterGenus(f.name);
    expect(invariantViolations(await buildShellDetailed(g), {genus, cheeks: 0})).toEqual(KNOWN[name] ?? []);
  }, 60_000);
});
