import type {CausalityViolationDiagnostic, StraightSkeletonGraph} from './types';
import {angularResolution} from './constants';
import {distanceToSegment} from './planar-geometry';
import {clockwiseParentsOf, datingWallOf, distanceToWallLine} from './wall-time';
import type {WallReading} from './wall-time';

/*
 * ============================================================================
 *  THE SOLVER'S OWN CAUSALITY CHECK — journal-5 decision 148, register C9.
 * ============================================================================
 *
 * A solve can never report `complete: true` with empty diagnostics while violating wavefront
 * causality. `solveSkeleton` runs this check on every graph it returns and pushes one
 * `causality-violation` diagnostic per violation; `complete` keeps its meaning, and the diagnostic is
 * what carries the wrongness. It is ALWAYS ON — the contract, not an option — and it only READS the
 * graph.
 *
 * THE FOUR ORACLES (the fourth, `rate`, is C8 spec T18 — see {@link rateViolations}), each the definition `wavefront-causality.test.ts` states, reproduced exactly:
 *
 *  - OFFSET: an interior edge with a target is a violation when its target's derived TIME is earlier
 *    than its source's by more than the tolerance.
 *  - CLEARANCE: an interior node at derived time `t` is a violation when its distance to the nearest
 *    wall is less than `w_min · t` by more than the tolerance, `w_min` the slowest wall's weight: every
 *    point that near the boundary had been swept before `t`, so the node was placed where the wavefront
 *    had already passed. See "THE CLEARANCE BOUND" below for why it is the slowest wall's.
 *  - DIRECTION: an interior edge with a target, whose source-to-target travel is longer than the
 *    tolerance, is a violation when the unit travel vector's dot product with the edge's basis vector
 *    is not strictly positive.
 *  - RATE: an interior edge whose offset rate against its clockwise parent is negative, while its two
 *    parents are not anti-parallel at the angular resolution ρ(δ) (T18, T17's exact complement).
 *
 * A node's DERIVED ARRIVAL is re-derived from geometry, never read from the solver's bookkeeping:
 * boundary nodes are at 0; an interior node takes its first incident interior edge (in-edges, then
 * out-edges, first occurrence) and is dated at its perpendicular distance from the supporting line
 * of that edge's clockwise exterior parent, the line through that parent's own source and target nodes (skeleton
 * join-and-divide spec, decision 32, which also makes clearance the distance to every exterior edge's own segment,
 * so the check reads every loop of a holed graph), BESIDE THAT PARENT'S WEIGHT: the pair is an arrival in the
 * solver's own sense (W-spec W7), and its time is the distance over the weight (W5). A node with no
 * incident interior edge has no arrival and is skipped by both the offset and clearance oracles. This
 * is a deliberately separate copy from the test suites' `deriveNodeArrivals` — the test side is kept
 * as the independent conviction (decision 148(e)) — and does not read `computeNodeOffsets`, which
 * canonicalises and so could not see what it overwrote; the two share only the dating primitives of
 * `wall-time.ts`.
 *
 * EVERY COMPARISON IS OF TIMES, CROSS-MULTIPLIED (BSA.D309; W-spec W22, W26; `compareArrivals`). The check used
 * to compare a node's DISTANCE from one parent with its distance to the nearest wall, and so reported correct
 * weighted skeletons wherever the dating wall was faster than the nearest one (BSA.F101; the issue note
 * `ISSUE-skeleton-causality-check-ignores-weights.md`). Two arrivals `(d₁, w₁)` and `(d₂, w₂)` are compared as
 * `d₁ · w₂` against `d₂ · w₁`, and the tolerance, a length, is stated on the FASTER of the two walls,
 * `δ · min(w₁, w₂)`, as `compareArrivals` states its window (C8 spec T13): a gap is a violation when the faster
 * wall advances more than δ in it. Each magnitude is the cross-multiplied gap over `min(w₁, w₂)`, a unit-space
 * length on that wall. In the detail strings an "offset" is a TIME (W5), `distance / weight`.
 *
 * THE CLEARANCE BOUND IS THE SLOWEST WALL'S, NOT EACH WALL'S OWN. Every front moves inward at a normal speed of
 * at least `w_min`, and a mitered offset by at least `h` lies inside the erosion by a disc of radius `h`, at a
 * convex corner (an intersection of half-planes) and a reflex one (a union) alike; erosions compose, so the region
 * the wavefront leaves at time `t` lies inside the erosion by `w_min · t`, and a node of a correct skeleton is at
 * least that far from every wall. The stronger reading, at least `w · t` from each wall of weight `w`, is FALSE on
 * correct skeletons: a fast wall's face can close before its front gets near a node it would have reached
 * unobstructed (`Weighted L`'s node 8 lies 1.41 from the end of its weight-4 shelf at time 1). Measured on the
 * random weighted solves that pass the equal-time and time-order checks, that reading reported 1,164 of 1,331;
 * this one reports none (the issue note `ISSUE-skeleton-causality-check-ignores-weights.md`).
 *
 * AT UNIT WEIGHTS EVERY ONE OF THESE IS TODAY'S ARITHMETIC, OPERATION FOR OPERATION: every product and quotient
 * by a weight is by `1.0`, which is exact, `w_min` is `1`, and clearance is still against the nearest wall. There
 * is no branch on unit weights.
 * A weight the graph's table does not hold (a graph whose ids it does not index, such as the merged path's, which
 * `solveSkeleton` never hands this check) is read as `1`, so such a graph reads as it did, not as a silent NaN.
 *
 * THE TOLERANCE IS DERIVED, NOT LITERAL (decision 144): it is the solve's PERCEPTUAL FLOOR, a
 * unit-space length — "visibly the same" is the question each oracle asks of the difference it
 * measures. Every length is carried into unit space before it is compared, by the power-of-two
 * `toUnitScale`, which is exact. The test oracles use a literal `1e-6` in CALLER units; the two agree
 * only where that difference changes no verdict, and the suites pin both counts.
 */

