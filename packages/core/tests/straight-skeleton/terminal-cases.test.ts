import type {StraightSkeletonSolverContext, Vector2} from '../../src/straight-skeleton/types';
import {
    handleInteriorEdgePair,
    handleInteriorEdgeTriangle,
    runAlgorithmV5,
} from '../../src/straight-skeleton/algorithm-termination-cases';
import {handleInteriorNGon} from '../../src/straight-skeleton/algorithm-complex-cases';
import {collideInteriorEdges} from '../../src/straight-skeleton/collision-helpers';
import {makeStraightSkeletonSolverContext} from '../../src/straight-skeleton/solver-context';
import {initInteriorEdges} from '../../src/straight-skeleton/algorithm-helpers';
import {stepLog} from '../../src/straight-skeleton/logger';

/*
 * ============================================================================
 *  THE TERMINAL BASE CASES.
 * ============================================================================
 *
 * The three-edge case is solved in closed form from its three distinct exterior parents. Each
 * parent contributes `n . P - t = n . A`, where `n` is that edge's inward unit normal and `A` any
 * point on it; three of them determine `(x, y, t)`. The wavefront clock `t` is an unknown of the
 * system rather than a constraint checked afterwards, so the answer is the one place all three
 * offset lines coincide *at a single common offset*. The solve never reads a bisector source, so
 * coincident sources stop being a case at all.
 *
 * The sign of `t` is the tripwire. Negating every normal leaves `P` untouched and negates `t`, so
 * an outward normal produces an answer that is internally consistent and wrong. Reversing the
 * winding of the input negates every normal, which is how the tripwire is exercised below without
 * mutating the solver.
 */

/**
 * The 6-8-10 right triangle of the specification's worked example, wound clockwise.
 *
 * Inward normals: `(0,1)` through `(0,0)` for the bottom edge, `(1,0)` through `(0,0)` for the
 * left, and `(-0.6,-0.8)` through `(8,0)` for the hypotenuse. The system's determinant is 2.4 and
 * its solution is `t = 2`, `P = (2, 2)` — the incentre, with `t` the incircle radius.
 */
const RIGHT_TRIANGLE_6_8_10: Vector2[] = [{x: 0, y: 0}, {x: 0, y: 6}, {x: 8, y: 0}];

/** The same triangle wound the other way, which negates every inward normal. */
const RIGHT_TRIANGLE_6_8_10_REVERSED: Vector2[] = [...RIGHT_TRIANGLE_6_8_10].reverse();

/** Three collinear vertices: two parents share a supporting line, so the system is singular. */
const COLLINEAR_TRIPLE: Vector2[] = [{x: 0, y: 0}, {x: 5, y: 0}, {x: 10, y: 0}];

const SQUARE: Vector2[] = [{x: 0, y: 0}, {x: 0, y: 2}, {x: 2, y: 2}, {x: 2, y: 0}];

interface InitialisedContext {
    context: StraightSkeletonSolverContext;
    /** The bisector ids created at each vertex, in vertex order. */
    interiorEdgeIds: number[];
}

/** A solver context with one bisector per vertex and nothing resolved yet. */
function initialisedContext(polygon: Vector2[]): InitialisedContext {
    const context = makeStraightSkeletonSolverContext(polygon);
    initInteriorEdges(context);
    return {context, interiorEdgeIds: context.graph.interiorEdges.map(edge => edge.id)};
}

function targetPositionOf(context: StraightSkeletonSolverContext, edgeId: number): Vector2 {
    const target = context.getEdgeWithId(edgeId).target;
    if (target === undefined) {
        throw new Error(`Edge ${edgeId} has no target`);
    }
    return context.graph.nodes[target].position;
}

function loggedMessages(spy: jest.SpyInstance): string {
    return spy.mock.calls.map(call => String(call[0])).join('\n');
}

