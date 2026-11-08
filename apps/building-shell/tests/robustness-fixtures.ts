// The WP3 correctness reviewer's robustness inputs (journal decision 101, F36 and F37), restated from its scratchpad
// reproducers `fuzz4.mjs` and `fuzz3.mjs` so the tests own them. Both generators are deterministic.
import {FixtureRing, RING_SIDES, RingSides, ShellFixture, ring} from '../src/fixture.ts';
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

/** A corner of a courtyard's ring of four Rings: which of the two Rings meeting there covers it. */
export type CornerOwner = 'band' | 'wing' | 'both';

const CORNER_OWNERS: readonly CornerOwner[] = ['band', 'wing', 'both'];

/** The pitches the courtyard generator draws, in degrees. */
const COURTYARD_PITCHES: readonly number[] = [30, 37, 45, 52.5];

/** One generated courtyard, and its two wings (the Rings standing on its W and E sides) by identity. */
interface CourtyardDraw { fixture: ShellFixture; wings: [FixtureRing, FixtureRing] }

/** A deterministic stream of draws in [0, 1), from `fuzz3.mjs`'s linear congruential generator. */
function stream(seed: number): () => number {
  let s = seed;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
}

/**
 * Journal decisions 115, 132 and 135: random courtyards within the Grammar's caps of 3 storeys and 4 Rings, right
 * angles only, drawn from the full family of four Rings about a hole: an S and an N band, a W and an E wing, and at
 * each corner the band, the wing or both covering it. Wings at full height with the bands between them are included,
 * so a layout no raw Ring wall segment can cut would be measured, not avoided (decision 132).
 * - Every Ring stands from storey 0 for 1 to 3 storeys, so the hole runs from the ground to the sky and the genus is 1.
 * - Each side is gabled with probability 0.2, and the Rings come in a random order: the index is the C++ parent model
 *   index, and the lowest wins each union wall.
 * - Pitch (decision 135, F1): half the fixtures keep one pitch for every Ring; in the other half each Ring draws its
 *   own default, and each hipped side is authored a pitch of its own with probability 0.2.
 * Three streams draw independently: the layout as `randomCourtyardFixtures` first drew it (seed `seed`), the corners
 * (seed `seed + 7919`), and the pitches (seed `seed + 15485863`). A fixture whose corners and pitches both fall to the
 * classic draw is the one the generator first made. A generator of its own, so `randomFixtures`' seeds keep their draws.
 */
function drawCourtyards(seed: number, count: number, storeyHeight: number): CourtyardDraw[] {
  const rnd = stream(seed), frnd = stream(seed + 7919), prnd = stream(seed + 15485863);
  const pick = <T>(a: readonly T[], r: () => number = rnd): T => a[Math.floor(r() * a.length)];
  const span = (lo: number, steps: number): number => lo + 50 * Math.floor(rnd() * steps);
  const out: CourtyardDraw[] = [];
  for (let k = 0; k < count; k++) {
    const x0 = 50 * Math.floor(rnd() * 4), y0 = 50 * Math.floor(rnd() * 4);
    const bandS = span(100, 4), bandN = span(100, 4), wingW = span(100, 4), wingE = span(100, 4);
    const x1 = x0 + wingW + span(100, 6) + wingE, y1 = y0 + bandS + span(100, 6) + bandN;
    // Corners SW, SE, NE, NW. The classic layout gives every corner to the band; otherwise each is drawn.
    const corners: CornerOwner[] = frnd() < 0.5 ? ['band', 'band', 'band', 'band'] : [0, 1, 2, 3].map(() => pick(CORNER_OWNERS, frnd));
    const band = (c: CornerOwner): boolean => c !== 'wing';
    const wing = (c: CornerOwner): boolean => c !== 'band';
    const [sw, se, ne, nw] = corners;
    const rects: Rect[] = [
      [band(sw) ? x0 : x0 + wingW, y0, band(se) ? x1 : x1 - wingE, y0 + bandS],
      [band(nw) ? x0 : x0 + wingW, y1 - bandN, band(ne) ? x1 : x1 - wingE, y1],
      [x0, wing(sw) ? y0 : y0 + bandS, x0 + wingW, wing(nw) ? y1 : y1 - bandN],
      [x1 - wingE, wing(se) ? y0 : y0 + bandS, x1, wing(ne) ? y1 : y1 - bandN],
    ];
    const deg = pick(COURTYARD_PITCHES);
    const mixed = prnd() >= 0.5;
    const rings = rects.map(r => {
      const sides: RingSides = {};
      for (const side of RING_SIDES) if (rnd() < 0.2) sides[side] = {form: 'gable'};
      const own = mixed ? pick(COURTYARD_PITCHES, prnd) : deg;
      if (mixed) for (const side of RING_SIDES) if (!sides[side] && prnd() < 0.2) sides[side] = {form: 'hip', deg: pick(COURTYARD_PITCHES, prnd)};
      return ring(r, 0, 1 + Math.floor(rnd() * 3), own, sides);
    });
    const wings: [FixtureRing, FixtureRing] = [rings[2], rings[3]];
    for (let i = rings.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [rings[i], rings[j]] = [rings[j], rings[i]];
    }
    out.push({fixture: {name: `Court${k}`, cellSize: 50, storeyHeight, rings}, wings});
  }
  return out;
}

