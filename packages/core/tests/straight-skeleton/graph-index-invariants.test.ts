import {FULL_CORPUS} from '@proc-geo/test-fixtures';
import {
    normalisePosition,
    solveSkeleton,
    SKELETON_NOISE_FLOOR,
    StraightSkeletonGraph,
    SkeletonNormalisation,
    Vector2,
} from '@proc-geo/core';

/*
 * ============================================================================
 *  TWO INVARIANTS ON THE GRAPH'S OWN INDICES.
 * ============================================================================
 *
 * WHY THEY EXIST. On 2026-08-28 a dashboard inspection reported a run of primary bisectors each
 * carrying the parent pair belonging to the vertex before it — "a very serious defect to allow a
 * primary bisector to be accepted with the wrong pair of parent edges" — together with two skeleton
 * nodes drawn on top of each other. Both readings were of the picture rather than of the graph (see
 * `invisible-vertex-renumbering.test.ts` for what the picture was actually showing), and this file
 * is what settles that question by measurement instead of by argument. Nothing in the suite asked
 * either question before.
 *
 * ----------------------------------------------------------------------------
 * I1 — A PRIMARY BISECTOR'S PARENTS ARE ITS OWN VERTEX'S TWO EDGES
 * ----------------------------------------------------------------------------
 *
 * `initBoundingPolygon` makes exterior edge `v` run from node `v` to node `v + 1`, so the two edges
 * meeting at exterior node `v` are `v` and `v - 1`, and that pair is what the bisector standing on
 * `v` must be priced against: every offset, every collision and every derived bisector downstream
 * reads the parents off the edge. A bisector holding its neighbour's pair would be a wrong answer
 * that no completeness flag could catch.
 *
 * THE ARRAY POSITION IS PART OF THE CLAIM. `interiorEdgeIndex` converts an edge id to a position in
 * `graph.interiorEdges` by subtracting `numExteriorNodes` rather than by searching, so the two
 * arrays are one structure written twice. A single interior edge pushed without its `graph.edges`
 * counterpart — or removed instead of being marked `culled` — would silently shift every parent
 * lookup after it by one, which is exactly the corruption the inspection described. Asserted here so
 * that it cannot happen quietly.
 *
 * ----------------------------------------------------------------------------
 * I2 — NO TWO NODES SIT INSIDE THE COINCIDENCE FLOOR OF EACH OTHER
 * ----------------------------------------------------------------------------
 *
 * Two skeleton nodes closer together than a viewer could ever distinguish are two nodes the picture
 * does not have, and journal decision 78 ruled that the bar for "the same point" is the render-scale
 * floor rather than the arithmetic epsilon. `clusterCoincidentMerges` resolves arrivals inside that
 * floor into one event before any node is placed; `findOrAddNode`'s epsilon remains as the
 * exact-coincidence backstop beneath it. So the invariant is stated at the floor: a pair closer than
 * that is either a merge the clustering should have made, or a doubled node whose degree counts are
 * wrong wherever it happened.
 *
 * MEASURED IN UNIT SPACE, WHICH IS WHERE THE FLOOR LIVES — the polygon is solved at unit extent, so
 * a caller-space distance means nothing until it is carried back through the solve's own
 * normalisation — and as a DISTANCE rather than `vectorsAreEqual`'s component box, which is what the
 * clustering itself compares.
 *
 * ----------------------------------------------------------------------------
 * FIVE PAIRS SURVIVE, ALL ON THE THREE JITTER L FIXTURES, AND THEY ARE PINNED
 * ----------------------------------------------------------------------------
 *
 * Decision 78's clustering resolves an event pair only where both arrivals land in ONE offset layer,
 * and the layer window is still epsilon-wide. Four of these five are separated in time by 13 to 52
 * epsilons — near-coincident in a way only the epsilon can see — so they fall in different layers
 * and never meet the clustering; the fifth is simultaneous to 4e-12 but reaches the graph through
 * the split/partition path, which builds its own nodes outside the merge. Every one of them is
 * under the floor on BOTH axes, so no new rule is needed to describe them, only a wider reach.
 *
 * The measurement is in F28 and the reach is decision 83's, withdrawn on its own STOP clause after
 * widening the layer window was shown to cost two CLEAN fixtures failed regions in the recursion
 * census. Until that lands, these five are a defect signature like any other: pinned exactly, per
 * fixture, so that one appearing anywhere else — or one of these disappearing — is loud.
 */

