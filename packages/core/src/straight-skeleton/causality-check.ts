import type {CausalityViolationDiagnostic, StraightSkeletonGraph, Vector2} from './types';

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
 * THE THREE ORACLES, each the definition `wavefront-causality.test.ts` states, reproduced exactly:
 *
 *  - OFFSET: an interior edge with a target is a violation when its target's derived offset is less
 *    than its source's derived offset by more than the tolerance.
 *  - CLEARANCE: an interior node with a derived offset is a violation when that offset exceeds its
 *    distance to the nearest segment of the solver's boundary ring by more than the tolerance.
 *  - DIRECTION: an interior edge with a target, whose source-to-target travel is longer than the
 *    tolerance, is a violation when the unit travel vector's dot product with the edge's basis vector
 *    is not strictly positive.
 *
 * A node's DERIVED OFFSET is re-derived from geometry, never read from the solver's bookkeeping:
 * boundary nodes are at 0; an interior node takes its first incident interior edge (in-edges, then
 * out-edges, first occurrence) and is dated at its perpendicular distance from the supporting line
 * of that edge's clockwise exterior parent, read off the solved graph's exterior ring; a node with no
 * incident interior edge has no offset and is skipped by both the offset and clearance oracles. This
 * is a deliberately separate copy from the test suites' `deriveNodeArrivals` — the test side is kept
 * as the independent conviction (decision 148(e)) — and from `computeNodeOffsets`, which
 * canonicalises and so could not see what it overwrote.
 *
 * THE TOLERANCE IS DERIVED, NOT LITERAL (decision 144): it is the solve's PERCEPTUAL FLOOR, a
 * unit-space length — "visibly the same" is the question each oracle asks of the difference it
 * measures. Every length is carried into unit space before it is compared, by the power-of-two
 * `toUnitScale`, which is exact. The test oracles use a literal `1e-6` in CALLER units; the two agree
 * only where that difference changes no verdict, and the suites pin both counts.
 */

/** Perpendicular distance from `p` to the infinite line through `a` and `b`; to `a` itself when `a = b`. */
function distanceToSupportingLine(p: Vector2, a: Vector2, b: Vector2): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    if (length === 0) {
        return Math.hypot(p.x - a.x, p.y - a.y);
    }
    return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / length;
}

/** Euclidean distance from `p` to the segment `ab`. */
function distanceToSegment(p: Vector2, a: Vector2, b: Vector2): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;
    const raw = lengthSquared === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared;
    const t = Math.max(0, Math.min(1, raw));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Every node's derived offset in the graph's own units. See the module header for the definition. */
function deriveOffsets(graph: StraightSkeletonGraph): Map<number, number> {
    const edgeCount = graph.numExteriorNodes;
    const clockwiseParentOf = new Map<number, number>();
    for (const interiorEdge of graph.interiorEdges) {
        clockwiseParentOf.set(interiorEdge.id, interiorEdge.clockwiseExteriorEdgeIndex);
    }

    const offsetOf = new Map<number, number>();
    for (let i = 0; i < graph.numExteriorNodes; i++) {
        offsetOf.set(i, 0);
    }
    for (let i = graph.numExteriorNodes; i < graph.nodes.length; i++) {
        const node = graph.nodes[i];
        const incident = [...new Set([...node.inEdges, ...node.outEdges])]
            .filter(id => clockwiseParentOf.has(id));
        if (incident.length === 0) continue;
        const parent = clockwiseParentOf.get(incident[0])!;
        offsetOf.set(i, distanceToSupportingLine(
            node.position,
            graph.nodes[parent].position,
            graph.nodes[(parent + 1) % edgeCount].position));
    }
    return offsetOf;
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
 * Run the three causality oracles over a solved graph and return one diagnostic per violation.
 *
 * `perceptualFloor` is the solve's floor, in UNIT space. `toUnitScale` carries the graph's lengths
 * into unit space: `normalisation.toUnitScale` for a graph already returned to caller space, `1` for
 * a graph still in unit space. Every magnitude reported is in unit space.
 *
 * Diagnostics are ordered by oracle — offset, clearance, direction — and by id within each.
 */
export function checkWavefrontCausality(
    graph: StraightSkeletonGraph,
    perceptualFloor: number,
    toUnitScale: number,
): CausalityViolationDiagnostic[] {
    // THE DERIVED TOLERANCE (decision 144): the perceptual floor, a unit-space length. Every
    // quantity below is multiplied into unit space by `toUnitScale` before it meets this bar.
    const tolerance = perceptualFloor;
    const offsetOf = deriveOffsets(graph);

    const offsetViolations: CausalityViolationDiagnostic[] = [];
    const directionViolations: CausalityViolationDiagnostic[] = [];
    for (const interiorEdge of graph.interiorEdges) {
        const edge = graph.edges[interiorEdge.id];
        if (!edge || edge.target === undefined) continue;

        const sourceOffset = offsetOf.get(edge.source);
        const targetOffset = offsetOf.get(edge.target);
        if (sourceOffset !== undefined && targetOffset !== undefined) {
            const unitSource = sourceOffset * toUnitScale;
            const unitTarget = targetOffset * toUnitScale;
            if (unitTarget < unitSource - tolerance) {
                offsetViolations.push(violation('offset', interiorEdge.id, unitSource - unitTarget,
                    `Interior edge ${interiorEdge.id} runs backwards in time: node ${edge.source} at offset `
                    + `${unitSource} -> node ${edge.target} at offset ${unitTarget} (unit space), `
                    + `beyond the ${tolerance} perceptual floor.`));
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
    const boundary = graph.nodes.slice(0, graph.numExteriorNodes).map(node => node.position);
    for (let i = graph.numExteriorNodes; i < graph.nodes.length; i++) {
        const offset = offsetOf.get(i);
        if (offset === undefined) continue;
        let clearance = Infinity;
        for (let k = 0; k < boundary.length; k++) {
            clearance = Math.min(clearance,
                distanceToSegment(graph.nodes[i].position, boundary[k], boundary[(k + 1) % boundary.length]));
        }
        const unitOffset = offset * toUnitScale;
        const unitClearance = clearance * toUnitScale;
        if (unitOffset > unitClearance + tolerance) {
            clearanceViolations.push(violation('clearance', i, unitOffset - unitClearance,
                `Node ${i} is dated at offset ${unitOffset} but lies only ${unitClearance} from the `
                + `boundary (unit space): placed where the wavefront had already passed, beyond the `
                + `${tolerance} perceptual floor.`));
        }
    }

    return [...offsetViolations, ...clearanceViolations, ...directionViolations];
}
