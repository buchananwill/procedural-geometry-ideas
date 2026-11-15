// Holed roof decisions 38 to 40: the holed fixtures, each one storey, every Ring hipped at 30°, roofed by the skeleton of
// its outline and its holes. Each keeps spec decision 32's invariants with its genus per component its hole count, has
// no surviving Internal face, no conflict, no Gable or Cheek face, a solve that tiles its footprint, and stands at the
// L-infinity oracle's height, `plate + tan 30 · d∞`, at its listed points (decision 38). The layouts the holed solve once
// refused, cured by the skeleton's flat-ring and third-front rules, are held to the same, to the roof checker, and to the
// oracle over a 10 cm grid (skeleton flat-ring and third-front spec, decision 52).
import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {SHELL_TOLERANCE_CM} from '../src/constants.ts';
import {HOLED_FIXTURES, ShellFixture, fixtureByName, storeyRects} from '../src/fixture.ts';
import {readInput} from '../src/wire/input-adapter.ts';
import {roofViolations} from './roof-coverage.ts';
import {loopWeights} from '../src/roof/algoB.ts';
import {Pt, polyArea, unionLoops} from '../src/roof/model.ts';
import {solveFaces} from '../src/roof/skeleton.ts';
import {ShellBuild} from '../src/shell.ts';
import {planStorey} from '../src/storey.ts';
import {invariantViolations, planHolds} from './shell-invariants.ts';
import {COURTYARD_JUT_WING_AS_DRAWN} from './robustness-fixtures.ts';
import {memoBuilds} from './test-builds.ts';

const t30 = Math.tan(Math.PI / 6);
const PLATE = 250;
const tol = SHELL_TOLERANCE_CM;
const build = memoBuilds();

/** The L-infinity distance from (x, y) to the nearest wall of storey 0's union loops: the roof's own oracle. */
function dInf(f: ShellFixture, x: number, y: number): number {
  let d = Infinity;
  for (const loop of unionLoops(storeyRects(f, 0))) {
    loop.forEach((a: Pt, i) => {
      const b = loop[(i + 1) % loop.length];
      const [lo, hi, along, at, across] = a.y === b.y
        ? [Math.min(a.x, b.x), Math.max(a.x, b.x), x, a.y, y]
        : [Math.min(a.y, b.y), Math.max(a.y, b.y), y, a.x, x];
      d = Math.min(d, Math.max(Math.max(lo - along, 0, along - hi), Math.abs(across - at)));
    });
  }
  return d;
}

/** The top of a build's Roof faces over plan point (x, y), or NaN where none holds it. */
function roofTop(b: ShellBuild, x: number, y: number): number {
  const zs = b.shell.faces.filter(f => f.tag.kind === 'Roof' && planHolds(f, x, y)).map(f => (f.offset - f.normal[0] * x - f.normal[1] * y) / f.normal[2]);
  return zs.length ? Math.max(...zs) : NaN;
}

/**
 * The cured layouts (flat-ring and third-front spec, decision 52): the ten `HOLED_REFUSALS` once held and the user's
 * `CourtL-draft`, each with its genus and two oracle points, the first at or beside the node the rules made.
 */
const CURED: readonly [name: string, genus: number[], points: [number, number][]][] = [
  ['CourtL', [1], [[850, 150], [1200, 150]]],
  ['JutMidWall', [1], [[150, 150], [-125, 500]]],
  ['BandRunsOnPastWing', [1], [[150, 150], [-125, 150]]],
  ['BandRunsOnPastWingMirrorY', [1], [[150, 850], [-125, 850]]],
  ['JutAlignedS', [1], [[150, 400], [-125, 400]]],
  ['JutAlignedN', [1], [[150, 600], [-125, 600]]],
  ['JutBelowWing', [1], [[150, 150], [-125, 200]]],
  ['JutBelowWingMirrorY', [1], [[150, 850], [-125, 800]]],
  ['TwoHolesProbe', [2], [[50, 50], [350, 150]]],
  ['TwoCourtyardsDraft', [2], [[150, 150], [800, 500]]],
  ['CourtL-draft', [1], [[850, 150], [1550, 150]]],
];
const CURED_CASES = CURED.map(([name, genus, points]): [string, () => ShellFixture, number[], [number, number][]] =>
  [name, () => holed(name), genus, points]);

