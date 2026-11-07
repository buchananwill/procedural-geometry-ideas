// The fixture roster (spec decisions 1 to 4, 34 to 40) and SingleStoreyT's tie to roof-gable case 2a.
import {describe, expect, it} from 'vitest';
import {SHELL_FIXTURES, fixtureByName, storeysOf} from '../src/fixture.ts';
import {CASES} from '../src/roof/cases.ts';
import {planStorey} from '../src/storey.ts';

describe('fixture roster', () => {
  it('holds every fixture spec decisions 34 to 40 name, cellSize 50 and storeyHeight 300', () => {
    expect(SHELL_FIXTURES.map(f => f.name)).toEqual([
      'NarrowUpperStorey', 'NarrowUpperStoreyGabled', 'TallerUpper', 'Overhang', 'OverhangApexOnEave',
      'Bridge', 'BridgeOverBlock', 'ValleyWings', 'ValleyWingsPierced', 'SingleStoreyT',
    ]);
    for (const f of SHELL_FIXTURES) {
      expect(f.cellSize).toBe(50);
      expect(f.storeyHeight).toBe(300);
      expect(Object.keys(f.roofs).map(Number)).toEqual(storeysOf(f));
    }
  });

  it('plans every storey: Bridge storeys 0 and 1 have two islands, storey 2 one', () => {
    for (const f of SHELL_FIXTURES) for (const n of storeysOf(f)) expect(() => planStorey(f, n)).not.toThrow();
    const bridge = fixtureByName('Bridge');
    expect(storeysOf(bridge).map(n => planStorey(bridge, n).building.comps.length)).toEqual([2, 2, 1]);
  });

  it('places storey N between N and N + 1 storey heights', () => {
    const plan = planStorey(fixtureByName('Bridge'), 2);
    expect([plan.floor, plan.plate]).toEqual([600, 900]);
  });
});

describe('SingleStoreyT is roof-gable case 2a', () => {
  it("its storey-0 Building matches CASES 2a's built Building: walls, forms, planes", () => {
    const ours = planStorey(fixtureByName('SingleStoreyT'), 0).building;
    const theirs = CASES.find(c => c.id === '2a')!.build();
    // tan(45 degrees) is 1 - 1.1e-16 in double precision, where case 2a passes tan 1: compare within 1e-12.
    const close = (a: number, b: number): void => expect(Math.abs(a - b)).toBeLessThan(1e-12);
    expect(ours.comps.length).toBe(theirs.comps.length);
    expect(ours.walls.length).toBe(theirs.walls.length);
    ours.walls.forEach((w, i) => {
      const o = theirs.walls[i];
      expect([w.a, w.b, w.comp, w.form, w.dead, w.plane]).toEqual([o.a, o.b, o.comp, o.form, o.dead, o.plane]);
      close(w.tan, o.tan);
    });
    expect(ours.planes.length).toBe(theirs.planes.length);
    ours.planes.forEach((p, i) => {
      const o = theirs.planes[i];
      expect([p.id, p.walls, p.label]).toEqual([o.id, o.walls, o.label]);
      close(p.gx, o.gx); close(p.gy, o.gy); close(p.c, o.c);
    });
  });
});
