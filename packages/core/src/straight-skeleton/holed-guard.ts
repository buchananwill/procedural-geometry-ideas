import type {GeneralSkeletonDiagnostic, InteriorEdge, StraightSkeletonGraph, Vector2} from './types';
import {distanceToWallLine, gapOnFasterWall} from './wall-time';
import type {WallReading} from './wall-time';

/*
 * ============================================================================
 *  THE GUARD ON A HOLED SOLVE (BSA.D314, BSA.D318; BSA.F103).
 * ============================================================================
 *
 * Some holed solves come back `complete` with no diagnostic and a wrong skeleton. This guard reads the FINISHED graph
 * for what every such answer measured shows. Every check below skips a culled edge before it reads anything: a culled
 * edge is the solver's deliberate retirement of a surplus bisector at a degenerate closure, and carries no geometry.
 * An ARC is one node pair joined by a non-culled interior edge that is not a self-loop: the last arc of a collapse
 * between anti-parallel walls is written down by each of the two bisectors that closed it, and two straight arcs
 * sharing both endpoints are one arc, as `buildSkeletonTree` counts it.
 *
 * BLOCKING, each a reason the result is not `complete`:
 *
 *  - TOPOLOGY (`holed-topology-violation`): the arcs form one connected graph whose cycle rank is the hole count; and
 *    an arc recorded from both ends names the same two walls from each end. Overlapping ridge arcs with every node in
 *    the right place (F103's K1) show here as one cycle too many.
 *  - EQUAL TIME (`holed-equal-time-violation`): every interior node is at one TIME from all the walls that meet there,
 *    the walls being the two parents of every non-culled interior edge incident to the node. A wall's time at a point
 *    is the point's distance to the wall's supporting line, through the wall's own source and target, over the wall's
 *    weight. Two arrivals are compared as the causality check compares them (BSA.D309, `causality-check.ts`): in unit
 *    space, cross-multiplied, `d₁ · w₂` against `d₂ · w₁`, and the gap a violation when it exceeds the perceptual floor
 *    stated on the faster wall, `δ · min(w₁, w₂)`. Misplaced nodes under inexact arithmetic (F103's K2) show here.
 *  - TIME ORDER (`holed-time-order-violation`): every non-culled interior edge's target is no earlier than its source,
 *    compared the same way. A node's time is read from the lowest-id wall that meets there (an exterior node's is 0);
 *    with equal time clean, any other wall gives the same verdict within the floor.
 *  - PLANARITY (`holed-planarity-violation`): no two arcs cross at a point interior to both, judged at the perceptual
 *    floor in unit space: a crossing counts when each arc's two ends lie more than the floor from the other's line,
 *    on opposite sides of it. An arc no longer than the floor has no direction and is not compared. The collinear
 *    overlap is NOT judged: at the floor it cannot be told from a sound sliver face (see `planarityViolations`).
 *
 * INFORMATIONAL, NOT BLOCKING (BSA.D318): `holed-unculled-self-loop`, a zero-length self-loop the solver did not mark
 * culled, named by its edge. It carries no geometry, and on its own it leaves a result complete; it is not an arc, so
 * it adds no cycle.
 *
 * WHAT IT IS NOT. It reads the graph and changes nothing: no event, link, acceptance or node. It moves no tolerance:
 * every comparison reads the solve's perceptual floor. It runs only on a result with more than one loop that would
 * otherwise be complete, so it never reads a single-loop result. It does not test containment or the faces.
 */

/** The informational kind: the one kind this guard pushes that does not make a result incomplete. */
export const HOLED_UNCULLED_SELF_LOOP = 'holed-unculled-self-loop' as const;

/** One arc: a node pair, `a < b`, and the wall pairs its records name. */
interface Arc {
    a: number;
    b: number;
    /** Each record's two walls, as `low:high`. */
    walls: Set<string>;
    /** The lowest interior edge id recording it. */
    edge: number;
}