/** Journal decisions 115, 132 and 135: random courtyards from the full Ring family (`drawCourtyards`). */
export const randomCourtyardFixtures = (seed: number, count: number, storeyHeight: number): ShellFixture[] =>
  drawCourtyards(seed, count, storeyHeight).map(d => d.fixture);

/**
 * F50's second family: each courtyard of `randomCourtyardFixtures` with one wing removed, the E wing for an even index
 * and the W wing for an odd one. The three Rings left have no hole, so the genus is 0, and the class of gables over
 * several storeys is measured apart from the courtyard's own.
 */
export function randomUFixtures(seed: number, count: number, storeyHeight: number): ShellFixture[] {
  return drawCourtyards(seed, count, storeyHeight).map(({fixture, wings}, k) => {
    const drop = wings[k % 2 === 1 ? 0 : 1];
    return {...fixture, name: `U${k}`, rings: fixture.rings.filter(r => r !== drop)};
  });
}

/** The pitch in degrees whose rise over `run` is `rise`. */
export const pitchFor = (rise: number, run: number): number => (Math.atan(rise / run) * 180) / Math.PI;

/** Journal decision 122's δ-nudges, in 1/1024 cm steps: a hair under, at and over each coincidence. */
export const NUDGE_STEPS: readonly number[] = [-3, -1, -0.5, 0, 0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 8, 12];

/**
 * Journal decision 122's δ-nudge sweeps, restated from the combined reviewer's probe C at 250 cm storeys: a 45 degree
 * apex or ridge raised `k / 1024` cm above (or below) the floor of the storey above, under its middle (Apex, Ridge),
 * under its eave (ApexEdge, ApexEdgeBelow, RidgeEdge), and OverhangApexOnEave itself with its apex nudged.
 */
export function nudgeFixtures(): ShellFixture[] {
  const h = STOREY_HEIGHT_CM_FOR_NUDGES;
  const fx = (name: string, lower: Rect, upper: Rect, d0: number): ShellFixture => ({
    name, cellSize: 50, storeyHeight: h, rings: [ring(lower, 0, 1, d0), ring(upper, 1, 1, 45)],
  });
  return NUDGE_STEPS.flatMap(k => {
    const delta = k / 1024;
    return [
      fx(`Apex${k}`, [0, 0, 500, 500], [100, 100, 400, 400], pitchFor(h + delta, 250)),
      fx(`Ridge${k}`, [0, 0, 700, 500], [100, 100, 600, 400], pitchFor(h + delta, 250)),
      fx(`ApexEdge${k}`, [0, 0, 500, 500], [250, 0, 600, 500], pitchFor(h + delta, 250)),
      fx(`ApexEdgeBelow${k}`, [0, 0, 500, 500], [250, 0, 600, 500], pitchFor(h - delta, 250)),
      fx(`RidgeEdge${k}`, [0, 0, 700, 500], [100, 0, 600, 250], pitchFor(h + delta, 250)),
      fx(`OverhangApexOnEave${k}`, [0, 0, 500, 500], [250, 0, 750, 500], pitchFor(h + delta, 250)),
    ];
  });
}

/** The reviewer's probe C ran at 250 cm, where a 45 degree apex 250 cm in rises exactly to the plate above. */
const STOREY_HEIGHT_CM_FOR_NUDGES = 250;

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
