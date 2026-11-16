// WP-V3: the in-memory source of a defect case the golden set ships no input for. A golden residue
// (`tests/golden-fixtures.ts`) carries its robustness pin's outcome verbatim, the very array its pin table holds, and a
// pinned case (`pinned-cases.ts`) carries the same array; so the pinned case a golden is drawn as is the one whose pin is
// the golden's, found by identity, never by a hand-written table of names. A golden whose fixture is a listed fixture, the
// same object, is built from that fixture. Pure: no scene, no DOM, no fetch, no Node globals.
import type {ShellFixture} from '../fixture.ts';
import type {GoldenFixture} from '../../tests/golden-fixtures.ts';
import type {InMemoryDefectSource, InMemorySources} from './defect-cases.ts';
import {pinnedFixture} from './pinned-cases.ts';
import type {PinnedCase} from './pinned-cases.ts';

/**
 * The in-memory source of every residue golden that has one, by golden name: the listed fixture it is, else the one
 * pinned case whose pin is its pin. A golden two pinned cases claim, or none, has no in-memory source.
 */
export function inMemorySources(goldens: readonly GoldenFixture[], pinned: readonly PinnedCase[], listed: readonly ShellFixture[]): InMemorySources {
  const out = new Map<string, InMemoryDefectSource>();
  for (const g of goldens) {
    if (g.clean) continue;
    const fixture = listed.find(f => f === g.fixture);
    if (fixture) {
      out.set(g.fixture.name, {kind: 'fixture', fixture});
      continue;
    }
    const drawn = pinned.filter(c => c.pins.some(p => p.outcome === g.pin));
    if (drawn.length === 1) out.set(g.fixture.name, {kind: 'pinned', pinned: drawn[0]});
  }
  return out;
}

/** A defect case's fixture built from its in-memory source, under the case's own name, as the golden set names it. */
export const inMemoryFixture = (name: string, s: InMemoryDefectSource): ShellFixture =>
  ({...(s.kind === 'fixture' ? s.fixture : pinnedFixture(s.pinned)), name});
