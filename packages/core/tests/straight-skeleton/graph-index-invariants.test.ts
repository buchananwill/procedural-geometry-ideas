import {
    CLEAN_TEST_POLYGONS, COLLINEAR_DUMBBELL, FULL_CORPUS, KNOWN_DEFECT_POLYGONS,
} from '@proc-geo/test-fixtures';
import {
    Arrival,
    compareArrivals,
    normalisePosition,
    solveSkeleton,
    SKELETON_NOISE_FLOOR,
    StraightSkeletonGraph,
    SkeletonNormalisation,
    Vector2,
} from '@proc-geo/core';
import {HELD_SIMULTANEITY_WINDOW} from '@proc-geo/core/straight-skeleton/constants';
import {deriveNodeArrivals} from './wavefront-measurement-helpers';

/*
 * ============================================================================
 *  FOUR INVARIANTS ON THE GRAPH'S OWN INDICES, PARENTAGE AND FACE CLOSURE.
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
 * I2 — NO TWO NODES SIT INSIDE THE COINCIDENCE FLOOR OF EACH OTHER, UNLESS A
 *      SKELETON EDGE JOINS THEM AND ITS TWO ENDS LIE IN DIFFERENT OFFSET LAYERS
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
 * THE EXEMPTION, AND WHY IT IS NOT A SOFTENING (journal decision 141, user, 2026-09-23). "The
 * precision floor is a BOUNDARY CONDITION on what the solver cannot decide, not a filter on what it
 * has well-definedly produced." The floor decides QUESTIONS the arithmetic cannot — same event, same
 * direction, same line. A node born of two separately-decidable events in DIFFERENT offset layers is
 * an ANSWER, and the spatial separation of two such nodes is a property of the output, not an
 * undecidable question. So a sub-floor pair is admitted exactly when an interior edge joins the two
 * nodes AND the solver's own simultaneity comparison — `compareArrivals` at its default epsilon, in
 * unit space, on the arrivals `deriveNodeArrivals` re-derives from geometry (the causality suite's
 * oracle, not a copy) — calls the two ends' offsets DIFFERENT. A genuine doubled node stays a
 * violation: two sub-floor nodes with no joining edge, or joined by an edge whose two ends the
 * solver would call one moment, are one event recorded twice, and that is what the floor is for.
 *
 * MEASURED 2026-09-23 on the four historical pairs below: their two ends' unit-space offsets differ
 * by 5.16e-7, 1.37e-7, 1.96e-7 and 4.71e-7 — 14 to 52 times the solver's 1e-8 simultaneity window.
 * Nothing about them sits near the layer boundary the exemption draws.
 *
 * MEASURED IN UNIT SPACE, WHICH IS WHERE THE FLOOR LIVES — the polygon is solved at unit extent, so
 * a caller-space distance means nothing until it is carried back through the solve's own
 * normalisation — and as a DISTANCE rather than `vectorsAreEqual`'s component box, which is what the
 * clustering itself compares.
 *
 * ----------------------------------------------------------------------------
 * HISTORY: FOUR PAIRS SURVIVED, ALL ON THE THREE JITTER L FIXTURES, AND WERE PINNED
 * ----------------------------------------------------------------------------
 *
 * Kept as the measurement that decision 141 ruled on. Until 2026-09-23 the four pairs below were a
 * defect signature, `PINNED_SUB_FLOOR_PAIRS`, guarded by a test asserting that exactly three
 * fixtures carried one. That table is RETIRED through the cure flow rather than zeroed: the test
 * that replaced it asserts, per pair, that the pair still stands AND that the exemption is what
 * admits it (joined, different layers), so the pairs remain named without being a pin the sweep
 * reads. `(seed 55433)` carried two of them; with them admitted, its promotion to the clean roster
 * was measured the same day and REFUSED by other clean bars (the recursive driver's canonical-area
 * drift and scale invariance among them — see its census row in `recursive-subdivision.test.ts`),
 * so it stays in KNOWN_DEFECT_POLYGONS on those, not on this invariant.
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
 * `[24,26]` by e43, `[28,30]` by e50 (renumbered `[27,29]` once decision 85 merged the split-path
 * pair) — so one node is strictly DOWNSTREAM of the other: one event
 * creates the bisector the next event terminates, and the edge's own length (7.3e-7, 1.9e-7, 2.8e-7
 * and 6.7e-7 in unit space) IS the pair's separation. They are causally ordered, not simultaneous.
 * No event-layer rule can call them one event, because they are not in one layer and could not be;
 * merging them means collapsing an edge that exists, which is node-level absorption — the mechanism
 * decision 78's amendment rejected on measurement (F27).
 *
 * They stood as a defect signature, pinned exactly per fixture, until decision 141 ruled that this
 * causal ordering is precisely what makes them admissible: each is an answer the solver decided
 * twice, in two layers, not a question it could not decide. The exemption above is that ruling
 * stated as a condition on the graph, so a pair appearing anywhere else is admitted only if it is
 * of the same kind, and a doubled node — the kind I2 exists for — is still a failure everywhere.
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

/** What the exemption found about one sub-floor pair: the edges joining it, and whether any is layered. */
interface SubFloorVerdict {
    pair: number[];
    /** Resolved interior edges running between the two nodes, in either direction. */
    joiningEdges: number[];
    /** Whether some joining edge's two ends lie in different offset layers. */
    admitted: boolean;
}

/**
 * Do these two nodes lie in different offset layers, by the solver's own simultaneity comparison?
 *
 * The arrivals are the causality suite's oracle ({@link deriveNodeArrivals}) carried into unit space,
 * where the solver's simultaneity window lives; `compareArrivals` at the window the solver's sites
 * actually spend — `HELD_SIMULTANEITY_WINDOW` (1e-8), held under C8 dispatches 1 and 2's T37 STOPs
 * rather than the derived `simultaneityWindow(δ)` or T12's amended per-pair form — is the comparison
 * the solver itself uses to decide that one arrival is not yet another. When the sites move, this
 * instrument moves with them. The oracle's arrivals are re-derived from STORED node positions, so they
 * carry no pricing error budget (`uncertainty` 0). A node with no derived arrival cannot be placed in a
 * layer and is not admitted.
 */
