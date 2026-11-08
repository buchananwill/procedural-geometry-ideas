// Fixtures (spec decisions 1 to 4) and the roster (spec decisions 34 to 40). Every length is in centimetres.
import {Rect} from './roof/model.ts';

/**
 * Spec decision 3 as amended (journal decision 116): the forms a Ring side may be authored with. Mono stays out of
 * Ring authoring for now, and a cut is placed only by the courtyard rule (spec decision 2).
 */
export type RingForm = 'hip' | 'gable';

/** A Ring rectangle's four sides: S on y = y0, E on x = x1, N on y = y1, W on x = x0. */
export type RingSide = 'S' | 'E' | 'N' | 'W';

/** One Ring side's form, and its pitch in degrees when it is not the Ring's default. */
export interface SideForm { form: RingForm; deg?: number }

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
 */
export const RING_CONFLICT_FIXTURES: ShellFixture[] = (() => {
  const flushHip = ring([0, 0, 500, 400], 0, 1, 45);
  const flushGable = ring([500, 0, 1000, 400], 0, 1, 45, {S: gable});
  const longWing = ring([0, 0, 1000, 400], 0, 1, 45, {E: gable});
  const tallWing = ring([600, 0, 1000, 1000], 0, 1, 45);
  const pitch30 = ring([0, 0, 500, 400], 0, 1, 45, {S: {form: 'hip', deg: 30}});
  const pitch45 = ring([500, 0, 1000, 400], 0, 1, 45, {S: {form: 'hip', deg: 45}});
  return [
    fixture('FlushRingConflict', [flushHip, flushGable]),
    fixture('FlushRingConflictSwapped', [flushGable, flushHip]),
    fixture('OverlapRingConflict', [longWing, tallWing]),
    fixture('OverlapRingConflictSwapped', [tallWing, longWing]),
    fixture('PitchRingConflict', [pitch30, pitch45]),
    fixture('PitchRingConflictSwapped', [pitch45, pitch30]),
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
