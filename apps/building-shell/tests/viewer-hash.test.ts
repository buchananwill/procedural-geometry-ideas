// The page's #hash picks the fixture, and a malformed hash must not kill the page (type review B8).
import {describe, expect, it} from 'vitest';
import {SHELL_FIXTURES} from '../src/fixture.ts';
import {fixtureFromHash} from '../src/viewer/hash.ts';

describe('fixtureFromHash', () => {
  it('names the fixture the hash spells, for every fixture', () => {
    for (const f of SHELL_FIXTURES) expect(fixtureFromHash(`#${encodeURIComponent(f.name)}`, SHELL_FIXTURES).name).toBe(f.name);
  });

  it('falls back to the first fixture for an empty, unknown or malformed hash', () => {
    const first = SHELL_FIXTURES[0].name;
    expect(fixtureFromHash('', SHELL_FIXTURES).name).toBe(first);
    expect(fixtureFromHash('#NoSuchFixture', SHELL_FIXTURES).name).toBe(first);
    expect(fixtureFromHash('#%', SHELL_FIXTURES).name).toBe(first);
    expect(fixtureFromHash('#%E0%A4%A', SHELL_FIXTURES).name).toBe(first);
  });

  it('refuses an empty fixture list loudly', () => {
    expect(() => fixtureFromHash('#x', [])).toThrow(/no fixtures/);
  });
});
