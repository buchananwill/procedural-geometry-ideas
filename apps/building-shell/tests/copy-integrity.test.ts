// Copy integrity (spec decision 31): algorithm B over the copied cases, measured by the copied measure, tallied exactly
// as roof-gable's run.ts tallies its `B:` line, and pinned per case (journal decision 69). A drifted copy, or a
// skeleton off f7b6091's behaviour, on the path the shell uses moves a verdict.
import {fileURLToPath} from 'node:url';
import {beforeAll, describe, expect, it} from 'vitest';
import type {AliasOptions, UserConfig} from 'vite';
import * as coreViaAlias from '@proc-geo/core';
import * as coreSource from '../../../packages/core/src/index.ts';
import {CASES} from '../src/roof/cases.ts';
import {Verdict, measure} from '../src/roof/measure.ts';
import {runB} from '../src/roof/algoB.ts';
import viteConfig from '../vite.config.ts';
import vitestConfig from '../vitest.config.ts';

/** The README's B line at f7b6091. */
const EXPECTED_B_TALLY = 'pass 44, cheek 6, fail 3, blocked 0, none 0';

/**
 * Every case's B verdict, captured by running roof-gable's own `run.ts` read-only (the README's
 * `../../../CCDashboard/node_modules/.bin/tsx run.ts`, from its folder) on 2026-11-07, against packages/core/src
 * unchanged since f7b6091. Its B line read `pass 44, cheek 6, fail 3, blocked 0, none 0`, the README's.
 */
const EXPECTED_B_VERDICTS: Record<string, Verdict> = {
  '1a': 'PASS', '1b': 'PASS', '1c': 'PASS', '1d': 'PASS', '1e': 'PASS', '1f': 'PASS', '1g': 'PASS',
  '2a': 'PASS', '2b': 'CHEEK', '2c': 'PASS', '2d': 'CHEEK',
  '3a': 'PASS', '3b': 'PASS', '3c': 'CHEEK',
  '4a': 'PASS', '4b': 'CHEEK', '4c': 'PASS', '4d': 'PASS', '4e': 'PASS', '4f': 'PASS', '4g': 'PASS', '4h': 'PASS',
  '4i': 'PASS', '4j': 'PASS', '4k': 'PASS', '4l': 'CHEEK',
  '5a': 'PASS', '5b': 'PASS', '5c': 'PASS', '5d': 'PASS', '5e': 'PASS',
  '6a': 'PASS', '6b': 'PASS',
  '7a': 'PASS', '7b': 'PASS', '7c': 'PASS', '7d': 'PASS', '7e': 'PASS', '7f': 'PASS', '7g': 'FAIL', '7h': 'FAIL',
  '7i': 'FAIL',
  '8a': 'PASS', '8b': 'CHEEK', '8c': 'PASS', '8d': 'PASS', '8e': 'PASS', '8f': 'PASS', '8g': 'PASS',
  '9a': 'PASS', '9b': 'PASS', '9c': 'PASS', '9d': 'PASS',
};

const CORE_SOURCE_PATH = fileURLToPath(new URL('../../../packages/core/src/index.ts', import.meta.url));

/** A config's `resolve.alias`, as an array of entries. */
function aliasesOf(config: UserConfig): AliasOptions {
  return config.resolve?.alias ?? [];
}

describe('roof-gable copy integrity', () => {
  it('resolves @proc-geo/core to packages/core/src, not to dist', () => {
    // One module instance: the alias and the source path are the same file only if the alias points at source.
    expect(coreViaAlias.solveSkeleton).toBe(coreSource.solveSkeleton);
  });

  describe('algorithm B over every case', () => {
    let verdicts: Record<string, Verdict>;
    beforeAll(() => {
      // run.ts: runAlgo(c, b => runB(b, {far: 'plane'})) builds once, solves, and measures at grid step 5.
      verdicts = Object.fromEntries(CASES.map(c => {
        const b = c.build();
        return [c.id, measure(c, b, runB(b, {far: 'plane'}), 5).verdict];
      }));
    }, 120_000);

    it(`tallies "${EXPECTED_B_TALLY}"`, () => {
      const all = Object.values(verdicts);
      const count = (v: Verdict): number => all.filter(x => x === v).length;
      const tally = `pass ${count('PASS')}, cheek ${count('CHEEK')}, fail ${count('FAIL')}, blocked ${count('BLOCKED')}, none ${count('NO ANSWER')}`;
      expect(all).toHaveLength(53);
      expect(tally).toBe(EXPECTED_B_TALLY);
    });

    it("gives every case run.ts's own B verdict", () => {
      expect(verdicts).toEqual(EXPECTED_B_VERDICTS);
    });
  });
});

describe('the @proc-geo/core alias (journal decision 69)', () => {
  it('is held by vite.config.ts, pointing at packages/core/src/index.ts', () => {
    const aliases = aliasesOf(viteConfig);
    if (!Array.isArray(aliases)) throw new Error('vite.config.ts alias is not an entry array');
    const core = aliases.filter(a => a.find instanceof RegExp ? a.find.test('@proc-geo/core') : a.find === '@proc-geo/core');
    expect(core).toHaveLength(1);
    expect(core[0].replacement).toBe(CORE_SOURCE_PATH);
  });

  it('is not redefined by vitest.config.ts', () => {
    // The merged config carries exactly vite.config.ts's resolve aliases, and vitest's own `test.alias` is unset.
    expect(aliasesOf(vitestConfig)).toEqual(aliasesOf(viteConfig));
    expect(vitestConfig.test?.alias).toBeUndefined();
  });
});
