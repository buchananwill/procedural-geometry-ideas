// The WP3 correctness reviewer's robustness inputs (journal decision 101, F36 and F37), restated from its scratchpad
// reproducers `fuzz4.mjs` and `fuzz3.mjs` so the tests own them. Both generators are deterministic.
import {FixtureRing, RING_SIDES, RingSide, RingSides, ShellFixture, ring} from '../src/fixture.ts';
import type {Rect} from '../src/roof/model.ts';
import {NamedFixture, shellFixture} from './test-builds.ts';
import {readInput, writeInput} from '../src/wire/input-adapter.ts';
import {WIRE_MAX_PITCH_DEG, WIRE_MIN_PITCH_DEG} from '../src/wire/input-types.ts';

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
  return shellFixture(`P${deg.toFixed(3)}${upper ? 'u' : ''}`, rings, storeyHeight);
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
  const rnd = stream(seed);
  const pick = <T>(a: readonly T[]): T => pickFrom(a, rnd);
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
    out.push(shellFixture(`Fuzz${k}`, rings, storeyHeight));
  }
  return out;
}

/** Who may cover a corner of a courtyard's ring of four Rings: the band, the wing, or both. */
const CORNER_OWNERS = ['band', 'wing', 'both'] as const;

/** A corner of a courtyard's ring of four Rings: which of the two Rings meeting there covers it. */
export type CornerOwner = typeof CORNER_OWNERS[number];

/** The pitches the courtyard generator draws, in degrees. */
const COURTYARD_PITCHES: readonly number[] = [30, 37, 45, 52.5];

/**
 * A split Ring's buried shared wall: the world line `axis = at` (`x` for a band split across, `y` for a wing). Not
 * cells.ts's `SplitLine`, a lattice square's split (journal decision 155, N2).
 */
export interface SplitWallLine { axis: 'x' | 'y'; at: number }

/** A classic courtyard's name, `Court<k>`. */
export type CourtName = `Court${number}`;
/** A split-band courtyard's name, `SplitCourt<k>`. */
export type SplitCourtName = `SplitCourt${number}`;
/** A U shape's name, `U<k>`. */
export type UName = `U${number}`;

const courtName = (k: number): CourtName => `Court${k}`;
const splitCourtName = (k: number): SplitCourtName => `SplitCourt${k}`;
const uName = (k: number): UName => `U${k}`;

/**
 * One generated courtyard, named `N`, its two wings (the Rings standing on its W and E sides) by identity, and, in
 * split mode, the line its split Ring was cut along.
 */
export interface CourtyardDraw<N extends string = string> { fixture: NamedFixture<N>; wings: [FixtureRing, FixtureRing]; split?: SplitWallLine }

/** Which of the courtyard's four Rings the split mode cuts in two: the S or N band, or the W or E wing. */
const SPLIT_RINGS = ['S', 'N', 'W', 'E'] as const;

/** A deterministic stream of draws in [0, 1), from `fuzz3.mjs`'s linear congruential generator: the tests' one LCG. */
export function stream(seed: number): () => number {
  let s = seed;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
}

/** One member of `a`, drawn from the stream `r`: the tests' one pick (journal decision 145, B12). */
export const pickFrom = <T>(a: readonly T[], r: () => number): T => a[Math.floor(r() * a.length)];

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
 *
 * Split mode (journal decisions 150 and 151) cuts one of the four Rings in two across its depth, at a 50 cm lattice
 * line strictly inside the hole's span, so the buried shared wall crosses the ring from the outer loop to the hole and
 * is collinear with no wall: the free cut. A fourth stream (seed `seed + 104729`) picks the Ring, the line, the second
 * half's place in the index order and, with mixed pitch, its default. The draw is placed so that the free cut is
 * certain to be the shortest qualifying segment: the split Ring's two corners are its own, so no wing or band side
 * runs along a hole wall's line through it, and every other Ring's depth is made deeper than the split Ring's. Every
 * other draw is made as in the classic mode, in the same order.
 *
 * `name` names the k-th draw: `Court<k>` in classic mode, `SplitCourt<k>` in split mode, where every draw is split.
 */
