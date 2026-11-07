// The page's `#hash` names a fixture (journal decision 98, F8; type review B8).
import type {ShellFixture} from '../fixture.ts';

/** The fixture a `#hash` names; a missing, unknown or malformed hash (`#%`) names the first fixture. */
export function fixtureFromHash(hash: string, fixtures: readonly ShellFixture[]): ShellFixture {
  let name = '';
  try {
    name = decodeURIComponent(hash.slice(1));
  } catch {
    // A malformed escape: fall through to the first fixture.
  }
  const found = fixtures.find(f => f.name === name) ?? fixtures[0];
  if (!found) throw new Error('fixtureFromHash: no fixtures');
  return found;
}
