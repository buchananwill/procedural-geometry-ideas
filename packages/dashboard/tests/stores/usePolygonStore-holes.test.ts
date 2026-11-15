import { HOLED_F4, HOLED_TEST_POLYGONS } from '@proc-geo/test-fixtures';
import { usePolygonStore } from '../../src/stores/usePolygonStore';

/*
 * ============================================================================
 *  HOLES IN THE POLYGON STORE (dashboard holed-fixtures spec, decisions 1 to 4 and 43; BSA.D284)
 * ============================================================================
 *
 * `loadHoledFixture` is the only writer of `holes`; a new polygon of any other kind clears them; the outline stays
 * editable and its edits never touch a hole.
 */

const TRIANGLE = [{x: 0, y: 0}, {x: 0, y: 10}, {x: 10, y: 10}];

beforeEach(() => {
    usePolygonStore.getState().resetPolygon();
});

describe('loadHoledFixture', () => {
    it('sets the outline, its weights, the holes with their weights and the name, and clears the selection', () => {
        usePolygonStore.getState().setSelectedVertex(2);
        usePolygonStore.getState().loadHoledFixture(HOLED_F4);
        const {vertices, weights, holes, holedFixtureName, selectedVertex} = usePolygonStore.getState();
        expect(vertices).toEqual(HOLED_F4.outline);
        // F4's outline gives no weights, so they are all ones; its hole gives its own.
        expect(weights).toEqual([1, 1, 1, 1]);
        expect(holes).toEqual([{vertices: HOLED_F4.holes[0].vertices, weights: [1.3, 1, 1, 1]}]);
        expect(holedFixtureName).toBe(HOLED_F4.name);
        expect(selectedVertex).toBeNull();
    });

    it('gives a hole with no weights all ones, one per edge', () => {
        const fixture = HOLED_TEST_POLYGONS.find(candidate => candidate.name === 'Holed F2: two holes')!;
        usePolygonStore.getState().loadHoledFixture(fixture);
        expect(usePolygonStore.getState().holes.map(hole => hole.weights)).toEqual([[1, 1, 1, 1], [1, 1, 1, 1]]);
    });

    it('copies, so no array is shared with the roster', () => {
        usePolygonStore.getState().loadHoledFixture(HOLED_F4);
        const state = usePolygonStore.getState();
        expect(state.vertices).not.toBe(HOLED_F4.outline);
        expect(state.vertices[0]).not.toBe(HOLED_F4.outline[0]);
        expect(state.holes[0].vertices).not.toBe(HOLED_F4.holes[0].vertices);
        expect(state.holes[0].vertices[0]).not.toBe(HOLED_F4.holes[0].vertices[0]);
        expect(state.holes[0].weights).not.toBe(HOLED_F4.holes[0].weights);
        // Moving the outline does not move the roster's.
        usePolygonStore.getState().moveVertex(0, 99, 99);
        expect(HOLED_F4.outline[0]).toEqual({x: 0, y: 0});
    });
});

describe('a new polygon of any other kind is a single loop (decision 3)', () => {
    it('setVertices clears both hole fields', () => {
        usePolygonStore.getState().loadHoledFixture(HOLED_F4);
        usePolygonStore.getState().setVertices(TRIANGLE);
        const {holes, holedFixtureName} = usePolygonStore.getState();
        expect(holes).toEqual([]);
        expect(holedFixtureName).toBeNull();
    });

    it('resetPolygon clears both hole fields', () => {
        usePolygonStore.getState().loadHoledFixture(HOLED_F4);
        usePolygonStore.getState().resetPolygon();
        const {holes, holedFixtureName} = usePolygonStore.getState();
        expect(holes).toEqual([]);
        expect(holedFixtureName).toBeNull();
    });
});

describe('the outline stays editable and its edits leave the holes alone (decision 4)', () => {
    const mutators: [string, () => void][] = [
        ['moveVertex', () => usePolygonStore.getState().moveVertex(1, 0.5, 9)],
        ['addVertex', () => usePolygonStore.getState().addVertex(1, {x: 0, y: 5})],
        ['removeVertex', () => {
            usePolygonStore.getState().addVertex(1, {x: 0, y: 5});
            usePolygonStore.getState().removeVertex(1);
        }],
        ['setEdgeWeight', () => usePolygonStore.getState().setEdgeWeight(2, 1.5)],
        ['resetWeights', () => usePolygonStore.getState().resetWeights()],
        ['setSelectedVertex', () => usePolygonStore.getState().setSelectedVertex(1)],
    ];

    it.each(mutators)('%s leaves holes and the name deep-equal', (_name, mutate) => {
        usePolygonStore.getState().loadHoledFixture(HOLED_F4);
        const before = usePolygonStore.getState();
        const holes = structuredClone(before.holes);
        mutate();
        const after = usePolygonStore.getState();
        expect(after.holes).toEqual(holes);
        expect(after.holedFixtureName).toBe(HOLED_F4.name);
    });

    it('moveVertex still moves the outline', () => {
        usePolygonStore.getState().loadHoledFixture(HOLED_F4);
        usePolygonStore.getState().moveVertex(1, 0.5, 9);
        expect(usePolygonStore.getState().vertices[1]).toEqual({x: 0.5, y: 9});
    });
});
