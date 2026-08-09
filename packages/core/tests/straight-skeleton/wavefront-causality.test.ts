import {
    ALL_TEST_POLYGONS,
    NEAR_REGULAR_CIRCLE_16,
    NEAR_REGULAR_CIRCLE_32,
    NEAR_REGULAR_CIRCLE_48,
    NEAR_REGULAR_ELLIPSE_16,
    NEAR_REGULAR_ELLIPSE_32,
    NEAR_REGULAR_PEANUT_32,
    NEAR_REGULAR_ROSETTE5_40,
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

interface DirectionViolation {
    interiorEdgeId: number;
    sourceNode: number;
    targetNode: number;
    sourcePosition: Vector2;
    targetPosition: Vector2;
    basisVector: Vector2;
    dot: number;
}

/**
 * A third invariant, and the strictest of the three about direction: an interior edge must
 * end somewhere *ahead of* its own source, along its own basis vector.
 *
 * Every interior edge is a bisector ray. Its basis vector is not decoration — it is the
 * direction the wavefront vertex actually travels, fixed at the edge's birth by the two
 * original polygon edges that define it. Whatever node the solver eventually gives that
 * edge as a `target`, the vertex has to have reached it by walking forwards along that ray.
 * A target sitting behind the source means the solver wired the edge to a point the moving
 * vertex never visits, and the drawn segment runs the opposite way to the motion it claims
 * to depict.
 *
 * Why this is not subsumed by the offset check above. The offset check compares *when* the
 * two endpoint events happened; this one compares *where* they are relative to the direction
 * of travel. Those come apart. On `NEAR_REGULAR_PEANUT_32` the anti-parallel neck pair ran
 * from offset 94.35 to offset 98.60 — forward in time, and therefore invisible to the offset
 * check — while pointing (+1, 0) and terminating 36 units to the *left* of their own source.
 * Only a directional test separates that case.
 *
 * Derived from raw geometry: the source and target positions come from the graph's nodes and
 * the basis vector from the edge itself, so nothing about the solver's timing bookkeeping is
 * trusted.
 */
function findDirectionViolations(vertices: Vector2[]): DirectionViolation[] {
    const context = runAlgorithmV5(vertices);
    const {graph} = context;

    const violations: DirectionViolation[] = [];
    for (const interiorEdge of graph.interiorEdges) {
        const edge = graph.edges[interiorEdge.id];
        if (!edge || edge.target === undefined) continue;

        const source = graph.nodes[edge.source];
        const target = graph.nodes[edge.target];
        if (!source || !target) continue;

        const travel = {x: target.position.x - source.position.x, y: target.position.y - source.position.y};
        const length = Math.hypot(travel.x, travel.y);
        // A zero-length edge has no direction to disagree with; the offset and clearance
        // checks own that degeneracy.
        if (length <= TOLERANCE) continue;

        const dot = (travel.x / length) * edge.basisVector.x + (travel.y / length) * edge.basisVector.y;
        if (dot > 0) continue;

        violations.push({
            interiorEdgeId: interiorEdge.id,
            sourceNode: edge.source,
            targetNode: edge.target,
            sourcePosition: source.position,
            targetPosition: target.position,
            basisVector: edge.basisVector,
            dot,
        });
    }
    return violations;
}

function formatPoint(v: Vector2): string {
    return `(${v.x.toFixed(2)}, ${v.y.toFixed(2)})`;
}

function describeDirectionViolations(violations: DirectionViolation[]): string {
    return violations
        .map(v =>
            `interior edge ${v.interiorEdgeId}: source node ${v.sourceNode} at ` +
            `${formatPoint(v.sourcePosition)} -> target node ${v.targetNode} at ` +
            `${formatPoint(v.targetPosition)}, but basis is ${formatPoint(v.basisVector)} ` +
            `(dot ${v.dot.toFixed(3)}, edge runs backwards along its own ray)`)
        .join('; ');
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

        it('never terminates an edge behind its own source', () => {
            expect(describeDirectionViolations(findDirectionViolations(vertices))).toBe('');
        });
    });

    /**
     * The near-regular fixtures are exported individually rather than through
     * `ALL_TEST_POLYGONS`, so the sweep above never reaches them — yet they are the corpus's
     * densest, most symmetric shapes, the ones that put many events on one point at one offset.
     * `NEAR_REGULAR_PEANUT_32` solved `complete` with no diagnostics while one of its interior
     * edges ran from offset 98.60 back to an *original polygon vertex* at offset 0, because
     * `tryAttachEdgeToNode` assigned that target directly and was therefore invisible to every
     * runtime causality check the solver had. Nothing in the suite noticed until this sweep
     * covered them, which is why it stays whatever the promotion status of the fixtures.
     *
     * `NEAR_REGULAR_PEANUT_32` had its own block here for as long as its waist was unresolved,
     * because the checks held on it only vacuously. It is now an ordinary member of this list,
     * and the history is worth keeping next to it because that waist is the reason the direction
     * check exists at all.
     *
     * The waist pinches shut at (300, 300) at offset 94.35 — the wavefront reaches the neck
     * before it reaches anywhere wider — and the solver records that as node 32. The event emits
     * one bisector per lobe: e64, bounded by the two left-hand neck edges 7 and 22, and e65,
     * bounded by the two right-hand ones 6 and 23.
     *
     * Two successive defects lived there. First, each was cross-wired to the bisector born at
     * 98.60 in the *other* lobe on nothing better than `dot(basis1, basis2) === -1`.
     * Anti-parallel is not head-on: those pairs point directly away from each other, and the
     * cross-wire made all four run backwards along their own basis while, in two cases, still
     * running *forwards* in offset — which is why the offset check scored that damage at only
     * 4.25 and the direction check scored it as a clean reversal. Refusing the bogus cross-wire
     * made the checks pass vacuously instead: all four edges were left with no target, and an
     * edge without a target is audited by neither.
     *
     * Second, and the actual cause: `bisectionsForMerge` gave both new bisectors an
     * `approximateDirection` derived from the two annihilating arrivals, which are exactly
     * anti-parallel, so `makeBisectedBasis` fell through to `rotateCw90` of its first argument
     * — a perpendicular with no reference to the geometry — and `addBisectionEdge` flipped the
     * correct parent-derived basis on the strength of it. e64 pointed right into the wrong lobe
     * and e65 pointed left into the other. Anti-parallel arrivals now supply no hint, the parent
     * derivation stands, e64 runs left to node 33 and e65 runs right to node 34, and all three
     * checks below hold on the peanut with every edge targeted.
     */
    const CAUSAL_NEAR_REGULAR_FIXTURES: [string, Vector2[]][] = [
        ['NEAR_REGULAR_CIRCLE_16', NEAR_REGULAR_CIRCLE_16],
        ['NEAR_REGULAR_CIRCLE_32', NEAR_REGULAR_CIRCLE_32],
        ['NEAR_REGULAR_CIRCLE_48', NEAR_REGULAR_CIRCLE_48],
        ['NEAR_REGULAR_ELLIPSE_16', NEAR_REGULAR_ELLIPSE_16],
        ['NEAR_REGULAR_ELLIPSE_32', NEAR_REGULAR_ELLIPSE_32],
        ['NEAR_REGULAR_PEANUT_32', NEAR_REGULAR_PEANUT_32],
        ['NEAR_REGULAR_ROSETTE5_40', NEAR_REGULAR_ROSETTE5_40],
    ];

    describe.each(CAUSAL_NEAR_REGULAR_FIXTURES)('%s', (_name, vertices) => {
        it('never runs backwards in time along a skeleton edge', () => {
            const violations = findOffsetViolations(vertices);
            expect(describeViolations(violations)).toBe('');
        });

        it('never places a node beyond its own clearance', () => {
            expect(findClearanceViolations(vertices).join('; ')).toBe('');
        });

        it('never terminates an edge behind its own source', () => {
            expect(describeDirectionViolations(findDirectionViolations(vertices))).toBe('');
        });
    });
});
