// Copy integrity (spec decision 31): algorithm B over the copied cases, measured by the copied measure, tallied exactly
// as roof-gable's run.ts tallies its `B:` line. A drifted copy or a skeleton off f7b6091's behaviour moves the tally.
import {describe, expect, it} from 'vitest';
import * as coreViaAlias from '@proc-geo/core';
import * as coreSource from '../../../packages/core/src/index.ts';
import {CASES} from '../src/roof/cases.ts';
import {Verdict, measure} from '../src/roof/measure.ts';
import {runB} from '../src/roof/algoB.ts';

/** The README's B line at f7b6091. */
const EXPECTED_B_TALLY = 'pass 44, cheek 6, fail 3, blocked 0, none 0';

describe('roof-gable copy integrity', () => {
  it('resolves @proc-geo/core to packages/core/src, not to dist', () => {
    // One module instance: the alias and the source path are the same file only if the alias points at source.
    expect(coreViaAlias.solveSkeleton).toBe(coreSource.solveSkeleton);
  });

  it(`algorithm B tallies "${EXPECTED_B_TALLY}"`, () => {
    // run.ts: runAlgo(c, b => runB(b, {far: 'plane'})) builds once, solves, and measures at grid step 5.
    const verdicts: Verdict[] = CASES.map(c => {
      const b = c.build();
      const surface = runB(b, {far: 'plane'});
      return measure(c, b, surface, 5).verdict;
    });
    const count = (v: Verdict): number => verdicts.filter(x => x === v).length;
    const tally = `pass ${count('PASS')}, cheek ${count('CHEEK')}, fail ${count('FAIL')}, blocked ${count('BLOCKED')}, none ${count('NO ANSWER')}`;
    expect(verdicts).toHaveLength(53);
    expect(tally).toBe(EXPECTED_B_TALLY);
  }, 120_000);
});