/** The arcs of the graph, and its un-culled self-loops. */
function arcsOf(graph: StraightSkeletonGraph): {arcs: Arc[]; selfLoops: InteriorEdge[]} {
    const arcs = new Map<string, Arc>();
    const selfLoops: InteriorEdge[] = [];
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
            selfLoops.push(interior);
            continue;
        }
        const a = Math.min(edge.source, edge.target);
        const b = Math.max(edge.source, edge.target);
        const key = `${a}:${b}`;
        const arc = arcs.get(key) ?? {a, b, walls: new Set<string>(), edge: interior.id};
        const cw = interior.clockwiseExteriorEdgeIndex;
        const ws = interior.widdershinsExteriorEdgeIndex;
        arc.walls.add(`${Math.min(cw, ws)}:${Math.max(cw, ws)}`);
        arc.edge = Math.min(arc.edge, interior.id);
        arcs.set(key, arc);
    }
    return {arcs: [...arcs.values()], selfLoops};
}

/** The informational self-loops, and the topology: one component, the cycle rank, one wall pair per arc. */
function topologyViolations(
    graph: StraightSkeletonGraph,
    holeCount: number,
    arcs: Arc[],
    selfLoops: InteriorEdge[],
): GeneralSkeletonDiagnostic[] {
    const found: GeneralSkeletonDiagnostic[] = selfLoops.map(interior => ({
        kind: HOLED_UNCULLED_SELF_LOOP,
        detail: `Interior edge ${interior.id} is a self-loop at node ${graph.edges[interior.id].source} that is not `
            + `culled, between walls ${interior.clockwiseExteriorEdgeIndex} and `
            + `${interior.widdershinsExteriorEdgeIndex}: it has no length and was not retired at a degenerate closure. `
            + `Informational: it adds no cycle and blocks nothing.`,
    }));

    const parent = new Map<number, number>();
    const find = (node: number): number => {
        let root = node;
        while (parent.get(root) !== root) {
            root = parent.get(root)!;
        }
        parent.set(node, root);
        return root;
    };
    for (const arc of arcs) {
        for (const node of [arc.a, arc.b]) {
            if (!parent.has(node)) {
                parent.set(node, node);
            }
        }
        parent.set(find(arc.a), find(arc.b));
    }
    const components = new Set([...parent.keys()].map(find)).size;
    if (components !== 1) {
        found.push({
            kind: 'holed-topology-violation',
            detail: `The interior edges that are not culled form ${components} connected components, not 1.`,
        });
    }
    const cycleRank = arcs.length - parent.size + components;
    if (cycleRank !== holeCount) {
        found.push({
            kind: 'holed-topology-violation',
            detail: `The interior edges that are not culled have cycle rank ${cycleRank} (${arcs.length} arcs, an arc `
                + `recorded from both ends counted once, over ${parent.size} nodes in ${components} component(s)), `
                + `where a skeleton of ${holeCount} hole(s) has one cycle round each hole.`,
        });
    }
    for (const arc of arcs) {
        if (arc.walls.size > 1) {
            found.push({
                kind: 'holed-topology-violation',
                detail: `The arc between nodes ${arc.a} and ${arc.b} is recorded with different pairs of walls from its `
                    + `two ends (${[...arc.walls].map(pair => `{${pair.replace(':', ', ')}}`).join(' and ')}), where an `
                    + `arc separates exactly two faces.`,
            });
        }
    }
    return found;
}

/** A wall's arrival at a point, in unit space: the distance from its supporting line, and its weight. */
interface WallArrival extends WallReading {
    wall: number;
}

/** Every interior node's walls: the parents of the non-culled interior edges incident to it. */
function wallsAtNodes(graph: StraightSkeletonGraph): Map<number, Set<number>> {
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
    return wallsAt;
}

