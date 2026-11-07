// Steps 2 and 3: the one union and the re-tag pass (spec decisions 12 to 17), decision 32's WP2 invariants on every
// fixture, and the tagged-area assertions of decisions 34 and 35.
import {beforeAll, describe, expect, it} from 'vitest';
import {SHELL_TOLERANCE_CM} from '../src/constants.ts';
import {SHELL_FIXTURES, fixtureByName} from '../src/fixture.ts';
import {FaceTag} from '../src/tags.ts';
import {ShellUnion, areaByIdentity, taggedArea, triArea, unionShell} from '../src/union.ts';

/**
 * Tagged areas are asserted to 0.05 cm², half the last digit the spec quotes (95884.6). Every corner here is on the
 * 1/1024 cm grid; the Gable apex's snap moves its area by 0.0024 cm².
 */
const AREA_TOL = 0.05;

const results = new Map<string, ShellUnion>();
beforeAll(async () => {
  for (const f of SHELL_FIXTURES) results.set(f.name, await unionShell(f));
}, 120_000);
const get = (name: string): ShellUnion => results.get(name)!;

const kindOf = (kind: FaceTag['kind'], storey: number) => (t: FaceTag): boolean => t.kind === kind && t.storey === storey;

/** The output area of `pred`'s triangles lying on the plane y = 0 (outward -y), and off it. */
function splitByY0(u: ShellUnion, pred: (t: FaceTag) => boolean): {on: number; off: number} {
  const P = u.mesh.positions;
  const onY0 = (t: number): boolean => [0, 1, 2].every(j => Math.abs(P[3 * u.mesh.tris[3 * t + j] + 1]) <= SHELL_TOLERANCE_CM);
  const out = {on: 0, off: 0};
  u.triTags.forEach((tag, t) => {
    if (pred(tag)) out[onY0(t) ? 'on' : 'off'] += triArea(u.mesh, t);
  });
  return out;
}

describe('decision 32 invariants (WP2 part)', () => {
  it.each(SHELL_FIXTURES.map(f => [f.name]))('%s: status OK, closed, survivingInternal 0, cheeks 0', name => {
    const u = get(name);
    expect(u.status).toBe('NoError');
    expect(u.closed).toBe(true);
    expect(u.survivingInternal).toBe(0);
    expect(u.cheeks).toBe(0);
  });

  it.each(SHELL_FIXTURES.map(f => [f.name]))('%s: every output triangle carries a faceID some raw part issued', name => {
    const u = get(name);
    expect(u.triTags.length * 3).toBe(u.mesh.tris.length);
    for (const f of u.mesh.faceIDs) expect(u.tags.table[f]).toBeDefined();
  });
});

describe.each(['NarrowUpperStorey', 'NarrowUpperStoreyGabled'])('%s (decisions 34 and 35)', name => {
  it('has no Roof face of storey 1', () => {
    expect(taggedArea(get(name), kindOf('Roof', 1))).toBeLessThan(SHELL_TOLERANCE_CM ** 2);
  });

  it("has storey 1's Wall area only on y = 0, totalling 60000", () => {
    const {on, off} = splitByY0(get(name), kindOf('Wall', 1));
    expect(Math.abs(on - 60000)).toBeLessThan(AREA_TOL);
    expect(off).toBeLessThan(SHELL_TOLERANCE_CM ** 2);
  });

  it("has storey 0's Gable area 155884.6 - 60000 = 95884.6", () => {
    expect(Math.abs(taggedArea(get(name), kindOf('Gable', 0)) - (90000 * Math.sqrt(3) - 60000))).toBeLessThan(AREA_TOL);
  });

  it('has no surviving storey-1 Gable', () => {
    expect(taggedArea(get(name), kindOf('Gable', 1))).toBeLessThan(SHELL_TOLERANCE_CM ** 2);
  });
});

describe('NarrowUpperStoreyGabled equals NarrowUpperStorey', () => {
  it('in every tagged area, by identity', () => {
    const ka = areaByIdentity(get('NarrowUpperStorey'), () => true);
    const kb = areaByIdentity(get('NarrowUpperStoreyGabled'), () => true);
    expect([...kb.keys()].sort()).toEqual([...ka.keys()].sort());
    for (const [k, area] of ka) expect(Math.abs(kb.get(k)! - area)).toBeLessThan(AREA_TOL);
  });
});

describe('conflicts (decision 15)', () => {
  it('lists the flush wall over the lower Gable, and the lower Gable over the upper one', () => {
    expect(get('NarrowUpperStorey').conflicts).toEqual([
      'NarrowUpperStorey: n=(0.000000, -1.000000, 0.000000) d=0.000: Wall storey 1 wall 0 (part 3) over Gable storey 0 wall 0 (part 2)',
    ]);
    expect(get('NarrowUpperStoreyGabled').conflicts).toEqual([
      'NarrowUpperStoreyGabled: n=(0.000000, -1.000000, 0.000000) d=0.000: Gable storey 0 wall 0 (part 2) over Gable storey 1 wall 0 (part 5)',
      'NarrowUpperStoreyGabled: n=(0.000000, -1.000000, 0.000000) d=0.000: Wall storey 1 wall 0 (part 3) over Gable storey 0 wall 0 (part 2)',
    ]);
  });

  it('carries every conflict with its fixture name and plane', () => {
    for (const [name, u] of results) for (const c of u.conflicts) expect(c.startsWith(`${name}: n=(`)).toBe(true);
  });
});

describe('raw parts stay addressable after the union (decision 29)', () => {
  it('keeps every part with its soup, storey and name', () => {
    const u = get('NarrowUpperStoreyGabled');
    expect(u.parts.map(p => [p.id, p.kind, p.storey])).toEqual([
      [0, 'wallPrism', 0], [1, 'hip', 0], [2, 'gable', 0], [3, 'wallPrism', 1], [4, 'hip', 1], [5, 'gable', 1],
    ]);
    for (const p of u.parts) expect(p.soup.tris.length).toBeGreaterThan(0);
    expect(fixtureByName(u.label).name).toBe('NarrowUpperStoreyGabled');
  });
});
