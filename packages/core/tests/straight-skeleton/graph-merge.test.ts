import {
    StraightSkeletonGraph,
    PolygonNode,
    PolygonEdge,
    InteriorEdge,
    Vector2,
} from '@proc-geo/core';
import {
    mergeSkeletonGraphs,
    makeMergedSolverContext,
    SubPolygonResult,
} from '@proc-geo/core';

const V = (x: number, y: number): Vector2 => ({x, y});

function makeNode(id: number, pos: Vector2, inEdges: number[] = [], outEdges: number[] = []): PolygonNode {
    return {id, position: pos, inEdges, outEdges};
}

function makeEdge(id: number, source: number, target: number | undefined, basis: Vector2): PolygonEdge {
    return {id, source, target, basisVector: basis};
}

function makeInterior(id: number, cw: number, ws: number): InteriorEdge {
    return {id, clockwiseExteriorEdgeIndex: cw, widdershinsExteriorEdgeIndex: ws, length: Number.MAX_VALUE};
}

/**
 * Build a minimal solved triangle graph.
 * 3 exterior nodes, 3 exterior edges, 3 interior edges converging to a center node.
 */
function makeTriangleGraph(vertices: Vector2[], centerPos: Vector2): StraightSkeletonGraph {
    const nodes: PolygonNode[] = [
        makeNode(0, vertices[0], [2], [0, 3]),  // exterior node 0
        makeNode(1, vertices[1], [0], [1, 4]),  // exterior node 1
        makeNode(2, vertices[2], [1], [2, 5]),  // exterior node 2
        makeNode(3, centerPos, [3, 4, 5], []),  // interior node (center)
    ];

    const basis01 = V(1, 0);
    const basis12 = V(0, -1);
    const basis20 = V(-1, 0);

    const edges: PolygonEdge[] = [
        makeEdge(0, 0, 1, basis01),  // exterior edge 0→1
        makeEdge(1, 1, 2, basis12),  // exterior edge 1→2
        makeEdge(2, 2, 0, basis20),  // exterior edge 2→0
        makeEdge(3, 0, 3, V(0.5, -0.5)),  // interior bisector at node 0
        makeEdge(4, 1, 3, V(-0.5, -0.5)), // interior bisector at node 1
        makeEdge(5, 2, 3, V(-0.5, 0.5)),  // interior bisector at node 2
    ];

    const interiorEdges: InteriorEdge[] = [
        makeInterior(3, 0, 2),
        makeInterior(4, 1, 0),
        makeInterior(5, 2, 1),
    ];

    return {nodes, edges, numExteriorNodes: 3, interiorEdges};
}

