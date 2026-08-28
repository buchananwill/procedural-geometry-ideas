import {CLEAN_TEST_POLYGONS, FULL_CORPUS, KNOWN_DEFECT_POLYGONS} from '@proc-geo/test-fixtures';
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
 *  THREE INVARIANTS ON THE GRAPH'S OWN INDICES AND PARENTAGE.
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
 * FOUR PAIRS SURVIVE, ALL ON THE THREE JITTER L FIXTURES, AND THEY ARE PINNED
 * ----------------------------------------------------------------------------
 *
 * Decision 78's clustering resolves an event pair only where both arrivals land in ONE offset layer,
 * and the layer window is still epsilon-wide. There were five. The fifth — `(seed 55433, k=4)`'s
 * `[25, 26]`, simultaneous to 4e-12 — was TWO SPLIT EVENTS of one layer, which reached the graph
 * through the split/partition pass and built a node each because that pass never saw the clustering
 * (journal decision 85). `coincidentEventPositions` now gives that pass the same position identity,
 * and the pair is one node.
 *
 * WHAT THE REMAINING FOUR ARE, MEASURED, AND WHY NO CLUSTERING REACHES THEM. Each is a pair joined
 * by a real skeleton edge running from one to the other — `[19,21]` by e35, `[19,20]` by e37,
 * `[24,26]` by e43, `[28,30]` by e50 — so one node is strictly DOWNSTREAM of the other: one event
 * creates the bisector the next event terminates, and the edge's own length (7.3e-7, 1.9e-7, 2.8e-7
 * and 6.7e-7 in unit space) IS the pair's separation. They are causally ordered, not simultaneous.
 * No event-layer rule can call them one event, because they are not in one layer and could not be;
 * merging them means collapsing an edge that exists, which is node-level absorption — the mechanism
 * decision 78's amendment rejected on measurement (F27).
 *
 * So they stand as a defect signature like any other: pinned exactly, per fixture, so that one
 * appearing anywhere else — or one of these disappearing — is loud.
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
    // Was [[25, 26], [28, 30]]. The split-path pair resolved into one node, which renumbers every
    // node after it: the surviving pair is the same geometry that was [28, 30].
    'Off-edge Jitter Reflex L (seed 55433, k=4)': [[27, 29]],
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
        expect(Object.values(PINNED_SUB_FLOOR_PAIRS).flat()).toHaveLength(4);
        expect(FULL_CORPUS.filter(polygon => !pinned.includes(polygon.name))).toHaveLength(54);
    });
});

/*
 * ----------------------------------------------------------------------------
 * I3 — A BISECTOR'S SOURCE IS EQUIDISTANT FROM ITS TWO PARENTS
 * ----------------------------------------------------------------------------
 *
 * This is what a bisector IS. An interior edge names two exterior edges as its parents and claims to
 * trace the wavefront vertex between them, so every point of it — its source first of all — is the
 * same distance from both. Nothing else in the suite says so: parentage was audited for INDEX
 * correctness by I1 and for nothing else, and a bisector born at a point off its own parents' locus
 * satisfies containment, causality, clearance and the rate rule while being no bisector at all.
 *
 * THE COUNTING FORM THIS REPLACES IS FALSE ON THE CORPUS, and the measurement is worth keeping.
 * Journal decision 88 proposed "at most one bisector per unordered parent pair, head-on excepted".
 * Thirteen fixtures carry a pair with two bisectors, and SIX of them are clean: `Rectangle` and
 * `Pentagon House` carry a head-on pair, which the exception covers, but `Cross` carries FOUR pairs
 * whose two bisectors travel in the SAME direction, and `Golf Cart`, `T-Shape` and
 * `Slightly Deformed Peanut 1` carry more. They are legitimate: where the two parents are parallel
 * the equidistant locus is a single mid-line, and one arm of a plus-shaped polygon can put two
 * disjoint segments of that one line into the same solve. Counting cannot tell those from a defect;
 * equidistance can, because two bisectors of parallel parents that do NOT share the mid-line are
 * exactly what a wrong one looks like.
 *
 * MEASURED OVER ALL 57 FIXTURES: the worst discrepancy anywhere is 6.1e-16 in unit space, which is
 * machine precision on a quantity of order one. The bar below is 1e-9 — six orders of headroom
 * against arithmetic, and still three orders tighter than the render floor, so it cannot be
 * satisfied by a bisector that is merely close to belonging to its parents.
 *
 * WHAT IT CAUGHT. Journal decision 84's gated layer window, on the one clean fixture it regressed:
 * a merged node emitted a bisector labelled `[2,3]` whose source was **1.03e-6** from being
 * equidistant from edges 2 and 3 — the only violating edge in that solve, and the reason its
 * two-edge base case could not close. See F31.
 */