function drawCourtyards<N extends string>(seed: number, count: number, storeyHeight: number, name: (k: number) => N, splitMode = false): CourtyardDraw<N>[] {
  const rnd = stream(seed), frnd = stream(seed + 7919), prnd = stream(seed + 15485863), srnd = stream(seed + 104729);
  const pick = <T>(a: readonly T[], r: () => number = rnd): T => pickFrom(a, r);
  const span = (lo: number, steps: number): number => lo + 50 * Math.floor(rnd() * steps);
  const out: CourtyardDraw<N>[] = [];
  for (let k = 0; k < count; k++) {
    const x0 = 50 * Math.floor(rnd() * 4), y0 = 50 * Math.floor(rnd() * 4);
    let bandS = span(100, 4), bandN = span(100, 4), wingW = span(100, 4), wingE = span(100, 4);
    const holeW = span(100, 6), holeD = span(100, 6);
    // Corners SW, SE, NE, NW. The classic layout gives every corner to the band; otherwise each is drawn.
    const corners: CornerOwner[] = frnd() < 0.5 ? ['band', 'band', 'band', 'band'] : [0, 1, 2, 3].map(() => pick(CORNER_OWNERS, frnd));
    const which = splitMode ? pick(SPLIT_RINGS, srnd) : undefined;
    if (which) {
      const depth = {S: bandS, N: bandN, W: wingW, E: wingE}[which];
      const deeper = (d: number, own: boolean): number => (own || d > depth ? d : depth + 50);
      [bandS, bandN, wingW, wingE] = [deeper(bandS, which === 'S'), deeper(bandN, which === 'N'), deeper(wingW, which === 'W'), deeper(wingE, which === 'E')];
      // The split Ring's own two corners (SW, SE, NE, NW are 0 to 3).
      const own: Record<typeof which, [number, number, CornerOwner]> = {S: [0, 1, 'band'], N: [2, 3, 'band'], W: [3, 0, 'wing'], E: [1, 2, 'wing']};
      const [c0, c1, owner] = own[which];
      corners[c0] = owner;
      corners[c1] = owner;
    }
    const x1 = x0 + wingW + holeW + wingE, y1 = y0 + bandS + holeD + bandN;
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
    const toSplit = which ? rings[SPLIT_RINGS.indexOf(which)] : undefined;
    for (let i = rings.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [rings[i], rings[j]] = [rings[j], rings[i]];
    }
    if (!which || !toSplit) {
      out.push({fixture: shellFixture(name(k), rings, storeyHeight), wings});
      continue;
    }
    // The split: a band across at an x, a wing across at a y, strictly inside the hole's span.
    const across = which === 'S' || which === 'N';
    const [lo, hi] = across ? [x0 + wingW, x1 - wingE] : [y0 + bandS, y1 - bandN];
    const at = lo + 50 * (1 + Math.floor(srnd() * ((hi - lo) / 50 - 1)));
    const [rx0, ry0, rx1, ry1] = toSplit.rect;
    const [inner0, inner1]: [RingSide, RingSide] = across ? ['E', 'W'] : ['N', 'S'];
    const half = (rect: Rect, buried: RingSide, deg: number): FixtureRing => {
      const sides: RingSides = {...toSplit.sides};
      delete sides[buried];
      return ring(rect, toSplit.baseStorey, toSplit.storeys, deg, sides);
    };
    const first = half(across ? [rx0, ry0, at, ry1] : [rx0, ry0, rx1, at], inner0, toSplit.defaultDeg);
    const second = half(across ? [at, ry0, rx1, ry1] : [rx0, at, rx1, ry1], inner1, mixed ? pick(COURTYARD_PITCHES, srnd) : toSplit.defaultDeg);
    const split = rings.map(r => (r === toSplit ? first : r));
    split.splice(Math.floor(srnd() * (split.length + 1)), 0, second);
    out.push({fixture: shellFixture(name(k), split, storeyHeight), wings, split: {axis: across ? 'x' : 'y', at}});
  }
  return out;
}

/** Journal decisions 115, 132 and 135: random courtyards from the full Ring family (`drawCourtyards`). */
export const randomCourtyardFixtures = (seed: number, count: number, storeyHeight: number): NamedFixture<CourtName>[] =>
  drawCourtyards(seed, count, storeyHeight, courtName).map(d => d.fixture);

/** A split-band courtyard and the line its split Ring was cut along: the free cut's line. */
export type SplitCourtyard = Pick<CourtyardDraw<SplitCourtName>, 'fixture'> & Required<Pick<CourtyardDraw<SplitCourtName>, 'split'>>;

