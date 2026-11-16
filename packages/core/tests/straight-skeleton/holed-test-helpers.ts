/*
 * WHAT THE HOLED INSTRUMENTS NEED THAT HAS NO HOME ELSEWHERE (skeleton loop-consumers spec, decision 33).
 *
 * Node 4 kept holed copies here of the single-loop helpers it could not yet trust on a holed graph (the join-and-divide
 * spec, decision 43). Node 6 generalised each in its HOME FILE, reading each exterior edge's own ends, and the copies
 * are gone: containment is `escapedNodesOf` in `containment-helpers.ts`, the tiling is `holedTilingError` in
 * `wavefront-measurement-helpers.ts` (the traced-face area sum is retired: the strip tiling at depth fraction 1.0
 * asserts the same identity through `computeStrips`), and the rate and direction oracles are that file's. What stays
 * is what no home file holds:
 *
 *  - the step-boundary probe and the story of a solve;
 *  - the weighted equi-time check and the weighted time order, written independently of the solver's oracles;
 *  - the interior graph's shape: connected, no self-loop, cycle rank;
 *  - the battery `expectSoundHoledSolve`, which node 5's closed forms run under two translations as well (the
 *    simultaneous-rings spec, decision 38), built on the home helpers.
 */
import type {
    AlgorithmStepInput,
    SkeletonSolveResult,
    SolveSkeletonOptions,
    StraightSkeletonGraph,
    StraightSkeletonSolverContext,
    Vector2,
} from '@proc-geo/core';
import {
    checkWavefront,
    computeMaxOffset,
    computeStrips,
    ringsOfWavefront,
    SKELETON_NOISE_FLOOR,
    solveSkeleton,
} from '@proc-geo/core';
import {setWavefrontProbe} from '@proc-geo/core/straight-skeleton/wavefront-check';
import {HoledTestPolygon, holedSolveOptions} from '@proc-geo/test-fixtures';
import {escapedNodesOf} from './containment-helpers';
import {holedTilingError, oracleViolationsOf, rateViolations} from './wavefront-measurement-helpers';

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

/**
 * Solve a holed fixture through `holedSolveOptions` with a probe that records every step boundary, always removing
 * the probe afterwards.
 */
