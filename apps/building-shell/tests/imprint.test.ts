// Spec decision 15 as amended (journal decision 111, F41): the imprint cuts the union along every winner boundary
// before any tag is decided, so every output triangle lies wholly within one winning region. The invariant runs on
// every fixture and on the robustness sets; the 300 cm cases a corner probe found mislabelled are named regressions.
import {beforeAll, describe, expect, it} from 'vitest';
import {SHELL_FIXTURES, STOREY_HEIGHT_CM, ShellFixture, ring} from '../src/fixture.ts';
import {getManifold} from '../src/manifold.ts';
import {makeRegionModel} from '../src/regions.ts';
import {FaceTag} from '../src/tags.ts';
import {ShellUnion, retagPass, taggedArea, unionParts, unionShell} from '../src/union.ts';
import {REVIEWER_STOREY_HEIGHT_CM, randomFixtures, sweepFixtures} from './robustness-fixtures.ts';
import {AREA_TOL} from './shell-invariants.ts';
import {winningRegionViolations} from './winning-regions.ts';

const kindOf = (kind: FaceTag['kind'], storey: number) => (t: FaceTag): boolean => t.kind === kind && t.storey === storey;

/** Every robustness case, as the robustness gate runs them: the pitch sweep and seed 1's 80 random fixtures. */
const robustnessCases = (h: number): ShellFixture[] => [...sweepFixtures(h), ...randomFixtures(1, 80, h)];

/**
 * The cases the imprint cuts, as measured. At 300 cm: the five a corner probe found mislabelled (P36.089u, P39.376u,
 * P49.583u, P55.984u, Fuzz47), and P30.380u and P31.937u, whose straddling triangles the centroid happened to tag
 * right. At 250: P45.085u and Fuzz47. Among the fixtures, NarrowUpperStoreyGabled alone (F41).
 */
const IMPRINTED: Record<number, string[]> = {
  300: ['Fuzz47', 'P30.380u', 'P31.937u', 'P36.089u', 'P39.376u', 'P49.583u', 'P55.984u'],
  250: ['Fuzz47', 'P45.085u'],
};

/** The 300 cm cases the corner probe found mislabelled (journal decision 111). */
const REGRESSIONS = ['P36.089u', 'P39.376u', 'P49.583u', 'P55.984u', 'Fuzz47'];

/** The region invariant's verdict on the same union with the imprint left out: cleaned, then re-tagged as it stands. */
async function withoutImprint(u: ShellUnion): Promise<string[]> {
  const wasm = await getManifold();
  const bare = unionParts(wasm, u.parts, u.tags.planes);
  const {triTags} = retagPass(u.label, bare.mesh, makeRegionModel(u.parts, u.tags));
  return winningRegionViolations({...u, mesh: bare.mesh, triTags});
}

describe('the imprint on the fixtures (spec decision 15 as amended)', () => {
  const results = new Map<string, ShellUnion>();
  beforeAll(async () => {
    for (const f of SHELL_FIXTURES) results.set(f.name, await unionShell(f));
  }, 120_000);
  const get = (name: string): ShellUnion => {
    const u = results.get(name);
    if (!u) throw new Error(`no union built for ${name}`);
    return u;
  };

  it.each(SHELL_FIXTURES.map(f => [f.name]))('%s: every output triangle lies within one winning region, tagged its winner', name => {
    expect(winningRegionViolations(get(name))).toEqual([]);
  });

  it('cuts NarrowUpperStoreyGabled alone, and leaves it closed', () => {
    expect(SHELL_FIXTURES.filter(f => get(f.name).imprint.added > 0).map(f => f.name)).toEqual(['NarrowUpperStoreyGabled']);
    const u = get('NarrowUpperStoreyGabled');
    expect(u.imprint.split).toBeGreaterThan(0);
    expect({status: u.status, closed: u.closed, genus: u.genus}).toEqual({status: 'NoError', closed: true, genus: 0});
  });

  it("gives NarrowUpperStoreyGabled storey 1's Wall 50000 and storey 0's Gable 105884.6 (F41)", () => {
    const u = get('NarrowUpperStoreyGabled');
    expect(Math.abs(taggedArea(u, kindOf('Wall', 1)) - 200 * STOREY_HEIGHT_CM)).toBeLessThan(AREA_TOL);
    expect(Math.abs(taggedArea(u, kindOf('Gable', 0)) - (90000 * Math.sqrt(3) - 200 * STOREY_HEIGHT_CM))).toBeLessThan(AREA_TOL);
  });

  it('is what the invariant needs: without it, NarrowUpperStoreyGabled straddles (positive control)', async () => {
    expect((await withoutImprint(get('NarrowUpperStoreyGabled'))).some(v => v.includes('straddles'))).toBe(true);
  });
});

