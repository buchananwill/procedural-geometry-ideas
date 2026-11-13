// Fixtures (spec decisions 1 to 4) and the roster (spec decisions 34 to 40). Every length is in centimetres.
import {Rect} from './roof/model.ts';

/**
 * Spec decision 3 as amended (journal decision 116): the forms a Ring side may be authored with. Mono stays out of
 * Ring authoring for now, and a cut is placed only by the courtyard rule (spec decision 2).
 */
export type RingForm = 'hip' | 'gable';

/** A Ring rectangle's four sides, in side order: S on y = y0, E on x = x1, N on y = y1, W on x = x0. */
export const RING_SIDES = ['S', 'E', 'N', 'W'] as const;

/** One side of a Ring rectangle (`RING_SIDES`). */
export type RingSide = typeof RING_SIDES[number];

/**
 * Gable rise decision 11 (journal decision 204): the named policies that limit a rise besides its rakes. `ridgeSlope`
 * is the only one built. The field is in memory only: `input@1` carries no limit (decision 11).
 */
export type RiseLimit = 'ridgeSlope';

/**
 * Gable rise decisions 1 and 2: one run of a Ring side, `[from, to]` in cm from the side's start (side S from its west
 * end, E from its south end, N from its east end, W from its north end, so every side runs counter-clockwise, as the
 * wire's corners do). `deg` is a gable run's rake pitch, a hip run's wall pitch; without it the run takes its side's
 * pitch, then the Ring's default. `maxHeight` (decision 12) and `limit` (decision 11) apply to a gable run only, and
 * are in memory only: `input@1` carries neither.
 */
export interface SideRun { from: number; to: number; form: RingForm; deg?: number; maxHeight?: number; limit?: RiseLimit }

/**
 * One Ring side's form, and its pitch in degrees when it is not the Ring's default. Gable rise decision 1: `runs`, in
 * order and not overlapping, override the side's form on their stretches; a side without them means what it always has.
 */
export interface SideForm { form: RingForm; deg?: number; runs?: SideRun[] }

/** The sides a Ring authors; a side not listed is a hip at the Ring's default pitch. */
export type RingSides = Partial<Record<RingSide, SideForm>>;

/**
 * One Ring. Its index in the fixture's `rings` stands in for the C++ parent `FBuildableComponentModel` index: on a
 * union wall, the lowest index wins (spec decision 3).
 */
export interface FixtureRing {
  rect: Rect;
  baseStorey: number;
  storeys: number;
  /** The pitch of every side not given one of its own, in degrees. */
  defaultDeg: number;
  sides?: RingSides;
}

export interface ShellFixture {
  name: string;
  cellSize: number;
  /** Storey N's floor at N * storeyHeight, its plate at (N + 1) * storeyHeight. */
  storeyHeight: number;
  rings: FixtureRing[];
}

/** A Ring over `storeys` storeys from `baseStorey`, hipped at `defaultDeg` except where `sides` says otherwise. */
export const ring = (rect: Rect, baseStorey: number, storeys: number, defaultDeg: number, sides: RingSides = {}): FixtureRing =>
  ({rect, baseStorey, storeys, defaultDeg, sides});

const gable: SideForm = {form: 'gable'};

/** Piste Perfect's default storey height, in cm (journal decision 102): every fixture's. */
export const STOREY_HEIGHT_CM = 250;

const fixture = (name: string, rings: FixtureRing[]): ShellFixture =>
  ({name, cellSize: 50, storeyHeight: STOREY_HEIGHT_CM, rings});

/** Roof-gable case 2a's rects and gabled side, stated literally: `cases.ts` does not export them. */
export const CASE_2A_RECTS: Rect[] = [[0, 0, 1000, 500], [1000, 150, 1400, 350]];

/** NarrowUpperStorey's Rings: storey 0 gabled on y = 0 at `lowerDeg`, storey 1 hipped at 45 or gabled on y = 0. */
const narrowRings = (lowerDeg: number, upperSides: RingSides = {}): FixtureRing[] =>
  [ring([0, 0, 600, 600], 0, 1, lowerDeg, {S: gable}), ring([200, 0, 400, 200], 1, 1, 45, upperSides)];
