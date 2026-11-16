/*
 * THE SKELETON'S LOOPS INPUT (docs/notes/skeleton-loops-input-decisions.md, roadmap nodes 2 and 3). An outline
 * carries any number of holes on `options.holes`; every loop goes through the boundary stage, the graph gains a
 * loop table and the result a per-loop caller map, and initialisation builds one wavefront ring per loop. Gates
 * 44 to 47 of the spec. The holed solve's stop after initialisation, which these tests asserted as specified
 * behaviour until node 4 (decision 35), is retired (skeleton join-and-divide spec, decision 34): the initialisation
 * is now read at the first step boundary, and the solve is the join-and-divide tests' business.
 */
import type {SkeletonSolveResult, SolveSkeletonOptions, Vector2} from '@proc-geo/core';
import {
    adjacentExteriorEdge,
    canonicaliseForSolve,
    checkWavefront,
    findLoopConflict,
    groupLoopsByNesting,
    initBoundingPolygon,
    loopOfExteriorEdge,
    makeSkeletonNormalisation,
    makeStraightSkeletonSolverContext,
    REMOVED_VERTEX_INDEX,
    ringsOfWavefront,
    runAlgorithmV5,
    runAlgorithmV5Stepped,
    setSkeletonLogLevel,
    SkeletonDirection,
    SKELETON_NOISE_FLOOR,
    solveSkeleton,
} from '@proc-geo/core';
import {FULL_CORPUS} from '@proc-geo/test-fixtures';
import {setWavefrontProbe} from '@proc-geo/core/straight-skeleton/wavefront-check';
import {expectSoundHoledSolve} from './holed-test-helpers';

setSkeletonLogLevel('silent');

/** Clockwise (negative signed area) in this codebase's convention. */
const OUTLINE: Vector2[] = [{x: 0, y: 0}, {x: 0, y: 10}, {x: 10, y: 10}, {x: 10, y: 0}];

/** An axis-aligned square hole, counter-clockwise: the winding a hole is solved in. */
function squareHole(x0: number, y0: number, x1: number, y1: number): Vector2[] {
    return [{x: x0, y: y0}, {x: x1, y: y0}, {x: x1, y: y1}, {x: x0, y: y1}];
}

const range = (count: number): number[] => Array.from({length: count}, (_unused, index) => index);
const cross = (a: Vector2, b: Vector2) => a.x * b.y - a.y * b.x;
const sub = (a: Vector2, b: Vector2): Vector2 => ({x: a.x - b.x, y: a.y - b.y});

function distanceToSegment(p: Vector2, a: Vector2, b: Vector2): number {
    const d = sub(b, a);
    const lengthSquared = d.x * d.x + d.y * d.y;
    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * d.x + (p.y - a.y) * d.y) / lengthSquared));
    return Math.hypot(p.x - (a.x + t * d.x), p.y - (a.y + t * d.y));
}

/** The test's own positional tolerance, in caller units on a polygon of extent 10. */
const TOLERANCE = 1e-9;

interface LoopInput {
    vertices: Vector2[];
    /** The caller's weights for this loop, or undefined for all ones. */
    weights?: number[];
}

/**
 * Every property gate 45 names, on one holed solve: one ring per loop in vertex order, the wavefront sound over
 * the root input, decision 15's reflex classification, the weights per loop, no `holes-not-solved` (retired by
 * node 4), that the solve completes, and every caller edge carried by the solved edge its map names.
 */