/** Every node's derived arrival: its distance from its dating wall's line, in the graph's units, and that wall's weight. */
function deriveArrivals(graph: StraightSkeletonGraph): Map<number, WallReading> {
    const clockwiseParents = clockwiseParentsOf(graph);

    const arrivalOf = new Map<number, WallReading>();
    for (let i = 0; i < graph.numExteriorNodes; i++) {
        // At time 0 on the wall leaving it: any positive weight dates it at 0.
        arrivalOf.set(i, {distance: 0, weight: graph.exteriorWeights[i] ?? 1});
    }
    for (let i = graph.numExteriorNodes; i < graph.nodes.length; i++) {
        const node = graph.nodes[i];
        const parent = datingWallOf(node, clockwiseParents);
        if (parent === undefined) continue;
        arrivalOf.set(i, {
            distance: distanceToWallLine(graph, node.position, parent),
            weight: graph.exteriorWeights[parent] ?? 1,
        });
    }
    return arrivalOf;
}

function violation(
    oracle: CausalityViolationDiagnostic['oracle'],
    elementId: number,
    magnitude: number,
    detail: string,
): CausalityViolationDiagnostic {
    return {kind: 'causality-violation', oracle, elementId, magnitude, detail};
}

/**
 * Run the four causality oracles over a solved graph and return one diagnostic per violation.
 *
 * `perceptualFloor` is the solve's floor, in UNIT space. `toUnitScale` carries the graph's lengths
 * into unit space: `normalisation.toUnitScale` for a graph already returned to caller space, `1` for
 * a graph still in unit space. Every magnitude reported is in unit space.
 *
 * Diagnostics are ordered by oracle — offset, clearance, direction, rate — and by id within each.
 */