const towers = (): FixtureRing[] => [ring([0, 0, 200, 600], 0, 3, 30), ring([800, 0, 1000, 600], 0, 3, 30)];
/** ValleyWings' L, gabled on x = 0 (the first wing's W side) and y = 1000 (the second wing's N side). */
const valleyWingsL = (deg: number): FixtureRing[] =>
  [ring([0, 0, 1000, 400], 0, 1, deg, {W: gable}), ring([600, 0, 1000, 1000], 0, 1, deg, {N: gable})];

/**
 * Journal decision 115: the four Rings of a courtyard, 1000 square about a 400 square hole. The wings stand between
 * the bands, so each wing's S and N sides cross the ring from the hole to the outer loop.
 */
export const COURTYARD_RECTS: Rect[] = [[0, 0, 1000, 300], [0, 700, 1000, 1000], [0, 300, 300, 700], [700, 300, 1000, 700]];

export const SHELL_FIXTURES: ShellFixture[] = [
  // 34
  fixture('NarrowUpperStorey', narrowRings(60)),
  // 35
  fixture('NarrowUpperStoreyGabled', narrowRings(60, {S: gable})),
  // 36
  fixture('TallerUpper', narrowRings(30)),
  // 37, clean twin and degenerate twin
  fixture('Overhang', [ring([0, 0, 600, 600], 0, 1, 30), ring([300, 0, 900, 600], 1, 1, 45)]),
  /** Journal decision 102: at 250 cm storeys the footprints shrink so the 45 degree apex (250, 250, 500) meets the eave. */
  fixture('OverhangApexOnEave', [ring([0, 0, 500, 500], 0, 1, 45), ring([250, 0, 750, 500], 1, 1, 45)]),
  // 38
  fixture('Bridge', [...towers(), ring([200, 0, 800, 600], 2, 1, 30)]),
  fixture('BridgeOverBlock', [...towers(), ring([0, 0, 1000, 600], 0, 1, 30), ring([200, 0, 800, 600], 2, 1, 30)]),
  // 39, clean twin and degenerate twin
  fixture('ValleyWings', [...valleyWingsL(45), ring([650, 50, 950, 300], 1, 1, 45)]),
  fixture('ValleyWingsPierced', [...valleyWingsL(60), ring([650, 50, 950, 350], 1, 1, 45)]),
  // 40: case 2a's x = 1000 gable is the first Ring's E side, on both of its union walls either side of the stem.
  fixture('SingleStoreyT', [ring(CASE_2A_RECTS[0], 0, 1, 45, {E: gable}), ring(CASE_2A_RECTS[1], 0, 1, 45)]),
  // 40, Piste Perfect's default building (journal decision 103)
  fixture('DefaultChalet', [ring([0, 0, 1000, 1000], 0, 1, 22.5, {W: gable, E: gable})]),
  // Journal decision 115: a courtyard, roofed through a cut along a raw Ring wall (spec decision 2 as amended).
  fixture('Courtyard', COURTYARD_RECTS.map(r => ring(r, 0, 1, 30))),
];

/**
 * Journal decision 116 and its addenda: three pairs whose Rings disagree on one union wall. In each pair the second
 * fixture swaps the two Rings' indices, and the whole wall flips to the other Ring's form or pitch.
 * - Flush: `[0,0,500,400]` and `[500,0,1000,400]`, one hipping its S side, the other gabling it; y = 0 is one wall.
 * - Overlap: the L of `[0,0,1000,400]` and `[600,0,1000,1000]`, whose E sides overlap over y 0 to 400 and disagree.
 * - Pitch: the flush pair, both hipping their S sides, at 30 and 45 degrees.
 * - Journal decision 135, F6: a three-Ring tie, non-adjacent indices, Rings across storeys, a conflict on a hole loop,
 *   and a cut-pitch conflict, each described where it is built.
 */