function inDifferentLayers(
    arrivals: Map<number, Arrival>,
    normalisation: SkeletonNormalisation,
    first: number,
    second: number,
): boolean {
    const a = arrivals.get(first);
    const b = arrivals.get(second);
    if (a === undefined || b === undefined) {
        return false;
    }
    const toUnit = (arrival: Arrival): Arrival => ({
        distance: arrival.distance * normalisation.toUnitScale,
        weight: arrival.weight,
        uncertainty: 0,
    });
    return compareArrivals(toUnit(a), toUnit(b), HELD_SIMULTANEITY_WINDOW) !== 0;
}

/** Every sub-floor pair, with the exemption's reading of it (journal decision 141). */
function subFloorVerdicts(graph: StraightSkeletonGraph, normalisation: SkeletonNormalisation): SubFloorVerdict[] {
    const arrivals = deriveNodeArrivals(graph);
    return subFloorPairs(graph, normalisation).map(([first, second]) => {
        const joiningEdges = graph.interiorEdges
            .map(interior => graph.edges[interior.id])
            .filter(edge => edge !== undefined && edge.target !== undefined
                && ((edge.source === first && edge.target === second)
                    || (edge.source === second && edge.target === first)))
            .map(edge => edge.id);
        return {
            pair: [first, second],
            joiningEdges,
            admitted: joiningEdges.length > 0 && inDifferentLayers(arrivals, normalisation, first, second),
        };
    });
}

/** The sub-floor pairs the exemption does NOT admit: I2's violations. */
function unadmittedSubFloorPairs(graph: StraightSkeletonGraph, normalisation: SkeletonNormalisation): number[][] {
    return subFloorVerdicts(graph, normalisation)
        .filter(verdict => !verdict.admitted)
        .map(verdict => verdict.pair);
}

/**
 * The four pairs that were `PINNED_SUB_FLOOR_PAIRS` until 2026-09-23, with the edge that joins each —
 * kept as HISTORY that is still asserted, not as a pin the sweep reads. See the I2 header.
 */
const HISTORICAL_SUB_FLOOR_PAIRS = [
    {fixture: 'Off-edge Jitter Reflex L (seed 15838)', pair: [19, 21], edge: 35},
    {fixture: 'Off-edge Jitter Reflex L (seed 55433)', pair: [19, 20], edge: 37},
    {fixture: 'Off-edge Jitter Reflex L (seed 55433)', pair: [24, 26], edge: 43},
    {fixture: 'Off-edge Jitter Reflex L (seed 55433, k=4)', pair: [27, 29], edge: 50},
] as const;

/*
 * `Offset Cross Junction`, ENROLLED 2026-09-23, DECISION 151(d): its partial graph (a signalled
 * failure) PASSES I1, I2, I3 and I5 — each per-fixture sweep below asserts exactly that for it, and
 * that is its signature on those four. It FAILS I4 on exterior edges 0 and 4, pinned in
 * {@link I4_SIGNATURES}, and adds two licensed head-on mid-line pairs to I5's legitimate population.
 */
describe('I1: every primary bisector carries its own vertex\'s two exterior edges', () => {
    it.each(FULL_CORPUS.map(polygon => [polygon.name, polygon.vertices] as const))(
        '%s',
        (_name, vertices) => {
            expect(primaryParentProblems(solveSkeleton(vertices).graph)).toEqual([]);
        },
    );
});

