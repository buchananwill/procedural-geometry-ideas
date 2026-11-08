// The measured genus of every named fixture, per connected component, highest first (spec decision 32 as amended:
// "measured, then pinned"; journal decision 148, F1). The playtest seeds take these roster pins, and every sweep that
// rebuilds a roster fixture at other pitches expects them. Keyed by fixture name; a missing name throws (decision
// 150's N4), so a fixture added without its measurement fails loudly. The key is `string`, not a template type
// (decision 155, N7): `src/fixture.ts` types every roster fixture `ShellFixture`, so its names carry no literal type to
// key by, and the name-set test in playtest-ingest.test.ts holds the table to the roster instead.

/** Per component, highest first: what `componentGenera` measured for each named fixture at WP3.8. */
const ROSTER_GENUS: Readonly<Record<string, readonly number[]>> = {
  NarrowUpperStorey: [0], NarrowUpperStoreyGabled: [0], TallerUpper: [0], Overhang: [0], OverhangApexOnEave: [0], Bridge: [0],
  BridgeOverBlock: [1], ValleyWings: [0], ValleyWingsPierced: [0], SingleStoreyT: [0], DefaultChalet: [0], Courtyard: [1],
  FlushRingConflict: [0], FlushRingConflictSwapped: [0], OverlapRingConflict: [0], OverlapRingConflictSwapped: [0],
  PitchRingConflict: [0], PitchRingConflictSwapped: [0],
  ThreeRingConflict: [0], ThreeRingConflictSwapped: [0], DistantRingConflict: [0], DistantRingConflictSwapped: [0],
  StoreyRingConflict: [0], StoreyRingConflictSwapped: [0], HoleRingConflict: [1], HoleRingConflictSwapped: [1],
  CutPitchConflict: [1], CutPitchConflictSwapped: [1],
  PortNarrowUpper300: [0], PortNarrowUpperGabled300: [0], PortPokeOut300: [0], PortPokeOut250: [0],
};

/** A named fixture's pinned genus per component. Throws on a fixture with no measurement. */
export function rosterGenus(name: string): readonly number[] {
  const g = ROSTER_GENUS[name];
  if (!g) throw new Error(`no measured genus for ${name}`);
  return g;
}

/** Every name the table pins, for the test that it covers the exported fixtures exactly. */
export const ROSTER_GENUS_NAMES: readonly string[] = Object.keys(ROSTER_GENUS);