/**
 * Journal decisions 150 and 151: random courtyards in split mode (`drawCourtyards`), one Ring cut in two so that the
 * free cut, collinear with no wall, is certain to be the shortest, so a sweep of them reads the free branch.
 */
export function randomSplitCourtyards(seed: number, count: number, storeyHeight: number): SplitCourtyard[] {
  return drawCourtyards(seed, count, storeyHeight, splitCourtName, true).flatMap(d => (d.split ? [{fixture: d.fixture, split: d.split}] : []));
}

/** The fixtures of `randomSplitCourtyards`. */
export const randomSplitCourtyardFixtures = (seed: number, count: number, storeyHeight: number): NamedFixture<SplitCourtName>[] =>
  randomSplitCourtyards(seed, count, storeyHeight).map(d => d.fixture);

/** The S band of a 1000 × 1000 courtyard authored as two Rings, and its pitches (`splitBandFixture`). */
export interface SplitBandPitches {
  /** Ring 0's default: the S band's west half, which wins both walls the free cut meets. */
  a: number;
  /** Ring 0's S side (the outer wall at y = 0) and N side (the hole's S wall), when authored. */
  s?: number;
  n?: number;
  /** Every other Ring's default. */
  w: number;
}

/**
 * Journal decision 150's split-band courtyard, the correctness reviewer's (`cfd.mts`): an S band of depth `bandS`
 * authored as two Rings split at x = `split`, wings either side of a hole from x = `holeLo` to `holeHi` up to y = 800,
 * and an N band. The split's buried shared wall, `bandS` long, is the shortest cut and collinear with no wall.
 */
export function splitBandFixture(name: string, holeLo: number, holeHi: number, bandS: number, split: number, p: SplitBandPitches): ShellFixture {
  const own: RingSides = {...(p.s !== undefined ? {S: {form: 'hip', deg: p.s}} : {}), ...(p.n !== undefined ? {N: {form: 'hip', deg: p.n}} : {})};
  return {
    name, cellSize: 50, storeyHeight: 250, rings: [
      ring([0, 0, split, bandS], 0, 1, p.a, own), ring([split, 0, 1000, bandS], 0, 1, p.w),
      ring([0, bandS, holeLo, 800], 0, 1, p.w), ring([holeHi, bandS, 1000, 800], 0, 1, p.w),
      ring([0, 800, 1000, 1000], 0, 1, p.w),
    ],
  };
}

/** One split-band layout: the hole's x span, the S band's depth, and the split's x. */
export type SplitBandLayout = readonly [holeLo: number, holeHi: number, bandS: number, split: number];

/** The split-band family's 27 layouts: the reviewer's, its duplicates dropped. */
export const SPLIT_BAND_LAYOUTS: readonly SplitBandLayout[] = [[300, 700], [400, 600], [450, 550], [470, 530], [490, 510]]
  .flatMap(([lo, hi]) => [100, 150, 200].flatMap(bandS => [...new Set([lo + 10, 500])].map((split): SplitBandLayout => [lo, hi, bandS, split])));

/** One split-band layout's name stem. */
export const splitBandName = ([lo, hi, bandS, split]: SplitBandLayout): string => `H${lo}-${hi}B${bandS}S${split}`;

/**
 * F50's second family: each courtyard of `randomCourtyardFixtures` with one wing removed, the E wing for an even index
 * and the W wing for an odd one. The three Rings left have no hole, so the genus is 0, and the class of gables over
 * several storeys is measured apart from the courtyard's own.
 */
export function randomUFixtures(seed: number, count: number, storeyHeight: number): NamedFixture<UName>[] {
  return drawCourtyards(seed, count, storeyHeight, courtName).map(({fixture, wings}, k) => {
    const drop = wings[k % 2 === 1 ? 0 : 1];
    return {...fixture, name: uName(k), rings: fixture.rings.filter(r => r !== drop)};
  });
}

/** The pitch in degrees whose rise over `run` is `rise`. */
export const pitchFor = (rise: number, run: number): number => (Math.atan(rise / run) * 180) / Math.PI;

/** Journal decision 122's δ-nudges, in 1/1024 cm steps: a hair under, at and over each coincidence. */
export const NUDGE_STEPS: readonly number[] = [-3, -1, -0.5, 0, 0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 8, 12];