describe('handleInteriorEdgeTriangle: the closed form over three supporting lines', () => {
    let fallThroughLog: jest.SpyInstance;

    beforeEach(() => {
        fallThroughLog = jest.spyOn(stepLog, 'debug').mockImplementation(() => undefined);
    });

    afterEach(() => {
        fallThroughLog.mockRestore();
    });

    it('answers the worked example with the incentre, and logs no fall-through', () => {
        const {context, interiorEdgeIds} = initialisedContext(RIGHT_TRIANGLE_6_8_10);

        handleInteriorEdgeTriangle(context, {interiorEdges: interiorEdgeIds});

        for (const edgeId of interiorEdgeIds) {
            const position = targetPositionOf(context, edgeId);
            expect(position.x).toBeCloseTo(2, 12);
            expect(position.y).toBeCloseTo(2, 12);
        }
        expect(loggedMessages(fallThroughLog)).not.toMatch(/falling through/);
    });

    it('resolves the same triangle through the solver, end to end', () => {
        const context = runAlgorithmV5(RIGHT_TRIANGLE_6_8_10);
        const interior = context.graph.nodes.slice(context.graph.numExteriorNodes);

        expect(interior).toHaveLength(1);
        expect(interior[0].position.x).toBeCloseTo(2, 9);
        expect(interior[0].position.y).toBeCloseTo(2, 9);
    });

    it('never reads a bisector source, so coincident sources are not a case', () => {
        // The old path collided the bisectors pairwise, and `intersectRays` classifies coincident
        // sources before every other test, so three bisectors leaving one point produced no
        // collision at all and the base case threw. The closed form reads only the parent lines.
        const {context, interiorEdgeIds} = initialisedContext(RIGHT_TRIANGLE_6_8_10);
        const shared = context.findOrAddNode({x: 1, y: 1}, 0);
        for (const edgeId of interiorEdgeIds) {
            context.getEdgeWithId(edgeId).source = shared.id;
        }

        handleInteriorEdgeTriangle(context, {interiorEdges: interiorEdgeIds});

        for (const edgeId of interiorEdgeIds) {
            const position = targetPositionOf(context, edgeId);
            expect(position.x).toBeCloseTo(2, 12);
            expect(position.y).toBeCloseTo(2, 12);
        }
    });
});

describe('handleInteriorEdgeTriangle: the guards, and what they fall through to', () => {
    let fallThroughLog: jest.SpyInstance;

    beforeEach(() => {
        fallThroughLog = jest.spyOn(stepLog, 'debug').mockImplementation(() => undefined);
    });

    afterEach(() => {
        fallThroughLog.mockRestore();
    });

    it('catches outward normals by the sign of the offset', () => {
        // Decision 9's tripwire, exercised without mutating the solver: reversing the winding
        // negates every inward normal, which leaves the position untouched and negates `t`. An
        // implementation that ignored the sign would happily terminate all three edges at (2, 2).
        const {context, interiorEdgeIds} = initialisedContext(RIGHT_TRIANGLE_6_8_10_REVERSED);

        expect(() => handleInteriorEdgeTriangle(context, {interiorEdges: interiorEdgeIds}))
            .toThrow(/Failed to collide interior edges in triangle/);
        expect(loggedMessages(fallThroughLog)).toMatch(/negative.*falling through/s);
    });

    it('falls through when the system is singular, and resolves by degenerate closure', () => {
        // Three collinear vertices leave the pairwise path nothing either: the endpoint bisectors
        // run along the shared line and the middle one is perpendicular to it, so no pairing
        // converges. What remains is the degenerate closure — every bisector reaches the middle
        // vertex at offset zero — so the triangle terminates there instead of throwing, with the
        // middle bisector culled as a zero-length self-loop.
        const {context, interiorEdgeIds} = initialisedContext(COLLINEAR_TRIPLE);

        handleInteriorEdgeTriangle(context, {interiorEdges: interiorEdgeIds});

        expect(loggedMessages(fallThroughLog)).toMatch(/determinant.*falling through/s);
        const middleVertex = context.graph.nodes[1].position;
        for (const edgeId of interiorEdgeIds) {
            expect(targetPositionOf(context, edgeId)).toEqual(middleVertex);
        }
        expect(context.getInteriorWithId(interiorEdgeIds[1]).culled).toBe(true);
    });

    it('falls through when the three edges do not have exactly three distinct parents', () => {
        // Three consecutive bisectors of a square are bounded by four exterior edges, so they do
        // not describe a closed triangle of faces. Measured corpora had three every time, but that
        // is a measurement rather than a proof, so the assumption is made observable.
        const {context, interiorEdgeIds} = initialisedContext(SQUARE);
        const threeOfFour = interiorEdgeIds.slice(0, 3);

        handleInteriorEdgeTriangle(context, {interiorEdges: threeOfFour});

        expect(loggedMessages(fallThroughLog)).toMatch(/4 distinct exterior parents.*falling through/s);
        for (const edgeId of threeOfFour) {
            expect(context.getEdgeWithId(edgeId).target).toBeDefined();
        }
    });
});

