// The WP3 correctness reviewer's robustness inputs (journal decision 101, F36 and F37), restated from its scratchpad
// reproducers `fuzz4.mjs` and `fuzz3.mjs` so the tests own them. Both generators are deterministic.
import {FixtureRing, RingSides, ShellFixture, ring} from '../src/fixture.ts';
import type {Rect} from '../src/roof/model.ts';

/**
 * The storey height the reviewer's reproducers ran at, in cm. They are kept at it so their measured cases (F36's
 * near-coincident vertices, F37's 26.574 degree apex) still reproduce; the tests also run every case at the
 * fixtures' 250 (journal decision 102).
 */
export const REVIEWER_STOREY_HEIGHT_CM = 300;

/** `fuzz4.mjs`'s pitches: 20 degrees up to 70 in 0.173 degree steps, accumulated as the reproducer does. */
export function sweepPitches(): number[] {
  const out: number[] = [];
  for (let deg = 20; deg < 70; deg += 0.173) out.push(deg);
  return out;
}

/**
 * `fuzz4.mjs`'s case: a `[0, 0, 600, 400]` box with y = 0 (its S side) gabled at `deg`, and with `upper` a 200 x 200
 * storey 1 on its y = 0 wall, hipped at 45 degrees.
 */
export function sweepFixture(deg: number, upper: boolean, storeyHeight: number = REVIEWER_STOREY_HEIGHT_CM): ShellFixture {
  const rings: FixtureRing[] = [ring([0, 0, 600, 400], 0, 1, deg, {S: {form: 'gable'}})];
  if (upper) rings.push(ring([200, 0, 400, 200], 1, 1, 45));
  return {name: `P${deg.toFixed(3)}${upper ? 'u' : ''}`, cellSize: 50, storeyHeight, rings};
}

/** Every sweep case: each pitch alone and with the upper storey, 580 in all. */
export const sweepFixtures = (storeyHeight: number = REVIEWER_STOREY_HEIGHT_CM): ShellFixture[] =>
  sweepPitches().flatMap(deg => [sweepFixture(deg, false, storeyHeight), sweepFixture(deg, true, storeyHeight)]);

/**
 * `fuzz3.mjs`'s random Ring fixtures, draw for draw: one- and two-storey plans of up to two storey-0 Rings and one
 * storey-1 Ring, gabled on the first Ring's x or y side or hipped, at assorted pitches. Seed 1, 80 fixtures, is the
 * reviewer's run. The reproducer gabled the whole line x = x0 or y = y0; under Ring forms that is the first Ring's W
 * or S side, which wins the whole union wall on its line as Ring 0 (spec decision 3). Every draw is made as before and
 * in the same order; only what is built from the draws changed.
 */
export function randomFixtures(seed: number, count: number, storeyHeight: number = REVIEWER_STOREY_HEIGHT_CM): ShellFixture[] {
  let s = seed;
  const rnd = (): number => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  const pick = <T>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)];
  const out: ShellFixture[] = [];
  for (let k = 0; k < count; k++) {
    const x0 = 10 * Math.floor(rnd() * 20), y0 = 10 * Math.floor(rnd() * 20);
    const w = 200 + 10 * Math.floor(rnd() * 40), d = 200 + 10 * Math.floor(rnd() * 40);
    const lower: Rect[] = [[x0, y0, x0 + w, y0 + d]];
    if (rnd() < 0.6) {
      const x1 = x0 + 10 * Math.floor(rnd() * (w / 10)), y1 = y0 + 10 * Math.floor(rnd() * (d / 10));
      lower.push([x1, y1, x1 + 100 + 10 * Math.floor(rnd() * 30), y1 + 100 + 10 * Math.floor(rnd() * 30)]);
    }
    const two = rnd() < 0.6;
    let upper: Rect | undefined;
    if (two) {
      const ux = x0 + 10 * Math.floor(rnd() * (w / 10 - 5)), uy = y0 + 10 * Math.floor(rnd() * (d / 10 - 5));
      upper = [ux, uy, ux + 50 + 10 * Math.floor(rnd() * 20), uy + 50 + 10 * Math.floor(rnd() * 20)];
    }
    const sides: RingSides = rnd() < 0.5 ? {W: {form: 'gable'}} : rnd() < 0.5 ? {S: {form: 'gable'}} : {};
    const lowerDeg = pick([22.5, 30, 37, 45, 52.5, 60]);
    const rings: FixtureRing[] = lower.map((r, i) => ring(r, 0, 1, lowerDeg, i === 0 ? sides : {}));
    if (upper) rings.push(ring(upper, 1, 1, pick([30, 45, 55])));
    out.push({name: `Fuzz${k}`, cellSize: 50, storeyHeight, rings});
  }
  return out;
}

