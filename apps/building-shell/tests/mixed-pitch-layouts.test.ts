// The user's seven layouts of 2026-11-15 (BSA.F107, BSA.D335): one storey of four hipped Rings each, differing only in
// Ring 0's east and north pitch and in two Rings' extents. Each reduces to one single-loop island. Measured on the parent
// of BSA.D335's stage 1 commit: files 4, 7 and 9 built a folded roof (the level-ridge tie of BSA.F107, the far meeting
// taken) and then threw in Cell laying on a Cell corner; files 3, 5, 6 and 8 were sound.
//
// The Rings are copied from the user's draft inputs, `CourtyardJutCutSwapped-draft.input (3..9).json`, as `readInput`
// reads them: every side a plain hip, one storey from storey 0. Each test asserts the roof-coverage property of
// `roof-coverage.ts` on the union, and that the whole shell builds.
import {describe, expect, it} from 'vitest';
import {buildShell} from '../src/shell.ts';
import {unionShell} from '../src/union.ts';
import {HippedRing, hippedFixture, roofViolations} from './roof-coverage.ts';

/** Rings 1 and 2, the same in every file. */
const RING_1: HippedRing = [[300, 550, 750, 800], 60, 30, 30, 22.5];
const RING_2: HippedRing = [[700, 550, 1150, 1100], 60, 30, 30, 37];

const LAYOUTS: readonly {file: number; rings: readonly HippedRing[]}[] = [
  {file: 3, rings: [[[150, 750, 650, 1000], 30, 30, 22.5, 37], RING_1, RING_2, [[150, 350, 700, 750], 52.5, 30, 60, 60]]},
  {file: 4, rings: [[[150, 750, 650, 1000], 30, 30, 22.5, 37], RING_1, RING_2, [[150, 350, 700, 800], 52.5, 30, 60, 60]]},
  {file: 5, rings: [[[150, 750, 650, 1000], 30, 30, 22.5, 37], RING_1, RING_2, [[150, 350, 700, 1000], 52.5, 30, 60, 60]]},
  {file: 6, rings: [[[150, 750, 350, 1050], 30, 23, 22.5, 37], RING_1, RING_2, [[150, 350, 700, 950], 52.5, 30, 60, 60]]},
  {file: 7, rings: [[[150, 750, 350, 1050], 30, 23.5, 22.5, 37], RING_1, RING_2, [[150, 350, 700, 950], 52.5, 30, 60, 60]]},
  {file: 8, rings: [[[150, 750, 350, 1050], 30, 41.5, 29, 37], RING_1, RING_2, [[150, 350, 700, 950], 52.5, 30, 60, 60]]},
  {file: 9, rings: [[[150, 750, 350, 1050], 30, 42, 29, 37], RING_1, RING_2, [[150, 350, 700, 950], 52.5, 30, 60, 60]]},
];

describe("the user's seven mixed-pitch layouts (BSA.F107, BSA.D335)", () => {
  it.each(LAYOUTS.map(l => [l.file, l] as const))('file %i: its Roof covers the footprint exactly once in plan, faces up, and stands on the footprint', async (file, l) => {
    const u = await unionShell(hippedFixture(`CourtyardJutCutSwapped-draft-${file}`, l.rings));
    expect(roofViolations(u, l.rings.map(r => r[0]))).toEqual([]);
  });

  it.each(LAYOUTS.map(l => [l.file, l] as const))('file %i: the whole shell builds', async (file, l) => {
    await expect(buildShell(hippedFixture(`CourtyardJutCutSwapped-draft-${file}`, l.rings))).resolves.toBeDefined();
  });
});