/**
 * Two bisectors leaving one point in different directions, pointing at no existing node.
 *
 * `intersectRays` classifies coincident sources before every other test, and the two-edge base case
 * already computes that verdict for its head-on check — it was then discarded as "no collision" and
 * the case threw two lines later.
 */
function pairFromOneSource(directions: [Vector2, Vector2]): InitialisedContext {
    const initialised = initialisedContext(SQUARE);
    const {context, interiorEdgeIds} = initialised;
    const shared = context.findOrAddNode({x: 1, y: 1}, 0);
    const pair = interiorEdgeIds.slice(0, 2);

    pair.forEach((edgeId, index) => {
        const edge = context.getEdgeWithId(edgeId);
        edge.source = shared.id;
        edge.basisVector = directions[index];
    });

    return {context, interiorEdgeIds: pair};
}

describe('handleInteriorEdgePair: a shared source is a terminal state, not a failure', () => {
    it('terminates both edges at their shared source', () => {
        // The wavefront has finished; there is nothing left to propagate. Rays leaving one point in
        // different directions never intersect, which the base case used to read as an error.
        const {context, interiorEdgeIds} = pairFromOneSource([{x: 1, y: 0}, {x: 0, y: -1}]);
        const sharedSource = context.getEdgeWithId(interiorEdgeIds[0]).source;

        const output = handleInteriorEdgePair(context, {interiorEdges: interiorEdgeIds});

        expect(output.childSteps).toEqual([]);
        for (const edgeId of interiorEdgeIds) {
            expect(context.getEdgeWithId(edgeId).target).toBe(sharedSource);
            expect(context.isAccepted(edgeId)).toBe(true);
        }
        expect(context.graph.nodes[sharedSource].position).toEqual({x: 1, y: 1});
    });

    it('adds no node, because the shared source is already one', () => {
        const {context, interiorEdgeIds} = pairFromOneSource([{x: 1, y: 0}, {x: 0, y: -1}]);
        const nodeCount = context.graph.nodes.length;

        handleInteriorEdgePair(context, {interiorEdges: interiorEdgeIds});

        expect(context.graph.nodes).toHaveLength(nodeCount);
    });

    it('still cross-wires a head-on pair rather than treating it as terminal', () => {
        const {context, interiorEdgeIds} = initialisedContext(SQUARE);
        const [first, second] = interiorEdgeIds.slice(0, 2);

        handleInteriorEdgePair(context, {interiorEdges: [first, second]});

        expect(context.getEdgeWithId(first).target).toBeDefined();
        expect(context.getEdgeWithId(second).target).toBeDefined();
    });
});

/**
 * Two collinear bisectors pointing the same way, the leading one listed first.
 *
 * `intersectRays` classifies this ordering 'co-linear-from-2' and `collideInteriorEdges` returns
 * nothing for it — "will be handled by other edge" — a deferral that is only honoured where both
 * orderings are generated. The two-edge base case runs one ordering, so it has to retry the
 * reverse itself. The parents here are NOT parallel (offsets disagree along the line), so the
 * degenerate closure correctly declines and the reverse ordering is what resolves the pair.
 */
function collinearLeadingFirstPair(): InitialisedContext {
    const initialised = initialisedContext(SQUARE);
    const {context, interiorEdgeIds} = initialised;
    const pair = interiorEdgeIds.slice(0, 2);

    const leading = context.getEdgeWithId(pair[0]);
    leading.source = context.findOrAddNode({x: 1.5, y: 1}, 0).id;
    leading.basisVector = {x: 1, y: 0};

    const trailing = context.getEdgeWithId(pair[1]);
    trailing.source = context.findOrAddNode({x: 0.5, y: 1}, 0).id;
    trailing.basisVector = {x: 1, y: 0};

    return {context, interiorEdgeIds: pair};
}

