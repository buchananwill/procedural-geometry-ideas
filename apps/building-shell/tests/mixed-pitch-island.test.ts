// ISSUE-building-shell-mixed-pitch-island-folded-roof.md (BSA.F105, BSA.D326): single-loop islands of mixed pitch whose
// roof the skeleton folded. Each test asserts what a sound roof is, on the final union mesh alone, through the shared
// checker in `roof-coverage.ts`. They were red by design (BSA.D266) and turned green when the pairwise fallback began to
// resolve the nearer of two simultaneous events on one bisector first (BSA.D335 stage 1, BSA.F108).
import {describe, expect, it} from 'vitest';
import {unionShell} from '../src/union.ts';
import {HippedRing, hippedFixture, roofViolations} from './roof-coverage.ts';

/** A specimen of the issue note, one storey, every side hipped at its own pitch; `before` is the roof it built before the cure. */
interface Specimen { name: string; rings: readonly HippedRing[]; before: string }

/** The reviewer's three specimens (BSA.F105), each as the issue note gives it. */
const SPECIMENS: readonly Specimen[] = [
  {name: 'S13R20', before: 'Roof folded over itself: three layers over one plan point, one facing down', rings: [
    [[150, 750, 650, 1000], 30, 30, 22.5, 37], [[300, 550, 750, 800], 60, 30, 30, 22.5],
    [[700, 550, 1150, 1100], 60, 30, 30, 37], [[150, 350, 700, 950], 52.5, 30, 60, 60],
  ]},
  {name: 'S7R26', before: 'Roof folded over itself, a triangle facing down', rings: [
    [[450, 0, 950, 150], 30, 37, 52.5, 60], [[550, 500, 1150, 1100], 37, 22.5, 22.5, 30], [[600, 150, 1100, 600], 22.5, 30, 60, 60],
  ]},
  {name: 'S15R29', before: 'Roof standing outside the footprint', rings: [
    [[150, 600, 400, 800], 52.5, 37, 37, 45], [[300, 300, 650, 750], 22.5, 60, 60, 30],
    [[750, 0, 1000, 450], 52.5, 37, 60, 22.5], [[550, 600, 750, 800], 37, 52.5, 22.5, 60],
  ]},
  // Not the reviewer's: draw 4902 of node 9's closing-pass fuzz of the same recipe. The three above each threw later, in
  // Cell laying, with an error that named a Cell and not the roof; this one built its whole shell with no error at all.
  {name: 'M4902', before: 'Roof folded over itself, two triangles facing down, and the whole shell built with no error', rings: [
    [[800, 350, 1400, 550], 30, 60, 52.5, 52.5], [[850, 0, 1250, 600], 52.5, 22.5, 22.5, 30],
    [[800, 600, 1300, 850], 60, 52.5, 45, 22.5], [[450, 850, 900, 1050], 60, 30, 37, 22.5],
  ]},
];

describe('single-loop islands of mixed pitch (ISSUE-building-shell-mixed-pitch-island-folded-roof.md)', () => {
  it.each(SPECIMENS.map(s => [s.name, s] as const))('%s: its Roof covers the footprint exactly once in plan, faces up, and stands on the footprint', async (_, s) => {
    const u = await unionShell(hippedFixture(s.name, s.rings));
    expect(roofViolations(u, s.rings.map(r => r[0])), `${s.name}, which before BSA.D335 built ${s.before}`).toEqual([]);
  });

  // The checker's control: a single-loop island of mixed pitch the skeleton has always roofed soundly.
  it('passes a sound mixed-pitch L, the control', async () => {
    const rings: readonly HippedRing[] = [[[0, 0, 1000, 400], 30, 45, 30, 60], [[600, 0, 1000, 800], 30, 22.5, 45, 30]];
    const u = await unionShell(hippedFixture('MixedPitchLControl', rings));
    expect(roofViolations(u, rings.map(r => r[0]))).toEqual([]);
  });
});
