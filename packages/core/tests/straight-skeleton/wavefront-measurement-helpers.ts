import {
    computeMaxOffset,
    computeNodeOffsets,
    computeOffsetRings,
    projectOffsetWavefront,
    SkeletonSolveResult,
    Vector2,
} from '@proc-geo/core';

/*
 * ============================================================================
 *  THE MEASUREMENTS AN OFFSET SUITE TAKES, DEFINED ONCE.
 * ============================================================================
 *
 * `offset-event-boundary-regression.test.ts` asserts that the projection survives an
 * event over `ALL_TEST_POLYGONS`, and `near-regular-ring-loss-diagnosis.test.ts` asserts
 * the same of the four held-out fixtures whose simultaneous mirror events used to defeat
 * it. Both have to ask the same questions of a solve — *where are its events*, *how much
 * area does the wavefront enclose there*, *is that area continuous through the event*, and
 * *does the unclosed-chain report still fire when a hand-over is broken by hand* — and the
 * second suite's measurements are only comparable with the first suite's guarantee if the
 * questions are the same question.
 *
 * These are formulae rather than loop shapes. `eventOffsets` decides which node offsets
 * count as an event (strictly positive, no greater than the maximum, deduplicated on the
 * bit and never within a tolerance), and `signedRingArea` subtracts the first vertex
 * before accumulating so the value does not depend on where in the plane the ring sits. A
 * copy that drifted on either point would silently re-aim one suite at a different
 * population.
 *
 * That applies to the sweeps as much as to the quantities they take, so the whole mutation
 * report — `measureMutationReport`, the band of events it considers mutable, the
 * displacement it breaks a hand-over with, and its verdict of reported-or-harmless — lives
 * here as one function that both suites call with their own fixtures and pin their own
 * counts against. The "no two entries within one instant" check is here for the same
 * reason, as `ulpSeparatedPairs`: three suites make it, of three different populations, and
 * its edge behaviour at exactly one band's separation has to be one decision.
 *
 * `distanceToSegment` and `distanceToSupportingLine` live here for the same reason. They are
 * the two distances every offset suite states its properties in — how far a wavefront vertex
 * is from the boundary, and how far a node is from the line of the edge that dates it — and
 * `offset-projection.test.ts` and `wavefront-causality.test.ts` had a copy each. They are
 * pure point-to-line geometry that reads nothing the solver produced, so sharing them costs
 * the causality suite none of the independence from production that it depends on: what that
 * suite must not borrow is `offset-projection.ts`'s *derivation of a node's offset*, which
 * stays re-derived there.
 *
 * This file is deliberately NOT named `*.test.ts`: `jest.config.cjs` matches
 * `tests/**\/*.test.ts`, so a helper module beside the suites is not collected as an
 * empty suite.
 */

/** Shoelace with the first vertex subtracted, so the value does not depend on where the ring sits. */
export function signedRingArea(ring: Vector2[]): number {
    const origin = ring[0];
    let total = 0;
    for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        total += (a.x - origin.x) * (b.y - origin.y) - (b.x - origin.x) * (a.y - origin.y);
    }
    return total / 2;
}

/** The area a whole projection encloses, rings counted regardless of their winding. */
export function totalRingArea(rings: Vector2[][]): number {
    return rings.reduce((sum, ring) => sum + Math.abs(signedRingArea(ring)), 0);
}

/** Euclidean distance from p to the segment ab. */
export function distanceToSegment(p: Vector2, a: Vector2, b: Vector2): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;
    const raw = lengthSquared === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared;
    const t = Math.max(0, Math.min(1, raw));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * Perpendicular distance from p to the infinite line through a and b.
 *
 * An edge of no length has no supporting line to be perpendicular to, and the distance to it is the
 * distance to the point — the same fallback `offset-projection.ts`'s own copy takes. Without it the
 * quotient is 0/0, and a NaN distance compares false against every threshold, so a suite asserting
 * `drift > band` would silently pass rather than report the degeneracy.
 */
export function distanceToSupportingLine(p: Vector2, a: Vector2, b: Vector2): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    if (length === 0) {
        return Math.hypot(p.x - a.x, p.y - a.y);
    }
    return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / length;
}

/**
 * Every number a node's own parent edges date it to, re-derived here from raw geometry.
 *
 * A node is defined by the exterior edges its incident bisectors run between, and the offset of the
 * instant it belongs to is its perpendicular distance to the supporting line of any one of them.
 * They are one distance in exact arithmetic and several distinct doubles in this one, which is the
 * mechanism `computeNodeOffsets` canonicalises away.
 *
 * This is the suites' OWN derivation, deliberately not the projection's. A suite asserting that the
 * canonical table still agrees with the geometry, or that the raw numbers disagree with each other
 * at all, cannot take either quantity from the module under test — reading the table back would not
 * distinguish "canonicalisation preserved the geometry" from "canonicalisation overwrote it".
 */
