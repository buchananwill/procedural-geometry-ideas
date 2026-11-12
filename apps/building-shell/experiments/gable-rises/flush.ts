// Decision 3 (form per extent) on flush Rings, against what the pipeline builds today (whole-wall winner, spec 3 and
// journal decision 116): F57's flush T both ways round, the inner Ring flush on the main wall, the roster's
// Ring-conflict pairs whose walls mix a gable side with a hip side, and the storey pair. Each case prints the
// per-extent build, then today's.
import {RING_CONFLICT_FIXTURES} from '../../src/fixture.ts';
import {fx, report, ring, type RunFixture} from './rise.ts';

const gable = {form: 'gable'} as const;

export async function main(): Promise<void> {
  const main = ring([0, 0, 1000, 500], 0, 1, 45);
  const stem = ring([400, 0, 600, 900], 0, 1, 45, {S: gable});
  const inner = ring([400, 0, 600, 500], 0, 1, 45, {S: gable});
  console.log('# F57\'s flush T and the inner Ring');
  await report(fx('flush T, main index 0 (hip), stem index 1 gables S', [main, stem]), undefined, true);
  await report(fx('flush T swapped, stem index 0', [stem, main]), undefined, true);
  await report(fx('inner Ring [400,0,600,500] gabled S, main index 0', [main, inner]), undefined, true);
  await report(fx('inner Ring index 0', [inner, main]), undefined, true);
  for (const deg of [30, 60]) {
    const stemAt = ring([400, 0, 600, 900], 0, 1, 45, {S: {form: 'gable', deg}});
    await report(fx(`flush T swapped, the stem's gable at ${deg} on a 45 main`, [stemAt, main]), undefined, true);
  }

  console.log('\n# The roster\'s Ring-conflict pairs with a gable side on a mixed wall');
  for (const name of ['FlushRingConflict', 'FlushRingConflictSwapped', 'ThreeRingConflict', 'ThreeRingConflictSwapped', 'DistantRingConflict', 'DistantRingConflictSwapped', 'StoreyRingConflict', 'StoreyRingConflictSwapped', 'OverlapRingConflict', 'OverlapRingConflictSwapped']) {
    const f = RING_CONFLICT_FIXTURES.find(x => x.name === name)! as RunFixture;
    await report(f, undefined, true);
  }
}
