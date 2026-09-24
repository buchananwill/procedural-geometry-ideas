import {
    FULL_CORPUS,
    NEAR_STRAIGHT_WEIGHT_CHANGE_SPEED,
    NEAR_STRAIGHT_WEIGHT_CHANGE_TURN_SINE,
    WEIGHTED_CORRIDOR_FAST_CEILING,
    WEIGHTED_DORMER_SQUARE_REFUSED,
    WEIGHTED_FAST_SHELF_L,
    WEIGHTED_INVISIBLE_VERTEX_REFUSED,
    WEIGHTED_INVISIBLE_VERTEX_SOLVES,
    WEIGHTED_NEAR_STRAIGHT_WEIGHT_CHANGE,
    WEIGHTED_PENTAGON_HOUSE,
    WEIGHTED_RECTANGLE_FAST_FLOOR,
    WEIGHTED_SQUARE_ALTERNATING,
    WEIGHTED_SQUARE_NEAR_MAX_RATIO,
    WEIGHTED_STEP,
    WEIGHTED_SUB_FLOOR_WEIGHT_CHANGE,
    SUB_FLOOR_WEIGHT_CHANGE_INDEX,
    WeightedTestPolygon,
} from '@proc-geo/test-fixtures';
import {
    ARRIVAL_MOMENT_ULPS,
    maxWeightRatio,
    minWeightTurnSine,
    angularResolution,
    conditioningBound,
    SKELETON_NOISE_FLOOR,
    UNIT_ROUNDOFF,
    SkeletonSolveResult,
    StraightSkeletonGraph,
    Vector2,
    crossProduct,
    computeMaxOffset,
    computeNodeOffsetDistances,
    computeNodeOffsets,
    computeOffsetRings,
    computeOffsetRingsDetailed,
    computeStrips,
    makeBasis,
    setSkeletonLogLevel,
    solveSkeleton,
} from '@proc-geo/core';
import {createHash} from 'node:crypto';

setSkeletonLogLevel('silent');

/*
 * ============================================================================
 *  WEIGHTED OFFSETS — §4's fixtures and §5's solve-path bars
 * ============================================================================
 *
 * The weighted-offsets decision spec, `docs/notes/weighted-offsets-decisions.md`. A weight is a
 * per-exterior-edge, strictly positive SPEED (W1): the wavefront of edge `i` stands at perpendicular
 * distance `w_i · t` from its supporting line at time `t`, so every quantity the solver used to call
 * an offset is that edge's arrival TIME, `distance / weight` (W5).
 *
 * WHAT THIS FILE IS FOR, IN ORDER:
 *   1. The analytic fixtures of §4 — node positions and times to a stated tolerance (§5 bar 2).
 *   2. The EQUI-TIME property at every interior node (W39(i)), which is I3's weighted
 *      generalisation and the single most valuable check here: at every interior node, the
 *      perpendicular distance to each incident face's supporting line divided by that face's weight
 *      is ONE number. It is what "equidistant" becomes, and every weighted site in the solver has to
 *      agree with it or this fails.
 *   3. The three refusals (§5 bar 9), each asserted on the message naming its offender.
 *   4. The metamorphic mirror pair (§5 bar 8).
 *   5. UNIT-WEIGHT IDENTITY: an explicit all-ones array must give the same graph as no weights at
 *      all, over the whole 59-fixture corpus. True by construction under W36 — there is no branch on
 *      unit weights anywhere and every weighted site multiplies or divides by exactly `1.0` — so a
 *      failure here is a W36 violation, not a tolerance to widen.
 */

/** §5 bar 2: node positions and times to `1e-12` in the fixtures' own space. */
const ANALYTIC_TOLERANCE = 1e-12;

/**
 * The bar for the equi-time property at an interior node (W-spec W39(i)).
 *
 * Held at `1e-9` rather than at the analytic tolerance because the quantity is a DERIVED one: the
 * node's position comes out of a chain of intersections and the distance to each supporting line is
 * re-derived from the ring afterwards, so the two readings differ by the accumulated rounding of two
 * independent constructions. It is still three orders inside `SKELETON_NOISE_FLOOR`, so a violation
 * this test can see is far below anything a client could.
 */
const EQUI_TIME_BAR = 1e-9;

function nearlyEqual(actual: number, expected: number, tolerance: number): boolean {
    return Math.abs(actual - expected) <= tolerance;
}

function positionsAreNear(actual: Vector2, expected: Vector2, tolerance: number): boolean {
    return nearlyEqual(actual.x, expected.x, tolerance) && nearlyEqual(actual.y, expected.y, tolerance);
}

/** Every node the solve created beyond the input ring's own vertices. */
function interiorNodes(graph: StraightSkeletonGraph): Vector2[] {
    return graph.nodes.slice(graph.numExteriorNodes).map(node => node.position);
}

/** The perpendicular distance of `point` from the supporting LINE of exterior edge `edgeId`. */
function distanceToFace(graph: StraightSkeletonGraph, edgeId: number, point: Vector2): number {
    const edge = graph.edges[edgeId];
    const basis = edge.basisVector;
    const source = graph.nodes[edge.source].position;
    // `rotateCw90(basis) · (point − source)` — the inward reading `makeOffsetDistance` prices with.
    return basis.y * (point.x - source.x) - basis.x * (point.y - source.y);
}

/** The exterior faces bounding the bisectors incident to `nodeId`, deduplicated. */
function facesAtNode(graph: StraightSkeletonGraph, nodeId: number): number[] {
    const node = graph.nodes[nodeId];
    const faces = new Set<number>();
    for (const edgeId of [...node.inEdges, ...node.outEdges]) {
        if (edgeId < graph.numExteriorNodes) {
            continue;
        }
        const interior = graph.interiorEdges.find(candidate => candidate.id === edgeId);
        if (interior === undefined) {
            continue;
        }
        faces.add(interior.clockwiseExteriorEdgeIndex);
        faces.add(interior.widdershinsExteriorEdgeIndex);
    }
    return [...faces];
}

/**
 * The worst disagreement, across every interior node of a solved graph, between the wavefront times
 * that node's incident faces read (W-spec W39(i)).
 *
 * Culled bisectors are skipped: a culled edge is a retired zero-length self-loop and its parents are
 * not faces meeting at the node in the geometric sense.
 */
