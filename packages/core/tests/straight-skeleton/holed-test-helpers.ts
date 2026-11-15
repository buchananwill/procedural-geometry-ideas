/*
 * THE HOLED VARIANTS OF THE SINGLE-LOOP INSTRUMENTS (skeleton join-and-divide spec, decisions 42 and 43; BSA.F92).
 *
 * The single-loop helpers read a polygon as one ring of vertices and an exterior edge's far end as `(i + 1) % n`.
 * Every instrument here reads EACH EXTERIOR EDGE'S OWN ENDS (`graph.edges[e].source` and `.target`) or the
 * caller's loops as given, so on one loop each says what its single-loop counterpart says, and on a holed solve
 * it says it of every loop. The single-loop helpers are left as they are: nothing on a single loop moves.
 *
 *  - containment: inside the outline and outside every hole, at the containment helpers' own slack;
 *  - faces: one per exterior edge of every loop, traced by I4's strong walk from the edge's own target back to
 *    its own source across the bisectors that name it, and their areas summed (the holed tiling: strip
 *    decomposition reads the loop table only from node 6, so the faces are summed instead);
 *  - the rate and direction oracles of `wavefront-causality.test.ts`, read on the graph;
 *  - the interior graph's shape: connected, no self-loop, cycle rank.
 */
import type {
    AlgorithmStepInput,
    SkeletonHole,
    SkeletonSolveResult,
    SolveSkeletonOptions,
    StraightSkeletonGraph,
    StraightSkeletonSolverContext,
    Vector2,
} from '@proc-geo/core';
import {checkWavefront, ringsOfWavefront, solveSkeleton} from '@proc-geo/core';
import {setWavefrontProbe} from '@proc-geo/core/straight-skeleton/wavefront';
import {containmentTolerance, distanceToBoundary, isInside} from './containment-helpers';

/** An outline and its holes, as a caller passes them to `solveSkeleton`. */
export interface HoledFixture {
    name: string;
    outline: Vector2[];
    holes: SkeletonHole[];
    /** The outline's weights, if any. */
    weights?: number[];
}

/** What one step boundary of a holed solve looked like, read by the probe. */
export interface HoledBoundary {
    /** The step inputs still to run. */
    inputs: number[][];
    /** The rings of each input, read from the links. */
    ringsPerInput: number[][][];
    /** `checkWavefront` over the inputs. */
    violations: string[];
    /** Nodes in the graph at this boundary. */
    nodeCount: number;
}

export interface HoledSolve {
    result: SkeletonSolveResult;
    boundaries: HoledBoundary[];
}

/** Solve a holed fixture with a probe that records every step boundary, always removing the probe afterwards. */
export function solveHoled(fixture: HoledFixture, options: SolveSkeletonOptions = {}): HoledSolve {
    const boundaries: HoledBoundary[] = [];
    let solved: StraightSkeletonSolverContext | undefined;
    setWavefrontProbe({
        stepBoundary(context: StraightSkeletonSolverContext, inputs: readonly AlgorithmStepInput[]) {
            solved ??= context;
            if (context !== solved) {
                return;
            }
            boundaries.push({
                inputs: inputs.map(input => [...input.interiorEdges]),
                ringsPerInput: inputs.map(input => ringsOfWavefront(context, input.interiorEdges)),
                violations: checkWavefront(context, inputs),
                nodeCount: context.graph.nodes.length,
            });
        },
    });
    try {
        const result = solveSkeleton(fixture.outline, {
            ...options,
            weights: fixture.weights,
            holes: fixture.holes,
        });
        return {result, boundaries};
    } finally {
        setWavefrontProbe(null);
    }
}

/**
 * A solve's story, one line per step boundary: each step input as its rings joined by `+`, inputs by ` | `, and each
 * ring as its size and the loops its bisectors' clockwise parents lie on, `{0}` the outline. Root of F1: `4{0}+4{1}`.
 */
