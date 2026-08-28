import { CLEAN_TEST_POLYGONS, FULL_CORPUS, KNOWN_DEFECT_POLYGONS } from '@proc-geo/test-fixtures';
import type { NamedTestPolygon } from '@proc-geo/test-fixtures';

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
