// Journal decision 145, N5: the tests' one fixture constructor and one memoised build helper.
import {STOREY_HEIGHT_CM, FixtureRing, ShellFixture} from '../src/fixture.ts';
import {ShellBuild, buildShellDetailed} from '../src/shell.ts';

/** A test fixture on the 50 cm lattice, at the fixtures' 250 cm storeys unless given its own height. */
export const shellFixture = (name: string, rings: FixtureRing[], storeyHeight: number = STOREY_HEIGHT_CM): ShellFixture =>
  ({name, cellSize: 50, storeyHeight, rings});

/** Builds a fixture once per name, on the first test that asks for it, so a crash fails that test alone. */
export type MemoBuild = (f: ShellFixture) => Promise<ShellBuild>;

export function memoBuilds(): MemoBuild {
  const builds = new Map<string, Promise<ShellBuild>>();
  return f => {
    let b = builds.get(f.name);
    if (!b) { b = buildShellDetailed(f); builds.set(f.name, b); }
    return b;
  };
}
