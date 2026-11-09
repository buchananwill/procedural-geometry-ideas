// The candidate roof-drop rule end to end on a patched tree: input@1 through readInput, then buildShell.
import {readInput, writeInput} from '@candidate/src/wire/input-adapter.ts';
import {buildShellDetailed} from '@candidate/src/shell.ts';
import type {FixtureRing, ShellFixture} from '../../src/fixture.ts';
import {FRAME, Rect, fx, gable, ring} from './helpers.ts';

async function build(f: ShellFixture): Promise<string> {
  try {
    const {shell, union} = await buildShellDetailed(f);
    const kinds: Record<string, number> = {};
    for (const x of shell.faces) kinds[`${x.tag.kind}@s${x.tag.storey}`] = (kinds[`${x.tag.kind}@s${x.tag.storey}`] ?? 0) + 1;
    const maxZ = Math.max(...shell.vertices.map(v => v.p[2]));
    return `maxZ=${maxZ.toFixed(2)} ${JSON.stringify(kinds)} parts=${union.parts.length} genus=${union.genus} closed=${union.closed} internal=${shell.report.survivingInternal} unclassified=${shell.report.unclassifiedEdges} cells=${shell.cells.length}`;
  } catch (e) {
    return `THROWS: ${(e as Error).message}`;
  }
}

async function wire(name: string, f: ShellFixture, formless: Array<[number, number]>): Promise<void> {
  const w = writeInput(f);
  for (const [r, s] of formless) w.rings[r].sides[s] = {request: 'Auto', runs: []};
  const r = readInput(w, name);
  if (!r.ok) { console.log(`${name}: REFUSED\n  ${r.errors.join('\n  ')}`); return; }
  console.log(`${name}: ${await build(r.fixture)}`);
}

const ALL: Array<[number, number]> = [[0, 0], [0, 1], [0, 2], [0, 3]];

export async function main(): Promise<void> {
  const sq: Rect = [0, 0, 1000, 1000];
  const big: Rect = [0, 0, 1200, 1200];
  await wire('reported input, upper 22.5 hip', fx('a', [ring(sq, 0, 1, 22.5), ring(sq, 1, 1, 22.5)]), ALL);
  await wire('reported input, upper 22.5 chalet', fx('b', [ring(sq, 0, 1, 22.5), ring(sq, 1, 1, 22.5, {W: gable, E: gable})]), ALL);
  await wire('reported input, upper 30 hip, 1200 span', fx('c', [ring(big, 0, 1, 30), ring(big, 1, 1, 30)]), ALL);
  await wire('upper overhangs all sides', fx('d', [ring(sq, 0, 1, 22.5), ring([-100, -100, 1100, 1100], 1, 1, 22.5)]), ALL);
  await wire('frame above, plate open: must not drop', fx('e', [ring(sq, 0, 1, 30), ...FRAME.map(r => ring(r, 1, 1, 30))]), ALL);
  await wire('strip above W only: partial, still refused', fx('f', [ring(sq, 0, 1, 30), ring([0, 0, 200, 1000], 1, 1, 30)]), [[0, 3]]);
  const three: FixtureRing[] = [ring(sq, 0, 1, 22.5), ring(sq, 1, 1, 22.5), ring(sq, 2, 1, 22.5)];
  await wire('three stacked Rings, lower two formless', fx('g', three), [...ALL, [1, 0], [1, 1], [1, 2], [1, 3]]);
  console.log('authored lower 45, upper 22.5, same plan:', await build(fx('h', [ring(sq, 0, 1, 45), ring(sq, 1, 1, 22.5)])));
  console.log('one two-storey Ring at 22.5:', await build(fx('i', [ring(sq, 0, 2, 22.5)])));
}