export function solveHoled(fixture: HoledTestPolygon, options: SolveSkeletonOptions = {}): HoledSolve {
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
        const result = solveSkeleton(fixture.outline, holedSolveOptions(fixture, options));
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

/**
 * THE WEIGHTED EQUI-TIME CHECK: at every interior node, every wall that names a bisector meeting there is at one
 * TIME, its perpendicular distance divided by its weight. Returns the nodes whose times spread by more than
 * `tolerance`. The solver's causality oracles date a node from ONE parent, so they cannot see a spread between its
 * parents; this check can, and it is written here independently of them.
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

/**
 * THE WEIGHTED TIME ORDER: every interior edge's target is no earlier than its source. A node's time is its
 * perpendicular distance to the line of one wall naming a bisector incident to it (the clockwise parent of its
 * lowest-id incident interior edge) over that wall's weight; an exterior node's is 0. Returns the edges whose target
 * is earlier by more than `tolerance`. With {@link equiTimeViolations} clean the choice of wall changes no verdict.
 */
export function timeOrderViolations(graph: StraightSkeletonGraph, tolerance: number): string[] {
    const dating = new Map<number, {edge: number; wall: number}>();
    for (const interior of graph.interiorEdges) {
        const edge = graph.edges[interior.id];
        for (const node of [edge.source, edge.target]) {
            if (node === undefined || node < graph.numExteriorNodes) {
                continue;
            }
            const held = dating.get(node);
            if (held === undefined || interior.id < held.edge) {
                dating.set(node, {edge: interior.id, wall: interior.clockwiseExteriorEdgeIndex});
            }
        }
    }
    const timeOf = (node: number): number => {
        const held = dating.get(node);
        if (node < graph.numExteriorNodes || held === undefined) {
            return 0;
        }
        const a = graph.nodes[graph.edges[held.wall].source].position;
        const b = graph.nodes[graph.edges[held.wall].target!].position;
        const p = graph.nodes[node].position;
        const distance = Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / Math.hypot(b.x - a.x, b.y - a.y);
        return distance / graph.exteriorWeights[held.wall];
    };
    const found: string[] = [];
    for (const interior of graph.interiorEdges) {
        const edge = graph.edges[interior.id];
        if (edge.target === undefined) {
            continue;
        }
        const from = timeOf(edge.source);
        const to = timeOf(edge.target);
        if (to < from - tolerance) {
            found.push(`edge ${interior.id}: node ${edge.source} at time ${from} -> node ${edge.target} at time ${to}`);
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
 * both endpoints are one arc. Counted twice, every corridor midline would add a cycle the skeleton does not have.
 *
 * A CULLED EDGE IS SKIPPED BEFORE ANYTHING IS COUNTED, as `collectTreeEdges` skips it: the solver retired it as a
 * zero-length self-loop at a degenerate closure (`applyDegenerateClosure`), it carries no geometry, and sound
 * single-loop solves carry such edges routinely. Only a self-loop NOT marked culled is a defect (BSA.F103, BSA.D314):
 * counting a culled one made the red test `2h-int-113` red for the wrong reason.
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
        if (interior.culled) {
            continue;
        }
        const edge = graph.edges[interior.id];
        if (edge.target === undefined) {
            unresolved.push(interior.id);
            continue;
        }
        if (edge.target === edge.source) {
            selfLoops.push(interior.id);
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
export function extentOf(fixture: HoledTestPolygon): number {
    const xs = fixture.outline.map(vertex => vertex.x);
    const ys = fixture.outline.map(vertex => vertex.y);
    return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
}

/** The two kinds a step of several rings is refused with. */
export const REFUSAL_KINDS = ['simultaneous-across-rings', 'multi-ring-step-refused'];

/**
 * THE BATTERY OF JOIN-AND-DIVIDE DECISION 42, on one fixture, built on the home helpers (loop-consumers spec,
 * decision 33). The roster's own sweeps assert each of these properties in its home file; this battery is kept for
 * what the roster does not hold — node 5's closed forms under translation (the simultaneous-rings spec, decision 38)
 * and the red-by-design courtyards — and asserts in the order it always has. Returns the solve and the interior
 * graph's shape for further assertions.
 */
export function expectSoundHoledSolve(fixture: HoledTestPolygon, options: SolveSkeletonOptions = {}) {
    const solve = solveHoled(fixture, options);
    const {result, boundaries} = solve;
    const {graph} = result;
    const kinds = result.diagnostics.map(diagnostic => diagnostic.kind);

    // Complete, with no refusal and no causality diagnostic. The oracles compare times (BSA.D309), so a weighted
    // fixture is held to them as every other fixture is.
    expect(kinds.filter(kind => REFUSAL_KINDS.includes(kind) || kind === 'step-failure' || kind === 'unresolved-edges'))
        .toEqual([]);
    expect(result.diagnostics
        .flatMap(diagnostic => diagnostic.kind === 'causality-violation' ? [`${diagnostic.oracle} ${diagnostic.elementId}`] : []))
        .toEqual([]);
    // The weight-aware properties, re-derived here: one time at every interior node, and no edge running backwards in it.
    expect(equiTimeViolations(graph, 1e-9 * extentOf(fixture))).toEqual([]);
    expect(timeOrderViolations(graph, 1e-9 * extentOf(fixture))).toEqual([]);
    expect(result.complete).toBe(true);

    // `checkWavefront` empty at every step boundary.
    expect(boundaries.flatMap((boundary, step) => boundary.violations.map(v => `step ${step}: ${v}`))).toEqual([]);

    // One strip per exterior edge of every loop, at full depth, tiling the region: the outline's area less the
    // holes' (loop-consumers spec, decisions 14 and 35). The bar is node 4's, which the translated cells need.
    const maxOffset = computeMaxOffset(result);
    expect(computeStrips(result, {depth: maxOffset}).map(strip => strip.supportingEdgeIds))
        .toEqual(Array.from({length: graph.numExteriorNodes}, (_unused, id) => [id]));
    expect(holedTilingError(result, maxOffset)).toBeLessThan(1e-12);

    // Every interior node inside the outline and outside every hole.
    expect(escapedNodesOf(graph, fixture.outline, fixture.holes)).toEqual([]);

    // The test-side direction and rate oracles clean, at the floor the solve ran at.
    expect(oracleViolationsOf(result, SKELETON_NOISE_FLOOR).direction).toEqual([]);
    expect(rateViolations(graph, SKELETON_NOISE_FLOOR)).toEqual([]);

    // The interior graph connected, with no self-loop and a cycle rank equal to the hole count.
    const shape = interiorGraphShape(graph);
    expect(shape.unresolved).toEqual([]);
    expect(shape.selfLoops).toEqual([]);
    expect(shape.components).toBe(1);
    expect(shape.cycleRank).toBe(fixture.holes.length);
    return {...solve, shape};
}

// ── Closed forms (simultaneous-rings spec, decision 38; flat-ring and third-front spec, decision 50) ──────────────────

/** A clockwise axis-aligned rectangle outline. */
export function outlineRect(x0: number, y0: number, x1: number, y1: number): Vector2[] {
    return [{x: x0, y: y0}, {x: x0, y: y1}, {x: x1, y: y1}, {x: x1, y: y0}];
}

/** A counter-clockwise axis-aligned rectangle hole: its edges are the bottom, right, top and left walls, in that order. */
export function holeRect(x0: number, y0: number, x1: number, y1: number): Vector2[] {
    return [{x: x0, y: y0}, {x: x1, y: y0}, {x: x1, y: y1}, {x: x0, y: y1}];
}

/** One node of a closed form: where it is and when. */
export interface ExpectedNode {
    name: string;
    at: Vector2;
    t: number;
}

/** The closed form of one fixture: its interior nodes, its counts, and the ridges that carry two half-edges. */
export interface ClosedForm {
    nodes: ExpectedNode[];
    totalNodes: number;
    interiorEdges: number;
    /** Pairs of node names joined by two interior edges, one each way: the ridges of anti-parallel walls. */
    ridges: [string, string][];
}

/**
 * THE REFUSAL SPECIMEN (skeleton flat-ring and third-front spec, decision 53; it replaces node 5's E′, which those rules
 * cure): grid draw `uniform-1-523` of building-shell's two-courtyard fuzz, in cm, `GridDraw523` of `HOLED_REFUSALS`. A
 * 1350 by 700 block with a wing [1350, 1700] × [450, 650] on its E side, round the holes [900, 1150] × [300, 450] and
 * [150, 550] × [200, 600]. A later layer gathers two bisectors of one ring and one of the other at one node, a vertex
 * event across rings of three runs, whose pairing the links cannot read: refused by name under simultaneous-rings
 * decision 21, neither the flat-ring nor the third-front rule firing.
 */
export const GRID_DRAW_523: HoledTestPolygon = {
    name: 'grid draw uniform-1-523: three runs at one node',
    outline: [{x: 0, y: 0}, {x: 0, y: 700}, {x: 1350, y: 700}, {x: 1350, y: 650}, {x: 1700, y: 650}, {x: 1700, y: 450},
        {x: 1350, y: 450}, {x: 1350, y: 0}],
    holes: [{vertices: holeRect(900, 300, 1150, 450)}, {vertices: holeRect(150, 200, 550, 600)}],
};

/** A rigid motion of the plane, applied to a fixture's every loop and to its closed form's every node. */
export type Motion = (point: Vector2) => Vector2;

export const STILL: Motion = point => point;

export function moved(fixture: HoledTestPolygon, motion: Motion, label: string): HoledTestPolygon {
    const move = (vertices: readonly Vector2[]) => vertices.map(motion);
    return {
        ...fixture,
        name: `${fixture.name} ${label}`,
        outline: move(fixture.outline),
        holes: fixture.holes.map(hole => ({...hole, vertices: move(hole.vertices)})),
    };
}

export function translated(fixture: HoledTestPolygon, offset: Vector2): HoledTestPolygon {
    return moved(fixture, v => ({x: v.x + offset.x, y: v.y + offset.y}), `+ (${offset.x}, ${offset.y})`);
}

/** The closed form, node by node, under {@link expectSoundHoledSolve}: one interior node within the tolerance of each. */
export function expectClosedForm(fixture: HoledTestPolygon, form: ClosedForm, motion: Motion = STILL) {
    const {result} = expectSoundHoledSolve(fixture);
    const {graph} = result;
    const tolerance = 1e-9 * extentOf(fixture);
    const named = new Map<string, number>();
    const found = form.nodes.map(expected => {
        const at = motion(expected.at);
        const matches = graph.nodes.slice(graph.numExteriorNodes)
            .filter(node => Math.hypot(node.position.x - at.x, node.position.y - at.y) <= tolerance);
        if (matches.length === 1) {
            named.set(expected.name, matches[0].id);
        }
        return {name: expected.name, matches: matches.length};
    });
    expect(found).toEqual(form.nodes.map(expected => ({name: expected.name, matches: 1})));
    expect(graph.nodes).toHaveLength(form.totalNodes);
    expect(graph.interiorEdges).toHaveLength(form.interiorEdges);

    // Each node's time: its distance to the line of each wall that names a bisector meeting there, over that wall's
    // weight. Every such wall must give the closed form's time.
    const wallTime = (p: Vector2, wall: number) => {
        const a = graph.nodes[graph.edges[wall].source].position;
        const b = graph.nodes[graph.edges[wall].target!].position;
        const distance = Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / Math.hypot(b.x - a.x, b.y - a.y);
        return distance / graph.exteriorWeights[wall];
    };
    for (const expected of form.nodes) {
        const id = named.get(expected.name)!;
        const walls = new Set(graph.interiorEdges
            .filter(interior => graph.edges[interior.id].source === id || graph.edges[interior.id].target === id)
            .flatMap(interior => [interior.clockwiseExteriorEdgeIndex, interior.widdershinsExteriorEdgeIndex]));
        const times = [...walls].map(wall => wallTime(graph.nodes[id].position, wall));
        expect({name: expected.name, walls: walls.size >= 3, spread: Math.max(...times) - Math.min(...times) <= tolerance})
            .toEqual({name: expected.name, walls: true, spread: true});
        expect({name: expected.name, t: times[0]}).toEqual({name: expected.name, t: expect.closeTo(expected.t, 9)});
    }

    // The ridges between anti-parallel walls carry two half-edges, one each way (decision 11).
    for (const [first, second] of form.ridges) {
        const a = named.get(first)!;
        const b = named.get(second)!;
        const ways = graph.interiorEdges
            .map(interior => graph.edges[interior.id])
            .filter(edge => (edge.source === a && edge.target === b) || (edge.source === b && edge.target === a))
            .map(edge => edge.source === a ? 'forward' : 'back')
            .sort();
        expect({ridge: `${first}-${second}`, ways}).toEqual({ridge: `${first}-${second}`, ways: ['back', 'forward']});
    }
    return result;
}
