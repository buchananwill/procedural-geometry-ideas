// The WP3 correctness reviewer's robustness inputs (journal decision 101, F36 and F37), restated from its scratchpad
// reproducers `fuzz4.mjs` and `fuzz3.mjs` so the tests own them. Both generators are deterministic.
import type {FixtureRing, ShellFixture, StoreyRoof} from '../src/fixture.ts';
import type {Sel} from '../src/roof/model.ts';

/** `fuzz4.mjs`'s pitches: 20 degrees up to 70 in 0.173 degree steps, accumulated as the reproducer does. */
export function sweepPitches(): number[] {
  const out: number[] = [];
  for (let deg = 20; deg < 70; deg += 0.173) out.push(deg);
  return out;
}

/**
 * `fuzz4.mjs`'s case: a `[0, 0, 600, 400]` box with y = 0 gabled at `deg`, and with `upper` a 200 x 200 storey 1 on
 * its y = 0 wall, hipped at 45 degrees.
 */
export function sweepFixture(deg: number, upper: boolean): ShellFixture {
  const rings: FixtureRing[] = [{rect: [0, 0, 600, 400], baseStorey: 0, storeys: 1}];
  if (upper) rings.push({rect: [200, 0, 400, 200], baseStorey: 1, storeys: 1});
  const roofs: Record<number, StoreyRoof> = {0: {sels: [{y: 0, form: 'gable'}], defaultDeg: deg}};
  if (upper) roofs[1] = {sels: [], defaultDeg: 45};
  return {name: `P${deg.toFixed(3)}${upper ? 'u' : ''}`, cellSize: 50, storeyHeight: 300, rings, roofs};
}

/** Every sweep case: each pitch alone and with the upper storey, 580 in all. */
export const sweepFixtures = (): ShellFixture[] => sweepPitches().flatMap(deg => [sweepFixture(deg, false), sweepFixture(deg, true)]);

/**
 * `fuzz3.mjs`'s random Ring fixtures, draw for draw: one- and two-storey plans of up to two storey-0 Rings and one
 * storey-1 Ring, gabled on the first Ring's x or y side or hipped, at assorted pitches. Seed 1, 80 fixtures, is the
 * reviewer's run.
 */
export function randomFixtures(seed: number, count: number): ShellFixture[] {
  let s = seed;
  const rnd = (): number => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  const pick = <T>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)];
  const out: ShellFixture[] = [];
  for (let k = 0; k < count; k++) {
    const x0 = 10 * Math.floor(rnd() * 20), y0 = 10 * Math.floor(rnd() * 20);
    const w = 200 + 10 * Math.floor(rnd() * 40), d = 200 + 10 * Math.floor(rnd() * 40);
    const rings: FixtureRing[] = [{rect: [x0, y0, x0 + w, y0 + d], baseStorey: 0, storeys: 1}];
    if (rnd() < 0.6) {
      const x1 = x0 + 10 * Math.floor(rnd() * (w / 10)), y1 = y0 + 10 * Math.floor(rnd() * (d / 10));
      rings.push({rect: [x1, y1, x1 + 100 + 10 * Math.floor(rnd() * 30), y1 + 100 + 10 * Math.floor(rnd() * 30)], baseStorey: 0, storeys: 1});
    }
    const two = rnd() < 0.6;
    if (two) {
      const ux = x0 + 10 * Math.floor(rnd() * (w / 10 - 5)), uy = y0 + 10 * Math.floor(rnd() * (d / 10 - 5));
      rings.push({rect: [ux, uy, ux + 50 + 10 * Math.floor(rnd() * 20), uy + 50 + 10 * Math.floor(rnd() * 20)], baseStorey: 1, storeys: 1});
    }
    const sels: Sel[] = rnd() < 0.5 ? [{x: x0, form: 'gable'}] : rnd() < 0.5 ? [{y: y0, form: 'gable'}] : [];
    const roofs: Record<number, StoreyRoof> = {0: {sels, defaultDeg: pick([22.5, 30, 37, 45, 52.5, 60])}};
    if (two) roofs[1] = {sels: [], defaultDeg: pick([30, 45, 55])};
    out.push({name: `Fuzz${k}`, cellSize: 50, storeyHeight: 300, rings, roofs});
  }
  return out;
}