function worstEquiTimeSpread(result: SkeletonSolveResult): number {
    const graph = result.graph;
    let worst = 0;
    for (let nodeId = graph.numExteriorNodes; nodeId < graph.nodes.length; nodeId++) {
        const position = graph.nodes[nodeId].position;
        const times = facesAtNode(graph, nodeId)
            .map(faceId => distanceToFace(graph, faceId, position) / result.weights[faceId]);
        if (times.length < 2) {
            continue;
        }
        worst = Math.max(worst, Math.max(...times) - Math.min(...times));
    }
    return worst;
}

/** The kernel velocity `v` at input vertex `index`: the solution of `v · n₁ = w₁`, `v · n₂ = w₂`. */
function kernelVelocity(vertices: Vector2[], weights: number[], index: number): Vector2 {
    const count = vertices.length;
    const clockwise = makeBasis(vertices[index], vertices[(index + 1) % count]);
    const widdershins = makeBasis(vertices[(index - 1 + count) % count], vertices[index]);
    // n = rotateCw90(basis); the clockwise parent is the edge LEAVING the vertex.
    const n1 = {x: widdershins.y, y: -widdershins.x};
    const n2 = {x: clockwise.y, y: -clockwise.x};
    const w1 = weights[(index - 1 + count) % count];
    const w2 = weights[index];
    const determinant = n1.x * n2.y - n2.x * n1.y;
    return {
        x: (w1 * n2.y - w2 * n1.y) / determinant,
        y: (n1.x * w2 - n2.x * w1) / determinant,
    };
}

function solveWeighted(fixture: WeightedTestPolygon): SkeletonSolveResult {
    return solveSkeleton(fixture.vertices, {weights: fixture.weights});
}

/** Every analytic node the fixture states is present in the solved graph, to `tolerance`. */
function expectAnalyticNodes(fixture: WeightedTestPolygon, tolerance = ANALYTIC_TOLERANCE): void {
    const result = solveWeighted(fixture);
    expect(result.complete).toBe(true);
    const found = interiorNodes(result.graph);
    for (const expectation of fixture.expected!.interiorNodes!) {
        const match = found.find(candidate => positionsAreNear(candidate, expectation.position, tolerance));
        expect({node: expectation.position, found: match}).toEqual({
            node: expectation.position, found: match,
        });
        if (match === undefined) {
            throw new Error(
                `${fixture.name}: no interior node within ${tolerance} of `
                + `(${expectation.position.x}, ${expectation.position.y}); the graph has `
                + found.map(node => `(${node.x}, ${node.y})`).join(', '));
        }
        // The TIME is read back the way the solver states it: distance to a bounding face divided by
        // that face's weight. Every face must agree, which the equi-time sweep below asserts
        // separately; here the first one is enough to pin the clock.
        const faces = facesAtNode(result.graph, result.graph.nodes.findIndex(
            node => node.position === match));
        const time = distanceToFace(result.graph, faces[0], match) / result.weights[faces[0]];
        expect(nearlyEqual(time, expectation.time, tolerance)).toBe(true);
    }
}