function primaryParentProblems(graph: StraightSkeletonGraph): string[] {
    const problems: string[] = [];
    const exteriorCount = graph.numExteriorNodes;

    graph.interiorEdges.forEach((interiorEdge, position) => {
        if (interiorEdge.id !== exteriorCount + position) {
            problems.push(`interiorEdges[${position}] holds id ${interiorEdge.id}, but `
                + `interiorEdgeIndex will read it as ${exteriorCount + position}`);
            return;
        }
        const edge = graph.edges[interiorEdge.id];
        if (edge === undefined) {
            problems.push(`interior edge ${interiorEdge.id} has no entry in graph.edges`);
            return;
        }
        // Only bisectors standing on an EXTERIOR node have a vertex whose edges are known by
        // construction; a derived bisector's parents are an outcome of the collision that made it.
        if (edge.source >= exteriorCount) {
            return;
        }
        const clockwise = edge.source;
        const widdershins = (edge.source - 1 + exteriorCount) % exteriorCount;
        if (interiorEdge.clockwiseExteriorEdgeIndex !== clockwise
            || interiorEdge.widdershinsExteriorEdgeIndex !== widdershins) {
            problems.push(`edge ${interiorEdge.id} stands on vertex ${edge.source} and carries parents `
                + `[${interiorEdge.clockwiseExteriorEdgeIndex},${interiorEdge.widdershinsExteriorEdgeIndex}], `
                + `not that vertex's own [${clockwise},${widdershins}]`);
        }
    });

    return problems;
}

/** The node pairs a viewer could not tell apart, as `[lower, higher]` id pairs in ascending order. */
function subFloorPairs(graph: StraightSkeletonGraph, normalisation: SkeletonNormalisation): number[][] {
    const pairs: number[][] = [];
    const unit: Vector2[] = graph.nodes.map(node => normalisePosition(normalisation, node.position));

    for (let first = 0; first < unit.length; first++) {
        for (let second = first + 1; second < unit.length; second++) {
            const separation = Math.hypot(
                unit[first].x - unit[second].x, unit[first].y - unit[second].y);
            if (separation < SKELETON_NOISE_FLOOR) {
                pairs.push([first, second]);
            }
        }
    }

    return pairs;
}

/**
 * The sub-floor node pairs each defect fixture is allowed, MEASURED 2026-08-28. See this file's
 * header for what leaves them standing and what would resolve them.
 *
 * A fixture absent from this table is allowed none, which is every clean fixture and four of the
 * seven defect ones.
 */
const PINNED_SUB_FLOOR_PAIRS: Record<string, number[][]> = {
    'Off-edge Jitter Reflex L (seed 15838)': [[19, 21]],
    'Off-edge Jitter Reflex L (seed 55433)': [[19, 20], [24, 26]],
    'Off-edge Jitter Reflex L (seed 55433, k=4)': [[25, 26], [28, 30]],
};

describe('I1: every primary bisector carries its own vertex\'s two exterior edges', () => {
    it.each(FULL_CORPUS.map(polygon => [polygon.name, polygon.vertices] as const))(
        '%s',
        (_name, vertices) => {
            expect(primaryParentProblems(solveSkeleton(vertices).graph)).toEqual([]);
        },
    );
});

describe('I2: no two graph nodes lie inside the coincidence floor of each other', () => {
    it.each(FULL_CORPUS.map(polygon => [polygon.name, polygon.vertices] as const))(
        '%s',
        (name, vertices) => {
            const {graph, normalisation} = solveSkeleton(vertices);
            expect(subFloorPairs(graph, normalisation)).toEqual(PINNED_SUB_FLOOR_PAIRS[name] ?? []);
        },
    );

    it('is not vacuous: exactly three fixtures carry a pinned pair, and 54 carry none', () => {
        // The guard on the table itself. A pin naming a fixture that is not in the corpus, or a
        // table that quietly grew to cover a regression, would leave the sweep above asserting
        // nothing — so the shape of the table is asserted here rather than trusted.
        const pinned = Object.keys(PINNED_SUB_FLOOR_PAIRS);

        expect(pinned).toHaveLength(3);
        expect(pinned.every(name => FULL_CORPUS.some(polygon => polygon.name === name))).toBe(true);
        expect(Object.values(PINNED_SUB_FLOOR_PAIRS).flat()).toHaveLength(5);
        expect(FULL_CORPUS.filter(polygon => !pinned.includes(polygon.name))).toHaveLength(54);
    });
});
