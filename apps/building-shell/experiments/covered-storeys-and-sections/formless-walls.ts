// What HEAD does with two stacked rings whose lower walls carry no eaves: the adapter's refusal, the C++ 45 degree
// fallback replayed as a fixture, and the pitch and span at which the lower roof stands above the upper one.
import {readInput, writeInput} from '../../src/wire/input-adapter.ts';
import {buildShellDetailed} from '../../src/shell.ts';
import type {ShellFixture} from '../../src/fixture.ts';
import {EXPORTED_FIXTURES} from '../../src/fixture.ts';
import {Rect, fx, gable, ring} from './helpers.ts';

/** input@1 with chosen sides of chosen Rings stripped of their runs, as the game's net writes a wall with no eaves. */
function wireWithFormless(f: ShellFixture, formless: Array<[number, number]>) {
  const w = writeInput(f);
  for (const [r, s] of formless) w.rings[r].sides[s] = {request: 'Auto', runs: []};
  return w;
}

async function summarise(f: ShellFixture): Promise<string> {
  try {
    const {shell} = await buildShellDetailed(f);
    const byStorey = new Map<number, number>();
    for (const x of shell.faces.filter(y => y.tag.kind === 'Roof')) byStorey.set(x.tag.storey, (byStorey.get(x.tag.storey) ?? 0) + 1);
    const maxZ = Math.max(...shell.vertices.map(v => v.p[2]));
    const kinds: Record<string, number> = {};
    for (const x of shell.faces) kinds[x.tag.kind] = (kinds[x.tag.kind] ?? 0) + 1;
    const r = shell.report;
    return `maxZ=${maxZ.toFixed(2)} roofFacesByStorey=${JSON.stringify([...byStorey])} faces=${JSON.stringify(kinds)} internal=${r.survivingInternal} unclassified=${r.unclassifiedEdges} cheeks=${r.cheeks} conflicts=${r.conflicts.length}`;
  } catch (e) {
    return `THROWS: ${(e as Error).message}`;
  }
}

const verdict = (r: ReturnType<typeof readInput>): string => (r.ok ? `ACCEPTED defaultDeg=${r.fixture.rings[0].defaultDeg}` : r.errors.join('\n'));

export async function main(): Promise<void> {
  const P = 30;
  const sq: Rect = [0, 0, 1000, 1000];

  console.log('--- A. the reported input through readInput: Ring 0 formless on all four sides, Ring 1 Pitched at 30');
  console.log(verdict(readInput(wireWithFormless(fx('A', [ring(sq, 0, 1, P), ring(sq, 1, 1, P)]), [[0, 0], [0, 1], [0, 2], [0, 3]]), 'A')));

  console.log('--- A2. a single formless side (N), the other three Pitched');
  console.log(verdict(readInput(wireWithFormless(fx('A2', [ring(sq, 0, 1, P), ring(sq, 1, 1, P)]), [[0, 2]]), 'A2')));

  console.log('--- A3. partial cover: a Ring 1 strip over the W side of Ring 0; only W is formless');
  console.log(verdict(readInput(wireWithFormless(fx('A3', [ring(sq, 0, 1, P), ring([0, 0, 200, 1000], 1, 1, P)]), [[0, 3]]), 'A3')));

  console.log('--- B. the C++ fallback replayed as a fixture: Ring 0 hip at 45, Ring 1 hip at each pitch, 1000 square');
  for (const deg of [22.5, 25, 26.5, 26.6, 30, 45, 60]) console.log(`Ring1@${deg}:`, await summarise(fx(`B${deg}`, [ring(sq, 0, 1, 45), ring(sq, 1, 1, deg)])));

  console.log('--- C. Ring 0 hip at the SAME pitch as Ring 1');
  for (const deg of [22.5, 30, 45, 60]) console.log(`both@${deg}:`, await summarise(fx(`C${deg}`, [ring(sq, 0, 1, deg), ring(sq, 1, 1, deg)])));

  console.log('--- D. footprint scale with Ring 1 at 30 over a 45 fallback');
  for (const s of [1000, 1100, 1200, 1500, 2000]) {
    const r: Rect = [0, 0, s, s];
    console.log(`${s}:`, await summarise(fx(`D${s}`, [ring(r, 0, 1, 45), ring(r, 1, 1, 30)])));
  }

  console.log('--- E. Ring 1 gabled E and W at 22.5 over a 45 hip');
  console.log(await summarise(fx('E', [ring(sq, 0, 1, 45), ring(sq, 1, 1, 22.5, {W: gable, E: gable})])));
  console.log('and with Ring 0 taking the same forms:');
  console.log(await summarise(fx('E2', [ring(sq, 0, 1, 22.5, {W: gable, E: gable}), ring(sq, 1, 1, 22.5, {W: gable, E: gable})])));

  console.log('--- F. the upper storey overhangs every side of the lower (covered, with no coincident upper wall)');
  for (const deg of [22.5, 30, 45]) console.log(`Ring1@${deg}:`, await summarise(fx(`F${deg}`, [ring(sq, 0, 1, 45), ring([-100, -100, 1100, 1100], 1, 1, deg)])));

  console.log('--- G. roster: Rings wholly covered by one Ring on the storey above');
  console.log(`roster size ${EXPORTED_FIXTURES.length}`);
  for (const f of EXPORTED_FIXTURES) {
    const covered: string[] = [];
    f.rings.forEach((r, ri) => {
      const [x0, y0, x1, y1] = r.rect;
      const top = r.baseStorey + r.storeys;
      const above = f.rings.filter(o => o.baseStorey <= top && top < o.baseStorey + o.storeys).map(o => o.rect);
      if (above.some(([a, b, c, d]) => a <= x0 && b <= y0 && c >= x1 && d >= y1)) covered.push(`Ring ${ri}`);
    });
    if (covered.length) console.log(`${f.name}: wholly covered by one Ring above: ${covered.join(', ')}`);
  }
}
