/*
 * THE STEPPED TWIN OF `solveSkeleton`, AND THE PRIMARY PREVIEW'S LOOP TABLE (dashboard holed-fixtures spec, roadmap
 * node 7, decisions 17 to 23 and 46).
 *
 *  - `solveSkeletonStepped(vertices, options).result` is what `solveSkeleton(vertices, options)` returns, on every holed
 *    and every `FULL_CORPUS` fixture: the two entries run one pipeline, the stepped one through an observer;
 *  - snapshot 0 is the graph after initialisation and one follows each step boundary, each in caller space, each
 *    carrying the loop table, the last deep-equal to the result's graph;
 *  - `firstFailedSnapshot` names the snapshot after the first step that recorded a failure;
 *  - `runAlgorithmV5Stepped` keeps refusing holes and names the new entry;
 *  - `computePrimaryInteriorEdges` with a loop table wraps each vertex's walls in its own loop and targets every wall.
 */
import type {SkeletonSolveResult, StraightSkeletonSolverContext, Vector2} from '@proc-geo/core';
import {
    angularResolution,
    coaxialityFloor,
    computePrimaryInteriorEdges,
    runAlgorithmV5Stepped,
    setSkeletonLogLevel,
    SKELETON_NOISE_FLOOR,
    solveSkeleton,
    solveSkeletonStepped,
} from '@proc-geo/core';
import {FULL_CORPUS, HOLED_F1, HOLED_TEST_POLYGONS, holedSolveOptions} from '@proc-geo/test-fixtures';
import type {HoledTestPolygon} from '@proc-geo/test-fixtures';

setSkeletonLogLevel('silent');

/** Node 5's E′ (dashboard spec, decision 51): two holes in [0,21]×[0,10], every gap 3, refused at its first layer. */
const E_PRIME: HoledTestPolygon = {
    name: 'E′',
    outline: [{x: 0, y: 0}, {x: 0, y: 10}, {x: 21, y: 10}, {x: 21, y: 0}],
    holes: [
        {vertices: [{x: 3, y: 3}, {x: 9, y: 3}, {x: 9, y: 7}, {x: 3, y: 7}]},
        {vertices: [{x: 12, y: 3}, {x: 18, y: 3}, {x: 18, y: 7}, {x: 12, y: 7}]},
    ],
};

/**
 * A result as data: a solver context carries closures, and two solves' closures are never the same object, so the
 * context is compared by its own fields that are not functions.
 */
function dataOf(result: SkeletonSolveResult) {
    const context = result.context === null ? null : Object.fromEntries(
        Object.entries(result.context as StraightSkeletonSolverContext).filter(([, value]) => typeof value !== 'function'));
    return {...result, context};
}

const HOLED = HOLED_TEST_POLYGONS.map(fixture => [fixture.name, fixture] as const);
const CORPUS = FULL_CORPUS.map(fixture => [fixture.name, fixture.vertices] as const);

describe('solveSkeletonStepped returns what solveSkeleton returns (decisions 17 and 19)', () => {
    it.each(HOLED)('%s', (_name, fixture) => {
        const options = holedSolveOptions(fixture);
        expect(dataOf(solveSkeletonStepped(fixture.outline, options).result))
            .toEqual(dataOf(solveSkeleton(fixture.outline, options)));
    });

    it.each(CORPUS)('%s', (_name, vertices) => {
        expect(dataOf(solveSkeletonStepped(vertices).result)).toEqual(dataOf(solveSkeleton(vertices)));
    });

    it('E′, which is refused: the same diagnostics and the same incomplete graph', () => {
        const options = holedSolveOptions(E_PRIME);
        const stepped = solveSkeletonStepped(E_PRIME.outline, options);
        expect(stepped.result.complete).toBe(false);
        expect(dataOf(stepped.result)).toEqual(dataOf(solveSkeleton(E_PRIME.outline, options)));
    });

    it('throws exactly what solveSkeleton throws', () => {
        const crossing = {holes: [{vertices: [{x: 8, y: 4}, {x: 12, y: 4}, {x: 12, y: 6}, {x: 8, y: 6}]}]};
        let thrown = '';
        try {
            solveSkeleton(HOLED_F1.outline, crossing);
        } catch (error) {
            thrown = (error as Error).message;
        }
        expect(thrown).not.toBe('');
        expect(() => solveSkeletonStepped(HOLED_F1.outline, crossing)).toThrow(thrown);
    });
});