/** A δ-nudge case's name: its coincidence, then its step `k` in 1/1024 cm (`nudgeFixtures`). */
export type NudgeName = `${'Apex' | 'Ridge' | 'ApexEdge' | 'ApexEdgeBelow' | 'RidgeEdge' | 'OverhangApexOnEave'}${number}`;

/**
 * Journal decision 122's δ-nudge sweeps, restated from the combined reviewer's probe C at 250 cm storeys: a 45 degree
 * apex or ridge raised `k / 1024` cm above (or below) the floor of the storey above, under its middle (Apex, Ridge),
 * under its eave (ApexEdge, ApexEdgeBelow, RidgeEdge), and OverhangApexOnEave itself with its apex nudged.
 */
export function nudgeFixtures(): NamedFixture<NudgeName>[] {
  const h = STOREY_HEIGHT_CM_FOR_NUDGES;
  const fx = (name: NudgeName, lower: Rect, upper: Rect, d0: number): NamedFixture<NudgeName> => ({
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
export const gridFixtures = (): NamedFixture<GridName>[] => GRID_STOREY_HEIGHTS_CM.flatMap(h => GRID_PITCHES_DEG.flatMap(deg =>
  [false, true].map(upper => ({...sweepFixture(deg, upper, h), name: gridName(deg, h, upper)}))));

/** A grid or pitch-end case's name: `G<deg>h<height>`, and `u` with the upper storey. */
export type GridName = `G${number}h${number}${'' | 'u'}`;

/** A grid case's name (journal decision 145, N6). */
export const gridName = (deg: number, storeyHeight: number, upper: boolean): GridName =>
  `G${deg}h${storeyHeight}${upper ? 'u' : ''}`;

/** A pitch-end case: a pitch in degrees, at a storey height in cm. */
export type PitchAtHeight = [deg: number, storeyHeight: number];

/**
 * Journal decision 143, addendum 6: the sweep's box at the wire format's pitch ends. Every whole degree from 5 to 20
 * and from 70 to 75 at every grid storey height, alone and with its upper storey, and the pitches the 0.173 and finer
 * scans found failing below 7 degrees, at the heights they were found at.
 */
export function pitchEndFixtures(): NamedFixture<GridName>[] {
  const whole = [...Array.from({length: 16}, (_, i) => 5 + i), ...Array.from({length: 6}, (_, i) => 70 + i)];
  const cases: PitchAtHeight[] = whole.flatMap(deg => GRID_STOREY_HEIGHTS_CM.map((h): PitchAtHeight => [deg, h]));
  for (const deg of [5.86, 5.865, 5.87, 6.015, 6.02]) for (const h of [250, 300]) cases.push([deg, h]);
  for (const deg of [6.15, 6.27, 6.38, 6.48, 6.57, 6.66, 6.9]) cases.push([deg, 250]);
  return cases.flatMap(([deg, h]) => [false, true].map(upper => ({...sweepFixture(deg, upper, h), name: gridName(deg, h, upper)})));
}

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

/** A random fixture by its seed and its index in that seed's run (`seededFixture`). */
export type SeedIndex = readonly [seed: number, index: number];

/** Journal decision 110: the named regression fixtures, each the seed and index the WP3 correctness reviewer found. */
export const PINCH_SEEDS: readonly SeedIndex[] = [[2, 109], [3, 3]];
export const CAP_CHAIN_SEED: SeedIndex = [4, 134];

/**
 * Journal decisions 146 and 148, F3: the pitches the widened sweep pairs, content's 22.5, 30 and 45, the fixtures' 60,
 * and the wire's two bounds.
 */
export const SWEEP_PAIR_PITCHES: readonly number[] = [WIRE_MIN_PITCH_DEG, 22.5, 30, 45, 60, WIRE_MAX_PITCH_DEG];

/** How a pitch pair is laid on a fixture: by Ring (even index the first pitch, odd the second), or by side axis. */
export type PitchMix = 'ring' | 'side';

/** A pitch pair's laying: how it is laid, and the pitch it gives each side. */
export type PitchLaying = [mix: PitchMix, pitchOf: PitchOf];

/**
 * A widened-sweep case's name, exactly as `rosterPitchCases` emits it (journal decision 160, N4): `<fixture>@<deg>`, or
 * `<fixture>@<p>/<q>` with `r` (laid by Ring) or `s` (by side axis).
 */
export type RosterPitchName = `${string}@${number}` | `${string}@${number}/${number}${'r' | 's'}`;

/** One widened-sweep case: a roster fixture with every Pitched side set, as the wire carries it. */
export interface RosterPitchCase { name: RosterPitchName; roster: string; fixture: ShellFixture }

/** A pitch per side: Ring `ring`'s side `slot` (0 to 3, S, E, N, W as `writeInput` writes them). */
export type PitchOf = (ring: number, slot: number) => number;

/**
 * A roster fixture through the wire with every roof side, Pitched and GableEnd, at a pitch: `pitchOf(ring, slot)` gives
 * each side its pitch. A gable's pitch is geometry and the wire carries it (decision 153), so the sweep sets it too.
 */
function throughWireAt(f: ShellFixture, name: string, pitchOf: PitchOf): ShellFixture {
  const wire = writeInput(f);
  wire.rings.forEach((r, i) => r.sides.forEach((s, j) => { for (const run of s.runs) if (run.form === 'Pitched' || run.form === 'GableEnd') run.pitchDegrees = pitchOf(i, j); }));
  const read = readInput(JSON.parse(JSON.stringify(wire)), name);
  if (!read.ok) throw new Error(`${name} refused: ${read.errors.join('; ')}`);
  return read.fixture;
}

/**
 * Journal decisions 146 and 148, F3: every roster fixture (`SHELL_FIXTURES`) over the wire's whole pitch range, every
 * Pitched side at each whole degree from 7 to 75 and at 22.5, and at every ordered pair of `SWEEP_PAIR_PITCHES` laid by
 * Ring and by side axis. Named `<fixture>@<deg>`, `<fixture>@<p>/<q>r` (by Ring) and `<fixture>@<p>/<q>s` (by side).
 */
export function rosterPitchCases(fixtures: readonly ShellFixture[]): RosterPitchCase[] {
  const uniform = [...Array.from({length: WIRE_MAX_PITCH_DEG - WIRE_MIN_PITCH_DEG + 1}, (_, i) => WIRE_MIN_PITCH_DEG + i), 22.5].sort((a, b) => a - b);
  return fixtures.flatMap(f => {
    const out: RosterPitchCase[] = uniform.map(d => {
      const name: RosterPitchName = `${f.name}@${d}`;
      return {name, roster: f.name, fixture: throughWireAt(f, name, () => d)};
    });
    for (const p of SWEEP_PAIR_PITCHES) for (const q of SWEEP_PAIR_PITCHES) {
      if (p === q) continue;
      const mixes: PitchLaying[] = [['ring', ring => (ring % 2 ? q : p)], ['side', (_, slot) => (slot % 2 ? q : p)]];
      for (const [mix, pitchOf] of mixes) {
        const name: RosterPitchName = `${f.name}@${p}/${q}${mix === 'ring' ? 'r' : 's'}`;
        out.push({name, roster: f.name, fixture: throughWireAt(f, name, pitchOf)});
      }
    }
    return out;
  });
}

// ---- The named enrolled layouts (each its test's, and the golden set's) ------------------------------------------

/**
 * Journal decision 132: the corrected cut rule's layout. Wings at full depth with the bands between them: no whole raw
 * wall crosses the ring, but each band's inner side has a segment that does.
 */
export const FULL_WINGS_PROBE: ShellFixture = shellFixture('FullWingsProbe',
  ([[0, 0, 1000, 300], [0, 700, 1000, 1000], [0, 0, 300, 1000], [700, 0, 1000, 1000]] as Rect[]).map(r => ring(r, 0, 1, 30)));

/** WP3.6's finding, enrolled: roof-gable algorithm B's cut-piece overshoot, one Internal cut face surviving. */
export const CUT_OVERSHOOT_PROBE: ShellFixture = shellFixture('CutOvershootProbe',
  ([[0, 250, 250, 600], [0, 600, 650, 850], [400, 250, 650, 600], [0, 150, 650, 250]] as Rect[]).map(r => ring(r, 0, 1, 30)));

/**
 * Journal decision 245: `s1/Court29` reduced (Rings dropped, then side forms, while the defect held). Ring 3's S side is a
 * covered rise (journal decision 243, rule 3) over x [650, 900] on y = 150, the courtyard cut's line, and the cut-piece
 * overshoot appears on that cut over x [100, 300]: one Internal cut face surviving, 3 Unclassified Edges. Clean before
 * decision 243.
 */
export const COVERED_RISE_ON_CUT_LINE: ShellFixture = shellFixture('CoveredRiseOnCutLine', [
  ring([100, 0, 900, 150], 0, 2, 30, {E: {form: 'gable'}}), ring([100, 150, 300, 450], 0, 1, 52.5, {E: {form: 'gable'}}),
  ring([100, 450, 900, 650], 0, 2, 52.5), ring([650, 150, 900, 450], 0, 2, 45, {S: {form: 'gable'}, W: {form: 'gable'}}),
]);

/**
 * Journal decision 245: `s13/Court21` reduced as `COVERED_RISE_ON_CUT_LINE` is. The gabled S sides of Rings 2 and 3, each
 * wholly on Ring 0's N side, are covered rises (journal decision 243, rule 3), and Cell laying throws "two Cells run the
 * same way along one NetEdge" (journal F64, F74). One Cheek and 3 conflicts before decision 243.
 */
export const COVERED_RISE_CELL_CLASH: ShellFixture = shellFixture('CoveredRiseCellClash', [
  ring([100, 0, 600, 250], 0, 2, 30, {S: {form: 'gable'}}), ring([100, 400, 600, 600], 0, 3, 30),
  ring([100, 250, 300, 400], 0, 3, 30, {S: {form: 'gable'}}), ring([450, 250, 600, 400], 0, 2, 30, {S: {form: 'gable'}}),
]);

/**
 * Journal decision 272 (WP-C3), on BSA.F87: inputs whose union leaves a tuck. Each has a lower storey's gable on a wall
 * line, back to back with a taller Ring's wall on the storey above, the taller Ring ending inside the gable's span.
 * `span` is the x extent the oracle mirrors them in (BSA.F87 measured each mirror built with no tuck).
 */
export interface TuckCase { fixture: ShellFixture; span: number }

const tuckGable = {S: {form: 'gable' as const}};

/** BSA.F87's smallest input: two Rings, a whole-line gable end. */
const tuckA = (h: number): TuckCase => ({span: 350, fixture: shellFixture(`TuckGableEnd${h}`, [
  ring([0, 0, 200, 50], 0, 3, 30, tuckGable), ring([0, 50, 350, 150], 0, 1, 30, tuckGable),
], h)});

/** `s13h250/SplitCourt38` reduced (BSA.F87): a two-pitch rise's gable; `tower` and `low` vary it into the silent cases. */
const tuckB = (name: string, low: [number, number, number, number], lowDeg: number, tower: [number, number, number, number], towerDeg: number, span: number): TuckCase => ({span, fixture: shellFixture(name, [
  ring(low, 0, 2, lowDeg, tuckGable), ring([0, 100, 50, 150], 0, 2, 45, tuckGable), ring(tower, 0, 3, towerDeg),
])});

/** `s6h263/U8` reduced (BSA.F87): a whole-line gable end at 45 degrees. */
const tuckC = (h: number): TuckCase => ({span: 300, fixture: shellFixture(`TuckSteepGableEnd${h}`, [
  ring([0, 0, 200, 50], 0, 3, 30, tuckGable), ring([0, 50, 300, 100], 0, 1, 45, tuckGable),
], h)});

/** The tuck inputs that threw at `8025ead`, one of the two Cell-laying errors each, and their storey heights. */
export const THROWING_TUCK_CASES: readonly TuckCase[] = [
  tuckA(250), tuckA(263), tuckA(300),
  tuckB('TuckRiseGable', [50, 100, 300, 250], 30, [100, 0, 250, 100], 30, 300),
  tuckC(250), tuckC(263), tuckC(300),
];

/** BSA.F87's silent variants of `TuckRiseGable`: each built at `8025ead` with overlapping Cells and Unclassified Edges. */
export const SILENT_TUCK_CASES: readonly TuckCase[] = [
  tuckB('TuckRiseGableNarrowTower', [50, 100, 300, 250], 30, [150, 0, 200, 100], 30, 300),
  tuckB('TuckRiseGableSteepTower', [50, 100, 300, 250], 30, [100, 0, 250, 100], 45, 300),
  tuckB('TuckRiseGable37', [50, 100, 300, 250], 37, [100, 0, 250, 100], 30, 300),
  tuckB('TuckRiseGableShortLow', [50, 100, 250, 250], 30, [100, 0, 250, 100], 30, 250),
];

/** Journal decision 135, F2: WP3.6's two cleanMesh refusals under floor-standing holed hip solids, stated literally. */
export const F2_COURTYARDS: readonly ShellFixture[] = [
  shellFixture('s1h300/Court5', [
    ring([300, 200, 500, 550], 0, 1, 37), ring([50, 550, 500, 650], 0, 1, 37),
    ring([50, 50, 500, 200], 0, 3, 37, {E: {form: 'gable'}, N: {form: 'gable'}, W: {form: 'gable'}}), ring([50, 200, 200, 550], 0, 2, 37),
  ], 300),
  shellFixture('s1h250/Court16', [
    ring([100, 450, 650, 550], 0, 3, 30, {N: {form: 'gable'}, W: {form: 'gable'}}), ring([500, 200, 650, 450], 0, 1, 30, {S: {form: 'gable'}, W: {form: 'gable'}}),
    ring([100, 100, 650, 200], 0, 2, 30, {W: {form: 'gable'}}), ring([100, 200, 300, 450], 0, 2, 30, {E: {form: 'gable'}}),
  ], 250),
];

/**
 * Journal decision 140, F5: storey 1's U stands on storey 0 by its wings, and its band touches storey 0 only along
 * storey 0's north eave, y = 400 at z = 250.
 */
export const UPPER_U_EDGE_CONTACT: ShellFixture = shellFixture('UpperUJoinedByEdgeContact',
  [ring([0, 0, 1000, 400], 0, 1, 45), ring([0, 0, 200, 400], 1, 1, 45), ring([800, 0, 1000, 400], 1, 1, 45), ring([0, 400, 1000, 600], 1, 1, 45)]);

/** A jutting-wall cut case's name (`jutCutFixtures`): the design, and its swap. */
export type JutCutName = 'CourtyardJutCut' | 'CourtyardJutCutSwapped';

/**
 * Journal decision 175 and F55: WP3.9's rejected CutPitchConflict design, enrolled. CutPitchConflict's courtyard, its W
 * wing jutting out to x = -200 at 45 degrees, with a second Ring, `[-200,300,0,700]`, hipped at 45 but at 30 on its S
 * side, contesting the jut's S wall, y = 300 over x -200 to 0. The shortest cut, y = 300 over x 0 to 300, is collinear
 * with that wall at its outer end and with the hole's S wall, at 30, at its hole end.
 * - `CourtyardJutCut`: the 45 degree jut wins, the cut's ends disagree and it does not qualify, and the next cut,
 *   x 700 to 1000, is taken. Clean.
 * - `CourtyardJutCutSwapped`: the 30 degree Ring wins, both ends are at 30, and the shortest cut qualifies while
 *   collinear with the jutting wall. Defective (F55).
 */
export function jutCutFixtures(): NamedFixture<JutCutName>[] {
  const bandS = ring([0, 0, 1000, 300], 0, 1, 30);
  const jut45 = ring([-200, 300, 300, 700], 0, 1, 45);
  const jut30S = ring([-200, 300, 0, 700], 0, 1, 45, {S: {form: 'hip', deg: 30}});
  const rest = [ring([0, 700, 1000, 1000], 0, 1, 30), ring([700, 300, 1000, 700], 0, 1, 30)];
  return [
    shellFixture('CourtyardJutCut', [bandS, jut45, jut30S, ...rest]),
    shellFixture('CourtyardJutCutSwapped', [bandS, jut30S, jut45, ...rest]),
  ];
}

/** Journal decision 150, F6: a near-touching island k/1024 cm beyond x = 500, its corners aligned or offset. */
export type GapKind = 'Aligned' | 'Offset';

/** A near-touching pair's name: its kind and its gap in 1/1024 cm, the key its pin table reads (journal decision 160, B1). */
export type GapName = `Gap${GapKind}${number}`;

export const gapFixture = (kind: GapKind, k: number): NamedFixture<GapName> => {
  const [y0, y1] = kind === 'Aligned' ? [0, 400] : [100, 300];
  return shellFixture(`Gap${kind}${k}`, [ring([0, 0, 500, 400], 0, 1, 45), ring([500 + k / 1024, y0, 1000, y1], 0, 1, 45)]);
};