describe('weighted offsets: §4 analytic fixtures', () => {
    it('§4.1 a rectangle with one edge at weight 2 puts its ridge a third of the way down', () => {
        // Bottom wavefront `y = 2t`, top `y = 2 − t`: they meet at `t = 2/3` on `y = 4/3`. At unit
        // weights the same ring gives `(1, 1)` and `(3, 1)` at time 1.
        expectAnalyticNodes(WEIGHTED_RECTANGLE_FAST_FLOOR);

        const unweighted = solveSkeleton(WEIGHTED_RECTANGLE_FAST_FLOOR.vertices);
        const unweightedNodes = interiorNodes(unweighted.graph);
        expect(unweightedNodes.some(node => positionsAreNear(node, {x: 1, y: 1}, ANALYTIC_TOLERANCE)))
            .toBe(true);
        expect(unweightedNodes.some(node => positionsAreNear(node, {x: 3, y: 1}, ANALYTIC_TOLERANCE)))
            .toBe(true);
    });

    it('§4.1 the corner velocities are the kernel\'s', () => {
        WEIGHTED_RECTANGLE_FAST_FLOOR.expected!.cornerVelocities!.forEach((expected, index) => {
            const velocity = kernelVelocity(
                WEIGHTED_RECTANGLE_FAST_FLOOR.vertices, WEIGHTED_RECTANGLE_FAST_FLOOR.weights, index);
            expect(positionsAreNear(velocity, expected, ANALYTIC_TOLERANCE)).toBe(true);
        });
    });

    it('§4.2 an unequal corridor closes on the line at w₁/(w₁+w₂) of its width, not the midline', () => {
        // THE CONVICTION FOR W14 AND W39(ii). At unit weights this ridge is at `y = 1/2`; at
        // `w_top = 3` it is at `y = 1/4`, a quarter of the way up from the SLOW wall.
        expectAnalyticNodes(WEIGHTED_CORRIDOR_FAST_CEILING);

        const unweighted = solveSkeleton(WEIGHTED_CORRIDOR_FAST_CEILING.vertices);
        expect(interiorNodes(unweighted.graph).some(
            node => positionsAreNear(node, {x: 0.5, y: 0.5}, ANALYTIC_TOLERANCE))).toBe(true);
    });

    it('§4.3 a fast shelf beside a slow riser drags the reflex vertex down at four times the rate', () => {
        // The reflex kernel is `v = (−1, −4)`: the fast shelf pulls the vertex along the riser's own
        // basis at four times the riser's rate, and the riser's wavefront segment LENGTHENS.
        const velocity = kernelVelocity(WEIGHTED_FAST_SHELF_L.vertices, WEIGHTED_FAST_SHELF_L.weights, 3);
        expect(positionsAreNear(velocity, {x: -1, y: -4}, ANALYTIC_TOLERANCE)).toBe(true);

        expectAnalyticNodes(WEIGHTED_FAST_SHELF_L);
    });

    it('§4.4 the near-maximum-ratio square puts its ridge hard against the slow wall', () => {
        expectAnalyticNodes(WEIGHTED_SQUARE_NEAR_MAX_RATIO);
    });

    it('§4.6 the step\'s riser collapses at an edge event that does not exist at unit weights', () => {
        // W-spec W29/W32. At unit weights the riser's two traces are parallel `(−1, 1)` and it never
        // collapses; at `w_low = 2` they are `(−1, 1)` and `(−1, 2)` and it collapses at `t = 2`.
        const reflex = kernelVelocity(WEIGHTED_STEP.vertices, WEIGHTED_STEP.weights, 4);
        const convex = kernelVelocity(WEIGHTED_STEP.vertices, WEIGHTED_STEP.weights, 5);
        expect(positionsAreNear(reflex, {x: -1, y: 1}, ANALYTIC_TOLERANCE)).toBe(true);
        expect(positionsAreNear(convex, {x: -1, y: 2}, ANALYTIC_TOLERANCE)).toBe(true);

        const unitReflex = kernelVelocity(WEIGHTED_STEP.vertices, WEIGHTED_STEP.vertices.map(() => 1), 4);
        const unitConvex = kernelVelocity(WEIGHTED_STEP.vertices, WEIGHTED_STEP.vertices.map(() => 1), 5);
        expect(positionsAreNear(unitReflex, unitConvex, ANALYTIC_TOLERANCE)).toBe(true);

        expectAnalyticNodes(WEIGHTED_STEP);
    });

    it('§4.8 the four-edge square with alternating weights solves', () => {
        expectAnalyticNodes(WEIGHTED_SQUARE_ALTERNATING);
    });

    /*
     * §4.8's COMPANION, AS DERIVED RATHER THAN AS WRITTEN — a negative result, reported not patched.
     *
     * The spec states the four corner velocities as `(1, 2)`, `(2, −1)`, `(−1, −2)`, `(−2, 1)`, with
     * "four-fold rotational symmetry to 1e-12, and no mirror symmetry". That cannot be produced by
     * ANY weights on a four-cycle: alternating weights give OPPOSITE edges the same speed, so the
     * configuration is mirror-symmetric about both axes and two-fold rotational. The spec's own
     * first entry `(1, 2)` is correct and its second and fourth are not: from `v · n₁ = w₁`,
     * `v · n₂ = w₂` with `n = rotateCw90(basis)`, vertex 1 sits between the `x = 0` wall (weight 1,
     * `n = (1, 0)`) and the `y = 2` wall (weight 2, `n = (0, −1)`), which gives `(1, −2)`.
     */
    it('§4.8 the alternating square is two-fold rotational and mirror-symmetric, not four-fold', () => {
        WEIGHTED_SQUARE_ALTERNATING.expected!.cornerVelocities!.forEach((expected, index) => {
            const velocity = kernelVelocity(
                WEIGHTED_SQUARE_ALTERNATING.vertices, WEIGHTED_SQUARE_ALTERNATING.weights, index);
            expect(positionsAreNear(velocity, expected, ANALYTIC_TOLERANCE)).toBe(true);
        });

        const nodes = interiorNodes(solveWeighted(WEIGHTED_SQUARE_ALTERNATING).graph);
        // Two-fold rotational about the centre (1, 1): the node set maps to itself under a half turn.
        const halfTurn = (point: Vector2): Vector2 => ({x: 2 - point.x, y: 2 - point.y});
        for (const node of nodes) {
            expect(nodes.some(other => positionsAreNear(other, halfTurn(node), ANALYTIC_TOLERANCE)))
                .toBe(true);
        }
        // NOT four-fold: a quarter turn maps the horizontal ridge onto a vertical one that is not
        // there. This is the spec's claim, falsified.
        const quarterTurn = (point: Vector2): Vector2 => ({x: 1 + (point.y - 1), y: 1 - (point.x - 1)});
        expect(nodes.some(node =>
            !nodes.some(other => positionsAreNear(other, quarterTurn(node), ANALYTIC_TOLERANCE))))
            .toBe(true);
    });
});

describe('weighted offsets: the equi-time property (W39(i), I3 generalised)', () => {
    /*
     * THE MOST VALUABLE SINGLE CHECK IN THIS FILE. Under unit weights a skeleton node is
     * EQUIDISTANT from the faces meeting at it; under weights it is EQUI-TIME — `d_i / w_i` is one
     * number across every incident face. Every weighted site in the solver has to agree with that,
     * and none of them computes it: the kernel direction, the collision arrival, the terminal
     * three-line solve and the degenerate closures each reach a node their own way, so this is an
     * independent re-derivation of what they all claim.
     */
    const SOLVING_FIXTURES: WeightedTestPolygon[] = [
        WEIGHTED_RECTANGLE_FAST_FLOOR,
        WEIGHTED_CORRIDOR_FAST_CEILING,
        WEIGHTED_FAST_SHELF_L,
        WEIGHTED_SQUARE_NEAR_MAX_RATIO,
        WEIGHTED_PENTAGON_HOUSE,
        WEIGHTED_STEP,
        WEIGHTED_INVISIBLE_VERTEX_SOLVES,
        WEIGHTED_SQUARE_ALTERNATING,
    ];

    it.each(SOLVING_FIXTURES.map((fixture): [string, WeightedTestPolygon] => [fixture.name, fixture]))(
        '%s: every interior node reads one time from every incident face',
        (_name, fixture) => {
            const result = solveWeighted(fixture);
            expect(result.complete).toBe(true);
            expect(worstEquiTimeSpread(result)).toBeLessThan(EQUI_TIME_BAR);
        },
    );

    it('holds over the unweighted corpus too, which is what makes it a generalisation', () => {
        // At all-ones weights the division is by `1.0` and this IS I3's equidistance, so the same
        // sweep over the clean roster must pass — otherwise the predicate is measuring something
        // else. Run over the fixtures that solve, since a defect fixture's graph is pinned on its
        // defect rather than on this invariant.
        const clean = FULL_CORPUS.slice(0, 5);
        for (const fixture of clean) {
            const result = solveSkeleton(fixture.vertices);
            expect(worstEquiTimeSpread(result)).toBeLessThan(EQUI_TIME_BAR);
        }
    });
});

