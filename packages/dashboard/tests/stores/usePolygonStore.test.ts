import { usePolygonStore } from '../../src/stores/usePolygonStore';

/*
 * ============================================================================
 *  EDGE WEIGHTS IN THE POLYGON STORE (arc decision 130)
 * ============================================================================
 *
 * `weights` is parallel to `vertices` — `weights[i]` is the speed of the edge from vertex `i` to
 * vertex `i + 1` — and the store's job is to keep it that way through every edit the canvas makes:
 *
 *   - INSERT splits an edge, and both halves inherit its weight;
 *   - DELETE merges two edges, and the survivor keeps the weight of the edge that ran INTO the
 *     deleted vertex — a USER EDIT, not canonicalisation, so arc decision 120 does not apply;
 *   - a NEW POLYGON (fixture load, random generation, reset) gets all ones.
 *
 * THE MUTATION THESE EXIST FOR: splice the weights at the wrong index in either editor and the ring
 * silently acquires a speed change at a vertex the user never touched — a wrong picture that looks
 * like a solver bug.
 */

const TRIANGLE = [{x: 0, y: 0}, {x: 0, y: 10}, {x: 10, y: 10}];

/** The default polygon has five vertices; distinct weights make a misplaced splice visible. */
const FIVE_DISTINCT = [1, 2, 3, 4, 5];

beforeEach(() => {
    usePolygonStore.getState().resetPolygon();
});

describe('weights are parallel to the vertices', () => {
    it('starts as one weight per vertex, all ones', () => {
        const {vertices, weights} = usePolygonStore.getState();
        expect(weights).toHaveLength(vertices.length);
        expect(weights).toEqual([1, 1, 1, 1, 1]);
    });

    it('refuses a zero, a negative or a non-finite weight and keeps the previous one', () => {
        const {setEdgeWeight} = usePolygonStore.getState();
        setEdgeWeight(2, 3);
        setEdgeWeight(2, 0);
        setEdgeWeight(2, -1);
        setEdgeWeight(2, Number.NaN);
        setEdgeWeight(2, Number.POSITIVE_INFINITY);
        expect(usePolygonStore.getState().weights[2]).toBe(3);
    });

    it('ignores an out-of-range edge index rather than growing the array', () => {
        const {setEdgeWeight} = usePolygonStore.getState();
        setEdgeWeight(9, 4);
        setEdgeWeight(-1, 4);
        expect(usePolygonStore.getState().weights).toEqual([1, 1, 1, 1, 1]);
    });
});

describe('inserting a vertex splits an edge and both halves inherit its weight', () => {
    it('duplicates the split edge\'s weight at the insertion index', () => {
        usePolygonStore.setState({weights: [...FIVE_DISTINCT]});
        // The canvas hit-test reports `edge + 1`, so index 2 splits edge 1, which carries weight 2.
        usePolygonStore.getState().addVertex(2, {x: 275, y: 350});
        const {vertices, weights} = usePolygonStore.getState();
        expect(weights).toHaveLength(vertices.length);
        expect(weights).toEqual([1, 2, 2, 3, 4, 5]);
    });

    it('splits the CLOSING edge when the insertion index is 0', () => {
        // Index 0 splits edge 4 — the one running from the last vertex back to the first — so the
        // duplicated weight is 5, and it has to land on both the new first edge and the new last.
        usePolygonStore.setState({weights: [...FIVE_DISTINCT]});
        usePolygonStore.getState().addVertex(0, {x: 325, y: 175});
        const {weights} = usePolygonStore.getState();
        expect(weights).toEqual([5, 1, 2, 3, 4, 5]);
    });

    it('splits the last edge when the insertion index is the vertex count', () => {
        usePolygonStore.setState({weights: [...FIVE_DISTINCT]});
        usePolygonStore.getState().addVertex(5, {x: 325, y: 175});
        expect(usePolygonStore.getState().weights).toEqual([1, 2, 3, 4, 5, 5]);
    });
});

describe('deleting a vertex keeps the weight of the edge that ran INTO it', () => {
    it('drops the outgoing weight, leaving the incoming one on the merged edge', () => {
        usePolygonStore.setState({weights: [...FIVE_DISTINCT]});
        usePolygonStore.getState().removeVertex(2);
        const {vertices, weights} = usePolygonStore.getState();
        expect(weights).toHaveLength(vertices.length);
        // Vertex 2 is gone; the merged edge is index 1 and carries 2, the weight of the edge that
        // ran into the deleted vertex. Weight 3, the outgoing one, is what disappears.
        expect(weights).toEqual([1, 2, 4, 5]);
    });

    it('keeps the CLOSING edge\'s weight when vertex 0 is deleted', () => {
        // The edge running into vertex 0 is edge 4, weight 5; the merged edge becomes the last one.
        usePolygonStore.setState({weights: [...FIVE_DISTINCT]});
        usePolygonStore.getState().removeVertex(0);
        expect(usePolygonStore.getState().weights).toEqual([2, 3, 4, 5]);
    });

    it('changes nothing when the polygon is already a triangle', () => {
        usePolygonStore.getState().setVertices(TRIANGLE);
        usePolygonStore.setState({weights: [1, 2, 3]});
        usePolygonStore.getState().removeVertex(1);
        const {vertices, weights} = usePolygonStore.getState();
        expect(vertices).toHaveLength(3);
        expect(weights).toEqual([1, 2, 3]);
    });
});

describe('a new polygon gets new weights', () => {
    it('resets to ones, at the new length, when vertices are set', () => {
        usePolygonStore.setState({weights: [...FIVE_DISTINCT]});
        // Every fixture load and every random-polygon generation lands on `setVertices`.
        usePolygonStore.getState().setVertices(TRIANGLE);
        const {vertices, weights} = usePolygonStore.getState();
        expect(vertices).toHaveLength(3);
        expect(weights).toEqual([1, 1, 1]);
    });

    it('resets to ones when the polygon is reset', () => {
        usePolygonStore.setState({weights: [...FIVE_DISTINCT]});
        usePolygonStore.getState().resetPolygon();
        expect(usePolygonStore.getState().weights).toEqual([1, 1, 1, 1, 1]);
    });

    it('resets to ones on demand, leaving the vertices alone', () => {
        usePolygonStore.setState({weights: [...FIVE_DISTINCT]});
        const before = usePolygonStore.getState().vertices;
        usePolygonStore.getState().resetWeights();
        const {vertices, weights} = usePolygonStore.getState();
        expect(weights).toEqual([1, 1, 1, 1, 1]);
        expect(vertices).toEqual(before);
    });
});