export function checkWavefrontCausality(
    graph: StraightSkeletonGraph,
    perceptualFloor: number,
    toUnitScale: number,
): CausalityViolationDiagnostic[] {
    // THE DERIVED TOLERANCE (decision 144): the perceptual floor, a unit-space length. Every
    // quantity below is multiplied into unit space by `toUnitScale` before it meets this bar.
    const tolerance = perceptualFloor;
    const arrivalOf = deriveArrivals(graph);

    const offsetViolations: CausalityViolationDiagnostic[] = [];
    const directionViolations: CausalityViolationDiagnostic[] = [];
    for (const interiorEdge of graph.interiorEdges) {
        const edge = graph.edges[interiorEdge.id];
        if (!edge || edge.target === undefined) continue;

        const sourceArrival = arrivalOf.get(edge.source);
        const targetArrival = arrivalOf.get(edge.target);
        if (sourceArrival !== undefined && targetArrival !== undefined) {
            const unitSource = sourceArrival.distance * toUnitScale;
            const unitTarget = targetArrival.distance * toUnitScale;
            // The target's time against the source's, cross-multiplied, at the floor of the faster wall.
            const source = unitSource * targetArrival.weight;
            const target = unitTarget * sourceArrival.weight;
            const faster = Math.min(sourceArrival.weight, targetArrival.weight);
            if (target < source - tolerance * faster) {
                offsetViolations.push(violation('offset', interiorEdge.id, (source - target) / faster,
                    `Interior edge ${interiorEdge.id} runs backwards in time: node ${edge.source} at offset `
                    + `${unitSource / sourceArrival.weight} -> node ${edge.target} at offset `
                    + `${unitTarget / targetArrival.weight} (unit space), beyond the ${tolerance} perceptual floor.`));
            }
        }

        const source = graph.nodes[edge.source];
        const target = graph.nodes[edge.target];
        if (!source || !target) continue;
        const travel = {x: target.position.x - source.position.x, y: target.position.y - source.position.y};
        const length = Math.hypot(travel.x, travel.y);
        // A travel no longer than the floor has no direction to disagree with; the offset and
        // clearance oracles own that degeneracy.
        if (length * toUnitScale <= tolerance) continue;
        const dot = (travel.x / length) * edge.basisVector.x + (travel.y / length) * edge.basisVector.y;
        if (dot > 0) continue;
        const behind = -dot * length * toUnitScale;
        directionViolations.push(violation('direction', interiorEdge.id, behind,
            `Interior edge ${interiorEdge.id} terminates behind its own source: node ${edge.source} -> `
            + `node ${edge.target} runs against its basis (${edge.basisVector.x}, ${edge.basisVector.y}), `
            + `dot ${dot}, ${behind} behind the source along the basis (unit space).`));
    }

    const clearanceViolations: CausalityViolationDiagnostic[] = [];
    // THE BOUNDARY IS EVERY EXTERIOR EDGE'S OWN SEGMENT (decision 32), so clearance is the distance to the nearest
    // wall of any loop, as a holed region needs. On one loop these are the ring's segments, in the ring's order.
    const walls = graph.edges.slice(0, graph.numExteriorNodes)
        .map(edge => [graph.nodes[edge.source].position, graph.nodes[edge.target!].position] as const);
    // THE SLOWEST WALL'S WEIGHT (see "THE CLEARANCE BOUND" in the header): by time `t` every point nearer the
    // boundary than `w_min · t` has been swept. `1` on every graph `solveSkeleton` returns, whose weights it
    // divides by the smallest; read here so that a graph given unnormalised weights is read the same way.
    const slowest = Math.min(...Array.from({length: graph.numExteriorNodes}, (_unused, k) => graph.exteriorWeights[k] ?? 1));
    for (let i = graph.numExteriorNodes; i < graph.nodes.length; i++) {
        const arrival = arrivalOf.get(i);
        if (arrival === undefined) continue;
        let clearance = Infinity;
        for (const [from, to] of walls) {
            clearance = Math.min(clearance, distanceToSegment(graph.nodes[i].position, from, to));
        }
        const unitOffset = arrival.distance * toUnitScale;
        const unitClearance = clearance * toUnitScale;
        // The node's time against the time the slowest front takes to cover its clearance, cross-multiplied.
        const reached = unitOffset * slowest;
        const standing = unitClearance * arrival.weight;
        const faster = Math.min(arrival.weight, slowest);
        if (reached > standing + tolerance * faster) {
            clearanceViolations.push(violation('clearance', i, (reached - standing) / faster,
                `Node ${i} is dated at offset ${unitOffset / arrival.weight} but lies only ${unitClearance / slowest} `
                + `from the boundary (unit space): placed where the wavefront had already passed, beyond the `
                + `${tolerance} perceptual floor.`));
        }
    }

    return [...offsetViolations, ...clearanceViolations, ...directionViolations,
        ...rateViolations(graph, perceptualFloor)];
}