describe('weighted offsets: the three refusals (§5 bar 9)', () => {
    /*
     * EVERY REFUSAL IS A THROW THAT NAMES ITS OFFENDER, and every one of them runs BEFORE
     * canonicalisation so the index in the message is the caller's own (arc decision 124(b)). A
     * diagnostic would be the wrong answer for the same reason it is wrong for a non-finite vertex:
     * this is input the solver cannot solve, not a solve that came back degraded.
     */

    it('W2: a zero, negative, NaN or infinite weight is refused by index', () => {
        const square = WEIGHTED_SQUARE_ALTERNATING.vertices;
        for (const [index, bad] of [[0, 0], [1, -1], [2, Number.NaN], [3, Number.POSITIVE_INFINITY]]) {
            const weights = square.map(() => 1);
            weights[index] = bad;
            expect(() => solveSkeleton(square, {weights}))
                .toThrow(new RegExp(`Weight ${index} is `));
        }
    });

    it('W1: a weight array of the wrong length is refused, naming both lengths', () => {
        expect(() => solveSkeleton(WEIGHTED_SQUARE_ALTERNATING.vertices, {weights: [1, 2, 1]}))
            .toThrow(/Weight array has 3 entries but the polygon has 4 vertices/);
    });

    it('W3: a ratio above maxWeightRatio(δ) is refused, naming the two extreme edges', () => {
        // C8 spec T22, journal decision 156: the bound is `δ / (64·√2·u)`, about 9.95e7 at the library
        // floor, where it was the retired `MAX_WEIGHT_RATIO = 100`. At `R` the door admits the ring; at
        // `2R` it refuses it. (The analytic near-maximum-ratio square is still pinned at 100, above.)
        const square = WEIGHTED_SQUARE_NEAR_MAX_RATIO.vertices;
        const bound = maxWeightRatio(SKELETON_NOISE_FLOOR);
        expect(() => solveSkeleton(square, {weights: [1, 1, 1, bound]})).not.toThrow();
        expect(() => solveSkeleton(square, {weights: [1, 1, 1, 2 * bound]}))
            .toThrow(new RegExp(`edge 3 has weight ${2 * bound} and edge 0 has weight 1`));
        expect(() => solveSkeleton(square, {weights: [1, 1, 1, 2 * bound]}))
            .toThrow(/exceeds maxWeightRatio\(0\.000001\)/);
        // The retired ceiling no longer refuses anything: 101 passes the door.
        expect(() => solveSkeleton(square, {weights: [1, 1, 1, 101]})).not.toThrow();
    });

    it('W3: the ratio bound is DERIVED from the floor and the roundoff, as a formula (C8 spec T22)', () => {
        // The narrowest per-pair window, δ/R in time, must stay wider than the 64-ulp moment bar at the
        // largest time a unit-extent region admits (√2/2): R ≤ δ / (64·ε·√2/2) = δ / (64·√2·u).
        for (const floor of [1e-6, 3e-6, 1e-5, 1e-4]) {
            expect(maxWeightRatio(floor)).toBe(floor / (ARRIVAL_MOMENT_ULPS * Math.SQRT2 * UNIT_ROUNDOFF));
        }
        expect(maxWeightRatio(SKELETON_NOISE_FLOOR)).toBeCloseTo(9.95e7, -6);
    });

    it('W49: the turn guard is DERIVED per vertex from the kernel\'s error budget (C8 spec T21)', () => {
        // `minWeightTurnSine(δ, Δw) = √(√2·u·Δw / δ)`, equivalently `conditioningBound(δ)·√(Δw/2)`.
        // It replaced the frozen 1.4142e-4 (the scratch epsilon's `√(ε(2 − ε))`), and it is still a
        // DIFFERENT question from the angular resolution (spec A22).
        expect(minWeightTurnSine(SKELETON_NOISE_FLOOR, 15)).toBeCloseTo(4.853e-5, 8);
        expect(minWeightTurnSine(SKELETON_NOISE_FLOOR, 99)).toBeCloseTo(1.2468e-4, 8);
        expect(minWeightTurnSine(SKELETON_NOISE_FLOOR, 15))
            .toBeCloseTo(conditioningBound(SKELETON_NOISE_FLOOR) * Math.sqrt(15 / 2), 15);
        expect(minWeightTurnSine(SKELETON_NOISE_FLOOR, 15)).not.toBe(angularResolution(SKELETON_NOISE_FLOOR));
    });

    it('§4.7 W49: a weight change at the invisible vertex is refused, naming that vertex', () => {
        const fixture = WEIGHTED_INVISIBLE_VERTEX_REFUSED;
        const refusal = fixture.expected!.refusal!;
        expect(() => solveWeighted(fixture))
            .toThrow(new RegExp(`Vertex ${refusal.vertexIndex} carries a weight change `
                + `\\(${refusal.incomingWeight} to ${refusal.outgoingWeight}\\)`));
        expect(() => solveWeighted(fixture)).toThrow(/below minWeightTurnSine/);
    });

    it('§4.8 the dormer square is refused, naming vertex 1 and the weights 1 and 2', () => {
        /*
         * ARC DECISION 124's MODEL INVARIANT, STATED AS A TEST. The base of the roof lies in a
         * single plane; a dormer is a feature stitched into the roof the skeleton produces, never a
         * convention inside the solver. Vertex 0 is a real corner whose weights also differ and it
         * passes the door; vertex 1 is the first collinear weight change and it is refused.
         */
        const fixture = WEIGHTED_DORMER_SQUARE_REFUSED;
        expect(() => solveWeighted(fixture))
            .toThrow(/Vertex 1 carries a weight change \(1 to 2\)/);
        expect(() => solveWeighted(fixture)).toThrow(/Weights may change only at a visible corner/);
    });

    it('W49: the guard is angular, so the SAME ring solves once the corner is visible', () => {
        // Below the bar it is refused; above it, the kernel is well conditioned by the bar's own
        // derivation. Nothing about the ratio changes between these two calls.
        const square = WEIGHTED_SQUARE_ALTERNATING.vertices;
        const collinear = [
            {x: 0, y: 0}, {x: 0, y: 1}, {x: 0, y: 2}, {x: 2, y: 2}, {x: 2, y: 0},
        ];
        expect(() => solveSkeleton(collinear, {weights: [1, 2, 1, 1, 1]}))
            .toThrow(/Vertex 1 carries a weight change/);
        expect(() => solveSkeleton(square, {weights: [1, 2, 1, 2]})).not.toThrow();
    });

    it('W49: unit weights never reach the angular test, whatever the geometry', () => {
        // The guard is gated on `w₁ !== w₂` first, so an exactly collinear vertex is fine at equal
        // weights — which is the whole reason the digest cannot move.
        const collinear = [
            {x: 0, y: 0}, {x: 0, y: 1}, {x: 0, y: 2}, {x: 2, y: 2}, {x: 2, y: 0},
        ];
        expect(() => solveSkeleton(collinear, {weights: [1, 1, 1, 1, 1]})).not.toThrow();
        expect(() => solveSkeleton(collinear)).not.toThrow();
    });
});

