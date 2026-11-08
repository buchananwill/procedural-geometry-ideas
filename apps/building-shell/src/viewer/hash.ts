// The page's `#hash` names a fixture or a defect case (journal decision 98, F8; type review B8; decision 169).
import type {ShellFixture} from '../fixture.ts';
import type {DefectCase} from './defect-cases.ts';

/** The name a `#hash` spells, or '' when it is empty or malformed (`#%`). */
export function hashName(hash: string): string {
  try {
    return decodeURIComponent(hash.slice(1));
  } catch {
    // A malformed escape: it names nothing.
    return '';
  }
}

/** The fixture a `#hash` names; a missing, unknown or malformed hash (`#%`) names the first fixture. */
export function fixtureFromHash(hash: string, fixtures: readonly ShellFixture[]): ShellFixture {
  const name = hashName(hash);
  const found = fixtures.find(f => f.name === name) ?? fixtures[0];
  if (!found) throw new Error('fixtureFromHash: no fixtures');
  return found;
}

/** What the page shows: a roster fixture, or a defect case replayed from `golden/`. */
export type Selection = {kind: 'fixture'; fixture: ShellFixture} | {kind: 'case'; defect: DefectCase};

/** The name a selection is listed under. */
export const selectionName = (s: Selection): string => (s.kind === 'fixture' ? s.fixture.name : s.defect.name);

/**
 * The selection a `#hash` names. The roster is looked in first, so a case that shares a roster name never shadows it; then
 * the defect cases; an empty, unknown or malformed hash names the roster's first fixture.
 */
export function selectionFromHash(hash: string, fixtures: readonly ShellFixture[], cases: readonly DefectCase[]): Selection {
  const name = hashName(hash);
  const fixture = fixtures.find(f => f.name === name);
  if (fixture) return {kind: 'fixture', fixture};
  const defect = cases.find(c => c.name === name);
  if (defect) return {kind: 'case', defect};
  return {kind: 'fixture', fixture: fixtureFromHash(hash, fixtures)};
}
