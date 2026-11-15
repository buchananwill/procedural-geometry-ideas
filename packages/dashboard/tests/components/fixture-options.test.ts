import { CLEAN_TEST_POLYGONS, FULL_CORPUS, HOLED_TEST_POLYGONS, KNOWN_DEFECT_POLYGONS } from '@proc-geo/test-fixtures';
import {
    CLEAN_GROUP_LABEL,
    DEFECT_GROUP_LABEL,
    DEFECT_OPTION_PREFIX,
    fixtureByName,
    FIXTURE_OPTION_GROUPS,
    HOLED_FIXTURE_OPTION_GROUP,
    HOLED_GROUP_LABEL,
    holedFixtureByName,
    RECURSIVE_FIXTURE_OPTION_GROUPS,
    RECURSIVE_HOLED_GROUP_LABEL,
    SKELETON_FIXTURE_OPTION_GROUPS,
} from '../../src/components/fixture-options';

/*
 * ============================================================================
 *  THE FIXTURE LOADERS OFFER THE FULL CORPUS. Journal decision 72.
 * ============================================================================
 *
 * Both "load a test polygon" controls read `FIXTURE_OPTION_GROUPS`, so what this file pins is what
 * the user can actually put on the canvas. The load-bearing claim is the DEFECT half: while the
 * loaders listed only the clean roster, the fixtures the user most wanted to look at — the ones with
 * a live defect — were the ones the dashboard could not open. A change that quietly narrowed the
 * list back to `CLEAN_TEST_POLYGONS` would look like a passing suite and a working page.
 */

describe('the fixture loader offers the full corpus', () => {
    const options = FIXTURE_OPTION_GROUPS.flatMap((group) => group.items);

    it('lists every fixture in the repo, clean and defect alike', () => {
        expect(options.map((option) => option.value)).toEqual(FULL_CORPUS.map((polygon) => polygon.name));
    });

    it('lists every known-defect fixture, each under the defect group', () => {
        const defects = FIXTURE_OPTION_GROUPS.find((group) => group.group === DEFECT_GROUP_LABEL);
        expect(defects?.items.map((option) => option.value))
            .toEqual(KNOWN_DEFECT_POLYGONS.map((polygon) => polygon.name));
        expect(KNOWN_DEFECT_POLYGONS.length).toBeGreaterThan(0);
    });

    it('marks a defect fixture in its label and leaves a clean one plain', () => {
        // The mark has to survive the search box, which flattens the groups away: a fixture found by
        // typing its name arrives with no group heading to warn the user.
        for (const group of FIXTURE_OPTION_GROUPS) {
            const marked = group.group === DEFECT_GROUP_LABEL;
            for (const option of group.items) {
                expect(option.label.startsWith(DEFECT_OPTION_PREFIX)).toBe(marked);
                expect(option.label.endsWith(option.value)).toBe(true);
            }
        }
    });

    it('keeps the option value the fixture name, so a stored selection resolves', () => {
        // The store persists `fixtureName`, and a decorated label is not a fixture name — so a
        // loader that handed the label through instead of the value would resolve nothing and
        // silently fall back.
        for (const option of options) {
            expect(fixtureByName(option.value)?.name).toBe(option.value);
        }
        const defects = FIXTURE_OPTION_GROUPS.find((group) => group.group === DEFECT_GROUP_LABEL);
        for (const option of defects?.items ?? []) {
            expect(fixtureByName(option.label)).toBeUndefined();
        }
    });

    it('groups the clean roster separately and in its own order', () => {
        const clean = FIXTURE_OPTION_GROUPS.find((group) => group.group === CLEAN_GROUP_LABEL);
        expect(clean?.items.map((option) => option.value))
            .toEqual(CLEAN_TEST_POLYGONS.map((polygon) => polygon.name));
    });

    it('resolves nothing for a name in neither roster', () => {
        expect(fixtureByName('Not A Fixture')).toBeUndefined();
        expect(fixtureByName(null)).toBeUndefined();
    });
});

/*
 * THE HOLED ROSTER IN THE LOADERS (dashboard holed-fixtures spec, decisions 7, 8, 10 and 43; BSA.D317's 21 fixtures).
 */
describe('the holed roster in the loaders', () => {
    it('is a third group of the skeleton editor\'s loader, after the full corpus', () => {
        expect(SKELETON_FIXTURE_OPTION_GROUPS).toEqual([...FIXTURE_OPTION_GROUPS, HOLED_FIXTURE_OPTION_GROUP]);
        expect(HOLED_FIXTURE_OPTION_GROUP.group).toBe(HOLED_GROUP_LABEL);
    });

    it('lists the whole roster, 21 fixtures, in roster order, each enabled', () => {
        expect(HOLED_TEST_POLYGONS).toHaveLength(21);
        expect(HOLED_FIXTURE_OPTION_GROUP.items.map(option => option.value))
            .toEqual(HOLED_TEST_POLYGONS.map(fixture => fixture.name));
        expect(HOLED_FIXTURE_OPTION_GROUP.items.every(option => option.disabled !== true)).toBe(true);
    });

    it('carries no prefix: every label is its name and begins "Holed "', () => {
        for (const option of HOLED_FIXTURE_OPTION_GROUP.items) {
            expect(option.label).toBe(option.value);
            expect(option.label.startsWith('Holed ')).toBe(true);
        }
    });

    it('is disjoint from the full corpus, so every value of the loader is unique', () => {
        const corpus = new Set(FULL_CORPUS.map(polygon => polygon.name));
        expect(HOLED_TEST_POLYGONS.filter(fixture => corpus.has(fixture.name))).toEqual([]);
        const values = SKELETON_FIXTURE_OPTION_GROUPS.flatMap(group => group.items.map(option => option.value));
        expect(new Set(values).size).toBe(values.length);
    });

    it('resolves each holed name through holedFixtureByName, and no corpus name', () => {
        for (const option of HOLED_FIXTURE_OPTION_GROUP.items) {
            expect(holedFixtureByName(option.value)?.name).toBe(option.value);
            expect(fixtureByName(option.value)).toBeUndefined();
        }
        expect(holedFixtureByName(FULL_CORPUS[0].name)).toBeUndefined();
        expect(holedFixtureByName(null)).toBeUndefined();
    });

    it('is listed in the recursive loader with every item disabled', () => {
        expect(RECURSIVE_FIXTURE_OPTION_GROUPS.slice(0, FIXTURE_OPTION_GROUPS.length)).toEqual(FIXTURE_OPTION_GROUPS);
        const holed = RECURSIVE_FIXTURE_OPTION_GROUPS.find(group => group.group === RECURSIVE_HOLED_GROUP_LABEL);
        expect(holed?.items.map(option => option.value)).toEqual(HOLED_TEST_POLYGONS.map(fixture => fixture.name));
        expect(holed?.items.every(option => option.disabled === true)).toBe(true);
        expect(RECURSIVE_HOLED_GROUP_LABEL).toBe('Holed (recursive subdivision refuses holes)');
    });

    it('leaves the full corpus groups without a disabled item', () => {
        for (const group of FIXTURE_OPTION_GROUPS) {
            expect(group.items.every(option => option.disabled === undefined)).toBe(true);
        }
    });
});