describe('weighted offsets: W44 pins a weight-change vertex and nothing else', () => {
    it('§4.7 a weight change at a CORNER leaves the invisible vertex to be removed as usual', () => {
        // The pin fires on weight-change vertices only. Here the change is at vertex 3, both of
        // whose edges meet at a visible corner, so vertex 5 — exactly on its own edge — is removed
        // exactly as it is at unit weights.
        const result = solveWeighted(WEIGHTED_INVISIBLE_VERTEX_SOLVES);
        const removal = result.diagnostics.find(entry => entry.kind === 'vertices-canonicalised');
        expect(removal).toBeDefined();
        expect(removal!.detail).toMatch(/^1 vertex\(es\) removed/);
        expect(result.graph.numExteriorNodes).toBe(15);
        expect(result.weights).toHaveLength(15);
    });

    it('a SUB-FLOOR weight-change vertex at a visible turn is PINNED rather than removed', () => {
        /*
         * ARC DECISION 120, THE USER'S RULING, AND THE ONLY CONFIGURATION THAT CAN CONVICT IT. A
         * vertex whose two incident edges differ in weight is STRUCTURAL whatever its deviation from
         * the chord: it is invisible in the SILHOUETTE and visible in the SKELETON. Decision 55's
         * rule becomes "collinear AND EQUAL-WEIGHTED contributes nothing".
         *
         * The bump's apex deviates half a noise floor from the chord between its shoulders, so at
         * EQUAL weights the boundary stage removes it — and that is the control below. Its turn sine
         * is `2e-4`, above the door's bar, so a weight change there is admitted and then pinned.
         * The two solves differ by exactly that one vertex.
         */
        const fixture = WEIGHTED_SUB_FLOOR_WEIGHT_CHANGE;
        const weighted = solveWeighted(fixture);
        expect(weighted.graph.numExteriorNodes).toBe(fixture.vertices.length);
        expect(weighted.diagnostics.some(entry => entry.kind === 'vertices-canonicalised')).toBe(false);
        expect(weighted.weights).toEqual(fixture.weights);

        // THE CONTROL: the same ring at equal weights loses that vertex, which is what makes the
        // assertion above a statement about the PIN rather than about the geometry.
        const unweighted = solveSkeleton(fixture.vertices);
        expect(unweighted.graph.numExteriorNodes).toBe(fixture.vertices.length - 1);
        const removal = unweighted.diagnostics.find(entry => entry.kind === 'vertices-canonicalised');
        expect(removal).toBeDefined();
        expect(removal!.detail).toMatch(/^1 vertex\(es\) removed/);
    });

    it('the pinned vertex is under the floor and over the turn bar, which is why the two disagree', () => {
        // Canonicalisation reads CHORD DEVIATION and the door reads TURN SINE; short edges make a
        // visible corner out of an invisible deviation. Both numbers, stated.
        const fixture = WEIGHTED_SUB_FLOOR_WEIGHT_CHANGE;
        const index = SUB_FLOOR_WEIGHT_CHANGE_INDEX;
        const count = fixture.vertices.length;
        const outgoing = makeBasis(fixture.vertices[index], fixture.vertices[(index + 1) % count]);
        const incoming = makeBasis(fixture.vertices[(index - 1 + count) % count], fixture.vertices[index]);
        const weightDifference = Math.abs(fixture.weights[index] - fixture.weights[(index - 1 + count) % count]);
        expect(Math.abs(crossProduct(outgoing, incoming)))
            .toBeGreaterThan(minWeightTurnSine(SKELETON_NOISE_FLOOR, weightDifference));

        // The deviation is below the floor in the space canonicalisation works in, which the control
        // above demonstrates behaviourally; asserted here as the caller-space number the fixture is
        // built from, carried across the unit-extent transform (extent 10, scale 1/8).
        const previous = fixture.vertices[index - 1];
        const next = fixture.vertices[index + 1];
        const chordY = (previous.y + next.y) / 2;
        expect(Math.abs(fixture.vertices[index].y - chordY) / 8).toBeLessThan(SKELETON_NOISE_FLOOR);
    });

    it('a weight-change vertex above the floor is kept, and nothing is merged across it', () => {
        const result = solveWeighted(WEIGHTED_NEAR_STRAIGHT_WEIGHT_CHANGE);
        expect(result.graph.numExteriorNodes).toBe(WEIGHTED_NEAR_STRAIGHT_WEIGHT_CHANGE.vertices.length);
        expect(result.weights).toEqual(WEIGHTED_NEAR_STRAIGHT_WEIGHT_CHANGE.weights);
    });

    it('§4.3 the conditioning hazard is angular, and this is the number', () => {
        /*
         * `|v| = |w₁ − w₂| / sin(turn)`, measured on a ring the door ADMITS: the turn sine is `1e-3`,
         * seven times the retired frozen bar and some forty-six times the derived per-vertex bar
         * `minWeightTurnSine(δ, 3)` (C8 spec T21), and the kernel velocity at that vertex is already
         * `3e3` on a shape of extent 10. That is arc journal F48's finding as a fixture, and it is
         * why the bar exists at all — the weight RATIO here is 4, nowhere near the ratio guard.
         */
        const fixture = WEIGHTED_NEAR_STRAIGHT_WEIGHT_CHANGE;
        const count = fixture.vertices.length;
        const outgoing = makeBasis(fixture.vertices[4], fixture.vertices[0]);
        const incoming = makeBasis(fixture.vertices[3], fixture.vertices[4]);
        const turnSine = Math.abs(crossProduct(outgoing, incoming));
        // The construction places the deviation by the small-angle relation, so the sine lands one
        // part in 4e6 short of the nominal `1e-3` — the third-order term, not a defect.
        expect(turnSine).toBeCloseTo(NEAR_STRAIGHT_WEIGHT_CHANGE_TURN_SINE, 8);
        expect(turnSine).toBeGreaterThan(minWeightTurnSine(SKELETON_NOISE_FLOOR, 3));

        const velocity = kernelVelocity(fixture.vertices, fixture.weights, 4);
        const speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);
        expect(speed / NEAR_STRAIGHT_WEIGHT_CHANGE_SPEED).toBeCloseTo(1, 5);
        expect(count).toBe(5);
    });
});