function expectHoledInitialisation(
    outline: LoopInput,
    holes: LoopInput[],
): SkeletonSolveResult {
    const options: SolveSkeletonOptions = {
        weights: outline.weights,
        holes: holes.map(hole => ({vertices: hole.vertices, weights: hole.weights})),
    };
    // THE INITIALISATION IS READ AT THE FIRST STEP BOUNDARY, by the probe: since node 4 the holed solve steps on, and
    // the returned graph is the solve's, not the initialised one (skeleton join-and-divide spec, decision 34).
    let initialised: {ids: number[]; rings: number[][]; violations: string[]} | undefined;
    setWavefrontProbe({
        stepBoundary(boundaryContext, inputs) {
            if (initialised === undefined) {
                const ids = inputs.flatMap(input => input.interiorEdges);
                initialised = {ids, rings: ringsOfWavefront(boundaryContext, ids), violations: checkWavefront(boundaryContext, inputs)};
            }
        },
    });
    let result: SkeletonSolveResult;
    try {
        result = solveSkeleton(outline.vertices, options);
    } finally {
        setWavefrontProbe(null);
    }
    const {graph} = result;
    const context = result.context!;
    expect(context).not.toBeNull();
    expect(initialised).toBeDefined();
    const n = graph.numExteriorNodes;

    // The loop table: contiguous from 0, one entry per loop, tiling the exterior ids (decision 6).
    expect(graph.loops).toHaveLength(holes.length + 1);
    let next = 0;
    for (const loop of graph.loops) {
        expect(loop.start).toBe(next);
        expect(loop.count).toBeGreaterThanOrEqual(3);
        next += loop.count;
    }
    expect(next).toBe(n);

    // One bisector per exterior node, born in exterior id order (decision 12), one ring per loop (decision 13).
    const {ids, rings, violations} = initialised!;
    expect(ids).toEqual(range(n).map(i => n + i));
    expect(rings).toEqual(graph.loops.map(loop => range(loop.count).map(j => n + loop.start + j)));
    expect(violations).toEqual([]);

    // Each bisector's parents are its own loop's edges: clockwise the edge leaving its node, widdershins the
    // edge arriving (decision 12).
    for (const loop of graph.loops) {
        for (let j = 0; j < loop.count; j++) {
            const interior = context.getInteriorWithId(n + loop.start + j);
            expect(interior.clockwiseExteriorEdgeIndex).toBe(loop.start + j);
            expect(interior.widdershinsExteriorEdgeIndex).toBe(loop.start + (j - 1 + loop.count) % loop.count);
        }
    }

    // DECISION 15: a corner is reflex in the region exactly where the solved ring turns left, which for a hole
    // is where the corner is convex in the hole's own shape.
    for (const loop of graph.loops) {
        for (let j = 0; j < loop.count; j++) {
            const at = (local: number) => graph.nodes[loop.start + (local + loop.count) % loop.count].position;
            const turn = cross(sub(at(j), at(j - 1)), sub(at(j + 1), at(j)));
            expect(context.isReflexEdge(context.getInteriorWithId(n + loop.start + j))).toBe(turn > 0);
        }
    }

    // The stop after initialisation is retired (skeleton join-and-divide spec, decision 34): the solve steps on.
    // WHAT IT COMES TO, measured: every caller here solves, complete and with no causality diagnostic. Until node 5,
    // every caller but the turned square — each with a hole whose walls are parallel to the outline's — met events of
    // two rings at one moment at the root and was refused by name; the skeleton simultaneous-rings spec resolves those
    // layers.
    const kinds = result.diagnostics.map(diagnostic => diagnostic.kind);
    expect(kinds).not.toContain('holes-not-solved');
    expect(result.complete).toBe(true);
    expect(kinds).not.toContain('causality-violation');
    // AND THE WHOLE HOLED BATTERY (BSA.D314), not completeness alone: equal time, time order, the wavefront at every
    // step boundary, one strip per exterior edge tiling the region, containment, the direction and rate oracles, and
    // an interior graph that is connected, free of un-culled self-loops, with one cycle round each hole.
    expectSoundHoledSolve({
        name: 'a loops-input case',
        outline: outline.vertices,
        weights: outline.weights,
        holes: holes.map(hole => ({vertices: hole.vertices, weights: hole.weights})),
    });

    // The weights, concatenated in exterior id order (decision 34), and the caller's map (decision 24).
    expect(result.weights).toEqual(graph.exteriorWeights);
    const callerLoops = [outline, ...holes];
    const allWeights = callerLoops.flatMap(loop => loop.weights ?? loop.vertices.map(() => 1));
    const slowest = Math.min(...allWeights);
    expect(result.loopMaps).toHaveLength(callerLoops.length);
    callerLoops.forEach((loop, k) => {
        const map = result.loopMaps![k];
        const m = loop.vertices.length;
        expect(map.vertexToNode).toHaveLength(m);
        expect(map.edgeToEdge).toHaveLength(m);
        const {start, count} = graph.loops[k];
        for (let c = 0; c < m; c++) {
            const node = map.vertexToNode[c];
            if (node !== REMOVED_VERTEX_INDEX) {
                expect(node).toBeGreaterThanOrEqual(start);
                expect(node).toBeLessThan(start + count);
                expect(distanceToSegment(loop.vertices[c], graph.nodes[node].position, graph.nodes[node].position))
                    .toBeLessThanOrEqual(TOLERANCE);
            }
            const edge = map.edgeToEdge[c];
            expect(edge).toBeGreaterThanOrEqual(start);
            expect(edge).toBeLessThan(start + count);
            const from = graph.nodes[graph.edges[edge].source].position;
            const to = graph.nodes[graph.edges[edge].target!].position;
            expect(distanceToSegment(loop.vertices[c], from, to)).toBeLessThanOrEqual(TOLERANCE);
            expect(distanceToSegment(loop.vertices[(c + 1) % m], from, to)).toBeLessThanOrEqual(TOLERANCE);
            const callerWeight = (loop.weights ?? loop.vertices.map(() => 1))[c];
            expect(graph.exteriorWeights[edge]).toBe(callerWeight / slowest);
        }
    });
    return result;
}

