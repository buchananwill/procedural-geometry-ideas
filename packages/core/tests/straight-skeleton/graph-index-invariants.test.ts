import {FULL_CORPUS} from '@proc-geo/test-fixtures';
import {
    normalisePosition,
    solveSkeleton,
    vectorsAreEqual,
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
 * I2 — NO TWO NODES SIT INSIDE THE SOLVER'S OWN MERGE TOLERANCE
 * ----------------------------------------------------------------------------
 *
 * `findOrAddNode` returns an existing node when `vectorsAreEqual` accepts the position, so two
 * distinct nodes closer than that tolerance mean the lookup missed one it should have found — a
 * skeleton with a doubled node, and a graph whose degree counts are wrong wherever it happened.
 *
 * MEASURED IN UNIT SPACE, WHICH IS WHERE THE TOLERANCE LIVES. The solver's epsilon is absolute and
 * the polygon is solved at unit extent, so a caller-space distance means nothing until it is carried
 * back through the solve's own normalisation. This asks `vectorsAreEqual` the same question
 * `findOrAddNode` asked, about the same pair of points, in the same space.
 *
 * NODES A FRACTION OF A PIXEL APART ARE NOT THIS. A near-degenerate boundary genuinely resolves to
 * several distinct nodes in a cluster far tighter than a screen pixel — `INVISIBLE_VERTEX_RECTANGLE`
 * carries four within 0.05 of a 175-unit shape — and they are correct geometry, not a missed merge.
 * The bar is the tolerance the solver merges at and nothing wider.
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

function mergedNodeProblems(graph: StraightSkeletonGraph, normalisation: SkeletonNormalisation): string[] {
    const problems: string[] = [];
    const unit: Vector2[] = graph.nodes.map(node => normalisePosition(normalisation, node.position));

    for (let first = 0; first < unit.length; first++) {
        for (let second = first + 1; second < unit.length; second++) {
            if (vectorsAreEqual(unit[first], unit[second])) {
                problems.push(`nodes ${first} and ${second} are one node to findOrAddNode, at `
                    + `(${graph.nodes[first].position.x}, ${graph.nodes[first].position.y})`);
            }
        }
    }

    return problems;
}

describe('I1: every primary bisector carries its own vertex\'s two exterior edges', () => {
    it.each(FULL_CORPUS.map(polygon => [polygon.name, polygon.vertices] as const))(
        '%s',
        (_name, vertices) => {
            expect(primaryParentProblems(solveSkeleton(vertices).graph)).toEqual([]);
        },
    );
});

describe('I2: no two graph nodes lie inside the solver\'s merge tolerance', () => {
    it.each(FULL_CORPUS.map(polygon => [polygon.name, polygon.vertices] as const))(
        '%s',
        (_name, vertices) => {
            const {graph, normalisation} = solveSkeleton(vertices);
            expect(mergedNodeProblems(graph, normalisation)).toEqual([]);
        },
    );
});
