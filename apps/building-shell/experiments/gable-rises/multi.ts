// Two rises on one wall (apart, adjacent at equal pitch, adjacent at unequal pitch, adjacent across two flush Rings),
// and rises on two adjacent walls whose prisms overlap near a corner, some with crossing ridges.
import {fx, gableRun, report, ring, runs} from './rise.ts';

const LONG = [0, 0, 1200, 500] as [number, number, number, number];
const SQ = [0, 0, 1000, 600] as [number, number, number, number];

export async function main(): Promise<void> {
  console.log('# Two rises on one wall, apart');
  for (const [a, b, wall] of [[45, 45, 45], [60, 30, 45], [75, 75, 30]]) {
    await report(fx(`apart [200,400]@${a} and [700,900]@${b} on ${wall}`, [ring(LONG, 0, 1, wall, {S: runs(gableRun(200, 400, a), gableRun(700, 900, b))})]));
    await report(fx(`near [300,500]@${a} and [520,720]@${b} on ${wall}`, [ring(LONG, 0, 1, wall, {S: runs(gableRun(300, 500, a), gableRun(520, 720, b))})]));
  }
  console.log('\n# Two rises on one wall, adjacent');
  for (const wall of [45, 30]) {
    await report(fx(`adjacent equal [300,500]@45 and [500,700]@45 on ${wall} (merge, decision 6)`, [ring(LONG, 0, 1, wall, {S: runs(gableRun(300, 500, 45), gableRun(500, 700, 45))})]));
    await report(fx(`adjacent unequal [300,500]@45 and [500,700]@60 on ${wall}`, [ring(LONG, 0, 1, wall, {S: runs(gableRun(300, 500, 45), gableRun(500, 700, 60))})]));
    await report(fx(`adjacent unequal [300,500]@75 and [500,700]@30 on ${wall}`, [ring(LONG, 0, 1, wall, {S: runs(gableRun(300, 500, 75), gableRun(500, 700, 30))})]));
  }
  // Two flush Rings, each with a gable run that meets the other's at x = 600, equal pitch: one rise from two Rings.
  await report(fx('adjacent equal across two flush Rings: R0 [400,600], R1 [600,800], both 45 on 45', [
    ring([0, 0, 600, 500], 0, 1, 45, {S: runs(gableRun(400, 600, 45))}),
    ring([600, 0, 1200, 500], 0, 1, 45, {S: runs(gableRun(0, 200, 45))}),
  ]));
  await report(fx('adjacent unequal across two flush Rings: R0 [400,600]@45, R1 [600,800]@60, on 45', [
    ring([0, 0, 600, 500], 0, 1, 45, {S: runs(gableRun(400, 600, 45))}),
    ring([600, 0, 1200, 500], 0, 1, 45, {S: runs(gableRun(0, 200, 60))}),
  ]));

  console.log('\n# Decision 10 against a gabled end wall: the E side is a whole-wall gable');
  for (const [s, wall] of [[45, 45], [60, 45], [30, 45]]) {
    await report(fx(`E gabled, S [800,1000]@${s} on ${wall} (corner)`, [ring(SQ, 0, 1, wall, {E: {form: 'gable'}, S: runs(gableRun(800, 1000, s))})]));
  }

  console.log('\n# Rises on adjacent walls near a corner (S side x, E side y from y = 0)');
  for (const [s, e, wall] of [[45, 45, 45], [60, 60, 45], [60, 30, 45], [30, 60, 30]]) {
    await report(fx(`S [650,950]@${s} and E [50,350]@${e} on ${wall} (prisms overlap)`, [ring(SQ, 0, 1, wall, {S: runs(gableRun(650, 950, s)), E: runs(gableRun(50, 350, e))})]));
    await report(fx(`S [800,1000]@${s} and E [0,200]@${e} on ${wall} (both at the corner)`, [ring(SQ, 0, 1, wall, {S: runs(gableRun(800, 1000, s)), E: runs(gableRun(0, 200, e))})]));
    await report(fx(`S [700,950]@${s} and E [100,400]@${e} on ${wall}`, [ring(SQ, 0, 1, wall, {S: runs(gableRun(700, 950, s)), E: runs(gableRun(100, 400, e))})]));
  }
}