/** Each holed fixture, its genus per component (its hole counts, highest first) and the points its oracle is read at. */
const CASES: readonly [name: string, fixture: () => ShellFixture, genus: number[], points: [number, number][]][] = [
  ['Courtyard', () => fixtureByName('Courtyard'), [1], [[500, 150], [150, 500], [850, 850], [75, 500], [500, 225], [150, 150]]],
  ['CourtyardWingsBothSides', () => holed('CourtyardWingsBothSides'), [1], [[-50, 500], [100, 500], [900, 500], [1100, 500], [500, 150], [-125, 500], [150, 150]]],
  ['CourtyardJutWing', () => holed('CourtyardJutWing'), [1], [[-50, 500], [100, 500], [500, 150], [850, 500], [-125, 500]]],
  ['TwoCourtyards', () => holed('TwoCourtyards'), [2], [[900, 500], [150, 500], [1650, 500], [500, 150], [1300, 850]]],
  ['CourtyardInCourtyard', () => holed('CourtyardInCourtyard'), [1, 1], [[150, 1000], [1000, 150], [725, 1000], [1000, 1275], [150, 150]]],
  ...CURED_CASES,
];

function holed(name: string): ShellFixture {
  const f = HOLED_FIXTURES.find(x => x.name === name);
  if (!f) throw new Error(`no holed fixture ${name}`);
  return f;
}

describe('the holed fixtures (holed roof decision 39)', () => {
  it('lists the four the spec names and the cured layouts, each one storey of Rings hipped at 30 degrees', () => {
    expect(HOLED_FIXTURES.map(f => f.name)).toEqual(['CourtyardWingsBothSides', 'CourtyardJutWing', 'TwoCourtyards', 'CourtyardInCourtyard',
      ...CURED.map(([name]) => name)]);
    for (const f of HOLED_FIXTURES) expect(f.rings.every(r => r.baseStorey === 0 && r.storeys === 1 && r.defaultDeg === 30 && !Object.keys(r.sides ?? {}).length)).toBe(true);
  });

  it('holds CourtyardJutWing as the tests drew it: the Rings of BSA.F88, the W wing jutting 250 cm', () => {
    expect(holed('CourtyardJutWing')).toEqual(COURTYARD_JUT_WING_AS_DRAWN);
  });
});

describe.each(CASES)('%s (holed roof decision 40)', (_, fixture, genus, points) => {
  it('keeps spec decision 32\'s invariants with its genus per component its hole count, with no conflict and no Gable or Cheek face', async () => {
    const b = await build(fixture());
    expect(invariantViolations(b, {genus, cheeks: 0})).toEqual([]);
    expect(b.shell.report.survivingInternal).toBe(0);
    expect(b.shell.report.conflicts).toEqual([]);
    expect(b.shell.faces.filter(f => f.tag.kind === 'Gable' || f.tag.kind === 'Cheek')).toEqual([]);
  });

  it('has a hole count per island that is its genus, and a solve that tiles each island to 1e-9', () => {
    const {building} = planStorey(fixture(), 0);
    expect(building.comps.map(c => c.holes.length).sort((p, q) => q - p)).toEqual(genus);
    for (const c of building.comps) {
      const r = solveFaces(c, loopWeights(c));
      if (!r.ok) throw new Error(`${r.kind}: ${r.cause}`);
      expect(r.tilingError).toBeLessThan(1e-9);
    }
  });

  it.each(points)('stands at 250 + tan 30 · d∞ at (%i, %i)', async (x, y) => {
    const want = PLATE + t30 * dInf(fixture(), x, y);
    expect(Math.abs(roofTop(await build(fixture()), x, y) - want)).toBeLessThanOrEqual(tol);
  });
});