export const RING_CONFLICT_FIXTURES: ShellFixture[] = (() => {
  const flushHip = ring([0, 0, 500, 400], 0, 1, 45);
  const flushGable = ring([500, 0, 1000, 400], 0, 1, 45, {S: gable});
  const longWing = ring([0, 0, 1000, 400], 0, 1, 45, {E: gable});
  const tallWing = ring([600, 0, 1000, 1000], 0, 1, 45);
  const pitch30 = ring([0, 0, 500, 400], 0, 1, 45, {S: {form: 'hip', deg: 30}});
  const pitch45 = ring([500, 0, 1000, 400], 0, 1, 45, {S: {form: 'hip', deg: 45}});
  // Journal decision 135, F6: five more pairs.
  // - Three Rings on one wall line, y = 0, each with its own form or pitch; the swap rotates the indices.
  const tieHip = ring([0, 0, 300, 400], 0, 1, 45), tieGable = ring([300, 0, 600, 400], 0, 1, 45, {S: gable});
  const tieHip30 = ring([600, 0, 900, 400], 0, 1, 45, {S: {form: 'hip', deg: 30}});
  // - The two disagreeing Rings at indices 0 and 3, two others between them.
  const wingW = ring([0, 400, 300, 700], 0, 1, 45), wingE = ring([700, 400, 1000, 700], 0, 1, 45);
  // - A two-storey Ring gabling y = 0 against a one-storey Ring hipping it, on storey 0 only.
  const lowHip = ring([0, 0, 1000, 400], 0, 1, 45), tallGable = ring([0, 0, 500, 400], 0, 2, 45, {S: gable});
  // - A courtyard whose hole's S wall, y = 300, is two Rings' N sides at different pitches.
  const holeBandW = ring([0, 0, 500, 300], 0, 1, 30), holeBandE = ring([500, 0, 1000, 300], 0, 1, 30, {N: {form: 'hip', deg: 45}});
  const court = [ring([0, 700, 1000, 1000], 0, 1, 30), ring([0, 300, 300, 700], 0, 1, 30), ring([700, 300, 1000, 700], 0, 1, 30)];
  // - A cut-pitch conflict (spec decision 2's cut pitch read through spec decision 3's lowest index; journal decisions
  //   135 and 167, finding 4). The courtyard's shortest cut, y = 300 over x 0 to 300, is collinear at its two ends with
  //   walls of different pitch whichever Ring wins: the W wing juts out to x = -200 at 45 degrees, and the hole's S wall
  //   is at 30 or 60. That cut never qualifies, and the next, y = 300 over x 700 to 1000, takes the pitch of the hole's
  //   S wall, which two Rings of one rectangle contest: `bandS` hips it at 30, `bandS60` at 60, every other side of
  //   both at 30. The lowest index wins, so the swap moves the hole wall and the cut from 30 to 60.
  const jutW = ring([-200, 300, 300, 700], 0, 1, 45), bandS = ring([0, 0, 1000, 300], 0, 1, 30);
  const bandS60 = ring([0, 0, 1000, 300], 0, 1, 30, {N: {form: 'hip', deg: 60}});
  const jutRest = [ring([0, 700, 1000, 1000], 0, 1, 30), ring([700, 300, 1000, 700], 0, 1, 30)];
  return [
    fixture('FlushRingConflict', [flushHip, flushGable]),
    fixture('FlushRingConflictSwapped', [flushGable, flushHip]),
    fixture('OverlapRingConflict', [longWing, tallWing]),
    fixture('OverlapRingConflictSwapped', [tallWing, longWing]),
    fixture('PitchRingConflict', [pitch30, pitch45]),
    fixture('PitchRingConflictSwapped', [pitch45, pitch30]),
    fixture('ThreeRingConflict', [tieHip, tieGable, tieHip30]),
    fixture('ThreeRingConflictSwapped', [tieGable, tieHip30, tieHip]),
    fixture('DistantRingConflict', [flushHip, wingW, wingE, flushGable]),
    fixture('DistantRingConflictSwapped', [flushGable, wingW, wingE, flushHip]),
    fixture('StoreyRingConflict', [lowHip, tallGable]),
    fixture('StoreyRingConflictSwapped', [tallGable, lowHip]),
    fixture('HoleRingConflict', [holeBandW, holeBandE, ...court]),
    fixture('HoleRingConflictSwapped', [holeBandE, holeBandW, ...court]),
    fixture('CutPitchConflict', [bandS, bandS60, jutW, ...jutRest]),
    fixture('CutPitchConflictSwapped', [bandS60, bandS, jutW, ...jutRest]),
  ];
})();