describe('handleInteriorEdgePair: collinear same-direction pairs resolve in either ordering', () => {
    /*
     * THE CLOSURE IS ON THE LEADING SOURCE, AND IT USED TO BE A CROSS-WIRE — corrected 2026-08-29.
     *
     * Two rays running the SAME way along one line are not a head-on pair, and wiring each to the
     * other's source is wrong for the leading one by construction: its target sits behind its own
     * basis, which is journal decision 70's backwards edge, and the two edges then span one node
     * pair, which is I5's duplicate ridge. Both symptoms were live — the plus seed carried two of
     * each — and both were this one closure.
     *
     * WHAT IT IS INSTEAD is `solveParallelClosure`'s anchor rule, applied where the geometry is
     * already decided: the trailing edge travels forward to the leading source, and the leading one
     * has no wavefront left to trace and retires as a culled zero-length self-loop — the same
     * representation `applyDegenerateClosure` uses for every surplus bisector.
     *
     * THE ORDERING CLAIM IN THIS BLOCK'S TITLE IS UNCHANGED and is what the fixture above exists
     * for: `intersectRays` classifies this ordering 'co-linear-from-2' and `collideInteriorEdges`
     * returns nothing for it, so the base case has to retry the reverse ordering itself before it
     * can reach any closure at all.
     */
    it('closes on the leading source, culling the leading edge, when it is listed first', () => {
        const {context, interiorEdgeIds} = collinearLeadingFirstPair();
        const [leadingId, trailingId] = interiorEdgeIds;
        const leadingSource = context.getEdgeWithId(leadingId).source;

        const output = handleInteriorEdgePair(context, {interiorEdges: interiorEdgeIds});

        expect(output.childSteps).toEqual([]);
        expect(context.getEdgeWithId(trailingId).target).toBe(leadingSource);
        expect(context.getEdgeWithId(leadingId).target).toBe(leadingSource);
        expect(context.getInteriorWithId(leadingId).culled).toBe(true);
        expect(context.getInteriorWithId(trailingId).culled).toBeUndefined();
        for (const edgeId of interiorEdgeIds) {
            expect(context.isAccepted(edgeId)).toBe(true);
        }
    });

    it('picks the same leading source when the trailing edge is listed first', () => {
        // The closure reads which source LEADS from the raw separation, so it cannot depend on the
        // order the pair arrived in. Without this, the rule could be satisfied by taking `id1` and
        // the whole point of it — that no edge is wired behind its own basis — would hold only half
        // the time.
        const {context, interiorEdgeIds} = collinearLeadingFirstPair();
        const [leadingId, trailingId] = interiorEdgeIds;
        const leadingSource = context.getEdgeWithId(leadingId).source;

        handleInteriorEdgePair(context, {interiorEdges: [trailingId, leadingId]});

        expect(context.getEdgeWithId(trailingId).target).toBe(leadingSource);
        expect(context.getEdgeWithId(leadingId).target).toBe(leadingSource);
        expect(context.getInteriorWithId(leadingId).culled).toBe(true);
    });
});

describe('the degenerate closure, end to end: the rectilinear T-Shape', () => {
    // After the four simultaneous initial collisions, both remaining sub-polygons of the T's head
    // have all-parallel exterior parents: the pairwise machinery finds no collision, and the whole
    // head closes at a single offset onto the node at the top of the stem. That node anchors the
    // closure for both the two-edge and the three-edge base case, and the surplus bisectors the
    // n-gon partition emitted there are retired as culled zero-length self-loops.
    const T_SHAPE: Vector2[] = [
        {x: 0, y: 600}, {x: 600, y: 600}, {x: 600, y: 400}, {x: 400, y: 400},
        {x: 400, y: 0}, {x: 200, y: 0}, {x: 200, y: 400}, {x: 0, y: 400},
    ];

    it('solves completely, closing the head onto the stem-top node', () => {
        const context = runAlgorithmV5(T_SHAPE);
        const {graph} = context;

        expect(context.acceptedEdges.every(Boolean)).toBe(true);

        const interiorNodes = graph.nodes.slice(graph.numExteriorNodes);
        expect(interiorNodes.map(node => node.position)).toEqual([
            {x: 100, y: 500},
            {x: 500, y: 500},
            {x: 300, y: 500},
            {x: 300, y: 100},
        ]);
    });

    it('culls exactly the self-loop bisectors, and nothing else', () => {
        const context = runAlgorithmV5(T_SHAPE);
        const {graph} = context;

        for (const interiorEdge of graph.interiorEdges) {
            const polygonEdge = graph.edges[interiorEdge.id];
            const isSelfLoop = polygonEdge.target === polygonEdge.source;
            expect(interiorEdge.culled === true).toBe(isSelfLoop);
        }

        /*
         * ONE, AND IT WAS TWO UNTIL THE CORRIDOR-MIDLINE FIX (journal decision 90, 2026-08-28).
         * The one that survives is `[6, 2]`, the bisector of the head's two collinear `y = 400`
         * pieces: above their shared line every point is equidistant from both, so there is no
         * midline for it to be, and retiring it is right.
         *
         * THE ONE THAT LEFT IS THE STEM'S OWN MIDLINE, `[3, 5]`, and losing it was the same defect
         * the dumbbell was enrolled for. The stem is a corridor of anti-parallel walls; its midline
         * was born at `(300, 500)` pointing UP into the head instead of down the stem, found nothing
         * there, and was culled at its own source. The stem's ridge existed only because the
         * bisector born at the far end, `[5, 3]`, happened to point the right way. Both ends of a
         * corridor emit a midline and the two meet head-on, so the T-Shape now carries the pair —
         * the same representation `COLLINEAR_DUMBBELL` carries along its bar.
         */
        const culled = graph.interiorEdges.filter(interiorEdge => interiorEdge.culled);
        expect(culled).toHaveLength(1);
        expect(culled.map(interiorEdge => [
            interiorEdge.clockwiseExteriorEdgeIndex, interiorEdge.widdershinsExteriorEdgeIndex,
        ])).toEqual([[6, 2]]);
    });

    it('runs a midline down the stem in both directions, meeting head-on', () => {
        // The other half of the culling change above, asserted positively so that the stem's ridge
        // cannot quietly go back to being a single edge beside a retired self-loop.
        const {graph} = runAlgorithmV5(T_SHAPE);

        const stemMidlines = graph.interiorEdges.filter(interiorEdge =>
            (interiorEdge.clockwiseExteriorEdgeIndex === 3 && interiorEdge.widdershinsExteriorEdgeIndex === 5)
            || (interiorEdge.clockwiseExteriorEdgeIndex === 5 && interiorEdge.widdershinsExteriorEdgeIndex === 3));

        expect(stemMidlines).toHaveLength(2);
        expect(stemMidlines.map(interiorEdge => {
            const edge = graph.edges[interiorEdge.id];
            return [graph.nodes[edge.source].position, graph.nodes[edge.target!].position];
        })).toEqual([
            [{x: 300, y: 500}, {x: 300, y: 100}],
            [{x: 300, y: 100}, {x: 300, y: 500}],
        ]);
    });
});