/**
 * THE FOURTH ORACLE, `rate` (C8 spec T18; journal decisions 149(b), 153(a)): the zero-rate question
 * asked AFTERWARDS. A bisector violates when its offset rate against its clockwise parent,
 * `cross(basis, clockwiseParent.basis)`, is NEGATIVE — every unit of travel along it moves the wavefront
 * clock backwards — AND its two parents are NOT anti-parallel at the angular resolution ρ(δ).
 *
 * THE EXACT COMPLEMENT OF T17'S PREDICATE, stated on the parents and not on the rate. `addBisectionEdge`
 * gives a bisector whose parents are anti-parallel at ρ — `directionsAreSame(cw, −ws, ρ)` — its
 * direction from the parent ordering, and there its rate may come out a few parts in 1e6 negative: that
 * is the resolution speaking, not a violation. A bar on the rate itself would be a different number (a
 * rate is about sin φ / 2 of the parents' deviation φ), and a u-bar would count bisectors whose walls
 * spec A11's partition calls parallel — one question at two bars (decision 144).
 *
 * Read from the graph alone: the bases are unit vectors and direction is scale-free, so no length
 * crosses the normalisation seam here. The predicate is re-stated locally rather than imported from
 * `core-functions.ts`, as the other three oracles re-state theirs.
 */
function rateViolations(graph: StraightSkeletonGraph, perceptualFloor: number): CausalityViolationDiagnostic[] {
    const resolution = angularResolution(perceptualFloor);
    const found: CausalityViolationDiagnostic[] = [];
    for (const interiorEdge of graph.interiorEdges) {
        const edge = graph.edges[interiorEdge.id];
        const clockwise = graph.edges[interiorEdge.clockwiseExteriorEdgeIndex]?.basisVector;
        const widdershins = graph.edges[interiorEdge.widdershinsExteriorEdgeIndex]?.basisVector;
        if (!edge || !clockwise || !widdershins) continue;
        const rate = edge.basisVector.x * clockwise.y - clockwise.x * edge.basisVector.y;
        if (!(rate < 0)) continue;
        // Anti-parallel at ρ: `cw` and `−ws` point the same way — exact sign, then the sine bar.
        const againstX = -widdershins.x;
        const againstY = -widdershins.y;
        const sameWay = clockwise.x * againstX + clockwise.y * againstY > 0;
        const sine = Math.abs(clockwise.x * againstY - againstX * clockwise.y);
        const antiParallel = sameWay
            && sine < resolution * Math.hypot(clockwise.x, clockwise.y) * Math.hypot(againstX, againstY);
        if (antiParallel) continue;
        found.push(violation('rate', interiorEdge.id, -rate,
            `Interior edge ${interiorEdge.id} advances at offset rate ${rate} against its clockwise parent `
            + `${interiorEdge.clockwiseExteriorEdgeIndex}, whose walls are not anti-parallel at the `
            + `${resolution} angular resolution: it runs backwards through the wavefront.`));
    }
    return found;
}