describe('the snapshots (decisions 17, 19 and 20)', () => {
    it.each(HOLED)('%s: one after initialisation and one per step boundary, each carrying the loop table', (_name, fixture) => {
        const {snapshots, result} = solveSkeletonStepped(fixture.outline, holedSolveOptions(fixture));
        expect(result.complete).toBe(true);
        // At least the initialisation and two steps: the observer runs after every step, not only at the start.
        expect(snapshots.length).toBeGreaterThan(2);
        for (const snapshot of snapshots) {
            expect(snapshot.loops).toEqual(result.graph.loops);
        }
        expect(snapshots[snapshots.length - 1]).toEqual(result.graph);
    });

    it('snapshot 0 is the initialised graph in caller space: the exterior nodes where the result has them, no target', () => {
        const {snapshots, result} = solveSkeletonStepped(HOLED_F1.outline, holedSolveOptions(HOLED_F1));
        const [first] = snapshots;
        const exterior = (positions: {position: Vector2}[]) => positions.map(node => node.position);
        expect(exterior(first.nodes.slice(0, first.numExteriorNodes)))
            .toEqual(exterior(result.graph.nodes.slice(0, result.graph.numExteriorNodes)));
        expect(first.nodes).toHaveLength(first.numExteriorNodes);
        expect(first.interiorEdges).toHaveLength(8);
        expect(first.interiorEdges.every(edge => first.edges[edge.id].target === undefined)).toBe(true);
    });

    it('denormalises every snapshot once: a snapshot\'s nodes are in the caller\'s units, as the result\'s are', () => {
        // F8's outline is about 30 units across, far from unit extent, so a snapshot left in unit space is far off.
        const fixture = HOLED_TEST_POLYGONS.find(candidate => candidate.name.startsWith('Holed F8'))!;
        const {snapshots, result} = solveSkeletonStepped(fixture.outline, holedSolveOptions(fixture));
        const lastPositions = new Map(result.graph.nodes.map(node => [node.id, node.position]));
        for (const [index, snapshot] of snapshots.entries()) {
            for (const node of snapshot.nodes) {
                const final = lastPositions.get(node.id)!;
                expect({index, node: node.id, x: node.position.x, y: node.position.y})
                    .toEqual({index, node: node.id, x: final.x, y: final.y});
            }
        }
    });

    it('a self-intersecting input has one snapshot, the merged result\'s graph', () => {
        // `solve-result.test.ts`'s self-intersecting pentagon: no FULL_CORPUS fixture takes the merged path.
        const crossing: Vector2[] = [{x: 0, y: 0}, {x: 0, y: 100}, {x: 100, y: 100}, {x: 100, y: 0}, {x: 60, y: 120}];
        const {snapshots, result} = solveSkeletonStepped(crossing);
        expect(result.context).toBeNull();
        expect(snapshots).toEqual([result.graph]);
        expect(snapshots[0]).not.toBe(result.graph);
    });
});

describe('a failed step is never silent (decisions 17 and 21)', () => {
    it('E′: the first failed snapshot is named, and the failure is on the result\'s diagnostics', () => {
        const {snapshots, result, firstFailedSnapshot} = solveSkeletonStepped(E_PRIME.outline, holedSolveOptions(E_PRIME));
        expect(firstFailedSnapshot).not.toBeNull();
        expect(firstFailedSnapshot!).toBeGreaterThan(0);
        expect(firstFailedSnapshot!).toBeLessThan(snapshots.length);
        const kinds = result.diagnostics.map(diagnostic => diagnostic.kind);
        expect(kinds).toContain('simultaneous-across-rings');
        expect(kinds).toContain('step-failure');
    });

    it.each(HOLED)('%s: no failed snapshot', (_name, fixture) => {
        expect(solveSkeletonStepped(fixture.outline, holedSolveOptions(fixture)).firstFailedSnapshot).toBeNull();
    });
});