describe('the skeleton loops input (skeleton-loops-input spec)', () => {
    describe('a single loop (gate 44)', () => {
        // A clockwise outline with a collinear vertex, so canonicalisation removes one and the map is not the identity.
        const clockwise: Vector2[] = [{x: 0, y: 0}, {x: 0, y: 5}, {x: 0, y: 10}, {x: 10, y: 10}, {x: 10, y: 0}];

        it('carries one loop of every exterior id', () => {
            const result = solveSkeleton(clockwise);
            expect(result.graph.loops).toEqual([{start: 0, count: result.graph.numExteriorNodes}]);
            expect(result.graph.numExteriorNodes).toBe(4);
            expect(result.complete).toBe(true);
        });

        it('maps the caller\'s vertices through canonicalisation exactly as canonicaliseForSolve does', () => {
            const result = solveSkeleton(clockwise);
            const map = result.loopMaps![0];
            expect(map.reversed).toBe(false);
            expect(map.vertexToNode).toEqual(canonicaliseForSolve(clockwise).indexRemap);
            expect(map.vertexToNode).toEqual([0, REMOVED_VERTEX_INDEX, 1, 2, 3]);
            // Caller edges 0 and 1 are both carried by the merged edge from node 0 (decision 24).
            expect(map.edgeToEdge).toEqual([0, 0, 1, 2, 3]);
        });

        it('maps a counter-clockwise loop through decision 24\'s reversal', () => {
            const counterClockwise = [...clockwise].reverse();
            const result = solveSkeleton(counterClockwise);
            const map = result.loopMaps![0];
            const remap = canonicaliseForSolve(counterClockwise).indexRemap;
            const m = result.graph.numExteriorNodes;
            expect(map.reversed).toBe(true);
            expect(map.vertexToNode).toEqual(remap.map(r => r === REMOVED_VERTEX_INDEX ? r : m - 1 - r));
            // The caller's [(10,0), (10,10), (0,10), (0,5), (0,0)] solves as [(0,0), (0,10), (10,10), (10,0)].
            expect(map.vertexToNode).toEqual([3, 2, 1, REMOVED_VERTEX_INDEX, 0]);
            expect(map.edgeToEdge).toEqual([2, 1, 0, 0, 3]);
        });

        it('gives every FULL_CORPUS solve one loop and a map, or the merged path\'s empty table and null (decisions 11, 25)', () => {
            for (const fixture of FULL_CORPUS) {
                const result = solveSkeleton(fixture.vertices);
                if (result.context === null) {
                    expect(result.loopMaps).toBeNull();
                    expect(result.graph.loops).toEqual([]);
                } else {
                    expect(result.graph.loops).toEqual([{start: 0, count: result.graph.numExteriorNodes}]);
                    expect(result.loopMaps).toHaveLength(1);
                    expect(result.loopMaps![0].vertexToNode).toHaveLength(fixture.vertices.length);
                }
            }
        });

        it('gives a self-intersecting solve the empty loop table and a null map (decisions 11, 25)', () => {
            const bowtie: Vector2[] = [{x: 0, y: 0}, {x: 0, y: 10}, {x: 10, y: 0}, {x: 10, y: 10}];
            const result = solveSkeleton(bowtie);
            expect(result.context).toBeNull();
            expect(result.loopMaps).toBeNull();
            expect(result.graph.loops).toEqual([]);
            expect(() => adjacentExteriorEdge(result.graph, 0, SkeletonDirection.Clockwise)).toThrow(/no loop table/);
            expect(() => loopOfExteriorEdge(result.graph, 0)).toThrow(/no loop table/);
        });
    });

    describe('the loop table and its accessors (decisions 6 to 11)', () => {
        const nodes = [...OUTLINE, ...squareHole(3, 3, 5, 5)];
        const loops = [{start: 0, count: 4}, {start: 4, count: 4}];

        it('wraps within each loop, clockwise and widdershins', () => {
            const graph = initBoundingPolygon(nodes, undefined, loops);
            expect(graph.loops).toEqual(loops);
            expect(range(8).map(id => adjacentExteriorEdge(graph, id, SkeletonDirection.Clockwise)))
                .toEqual([1, 2, 3, 0, 5, 6, 7, 4]);
            expect(range(8).map(id => adjacentExteriorEdge(graph, id, SkeletonDirection.Widdershins)))
                .toEqual([3, 0, 1, 2, 7, 4, 5, 6]);
            expect(range(8).map(id => loopOfExteriorEdge(graph, id))).toEqual([0, 0, 0, 0, 1, 1, 1, 1]);
        });

        it('targets each exterior edge at its own loop\'s next node', () => {
            const graph = initBoundingPolygon(nodes, undefined, loops);
            expect(graph.edges.map(edge => edge.target)).toEqual([1, 2, 3, 0, 5, 6, 7, 4]);
        });

        it('defaults to one loop of every node', () => {
            expect(initBoundingPolygon(OUTLINE).loops).toEqual([{start: 0, count: 4}]);
            expect(makeStraightSkeletonSolverContext(nodes, undefined, undefined, loops).graph.loops).toEqual(loops);
        });

        it('throws on a table that does not tile the nodes or holds a loop under three', () => {
            expect(() => initBoundingPolygon(nodes, undefined, [{start: 0, count: 4}])).toThrow(/tile/);
            expect(() => initBoundingPolygon(nodes, undefined, [{start: 0, count: 4}, {start: 5, count: 3}])).toThrow(/tile/);
            expect(() => initBoundingPolygon(nodes, undefined, [{start: 0, count: 6}, {start: 6, count: 2}])).toThrow(/at least 3/);
        });

        it('throws on an id that is not an exterior edge', () => {
            const graph = initBoundingPolygon(nodes, undefined, loops);
            expect(() => adjacentExteriorEdge(graph, 8, SkeletonDirection.Clockwise)).toThrow(/not an exterior edge/);
            expect(() => adjacentExteriorEdge(graph, -1, SkeletonDirection.Widdershins)).toThrow(/not an exterior edge/);
            expect(() => loopOfExteriorEdge(graph, 1.5)).toThrow(/not an exterior edge/);
        });
    });

    describe('holed initialisation (gate 45)', () => {
        it('an off-centre turned square hole', () => {
            const centre = {x: 6.2, y: 4.1};
            const hole = range(4).map(k => ({
                x: centre.x + 1.5 * Math.cos(0.4 + k * Math.PI / 2),
                y: centre.y + 1.5 * Math.sin(0.4 + k * Math.PI / 2),
            }));
            const result = expectHoledInitialisation({vertices: OUTLINE}, [{vertices: hole}]);
            const {context} = result;
            // Decision 15's worked example: a square hole's four bisectors are all reflex.
            expect(range(4).filter(j => context!.isReflexEdge(context!.getInteriorWithId(8 + 4 + j)))).toHaveLength(4);
            expect(range(4).filter(j => context!.isReflexEdge(context!.getInteriorWithId(8 + j)))).toHaveLength(0);
        });

        it('two holes', () => {
            const result = expectHoledInitialisation({vertices: OUTLINE},
                [{vertices: squareHole(1, 1, 3, 3)}, {vertices: squareHole(6, 5, 8, 8)}]);
            expect(result.graph.loops).toEqual([{start: 0, count: 4}, {start: 4, count: 4}, {start: 8, count: 4}]);
        });

        it('an L-shaped hole', () => {
            const hole: Vector2[] = [
                {x: 3, y: 3}, {x: 7, y: 3}, {x: 7, y: 5}, {x: 5, y: 5}, {x: 5, y: 7}, {x: 3, y: 7}];
            const result = expectHoledInitialisation({vertices: OUTLINE}, [{vertices: hole}]);
            const {context} = result;
            // Decision 15's worked example: five reflex bisectors, and the one at the L's inner corner (5, 5) is not.
            const reflex = range(6).map(j => context!.isReflexEdge(context!.getInteriorWithId(10 + 4 + j)));
            expect(reflex).toEqual([true, true, true, false, true, true]);
        });

        it('a weighted hole, divided by the smallest weight of every loop', () => {
            const result = expectHoledInitialisation(
                {vertices: OUTLINE, weights: [2, 2, 2, 2]},
                [{vertices: squareHole(3, 3, 6, 6), weights: [4, 8, 4, 8]}]);
            expect(result.graph.exteriorWeights).toEqual([1, 1, 1, 1, 2, 4, 2, 4]);
        });

        it('a hole given clockwise', () => {
            const hole: Vector2[] = [{x: 3, y: 3}, {x: 3, y: 5}, {x: 5, y: 5}, {x: 5, y: 3}];
            const result = expectHoledInitialisation({vertices: OUTLINE}, [{vertices: hole, weights: [1, 2, 3, 4]}]);
            const map = result.loopMaps![1];
            // Decision 24's worked example, at start s = 4.
            expect(map.reversed).toBe(true);
            expect(map.vertexToNode).toEqual([7, 6, 5, 4]);
            expect(map.edgeToEdge[0]).toBe(6);
            expect(result.graph.exteriorWeights.slice(4)).toEqual([3, 2, 1, 4]);
            const winding = result.diagnostics.filter(diagnostic => diagnostic.kind === 'winding-normalised');
            expect(winding).toHaveLength(1);
            expect(winding[0].detail).toMatch(/^Hole 0: /);
            expect(winding[0].detail).toContain('clockwise');
        });

        it('a hole with a collinear vertex', () => {
            const hole: Vector2[] = [{x: 3, y: 3}, {x: 4, y: 3}, {x: 5, y: 3}, {x: 5, y: 5}, {x: 3, y: 5}];
            const result = expectHoledInitialisation({vertices: OUTLINE}, [{vertices: hole}]);
            const map = result.loopMaps![1];
            expect(result.graph.loops[1]).toEqual({start: 4, count: 4});
            expect(map.vertexToNode).toEqual([4, REMOVED_VERTEX_INDEX, 5, 6, 7]);
            expect(map.edgeToEdge).toEqual([4, 4, 5, 6, 7]);
            const removed = result.diagnostics.filter(diagnostic => diagnostic.kind === 'vertices-canonicalised');
            expect(removed).toHaveLength(1);
            expect(removed[0].detail).toMatch(/^Hole 0: 1 vertex\(es\) removed/);
        });

        // DECISION 52: the caller's map through both renumberings at once, and through a removal at either end.
        it('a hole both canonicalised and reversed', () => {
            // Given clockwise with (3, 4) collinear: canonicalised to [(3,3), (3,5), (5,5), (5,3)], then solved
            // reversed as [(5,3), (5,5), (3,5), (3,3)] at start 4.
            const hole: Vector2[] = [{x: 3, y: 3}, {x: 3, y: 4}, {x: 3, y: 5}, {x: 5, y: 5}, {x: 5, y: 3}];
            const map = expectHoledInitialisation({vertices: OUTLINE}, [{vertices: hole}]).loopMaps![1];
            expect(map.reversed).toBe(true);
            expect(map.vertexToNode).toEqual([7, REMOVED_VERTEX_INDEX, 6, 5, 4]);
            // Caller edges 0 and 1 are both carried by solved edge 6, from (3,5) to (3,3).
            expect(map.edgeToEdge).toEqual([6, 6, 5, 4, 7]);
        });

        it('a hole whose vertex 0 is removed', () => {
            // (4, 3) is collinear between the last vertex (3, 3) and (5, 3); its edge is carried by the merged edge
            // from the nearest surviving vertex before it, which wraps to the hole's last vertex.
            const hole: Vector2[] = [{x: 4, y: 3}, {x: 5, y: 3}, {x: 5, y: 5}, {x: 3, y: 5}, {x: 3, y: 3}];
            const map = expectHoledInitialisation({vertices: OUTLINE}, [{vertices: hole}]).loopMaps![1];
            expect(map.reversed).toBe(false);
            expect(map.vertexToNode).toEqual([REMOVED_VERTEX_INDEX, 4, 5, 6, 7]);
            expect(map.edgeToEdge).toEqual([7, 4, 5, 6, 7]);
        });

        it('a hole whose last vertex is removed', () => {
            const hole: Vector2[] = [{x: 3, y: 3}, {x: 5, y: 3}, {x: 5, y: 5}, {x: 3, y: 5}, {x: 3, y: 4}];
            const map = expectHoledInitialisation({vertices: OUTLINE}, [{vertices: hole}]).loopMaps![1];
            expect(map.vertexToNode).toEqual([4, 5, 6, 7, REMOVED_VERTEX_INDEX]);
            expect(map.edgeToEdge).toEqual([4, 5, 6, 7, 7]);
        });

        it('a weight change at a hole\'s vertex 0, read with the hole\'s own wraparound', () => {
            // At a visible corner the change is accepted, and vertex 0's incoming weight is the hole's last.
            const result = expectHoledInitialisation({vertices: OUTLINE},
                [{vertices: squareHole(3, 3, 5, 5), weights: [2, 1, 1, 1]}]);
            expect(result.graph.exteriorWeights.slice(4)).toEqual([2, 1, 1, 1]);
            // At a collinear vertex 0 it is refused, naming that vertex.
            const collinearAtZero: Vector2[] = [{x: 4, y: 3}, {x: 5, y: 3}, {x: 5, y: 5}, {x: 3, y: 5}, {x: 3, y: 3}];
            expect(() => solveSkeleton(OUTLINE, {holes: [{vertices: collinearAtZero, weights: [2, 1, 1, 1, 1]}]}))
                .toThrow(/^Hole 0: Vertex 0 carries a weight change/);
            // A hole of one weight has no change at vertex 0, whatever the outline's last weight is: the hole's
            // last edge meets its own first edge, so the collinear vertex 0 is not refused and is removed.
            const uniform = solveSkeleton(OUTLINE, {holes: [{vertices: collinearAtZero, weights: [2, 2, 2, 2, 2]}]});
            expect(uniform.loopMaps![1].vertexToNode[0]).toBe(REMOVED_VERTEX_INDEX);
            expect(uniform.graph.exteriorWeights).toEqual([1, 1, 1, 1, 2, 2, 2, 2]);
        });
    });

    describe('refusals (gate 46)', () => {
        const solveWith = (holes: Vector2[][], options: SolveSkeletonOptions = {}) =>
            () => solveSkeleton(OUTLINE, {...options, holes: holes.map(vertices => ({vertices}))});

        it('a two-vertex hole', () => {
            expect(solveWith([[{x: 3, y: 3}, {x: 5, y: 3}]]))
                .toThrow('Hole 0: Must have at least three nodes to perform algorithm');
        });

        it('a non-finite hole vertex', () => {
            expect(solveWith([squareHole(3, 3, 5, 5), [{x: 6, y: 6}, {x: 8, y: 6}, {x: NaN, y: 8}]]))
                .toThrow(/^Hole 1: Vertex 2 is not finite/);
        });

        it('each weight-door refusal on a hole', () => {
            const hole = squareHole(3, 3, 5, 5);
            expect(() => solveSkeleton(OUTLINE, {holes: [{vertices: hole, weights: [1, 1, 1]}]}))
                .toThrow(/^Hole 0: Weight array has 3 entries/);
            expect(() => solveSkeleton(OUTLINE, {holes: [{vertices: hole, weights: [1, 1, 0, 1]}]}))
                .toThrow(/^Hole 0: Weight 2 is 0/);
            expect(() => solveSkeleton(OUTLINE, {holes: [{vertices: hole, weights: [1, Infinity, 1, 1]}]}))
                .toThrow(/^Hole 0: Weight 1 is Infinity/);
            // A weight change at a collinear vertex: vertex 1 of the hole sits on the chord of its neighbours.
            const collinear: Vector2[] = [{x: 3, y: 3}, {x: 4, y: 3}, {x: 5, y: 3}, {x: 5, y: 5}, {x: 3, y: 5}];
            expect(() => solveSkeleton(OUTLINE, {holes: [{vertices: collinear, weights: [1, 2, 2, 2, 1]}]}))
                .toThrow(/^Hole 0: Vertex 1 carries a weight change/);
        });

        it('a weight ratio within bound per loop and out of bound across loops', () => {
            const hole = {vertices: squareHole(3, 3, 5, 5), weights: [1e9, 1e9, 1e9, 1e9]};
            // Each loop alone is uniform.
            expect(solveSkeleton(squareHole(3, 3, 5, 5).reverse(), {weights: hole.weights}).complete).toBe(true);
            expect(() => solveSkeleton(OUTLINE, {holes: [hole]}))
                .toThrow(/exceeds maxWeightRatio.*edge 0 of hole 0 has weight 1000000000 and edge 0 of the outline has weight 1/);
        });

        it('a self-crossing hole', () => {
            const bowtie: Vector2[] = [{x: 3, y: 3}, {x: 5, y: 5}, {x: 5, y: 3}, {x: 3, y: 5}];
            expect(solveWith([bowtie])).toThrow(/^Loop conflict \(self-crossing\): hole 0 crosses itself/);
        });

        it('a self-crossing outline with a hole', () => {
            const bowtie: Vector2[] = [{x: 0, y: 0}, {x: 0, y: 10}, {x: 10, y: 0}, {x: 10, y: 10}];
            expect(() => solveSkeleton(bowtie, {holes: [{vertices: squareHole(1, 4, 2, 6)}]}))
                .toThrow(/^Loop conflict \(self-crossing\): the outline crosses itself/);
        });

        it('a hole crossing the outline', () => {
            expect(solveWith([squareHole(8, 3, 12, 5)]))
                .toThrow(/^Loop conflict \(crossing\): the outline's edge from vertex 2 to vertex 3 crosses hole 0's edge/);
        });

        it('two holes crossing', () => {
            expect(solveWith([squareHole(2, 2, 5, 5), squareHole(4, 4, 7, 7)]))
                .toThrow(/^Loop conflict \(crossing\): hole 0's edge .* crosses hole 1's edge/);
        });

        it('a hole outside the outline', () => {
            expect(solveWith([squareHole(12, 3, 14, 5)]))
                .toThrow(/^Loop conflict \(hole-outside-outline\): vertex 0 of hole 0 does not lie inside the outline/);
        });

        it('a hole in a hole', () => {
            expect(solveWith([squareHole(2, 2, 8, 8), squareHole(4, 4, 6, 6)]))
                .toThrow(/^Loop conflict \(hole-inside-hole\): vertex 0 of hole 1 lies inside hole 0/);
        });

        it('a hole vertex on an outline edge', () => {
            const touching: Vector2[] = [{x: 0, y: 5}, {x: 3, y: 3}, {x: 3, y: 7}];
            expect(solveWith([touching])).toThrow(/^Loop conflict \(contact\): the outline's edge .* hole 0's edge/);
        });

        it('a shared length of wall', () => {
            // The hole's left wall lies along the outline's left wall from y = 3 to y = 5. ANY COLLINEAR OVERLAP
            // PUTS AN ENDPOINT OF ONE SEGMENT ON THE OTHER, so an endpoint-to-segment distance of zero sees it
            // whatever rule reads those distances: this test cannot convict the distance rule, and the gap test
            // below is the one that does (BSA.D299).
            expect(solveWith([squareHole(0, 3, 3, 5)])).toThrow(/^Loop conflict \(contact\)/);
        });

        it('two holes in contact', () => {
            // They share one corner, (4, 4): an endpoint touch, which is no crossing, and a distance of zero.
            expect(solveWith([squareHole(2, 2, 4, 4), squareHole(4, 4, 6, 6)]))
                .toThrow(/^Loop conflict \(contact\): hole 0's edge .* hole 1's edge/);
        });

        it('a hole that touches itself (decision 49)', () => {
            // Two lobes pinched at (4, 4): vertices 2 and 5 coincide, so edges 1 and 4, which share no vertex,
            // meet there. No edge crosses another; the touch is an endpoint touch, which findFirstCrossing skips.
            const pinched: Vector2[] = [
                {x: 3, y: 3}, {x: 5, y: 3}, {x: 4, y: 4}, {x: 5, y: 5}, {x: 3, y: 5}, {x: 4, y: 4}];
            expect(solveWith([pinched]))
                .toThrow(/^Loop conflict \(contact\): hole 0 touches itself: hole 0's edge from vertex 1 to vertex 2 /);
            expect(findLoopConflict([OUTLINE, pinched], SKELETON_NOISE_FLOOR))
                .toEqual({kind: 'contact', loops: [1, 1], edges: [1, 4]});
            // A single loop with no holes is not asked, and solves as it always did.
            expect(() => solveSkeleton(pinched)).not.toThrow();
        });

        // THE FLOOR IS δ IN UNIT SPACE (decision 23): the outline's extent of 10 normalises by a power of two.
        const unitToCaller = makeSkeletonNormalisation(OUTLINE).fromUnitScale;

        it('a gap just under the perceptual floor', () => {
            const gap = 0.9 * SKELETON_NOISE_FLOOR * unitToCaller;
            expect(solveWith([squareHole(gap, 3, 3, 5)])).toThrow(/^Loop conflict \(contact\)/);
        });

        it('accepts a gap just over the perceptual floor', () => {
            const gap = 1.1 * SKELETON_NOISE_FLOOR * unitToCaller;
            const result = solveWith([squareHole(gap, 3, 3, 5)])();
            expect(result.loopMaps).toHaveLength(2);
        });

        it('a mis-wound loop under normaliseWinding: false', () => {
            const clockwiseHole: Vector2[] = [{x: 3, y: 3}, {x: 3, y: 5}, {x: 5, y: 5}, {x: 5, y: 3}];
            expect(solveWith([clockwiseHole], {normaliseWinding: false}))
                .toThrow(/^Hole 0 is wound clockwise/);
            expect(() => solveSkeleton([...OUTLINE].reverse(),
                {normaliseWinding: false, holes: [{vertices: squareHole(3, 3, 5, 5)}]}))
                .toThrow(/^The outline is wound counter-clockwise/);
            // A correctly wound holed input under the option is accepted, and a single loop solves as today.
            expect(solveWith([squareHole(3, 3, 5, 5)], {normaliseWinding: false})().loopMaps).toHaveLength(2);
            expect(solveSkeleton([...OUTLINE].reverse(), {normaliseWinding: false}).complete).toBe(false);
        });

        it('a degenerate hole', () => {
            const sliver: Vector2[] = [{x: 3, y: 3}, {x: 5, y: 3}, {x: 4, y: 3 + 4e-6}];
            expect(solveWith([sliver])).toThrow(/^Loop conflict \(degenerate-hole\): hole 0 has an area under/);
        });

        it('a sliver hole under normaliseWinding: false is degenerate, never mis-wound (decision 50)', () => {
            // Wound clockwise by its signed area, which decision 28 calls untrustworthy at this size.
            const sliver: Vector2[] = [{x: 3, y: 3}, {x: 4, y: 3 + 4e-6}, {x: 5, y: 3}];
            expect(solveWith([sliver], {normaliseWinding: false}))
                .toThrow(/^Loop conflict \(degenerate-hole\): hole 0 has an area under/);
        });

        it('holes on each legacy entry', () => {
            const options = {holes: [{vertices: squareHole(3, 3, 5, 5)}]} as unknown as Parameters<typeof runAlgorithmV5>[1];
            expect(() => runAlgorithmV5(OUTLINE, options)).toThrow(/takes no holes.*solveSkeleton/);
            const stepped = runAlgorithmV5Stepped(OUTLINE, options);
            expect(stepped.snapshots).toEqual([]);
            expect(stepped.error).toMatch(/takes no holes.*solveSkeleton/);
            // An empty list is no holes.
            expect(() => runAlgorithmV5(OUTLINE, {holes: []} as unknown as Parameters<typeof runAlgorithmV5>[1]))
                .not.toThrow();
        });

        it('names the caller\'s own vertex index through the loop\'s map', () => {
            // Given clockwise with a collinear vertex: (3, 4) is removed and the rest reversed, so the hole is
            // solved as [(5,3), (5,5), (3,5), (3,3)]. Its solved edge 0, the right wall, crosses the second hole,
            // and runs from the caller's vertex 4 to the caller's vertex 3.
            const first: Vector2[] = [{x: 3, y: 3}, {x: 3, y: 4}, {x: 3, y: 5}, {x: 5, y: 5}, {x: 5, y: 3}];
            const second = squareHole(4.5, 4, 7, 4.5);
            expect(solveWith([first, second]))
                .toThrow(/hole 0's edge from vertex 4 to vertex 3 crosses hole 1's edge from vertex 0 to vertex 1/);
        });
    });

    describe('findLoopConflict (decision 27)', () => {
        it('returns null for a sound outline and holes, and the first conflict in decision order', () => {
            expect(findLoopConflict([OUTLINE, squareHole(3, 3, 5, 5)], SKELETON_NOISE_FLOOR)).toBeNull();
            // A hole outside the outline that also crosses another hole: the crossing comes first.
            expect(findLoopConflict([OUTLINE, squareHole(2, 2, 5, 5), squareHole(4, 4, 7, 7), squareHole(12, 1, 13, 2)],
                SKELETON_NOISE_FLOOR)).toEqual({kind: 'crossing', loops: [1, 2], edges: [1, 0]});
        });

        it('looks for the kinds in the order of decisions 28 to 32', () => {
            // One conflict of each kind, placed apart; each is removed in turn and the next kind is reported.
            const bowtie: Vector2[] = [{x: 1, y: 1}, {x: 2, y: 2}, {x: 2, y: 1}, {x: 1, y: 2}];
            // In these caller units, not unit space: area 1e-7 against degenerateAreaBar's 2e-6 at δ = 1e-6.
            const sliver: Vector2[] = [{x: 6, y: 1}, {x: 8, y: 1}, {x: 7, y: 1 + 1e-7}];
            const crossingPair = [squareHole(2, 4, 4, 6), squareHole(3, 5, 5, 7)];
            const contactPair = [squareHole(6, 4, 7, 5), squareHole(7, 4, 8, 5)];
            const outside = squareHole(12, 1, 13, 2);
            const nestedPair = [squareHole(1, 7.5, 2.8, 9.5), squareHole(1.5, 8, 2.3, 9)];
            const kindOf = (holes: Vector2[][]) => findLoopConflict([OUTLINE, ...holes], SKELETON_NOISE_FLOOR)?.kind;
            expect(kindOf([bowtie, sliver, ...crossingPair, ...contactPair, outside, ...nestedPair])).toBe('self-crossing');
            expect(kindOf([sliver, ...crossingPair, ...contactPair, outside, ...nestedPair])).toBe('degenerate-hole');
            expect(kindOf([...crossingPair, ...contactPair, outside, ...nestedPair])).toBe('crossing');
            expect(kindOf([crossingPair[0], ...contactPair, outside, ...nestedPair])).toBe('contact');
            expect(kindOf([crossingPair[0], contactPair[0], outside, ...nestedPair])).toBe('hole-outside-outline');
            expect(kindOf([crossingPair[0], contactPair[0], ...nestedPair])).toBe('hole-inside-hole');
            expect(kindOf([crossingPair[0], contactPair[0], nestedPair[0]])).toBeUndefined();
        });
    });

    describe('groupLoopsByNesting (gate 47)', () => {
        it('two islands', () => {
            expect(groupLoopsByNesting([squareHole(0, 0, 4, 4), squareHole(6, 0, 10, 4)]))
                .toEqual([{outline: 0, holes: []}, {outline: 1, holes: []}]);
        });

        it('an island in a courtyard, depth 2', () => {
            const outer = squareHole(0, 0, 10, 10);
            const courtyard = squareHole(2, 2, 8, 8);
            const island = squareHole(4, 4, 6, 6);
            expect(groupLoopsByNesting([outer, courtyard, island]))
                .toEqual([{outline: 0, holes: [1]}, {outline: 2, holes: []}]);
        });

        it('follows input order, whatever the winding', () => {
            const outer = squareHole(0, 0, 10, 10).reverse();
            const courtyardA = squareHole(1, 1, 3, 3);
            const courtyardB = squareHole(5, 5, 9, 9).reverse();
            const island = squareHole(6, 6, 8, 8);
            expect(groupLoopsByNesting([island, courtyardB, outer, courtyardA]))
                .toEqual([{outline: 0, holes: []}, {outline: 2, holes: [1, 3]}]);
        });

        it('refuses an island touching its courtyard', () => {
            const outer = squareHole(0, 0, 10, 10);
            const courtyard = squareHole(2, 2, 8, 8);
            const island = squareHole(2, 4, 6, 6);
            expect(() => groupLoopsByNesting([outer, courtyard, island])).toThrow(/^Loop conflict \(contact\)/);
        });

        it('refuses crossing loops behind a self-crossing loop, which does not mask them (decision 38)', () => {
            // findLoopConflict would report the bowtie's self-crossing first and never reach the crossing pair.
            const outer = squareHole(0, 0, 10, 10);
            const bowtie: Vector2[] = [{x: 1, y: 1}, {x: 2, y: 2}, {x: 2, y: 1}, {x: 1, y: 2}];
            const crossingPair = [squareHole(4, 4, 6, 6), squareHole(5, 5, 7, 7)];
            expect(findLoopConflict([outer, bowtie, ...crossingPair], SKELETON_NOISE_FLOOR)?.kind).toBe('self-crossing');
            expect(() => groupLoopsByNesting([outer, bowtie, ...crossingPair]))
                .toThrow(/^Loop conflict \(crossing\): edge \d+ of loop 2 crosses edge \d+ of loop 3/);
            // And a self-crossing loop alone is left to its group's solve.
            expect(groupLoopsByNesting([outer, bowtie])).toEqual([{outline: 0, holes: [1]}]);
        });
    });
});