/**
 * The layouts behind the C++ port's two in-game regressions, sent by its arc lead: NarrowUpperStorey's Rings at the
 * port's storey heights, as reference data for the port. Each sets its own `storeyHeight`.
 * - Missing tiles: `PortNarrowUpper300` and `PortNarrowUpperGabled300`, storey 1 wholly under storey 0's roof.
 * - Lost ridge: `PortPokeOut300` and `PortPokeOut250`, storey 1's x walls poking out of the 60 degree lower roof
 *   (at 250 the Ring widens to `[100,0,500,200]`, since the 300 cm Ring would be enclosed, and keeps it on the lattice).
 */
export const PORT_FIXTURES: ShellFixture[] = (() => {
  const port = (name: string, storeyHeight: number, upper: Rect, upperSides: RingSides = {}): ShellFixture => ({
    name, cellSize: 50, storeyHeight,
    rings: [ring([0, 0, 600, 600], 0, 1, 60, {S: gable}), ring(upper, 1, 1, 45, upperSides)],
  });
  return [
    port('PortNarrowUpper300', 300, [200, 0, 400, 200]),
    port('PortNarrowUpperGabled300', 300, [200, 0, 400, 200], {S: gable}),
    port('PortPokeOut300', 300, [150, 0, 450, 200]),
    port('PortPokeOut250', 250, [100, 0, 500, 200]),
  ];
})();

/**
 * Gable rise decisions 1 to 12 (journal decision 204): one fixture per class the rise sweeps found distinct (gable rise
 * findings, WP-G1 and WP-G1.1). Kept apart from `EXPORTED_FIXTURES`, which the editor reads, until the editor's run list
 * lands (WP-G3); the golden set lists them.
 * - `MidWallRise`: a mid-wall rise at 45 on a 30 degree hip (F60's second build): unequal pitches.
 * - `CornerRise`: a rise at 60 ending at the convex corner of a 45 degree hip, where decision 10 takes the end wall's plane.
 * - `RiseBeforeTStem`: a 75 degree rise in front of a T's stem; its limit is the bar's far slope, not the stem's end.
 * - `FlushT` and `FlushTSwapped`: F57's flush T. With the crossbar first its hip wins the stretch and no rise is built
 *   (decision 7); with the stem first its gable is a rise over its own width (decision 3).
 * - `AdjacentRises`: two rises of unequal pitch meeting at a point on the plate (decision 6).
 * - `CourtyardRiseFacingCut`: a rise whose band faces the courtyard's cut; its limit is the cut's plane.
 * - `CourtyardRiseAlongCut`: a rise whose walk runs along the cut, limited by the built roof's fallback (decision 11).
 * - `TruncatedRise`: a 75 degree rise the far slope truncates at its own wall.
 * - `FlatTopRise`: a rise with its own `maxHeight` below the main ridge: a flat `Roof` top.
 * - `OverhangCappedRise`: a rise under an overhang two storeys up, which projects past the rise's wall: the floor cap
 *   stands `FLOOR_CAP_GAP_CM` below its floor.
 * - `SetBackCappedRise`: a 75 degree rise under a set-back storey directly above, capped at that storey's wall top.
 * - `BuriedRise`: a rise under a flush upper wall, capped at its wall top and so buried whole.
 */
