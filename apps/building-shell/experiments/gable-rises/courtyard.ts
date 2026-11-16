// Rises on a courtyard: on an outer wall away from the cut, on a hole (courtyard) wall, and on each wall the cut is
// spliced through, with the band straddling the cut's end. The roster's `Courtyard` Rings at 30 and 45 degrees.
import {storeyLoops} from '../../src/ring-forms.ts';
import {storeyRings} from '../../src/fixture.ts';
import {wallLabel} from '../../src/roof/model.ts';
import {DEFAULTS, deriveWalls, fx, gableRun, report, ring, runs, storeyBuildingWith, type RunRing} from './rise.ts';

type R4 = [number, number, number, number];
/** The roster's courtyard (journal decision 115): bands S and N, wings W and E, a 400 cm hole. */
const COURT: R4[] = [[0, 0, 1000, 300], [0, 700, 1000, 1000], [0, 300, 300, 700], [700, 300, 1000, 700]];

const court = (deg: number, sides: Record<number, RunRing['sides']>): RunRing[] => COURT.map((r, i) => ring(r, 0, 1, deg, sides[i] ?? {}));

export async function main(): Promise<void> {
  const base = fx('courtyard', court(30, {}));
  const rings = storeyRings(base, 0);
  const loops = storeyLoops(rings.map(r => r.ring.rect));
  const b = storeyBuildingWith(rings, loops, deriveWalls(rings, loops, 0, DEFAULTS).walls);
  console.log(`spliced ring: ${b.comps[0].walls.map(w => `${wallLabel(w)}:${w.form}`).join(' | ')}`);

  for (const [rise, wall] of [[45, 30], [60, 45], [30, 30]]) {
    console.log(`\n# rise ${rise} on ${wall}`);
    // Ring 1 (N band)'s N side runs from (1000, 1000) to (0, 1000): x in [400, 600] is from 400 to 600.
    await report(fx(`court outer N y=1000 band x[400,600] rise ${rise} on ${wall}`, court(wall, {1: {N: runs(gableRun(400, 600, rise))}})));
    // Ring 0 (S band)'s S side: x in [100, 300].
    await report(fx(`court outer S y=0 band x[100,300] rise ${rise} on ${wall}`, court(wall, {0: {S: runs(gableRun(100, 300, rise))}})));
    // Hole walls. Ring 0's N side (y = 300) from (1000, 300) to (0, 300): x in [400, 600] is from 400 to 600.
    await report(fx(`court hole S y=300 band x[400,600] rise ${rise} on ${wall}`, court(wall, {0: {N: runs(gableRun(400, 600, rise))}})));
    // Ring 3 (E wing)'s W side (x = 700) from (700, 700) to (700, 300): y in [400, 600] is from 100 to 300.
    await report(fx(`court hole E x=700 band y[400,600] rise ${rise} on ${wall}`, court(wall, {3: {W: runs(gableRun(100, 300, rise))}})));
    // Ring 1's S side (y = 700) from (0, 700) to (1000, 700): x in [350, 650].
    await report(fx(`court hole N y=700 band x[350,650] rise ${rise} on ${wall}`, court(wall, {1: {S: runs(gableRun(350, 650, rise))}})));
    // The cut runs y = 300 from the outer W wall (x = 0) to the hole's SW corner (300, 300), collinear with the hole S wall.
    // Outer W wall x = 0 straddling the cut's outer end at y = 300: Ring 0's W side runs from (0, 300) to (0, 0), so y in
    // [200, 300] is from 0 to 100; Ring 2's W side runs from (0, 700) to (0, 300), so y in [300, 400] is from 300 to 400.
    await report(fx(`court outer W x=0 band y[200,400] across the cut's end, rise ${rise} on ${wall}`, court(wall, {0: {W: runs(gableRun(0, 100, rise))}, 2: {W: runs(gableRun(300, 400, rise))}})));
    // The hole S wall from the cut's inner end: x in [300, 500] is from 500 to 700 on Ring 0's N side.
    await report(fx(`court hole S y=300 band x[300,500] from the cut's end, rise ${rise} on ${wall}`, court(wall, {0: {N: runs(gableRun(500, 700, rise))}})));
    // Outer S wall bands facing the cut: from the corner, and straddling the cut's inner end at x = 300.
    await report(fx(`court outer S y=0 band x[0,300] (corner) facing the cut, rise ${rise} on ${wall}`, court(wall, {0: {S: runs(gableRun(0, 300, rise))}})));
    await report(fx(`court outer S y=0 band x[200,400] straddling the cut's end, rise ${rise} on ${wall}`, court(wall, {0: {S: runs(gableRun(200, 400, rise))}})));
    await report(fx(`court outer S y=0 band x[100,300] rise ${rise} on ${wall}, limit ridgeSlope (probe only)`, court(wall, {0: {S: runs(gableRun(100, 300, rise, {limit: 'ridgeSlope'}))}})));
  }
}