export function storyOf({result, boundaries}: HoledSolve): string[] {
    const {graph} = result;
    const loopOf = (exteriorEdge: number) => graph.loops.findIndex(({start, count}) =>
        exteriorEdge >= start && exteriorEdge < start + count);
    return boundaries.map(boundary => boundary.ringsPerInput
        .map(rings => rings
            .map(ring => {
                const loops = [...new Set(ring.map(id =>
                    loopOf(graph.interiorEdges[id - graph.numExteriorNodes].clockwiseExteriorEdgeIndex)))].sort();
                return `${ring.length}{${loops.join(',')}}`;
            })
            .join('+'))
        .join(' | '));
}

/** The shoelace signed area: negative for a clockwise ring in this codebase's convention. */
export function shoelace(polygon: readonly Vector2[]): number {
    let area = 0;
    for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i];
        const b = polygon[(i + 1) % polygon.length];
        area += a.x * b.y - b.x * a.y;
    }
    return area / 2;
}

/** The region's true area: the outline's less every hole's. */
export function regionArea(fixture: HoledFixture): number {
    return Math.abs(shoelace(fixture.outline))
        - fixture.holes.reduce((sum, hole) => sum + Math.abs(shoelace(hole.vertices)), 0);
}

/** Is `point` in the region: inside the outline and outside every hole, at the containment slack. */
export function escapesRegion(point: Vector2, fixture: HoledFixture, tolerance: number): number | undefined {
    if (!isInside(point, fixture.outline)) {
        const distance = distanceToBoundary(point, fixture.outline);
        if (distance > tolerance) {
            return distance;
        }
    }
    for (const hole of fixture.holes) {
        if (isInside(point, [...hole.vertices])) {
            const distance = distanceToBoundary(point, [...hole.vertices]);
            if (distance > tolerance) {
                return distance;
            }
        }
    }
    return undefined;
}

/** Every interior node outside the region, described. */
export function escapedHoledNodes(graph: StraightSkeletonGraph, fixture: HoledFixture): string[] {
    const tolerance = containmentTolerance(fixture.outline);
    const escaped: string[] = [];
    for (let id = graph.numExteriorNodes; id < graph.nodes.length; id++) {
        const distance = escapesRegion(graph.nodes[id].position, fixture, tolerance);
        if (distance !== undefined) {
            escaped.push(`node ${id} at (${graph.nodes[id].position.x}, ${graph.nodes[id].position.y}) lies ${distance} outside the region`);
        }
    }
    return escaped;
}

/**
 * The face of exterior edge `e`, as the node ids of its boundary: the edge's own source and target, then I4's
 * strong walk from the target back to the source across the interior edges that name `e` as a parent (a
 * breadth-first search, so the shortest such walk). `undefined` when the walk does not close.
 */
export function traceFace(graph: StraightSkeletonGraph, exteriorEdge: number): number[] | undefined {
    const source = graph.edges[exteriorEdge].source;
    const target = graph.edges[exteriorEdge].target!;
    const adjacency = new Map<number, number[]>();
    const link = (from: number, to: number) => {
        const list = adjacency.get(from);
        if (list === undefined) {
            adjacency.set(from, [to]);
        } else {
            list.push(to);
        }
    };
    for (const interior of graph.interiorEdges) {
        if (interior.clockwiseExteriorEdgeIndex !== exteriorEdge && interior.widdershinsExteriorEdgeIndex !== exteriorEdge) {
            continue;
        }
        const edge = graph.edges[interior.id];
        if (edge.target === undefined || edge.target === edge.source) {
            continue;
        }
        link(edge.source, edge.target);
        link(edge.target, edge.source);
    }
    const previous = new Map<number, number>([[target, -1]]);
    const queue = [target];
    while (queue.length > 0) {
        const node = queue.shift()!;
        if (node === source) {
            break;
        }
        for (const next of adjacency.get(node) ?? []) {
            if (!previous.has(next)) {
                previous.set(next, node);
                queue.push(next);
            }
        }
    }
    if (!previous.has(source)) {
        return undefined;
    }
    const walk: number[] = [];
    for (let node = previous.get(source)!; node !== target; node = previous.get(node)!) {
        walk.push(node);
    }
    // The face: source, target, then the walk's interior nodes from the target's side back to the source's.
    return [source, target, ...walk.reverse()];
}