describe('findOrAddNode: a non-finite position is a defect, not a new node', () => {
    it.each([
        ['NaN x', {x: Number.NaN, y: 0}],
        ['NaN y', {x: 0, y: Number.NaN}],
        ['infinite x', {x: Number.POSITIVE_INFINITY, y: 0}],
        ['infinite y', {x: 0, y: Number.NEGATIVE_INFINITY}],
    ])('throws on %s', (_label, position) => {
        const context = makeStraightSkeletonSolverContext(SQUARE);

        expect(() => context.findOrAddNode(position as Vector2, 0)).toThrow(/non-finite/);
    });

    it('still matches an existing node and still appends a new one', () => {
        // A NaN coordinate never compares equal to itself under an absolute tolerance, so the
        // lookup missed and appended a fresh node on every call. Finite positions are unaffected.
        const context = makeStraightSkeletonSolverContext(SQUARE);
        const nodeCount = context.graph.nodes.length;

        expect(context.findOrAddNode({x: 0, y: 0}, 0).id).toBe(0);
        expect(context.graph.nodes).toHaveLength(nodeCount);
        expect(context.findOrAddNode({x: 1, y: 1}, 0).id).toBe(nodeCount);
        expect(context.graph.nodes).toHaveLength(nodeCount + 1);
    });
});

/*
 * ============================================================================
 *  THE TERMINAL LADDER IS INDEPENDENT OF EDGE COUNT — journal decision 145.
 * ============================================================================
 *
 * The pair, the triangle and the n-gon reach one shared state — live interior edges and no event —
 * and climb one shared ladder from it: a CLOSURE (`solveDegenerateClosure ?? solveParallelClosure`),
 * then the COAXIAL COMPLETION (spec A19, signalled by a `coaxial-completion` diagnostic), then the
 * throw ONLY where no candidate pair exists. Until this ruling the triangle ran the closures only and
 * the n-gon ran neither, throwing on an empty collision list.
 *
 * Each rung is convicted below on a constructed triangle (three of a square's four bisectors, so the
 * closed form falls through on four distinct parents) and a constructed n-gon (all four), by moving
 * the bisectors' sources and bases so the collision generators find nothing:
 *
 *   - CLOSURE: every source moved onto one node, so every pair is `identical-source` and the whole
 *     set closes there at one shared offset — the degenerate closure;
 *   - COMPLETION: two rays anti-parallel and pointing together but 1e-4 apart laterally — a hundred
 *     times the coaxiality lane, so `intersectRays` calls the pair 'parallel' — with the others
 *     pointing away from everything. No closure applies (the square's walls are not parallel);
 *   - THROW: the same, with the pair retreating instead, so no candidate exists.
 */

