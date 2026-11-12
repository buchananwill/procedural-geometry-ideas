// Decision 11: a rise taller than the main ridge, a rise truncated by the far slope at its own wall, a far wall that
// is a gable (so `farSlope` has no plane to offer), and pitches near the wire limits of 7 and 75 degrees.
import {fx, gableRun, report, ring, runs} from './rise.ts';

type R4 = [number, number, number, number];
const R: R4 = [0, 0, 1000, 500];
const NARROW: R4 = [0, 0, 1000, 300];

export async function main(): Promise<void> {
  console.log('# Taller than the main ridge, not truncated');
  await report(fx('[300,700]@60 on 45 (apex 346, ridge 250)', [ring(R, 0, 1, 45, {S: runs(gableRun(300, 700, 60))})]));
  await report(fx('[400,600]@75 on 45 (apex 373, ridge 250)', [ring(R, 0, 1, 45, {S: runs(gableRun(400, 600, 75))})]));
  await report(fx('[200,500]@60 on 30 (apex 260, ridge 144)', [ring(R, 0, 1, 30, {S: runs(gableRun(200, 500, 60))})]));
  console.log('\n# Truncated by the far slope at its own wall');
  await report(fx('[300,700]@75 on 45 (apex 746, far plane 500 at the wall)', [ring(R, 0, 1, 45, {S: runs(gableRun(300, 700, 75))})]));
  await report(fx('[300,700]@60 on 30 (apex 346, far plane 289 at the wall)', [ring(R, 0, 1, 30, {S: runs(gableRun(300, 700, 60))})]));
  await report(fx('narrow [400,600]@75 on 45 (apex 373, far plane 300)', [ring(NARROW, 0, 1, 45, {S: runs(gableRun(400, 600, 75))})]));
  await report(fx('[600,1000]@75 on 45, corner (rake 75 from 600, E plane)', [ring(R, 0, 1, 45, {S: runs(gableRun(600, 1000, 75))})]));
  console.log('\n# The far wall is a whole-wall gable, so farSlope offers no plane');
  await report(fx('N gabled, S [400,600]@45 on 45', [ring(R, 0, 1, 45, {N: {form: 'gable'}, S: runs(gableRun(400, 600, 45))})]));
  await report(fx('N gabled, S [300,700]@75 on 45', [ring(R, 0, 1, 45, {N: {form: 'gable'}, S: runs(gableRun(300, 700, 75))})]));
  await report(fx('N gabled, S [300,700]@75 on 45, limit ridgeSlope (probe only)', [ring(R, 0, 1, 45, {N: {form: 'gable'}, S: runs(gableRun(300, 700, 75, {limit: 'ridgeSlope'}))})]));

  console.log('\n# Pitches near the wire limits');
  for (const [rise, wall] of [[7, 7], [7, 45], [7, 75], [75, 7], [75, 75], [8, 74], [74, 8]]) {
    await report(fx(`mid [300,700]@${rise} on ${wall}`, [ring(R, 0, 1, wall, {S: runs(gableRun(300, 700, rise))})]));
    await report(fx(`narrow mid [450,550]@${rise} on ${wall}`, [ring(R, 0, 1, wall, {S: runs(gableRun(450, 550, rise))})]));
    await report(fx(`corner [800,1000]@${rise} on ${wall}`, [ring(R, 0, 1, wall, {S: runs(gableRun(800, 1000, rise))})]));
  }
}