export interface FaceTiling {
    /** Exterior edges whose face does not close. */
    open: number[];
    /** Each closed face's unsigned area, by exterior edge. */
    areas: Map<number, number>;
    /** |Σ faces − region| / region. */
    relativeError: number;
}

/** Trace every exterior edge's face and sum the areas against the region's (decision 42's holed tiling). */
export function faceTiling(graph: StraightSkeletonGraph, fixture: HoledFixture): FaceTiling {
    const open: number[] = [];
    const areas = new Map<number, number>();
    for (let edge = 0; edge < graph.numExteriorNodes; edge++) {
        const face = traceFace(graph, edge);
        if (face === undefined) {
            open.push(edge);
        } else {
            areas.set(edge, Math.abs(shoelace(face.map(node => graph.nodes[node].position))));
        }
    }
    const region = regionArea(fixture);
    const total = [...areas.values()].reduce((sum, area) => sum + area, 0);
    return {open, areas, relativeError: Math.abs(total - region) / region};
}

/** The test-side direction oracle: an interior edge whose target lies behind its source along its basis. */
export function directionViolations(graph: StraightSkeletonGraph, tolerance: number): number[] {
    return graph.interiorEdges.filter(interior => {
        const edge = graph.edges[interior.id];
        if (edge.target === undefined) {
            return false;
        }
        const from = graph.nodes[edge.source].position;
        const to = graph.nodes[edge.target].position;
        const travel = {x: to.x - from.x, y: to.y - from.y};
        const length = Math.hypot(travel.x, travel.y);
        return length > tolerance && travel.x * edge.basisVector.x + travel.y * edge.basisVector.y <= 0;
    }).map(interior => interior.id);
}

/**
 * The test-side rate oracle: an interior edge whose offset rate against its clockwise parent is negative while its
 * parents are not anti-parallel (sine of their deviation from anti-parallel above `antiParallelSine`).
 */
export function rateViolations(graph: StraightSkeletonGraph, antiParallelSine: number): number[] {
    return graph.interiorEdges.filter(interior => {
        const basis = graph.edges[interior.id].basisVector;
        const clockwise = graph.edges[interior.clockwiseExteriorEdgeIndex].basisVector;
        const widdershins = graph.edges[interior.widdershinsExteriorEdgeIndex].basisVector;
        const rate = basis.x * clockwise.y - clockwise.x * basis.y;
        if (rate >= 0) {
            return false;
        }
        const sameWay = -(clockwise.x * widdershins.x + clockwise.y * widdershins.y) > 0;
        const sine = Math.abs(clockwise.x * widdershins.y - widdershins.x * clockwise.y);
        return !(sameWay && sine < antiParallelSine);
    }).map(interior => interior.id);
}

/**
 * THE WEIGHTED EQUI-TIME CHECK: at every interior node, every wall that names a bisector meeting there is at one
 * TIME, its perpendicular distance divided by its weight. Returns the nodes whose times spread by more than
 * `tolerance`. This is what the solver's causality oracles cannot say on weighted input: they date a node by its
 * DISTANCE from one parent's line and compare it with the distance to the nearest wall, which reads a fast wall's
 * node as late (single-loop weighted fixtures carry the same signatures, e.g. `Weighted L` and `Weighted Pentagon
 * House`).
 */
