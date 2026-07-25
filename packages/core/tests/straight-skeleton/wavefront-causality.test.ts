import {
    ALL_TEST_POLYGONS,
    PREMATURE_BISECTOR_SPLIT_FAILS,
    PREMATURE_BISECTOR_SPLIT_PASSES,
} from '@proc-geo/test-fixtures';
import {runAlgorithmV5, Vector2} from '@proc-geo/core';

/**
 * Causal consistency of the wavefront.
 *
 * The straight skeleton is the trace of a wavefront that moves inward from the
 * boundary at unit speed. Every skeleton node is an *event*: the moment two
 * wavefront elements meet. Its offset distance is the time that happened.
 *
 * A skeleton edge is the path a single wavefront vertex travels between two
 * events, so time must not run backwards along it: the event at the far end
 * cannot be earlier than the event that produced it. A decreasing offset means
 * the solver has claimed an event was caused by something that had not happened
 * yet, which is impossible regardless of how the solver is implemented.
 *
 * Why this is not a tautology, and not fiat:
 *
 *  - The offsets used here are *not* the solver's own bookkeeping. They are
 *    re-derived from raw geometry: the perpendicular distance from the node to
 *    the supporting line of one of the original polygon edges that defines it.
 *    Nothing the solver recorded about timing is trusted.
 *  - No expected coordinates, node counts or reference outputs appear anywhere.
 *    The assertion is a physical law about wavefront propagation, so it applies
 *    to any polygon and any correct implementation.
 *  - It is a genuine discriminator rather than a restatement of the fix. Several
 *    weaker invariants were tried against the fixture pair below and did *not*
 *    separate them: both outputs are planar, both keep every bisector exactly
 *    equidistant from its two parent edges, both have every node at or inside
 *    its clearance from the boundary, and in both the skeleton faces tile the
 *    polygon with zero area mismatch. The bad output is locally impeccable. Only
 *    its ordering in time is wrong.
 */

const TOLERANCE = 1e-6;

/** Perpendicular distance from p to the infinite line through a and b. */
function distanceToSupportingLine(p: Vector2, a: Vector2, b: Vector2): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / length;
}

interface OffsetViolation {
    interiorEdgeId: number;
    sourceNode: number;
    targetNode: number;
    sourceOffset: number;
    targetOffset: number;
}

/**
 * Re-derive each node's offset from geometry alone, then check that no skeleton
 * edge travels backwards in time.
 */
function findOffsetViolations(vertices: Vector2[]): OffsetViolation[] {
    const context = runAlgorithmV5(vertices);
    const {graph} = context;
    const edgeCount = vertices.length;

    // Which original polygon edges define each interior edge. The solver records
    // this; the *positions* it produced are what we are auditing.
    const parentEdges = new Map<number, number>();
    for (const interiorEdge of graph.interiorEdges) {
        parentEdges.set(interiorEdge.id, interiorEdge.clockwiseExteriorEdgeIndex);
    }

    // Offset of a node = its distance from a defining edge's supporting line.
    // Boundary nodes sit on the boundary, so their offset is zero.
    const offsetOf = new Map<number, number>();
    for (let i = 0; i < graph.numExteriorNodes; i++) {
        offsetOf.set(i, 0);
    }
    for (let i = graph.numExteriorNodes; i < graph.nodes.length; i++) {
        const node = graph.nodes[i];
        const incident = [...new Set([...node.inEdges, ...node.outEdges])]
            .filter(id => parentEdges.has(id));
        if (incident.length === 0) continue;
        const parent = parentEdges.get(incident[0])!;
        offsetOf.set(
            i,
            distanceToSupportingLine(node.position, vertices[parent], vertices[(parent + 1) % edgeCount]),
        );
    }

    const violations: OffsetViolation[] = [];
    for (const interiorEdge of graph.interiorEdges) {
        const edge = graph.edges[interiorEdge.id];
        if (!edge || edge.target === undefined) continue;
        const sourceOffset = offsetOf.get(edge.source);
        const targetOffset = offsetOf.get(edge.target);
        if (sourceOffset === undefined || targetOffset === undefined) continue;
        if (targetOffset < sourceOffset - TOLERANCE) {
            violations.push({
                interiorEdgeId: interiorEdge.id,
                sourceNode: edge.source,
                targetNode: edge.target,
                sourceOffset,
                targetOffset,
            });
        }
    }
    return violations;
}

