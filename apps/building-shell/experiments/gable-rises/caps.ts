// WP-G1.1 items 4 and 5.
// 4. The floor cap of an overhanging storey, fused (decision 12 as written: the cap at the floor) against a small gap
//    below the floor. Each build reports its genus, flat tops, Roof/Gable-Underside Edge pairs and faces under 10 cm².
// 5. The storey directly above: a candidate horizontal cap at that storey's plate (its wall-top), at the pitches where
//    the uncapped rise broke through in WP-G1. A candidate for the user, not a decision.
import {DEFAULTS, fx, gableRun, report, ring, runs, type RiseOptions} from './rise.ts';

type R4 = [number, number, number, number];
const MAIN: R4 = [0, 0, 1000, 500];

export async function main(): Promise<void> {
  console.log('# 4. The floor cap: fused (gap 0) against a gap below the overhanging floor');
  const tower = ring([800, 0, 1000, 500], 0, 2, 30);
  const overhangs: [string, R4][] = [['covers the band', [300, 0, 1000, 500]], ['covers half the band', [500, 0, 1000, 500]], ['projects 100 past the rise\'s wall', [300, -100, 1000, 500]]];
  for (const [what, rect] of overhangs) {
    for (const [lo, hi, deg] of [[400, 600, 75], [300, 700, 60]]) {
      for (const floorGap of [0, 1, 5]) {
        const opt: RiseOptions = {...DEFAULTS, floorGap};
        await report(fx(`overhang ${JSON.stringify(rect)} ${what}, rise [${lo},${hi}]@${deg} on 30, gap ${floorGap}`,
          [ring(MAIN, 0, 1, 30, {S: runs(gableRun(lo, hi, deg))}), tower, ring(rect, 2, 1, 30)]), opt);
      }
    }
  }

  console.log('\n# 5. The storey directly above: a cap at its wall-top (its plate), against no cap');
  const cases: [string, R4, number, number, number][] = [
    ['set back 100', [300, 100, 700, 400], 350, 650, 60],
    ['set back 100', [300, 100, 700, 400], 350, 650, 75],
    ['flush upper wall', [300, 0, 700, 300], 400, 600, 75],
    ['flush upper wall', [300, 0, 700, 300], 350, 650, 60],
  ];
  for (const [what, rect, lo, hi, deg] of cases) {
    for (const capWallTop of [false, true]) {
      await report(fx(`upper ${JSON.stringify(rect)} ${what}, rise [${lo},${hi}]@${deg} on 45, wall-top cap ${capWallTop ? 'on' : 'off'}`,
        [ring(MAIN, 0, 1, 45, {S: runs(gableRun(lo, hi, deg))}), ring(rect, 1, 1, 45)]), {...DEFAULTS, capWallTop});
    }
  }
}