describe('I2: no two graph nodes lie inside the coincidence floor of each other, unless a layered edge joins them', () => {
    it.each(FULL_CORPUS.map(polygon => [polygon.name, polygon.vertices] as const))(
        '%s',
        (_name, vertices) => {
            const {graph, normalisation} = solveSkeleton(vertices);
            expect(unadmittedSubFloorPairs(graph, normalisation)).toEqual([]);
        },
    );

    it.each(HISTORICAL_SUB_FLOOR_PAIRS.map(entry => [entry.fixture, entry.pair, entry.edge] as const))(
        'the retired pin on %s, pair %j, still stands and is admitted by the exemption (edge e%i, two layers)',
        (fixture, pair, edge) => {
            // The cure-flow half of decision 141: before the table went, each of its rows was shown
            // to satisfy the exemption — joined by the edge the header names, its two ends in
            // different layers. The pair is asserted PRESENT, so a solver change that moved or
            // removed it is seen here rather than passing I2 by absence.
            const polygon = FULL_CORPUS.find(entry => entry.name === fixture);
            expect(polygon).toBeDefined();
            const {graph, normalisation} = solveSkeleton(polygon!.vertices);
            const verdict = subFloorVerdicts(graph, normalisation)
                .find(candidate => candidate.pair[0] === pair[0] && candidate.pair[1] === pair[1]);

            expect(verdict).toEqual({pair: [...pair], joiningEdges: [edge], admitted: true});
        },
    );

    it('the bare distance test finds exactly the four historical pairs, so the exemption is what admits them', () => {
        // Removing the exemption is the bare distance test; this states what that would convict.
        const bare = FULL_CORPUS.flatMap(polygon => {
            const {graph, normalisation} = solveSkeleton(polygon.vertices);
            return subFloorPairs(graph, normalisation).map(pair => ({fixture: polygon.name, pair}));
        });

        // Order-free: the corpus lists clean fixtures first, so a fixture moving between rosters
        // reorders it without changing what is found.
        expect(bare).toHaveLength(HISTORICAL_SUB_FLOOR_PAIRS.length);
        expect(bare).toEqual(expect.arrayContaining(
            HISTORICAL_SUB_FLOOR_PAIRS.map(({fixture, pair}) => ({fixture, pair: [...pair]}))));
    });

    /*
     * THE BUILT-IN MUTATIONS: a doubled node must still fail. A unit square, edge 0 on `y = 0`, and
     * two interior nodes 1e-7 apart — a tenth of the floor — placed so that the only thing varying
     * between the three cases is what the exemption reads: whether an interior edge joins them, and
     * whether the solver's comparison calls their two offsets one moment.
     */
    const unitSpace: SkeletonNormalisation = {
        centre: {x: 0, y: 0}, toUnitScale: 1, fromUnitScale: 1, degenerate: false,
    };

    /** A unit square with two interior nodes and the stated interior edges, parents `[cw, ws]`. */
    function squareWithTwoNodes(
        interiorPositions: Vector2[],
        interiorEdges: {source: number; target: number; parents: [number, number]}[],
    ): StraightSkeletonGraph {
        const positions: Vector2[] = [{x: 0, y: 0}, {x: 1, y: 0}, {x: 1, y: 1}, {x: 0, y: 1}, ...interiorPositions];
        const nodes = positions.map((position, id) => ({
            id, position, inEdges: [] as number[], outEdges: [] as number[],
        }));
        const edges = [0, 1, 2, 3].map(id => {
            const from = positions[id];
            const to = positions[(id + 1) % 4];
            nodes[id].outEdges.push(id);
            nodes[(id + 1) % 4].inEdges.push(id);
            return {id, source: id, target: (id + 1) % 4, basisVector: {x: to.x - from.x, y: to.y - from.y}};
        });
        const interior = interiorEdges.map((spec, index) => {
            const id = 4 + index;
            const from = positions[spec.source];
            const to = positions[spec.target];
            nodes[spec.source].outEdges.push(id);
            nodes[spec.target].inEdges.push(id);
            edges.push({id, source: spec.source, target: spec.target, basisVector: {x: to.x - from.x, y: to.y - from.y}});
            return {
                id,
                clockwiseExteriorEdgeIndex: spec.parents[0],
                widdershinsExteriorEdgeIndex: spec.parents[1],
                length: Math.hypot(to.x - from.x, to.y - from.y),
            };
        });
        return {nodes, edges, numExteriorNodes: 4, interiorEdges: interior, exteriorWeights: [1, 1, 1, 1]};
    }

    it('is not vacuous: two sub-floor nodes with NO joining edge are a violation', () => {
        const graph = squareWithTwoNodes(
            [{x: 0.3, y: 0.5}, {x: 0.3 + 1e-7, y: 0.5}],
            [{source: 0, target: 4, parents: [0, 3]}, {source: 1, target: 5, parents: [1, 0]}],
        );

        expect(unadmittedSubFloorPairs(graph, unitSpace)).toEqual([[4, 5]]);
    });

    it('is not vacuous: two sub-floor nodes joined in ONE offset layer are a violation', () => {
        // Both nodes 0.3 from edge 0's line: the joining edge runs along the layer, not across it.
        const graph = squareWithTwoNodes(
            [{x: 0.5, y: 0.3}, {x: 0.5 + 1e-7, y: 0.3}],
            [{source: 0, target: 4, parents: [0, 3]}, {source: 4, target: 5, parents: [0, 1]}],
        );

        expect(unadmittedSubFloorPairs(graph, unitSpace)).toEqual([[4, 5]]);
    });

    it('admits the same join once its two ends lie in different layers, which is the whole exemption', () => {
        // The control for the two cases above: the same geometry turned a quarter, so the edge now
        // runs ACROSS layers, 1e-7 of offset apart — ten times the solver's simultaneity window.
        const graph = squareWithTwoNodes(
            [{x: 0.5, y: 0.3}, {x: 0.5, y: 0.3 + 1e-7}],
            [{source: 0, target: 4, parents: [0, 3]}, {source: 4, target: 5, parents: [0, 1]}],
        );

        expect(subFloorPairs(graph, unitSpace)).toEqual([[4, 5]]);
        expect(unadmittedSubFloorPairs(graph, unitSpace)).toEqual([]);
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

/*
 * ----------------------------------------------------------------------------
 * I4 — EVERY EXTERIOR EDGE'S FACE CLOSES: ITS TWO ENDS ARE JOINED BY A WALK
 *      ACROSS ITS OWN BISECTORS
 * ----------------------------------------------------------------------------
 *
 * The user's formulation, 2026-08-28 (journal decision 93): from either end of any perimeter edge it
 * must be possible to walk along INTERIOR edges only and arrive at the other end. Equivalently, and
 * this is the intuition it was stated from: no perimeter edge should be able to "see" a
 * non-neighbouring perimeter edge without an interior edge in between. The walk is the quantifiable
 * form of that.
 *
 * WHAT IT IS ABOUT. An exterior edge's FACE — the region the wavefront of that edge sweeps — is
 * bounded by the edge itself and by a chain of skeleton edges, and in a straight skeleton every one
 * of those chain edges is the bisector of that edge with one of its neighbours. So the face closes
 * exactly when the edge's own bisectors form a connected walk from one endpoint of the edge to the
 * other, and an edge whose walk does not close has a face with a hole in its boundary — a region the
 * solver has left to some other edge's face to cover, which is how strips come to overlap.
 *
 * THE STRONG FORM IS WHAT IS ASSERTED, and it was chosen by measurement rather than by preference.
 * Two readings were swept over the whole corpus: the STRONG one restricts the walk to interior edges
 * naming the starting exterior edge as a parent (the face path), and the WEAK one allows any interior
 * edge at all. Both hold on every fixture, and both fail on exactly the same edges of exactly the
 * same fixtures when the corridor-midline fix is reverted — so the strong form costs nothing and says
 * more. The weak form is measured alongside it below rather than dropped, so that a future divergence
 * between them is visible instead of silent.
 *
 * WHAT IT CAUGHT, MEASURED 2026-08-28 AGAINST THE PRE-FIX SOLVER. `COLLINEAR_DUMBBELL` fails on
 * exactly its two shaft edges (e3, the bar's top, and e9, its bottom) and nothing else; the shaft
 * carried no skeleton at all, so neither wall could reach its own far end without crossing to the
 * opposite wall. `THREE_GLOBE_CHAIN` fails on all four of its shaft edges, `ASYMMETRIC_DUMBBELL` on
 * both of its. No other fixture in the corpus violates either form, before the fix or after it —
 * which makes this the sharpest instrument the suite has for the class, and F26's independent
 * corroboration reads the same defect from the strip layer: the parentage face walk found the
 * dumbbell's face 3 could not close, and returned two disjoint chains.
 *
 * CONVENTIONS, STATED BECAUSE THEY DECIDE CASES:
 *
 *  - INTERIOR EDGES WALK IN EITHER DIRECTION. A face boundary is a cycle, not a directed path, and
 *    which way a bisector's basis points is a statement about the wavefront rather than about the
 *    face.
 *  - A CULLED SELF-LOOP CONTRIBUTES NOTHING AND NEEDS NO SPECIAL CASE. It joins a node to itself, so
 *    it adds no reachability; the existing degree-two convention (`spine.ts`) is about degree, not
 *    connectivity, and does not bear on the walk.
 *  - A FACE CLOSED THROUGH ONE SHARED NODE PASSES, and that is correct rather than a loophole. On a
 *    triangle the two bisectors standing on an edge's endpoints both terminate at the incentre, so
 *    the walk is two edges long through that single node — the face is a triangle and its boundary
 *    chain is two edges. Nothing here requires the walk to be longer than one node.
 *  - AN UNRESOLVED INTERIOR EDGE (no target) IS NOT WALKABLE, so an incomplete solve fails this. That
 *    is deliberate: the invariant is about the finished graph, and every fixture swept here solves.
 */

/**
 * The exterior edges whose two endpoints are NOT joined by a walk across interior edges.
 *
 * `strong` restricts the walk to interior edges that name the starting exterior edge as a parent —
 * the face path. See this file's I4 header for why that is the form asserted.
 */
function faceWalkFailures(graph: StraightSkeletonGraph, strong: boolean): string[] {
    const exteriorCount = graph.numExteriorNodes;
    const failures: string[] = [];

    for (let exteriorEdge = 0; exteriorEdge < exteriorCount; exteriorEdge++) {
        const adjacency = new Map<number, number[]>();
        const link = (from: number, to: number) => {
            const neighbours = adjacency.get(from);
            if (neighbours === undefined) {
                adjacency.set(from, [to]);
            } else {
                neighbours.push(to);
            }
        };

        for (const interior of graph.interiorEdges) {
            const onThisFace = interior.clockwiseExteriorEdgeIndex === exteriorEdge
                || interior.widdershinsExteriorEdgeIndex === exteriorEdge;
            if (strong && !onThisFace) {
                continue;
            }
            const edge = graph.edges[interior.id];
            if (edge === undefined || edge.target === undefined) {
                continue;
            }
            link(edge.source, edge.target);
            link(edge.target, edge.source);
        }

        const goal = (exteriorEdge + 1) % exteriorCount;
        const seen = new Set<number>([exteriorEdge]);
        const queue = [exteriorEdge];
        let reached = false;
        while (queue.length > 0 && !reached) {
            const node = queue.pop()!;
            for (const next of adjacency.get(node) ?? []) {
                if (next === goal) {
                    reached = true;
                    break;
                }
                if (!seen.has(next)) {
                    seen.add(next);
                    queue.push(next);
                }
            }
        }

        if (!reached) {
            failures.push(`e${exteriorEdge}: no interior walk from n${exteriorEdge} to n${goal}`);
        }
    }

    return failures;
}

/**
 * I4's pinned face-walk failures per fixture, strong form. Every fixture not named here is pinned at
 * none. Enrolled 2026-09-23, decision 151(d): `Offset Cross Junction`'s solve is a signalled failure
 * that leaves three bisectors without a target, and the faces of its exterior edges 0 and 4 — the
 * vertical corridor's left wall below the raised bar and above it — do not close.
 */
const I4_SIGNATURES: Record<string, string[]> = {
    'Offset Cross Junction': ['e0: no interior walk from n0 to n1', 'e4: no interior walk from n4 to n5'],
};

describe('I4: every exterior edge\'s face closes across its own bisectors', () => {
    it.each(FULL_CORPUS.map(polygon => [polygon.name, polygon.vertices] as const))(
        '%s',
        (name, vertices) => {
            expect(faceWalkFailures(solveSkeleton(vertices).graph, true)).toEqual(I4_SIGNATURES[name] ?? []);
        },
    );

    it('holds in the weak form too, so the two readings have not diverged', () => {
        // Measured, not assumed (journal decision 93). The strong form implies the weak one, so this
        // can only fail if the sweep above stops running — which is the point of keeping it. The one
        // violator is the pinned one (enrolled 2026-09-23, decision 151(d)).
        const violating = FULL_CORPUS
            .filter(polygon => faceWalkFailures(solveSkeleton(polygon.vertices).graph, false).length > 0)
            .map(polygon => polygon.name);

        expect(violating).toEqual(Object.keys(I4_SIGNATURES));
    });

    it('is not vacuous: deleting a shaft midline reproduces the dumbbell\'s recorded signature', () => {
        /*
         * THE MUTATION, BUILT IN. Before the corridor-midline fix the dumbbell's bar carried no
         * skeleton, and this invariant reported exactly `e3` and `e9` — its two shaft walls. Removing
         * the two midline edges from a solved graph reconstructs that graph, so the assertion below
         * is the pre-fix measurement replayed rather than a description of it. Without this, an
         * `faceWalkFailures` that always returned `[]` would pass every test above.
         */
        const {graph} = solveSkeleton(COLLINEAR_DUMBBELL);
        const shaftMidlines = graph.interiorEdges.filter(interior =>
            (interior.clockwiseExteriorEdgeIndex === 3 && interior.widdershinsExteriorEdgeIndex === 9)
            || (interior.clockwiseExteriorEdgeIndex === 9 && interior.widdershinsExteriorEdgeIndex === 3));

        expect(shaftMidlines).toHaveLength(2);
        expect(faceWalkFailures(graph, true)).toEqual([]);

        const withoutShaft: StraightSkeletonGraph = {
            ...graph,
            edges: graph.edges.map(edge =>
                shaftMidlines.some(interior => interior.id === edge.id)
                    ? {...edge, target: undefined}
                    : edge),
        };

        expect(faceWalkFailures(withoutShaft, true)).toEqual([
            'e3: no interior walk from n3 to n4',
            'e9: no interior walk from n9 to n10',
        ]);
        expect(faceWalkFailures(withoutShaft, false)).toEqual([
            'e3: no interior walk from n3 to n4',
            'e9: no interior walk from n9 to n10',
        ]);
    });
});

/*
 * ----------------------------------------------------------------------------
 * I5 — NO TWO BISECTORS SPAN THE SAME NODE PAIR UNLESS THEIR PARENTS ARE PARALLEL
 * ----------------------------------------------------------------------------
 *
 * THIS WAS THE LOUD RECORD OF AN OPEN DEFECT, journal decision 98, AND ITS PINS ARE NOW DELETED —
 * both went to zero on 2026-08-29 and were re-measured rather than softened, which is the
 * attributed-cure flow the block was written to end in. It asserts zero on every fixture of the
 * corpus now, clean and known-defect alike. It is kept whole, with its measurements, because it is
 * the instrument that found the class and the one that will see it come back: the two mechanisms
 * that emptied it are named below and each is convicted by reverting it.
 *
 * WHAT THE DEFECT WAS (F36/F37). On `(seed 55433)` an arm of the L collapses as a near-degenerate
 * 4-ring: all eight arrival events land inside one epsilon layer, 7e-11 apart, and because both
 * merges share edges the clustering fell through to the pairwise fallback, which resolved the WHOLE
 * layer — so both ends of the corridor closed in one step and each emitted its own bisector into it.
 * What that left behind is a `{9,15}` ridge spanned by two bisectors where a ridge admits one.
 *
 * WHAT REMOVED IT, AND WHY IT IS A CURE RATHER THAN A SILENCE. Two changes, neither of them a
 * tolerance, both of them journal decision 102's linear causality said about a different step:
 *
 *  - `handleInteriorNGon` now narrows a layer the whole-event resolution REFUSES down to its
 *    earliest arrival moment (`earliestArrivalMoment`, decision 102 applied to what an event
 *    CONSUMES rather than only to the order events are read in). The corridor's two closures are
 *    2.5e-11 apart on offsets of 2.9e-1 — a million ulps, four orders outside the simultaneity bar —
 *    so the earlier one resolves alone and the later is recomputed against the wavefront it left.
 *  - `handleInteriorEdgePair` closes a collinear SAME-DIRECTION pair on its leading source, culling
 *    the surplus bisector, instead of cross-wiring it. Cross-wiring two rays that run the same way
 *    along one line necessarily sends one of them backwards, and the pair it leaves is a duplicate
 *    ridge by construction.
 *
 * ATTRIBUTED BY MUTATION, BECAUSE THE TWO OVERLAP AND SAYING SO IS THE POINT. Reverting the
 * narrowing alone leaves BOTH fixtures at zero here — `(seed 55433)`'s corridor still reaches the
 * two-edge base case, where the leading-source closure catches it. Reverting the closure alone
 * leaves `(seed 55433)` at zero (the narrowing removes its second bisector upstream) and puts
 * `Off-edge Jitter Plus (seed 7919)` back to 2. So this invariant convicts the CLOSURE and not the
 * narrowing; the narrowing's own convictions are the direction counts in
 * `wavefront-causality.test.ts` and the jitter cell in `along-edge-jitter-known-failures.test.ts`.
 *
 * The two nodes are still two nodes, 3.9e-6 and 1.5e-3 apart in their own spaces. That was never
 * this invariant's claim (journal decision 92 / F26a: sub-floor separation that is real, causally
 * ordered structure is not a solver problem), and nothing here merged them.
 *
 * WHY NOTHING ELSE SEES IT. I3 is satisfied by the WRONG parents to 1.4e-14, because the arm is
 * near-symmetric top to bottom and the wrong pair defines the same locus as the right one; I4 passes
 * because the face still closes; the tiling identity passes because the resulting needle is a fold
 * with cancelling area. Equidistance cannot discriminate a label swap between two loci that coincide
 * by symmetry — recorded as I3's blind spot — so the marker has to be structural.
 *
 * ----------------------------------------------------------------------------
 * THE DISCRIMINATOR IS THE PARENTS' PARALLELISM, AND IT WAS MEASURED RATHER THAN ASSUMED
 * ----------------------------------------------------------------------------
 *
 * The obvious marker — "two interior edges spanning one node pair in opposite directions, with the
 * same parents swapped" — IS FALSE ON THIS CORPUS, and the measurement that says so is worth more
 * than the marker would have been. Nineteen such pairs exist across the 59 fixtures. Every single
 * one of them, defect and legitimate alike, is anti-parallel with its parents swapped: the marker
 * convicts `Rectangle`, `Pentagon House`, `Cross` (four of them), `T-Shape`, `Golf Cart`,
 * `Collinear Dumbbell`, `Asymmetric Dumbbell`, `Three Globe Chain` and
 * `Slightly Deformed Peanut 1` — nine clean fixtures, fifteen pairs — alongside the four that are
 * wrong. Nor does the equidistance reading separate them: extending I3 to the TARGET node as well as
 * the source leaves `(seed 55433)` at 2.22e-16, machine precision, exactly like the clean roster.
 *
 * WHAT DOES SEPARATE THEM IS WHETHER THE TWO PARENTS ARE PARALLEL. Where they are, their equidistant
 * locus is a single MID-LINE, and a mid-line legitimately carries two bisectors — one for each of the
 * two faces it separates, running in opposite directions. That is the head-on closure, and it is what
 * every one of the fifteen is: the dumbbell's shaft midline `i26 n12→n13 {3,9}` / `i27 n13→n12
 * {9,3}` is the canonical example, and `Cross` puts four of them on one node. Where the parents are
 * NOT parallel their locus is a single ridge meeting at a point, and a ridge admits ONE bisector; two
 * of them spanning it in opposite directions is the crossed pairing and nothing else.
 *
 * THE NUMBERS, in |sin| of the angle between the two parents' supporting lines, measured 2026-08-29:
 *
 *   legitimate (15 pairs)   0, and at worst 1.46e-15 — machine zero on unit-length bases
 *   defect (4 pairs)        6.46e-6, 6.85e-6, 1.53e-5, 1.76e-5
 *
 * Nine orders of magnitude of gap. {@link PARALLEL_PARENTS_BAR} sits at 1e-9, six orders above the
 * worst legitimate reading and three below the smallest defect one, which is the same shape of
 * headroom {@link EQUIDISTANCE_BAR} takes and for the same reason.
 *
 * THE LENGTHS CORROBORATE IT INDEPENDENTLY and are recorded because they say what the defect COST.
 * In unit space the fifteen legitimate mid-lines run from 1.29e-2 to 7.81e-1 — visible skeleton. The
 * four defect pairs ran 1.60e-6, 1.79e-6, 3.88e-6 and 6.05e-6: between 1.6 and 6.1 times the render
 * floor, sub-visible ridges that no picture shows and no eye-pass could have found. That is why this
 * defect needed an instrument rather than a look.
 *
 * CONVENTIONS:
 *
 *  - A CULLED SELF-LOOP IS EXCLUDED, by excluding every edge whose target is its own source. A
 *    self-loop spans no node pair, so two of them on one node are not two bisectors on one ridge;
 *    `culled` is not tested for directly because the geometric condition is the one that matters and
 *    an uncalled self-loop would be a defect of a different kind, which I1 and I2 are the instruments
 *    for.
 *  - AN UNRESOLVED INTERIOR EDGE IS EXCLUDED. Without a target it spans nothing. Every fixture swept
 *    here solves completely, so this excludes nothing in practice.
 *  - SAME-DIRECTION DUPLICATES WOULD BE REPORTED TOO, and there are none: swept over the corpus, every
 *    pair of interior edges sharing a node pair is anti-parallel. The condition below is written on
 *    the unordered node pair so that a same-direction duplicate could not appear without being seen.
 */

/** Six orders above the corpus's worst legitimate reading, three below its smallest defect one. */
const PARALLEL_PARENTS_BAR = 1e-9;

/**
 * |sin| of the angle between two exterior edges' supporting lines: exactly zero when they are
 * parallel, however they are oriented.
 *
 * The cross product of the two bases, normalised — rather than an `acos` of the dot — because the
 * question is about parallelism and near-parallel is precisely where `acos` loses its precision.
 */
function parentSkew(graph: StraightSkeletonGraph, first: number, second: number): number {
    const a = graph.edges[first]?.basisVector;
    const b = graph.edges[second]?.basisVector;
    if (a === undefined || b === undefined) {
        return Number.NaN;
    }
    const lengths = Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y);
    return lengths === 0 ? Number.NaN : Math.abs(a.x * b.y - a.y * b.x) / lengths;
}

/*
 * ----------------------------------------------------------------------------
 * THE LICENCE UNDER WEIGHTS — PARALLEL IS NECESSARY AND NO LONGER SUFFICIENT
 * ----------------------------------------------------------------------------
 *
 * W-spec W37. The licence above rests on parallel parents having a single equidistant mid-line, and
 * under weights that premise splits in two:
 *
 *  - ANTI-FACING parallel parents — the two walls of a corridor — still share one equi-time line at
 *    any weights. It sits at `w₁ / (w₁ + w₂)` of the corridor's width instead of at half, but it is
 *    one line and it carries two bisectors exactly as it always did (W-spec W14, W39(ii)).
 *  - SAME-FACING parallel parents share a locus only when their weights are EQUAL. At unequal
 *    weights the faster wall's wavefront simply overtakes the slower one's; there is no locus at all
 *    to carry two bisectors, and a pair spanning one node pair there is the crossed pairing this
 *    invariant exists to catch (W-spec W10, W29).
 *
 * So the licence is `parallel && (antiFacing || weightsEqual)`, and each licensed pair is then
 * additionally checked on the thing the licence CLAIMS — that both its nodes really do lie on one
 * equi-time locus, `d₁ · w₂ = d₂ · w₁` to `EQUIDISTANCE_BAR · w₁ · w₂`. That second half is what
 * stops the licence being a label: a pair could satisfy the parallelism test and still sit off the
 * locus, and before weights there was no reading of "off the locus" that did not simply restate I3.
 *
 * NOTHING ON THIS CORPUS MOVES. `solveSkeleton(vertices)` with no weights gives every edge weight
 * `1`, so `weightsEqual` is true everywhere, the cross-multiplied equi-time reading is the
 * equidistance reading, and the fifteen legitimate pairs and four defect readings are the same
 * fifteen and four. The condition is here for the input that has not been swept yet, and it is
 * convicted by the built-in mutation below on a weighted corpus fixture.
 */

/** One node pair carrying two bisectors, and whether the parents that would license it are parallel. */
interface DuplicateRidge {
    description: string;
    /**
     * Whether this pair is LICENSED: parents parallel, facing or weighted so that they share a
     * locus at all, and both nodes actually on it (W-spec W37).
     */
    licensed: boolean;
}

/** Do these two exterior edges face each other, rather than the same way? */
function parentsAntiFacing(graph: StraightSkeletonGraph, first: number, second: number): boolean {
    const a = graph.edges[first]?.basisVector;
    const b = graph.edges[second]?.basisVector;
    if (a === undefined || b === undefined) {
        return false;
    }
    return a.x * b.x + a.y * b.y < 0;
}

/**
 * Is `point` at one time from both of these parents, division-free? (W-spec W37, W22.)
 *
 * `d₁ / w₁ = d₂ / w₂` restated as `d₁ · w₂ = d₂ · w₁`, with the bar scaled by the same weight
 * product that scaled the operands. At unit weights both products are by `1.0` and this is
 * `|d₁ − d₂| ≤ EQUIDISTANCE_BAR`, the equidistance reading unchanged.
 */
function onOneEquiTimeLocus(
    graph: StraightSkeletonGraph,
    normalisation: SkeletonNormalisation,
    first: number,
    second: number,
    point: Vector2,
): boolean {
    const toFirst = distanceToParentLine(graph, first, point);
    const toSecond = distanceToParentLine(graph, second, point);
    if (Number.isNaN(toFirst) || Number.isNaN(toSecond)) {
        return false;
    }
    const weightFirst = graph.exteriorWeights[first];
    const weightSecond = graph.exteriorWeights[second];
    const discrepancy = Math.abs(toFirst * weightSecond - toSecond * weightFirst)
        * normalisation.toUnitScale;
    return discrepancy <= EQUIDISTANCE_BAR * weightFirst * weightSecond;
}

/**
 * Every pair of resolved interior edges spanning the same unordered node pair.
 *
 * Reported whole — legitimate mid-lines included — so that the sweeps below can pin the defect class
 * and separately assert that the legitimate population is still being SEEN. A finder that quietly
 * stopped returning anything would otherwise satisfy the defect pin.
 */
function duplicateRidges(
    graph: StraightSkeletonGraph,
    normalisation: SkeletonNormalisation,
): DuplicateRidge[] {
    const spanning = graph.interiorEdges
        .map(interior => ({interior, edge: graph.edges[interior.id]}))
        .filter(entry => entry.edge !== undefined
            && entry.edge.target !== undefined
            && entry.edge.target !== entry.edge.source);

    const ridges: DuplicateRidge[] = [];
    for (let first = 0; first < spanning.length; first++) {
        for (let second = first + 1; second < spanning.length; second++) {
            const a = spanning[first];
            const b = spanning[second];
            const sameNodes = (a.edge.source === b.edge.source && a.edge.target === b.edge.target)
                || (a.edge.source === b.edge.target && a.edge.target === b.edge.source);
            if (!sameNodes) {
                continue;
            }
            const clockwise = a.interior.clockwiseExteriorEdgeIndex;
            const widdershins = a.interior.widdershinsExteriorEdgeIndex;
            const skew = parentSkew(graph, clockwise, widdershins);
            // W-spec W37, in the order the licence is argued: parallel, then a locus to share, then
            // both ends actually on it.
            const licensed = skew < PARALLEL_PARENTS_BAR
                && (parentsAntiFacing(graph, clockwise, widdershins)
                    || graph.exteriorWeights[clockwise] === graph.exteriorWeights[widdershins])
                && onOneEquiTimeLocus(graph, normalisation, clockwise, widdershins,
                    graph.nodes[a.edge.source].position)
                && onOneEquiTimeLocus(graph, normalisation, clockwise, widdershins,
                    graph.nodes[a.edge.target!].position);
            ridges.push({
                licensed,
                description: `ie${a.interior.id} n${a.edge.source}->n${a.edge.target} `
                    + `[${a.interior.clockwiseExteriorEdgeIndex},${a.interior.widdershinsExteriorEdgeIndex}]`
                    + ` and ie${b.interior.id} n${b.edge.source}->n${b.edge.target} `
                    + `[${b.interior.clockwiseExteriorEdgeIndex},${b.interior.widdershinsExteriorEdgeIndex}]`
                    + ` span one ridge, parents skewed by ${skew.toExponential(3)}`,
            });
        }
    }
    return ridges;
}

/** The pairs nothing licenses: two bisectors on a ridge that admits one. */
function crossedPairingProblems(
    graph: StraightSkeletonGraph,
    normalisation: SkeletonNormalisation,
): string[] {
    return duplicateRidges(graph, normalisation)
        .filter(ridge => !ridge.licensed)
        .map(ridge => ridge.description);
}

/**
 * WHAT THE PIN TABLE HELD, AND WHY THERE IS NO TABLE ANY MORE.
 *
 * Until 2026-08-29 this file carried `PINNED_CROSSED_PAIRINGS`, two rows deep, in the sense of
 * journal decision 72: each entry a wrong answer standing in a solve that reported itself complete.
 * Both rows read 2 — `Off-edge Jitter Reflex L (seed 55433)` and `Off-edge Jitter Plus (seed 7919)`
 * — and both are now 0, so the table is DELETED rather than zeroed. A table of zeroes is a place for
 * the next regression to be absorbed into; a sweep asserting zero everywhere is not.
 *
 * `(seed 55433, k=4)` WAS ALWAYS ABSENT, AND THAT WAS A RESULT RATHER THAN AN OVERSIGHT. F36 read
 * its arm patch as the same class as `(seed 55433)`'s and this marker never saw it. The question
 * that left open is now answered: its defect WAS the same class, expressed as a direction violation
 * instead of a duplicate — a three-way vertex event resolved two edges at a time — and the same
 * narrowing that emptied `(seed 55433)` here took k=4's direction count to zero in
 * `wavefront-causality.test.ts`. One class, three fixtures, two shapes, two mechanisms.
 *
 * ITS ZERO WAS LOAD-BEARING BEFORE THAT AND STILL IS. Three of k=4's five-edge ring's arrivals land
 * on ONE point with pairwise offsets spread over 9.03e-11 because a pair's event used to carry the
 * offset of whichever edge REPORTED it rather than the offset by which both had arrived. Order those
 * asymmetric readings and the ring pairs on an arrival that had not happened. `arrivalOffsetOfPair`
 * in `collision-helpers.ts` is what keeps that from happening, and mutating it to return
 * `offsetFromA` is the conviction of it.
 *
 * THE HISTORY OF (seed 55433)'S FIRST PAIR, kept because it is the evidence that pairing and
 * duplication are different questions. It was `[10,16]` / `[16,10]` at a parent skew of 6.456e-6;
 * under the arrival ordering (journal decision 102) it became `ie48 [9,15]` / `ie49 [15,9]` at
 * 1.300e-5 — the arm ring paired on the walls that vanish first, so the surviving ridge belonged to
 * the walls F36 named, and the ridge was still DOUBLE. Pairing decided which walls owned the ridge;
 * it could not decide whether the ridge should carry one bisector or two. The narrowing decided
 * that. See `arrival-ordering.test.ts` for the parents, pinned so that reverting the ordering fires
 * there.
 */

describe('I5: two bisectors share a ridge only where their parents are parallel', () => {
    it.each(FULL_CORPUS.map(polygon => [polygon.name, polygon.vertices] as const))(
        '%s',
        (name, vertices) => {
            const {graph, normalisation} = solveSkeleton(vertices);
            expect(crossedPairingProblems(graph, normalisation)).toEqual([]);
        },
    );

    it('sweeps both populations, with nothing excused and nothing outside the sweep', () => {
        // The guard the deleted pin table used to need, restated for a sweep with no exemptions: a
        // `FULL_CORPUS` that quietly stopped carrying the known-defect fixtures would leave this
        // invariant passing on the only shapes that ever broke it.
        for (const polygon of [...CLEAN_TEST_POLYGONS, ...KNOWN_DEFECT_POLYGONS]) {
            expect(FULL_CORPUS.some(entry => entry.name === polygon.name)).toBe(true);
        }
        expect(FULL_CORPUS).toHaveLength(CLEAN_TEST_POLYGONS.length + KNOWN_DEFECT_POLYGONS.length);
    });

    it('sees the legitimate head-on population too, so the pins are a filter and not a blindness', () => {
        // Fifteen mid-line pairs across nine fixtures. If `duplicateRidges` stopped finding pairs at
        // all, the defect pins above would still pass — this is what makes them mean something.
        //
        // SEVENTEEN since `Offset Cross Junction` was enrolled 2026-09-23, decision 151(d): its two
        // bars each carry one licensed head-on mid-line pair (parents exactly anti-parallel), and it
        // carries no crossed pair — its I5 row above is empty, so it passes this bar.
        const legitimate = FULL_CORPUS.flatMap(polygon => {
            const {graph, normalisation} = solveSkeleton(polygon.vertices);
            return duplicateRidges(graph, normalisation).filter(ridge => ridge.licensed)
                .map(ridge => polygon.name);
        });

        expect(legitimate).toHaveLength(17);
        expect(legitimate.filter(name => name === 'Offset Cross Junction')).toHaveLength(2);
    });

    it('is not vacuous: skewing one shaft wall turns the dumbbell\'s mid-line into a crossed pair', () => {
        /*
         * THE MUTATION, BUILT IN, on the pair the file's I4 block already names as legitimate: the
         * dumbbell's shaft midline, `ie26 n12->n13 {3,9}` and `ie27 n13->n12 {9,3}`. It is exactly
         * the defect's structure — one node pair, two bisectors, parents swapped — and it passes only
         * because e3 and e9 are parallel. Rotating one of them off parallel, without touching the
         * interior edges at all, must flip the verdict; if it does not, the sweep is reading
         * something other than the parents' parallelism and the whole discriminator is unwarranted.
         */
        const {graph, normalisation} = solveSkeleton(COLLINEAR_DUMBBELL);
        expect(crossedPairingProblems(graph, normalisation)).toEqual([]);
        expect(duplicateRidges(graph, normalisation)).toHaveLength(1);

        // A rotation rather than a nudge, so the skew introduced is 1e-6 whatever length the basis
        // happens to carry — three orders clear of the bar, five below the real defects' readings.
        const sine = 1e-6;
        const cosine = Math.sqrt(1 - sine * sine);
        const skewed: StraightSkeletonGraph = {
            ...graph,
            edges: graph.edges.map(edge => edge.id === 3
                ? {
                    ...edge,
                    basisVector: {
                        x: edge.basisVector.x * cosine - edge.basisVector.y * sine,
                        y: edge.basisVector.x * sine + edge.basisVector.y * cosine,
                    },
                }
                : edge),
        };

        expect(crossedPairingProblems(skewed, normalisation)).toHaveLength(1);
        expect(crossedPairingProblems(skewed, normalisation)[0]).toContain('ie26 n12->n13 [3,9]');
    });

    /*
     * THE SECOND BUILT-IN MUTATION, ON THE FACING/WEIGHT CLAUSE ALONE (W-spec W37).
     *
     * WHY IT IS BUILT RATHER THAN TAKEN FROM THE CORPUS, and this is the whole reason the case is
     * worth writing: the clause and the equi-time reading are only separable where the two parents
     * stand at DIFFERENT distances from the shared nodes. Every duplicate ridge on this corpus is a
     * mid-line, equidistant from its two parents, and there `d₁ · w₂ = d₂ · w₁` forces `w₁ = w₂` on
     * its own — so reweighting a corpus mid-line withdraws the licence through the equi-time check
     * whatever the clause says, and convicts nothing.
     *
     * The configuration below separates them exactly: two parallel walls at `y = 0` and `y = 3`,
     * two bisectors spanning one node pair on the line `y = 1` — distance 1 from the first wall and
     * 2 from the second — with weights 1 and 2. Equi-time HOLDS there (`1 · 2 = 2 · 1`), so the
     * licence turns entirely on whether the two walls share a locus at all:
     *
     *   - ANTI-facing, the walls of a corridor: they do, at any weights. Licensed.
     *   - SAME-facing at unequal weights: they do not — the faster wavefront simply overtakes the
     *     slower and no line is reached by both at one time (W-spec W10, W29). NOT licensed, and a
     *     pair of bisectors spanning one node pair there is the crossed pairing this invariant is
     *     for.
     *
     * Drop `(antiFacing || weightsEqual)` and the last case is licensed and this test dies.
     */
    it('withdraws the licence from SAME-FACING parallel parents whose weights differ', () => {
        const unitSpace: SkeletonNormalisation = {
            centre: {x: 0, y: 0}, toUnitScale: 1, fromUnitScale: 1, degenerate: false,
        };
        /** Two walls, two bisectors on one node pair between them, at the stated facing and weights. */
        function twoWalls(secondWallBasis: Vector2, weights: number[]): StraightSkeletonGraph {
            const positions: Vector2[] = [
                {x: 0, y: 0}, {x: 10, y: 0},                       // wall 0, the line y = 0
                secondWallBasis.x > 0 ? {x: 0, y: 3} : {x: 10, y: 3},
                secondWallBasis.x > 0 ? {x: 10, y: 3} : {x: 0, y: 3},
                {x: 3, y: 1}, {x: 6, y: 1},                        // the shared node pair, on y = 1
            ];
            return {
                nodes: positions.map((position, id) => ({
                    id, position, inEdges: [], outEdges: [],
                })),
                edges: [
                    {id: 0, source: 0, target: 1, basisVector: {x: 1, y: 0}},
                    {id: 1, source: 2, target: 3, basisVector: secondWallBasis},
                    {id: 2, source: 4, target: 5, basisVector: {x: 1, y: 0}},
                    {id: 3, source: 5, target: 4, basisVector: {x: -1, y: 0}},
                ],
                numExteriorNodes: 2,
                interiorEdges: [
                    {id: 2, clockwiseExteriorEdgeIndex: 0, widdershinsExteriorEdgeIndex: 1, length: 3},
                    {id: 3, clockwiseExteriorEdgeIndex: 1, widdershinsExteriorEdgeIndex: 0, length: 3},
                ],
                exteriorWeights: weights,
            };
        }

        const antiFacing = twoWalls({x: -1, y: 0}, [1, 2]);
        expect(duplicateRidges(antiFacing, unitSpace)).toHaveLength(1);
        expect(duplicateRidges(antiFacing, unitSpace)[0].licensed).toBe(true);

        const sameFacingEqual = twoWalls({x: 1, y: 0}, [1, 1]);
        // Equal weights, same-facing: an equidistant mid-line would exist — but this node pair is
        // not on it (1 from one wall, 2 from the other), so equi-time refuses it. That is the
        // equi-time half of the licence doing its own work, and it is asserted so the two halves are
        // not confused for each other.
        expect(duplicateRidges(sameFacingEqual, unitSpace)[0].licensed).toBe(false);

        const sameFacingUnequal = twoWalls({x: 1, y: 0}, [1, 2]);
        // Equi-time HOLDS here — `1 · 2 = 2 · 1` — so only the facing/weight clause can withdraw it.
        expect(duplicateRidges(sameFacingUnequal, unitSpace)[0].licensed).toBe(false);
        expect(crossedPairingProblems(sameFacingUnequal, unitSpace)).toHaveLength(1);
    });
});