describe('weighted offsets: the metamorphic mirror pair (§4.5, §5 bar 8)', () => {
    /*
     * MIRROR THE RING AND MIRROR THE WEIGHTS, AND THE SKELETON MIRRORS. This is the falsification
     * for W45's index maps: reversing a ring sends edge `j` to original edge `n − 2 − j`, and a
     * weight array that did not follow that map would put the fast roof on the wrong side and the
     * mirrored solve would not match.
     */
    const MIRROR_AXIS = 6;

    function mirror(point: Vector2): Vector2 {
        return {x: MIRROR_AXIS - point.x, y: point.y};
    }

    /** W-spec W45's reversal map, applied here as an ORACLE rather than read from the solver. */
    function reverseWeights(weights: number[]): number[] {
        return weights.map((_unused, index) => weights[(weights.length - 2 - index + weights.length) % weights.length]);
    }

    it('the apex moves toward the slow roof, so the weighted solve is NOT mirror-symmetric', () => {
        const result = solveWeighted(WEIGHTED_PENTAGON_HOUSE);
        expect(result.complete).toBe(true);
        const nodes = interiorNodes(result.graph);
        // Some node fails to have a mirror partner: the shape is symmetric and the answer is not.
        expect(nodes.some(node =>
            !nodes.some(other => positionsAreNear(other, mirror(node), 1e-9)))).toBe(true);

        // The unweighted solve of the same ring IS mirror-symmetric, which is what makes the above
        // a statement about the weights rather than about the fixture.
        const unweighted = interiorNodes(solveSkeleton(WEIGHTED_PENTAGON_HOUSE.vertices).graph);
        for (const node of unweighted) {
            expect(unweighted.some(other => positionsAreNear(other, mirror(node), 1e-9))).toBe(true);
        }
    });

    it('mirroring the ring AND the weights mirrors the skeleton', () => {
        const original = solveWeighted(WEIGHTED_PENTAGON_HOUSE);
        const mirroredVertices = [...WEIGHTED_PENTAGON_HOUSE.vertices.map(mirror)].reverse();
        const mirroredWeights = reverseWeights(WEIGHTED_PENTAGON_HOUSE.weights);
        const mirrored = solveSkeleton(mirroredVertices, {weights: mirroredWeights});

        expect(mirrored.complete).toBe(true);
        const originalNodes = interiorNodes(original.graph);
        const mirroredNodes = interiorNodes(mirrored.graph);
        expect(mirroredNodes).toHaveLength(originalNodes.length);
        for (const node of originalNodes) {
            expect(mirroredNodes.some(other => positionsAreNear(other, mirror(node), ANALYTIC_TOLERANCE)))
                .toBe(true);
        }
    });
});

describe('weighted offsets: unit-weight identity over the whole corpus (W36, arc decision 112(d))', () => {
    /*
     * AN EXPLICIT ALL-ONES ARRAY MUST BE THE SAME SOLVE AS NO ARRAY AT ALL. True by construction:
     * there is no branch on unit weights anywhere in the solver (W36 — the input
     * `(1, …, 1 + 2⁻⁵²)` must not be solved by different code from `(1, …, 1)`), and every weighted
     * site multiplies or divides by exactly `1.0`, which is exact for every finite double. A failure
     * here is a W36 violation to fix, never a tolerance to widen.
     *
     * This is the same serialisation the full-graph digest pins, computed here over both solves of
     * each fixture rather than against a stored table, so it convicts the OPTION rather than the tip.
     */
    function digestOf(result: SkeletonSolveResult): string {
        const graph = result.graph;
        const parts: unknown[] = [result.complete];
        for (const node of graph.nodes) {
            parts.push(node.id, node.position.x, node.position.y, node.inEdges, node.outEdges);
        }
        for (const edge of graph.edges) {
            parts.push(edge.id, edge.source, edge.target ?? -1, edge.basisVector.x, edge.basisVector.y);
        }
        for (const interior of graph.interiorEdges) {
            parts.push(interior.id, interior.clockwiseExteriorEdgeIndex,
                interior.widdershinsExteriorEdgeIndex, interior.maxOffset ?? 'none', interior.culled ?? false);
        }
        return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
    }

    // `Offset Cross Junction` (enrolled 2026-09-23, decision 151(d)) is in this sweep and passes it:
    // its signalled failure is bit-identical with and without the all-ones weight array.
    it.each(FULL_CORPUS.map((fixture): [string, Vector2[]] => [fixture.name, fixture.vertices]))(
        '%s solves identically with an explicit all-ones weight array',
        (_name, vertices) => {
            const bare = solveSkeleton(vertices);
            const ones = solveSkeleton(vertices, {weights: vertices.map(() => 1)});
            expect(digestOf(ones)).toBe(digestOf(bare));
            // The reported array is the one the SOLVE ran on, so it is as long as the ring that
            // survived the boundary stage — which for a fixture with a removed vertex is shorter
            // than the caller's.
            expect(ones.weights).toEqual(bare.weights);
            expect(new Set(ones.weights)).toEqual(new Set([1]));
        },
    );

    it('an all-ones array is reported back unchanged, and normalisation divides by exactly 1', () => {
        const result = solveSkeleton(WEIGHTED_SQUARE_ALTERNATING.vertices, {weights: [3, 3, 3, 3]});
        // W4: every weight divided by the minimum, so a uniform array normalises to all ones — the
        // skeleton is invariant under a common scaling of all weights.
        expect(result.weights).toEqual([1, 1, 1, 1]);
    });

    it('a uniform non-unit weight array gives the unweighted skeleton', () => {
        const bare = solveSkeleton(WEIGHTED_RECTANGLE_FAST_FLOOR.vertices);
        const uniform = solveSkeleton(WEIGHTED_RECTANGLE_FAST_FLOOR.vertices, {weights: [7, 7, 7, 7]});
        expect(interiorNodes(uniform.graph)).toEqual(interiorNodes(bare.graph));
    });
});