/**
 * Journal decision 115: random courtyards within the Grammar's caps of 3 storeys and 4 Rings, right angles only. Each
 * is an outer box of 4 Rings about a hole: an S and an N band across the whole width, and a W and an E wing standing
 * between the bands, so each wing's S and N sides cross the ring from the hole to the outer loop and spec decision 2
 * always finds a cut. (Wings at full height with the bands between them have no such wall, and are refused:
 * `courtyard.test.ts`.) Every Ring stands from storey 0 for 1 to 3 storeys, so the hole runs from the ground to the
 * sky and the genus is 1. The Rings come in a random order, each side hipped or gabled, at one pitch per fixture.
 * A generator of its own, so `randomFixtures`' seeds, and the regression fixtures named by them, keep their draws.
 */
export function randomCourtyardFixtures(seed: number, count: number, storeyHeight: number): ShellFixture[] {
  let s = seed;
  const rnd = (): number => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  const pick = <T>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)];
  const span = (lo: number, steps: number): number => lo + 50 * Math.floor(rnd() * steps);
  const out: ShellFixture[] = [];
  for (let k = 0; k < count; k++) {
    const x0 = 50 * Math.floor(rnd() * 4), y0 = 50 * Math.floor(rnd() * 4);
    const bandS = span(100, 4), bandN = span(100, 4), wingW = span(100, 4), wingE = span(100, 4);
    const x1 = x0 + wingW + span(100, 6) + wingE, y1 = y0 + bandS + span(100, 6) + bandN;
    const rects: Rect[] = [
      [x0, y0, x1, y0 + bandS], [x0, y1 - bandN, x1, y1],
      [x0, y0 + bandS, x0 + wingW, y1 - bandN], [x1 - wingE, y0 + bandS, x1, y1 - bandN],
    ];
    const deg = pick([30, 37, 45, 52.5]);
    const rings = rects.map(r => {
      const sides: RingSides = {};
      for (const side of ['S', 'E', 'N', 'W'] as const) if (rnd() < 0.2) sides[side] = {form: 'gable'};
      return ring(r, 0, 1 + Math.floor(rnd() * 3), deg, sides);
    });
    // A random order: the index is the C++ parent model index, and the lowest wins each union wall.
    for (let i = rings.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [rings[i], rings[j]] = [rings[j], rings[i]];
    }
    out.push({name: `Court${k}`, cellSize: 50, storeyHeight, rings});
  }
  return out;
}

/** Journal decision 108's storey heights: 250 to 300 in 10 cm steps, both ends included. */
export const GRID_STOREY_HEIGHTS_CM: readonly number[] = [250, 260, 270, 280, 290, 300];

/** Journal decision 108's pitches: 20 to 70 degrees in whole degrees. */
export const GRID_PITCHES_DEG: readonly number[] = Array.from({length: 51}, (_, i) => 20 + i);

/**
 * Journal decision 108: the sweep's box as a grid of pitch by storey height, alone and with its upper storey, so a
 * threshold that moves with storey height (ridge against the plate above, apex against eave) is crossed, not sampled
 * at one height. 612 cases.
 */
export const gridFixtures = (): ShellFixture[] => GRID_STOREY_HEIGHTS_CM.flatMap(h => GRID_PITCHES_DEG.flatMap(deg =>
  [false, true].map(upper => ({...sweepFixture(deg, upper, h), name: `G${deg}h${h}${upper ? 'u' : ''}`}))));

/** One random fixture of a seed's run, named for its seed so two seeds' `Fuzz<k>` never collide. */
export function seededFixture(seed: number, index: number, storeyHeight: number = REVIEWER_STOREY_HEIGHT_CM): ShellFixture {
  const f = randomFixtures(seed, index + 1, storeyHeight)[index];
  return {...f, name: `Seed${seed}Fuzz${index}`};
}

/**
 * Journal decision 110, C1, made by hand: an L-shaped storey 0, `[0,0,300,300]` and `[0,300,600,600]`, with its reflex
 * corner at (300, 300), and a storey 1 `[100,100,450,300]` whose y = 300 wall is flush with the second wing's and runs
 * over the corner. The air under the overhang and the air over the lower roof meet along the overhang's foot, from
 * the corner to (450, 300), at plate height: the union writes the corner as two coincident vertices and that segment
 * as two coincident edges. Every Ring is on the 50 cm lattice, and both storeys are 45 degree hips.
 */
export function flushOverReflexFixture(storeyHeight: number = REVIEWER_STOREY_HEIGHT_CM): ShellFixture {
  return {
    name: 'FlushOverReflex', cellSize: 50, storeyHeight,
    rings: [ring([0, 0, 300, 300], 0, 1, 45), ring([0, 300, 600, 600], 0, 1, 45), ring([100, 100, 450, 300], 1, 1, 45)],
  };
}

/** Journal decision 110: the named regression fixtures, each the seed and index the WP3 correctness reviewer found. */
export const PINCH_SEEDS: readonly [seed: number, index: number][] = [[2, 109], [3, 3]];
export const CAP_CHAIN_SEED: readonly [seed: number, index: number] = [4, 134];
