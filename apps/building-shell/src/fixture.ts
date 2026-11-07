// Fixtures (spec decisions 1 to 4) and the roster (spec decisions 34 to 40). Every length is in centimetres.
import {Rect, Sel} from './roof/model.ts';

export interface FixtureRing { rect: Rect; baseStorey: number; storeys: number }

/** roof-gable's selector DSL, applied to the storey's union outline. */
export interface StoreyRoof { sels: Sel[]; defaultDeg: number }

export interface ShellFixture {
  name: string;
  cellSize: number;
  /** Storey N's floor at N * storeyHeight, its plate at (N + 1) * storeyHeight. */
  storeyHeight: number;
  rings: FixtureRing[];
  /** One per storey index present. */
  roofs: Record<number, StoreyRoof>;
}

const ring = (rect: Rect, baseStorey: number, storeys = 1): FixtureRing => ({rect, baseStorey, storeys});
const hip = (defaultDeg: number): StoreyRoof => ({sels: [], defaultDeg});
const fixture = (name: string, rings: FixtureRing[], roofs: Record<number, StoreyRoof>): ShellFixture =>
  ({name, cellSize: 50, storeyHeight: 300, rings, roofs});

/** Roof-gable case 2a's rects and selector, stated literally: `cases.ts` does not export them. */
export const CASE_2A_RECTS: Rect[] = [[0, 0, 1000, 500], [1000, 150, 1400, 350]];
export const CASE_2A_SELS: Sel[] = [{x: 1000, form: 'gable'}];

const narrowRings = (): FixtureRing[] => [ring([0, 0, 600, 600], 0), ring([200, 0, 400, 200], 1)];
const overhangRings = (): FixtureRing[] => [ring([0, 0, 600, 600], 0), ring([300, 0, 900, 600], 1)];
const towers = (): FixtureRing[] => [ring([0, 0, 200, 600], 0, 3), ring([800, 0, 1000, 600], 0, 3)];
const bridgeRoofs = (): Record<number, StoreyRoof> => ({0: hip(30), 1: hip(30), 2: hip(30)});
const valleyWingsRoof = (deg: number): StoreyRoof => ({sels: [{x: 0, form: 'gable'}, {y: 1000, form: 'gable'}], defaultDeg: deg});

export const SHELL_FIXTURES: ShellFixture[] = [
  // 34
  fixture('NarrowUpperStorey', narrowRings(), {0: {sels: [{y: 0, form: 'gable'}], defaultDeg: 60}, 1: hip(45)}),
  // 35
  fixture('NarrowUpperStoreyGabled', narrowRings(), {
    0: {sels: [{y: 0, form: 'gable'}], defaultDeg: 60},
    1: {sels: [{y: 0, form: 'gable'}], defaultDeg: 45},
  }),
  // 36
  fixture('TallerUpper', narrowRings(), {0: {sels: [{y: 0, form: 'gable'}], defaultDeg: 30}, 1: hip(45)}),
  // 37, clean twin and degenerate twin
  fixture('Overhang', overhangRings(), {0: hip(30), 1: hip(45)}),
  fixture('OverhangApexOnEave', overhangRings(), {0: hip(45), 1: hip(45)}),
  // 38
  fixture('Bridge', [...towers(), ring([200, 0, 800, 600], 2)], bridgeRoofs()),
  fixture('BridgeOverBlock', [...towers(), ring([0, 0, 1000, 600], 0), ring([200, 0, 800, 600], 2)], bridgeRoofs()),
  // 39, clean twin and degenerate twin
  fixture('ValleyWings', [ring([0, 0, 1000, 400], 0), ring([600, 0, 1000, 1000], 0), ring([650, 50, 950, 300], 1)],
    {0: valleyWingsRoof(45), 1: hip(45)}),
  fixture('ValleyWingsPierced', [ring([0, 0, 1000, 400], 0), ring([600, 0, 1000, 1000], 0), ring([650, 50, 950, 350], 1)],
    {0: valleyWingsRoof(60), 1: hip(45)}),
  // 40
  fixture('SingleStoreyT', CASE_2A_RECTS.map(r => ring(r, 0)), {0: {sels: CASE_2A_SELS, defaultDeg: 45}}),
];

export function fixtureByName(name: string): ShellFixture {
  const f = SHELL_FIXTURES.find(x => x.name === name);
  if (!f) throw new Error(`no fixture named ${name}`);
  return f;
}

/** The storey indices a fixture holds, lowest first. */
export function storeysOf(f: ShellFixture): number[] {
  const out = new Set<number>();
  for (const r of f.rings) for (let s = r.baseStorey; s < r.baseStorey + r.storeys; s++) out.add(s);
  return [...out].sort((a, b) => a - b);
}

/** Spec decision 2: every Ring rectangle with `baseStorey <= n < baseStorey + storeys`. */
export function storeyRects(f: ShellFixture, n: number): Rect[] {
  return f.rings.filter(r => r.baseStorey <= n && n < r.baseStorey + r.storeys).map(r => r.rect);
}