/*
 * ============================================================================
 *  THE PROJECTION IS IN TIME (W-spec W5, W40) — §4.1 and §4.4's expectations
 * ============================================================================
 *
 * The solver's `maxOffset` and `offsetDistance` became times in package 2 while `computeNodeOffsets`
 * still returned distances — identical at unit weights, divergent the moment a weight is not one
 * (arc journal decision 127, F50). These are the assertions that say the seam is closed.
 *
 * THE RING AT TIME `t` IS THE EQUI-TIME FRONT: the offset segment of exterior edge `e` stands at
 * perpendicular distance `w_e · t` from `e`, so one call sets differently-weighted edges back by
 * different amounts. That is the whole claim, and `ringSetbackErrors` below re-derives it from the
 * returned geometry against the fixture's own weights rather than against anything the projection
 * computed.
 *
 * MUTATION: put the distance back — drop the `/ exteriorWeights[parent]` in `computeNodeOffsets`, or
 * the `· w_cw` in `bisectorPositionAtOffset` — and every assertion in this block dies while the
 * unweighted corpus, the digest and `offset-projection.test.ts` stay green.
 */

/** Perpendicular distance from `point` to the supporting line of exterior edge `edgeId`. */
function faceDistance(graph: StraightSkeletonGraph, edgeId: number, point: Vector2): number {
    return Math.abs(distanceToFace(graph, edgeId, point));
}

/**
 * For every segment of every ring at `time`, how far its two endpoints are from `w_e · time`.
 *
 * Read off `OffsetRingSegment.exteriorEdgeId`, so each piece is measured against the edge it is the
 * offset OF and against that edge's own speed. An unweighted projection puts every piece at `time`
 * from its edge and fails here on any fixture with a non-unit weight.
 */
function ringSetbackErrors(result: SkeletonSolveResult, time: number): number[] {
    const graph = result.graph;
    const errors: number[] = [];
    for (const ring of computeOffsetRingsDetailed(result, time)) {
        for (const segment of ring.segments) {
            const expected = result.weights[segment.exteriorEdgeId] * time;
            errors.push(Math.abs(faceDistance(graph, segment.exteriorEdgeId, segment.start.position) - expected));
            errors.push(Math.abs(faceDistance(graph, segment.exteriorEdgeId, segment.end.position) - expected));
        }
    }
    return errors;
}

