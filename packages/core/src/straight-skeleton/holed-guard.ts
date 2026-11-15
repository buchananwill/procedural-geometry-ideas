import type {GeneralSkeletonDiagnostic, StraightSkeletonGraph, Vector2} from './types';

/*
 * ============================================================================
 *  THE GUARD ON A HOLED SOLVE (BSA.D314; BSA.F103).
 * ============================================================================
 *
 * Some holed solves come back `complete` with no diagnostic and a wrong skeleton. Every such answer found shows one
 * of two things, and this guard looks for exactly those two on the FINISHED graph:
 *
 *  - TOPOLOGY (`holed-topology-violation`): the interior edges that are not culled form one connected graph whose
 *    cycle rank is the hole count, with no self-loop that is not culled. An arc recorded from both of its ends counts
 *    once, as `buildSkeletonTree` counts it: the last arc of a collapse between anti-parallel walls is written down
 *    by each of the two bisectors that closed it, and two straight arcs sharing both endpoints are one arc. A culled
 *    edge is the solver's deliberate retirement of a surplus bisector at a degenerate closure, carries no geometry,
 *    and is skipped before anything is counted. Overlapping ridge arcs with every node in the right place (F103's K1)
 *    show here as one cycle too many; a zero-length self-loop the solver did not mark culled shows as itself.
 *  - EQUAL TIME (`holed-equal-time-violation`): every interior node is at one TIME from all the walls that meet there,
 *    the walls being the two parents of every non-culled interior edge incident to the node. A wall's time at a point
 *    is the point's distance to the wall's supporting line, through the wall's own source and target, over the wall's
 *    weight. Two walls are compared as the causality check compares arrivals (BSA.D309, `causality-check.ts`):
 *    distances carried into unit space by `toUnitScale`, cross-multiplied, `d₁ · w₂` against `d₂ · w₁`, and the gap a
 *    violation when it exceeds the perceptual floor stated on the faster wall, `δ · min(w₁, w₂)`. Misplaced nodes
 *    under inexact arithmetic (F103's K2) show here.
 *
 * WHAT IT IS NOT. It reads the graph and changes nothing: no event, link, acceptance or node. It moves no tolerance:
 * it reads the solve's perceptual floor, at this one new site. It runs only on a result with more than one loop that
 * would otherwise be complete, so no single-loop result changes. It does not test planarity, the faces, containment
 * or time order: a wrong skeleton whose topology and node times are both right passes it.
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

/** The topology half: one component, cycle rank equal to the hole count, no un-culled self-loop. */
function topologyViolations(graph: StraightSkeletonGraph, holeCount: number): GeneralSkeletonDiagnostic[] {
    const found: GeneralSkeletonDiagnostic[] = [];
    const parent = new Map<number, number>();
    const find = (node: number): number => {
        let root = node;
        while (parent.get(root) !== root) {
            root = parent.get(root)!;
        }
        parent.set(node, root);
        return root;
    };
    const arcs = new Set<string>();
    for (const interior of graph.interiorEdges) {
        if (interior.culled) {
            continue;
        }
        const edge = graph.edges[interior.id];
        if (edge === undefined || edge.target === undefined) {
            // Unresolved: reported by `unresolved-edges`, which already makes the result incomplete.
            continue;
        }
        if (edge.target === edge.source) {
            found.push({
                kind: 'holed-topology-violation',
                detail: `Interior edge ${interior.id} is a self-loop at node ${edge.source} that is not culled: it `
                    + `starts and ends at one node, between walls ${interior.clockwiseExteriorEdgeIndex} and `
                    + `${interior.widdershinsExteriorEdgeIndex}, and was not retired at a degenerate closure.`,
            });
            continue;
        }
        for (const node of [edge.source, edge.target]) {
            if (!parent.has(node)) {
                parent.set(node, node);
            }
        }
        parent.set(find(edge.source), find(edge.target));
        arcs.add(`${Math.min(edge.source, edge.target)}:${Math.max(edge.source, edge.target)}`);
    }
    const components = new Set([...parent.keys()].map(find)).size;
    if (components !== 1) {
        found.push({
            kind: 'holed-topology-violation',
            detail: `The interior edges that are not culled form ${components} connected components, not 1.`,
        });
    }
    const cycleRank = arcs.size - parent.size + components;
    if (cycleRank !== holeCount) {
        found.push({
            kind: 'holed-topology-violation',
            detail: `The interior edges that are not culled have cycle rank ${cycleRank} (${arcs.size} arcs, an arc `
                + `recorded from both ends counted once, over ${parent.size} nodes in ${components} component(s)), `
                + `where a skeleton of ${holeCount} hole(s) has one cycle round each hole.`,
        });
    }
    return found;
}

