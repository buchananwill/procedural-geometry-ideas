// Journal decisions 125 and 126: the asymmetric-building test. An L with one gabled side goes from fixture to
// `input@1` JSON and back, and winding and side ownership survive: the wire's corners wind counter-clockwise with each
// side on its compass side, the fixture read back is the one written, and the two shells' canonical forms agree. The L
// is asymmetric, so a mirrored reading cannot pass: its mirror image measures a different canonical form.
import {beforeAll, describe, expect, it} from 'vitest';
import {EXPORTED_FIXTURES, FixtureRing, RingSide, ShellFixture, ring} from '../src/fixture.ts';
import {ringSideLines} from '../src/ring-forms.ts';
import {BuildingShell, buildShell} from '../src/shell.ts';
import {canonicalOfShell, diffCanonical, isEmptyDiff} from '../src/wire/canonical.ts';
import {WIRE_SIDE_ORDER, readInput, writeInput} from '../src/wire/input-adapter.ts';
import type {WireVec2} from '../src/wire/refinements/building-shell-input.ts';

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

/** A fixture through the wire: written, serialised, parsed and read back. */
function throughWire(f: ShellFixture): ShellFixture {
  const r = readInput(JSON.parse(JSON.stringify(writeInput(f))), f.name);
  if (!r.ok) throw new Error(`${f.name} refused: ${r.errors.join('; ')}`);
  expect(r.flags).toEqual([]);
  return r.fixture;
}

/** A Ring's meaning: its rect, storeys, default pitch, and each compass side's form and pitch as spec decision 3 reads them. */
const resolved = (r: FixtureRing) => ({
  rect: r.rect, baseStorey: r.baseStorey, storeys: r.storeys, defaultDeg: r.defaultDeg,
  sides: Object.fromEntries(WIRE_SIDE_ORDER.map(s => [s, {form: r.sides?.[s]?.form ?? 'hip', deg: r.sides?.[s]?.deg ?? r.defaultDeg}])),
});
const meaning = (f: ShellFixture) => ({name: f.name, cellSize: f.cellSize, storeyHeight: f.storeyHeight, rings: f.rings.map(resolved)});

/** Whether a wire side's segment lies on the compass side of its Ring's rect. */
function onCompass(a: WireVec2, b: WireVec2, rect: FixtureRing['rect'], side: RingSide): boolean {
  const l = ringSideLines(rect)[side];
  return l.axis === 'y' ? a.y === l.at && b.y === l.at : a.x === l.at && b.x === l.at;
}

const shells = new Map<string, BuildingShell>();
beforeAll(async () => {
  shells.set('original', await buildShell(ASYMMETRIC_L));
  shells.set('round trip', await buildShell(throughWire(ASYMMETRIC_L)));
  shells.set('mirrored', await buildShell(MIRRORED_L));
}, 60_000);
const get = (k: string): BuildingShell => {
  const s = shells.get(k);
  if (!s) throw new Error(`no shell built for ${k}`);
  return s;
};

describe('the asymmetric L round trip', () => {
  it('writes every Ring counter-clockwise, each side i on its compass side and owned by corner i', () => {
    const wire = writeInput(ASYMMETRIC_L);
    wire.rings.forEach((r, k) => {
      const cs = r.corners;
      const area = cs.reduce((s, a, i) => s + a.x * cs[(i + 1) % 4].y - cs[(i + 1) % 4].x * a.y, 0) / 2;
      expect(area).toBeGreaterThan(0);
      WIRE_SIDE_ORDER.forEach((side, i) => expect(onCompass(cs[i], cs[(i + 1) % 4], ASYMMETRIC_L.rings[k].rect, side)).toBe(true));
    });
    expect(wire.rings.map(r => r.sides.map(s => s.solved.form))).toEqual([
      ['Pitched', 'Pitched', 'Pitched', 'GableEnd'],
      ['Pitched', 'Pitched', 'Pitched', 'Pitched'],
    ]);
    expect(wire.rings[0].corners[3]).toEqual({x: 0, y: 400}); // the gabled side 3 runs from corner 3 at x = 0
  });

  it('reads back the fixture it wrote', () => {
    expect(meaning(throughWire(ASYMMETRIC_L))).toEqual(meaning(ASYMMETRIC_L));
  });

  it('builds a shell whose canonical form is the original\'s', () => {
    const d = diffCanonical(canonicalOfShell(get('original')), canonicalOfShell(get('round trip')));
    expect(d).toEqual({facesOnlyA: [], facesOnlyB: [], edgesOnlyA: [], edgesOnlyB: []});
  });

  it('keeps its one Gable on x = 0', () => {
    const gables = get('round trip').faces.filter(f => f.tag.kind === 'Gable');
    expect(gables).toHaveLength(1);
    expect(gables[0].loops[0].every(p => p[0] === 0)).toBe(true);
  });

  it('is asymmetric: its mirror image differs in canonical form, so a mirrored adapter cannot pass', () => {
    expect(isEmptyDiff(diffCanonical(canonicalOfShell(get('original')), canonicalOfShell(get('mirrored'))))).toBe(false);
  });
});

describe('every exported fixture through the wire', () => {
  it.each(EXPORTED_FIXTURES.map(f => [f.name, f] as const))('%s: reads back the fixture it wrote', (_, f) => {
    expect(meaning(throughWire(f))).toEqual(meaning(f));
  });
});