describe('weighted offsets: the projection reads TIME (W40)', () => {
    it('the node table IS the equi-time table: every node, against every face it touches', () => {
        /*
         * THE DIRECT STATEMENT OF W40, and the conviction that does not depend on which edge the
         * table happened to date a node against. `computeNodeOffsets` picks the clockwise parent of
         * the first incident bisector — an implementation choice — so a fixture whose nodes all
         * happen to be dated against a unit-weight edge cannot see the division go missing. This
         * checks the returned value against EVERY incident face's own clock instead, which is a
         * choice-free reading: `d_f / w_f` is one number across the faces at a node (W39(i)), and
         * the table must be that number.
         */
        for (const fixture of [
            WEIGHTED_RECTANGLE_FAST_FLOOR,
            WEIGHTED_CORRIDOR_FAST_CEILING,
            WEIGHTED_FAST_SHELF_L,
            WEIGHTED_SQUARE_NEAR_MAX_RATIO,
            WEIGHTED_SQUARE_ALTERNATING,
            WEIGHTED_PENTAGON_HOUSE,
            WEIGHTED_STEP,
        ]) {
            const result = solveWeighted(fixture);
            const table = computeNodeOffsets(result);
            let checked = 0;
            for (let nodeId = result.graph.numExteriorNodes; nodeId < result.graph.nodes.length; nodeId++) {
                const tabled = table.get(nodeId);
                if (tabled === undefined) {
                    continue;
                }
                const position = result.graph.nodes[nodeId].position;
                for (const faceId of facesAtNode(result.graph, nodeId)) {
                    const time = distanceToFace(result.graph, faceId, position) / result.weights[faceId];
                    expect({fixture: fixture.name, nodeId, faceId, off: Math.abs(tabled - time) > EQUI_TIME_BAR})
                        .toEqual({fixture: fixture.name, nodeId, faceId, off: false});
                    checked += 1;
                }
            }
            expect({fixture: fixture.name, checked: checked > 0}).toEqual({fixture: fixture.name, checked: true});
        }
    });

    it('the debug readout is in the same clock as the projection (W40, debug-helpers)', () => {
        /*
         * `computeNodeOffsetDistances` is the dashboard's own node-time readout, dated from the
         * bisector LEAVING a node rather than re-derived from the finished graph — a second route to
         * one quantity, which is why it is checked against the first rather than trusted. It was the
         * last site still returning a distance while everything around it returned a time; had it
         * been left, the overlay would have labelled a weighted node with the slow wall's distance.
         *
         * Nodes the readout skips (no outgoing interior edge — the terminal ones) are skipped here
         * too; the assertion is that the two agree wherever both speak, and that they do speak.
         */
        for (const fixture of [WEIGHTED_RECTANGLE_FAST_FLOOR, WEIGHTED_CORRIDOR_FAST_CEILING,
            WEIGHTED_FAST_SHELF_L, WEIGHTED_SQUARE_ALTERNATING]) {
            const result = solveWeighted(fixture);
            const projected = computeNodeOffsets(result);
            const readout = computeNodeOffsetDistances(result.context!);
            let compared = 0;
            for (const [nodeId, time] of readout) {
                const expected = projected.get(nodeId);
                if (expected === undefined) {
                    continue;
                }
                expect({fixture: fixture.name, nodeId, off: Math.abs(time - expected) > EQUI_TIME_BAR})
                    .toEqual({fixture: fixture.name, nodeId, off: false});
                compared += 1;
            }
            expect({fixture: fixture.name, compared: compared > 0})
                .toEqual({fixture: fixture.name, compared: true});
        }
    });

    it('exterior nodes are at time zero and interior nodes are not', () => {
        // The table's other end: the boundary is `t = 0` by construction rather than by division, so
        // a weight can never move it. A fast wall would move it if it were a distance.
        const result = solveWeighted(WEIGHTED_RECTANGLE_FAST_FLOOR);
        const table = computeNodeOffsets(result);
        for (let nodeId = 0; nodeId < result.graph.numExteriorNodes; nodeId++) {
            expect(table.get(nodeId)).toBe(0);
        }
        expect(computeOffsetRings(result, 0)).toHaveLength(1);
    });

    it('§4.1 computeMaxOffset is 2/3 — the TIME the ridge forms at, not the distance to it', () => {
        const result = solveWeighted(WEIGHTED_RECTANGLE_FAST_FLOOR);
        // The fast floor covers `2 · 2/3 = 4/3` in that time and the slow top covers `2/3`; the
        // ridge sits at `y = 4/3`. A projection still in distance reports the 4/3.
        expect(computeMaxOffset(result)).toBeCloseTo(2 / 3, 12);
        expect(computeMaxOffset(solveSkeleton(WEIGHTED_RECTANGLE_FAST_FLOOR.vertices)))
            .toBeCloseTo(1, 12);
    });

    it('§4.1 the ring at a time sets the fast floor back twice as far as the slow walls', () => {
        const result = solveWeighted(WEIGHTED_RECTANGLE_FAST_FLOOR);
        const time = 1 / 3;
        const rings = computeOffsetRings(result, time);
        expect(rings).toHaveLength(1);

        // Bottom wavefront `y = 2t`, top `y = 2 − t`, sides `x = t` and `x = 4 − t`.
        const ys = rings[0].map(vertex => vertex.y);
        const xs = rings[0].map(vertex => vertex.x);
        expect(Math.min(...ys)).toBeCloseTo(2 * time, 12);
        expect(Math.max(...ys)).toBeCloseTo(2 - time, 12);
        expect(Math.min(...xs)).toBeCloseTo(time, 12);
        expect(Math.max(...xs)).toBeCloseTo(4 - time, 12);

        expect(Math.max(...ringSetbackErrors(result, time))).toBeLessThan(ANALYTIC_TOLERANCE);
    });

    it('§4.4 computeMaxOffset is 2/(R+1) at the near-maximum ratio', () => {
        const result = solveWeighted(WEIGHTED_SQUARE_NEAR_MAX_RATIO);
        const ratio = Math.max(...WEIGHTED_SQUARE_NEAR_MAX_RATIO.weights);
        expect(computeMaxOffset(result)).toBeCloseTo(2 / (ratio + 1), 12);
        // The distance the fast floor covers by then is `2R/(R+1)`, hard against the top wall — and
        // that is what a projection still measuring distance would have reported as the maximum.
        expect(computeMaxOffset(result) * ratio).toBeCloseTo(2 * ratio / (ratio + 1), 12);
    });

    it('§4.4 the ring at half the maximum time is at R/(R+1) from the floor and 1/(R+1) from the top', () => {
        const result = solveWeighted(WEIGHTED_SQUARE_NEAR_MAX_RATIO);
        const ratio = Math.max(...WEIGHTED_SQUARE_NEAR_MAX_RATIO.weights);
        const time = 1 / (ratio + 1);
        const rings = computeOffsetRings(result, time);
        expect(rings).toHaveLength(1);

        expect(Math.min(...rings[0].map(vertex => vertex.y))).toBeCloseTo(ratio * time, 10);
        expect(Math.max(...rings[0].map(vertex => vertex.y))).toBeCloseTo(2 - time, 10);
        expect(Math.max(...ringSetbackErrors(result, time))).toBeLessThan(1e-10);
    });

    it('every solving fixture rings at `w_e · t` on every edge, at three fractions of its maximum', () => {
        // The generalisation of the two above: no analytic ring is needed, because the claim is a
        // relation between the returned geometry, the segment's own edge and that edge's weight.
        for (const fixture of [
            WEIGHTED_RECTANGLE_FAST_FLOOR,
            WEIGHTED_CORRIDOR_FAST_CEILING,
            WEIGHTED_FAST_SHELF_L,
            WEIGHTED_SQUARE_ALTERNATING,
            WEIGHTED_PENTAGON_HOUSE,
            WEIGHTED_STEP,
        ]) {
            const result = solveWeighted(fixture);
            const maximum = computeMaxOffset(result);
            for (const fraction of [0.2, 0.5, 0.8]) {
                const errors = ringSetbackErrors(result, maximum * fraction);
                expect({fixture: fixture.name, fraction, empty: errors.length === 0})
                    .toEqual({fixture: fixture.name, fraction, empty: false});
                expect(Math.max(...errors)).toBeLessThan(EQUI_TIME_BAR);
            }
        }
    });

    it('the unweighted corpus projects to the same rings it always did', () => {
        // W40's other half: the division and the multiplication are both by exactly `1.0` here, so
        // the ring vertices must be bit-identical, not merely close.
        for (const fixture of FULL_CORPUS.slice(0, 8)) {
            const bare = solveSkeleton(fixture.vertices);
            const ones = solveSkeleton(fixture.vertices, {weights: fixture.vertices.map(() => 1)});
            const depth = computeMaxOffset(bare) * 0.4;
            expect(computeMaxOffset(ones)).toBe(computeMaxOffset(bare));
            expect(computeOffsetRings(ones, depth)).toEqual(computeOffsetRings(bare, depth));
        }
    });

    it('the strip depth is a time: one depth cuts `w_e · depth` on edge e (W41)', () => {
        // §4.1's rectangle. The strip on the fast floor is twice as deep as the strips on the slow
        // walls at one `depth`, which is the whole of what a weighted setback means.
        const result = solveWeighted(WEIGHTED_RECTANGLE_FAST_FLOOR);
        const depth = 1 / 4;
        const strips = computeStrips(result, {depth});
        expect(strips).toHaveLength(4);

        for (const strip of strips) {
            const edgeId = strip.supportingEdgeIds[0];
            expect(strip.supportingEdgeWeights).toEqual([result.weights[edgeId]]);
            const deepest = Math.max(...strip.boundary.map(
                point => faceDistance(result.graph, edgeId, point)));
            expect(deepest).toBeCloseTo(result.weights[edgeId] * depth, 12);
        }
    });
});