export const RISE_FIXTURES: readonly ShellFixture[] = (() => {
  const gableRun = (from: number, to: number, deg: number, extra: Partial<SideRun> = {}): SideForm => ({form: 'hip', runs: [{from, to, form: 'gable', deg, ...extra}]});
  const R: Rect = [0, 0, 1000, 500];
  const court = (sides: Record<number, RingSides>): FixtureRing[] => COURTYARD_RECTS.map((r, i) => ring(r, 0, 1, 30, sides[i] ?? {}));
  return [
    fixture('MidWallRise', [ring(R, 0, 1, 30, {S: gableRun(330, 610, 45)})]),
    fixture('CornerRise', [ring(R, 0, 1, 45, {S: gableRun(800, 1000, 60)})]),
    fixture('RiseBeforeTStem', [ring([0, 0, 1000, 400], 0, 1, 45, {S: gableRun(400, 600, 75)}), ring([400, 400, 600, 1000], 0, 1, 45)]),
    fixture('FlushT', [ring(R, 0, 1, 45), ring([400, 0, 600, 900], 0, 1, 45, {S: gable})]),
    fixture('FlushTSwapped', [ring([400, 0, 600, 900], 0, 1, 45, {S: gable}), ring(R, 0, 1, 45)]),
    fixture('AdjacentRises', [ring([0, 0, 1200, 500], 0, 1, 45, {S: {form: 'hip', runs: [{from: 300, to: 500, form: 'gable', deg: 45}, {from: 500, to: 700, form: 'gable', deg: 60}]}})]),
    fixture('CourtyardRiseFacingCut', court({0: {S: gableRun(100, 300, 45)}})),
    fixture('CourtyardRiseAlongCut', court({0: {W: gableRun(0, 100, 45)}, 2: {W: gableRun(300, 400, 45)}})),
    fixture('TruncatedRise', [ring(R, 0, 1, 45, {S: gableRun(300, 700, 75)})]),
    fixture('FlatTopRise', [ring(R, 0, 1, 45, {S: gableRun(300, 700, 60, {maxHeight: 200})})]),
    fixture('OverhangCappedRise', [ring(R, 0, 1, 30, {S: gableRun(400, 600, 75)}), ring([800, 0, 1000, 500], 0, 2, 30), ring([300, -100, 1000, 500], 2, 1, 30)]),
    fixture('SetBackCappedRise', [ring(R, 0, 1, 45, {S: gableRun(350, 650, 75)}), ring([300, 100, 700, 400], 1, 1, 45)]),
    fixture('BuriedRise', [ring(R, 0, 1, 45, {S: gableRun(400, 600, 75)}), ring([300, 0, 700, 300], 1, 1, 45)]),
  ];
})();

/** Every named fixture the export writes and `fixtureByName` finds: the roster, the conflict pairs and the port's. */
export const EXPORTED_FIXTURES: readonly ShellFixture[] = [...SHELL_FIXTURES, ...RING_CONFLICT_FIXTURES, ...PORT_FIXTURES];

export function fixtureByName(name: string): ShellFixture {
  const f = EXPORTED_FIXTURES.find(x => x.name === name);
  if (!f) throw new Error(`no fixture named ${name}`);
  return f;
}

/** The storey indices a fixture holds, lowest first. */
export function storeysOf(f: ShellFixture): number[] {
  const out = new Set<number>();
  for (const r of f.rings) for (let s = r.baseStorey; s < r.baseStorey + r.storeys; s++) out.add(s);
  return [...out].sort((a, b) => a - b);
}

/** One Ring of a storey, with its index in the fixture's `rings`. */
export interface StoreyRing { index: number; ring: FixtureRing }

/** Spec decision 2: every Ring with `baseStorey <= n < baseStorey + storeys`, with its index, in index order. */
export function storeyRings(f: ShellFixture, n: number): StoreyRing[] {
  return f.rings.flatMap((ring, index) => (ring.baseStorey <= n && n < ring.baseStorey + ring.storeys ? [{index, ring}] : []));
}

/** Spec decision 2: every Ring rectangle with `baseStorey <= n < baseStorey + storeys`. */
export function storeyRects(f: ShellFixture, n: number): Rect[] {
  return storeyRings(f, n).map(r => r.ring.rect);
}
