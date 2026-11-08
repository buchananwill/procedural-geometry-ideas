// Decision 143, F6: a legacy baseline report is never discarded. Its structure is asserted wherever one is made.
import {expect} from 'vitest';
import {BaselineDiffReport, diffReportLines} from '../src/wire/canonical.ts';

/** A baseline report's structure: its label first, its two engines, and every record in its lists well formed. */
export function expectBaselineShape(r: BaselineDiffReport): void {
  expect(r.mode).toBe('baseline');
  expect(r.engines).toHaveLength(2);
  expect(diffReportLines(r)[0]).toBe(`${r.name}: BASELINE against ${r.engines[1]}, not a pass or a fail`);
  for (const f of [...r.diff.facesOnlyA, ...r.diff.facesOnlyB]) expect(Number.isFinite(f.area)).toBe(true);
  for (const c of r.diff.edgeKindCounts) expect([Number.isInteger(c.a), Number.isInteger(c.b), c.a !== c.b]).toEqual([true, true, true]);
}