function arrivalAt(graph: StraightSkeletonGraph, node: number, wall: number, toUnitScale: number): WallArrival {
    return {
        wall,
        distance: toUnitScale * distanceToWallLine(graph, graph.nodes[node].position, wall),
        weight: graph.exteriorWeights[wall] ?? 1,
    };
}

/** The equal-time check: every interior node at one time from every wall that meets there, at the floor. */
function equalTimeViolations(
    graph: StraightSkeletonGraph,
    wallsAt: Map<number, Set<number>>,
    perceptualFloor: number,
    toUnitScale: number,
    toCallerSpace: (position: Vector2) => Vector2,
): GeneralSkeletonDiagnostic[] {
    const found: GeneralSkeletonDiagnostic[] = [];
    for (const [node, walls] of [...wallsAt.entries()].sort((a, b) => a[0] - b[0])) {
        const arrivals = [...walls].sort((a, b) => a - b).map(wall => arrivalAt(graph, node, wall, toUnitScale));
        let worst: {later: WallArrival; earlier: WallArrival; gap: number} | undefined;
        for (const later of arrivals) {
            for (const earlier of arrivals) {
                const gap = gapOnFasterWall(later, earlier);
                if (gap > perceptualFloor && (worst === undefined || gap > worst.gap)) {
                    worst = {later, earlier, gap};
                }
            }
        }
        if (worst !== undefined) {
            const at = toCallerSpace(graph.nodes[node].position);
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

/** The time-order check: no non-culled interior edge ends earlier than it starts, at the floor. */
function timeOrderViolations(
    graph: StraightSkeletonGraph,
    wallsAt: Map<number, Set<number>>,
    perceptualFloor: number,
    toUnitScale: number,
): GeneralSkeletonDiagnostic[] {
    const timeOf = (node: number): WallArrival => {
        const walls = wallsAt.get(node);
        if (node < graph.numExteriorNodes || walls === undefined) {
            return {wall: -1, distance: 0, weight: 1};
        }
        return arrivalAt(graph, node, Math.min(...walls), toUnitScale);
    };
    const found: GeneralSkeletonDiagnostic[] = [];
    for (const interior of graph.interiorEdges) {
        if (interior.culled) {
            continue;
        }
        const edge = graph.edges[interior.id];
        if (edge === undefined || edge.target === undefined || edge.target === edge.source) {
            continue;
        }
        const from = timeOf(edge.source);
        const to = timeOf(edge.target);
        const backwards = gapOnFasterWall(from, to);
        if (backwards > perceptualFloor) {
            found.push({
                kind: 'holed-time-order-violation',
                detail: `Interior edge ${interior.id} runs backwards in time: node ${edge.source} at time `
                    + `${from.distance / from.weight} -> node ${edge.target} at time ${to.distance / to.weight} (unit `
                    + `space), ${backwards} earlier on the faster wall, beyond the ${perceptualFloor} perceptual floor.`,
            });
        }
    }
    return found;
}

/**
 * The planarity check: no two arcs cross at a point inside both, at the floor.
 *
 * THE COLLINEAR-OVERLAP HALF OF BSA.D318 IS NOT BUILT, BECAUSE AT THE FLOOR IT FLAGS SOUND SOLVES (measured). Two arcs
 * that lie within the floor of one line and overlap are, on the sound jittered solves measured, the two sides of a
 * sliver face between two walls collinear to within the floor and not exactly: 153 such solves flagged when the
 * overlap was judged between any two arcs, and still 73 when judged only between two arcs leaving one node, every one
 * of them sound by the independent checker. At the floor a sliver and a true overlap (F103's K1) look the same, and
 * telling them apart needs a bar below the floor, which is a new tolerance. K1's overlaps are caught instead by the
 * cycle rank, by the time order or by one pair of walls per arc, on every exact-input solve measured.
 */
function planarityViolations(
    graph: StraightSkeletonGraph,
    arcs: Arc[],
    perceptualFloor: number,
    toUnitScale: number,
): GeneralSkeletonDiagnostic[] {
    const at = (node: number): Vector2 => {
        const p = graph.nodes[node].position;
        return {x: p.x * toUnitScale, y: p.y * toUnitScale};
    };
    const segments = arcs
        .map(arc => {
            const from = at(arc.a);
            const to = at(arc.b);
            const length = Math.hypot(to.x - from.x, to.y - from.y);
            return {arc, from, to, length, ux: (to.x - from.x) / length, uy: (to.y - from.y) / length};
        })
        .filter(segment => segment.length > perceptualFloor);
    type Segment = typeof segments[number];
    /** Signed distance of `p` from `s`'s line. */
    const across = (s: Segment, p: Vector2) => (p.x - s.from.x) * s.uy - (p.y - s.from.y) * s.ux;

    const found: GeneralSkeletonDiagnostic[] = [];
    const name = (s: Segment) => `the arc between nodes ${s.arc.a} and ${s.arc.b} (edge ${s.arc.edge})`;
    for (let i = 0; i < segments.length; i++) {
        for (let j = i + 1; j < segments.length; j++) {
            const p = segments[i];
            const q = segments[j];
            const q0 = across(p, q.from);
            const q1 = across(p, q.to);
            const p0 = across(q, p.from);
            const p1 = across(q, p.to);
            const separates = (u: number, v: number) =>
                Math.abs(u) > perceptualFloor && Math.abs(v) > perceptualFloor && (u > 0) !== (v > 0);
            if (separates(q0, q1) && separates(p0, p1)) {
                found.push({
                    kind: 'holed-planarity-violation',
                    detail: `${name(p)} and ${name(q)} cross at a point inside both, each arc's ends more than the `
                        + `${perceptualFloor} perceptual floor from the other's line.`,
                });
            }
        }
    }
    return found;
}

/**
 * Check a finished holed skeleton (see the header) and return one diagnostic per finding: every kind but
 * {@link HOLED_UNCULLED_SELF_LOOP} is BLOCKING. `holeCount` is the number of holes the graph was solved with
 * (`graph.loops.length − 1`). `perceptualFloor` is the solve's floor, in unit space; `toUnitScale` carries the graph's
 * lengths into unit space (`1` for a graph still in unit space, `normalisation.toUnitScale` for one returned to caller
 * space); `toCallerSpace` writes a node's position in a detail in the caller's coordinates (the identity by default).
 *
 * `solveSkeleton` RUNS IT ON THE UNIT-SPACE GRAPH, BEFORE IT IS CARRIED BACK. Carried back, every node is rounded to
 * the caller's coordinates, and far from the origin that rounding is itself above the floor: at a translation of 1e11
 * on an extent of 10 one ulp of a coordinate is about 1.5e-6 of the extent. Read there, the guard would report sound
 * solves of the sweep harness's translated cells as off equal time (measured: 42 of its 126 translated holed cells,
 * at 1e11 to 1e13, none of them flagged in unit space), reporting the caller's rounding and not the solver's answer.
 *
 * THE COST is the planarity check's, quadratic in the arcs: every pair is compared once.
 */
export function holedSkeletonViolations(
    graph: StraightSkeletonGraph,
    holeCount: number,
    perceptualFloor: number,
    toUnitScale: number,
    toCallerSpace: (position: Vector2) => Vector2 = position => position,
): GeneralSkeletonDiagnostic[] {
    const {arcs, selfLoops} = arcsOf(graph);
    const wallsAt = wallsAtNodes(graph);
    return [
        ...topologyViolations(graph, holeCount, arcs, selfLoops),
        ...equalTimeViolations(graph, wallsAt, perceptualFloor, toUnitScale, toCallerSpace),
        ...timeOrderViolations(graph, wallsAt, perceptualFloor, toUnitScale),
        ...planarityViolations(graph, arcs, perceptualFloor, toUnitScale),
    ];
}