/** Euclidean distance from p to the segment ab. */
function distanceToSegment(p: Vector2, a: Vector2, b: Vector2): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;
    const raw = lengthSquared === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared;
    const t = Math.max(0, Math.min(1, raw));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * A second, independent invariant: no node may outrun its own clearance.
 *
 * The mitered wavefront always covers at least as much ground as an eroding disc
 * of the same radius, so a point still unswept at time t is at least t away from
 * the boundary. A node whose offset exceeds its distance to the boundary has been
 * placed somewhere the wavefront had already passed.
 *
 * This is complementary to the causality check rather than a stronger form of it:
 * each catches a defect the other misses.
 */
function findClearanceViolations(vertices: Vector2[]): string[] {
    const context = runAlgorithmV5(vertices);
    const {graph} = context;
    const edgeCount = vertices.length;

    const parentEdges = new Map<number, number>();
    for (const interiorEdge of graph.interiorEdges) {
        parentEdges.set(interiorEdge.id, interiorEdge.clockwiseExteriorEdgeIndex);
    }

    const violations: string[] = [];
    for (let i = graph.numExteriorNodes; i < graph.nodes.length; i++) {
        const node = graph.nodes[i];
        const incident = [...new Set([...node.inEdges, ...node.outEdges])]
            .filter(id => parentEdges.has(id));
        if (incident.length === 0) continue;
        const parent = parentEdges.get(incident[0])!;
        const offset = distanceToSupportingLine(
            node.position, vertices[parent], vertices[(parent + 1) % edgeCount]);

        let clearance = Infinity;
        for (let k = 0; k < edgeCount; k++) {
            clearance = Math.min(
                clearance,
                distanceToSegment(node.position, vertices[k], vertices[(k + 1) % edgeCount]));
        }
        if (offset > clearance + TOLERANCE) {
            violations.push(
                `node ${i} has offset ${offset.toFixed(3)} but is only ` +
                `${clearance.toFixed(3)} from the boundary (overshoot ` +
                `${(offset - clearance).toFixed(3)})`);
        }
    }
    return violations;
}

function describeViolations(violations: OffsetViolation[]): string {
    return violations
        .map(v =>
            `interior edge ${v.interiorEdgeId}: node ${v.sourceNode} at offset ` +
            `${v.sourceOffset.toFixed(3)} -> node ${v.targetNode} at offset ` +
            `${v.targetOffset.toFixed(3)} (time runs backwards by ` +
            `${(v.sourceOffset - v.targetOffset).toFixed(3)})`)
        .join('; ');
}

describe('wavefront causality', () => {
    describe('premature-bisector split fixture pair', () => {
        // These two polygons differ at a single vertex by about (1.05, 0.53).
        // Before the fix, the first produced a skeleton edge running from offset
        // 71.64 to offset 62.70 while the second was clean — a phase transition
        // in the output from a sub-pixel change in the input.
        it('holds for the variant that exposed the false split', () => {
            const violations = findOffsetViolations(PREMATURE_BISECTOR_SPLIT_FAILS);
            expect(describeViolations(violations)).toBe('');
        });

        it('holds for the adjusted variant', () => {
            const violations = findOffsetViolations(PREMATURE_BISECTOR_SPLIT_PASSES);
            expect(describeViolations(violations)).toBe('');
        });

        it('produces consistent topology across the perturbation', () => {
            const failing = runAlgorithmV5(PREMATURE_BISECTOR_SPLIT_FAILS).graph;
            const passing = runAlgorithmV5(PREMATURE_BISECTOR_SPLIT_PASSES).graph;
            // A sub-pixel change to one vertex must not change the combinatorial
            // size of the skeleton.
            expect(failing.nodes.length).toBe(passing.nodes.length);
            expect(failing.interiorEdges.length).toBe(passing.interiorEdges.length);
        });
    });

    describe.each(ALL_TEST_POLYGONS)('$name', ({vertices}) => {
        it('never runs backwards in time along a skeleton edge', () => {
            const violations = findOffsetViolations(vertices);
            expect(describeViolations(violations)).toBe('');
        });

        it('never places a node beyond its own clearance', () => {
            expect(findClearanceViolations(vertices).join('; ')).toBe('');
        });
    });
});