/** Perpendicular distance from `point` to the supporting LINE of exterior edge `edgeId`. */
function distanceToParentLine(graph: StraightSkeletonGraph, edgeId: number, point: Vector2): number {
    const edge = graph.edges[edgeId];
    if (edge?.target === undefined) {
        return Number.NaN;
    }
    const from = graph.nodes[edge.source].position;
    const to = graph.nodes[edge.target].position;
    const along = {x: to.x - from.x, y: to.y - from.y};
    const length = Math.hypot(along.x, along.y);
    if (length === 0) {
        return Number.NaN;
    }
    return Math.abs((point.x - from.x) * along.y - (point.y - from.y) * along.x) / length;
}

/**
 * How far each interior edge's source is from being equidistant from its two parents, in unit space.
 *
 * Measured against the parents' supporting LINES rather than their segments: a bisector runs between
 * two lines and is equidistant from them however far past a segment's end it travels. Unit space
 * because that is where the solver's tolerances live, and a caller-space figure would say different
 * things about the same skeleton at two placements.
 */
function equidistanceProblems(
    graph: StraightSkeletonGraph,
    normalisation: SkeletonNormalisation,
    bar: number,
): string[] {
    const problems: string[] = [];

    for (const interiorEdge of graph.interiorEdges) {
        const edge = graph.edges[interiorEdge.id];
        if (edge === undefined) {
            continue;
        }
        const source = graph.nodes[edge.source].position;
        const toClockwise = distanceToParentLine(graph, interiorEdge.clockwiseExteriorEdgeIndex, source);
        const toWiddershins = distanceToParentLine(graph, interiorEdge.widdershinsExteriorEdgeIndex, source);
        if (Number.isNaN(toClockwise) || Number.isNaN(toWiddershins)) {
            continue;
        }

        const discrepancy = Math.abs(toClockwise - toWiddershins) * normalisation.toUnitScale;
        if (discrepancy > bar) {
            problems.push(`edge ${interiorEdge.id} claims parents `
                + `[${interiorEdge.clockwiseExteriorEdgeIndex},${interiorEdge.widdershinsExteriorEdgeIndex}] `
                + `but its source is ${discrepancy.toExponential(3)} from equidistant between them`);
        }
    }

    return problems;
}

/** Six orders above the corpus's measured worst, three below the render floor. See above. */
const EQUIDISTANCE_BAR = 1e-9;

/** The largest equidistance discrepancy anywhere in these fixtures' solves, in unit space. */
function worstEquidistance(polygons: readonly {vertices: Vector2[]}[]): number {
    let worst = 0;
    for (const {vertices} of polygons) {
        const {graph, normalisation} = solveSkeleton(vertices);
        for (const problem of equidistanceProblems(graph, normalisation, 0)) {
            worst = Math.max(worst, Number(/([\d.e-]+) from equidistant/.exec(problem)?.[1] ?? 0));
        }
    }
    return worst;
}

describe('I3: every bisector is equidistant from the two parents it names', () => {
    it.each(FULL_CORPUS.map(polygon => [polygon.name, polygon.vertices] as const))(
        '%s',
        (_name, vertices) => {
            const {graph, normalisation} = solveSkeleton(vertices);
            expect(equidistanceProblems(graph, normalisation, EQUIDISTANCE_BAR)).toEqual([]);
        },
    );

    it('holds to machine precision on the CLEAN roster', () => {
        // The bar is headroom, and this is the statement that nothing clean is leaning on it. A
        // fixture drifting into the six orders between the two is a change worth seeing before it
        // becomes a failure.
        expect(worstEquidistance(CLEAN_TEST_POLYGONS)).toBeLessThan(1e-15);
    });

    it('leans on the headroom exactly once, and that one is pinned', () => {
        /*
         * THE COST OF GIVING THE SPLIT PASS POSITION IDENTITY, MEASURED, and journal F32's terminal
         * finding reproduced in miniature: the merged node stands at the medoid, which is one of the
         * two event positions, so the OTHER split's bisectors are emitted from a point 5.4e-7 from
         * where that split happened and are not exactly equidistant from the parents they name. On
         * `(seed 55433, k=4)` that costs 8.34e-12 — two orders inside the 1e-9 bar, and the price
         * paid for resolving the pair the user could not distinguish at maximum zoom (decision 78's
         * criterion) and for the direction violation that went with it, which is now zero.
         *
         * PINNED RATHER THAN ABSORBED, and pinned as a SET, so that a second fixture leaning on the
         * headroom is a failure here rather than a number quietly growing. The clean roster is
         * asserted separately above and is bit-unmoved at 6.11e-16.
         */
        const leaning = KNOWN_DEFECT_POLYGONS
            .filter(polygon => worstEquidistance([polygon]) >= 1e-15)
            .map(polygon => polygon.name);

        expect(leaning).toEqual(['Off-edge Jitter Reflex L (seed 55433, k=4)']);
        expect(worstEquidistance(KNOWN_DEFECT_POLYGONS) / 8.34e-12).toBeCloseTo(1, 2);
    });
});