export function equiTimeViolations(graph: StraightSkeletonGraph, tolerance: number): string[] {
    const timeFrom = (point: Vector2, wall: number) => {
        const edge = graph.edges[wall];
        const a = graph.nodes[edge.source].position;
        const b = graph.nodes[edge.target!].position;
        const distance = Math.abs((b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x)) / Math.hypot(b.x - a.x, b.y - a.y);
        return distance / graph.exteriorWeights[wall];
    };
    const wallsAt = new Map<number, Set<number>>();
    for (const interior of graph.interiorEdges) {
        const edge = graph.edges[interior.id];
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
    const found: string[] = [];
    for (const [node, walls] of wallsAt) {
        const times = [...walls].map(wall => timeFrom(graph.nodes[node].position, wall));
        const spread = Math.max(...times) - Math.min(...times);
        if (spread > tolerance) {
            found.push(`node ${node}: wall times spread by ${spread}`);
        }
    }
    return found;
}

export interface InteriorGraphShape {
    components: number;
    selfLoops: number[];
    cycleRank: number;
    unresolved: number[];
}

/**
 * The graph of interior edges: its nodes are every node an interior edge touches. Connected means one component;
 * the cycle rank is `E − V + C`, which is the hole count for a generic holed skeleton (one cycle round each hole).
 *
 * AN ARC RECORDED FROM BOTH ENDS COUNTS ONCE, as `buildSkeletonTree` counts it (skeleton-tree.ts,
 * `collectTreeEdges`): the last arc of a collapse between anti-parallel walls is written down by each of the two
 * bisectors that closed it — a rectangle's ridge comes back as `4 -> 5` and `5 -> 4` — and two straight arcs sharing
 * both endpoints are one arc. Counted twice, every corridor midline would add a cycle the skeleton does not have. A
 * culled edge carries no geometry and is skipped, as there.
 */
export function interiorGraphShape(graph: StraightSkeletonGraph): InteriorGraphShape {
    const parent = new Map<number, number>();
    const find = (node: number): number => {
        let root = node;
        while (parent.get(root) !== root) {
            root = parent.get(root)!;
        }
        parent.set(node, root);
        return root;
    };
    const add = (node: number) => {
        if (!parent.has(node)) {
            parent.set(node, node);
        }
    };
    const selfLoops: number[] = [];
    const unresolved: number[] = [];
    const arcs = new Set<string>();
    for (const interior of graph.interiorEdges) {
        const edge = graph.edges[interior.id];
        if (edge.target === undefined) {
            unresolved.push(interior.id);
            continue;
        }
        if (edge.target === edge.source) {
            selfLoops.push(interior.id);
        }
        if (interior.culled) {
            continue;
        }
        add(edge.source);
        add(edge.target);
        parent.set(find(edge.source), find(edge.target));
        arcs.add(`${Math.min(edge.source, edge.target)}:${Math.max(edge.source, edge.target)}`);
    }
    const roots = new Set([...parent.keys()].map(find));
    return {components: roots.size, selfLoops, cycleRank: arcs.size - parent.size + roots.size, unresolved};
}

/** The extent of a fixture: the larger side of its outline's bounding box. */
export function extentOf(fixture: HoledFixture): number {
    const xs = fixture.outline.map(vertex => vertex.x);
    const ys = fixture.outline.map(vertex => vertex.y);
    return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
}

/** Mirror a fixture in the vertical line `x = axis`, reversing every loop so each keeps its winding. */
export function mirrored(fixture: HoledFixture, axis: number, name: string): HoledFixture {
    const flip = (vertices: readonly Vector2[]) => vertices.map(vertex => ({x: 2 * axis - vertex.x, y: vertex.y})).reverse();
    const flipWeights = (weights: readonly number[] | undefined) => {
        if (weights === undefined) {
            return undefined;
        }
        // Edge i runs from vertex i to i + 1; reversed, it runs from m - 1 - (i + 1) to m - 1 - i.
        const m = weights.length;
        return weights.map((_unused, j) => weights[(m - 2 - j + m) % m]);
    };
    return {
        name,
        outline: flip(fixture.outline),
        weights: flipWeights(fixture.weights),
        holes: fixture.holes.map(hole => ({vertices: flip(hole.vertices), weights: flipWeights(hole.weights)})),
    };
}