/** Move the bisectors named by `ids` to the given sources and bases, in order. */
function placeRays(
    context: StraightSkeletonSolverContext,
    ids: number[],
    rays: [Vector2, Vector2][],
): void {
    ids.forEach((edgeId, index) => {
        const edge = context.getEdgeWithId(edgeId);
        edge.source = context.findOrAddNode(rays[index][0], 0).id;
        edge.basisVector = rays[index][1];
    });
}

/*
 * THE PAIR IS SQUARE BISECTORS 0 AND 2, whose clockwise parents are the square's left wall (basis
 * (0, 1)) and right wall (basis (0, −1)): the rays run +x and −x, each converting travel into offset
 * at rate 1 against its own parent, and their sources sit at the same offset (0.6 from their walls),
 * so their times agree at the midpoint x = 1 — a consistent head-on corridor, 1e-4 off coaxial.
 * Bisectors 1 and 3 run straight up and down from the pair's midline and meet nothing. No ray is
 * reflex against its parent, so no split event is generated.
 */

/** Anti-parallel, pointing together, 1e-4 apart across the pair's line — outside the 1e-6 lane. */
const APPROACHING_PAIR: [Vector2, Vector2][] = [
    [{x: 0.6, y: 0.5}, {x: 1, y: 0}],
    [{x: 1.4, y: 0.5001}, {x: -1, y: 0}],
];

/** The same two lines, the second source now BEHIND the first: the pair retreats. */
const RETREATING_PAIR: [Vector2, Vector2][] = [
    [{x: 1.4, y: 0.5}, {x: 1, y: 0}],
    [{x: 0.6, y: 0.5001}, {x: -1, y: 0}],
];

/** Rays pointing away from everything above: up from the top, down from the bottom. */
const OUTBOUND: [Vector2, Vector2][] = [
    [{x: 1, y: 1.8}, {x: 0, y: 1}],
    [{x: 1, y: 0.2}, {x: 0, y: -1}],
];

/** The square's four bisectors reordered as [pair, pair, outbound, outbound]. */
function pairFirst(interiorEdgeIds: number[]): number[] {
    return [interiorEdgeIds[0], interiorEdgeIds[2], interiorEdgeIds[1], interiorEdgeIds[3]];
}

function completionDiagnostics(context: StraightSkeletonSolverContext): string[] {
    return context.diagnostics.filter(d => d.kind === 'coaxial-completion').map(d => d.detail);
}

describe('decision 145: the pair climbs the ladder it always had', () => {
    it('COMPLETION: the approaching pair is cross-wired head-on, and the completion is recorded', () => {
        const {context, interiorEdgeIds} = initialisedContext(SQUARE);
        const pair = pairFirst(interiorEdgeIds).slice(0, 2);
        placeRays(context, pair, APPROACHING_PAIR);

        handleInteriorEdgePair(context, {interiorEdges: pair});

        expect(completionDiagnostics(context)).toHaveLength(1);
        expect(context.getEdgeWithId(pair[0]).target).toBe(context.getEdgeWithId(pair[1]).source);
        expect(context.getEdgeWithId(pair[1]).target).toBe(context.getEdgeWithId(pair[0]).source);
    });

    it('THROW: with the pair retreating there is no candidate, and the throw stands', () => {
        const {context, interiorEdgeIds} = initialisedContext(SQUARE);
        const pair = pairFirst(interiorEdgeIds).slice(0, 2);
        placeRays(context, pair, RETREATING_PAIR);

        expect(() => handleInteriorEdgePair(context, {interiorEdges: pair}))
            .toThrow(/Unable to generate any collision from last two edges/);
        expect(completionDiagnostics(context)).toEqual([]);
    });
});

