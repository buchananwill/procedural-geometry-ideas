// Shared fixture shorthand for the experiment probes.
import type {FixtureRing, RingSides, ShellFixture} from '../../src/fixture.ts';

export type Rect = [number, number, number, number];

export const ring = (rect: Rect, baseStorey: number, storeys: number, defaultDeg: number, sides: RingSides = {}): FixtureRing =>
  ({rect, baseStorey, storeys, defaultDeg, sides});

export const fx = (name: string, rings: FixtureRing[]): ShellFixture => ({name, cellSize: 50, storeyHeight: 250, rings});

export const gable = {form: 'gable'} as const;

/** Four Rings forming a frame around a 400 cm hole in a 1000 cm square: every wall below is covered, the plate is open. */
export const FRAME: Rect[] = [[0, 0, 1000, 300], [0, 700, 1000, 1000], [0, 300, 300, 700], [700, 300, 1000, 700]];
