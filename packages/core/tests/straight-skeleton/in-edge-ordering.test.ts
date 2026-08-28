import {CLEAN_TEST_POLYGONS} from '@proc-geo/test-fixtures';
import {setSkeletonLogLevel, SkeletonSolveResult, solveSkeleton, Vector2} from '@proc-geo/core';
import {place} from './placement-helpers';

/*
 * ============================================================================
 *  `inEdges` IS AN ORDERED VALUE, AND THE ORDER IS THE POLYGON'S, NOT THE
 *  ARITHMETIC'S. DO NOT WEAKEN THESE TO A SET COMPARISON.
 * ============================================================================
 *
 * WHAT WAS WRONG
 *
 * A node's `inEdges` was whatever order the solve happened to arrive at it in. Measured over the
 * 37-fixture corpus of the time, 21 fixtures reordered at least one node's `inEdges` under an
 * arithmetic perturbation while every set stayed identical — the sets are a function of the
 * geometry, the order was a function of the last bits.
 *
 * WHY THAT MATTERED, RATHER THAN BEING COSMETIC
 *
 * `offset-projection.ts` dates an interior node from the clockwise parent of the FIRST bisector
 * incident to it (`firstIncidentParentEdge`), and a node's incident parents are equidistant from it
 * only in exact arithmetic — in floating point they disagree in the last bits. So the stored order
 * chose which of several near-equal numbers a node's offset was re-derived as, and an order that
 * moved with the placement made that a placement-dependent answer. Nothing else reads the order:
 * `hasInteriorLoop` walks `inEdges` as an exhaustive reachability search, whose verdict cannot
 * depend on traversal order, and the three dashboard readers union it with `outEdges` to draw.
 *
 * THE FIX AND WHAT PINS IT
 *
 * `addInEdges` in `graph-helpers.ts` keeps the list ascending by edge id at construction, and every
 * site that adds an in-edge goes through it. Ascending edge id is a total order on the set itself,
 * so the stored value is a function of the polygon.
 *
 * THE SWEEPS BELOW COMPARE RAW SEQUENCES ACROSS PLACEMENTS, deliberately. Comparing sorted copies
 * would pass just as well with the sort removed — it would only be re-asserting that the SETS
 * agree, which was never the defect.
 *
 * WHICH ASSERTION CATCHES WHICH DEFECT, measured rather than assumed:
 *
 *   - Removing the sort from `addInEdges` fails only the ASCENDING sweep, on `Cross` and
 *     `T-Shape`. Both placement sweeps still pass. The dominant path into `inEdges` is a
 *     coincident-event merge, whose arrivals decision 65 already delivers in ascending id order,
 *     so what the sort adds on this corpus is the two fixtures whose in-edges arrive by the paths
 *     a merge does not cover — the late single-edge snap in `tryAttachEdgeToNode`, and
 *     `crossWireEdges`. THAT IS NOT COSMETIC: the sort moved `fired` from 124 to 133 in
 *     `offset-event-boundary-regression.test.ts`, which is `firstIncidentParentEdge` reading a
 *     different incident parent and dating those nodes differently.
 *   - The two PLACEMENT sweeps catch node identity moving, which is decision 65's property rather
 *     than this file's. The translated one earned its place by catching a real one: with only the
 *     coincident-merge ordering canonicalised, `Golf Cart`'s two simultaneous splits of its top
 *     edge still swapped node ids under a translation of 1e3, because equal-priority collision
 *     events were still handled in the order the offset sort delivered them. The tie-break in
 *     `algorithm-complex-cases.ts` closed it. A scale-only sweep would not have seen it.
 */

setSkeletonLogLevel('silent');

const SCALE_FACTOR = 7;
const TRANSLATION = 1e3;

/** Every node's `inEdges`, in the order the graph stores them, keyed by node id. */
function inEdgeSequences(vertices: Vector2[], scale: number, translate: number): number[][] {
    const result: SkeletonSolveResult = solveSkeleton(place(vertices, scale, translate));
    return result.graph.nodes.map(node => [...node.inEdges]);
}

function isAscending(sequence: number[]): boolean {
    return sequence.every((edgeId, index) => index === 0 || sequence[index - 1] < edgeId);
}

describe('inEdges ordering', () => {
    it.each(CLEAN_TEST_POLYGONS)('$name stores the same sequences at scale 1 and scale 7', ({vertices}) => {
        expect(inEdgeSequences(vertices, SCALE_FACTOR, 0)).toEqual(inEdgeSequences(vertices, 1, 0));
    });

    it.each(CLEAN_TEST_POLYGONS)('$name stores the same sequences translated by 1e3', ({vertices}) => {
        expect(inEdgeSequences(vertices, 1, TRANSLATION)).toEqual(inEdgeSequences(vertices, 1, 0));
    });

    it.each(CLEAN_TEST_POLYGONS)('$name stores every node ascending by edge id', ({vertices}) => {
        const offenders = inEdgeSequences(vertices, 1, 0)
            .map((sequence, nodeId) => ({nodeId, sequence}))
            .filter(({sequence}) => !isAscending(sequence))
            .map(({nodeId, sequence}) => `n${nodeId}: [${sequence.join(', ')}]`);

        expect(offenders.join('; ')).toBe('');
    });

    it('is a live comparison: a hand-shuffled sequence is caught', () => {
        // Without this the sweeps above would pass on a solver that returned no nodes at all, or on
        // a comparison that had been softened to a set. Reversing one stored order must break the
        // exact equality they assert.
        const {vertices} = CLEAN_TEST_POLYGONS.find(polygon => polygon.name === 'Awkward Hexagon')!;
        const shuffled = inEdgeSequences(vertices, 1, 0);
        const shuffledNode = shuffled.findIndex(sequence => sequence.length > 1);
        expect(shuffledNode).toBeGreaterThanOrEqual(0);
        shuffled[shuffledNode].reverse();

        expect(shuffled).not.toEqual(inEdgeSequences(vertices, 1, 0));
    });
});
