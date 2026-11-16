// What a covered wall contributes on a storey that is only partly covered, and whether its invented pitch reaches
// the visible roof.
import {buildShellDetailed} from '../../src/shell.ts';
import type {FixtureRing, ShellFixture} from '../../src/fixture.ts';
import {FRAME, Rect, fx, gable, ring} from './helpers.ts';

async function roofs(f: ShellFixture): Promise<void> {
  try {
    const {shell} = await buildShellDetailed(f);
    const lines = shell.faces.filter(x => x.tag.kind === 'Roof' || x.tag.kind === 'Gable').map(x => {
      const tilt = (Math.acos(Math.min(1, Math.abs(x.normal[2]))) * 180 / Math.PI).toFixed(1);
      return `${x.tag.kind}@s${x.tag.storey} n=(${x.normal.map(v => v.toFixed(3)).join(',')}) tilt=${tilt} area=${Math.round(x.area)}`;
    }).sort();
    const maxZ = Math.max(...shell.vertices.map(v => v.p[2]));
    console.log(`  ${f.name}: maxZ=${maxZ.toFixed(2)} internal=${shell.report.survivingInternal} unclassified=${shell.report.unclassifiedEdges} cheeks=${shell.report.cheeks} conflicts=${JSON.stringify(shell.report.conflicts)}`);
    for (const l of lines) console.log('    ' + l);
  } catch (e) {
    console.log(`  ${f.name}: THROWS ${(e as Error).message}`);
  }
}

export async function main(): Promise<void> {
  const sq: Rect = [0, 0, 1000, 1000];
  const strip: Rect = [0, 0, 200, 1000];

  console.log('--- P1. strip above the W wall; Ring 0 all hip 30: does the covered W wall plane show?');
  await roofs(fx('hip-all-30', [ring(sq, 0, 1, 30), ring(strip, 1, 1, 30)]));

  console.log('--- P1b. the covered W wall at 7 and 60 degrees, the others 30');
  await roofs(fx('W-hip-7', [ring(sq, 0, 1, 30, {W: {form: 'hip', deg: 7}}), ring(strip, 1, 1, 30)]));
  await roofs(fx('W-hip-60', [ring(sq, 0, 1, 30, {W: {form: 'hip', deg: 60}}), ring(strip, 1, 1, 30)]));

  console.log('--- P2. the covered W wall as a gable, its pitch varied');
  for (const deg of [7, 30, 60, 75]) await roofs(fx(`W-gable-${deg}`, [ring(sq, 0, 1, 30, {W: {form: 'gable', deg}}), ring(strip, 1, 1, 30)]));

  console.log('--- P3. the conflicts on a gable taken from the storey above, and on the same chalet as one two-storey Ring');
  await roofs(fx('inherit-gable', [ring(sq, 0, 1, 22.5, {W: gable, E: gable}), ring(sq, 1, 1, 22.5, {W: gable, E: gable})]));
  await roofs(fx('one-ring-2-storeys', [ring(sq, 0, 2, 22.5, {W: gable, E: gable})]));

  console.log('--- P4. a frame above: every wall of Ring 0 covered, its plate open in the middle');
  const frame: FixtureRing[] = FRAME.map(r => ring(r, 1, 1, 30));
  await roofs(fx('frame-45', [ring(sq, 0, 1, 45), ...frame]));
}