/** The equal-time half: every interior node at one time from every wall that meets there, at the floor. */
function equalTimeViolations(
    graph: StraightSkeletonGraph,
    perceptualFloor: number,
    toUnitScale: number,
    toCallerSpace: (position: Vector2) => Vector2,
): GeneralSkeletonDiagnostic[] {
    const wallsAt = new Map<number, Set<number>>();
    for (const interior of graph.interiorEdges) {
        if (interior.culled) {
            continue;
        }
        const edge = graph.edges[interior.id];
        if (edge === undefined) {
            continue;
        }
        for (const node of [edge.source, edge.target]) {
            if (node === undefined || node < graph.numExteriorNodes) {
                continue;
            }
            const walls = wallsAt.get(node) ?? new Set<number>();
            walls.add(interior.clockwiseExteriorEdgeIndex);
            walls.add(interior.widdershinsExteriorEdgeIndex);
            wallsAt.set(node, walls);
        }
    }

    const found: GeneralSkeletonDiagnostic[] = [];
    for (const [node, walls] of [...wallsAt.entries()].sort((a, b) => a[0] - b[0])) {
        const position = graph.nodes[node].position;
        const arrivals = [...walls].sort((a, b) => a - b).map(wall => {
            const edge = graph.edges[wall];
            return {
                wall,
                distance: toUnitScale * distanceToSupportingLine(
                    position, graph.nodes[edge.source].position, graph.nodes[edge.target!].position),
                weight: graph.exteriorWeights[wall] ?? 1,
            };
        });
        // The widest gap between two walls, cross-multiplied and stated on the faster wall, as `compareArrivals`
        // and the causality check state theirs.
        let worst: {later: typeof arrivals[number]; earlier: typeof arrivals[number]; gap: number} | undefined;
        for (const later of arrivals) {
            for (const earlier of arrivals) {
                const faster = Math.min(later.weight, earlier.weight);
                const gap = (later.distance * earlier.weight - earlier.distance * later.weight) / faster;
                if (gap > perceptualFloor && (worst === undefined || gap > worst.gap)) {
                    worst = {later, earlier, gap};
                }
            }
        }
        if (worst !== undefined) {
            const at = toCallerSpace(position);
            found.push({
                kind: 'holed-equal-time-violation',
                detail: `Node ${node} at (${at.x}, ${at.y}) is not at one time from the walls that meet `
                    + `there: wall ${worst.later.wall} at time ${worst.later.distance / worst.later.weight} and wall `
                    + `${worst.earlier.wall} at time ${worst.earlier.distance / worst.earlier.weight} (unit space), `
                    + `${worst.gap} apart on the faster wall, beyond the ${perceptualFloor} perceptual floor.`,
            });
        }
    }
    return found;
}

/**
 * Check a finished holed skeleton for the two things every silent wrong answer found shows (see the header), and
 * return one BLOCKING diagnostic per violation. `holeCount` is the number of holes the graph was solved with
 * (`graph.loops.length − 1`). `perceptualFloor` is the solve's floor, in unit space; `toUnitScale` carries the graph's
 * lengths into unit space (`1` for a graph still in unit space, `normalisation.toUnitScale` for one returned to caller
 * space); `toCallerSpace` writes a node's position in a detail in the caller's coordinates (the identity by default).
 *
 * `solveSkeleton` RUNS IT ON THE UNIT-SPACE GRAPH, BEFORE IT IS CARRIED BACK. Carried back, every node is rounded to
 * the caller's coordinates, and far from the origin that rounding is itself above the floor: at a translation of 1e11
 * on an extent of 10 one ulp of a coordinate is about 1.5e-6 of the extent. Read there, the guard would report sound
 * solves of the sweep harness's translated cells as off equal time (measured: 42 of its 126 translated holed cells,
 * at 1e11 to 1e13, none of them flagged in unit space), reporting the caller's rounding and not the solver's answer.
 */
export function holedSkeletonViolations(
    graph: StraightSkeletonGraph,
    holeCount: number,
    perceptualFloor: number,
    toUnitScale: number,
    toCallerSpace: (position: Vector2) => Vector2 = position => position,
): GeneralSkeletonDiagnostic[] {
    return [
        ...topologyViolations(graph, holeCount),
        ...equalTimeViolations(graph, perceptualFloor, toUnitScale, toCallerSpace),
    ];
}