describe('the legacy stepped entry keeps refusing holes (decision 18)', () => {
    it('names solveSkeletonStepped in its refusal', () => {
        const stepped = runAlgorithmV5Stepped(HOLED_F1.outline, {holes: HOLED_F1.holes} as never);
        expect(stepped.snapshots).toEqual([]);
        expect(stepped.error).toMatch(/takes no holes.*solveSkeleton/);
        expect(stepped.error).toContain('For snapshots of a holed solve, call solveSkeletonStepped.');
    });
});

describe('computePrimaryInteriorEdges with a loop table (decision 22)', () => {
    const floor = SKELETON_NOISE_FLOOR;
    const lane = coaxialityFloor(floor);
    const resolution = angularResolution(floor);
    const distanceToSegment = (p: Vector2, a: Vector2, b: Vector2) => {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
        return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
    };

    const f1 = () => {
        const result = solveSkeleton(HOLED_F1.outline, holedSolveOptions(HOLED_F1));
        const {graph} = result;
        const positions = graph.nodes.slice(0, graph.numExteriorNodes).map(node => node.position);
        return {result, graph, positions};
    };

    it('gives F1 eight edges, one per vertex, each ending on a wall of some loop that is not its own', () => {
        const {result, graph, positions} = f1();
        const edges = computePrimaryInteriorEdges(positions, lane, resolution, result.weights, graph.loops);
        expect(edges.map(edge => edge.vertexIndex)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
        const walls = Array.from({length: graph.numExteriorNodes}, (_unused, e) =>
            [positions[e], positions[graph.edges[e].target!]] as const);
        for (const edge of edges) {
            const onWall = walls.some(([a, b]) => distanceToSegment(edge.target, a, b) < 1e-9);
            expect({vertex: edge.vertexIndex, onWall}).toEqual({vertex: edge.vertexIndex, onWall: true});
        }
    });

    it('wraps each vertex\'s walls in its own loop: a hole corner bisects the hole\'s walls, not the outline\'s', () => {
        const {result, graph, positions} = f1();
        const withLoops = computePrimaryInteriorEdges(positions, lane, resolution, result.weights, graph.loops);
        const asOneRing = computePrimaryInteriorEdges(positions, lane, resolution, result.weights);
        // Vertex 4 is the hole's first corner E (8, 5.5); read as one ring its walls would be outline edge 3 and hole
        // edge 4, and its bisector would be another line.
        const at = (edges: typeof withLoops, vertex: number) => edges.find(edge => edge.vertexIndex === vertex);
        expect(at(withLoops, 4)).not.toEqual(at(asOneRing, 4));
        // E's bisector runs along +x, away from the hole, to the right wall at (10, 5.5).
        expect(at(withLoops, 4)!.target.x).toBeCloseTo(10, 9);
        expect(at(withLoops, 4)!.target.y).toBeCloseTo(5.5, 9);
    });

    it('omitted, is the single-ring preview, edge for edge, on every FULL_CORPUS fixture', () => {
        for (const {vertices} of FULL_CORPUS) {
            const one = [{start: 0, count: vertices.length}];
            expect(computePrimaryInteriorEdges(vertices, lane, resolution, undefined, one))
                .toEqual(computePrimaryInteriorEdges(vertices, lane, resolution));
        }
    });

    it('refuses a table that does not tile the vertices, or holds a loop of fewer than three', () => {
        const {result, positions} = f1();
        expect(() => computePrimaryInteriorEdges(positions, lane, resolution, result.weights,
            [{start: 0, count: 4}, {start: 4, count: 3}])).toThrow(/tile/);
        expect(() => computePrimaryInteriorEdges(positions, lane, resolution, result.weights,
            [{start: 0, count: 4}, {start: 5, count: 3}])).toThrow(/tile/);
        expect(() => computePrimaryInteriorEdges(positions, lane, resolution, result.weights,
            [{start: 0, count: 6}, {start: 6, count: 2}])).toThrow(/fewer than three/);
    });
});