describe('the closed forms the spec states (holed roof decision 39)', () => {
  it('Courtyard: its ridge loop at 250 + 150 tan 30 = 336.603, outer faces of 127,500 cm² and hole faces of 82,500 cm² in plan', async () => {
    expect(PLATE + 150 * t30).toBeCloseTo(336.603, 3);
    const b = await build(fixtureByName('Courtyard'));
    const top = Math.max(...b.shell.faces.flatMap(f => f.loops.flat().map(p => p[2])));
    expect(Math.abs(top - (PLATE + 150 * t30))).toBeLessThanOrEqual(tol);
    const {building, roof} = planStorey(fixtureByName('Courtyard'), 0);
    expect(building.comps).toHaveLength(1);
    const area = (loop: number): number[] => roof.faces.filter(f => f.wall.loop === loop).map(f => Math.abs(polyArea(f.poly)));
    for (const a of area(0)) expect(a).toBeCloseTo(127_500, 6);
    for (const a of area(1)) expect(a).toBeCloseTo(82_500, 6);
    expect(area(0)).toHaveLength(4);
    expect(area(1)).toHaveLength(4);
  });

  it('CourtyardWingsBothSides (BSA.F90): its top at 250 + 200 tan 30 = 365.47, on y = 500 over x [-50, 100] and [900, 1100]', async () => {
    const b = await build(holed('CourtyardWingsBothSides'));
    const want = PLATE + 200 * t30;
    expect(want).toBeCloseTo(365.47, 2);
    const top = Math.max(...b.shell.faces.flatMap(f => f.loops.flat().map(p => p[2])));
    expect(Math.abs(top - want)).toBeLessThanOrEqual(tol);
    for (const x of [-50, 0, 50, 100, 900, 1000, 1100]) expect(Math.abs(roofTop(b, x, 500) - want), `x = ${x}`).toBeLessThanOrEqual(tol);
    // Its fifth Ring lies inside its third and is dropped (BSA.D261).
    expect(b.shell.report.droppedRings).toEqual([4]);
  });

  it('TwoCourtyards: genus 2, the middle wing\'s top at 250 + 200 tan 30 at (900, 500)', async () => {
    const b = await build(holed('TwoCourtyards'));
    expect(Math.abs(roofTop(b, 900, 500) - (PLATE + 200 * t30))).toBeLessThanOrEqual(tol);
  });

  it('CourtyardInCourtyard: two islands, each with its hole, ridges at 250 + 150 tan 30 and 250 + 125 tan 30', async () => {
    const b = await build(holed('CourtyardInCourtyard'));
    expect(Math.abs(roofTop(b, 150, 1000) - (PLATE + 150 * t30))).toBeLessThanOrEqual(tol);
    expect(Math.abs(roofTop(b, 725, 1000) - (PLATE + 125 * t30))).toBeLessThanOrEqual(tol);
    const {building} = planStorey(holed('CourtyardInCourtyard'), 0);
    expect(building.comps.map(c => [Math.abs(polyArea(c.outer)), c.holes.map(h => Math.abs(polyArea(h)))])).toEqual([[2000 * 2000, [1400 * 1400]], [800 * 800, [300 * 300]]]);
  });
});

/** Worst departure of a build's roof from `plate + tan 30 · d∞` over a 10 cm grid inside the footprint's Rings. */
function gridOracleError(f: ShellFixture, b: ShellBuild): {worst: number; at: string; samples: number} {
  const rects = f.rings.map(r => r.rect);
  const xs = rects.flatMap(r => [r[0], r[2]]), ys = rects.flatMap(r => [r[1], r[3]]);
  let worst = 0, at = '-', samples = 0;
  for (let x = Math.min(...xs) + 3.7; x < Math.max(...xs); x += 10) {
    for (let y = Math.min(...ys) + 2.9; y < Math.max(...ys); y += 10) {
      if (!rects.some(([x0, y0, x1, y1]) => x > x0 && x < x1 && y > y0 && y < y1)) continue;
      const z = roofTop(b, x, y);
      const error = Number.isNaN(z) ? Infinity : Math.abs(z - (PLATE + t30 * dInf(f, x, y)));
      samples++;
      if (error > worst) { worst = error; at = `(${x.toFixed(1)}, ${y.toFixed(1)})`; }
    }
  }
  return {worst, at, samples};
}

describe.each(CURED.map(([name]) => name))('%s, cured by the skeleton\'s flat-ring and third-front rules (decision 52)', name => {
  it('passes the roof checker', async () => {
    const f = holed(name);
    expect(roofViolations((await build(f)).union, f.rings.map(r => r.rect))).toEqual([]);
  });

  it('stands at 250 + tan 30 · d∞ over a 10 cm grid', async () => {
    const f = holed(name);
    const {worst, at, samples} = gridOracleError(f, await build(f));
    expect(samples).toBeGreaterThan(1000);
    expect({worst: worst <= tol, at}).toEqual({worst: true, at});
  });
});

describe('the user\'s layout, CourtL-draft (decision 52)', () => {
  it('is the user\'s committed input, fixtures/user/CourtL-draft.input.json, read as it came', () => {
    const json = JSON.parse(readFileSync(new URL('../fixtures/user/CourtL-draft.input.json', import.meta.url), 'utf8'));
    const read = readInput(json, 'CourtL-draft');
    if (!read.ok) throw new Error(read.errors.join(' | '));
    const shape = (f: ShellFixture) => f.rings.map(r => ({rect: r.rect, baseStorey: r.baseStorey, storeys: r.storeys, deg: r.defaultDeg}));
    expect(shape(read.fixture)).toEqual(shape(holed('CourtL-draft')));
  });
});