export function rawOffsetsOfNode(result: SkeletonSolveResult, nodeId: number): number[] {
    const {graph} = result;
    const node = graph.nodes[nodeId];
    const incident = new Set([...node.inEdges, ...node.outEdges]);

    const parentEdgeIds = new Set<number>();
    for (const interiorEdge of graph.interiorEdges) {
        if (incident.has(interiorEdge.id)) {
            parentEdgeIds.add(interiorEdge.clockwiseExteriorEdgeIndex);
            parentEdgeIds.add(interiorEdge.widdershinsExteriorEdgeIndex);
        }
    }

    const distances: number[] = [];
    for (const parentEdgeId of parentEdgeIds) {
        distances.push(distanceToSupportingLine(
            node.position,
            graph.nodes[parentEdgeId].position,
            graph.nodes[(parentEdgeId + 1) % graph.numExteriorNodes].position,
        ));
    }
    return distances;
}

/**
 * How close to the maximum offset a ring stops having distinguishable vertices.
 *
 * Within this band of the maximum, the surviving ring is finer than the coordinate-equality
 * tolerance the projection works to, so its vertices are indistinguishable and `makeRing` drops it:
 * an empty projection there is the documented answer rather than a loss. Every suite that samples at
 * an event has to steer around the same band, and a copy that widened it in one suite alone would
 * quietly stop asserting over that suite's last events.
 */
export const TERMINAL_BAND = 1e-6;

/**
 * How far apart two re-derived offsets of one simultaneous event may lie, as a fraction of the
 * solve's own maximum offset. Femtometres, not slack: nothing in the projection compares against
 * this, and the suites only ever measure with it.
 *
 * RELATIVE, BECAUSE THE GUARANTEE IT RESTATES IS. `computeNodeOffsets` partitions against this
 * fraction of the solve's maximum offset, so an absolute band states a different guarantee at every
 * magnitude — and on fixtures whose maximum offsets run from 1e-3 to 1e8 an absolute figure asks for
 * a different multiple of what production delivers at each of them.
 *
 * It is stated here rather than imported: production's `SIMULTANEITY_RELATIVE_TOLERANCE` is module
 * private, and a suite reading the constant under test could not tell a changed tolerance from a
 * satisfied guarantee.
 */
export const SIMULTANEITY_RELATIVE_BAND = 1e-12;

/**
 * The pairs of offsets that sit closer together than one instant is wide, as lines to report.
 *
 * Two entries within `tolerance` of one another are one instant recorded twice — exactly what
 * canonicalisation removes — so this is the "no two entries within one instant" check itself, stated
 * once for every suite that makes it of a different population. The input is deduplicated and sorted
 * here rather than assumed ordered, because adjacency in VALUE is what the check is about.
 */
export function ulpSeparatedPairs(offsets: number[], tolerance: number): string[] {
    const ascending = [...new Set(offsets)].sort((a, b) => a - b);
    const found: string[] = [];
    for (let i = 1; i < ascending.length; i++) {
        if (ascending[i] - ascending[i - 1] <= tolerance) {
            found.push(`${ascending[i - 1]} and ${ascending[i]} are one instant, two entries`);
        }
    }
    return found;
}

/** The distinct offsets at which the wavefront has an event: the interior nodes' own offsets. */
export function eventOffsets(result: SkeletonSolveResult): number[] {
    const maxOffset = computeMaxOffset(result);
    const interior = [...computeNodeOffsets(result).values()].filter(offset => offset > 0 && offset <= maxOffset);
    return [...new Set(interior)].sort((a, b) => a - b);
}

/**
 * Is the ring area at an event ordered between the areas a micrometre either side of it?
 *
 * The wavefront only ever shrinks, so the three readings must come out in that order. An event
 * that loses ring area comes out below both neighbours and fails; one that gains comes out above
 * both. The slack covers the genuine micrometre of shrinkage between the samples, nothing more.
 */
export function isContinuous(before: number, at: number, after: number): boolean {
    const slack = Math.max(1e-9, before * 1e-6);
    return at <= before + slack && at >= after - slack;
}

/**
 * How far a mutated node's own event is pushed away from where the rest of the solve puts it.
 *
 * A micrometre is not a tolerance and nothing compares against it: it is a displacement chosen to
 * be enormous next to the femtometres the hand-over actually turns on, so that a report which
 * fails to fire has failed for a reason other than the perturbation being too small to see. It is
 * also six orders of magnitude clear of the relative band `computeNodeOffsets` canonicalises
 * within, so the mutated node leaves its own simultaneous set rather than being absorbed back into
 * it.
 */
const MUTATION_DISPLACEMENT = 1e-6;

/** A copy of `result` with one node displaced, and nothing else about the solve touched. */
function withNodeMoved(result: SkeletonSolveResult, nodeId: number, displacement: Vector2): SkeletonSolveResult {
    const nodes = result.graph.nodes.map((node, index) => index === nodeId
        ? {...node, position: {x: node.position.x + displacement.x, y: node.position.y + displacement.y}}
        : node);
    return {...result, graph: {...result.graph, nodes}};
}

