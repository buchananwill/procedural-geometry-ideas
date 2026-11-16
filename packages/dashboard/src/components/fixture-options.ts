import { CLEAN_TEST_POLYGONS, FULL_CORPUS, HOLED_TEST_POLYGONS, KNOWN_DEFECT_POLYGONS } from '@proc-geo/test-fixtures';
import type { HoledTestPolygon, NamedTestPolygon } from '@proc-geo/test-fixtures';

/**
 * The fixture list every "load a test polygon" control offers, defect fixtures included.
 *
 * JOURNAL DECISION 72: exclusion is retired, so the dropdown lists the FULL corpus. A fixture with a
 * known defect is the one the user most wants on the canvas — it is the shape being fixed — and while
 * the loaders listed only the clean roster there was no way to put one there at all.
 *
 * THE TWO GROUPS ARE THE WARNING. A defect fixture loads exactly like any other; what the label says
 * is that a wrong picture is the expected outcome rather than a bug in the page. The prefix repeats
 * the group heading because Mantine's search flattens the groups away, and a fixture found by typing
 * its name would otherwise arrive unlabelled.
 */
export const DEFECT_OPTION_PREFIX = '⚠ ';

/** The group heading known-defect fixtures are listed under. */
export const DEFECT_GROUP_LABEL = 'Known defects';

/** The group heading the clean roster is listed under. */
export const CLEAN_GROUP_LABEL = 'Corpus';

export interface FixtureOption {
    /** The fixture's own name, so a stored selection is a fixture name and not a decoration. */
    value: string;
    /** What the dropdown shows: the name, marked where the fixture carries a known defect. */
    label: string;
    /** Listed but not selectable, as the recursive loader lists the holed roster (decision 10). */
    disabled?: boolean;
}

export interface FixtureOptionGroup {
    group: string;
    items: FixtureOption[];
}

function optionsFor(polygons: NamedTestPolygon[], prefix: string): FixtureOption[] {
    return polygons.map((polygon) => ({ value: polygon.name, label: `${prefix}${polygon.name}` }));
}

/** Mantine `Select` data for the full corpus, clean roster first. */
export const FIXTURE_OPTION_GROUPS: FixtureOptionGroup[] = [
    { group: CLEAN_GROUP_LABEL, items: optionsFor(CLEAN_TEST_POLYGONS, '') },
    { group: DEFECT_GROUP_LABEL, items: optionsFor(KNOWN_DEFECT_POLYGONS, DEFECT_OPTION_PREFIX) },
];

/** The fixture a selection names, from the full corpus. `undefined` where nothing matches. */
export function fixtureByName(name: string | null): NamedTestPolygon | undefined {
    return FULL_CORPUS.find((polygon) => polygon.name === name);
}

/** The group heading the holed roster is listed under in the skeleton editor's loader (decision 7). */
export const HOLED_GROUP_LABEL = 'Holed';

/** The group heading the holed roster is listed under in the recursive loader, every item disabled (decision 10). */
export const RECURSIVE_HOLED_GROUP_LABEL = 'Holed (recursive subdivision refuses holes)';

function holedOptions(disabled: boolean): FixtureOption[] {
    // NO PREFIX (decision 8): every roster name begins `Holed `, so the mark survives the search that flattens groups.
    return HOLED_TEST_POLYGONS.map((fixture) => (disabled
        ? { value: fixture.name, label: fixture.name, disabled: true }
        : { value: fixture.name, label: fixture.name }));
}

/**
 * THE HOLED ROSTER, A THIRD GROUP, IN THE SKELETON EDITOR'S LOADER ONLY (decision 7): `HOLED_TEST_POLYGONS` in roster
 * order. Its holes load read-only (BSA.D284).
 */
export const HOLED_FIXTURE_OPTION_GROUP: FixtureOptionGroup = { group: HOLED_GROUP_LABEL, items: holedOptions(false) };

/** The skeleton editor's loader: the full corpus, then the holed roster. `FIXTURE_OPTION_GROUPS` keeps its meaning. */
export const SKELETON_FIXTURE_OPTION_GROUPS: FixtureOptionGroup[] = [...FIXTURE_OPTION_GROUPS, HOLED_FIXTURE_OPTION_GROUP];

/**
 * The recursive loader: the full corpus, then the holed roster with every item disabled (decision 10). Every fixture
 * is listed (journal decision 72), and on that page a holed one could only show `subdivideRecursively`'s refusal.
 */
export const RECURSIVE_FIXTURE_OPTION_GROUPS: FixtureOptionGroup[] = [
    ...FIXTURE_OPTION_GROUPS,
    { group: RECURSIVE_HOLED_GROUP_LABEL, items: holedOptions(true) },
];

/** The holed fixture a selection names. `undefined` where nothing in the holed roster matches. */
export function holedFixtureByName(name: string | null): HoledTestPolygon | undefined {
    return HOLED_TEST_POLYGONS.find((fixture) => fixture.name === name);
}