describe('decision 145: the triangle climbs the ladder', () => {
    it('CLOSURE: three sources on one node close there, with no completion recorded', () => {
        const {context, interiorEdgeIds} = initialisedContext(SQUARE);
        const three = interiorEdgeIds.slice(0, 3);
        const centre = context.findOrAddNode({x: 1, y: 1}, 0);
        three.forEach(edgeId => { context.getEdgeWithId(edgeId).source = centre.id; });

        handleInteriorEdgeTriangle(context, {interiorEdges: three});

        for (const edgeId of three) {
            expect(context.getEdgeWithId(edgeId).target).toBe(centre.id);
            expect(context.isAccepted(edgeId)).toBe(true);
        }
        expect(completionDiagnostics(context)).toEqual([]);
    });

    it('COMPLETION: the approaching pair is priced head-on, and the completion is recorded', () => {
        const {context, interiorEdgeIds} = initialisedContext(SQUARE);
        const three = pairFirst(interiorEdgeIds).slice(0, 3);
        placeRays(context, three, [...APPROACHING_PAIR, OUTBOUND[0]]);

        handleInteriorEdgeTriangle(context, {interiorEdges: three});

        const recorded = completionDiagnostics(context);
        expect(recorded).toHaveLength(1);
        expect(recorded[0]).toContain(`e${interiorEdgeIds[0]} against e${interiorEdgeIds[2]} as head-on`);
        // The whole triangle terminates at the head-on meeting — where the pair's times agree, the
        // midpoint of the corridor — as it would at any best collision.
        const meeting = targetPositionOf(context, three[0]);
        expect(meeting.x).toBeCloseTo(1, 6);
        expect(meeting.y).toBeCloseTo(0.5, 6);
        for (const edgeId of three) {
            expect(targetPositionOf(context, edgeId)).toEqual(meeting);
            expect(context.isAccepted(edgeId)).toBe(true);
        }
    });

    it('THROW: with the pair retreating there is no candidate, and the throw stands', () => {
        const {context, interiorEdgeIds} = initialisedContext(SQUARE);
        const three = pairFirst(interiorEdgeIds).slice(0, 3);
        placeRays(context, three, [...RETREATING_PAIR, OUTBOUND[0]]);

        expect(() => handleInteriorEdgeTriangle(context, {interiorEdges: three}))
            .toThrow(/Failed to collide interior edges in triangle/);
        expect(completionDiagnostics(context)).toEqual([]);
    });
});

describe('decision 145: the n-gon climbs the same ladder', () => {
    it('CLOSURE: four sources on one node close there, where the n-gon used to throw', () => {
        const {context, interiorEdgeIds} = initialisedContext(SQUARE);
        const centre = context.findOrAddNode({x: 1, y: 1}, 0);
        interiorEdgeIds.forEach(edgeId => { context.getEdgeWithId(edgeId).source = centre.id; });

        const output = handleInteriorNGon(context, {interiorEdges: interiorEdgeIds});

        expect(output.childSteps).toEqual([]);
        for (const edgeId of interiorEdgeIds) {
            expect(context.getEdgeWithId(edgeId).target).toBe(centre.id);
            expect(context.isAccepted(edgeId)).toBe(true);
        }
        expect(completionDiagnostics(context)).toEqual([]);
    });

    it('COMPLETION: the approaching pair becomes the layer\'s event, and the completion is recorded', () => {
        const {context, interiorEdgeIds} = initialisedContext(SQUARE);
        const ordered = pairFirst(interiorEdgeIds);
        placeRays(context, ordered, [...APPROACHING_PAIR, ...OUTBOUND]);

        handleInteriorNGon(context, {interiorEdges: interiorEdgeIds});

        const recorded = completionDiagnostics(context);
        expect(recorded).toHaveLength(1);
        expect(recorded[0]).toContain(`e${ordered[0]} against e${ordered[1]} as head-on`);
        // The pair is resolved by the ordinary event machinery: both terminate at the head-on
        // meeting — the corridor's midpoint — and are accepted; the outbound rays stay live.
        const meeting = targetPositionOf(context, ordered[0]);
        expect(targetPositionOf(context, ordered[1])).toEqual(meeting);
        expect(meeting.x).toBeCloseTo(1, 6);
        expect(meeting.y).toBeCloseTo(0.5, 6);
        expect(context.isAccepted(ordered[0])).toBe(true);
        expect(context.isAccepted(ordered[1])).toBe(true);
        expect(context.isAccepted(ordered[2])).toBe(false);
        expect(context.isAccepted(ordered[3])).toBe(false);
    });

    it('THROW: with the pair retreating there is no candidate, and the throw stands (n-gon)', () => {
        const {context, interiorEdgeIds} = initialisedContext(SQUARE);
        placeRays(context, pairFirst(interiorEdgeIds), [...RETREATING_PAIR, ...OUTBOUND]);

        expect(() => handleInteriorNGon(context, {interiorEdges: interiorEdgeIds}))
            .toThrow(/Unable to generate any collisions from graph context/);
        expect(completionDiagnostics(context)).toEqual([]);
    });
});