describe.each([REVIEWER_STOREY_HEIGHT_CM, STOREY_HEIGHT_CM])('the imprint on the robustness sets at %i cm storeys', h => {
  const cases = robustnessCases(h);
  const results = new Map<string, ShellUnion>();
  beforeAll(async () => {
    for (const f of cases) results.set(f.name, await unionShell(f));
  }, 300_000);

  it('runs every sweep and random case', () => {
    expect(results.size).toBe(660);
  });

  it('keeps every output triangle within one winning region, tagged its winner, in every case', () => {
    const found = [...results.values()].flatMap(u => winningRegionViolations(u));
    expect(found).toEqual([]);
  });

  it('cuts exactly the measured cases, each left a closed manifold of genus 0', () => {
    const cut = [...results.values()].filter(u => u.imprint.added > 0);
    expect(cut.map(u => u.label).sort()).toEqual(IMPRINTED[h]);
    for (const u of cut) expect({label: u.label, status: u.status, closed: u.closed, genus: u.genus}).toEqual({label: u.label, status: 'NoError', closed: true, genus: 0});
  });
});

describe('the corner probe\'s mislabelled cases (journal decision 111): named regressions at 300 cm', () => {
  const all = robustnessCases(REVIEWER_STOREY_HEIGHT_CM);
  it.each(REGRESSIONS)('%s: straddles without the imprint; with it, is cut and every triangle lies within one region', async name => {
    const f = all.find(c => c.name === name);
    if (!f) throw new Error(`no robustness case ${name}`);
    const u = await unionShell(f);
    expect((await withoutImprint(u)).some(v => v.includes('straddles'))).toBe(true);
    expect(u.imprint.split).toBeGreaterThan(0);
    expect(u.closed).toBe(true);
    expect(winningRegionViolations(u)).toEqual([]);
  });
});

/**
 * Journal decision 122, F-A: the combined reviewer's off-centre cases (probe A), storey 0 `[0,0,600,600]` gabled on
 * y = 0 at 60 degrees under a gabled storey 1. With the imprint left out, seven sample points per triangle found no
 * straddle in these three, and a dense check did; the exact polygon test finds it.
 */
const offCentre = (name: string, upper: [number, number, number, number]): ShellFixture => ({
  name, cellSize: 50, storeyHeight: STOREY_HEIGHT_CM,
  rings: [ring([0, 0, 600, 600], 0, 1, 60, {S: {form: 'gable'}}), ring(upper, 1, 1, 45, {S: {form: 'gable'}})],
});

describe.each([
  ['OffE60', [150, 0, 250, 200]], ['OffF60', [160, 0, 290, 200]], ['OffG60', [350, 0, 450, 200]],
] as const)("F-A's reproducer %s", (name, upper) => {
  it('straddles without the imprint, by the exact test; with it, every triangle lies within one region', async () => {
    const u = await unionShell(offCentre(name, [...upper]));
    expect((await withoutImprint(u)).some(v => v.includes('straddles'))).toBe(true);
    expect(u.imprint.split).toBeGreaterThan(0);
    expect(winningRegionViolations(u)).toEqual([]);
  });
});
