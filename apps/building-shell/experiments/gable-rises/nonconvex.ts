// Rises on non-convex footprints (L, T, U): a prism passing over a reflex corner or into another wing, a rise ending at
// a reflex corner, a rake that coincides with another wing's plane away from any corner (decision 9), and which wall
// the existing piece rule calls far (the "far slope" line of each case).
import {fx, gableRun, report, ring, runs, DEFAULTS, type RunRing, type Run} from './rise.ts';

type R4 = [number, number, number, number];
const BAR: R4 = [0, 0, 1000, 400];
const STEM_E: R4 = [600, 0, 1000, 1000];
const T_STEM: R4 = [400, 400, 600, 1000];
const U_RECTS: R4[] = [[0, 0, 1000, 300], [0, 300, 400, 600], [600, 300, 1000, 600]];

/** Pitch pairs: [rise, wall]. */
const PAIRS: [number, number][] = [[45, 45], [60, 30], [75, 45]];

const at = (rects: R4[], deg: number, sides: Record<number, RunRing['sides']>): RunRing[] => rects.map((r, i) => ring(r, 0, 1, deg, sides[i] ?? {}));
const S = (run: Run): RunRing['sides'] => ({S: runs(run)});

export async function main(): Promise<void> {
  console.log('# L: bar [0,0,1000,400] (index 0) and stem [600,0,1000,1000] (index 1), stem north on the east');
  for (const [rise, wall] of PAIRS) {
    await report(fx(`L S band [100,300] rise ${rise} on ${wall}`, at([BAR, STEM_E], wall, {0: S(gableRun(100, 300, rise))})));
    await report(fx(`L S band [500,700] (under the reflex corner) rise ${rise} on ${wall}`, at([BAR, STEM_E], wall, {0: S(gableRun(500, 700, rise))})));
    await report(fx(`L S band [650,950] (under the stem) rise ${rise} on ${wall}`, at([BAR, STEM_E], wall, {0: S(gableRun(650, 950, rise))})));
  }
  console.log('\n# L: decision 9 away from a corner: the rake from x = 600 lies on the stem W wall\'s plane at equal pitch');
  for (const canonicalise of [false, true]) {
    await report(fx(`L S band [600,800] rise 45 on 45, decision 9 ${canonicalise ? 'on' : 'off'}`, at([BAR, STEM_E], 45, {0: S(gableRun(600, 800, 45))})), {...DEFAULTS, canonicalise});
    await report(fx(`L S band [600,1000] rise 45 on 45 (the stem's ridge carried to the S wall), decision 9 ${canonicalise ? 'on' : 'off'}`, at([BAR, STEM_E], 45, {0: S(gableRun(600, 1000, 45))})), {...DEFAULTS, canonicalise});
  }
  console.log('\n# L: rises ending at a reflex corner');
  for (const [rise, wall] of PAIRS) {
    // The bar's N side runs from (1000, 400) to (0, 400): x in [400, 600] is from 400 to 600.
    await report(fx(`L bar N y=400 band x[400,600] ending at reflex (600,400), rise ${rise} on ${wall}`, at([BAR, STEM_E], wall, {0: {N: runs(gableRun(400, 600, rise))}})));
    // The stem's W side runs from (600, 1000) to (600, 0): y in [400, 600] is from 400 to 600.
    await report(fx(`L stem W x=600 band y[400,600] ending at reflex (600,400), rise ${rise} on ${wall}`, at([BAR, STEM_E], wall, {1: {W: runs(gableRun(400, 600, rise))}})));
  }
  console.log('\n# L: rise on the long E wall, stem first (index 0) so its side wins x = 1000 throughout');
  for (const [rise, wall] of PAIRS) {
    await report(fx(`L E x=1000 band y[200,500] (straddles the bar's N line) rise ${rise} on ${wall}`, at([STEM_E, BAR], wall, {0: {E: runs(gableRun(200, 500, rise))}})));
    await report(fx(`L E x=1000 band y[600,850] (stem only) rise ${rise} on ${wall}`, at([STEM_E, BAR], wall, {0: {E: runs(gableRun(600, 850, rise))}})));
  }

  console.log('\n# T: bar [0,0,1000,400] (index 0), stem [400,400,600,1000] north');
  for (const [rise, wall] of PAIRS) {
    await report(fx(`T S band [400,600] (prism runs into the stem) rise ${rise} on ${wall}`, at([BAR, T_STEM], wall, {0: S(gableRun(400, 600, rise))})));
    await report(fx(`T S band [450,550] rise ${rise} on ${wall}`, at([BAR, T_STEM], wall, {0: S(gableRun(450, 550, rise))})));
    await report(fx(`T S band [300,700] (wider than the stem) rise ${rise} on ${wall}`, at([BAR, T_STEM], wall, {0: S(gableRun(300, 700, rise))})));
    // The bar's N side: x in [600, 800] is from 200 to 400. The stem's E side runs from (600, 400) up: y in [400, 600] is from 0 to 200.
    await report(fx(`T bar N y=400 band x[600,800] ending at reflex (600,400), rise ${rise} on ${wall}`, at([BAR, T_STEM], wall, {0: {N: runs(gableRun(200, 400, rise))}})));
    await report(fx(`T stem E x=600 band y[400,600] ending at reflex (600,400), rise ${rise} on ${wall}`, at([BAR, T_STEM], wall, {1: {E: runs(gableRun(0, 200, rise))}})));
  }

  console.log('\n# The far wall the rule picks against the slope beyond the ridge (`ridgeSlope`, probe only), where they differ');
  for (const limit of ['farSlope', 'ridgeSlope'] as const) {
    await report(fx(`T S band [400,600] rise 75 on 45, limit ${limit}`, at([BAR, T_STEM], 45, {0: S(gableRun(400, 600, 75, {limit}))})));
    await report(fx(`T S band [450,550] rise 60 on 30, limit ${limit}`, at([BAR, T_STEM], 30, {0: S(gableRun(450, 550, 60, {limit}))})));
    await report(fx(`L S band [600,800] rise 75 on 45, limit ${limit}`, at([BAR, STEM_E], 45, {0: S(gableRun(600, 800, 75, {limit}))})));
  }

  console.log('\n# U: [0,0,1000,300] (index 0), arms [0,300,400,600] and [600,300,1000,600], notch [400,600] x [300,600]');
  for (const [rise, wall] of PAIRS) {
    await report(fx(`U S band [400,600] (under the notch) rise ${rise} on ${wall}`, at(U_RECTS, wall, {0: S(gableRun(400, 600, rise))})));
    await report(fx(`U S band [350,650] (straddles the notch corners) rise ${rise} on ${wall}`, at(U_RECTS, wall, {0: S(gableRun(350, 650, rise))})));
    // Ring 0's N side runs from (1000, 300) to (0, 300): x in [450, 550] is from 450 to 550.
    await report(fx(`U notch bottom y=300 band x[450,550] rise ${rise} on ${wall}`, at(U_RECTS, wall, {0: {N: runs(gableRun(450, 550, rise))}})));
    // The W arm's E side runs from (400, 300) to (400, 600): y in [350, 550] is from 50 to 250.
    await report(fx(`U W arm E x=400 band y[350,550] rise ${rise} on ${wall}`, at(U_RECTS, wall, {1: {E: runs(gableRun(50, 250, rise))}})));
  }
}