/**
 * A copy of `result` in which one node's re-derived offset is later than the solve put it, so the
 * hand-over there no longer happens at the offset every other node dates it to.
 *
 * The bisectors dying at that node stay alive past the instant they meet, and the bisector born
 * there is not yet alive when they do — which is precisely the broken hand-over the unclosed-chain
 * report exists to catch, and precisely what `collectAliveBisectors` reading one table for both
 * ends otherwise makes impossible.
 *
 * The displacement direction is chosen by measurement rather than by re-deriving which parent edge
 * `computeNodeOffsets` reads this node against: the four axis displacements are tried and the one
 * that dates the node latest is kept. Restating that parent-edge choice here would be a second
 * route to a quantity the projection module owns, which is the fault the suites this serves exist
 * to record.
 */
function withNodeOffsetDelayed(result: SkeletonSolveResult, nodeId: number, by: number): SkeletonSolveResult {
    const step = by * 2;
    const displacements: Vector2[] = [{x: step, y: 0}, {x: -step, y: 0}, {x: 0, y: step}, {x: 0, y: -step}];

    let latest = result;
    let latestOffset = -Infinity;
    for (const displacement of displacements) {
        const moved = withNodeMoved(result, nodeId, displacement);
        const offset = computeNodeOffsets(moved).get(nodeId);
        if (offset !== undefined && offset > latestOffset) {
            latestOffset = offset;
            latest = moved;
        }
    }
    return latest;
}

/** One solve a sweep measures over, with the name any problem found in it is reported against. */
export interface SolvedFixture {
    name: string;
    result: SkeletonSolveResult;
}

/** What one sweep of the mutation report measured over a list of solves. */
export interface MutationReportMeasurement {
    /** A line per mutation that cost ring area with nothing reported. Empty is the requirement. */
    silentLosses: string[];
    /** How many of the mutations the unclosed-chain report fired on. */
    fired: number;
    /** How many clean mid-solve events were mutated at all — the sweep's own non-vacuity. */
    mutated: number;
}

/**
 * Break every clean hand-over in turn, and record whether the projection reported it or absorbed it.
 *
 * A sweep asserting that `unclosedChains` is always empty is only worth something if the report can
 * still be non-empty: a suppressed report — or a projection that quietly returned whatever rings it
 * could assemble — would satisfy it just as well as a fix does. So the report is convicted by
 * mutation. Take an event the projection handles cleanly, push the offset of the node whose event it
 * is a micrometre later, and query the ORIGINAL offset again: the bisectors meeting at that node are
 * now alive past their own meeting point and the bisector born there is not alive yet, so the
 * hand-over `collectAliveBisectors` guarantees by reading one table for both ends has been broken
 * from outside.
 *
 * Every such mutation must be either REPORTED or HARMLESS. Silently returning fewer or smaller rings
 * is the outcome the whole module exists to prevent, and it is the one `silentLosses` records.
 * Harmlessness is judged with {@link isContinuous} on a reading bracketed by itself — the same slack
 * the area sweeps are made on rather than a second one.
 *
 * This is a formula, not a loop shape, and both offset suites run it over their own corpus: which
 * events count as mutable ({@link TERMINAL_BAND}), how far the node is pushed
 * ({@link MUTATION_DISPLACEMENT}) and what counts as a silent loss are the measurement itself, and a
 * copy that drifted on any of them would aim one suite at a different population while both went on
 * pinning counts as though they were comparable. Each caller supplies only its own fixtures and
 * asserts its own pinned counts.
 */
export function measureMutationReport(fixtures: SolvedFixture[]): MutationReportMeasurement {
    const silentLosses: string[] = [];
    let fired = 0;
    let mutated = 0;

    for (const {name, result} of fixtures) {
        const maxOffset = computeMaxOffset(result);
        for (const [nodeId, event] of computeNodeOffsets(result)) {
            if (!(event > 0) || maxOffset - event <= TERMINAL_BAND) {
                continue;
            }
            const before = projectOffsetWavefront(result, event);
            if (before.unclosedChains.length > 0 || before.rings.length === 0) {
                continue;
            }
            mutated += 1;

            const broken = withNodeOffsetDelayed(result, nodeId, MUTATION_DISPLACEMENT);
            if (projectOffsetWavefront(broken, event).unclosedChains.length > 0) {
                fired += 1;
                continue;
            }

            const area = totalRingArea(computeOffsetRings(result, event));
            const afterArea = totalRingArea(computeOffsetRings(broken, event));
            if (!isContinuous(area, afterArea, area)) {
                silentLosses.push(
                    `${name} @${event.toFixed(6)} n${nodeId}: ${area} -> ${afterArea} with nothing reported`);
            }
        }
    }

    return {silentLosses, fired, mutated};
}
