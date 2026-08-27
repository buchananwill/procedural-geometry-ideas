import {handleInteriorNGon, runAlgorithmV5, StraightSkeletonSolverContext, Vector2} from '@proc-geo/core';
import {initContext} from '@proc-geo/test-fixtures';
import {GOLF_CART} from '../../../test-fixtures/src/rectilinear-shapes';

/*
 * ============================================================================
 *  THE DOUBLE-SPLIT LAYER: two simultaneous splits of one exterior edge.
 * ============================================================================
 *
 * `GOLF_CART` is the T-shape with its right stem wall slanted. Edges 2 and 6 both lie on y=400,
 * parallel to top edge 0 at distance 200, so the reflex bisectors from vertex 6 (200,400) and
 * vertex 3 (560.97,400) both split edge 0 at the same offset — FORCED exactly, not a tolerance
 * accident — but at DIFFERENT points, (300,500) and (~493.4,500), because the slant tilts vertex
 * 3's bisector. The clean T_SHAPE survives only because its mirror-symmetric bisectors meet AT the
 * shared split point and the `interiorNonAdjacent` collision pre-empts the splits; the slant pushes
 * that intersection out of bounds, so nothing pre-empts them.
 *
 * The partition dedupe used to assume all same-start events in a layer were nested re-reports of
 * ONE split, kept the smallest, and threw `Partition sorting failure` when a same-start event
 * crossed the kept one. Same-start events are now treated as re-reports only when they share the
 * split node; from different split nodes they are distinct simultaneous splits, the layer
 * partitions at every split point, and the middle child is legitimately bounded by split bisectors
 * from two different source nodes. The `partitionSpan` inversion — `(cw − ws + N) % N` against the
 * documented `(ws − cw + N) % N` — was corrected in the same change; alone, either half of the fix
 * converts the loud failure into a silent wrong skeleton.
 *
 * The variant matrix below is the measurement that ruled tolerance out as the cause: the committed
 * fixture's 6e-14 perturbation is inert (slant-only with exact y=400 failed identically, and
 * perturbation-only solved), while tilting edge 2 off y=400 solved by separating the two splits
 * into different layers. Every variant now asserts a complete solve, so the fix cannot regress the
 * ones that already passed while it repairs the ones that failed.
 */

/**
 * The T-shape family: vertex 3 is the reflex corner where the bar meets the stem's right wall.
 *   base T_SHAPE  vertex 3 = (400, 400).
 *   GOLF_CART     vertex 3 = (560.9659381815327, 399.99999999999994).
 */
function tShapeWithVertex3(v3: Vector2): Vector2[] {
    return [
        {x: 0, y: 600},
        {x: 600, y: 600},
        {x: 600, y: 400},
        v3,
        {x: 400, y: 0},
        {x: 200, y: 0},
        {x: 200, y: 400},
        {x: 0, y: 400},
    ];
}

const VARIANTS: [string, Vector2][] = [
    ['T_SHAPE (clean, v3=(400,400))', {x: 400, y: 400}],
    ['GOLF_CART (slant + perturbation)', {x: 560.9659381815327, y: 399.99999999999994}],
    ['slant only (y=400 exact)', {x: 560.9659381815327, y: 400}],
    ['perturbation only (x=400)', {x: 400, y: 399.99999999999994}],
    ['mild slant (x=500, y=400)', {x: 500, y: 400}],
    ['slant, edge 2 clearly tilted (y=380)', {x: 560.9659381815327, y: 380}],
    ['slant, edge 2 clearly tilted (y=420)', {x: 560.9659381815327, y: 420}],
];

function expectCompleteSolve(context: StraightSkeletonSolverContext): void {
    expect(context.acceptedEdges.every(Boolean)).toBe(true);

    const unresolved = context.graph.interiorEdges
        .filter(interior => !interior.culled && context.graph.edges[interior.id].target === undefined)
        .map(interior => interior.id);
    expect(unresolved).toEqual([]);
}

describe('GOLF_CART solves end to end', () => {
    it('the committed fixture solves completely', () => {
        expectCompleteSolve(runAlgorithmV5(GOLF_CART));
    });

    describe.each(VARIANTS)('%s', (_name, v3) => {
        it('solves completely', () => {
            expectCompleteSolve(runAlgorithmV5(tShapeWithVertex3(v3)));
        });
    });
});

describe('the double-split layer partitions at every split point', () => {
    /**
     * The first n-gon layer, driven directly. At offset 100 it carries the two head-corner pair
     * collapses AND both splits of edge 0; the two crossing same-start `BisectionParams` families
     * — (cw0,ws5)/(cw6,ws0) from the vertex-6 split and (cw0,ws2)/(cw3,ws0) from the vertex-3
     * split — must come out as three children, not a throw and not a single kept split.
     */
    function firstLayer() {
        const context = initContext(GOLF_CART);
        const edgesBefore = context.graph.edges.length;
        const result = handleInteriorNGon(context, {
            interiorEdges: context.graph.interiorEdges.map(edge => edge.id),
        });
        const children = result.childSteps.filter(child => child.interiorEdges.length > 0);
        return {context, edgesBefore, children};
    }

    function exteriorParentsOf(context: StraightSkeletonSolverContext, interiorEdges: number[]): number[] {
        const parents = new Set<number>();
        for (const id of interiorEdges) {
            const interior = context.getInteriorWithId(id);
            parents.add(interior.clockwiseExteriorEdgeIndex);
            parents.add(interior.widdershinsExteriorEdgeIndex);
        }
        return [...parents].sort((a, b) => a - b);
    }

    it('emits three non-empty children covering the right, middle and left regions', () => {
        const {context, children} = firstLayer();

        const parentSets = children
            .map(child => exteriorParentsOf(context, child.interiorEdges))
            .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

        expect(parentSets).toEqual([
            [0, 2],          // right of the vertex-3 split: edges 0..2 (edge 1 collapsed in the same layer)
            [0, 3, 4, 5],    // between the splits: the stem, still fronted by edge 0's middle portion
            [0, 6],          // left of the vertex-6 split: edges 6..0 (edge 7 collapsed in the same layer)
        ]);
    });

    it('bounds the middle child with split bisectors from two different source nodes', () => {
        const {context, edgesBefore, children} = firstLayer();

        const middle = children.find(child =>
            exteriorParentsOf(context, child.interiorEdges).join(',') === '0,3,4,5');
        expect(middle).toBeDefined();
        expect(middle!.interiorEdges).toHaveLength(4);

        // Two of its four edges were born this layer: one bisector per split, from distinct nodes.
        const bornThisLayer = middle!.interiorEdges.filter(id => id >= edgesBefore);
        expect(bornThisLayer).toHaveLength(2);

        const sources = bornThisLayer.map(id => context.findSource(id));
        expect(sources[0].id).not.toBe(sources[1].id);

        // The split points themselves: both on the offset-100 front, at distinct positions.
        const positions = sources
            .map(source => source.position)
            .sort((a, b) => a.x - b.x);
        expect(positions[0].x).toBeCloseTo(300, 6);
        expect(positions[0].y).toBeCloseTo(500, 6);
        expect(positions[1].x).toBeCloseTo(493.414, 2);
        expect(positions[1].y).toBeCloseTo(500, 6);
    });
});