describe('graph-merge', () => {
    describe('mergeSkeletonGraphs', () => {
        it('returns empty graph for empty input', () => {
            const result = mergeSkeletonGraphs([], []);
            expect(result.graph.nodes.length).toBe(0);
            expect(result.graph.edges.length).toBe(0);
        });

        it('returns single graph unchanged when no crossing points', () => {
            const graph = makeTriangleGraph(
                [V(0, 0), V(10, 0), V(5, -10)],
                V(5, -3),
            );
            const result = mergeSkeletonGraphs([{graph}], []);
            expect(result.graph.nodes.length).toBe(graph.nodes.length);
            expect(result.graph.edges.length).toBe(graph.edges.length);
            expect(result.graph.interiorEdges.length).toBe(graph.interiorEdges.length);
        });

        it('merges two triangle graphs with renumbered IDs', () => {
            const g1 = makeTriangleGraph(
                [V(0, 0), V(10, 0), V(5, -5)],
                V(5, -2),
            );
            const g2 = makeTriangleGraph(
                [V(10, 0), V(20, 0), V(15, -5)],
                V(15, -2),
            );

            const result = mergeSkeletonGraphs([{graph: g1}, {graph: g2}], []);

            // 4 nodes each = 8 total (no shared crossing points)
            expect(result.graph.nodes.length).toBe(8);
            // 6 edges each = 12 total
            expect(result.graph.edges.length).toBe(12);
            // 3 interior edges each = 6 total
            expect(result.graph.interiorEdges.length).toBe(6);
            // numExteriorNodes = 3 + 3 = 6
            expect(result.graph.numExteriorNodes).toBe(6);

            // Check that node IDs are contiguous
            for (let i = 0; i < result.graph.nodes.length; i++) {
                expect(result.graph.nodes[i].id).toBe(i);
            }

            // Check that edge source/target reference valid nodes
            for (const edge of result.graph.edges) {
                expect(edge.source).toBeGreaterThanOrEqual(0);
                expect(edge.source).toBeLessThan(result.graph.nodes.length);
                if (edge.target !== undefined) {
                    expect(edge.target).toBeGreaterThanOrEqual(0);
                    expect(edge.target).toBeLessThan(result.graph.nodes.length);
                }
            }
        });

        it('deduplicates nodes at crossing points', () => {
            // Two triangles sharing a vertex at (5, -5) — a crossing point
            const g1 = makeTriangleGraph(
                [V(0, 0), V(10, 0), V(5, -5)],
                V(5, -2),
            );
            const g2 = makeTriangleGraph(
                [V(5, -5), V(15, -5), V(10, -10)],
                V(10, -7),
            );

            const crossingPoints = [V(5, -5)];
            const result = mergeSkeletonGraphs([{graph: g1}, {graph: g2}], crossingPoints);

            // 4 + 4 = 8 nodes, minus 1 duplicate = 7
            expect(result.graph.nodes.length).toBe(7);
            // Should have 1 crossing node
            expect(result.crossingNodeIndices.length).toBe(1);

            // All edges should reference valid nodes
            for (const edge of result.graph.edges) {
                expect(edge.source).toBeGreaterThanOrEqual(0);
                expect(edge.source).toBeLessThan(result.graph.nodes.length);
                if (edge.target !== undefined) {
                    expect(edge.target).toBeGreaterThanOrEqual(0);
                    expect(edge.target).toBeLessThan(result.graph.nodes.length);
                }
            }
        });

        it('interior edge parent references are renumbered', () => {
            const g1 = makeTriangleGraph(
                [V(0, 0), V(10, 0), V(5, -5)],
                V(5, -2),
            );
            const g2 = makeTriangleGraph(
                [V(10, 0), V(20, 0), V(15, -5)],
                V(15, -2),
            );

            const result = mergeSkeletonGraphs([{graph: g1}, {graph: g2}], []);

            // g2's interior edges should have parent refs offset by g1's edge count (6)
            const g2InteriorEdges = result.graph.interiorEdges.slice(3);
            expect(g2InteriorEdges[0].clockwiseExteriorEdgeIndex).toBe(6 + 0); // was 0, now 6
            expect(g2InteriorEdges[0].widdershinsExteriorEdgeIndex).toBe(6 + 2); // was 2, now 8
        });
    });

    describe('makeMergedSolverContext', () => {
        it('wraps a merged graph with all edges accepted', () => {
            const graph = makeTriangleGraph(
                [V(0, 0), V(10, 0), V(5, -10)],
                V(5, -3),
            );
            const merged = mergeSkeletonGraphs([{graph}], []);
            const ctx = makeMergedSolverContext(merged);

            expect(ctx.graph).toBe(merged.graph);
            expect(ctx.isAccepted(0)).toBe(true);
            expect(ctx.isAccepted(5)).toBe(true);
        });

        it('throws on algorithm-only helper methods', () => {
            const graph = makeTriangleGraph(
                [V(0, 0), V(10, 0), V(5, -10)],
                V(5, -3),
            );
            const merged = mergeSkeletonGraphs([{graph}], []);
            const ctx = makeMergedSolverContext(merged);

            expect(() => ctx.projectRay(graph.edges[0])).toThrow('not supported on merged');
            expect(() => ctx.edgeRank(0)).toThrow('not supported on merged');
        });
    });
});
