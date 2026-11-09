// The church: a three-storey inset nave, gabled at both ends, with a ground-storey extension along its whole length.
// One merged solve at HEAD, against two independent solves joined only by the existing final union.
import {getManifold} from '../../src/manifold.ts';
import {type ShellUnion, unionPlans, unionShell} from '../../src/union.ts';
import {planStorey} from '../../src/storey.ts';
import {storeysOf} from '../../src/fixture.ts';
import type {FixtureRing, RingSides, ShellFixture} from '../../src/fixture.ts';
import {fx, gable, ring} from './helpers.ts';

const ends: RingSides = {W: gable, E: gable};

/** The highest surface at plan point (x, y) of a union's output mesh. */
function topAt(u: ShellUnion, x: number, y: number): number {
  const P = u.mesh.positions, T = u.mesh.tris;
  let best = -Infinity;
  for (let t = 0; t < T.length / 3; t++) {
    const [a, b, c] = [T[3 * t], T[3 * t + 1], T[3 * t + 2]];
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = [P[3 * a], P[3 * a + 1], P[3 * a + 2], P[3 * b], P[3 * b + 1], P[3 * b + 2], P[3 * c], P[3 * c + 1], P[3 * c + 2]];
    const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(d) < 1e-9) continue;
    const l1 = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / d;
    const l2 = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / d;
    const l3 = 1 - l1 - l2;
    if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue;
    best = Math.max(best, l1 * az + l2 * bz + l3 * cz);
  }
  return best;
}

const profile = (u: ShellUnion, x: number): string => [50, 150, 250, 350, 400, 450, 550, 650, 750, 850, 950, 1000, 1050, 1150].map(y => `${y}:${topAt(u, x, y).toFixed(0)}`).join(' ');

function stats(name: string, u: ShellUnion): void {
  console.log(`${name}: status=${u.status} closed=${u.closed} genus=${u.genus} internal=${u.survivingInternal} cheeks=${u.cheeks} conflicts=${u.conflicts.length}`);
  console.log(`  x=1000 profile  ${profile(u, 1000)}`);
  console.log(`  x=25   profile  ${profile(u, 25)}`);
}

export async function main(): Promise<void> {
  const wasm = await getManifold();
  const plansOf = (f: ShellFixture) => storeysOf(f).map(n => planStorey(f, n));
  for (const deg of [45, 30]) {
    console.log(`\n===== pitch ${deg}`);
    const nave: FixtureRing[] = [ring([0, 0, 2000, 800], 0, 1, deg, ends), ring([0, 100, 2000, 700], 1, 1, deg, ends), ring([0, 200, 2000, 600], 2, 1, deg, ends)];
    const naveF = fx('nave', nave);
    stats('nave alone', await unionShell(naveF));
    stats('MERGED at HEAD (the extension shares storey 0 with the nave)', await unionShell(fx('merged', [...nave, ring([0, 800, 2000, 1200], 0, 1, deg, ends)])));
    for (const [label, sides] of [
      ['extension gabled at its ends, ridge parallel', ends],
      ['extension with its abutting S side gabled too', {...ends, S: gable}],
    ] as Array<[string, RingSides]>) {
      try {
        stats(`SECTIONS: nave + ${label}`, unionPlans(wasm, 'sections', [...plansOf(naveF), ...plansOf(fx('extension', [ring([0, 800, 2000, 1200], 0, 1, deg, sides)]))]));
      } catch (e) {
        console.log(`SECTIONS: ${label}: THROWS ${(e as Error).message.slice(0, 200)}`);
      }
    }
  }
}
