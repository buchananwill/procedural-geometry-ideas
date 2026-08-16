import type {StraightSkeletonSolverContext, Vector2} from '../../src/straight-skeleton/types';
import {
    handleInteriorEdgePair,
    handleInteriorEdgeTriangle,
    runAlgorithmV5,
} from '../../src/straight-skeleton/algorithm-termination-cases';
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
        const shared = context.findOrAddNode({x: 1, y: 1});
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

    it('falls through when the system is singular', () => {
        const {context, interiorEdgeIds} = initialisedContext(COLLINEAR_TRIPLE);

        expect(() => handleInteriorEdgeTriangle(context, {interiorEdges: interiorEdgeIds}))
            .toThrow(/Failed to collide interior edges in triangle/);
        expect(loggedMessages(fallThroughLog)).toMatch(/determinant.*falling through/s);
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
    const shared = context.findOrAddNode({x: 1, y: 1});
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

describe('findOrAddNode: a non-finite position is a defect, not a new node', () => {
    it.each([
        ['NaN x', {x: Number.NaN, y: 0}],
        ['NaN y', {x: 0, y: Number.NaN}],
        ['infinite x', {x: Number.POSITIVE_INFINITY, y: 0}],
        ['infinite y', {x: 0, y: Number.NEGATIVE_INFINITY}],
    ])('throws on %s', (_label, position) => {
        const context = makeStraightSkeletonSolverContext(SQUARE);

        expect(() => context.findOrAddNode(position as Vector2)).toThrow(/non-finite/);
    });

    it('still matches an existing node and still appends a new one', () => {
        // A NaN coordinate never compares equal to itself under an absolute tolerance, so the
        // lookup missed and appended a fresh node on every call. Finite positions are unaffected.
        const context = makeStraightSkeletonSolverContext(SQUARE);
        const nodeCount = context.graph.nodes.length;

        expect(context.findOrAddNode({x: 0, y: 0}).id).toBe(0);
        expect(context.graph.nodes).toHaveLength(nodeCount);
        expect(context.findOrAddNode({x: 1, y: 1}).id).toBe(nodeCount);
        expect(context.graph.nodes).toHaveLength(nodeCount + 1);
    });
});
