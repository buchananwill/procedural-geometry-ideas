// The invariant the roof-drop rule trips on covered courtyards, and s5/Court34: the one pin whose defect changed
// rather than cleared. Compares this tree (HEAD) with a patched tree.
import {buildShellDetailed as atHead} from '../../src/shell.ts';
import {COURTYARD_RECTS} from '../../src/fixture.ts';
import {buildShellDetailed as withRule} from '@candidate/src/shell.ts';
import {invariantViolations} from '@candidate/tests/shell-invariants.ts';
import {randomCourtyardFixtures} from '@candidate/tests/robustness-fixtures.ts';
import type {FixtureRing} from '../../src/fixture.ts';
import {Rect, fx, ring} from './helpers.ts';

export async function main(): Promise<void> {
  const all = (deg: number, storeys = 1): FixtureRing[] => COURTYARD_RECTS.map(r => ring(r as Rect, 0, storeys, deg));
  console.log('--- covered courtyards under the rule');
  for (const [f, genus] of [
    [fx('CourtCovered', [...all(30), ring([0, 0, 1000, 1000], 1, 1, 30)]), 0],
    [fx('CourtTwoStorey', all(30, 2)), 1],
    [fx('Plain2Storey', [ring([0, 0, 1000, 1000], 0, 2, 30)]), 0],
  ] as const) {
    const b = await withRule(f);
    console.log(f.name, 'parts', b.union.parts.length, 'violations', JSON.stringify(invariantViolations(b, {genus, cheeks: 0})));
  }

  console.log('--- s5/Court34');
  for (const h of [250, 263, 300]) {
    const f = randomCourtyardFixtures(5, 40, h).find(x => x.name === 'Court34');
    if (!f) throw new Error('no Court34');
    if (h === 250) console.log(JSON.stringify(f.rings));
    const a = await atHead(f), b = await withRule(f);
    const cheek = (x: typeof b): string => x.shell.faces.filter(y => y.tag.kind === 'Cheek').map(y => `s${y.tag.storey} A=${y.area.toFixed(1)} n=${y.normal.map(v => v.toFixed(2)).join(',')}`).join(' ; ');
    console.log(`h=${h} HEAD parts=${a.union.parts.length} cheeks=[${cheek(a as never)}]`);
    console.log(`  HEAD: ${JSON.stringify(invariantViolations(a as never, {genus: 1, cheeks: 0}))}`);
    console.log(`h=${h} RULE parts=${b.union.parts.length} cheeks=[${cheek(b)}]`);
    console.log(`  RULE: ${JSON.stringify(invariantViolations(b, {genus: 1, cheeks: 0}))}`);
  }
}