/*
 * ============================================================================
 *  THE LADDER'S ANGULAR TESTS READ THE ONE RESOLUTION — spec A11, A15; journal decision 146.
 * ============================================================================
 *
 * Both rungs that ask an angle — `solveParallelClosure`'s bisector test ("do these rays travel the
 * same way?") and the completion's anti-parallel gate — ask it at the solve's angular resolution
 * (1.7721e-5 at the library floor), not at the retired 1e-8 and 1.4142e-4. Each is convicted by a
 * pair whose sine sits between its old bar and the resolution.
 */

/** Three collinear vertices: every exterior parent lies on one line, so the parent gate passes. */
const COLLINEAR_PARENTS: Vector2[] = [{x: 0, y: 0}, {x: 5, y: 0}, {x: 10, y: 0}];

describe('the parallel closure\'s bisector test is the resolution', () => {
    it('closes two same-way rays 1e-6 apart in angle — identical below the resolution, not at 1e-8', () => {
        const {context, interiorEdgeIds} = initialisedContext(COLLINEAR_PARENTS);
        const pair = interiorEdgeIds.slice(0, 2);
        const sine = 1e-6;
        placeRays(context, pair, [
            [{x: 2, y: 0.5}, {x: 0, y: 1}],
            [{x: 3, y: 0.1}, {x: -sine, y: Math.sqrt(1 - sine * sine)}],
        ]);

        handleInteriorEdgePair(context, {interiorEdges: pair});

        // The leading source is the first ray's: the second closes onto it and the first retires.
        const leadingSource = context.getEdgeWithId(pair[0]).source;
        expect(context.getEdgeWithId(pair[1]).target).toBe(leadingSource);
        expect(context.getInteriorWithId(pair[0]).culled).toBe(true);
    });
});

describe('the completion\'s anti-parallel gate is the resolution', () => {
    it('refuses an opposed pair at a sine of 5e-5 — priced at the resolution, so no completion', () => {
        // The pair points together but its lines cross BEHIND the second ray ('diverging'), so no
        // event exists. Its sine is 2.8× the resolution and a third of the retired gate: at the gate
        // it would have been completed as head-on; at the resolution it is not anti-parallel, and
        // with no candidate the throw stands.
        const {context, interiorEdgeIds} = initialisedContext(SQUARE);
        const pair = [interiorEdgeIds[0], interiorEdgeIds[2]];
        const sine = 5e-5;
        placeRays(context, pair, [
            [{x: 0.5, y: 0.5}, {x: 1, y: 0}],
            [{x: 1.5, y: 0.5001}, {x: -Math.sqrt(1 - sine * sine), y: sine}],
        ]);

        expect(() => handleInteriorEdgePair(context, {interiorEdges: pair}))
            .toThrow(/Unable to generate any collision from last two edges/);
        expect(completionDiagnostics(context)).toEqual([]);
    });
});

describe('meetHeadOn\'s division-safety test is the rounding bound of the sum (journal decision 144)', () => {
    /*
     * A head-on pair whose two offset rates cancel: square bisector 0 (clockwise parent basis (0, 1))
     * runs along `(cos t, sin t)` at rate `cos t`, and bisector 1 (clockwise parent (1, 0)) runs back
     * along it at rate `sin t`. At t = −45° the sum is an exact zero; one part in 1e12 off it, the
     * sum is 1.4e-12 — about 6 400 times the sum's own rounding bound (≤ 8u ≈ 8.9e-16) and seven
     * thousand times inside the retired `1e-8`. The first is refused, the second priced.
     */
    function headOnPairAt(angle: number) {
        const {context, interiorEdgeIds} = initialisedContext(SQUARE);
        const pair = interiorEdgeIds.slice(0, 2);
        const along = {x: Math.cos(angle), y: Math.sin(angle)};
        placeRays(context, pair, [
            [{x: 0.5, y: 1.5}, along],
            [{x: 0.5 + 0.5 * along.x, y: 1.5 + 0.5 * along.y}, {x: -along.x, y: -along.y}],
        ]);
        return {context, pair};
    }

    it('refuses a sum that cancels to an arithmetic zero', () => {
        const {context, pair} = headOnPairAt(-Math.PI / 4);
        const [first, second] = pair.map(id => context.getInteriorWithId(id));
        expect(collideInteriorEdges(first, second, context)).toEqual([]);
    });

    it('prices a sum of 1.4e-12, which the retired 1e-8 bar refused', () => {
        const {context, pair} = headOnPairAt(-Math.PI / 4 + 1e-12);
        const [first, second] = pair.map(id => context.getInteriorWithId(id));
        const events = collideInteriorEdges(first, second, context);
        expect(events).toHaveLength(1);
        expect(events[0].intersectionData[2]).toBe('head-on');
    });
});
