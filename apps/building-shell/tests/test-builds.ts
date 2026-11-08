// Journal decision 145, N5: the tests' one fixture constructor and one memoised build helper.
import {STOREY_HEIGHT_CM, FixtureRing, ShellFixture} from '../src/fixture.ts';
import {ShellBuild, buildShellDetailed} from '../src/shell.ts';

/**
 * A fixture whose name has the template type `N` its generator emits, so a pin table keyed by that type is read
 * without a cast (journal decision 155, B4).
 */
export type NamedFixture<N extends string> = ShellFixture & {name: N};

/** A test fixture on the 50 cm lattice, at the fixtures' 250 cm storeys unless given its own height. */
export const shellFixture = <N extends string>(name: N, rings: FixtureRing[], storeyHeight: number = STOREY_HEIGHT_CM): NamedFixture<N> =>
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
