// When does a lower storey's roof stand above the top of the storey over it? Build-then-union can only add material,
// so a lower roof must stay beneath the storey above. Note `upTo` is height above the upper PLATE, not above its roof.
import {buildShellDetailed} from '../../src/shell.ts';
import type {ShellFixture} from '../../src/fixture.ts';
import {Rect, fx, ring} from './helpers.ts';

async function report(f: ShellFixture, upper: Rect): Promise<void> {
  try {
    const {shell} = await buildShellDetailed(f);
    const [x0, y0, x1, y1] = upper;
    const lower = shell.faces.filter(x => (x.tag.kind === 'Roof' || x.tag.kind === 'Gable') && x.tag.storey === 0);
    const inUpper = (p: number[]): boolean => p[0] > x0 && p[0] < x1 && p[1] > y0 && p[1] < y1;
    const proud = lower.filter(x => x.loops.flat().some(p => inUpper(p) && p[2] > 500 + 1e-3));
    const zProud = Math.max(0, ...proud.flatMap(x => x.loops.flat().filter(inUpper).map(p => p[2] - 500)));
    const area = (kind: string): number => Math.round(shell.faces.filter(x => x.tag.kind === kind && x.tag.storey === 1).reduce((s, x) => s + x.area, 0));
    const maxZ = Math.max(...shell.vertices.map(v => v.p[2]));
    console.log(`${f.name}: maxZ=${maxZ.toFixed(1)} lowerFacesAboveUpperPlateInUpperPlan=${proud.length} upTo=+${zProud.toFixed(1)} upperWallArea=${area('Wall')} upperRoofArea=${area('Roof')} unclassified=${shell.report.unclassifiedEdges}`);
  } catch (e) {
    console.log(`${f.name}: THROWS ${(e as Error).message}`);
  }
}

export async function main(): Promise<void> {
  const sq: Rect = [0, 0, 1000, 1000];
  console.log('--- S1. a small uncovered strip (50 cm on N only)');
  const strip: Rect = [0, 0, 1000, 950];
  await report(fx('strip lower45 upper22.5', [ring(sq, 0, 1, 45), ring(strip, 1, 1, 22.5)]), strip);
  await report(fx('strip lower45 upper30', [ring(sq, 0, 1, 45), ring(strip, 1, 1, 30)]), strip);
  for (const deg of [22.5, 30, 45]) await report(fx(`strip both${deg}`, [ring(sq, 0, 1, deg), ring(strip, 1, 1, deg)]), strip);

  console.log('--- S2. matched pitch, a centred upper storey set back on all sides; the threshold is h / tan(pitch)');
  for (const [deg, insets] of [[45, [200, 240, 260, 300, 400]], [30, [400, 430, 440, 450]], [22.5, [400, 450]]] as Array<[number, number[]]>) {
    for (const i of insets) {
      const r: Rect = [i, i, 1000 - i, 1000 - i];
      await report(fx(`both${deg} inset${i}`, [ring(sq, 0, 1, deg), ring(r, 1, 1, deg)]), r);
    }
  }
  const big: Rect = [0, 0, 3000, 3000];
  for (const i of [500, 600, 620, 800]) {
    const r: Rect = [i, i, 3000 - i, 3000 - i];
    await report(fx(`3000sq both22.5 inset${i}`, [ring(big, 0, 1, 22.5), ring(r, 1, 1, 22.5)]), r);
  }

  console.log('--- S3. flush plans, content pitch differences, by span; the threshold is 2h / (tan lower - tan upper)');
  for (const [lo, up, spans] of [[30, 22.5, [2000, 3000, 3200]], [45, 30, [1000, 1100, 1200]], [45, 22.5, [800, 850, 900]], [22.5, 45, [3000]]] as Array<[number, number, number[]]>) {
    for (const s of spans) {
      const r: Rect = [0, 0, s, s];
      await report(fx(`flush lower${lo} upper${up} span${s}`, [ring(r, 0, 1, lo), ring(r, 1, 1, up)]), r);
    }
  }

  console.log('--- S4. a real gable on the lower storey under a flush hip, matched at 30 degrees');
  const notch: Rect = [0, 0, 800, 950];
  await report(fx('lower W gable, upper hip', [ring(sq, 0, 1, 30, {W: {form: 'gable'}}), ring(notch, 1, 1, 30)]), notch);
  await report(fx('lower W hip, upper hip', [ring(sq, 0, 1, 30), ring(notch, 1, 1, 30)]), notch);
}
