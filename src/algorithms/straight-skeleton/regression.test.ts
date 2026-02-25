import {ALL_TEST_POLYGONS} from './test-cases';
import {runAlgorithmV5} from './algorithm-termination-cases';

describe('V5 algorithm regression suite', () => {
    describe.each(ALL_TEST_POLYGONS)('$name', ({name, vertices}) => {
        it('completes without throwing', () => {
            expect(() => runAlgorithmV5(vertices)).not.toThrow();
        });

        it('accepts all exterior edges', () => {
            const ctx = runAlgorithmV5(vertices);
            const {graph} = ctx;
            for (let i = 0; i < graph.numExteriorNodes; i++) {
                expect(ctx.acceptedEdges[i]).toBe(true);
            }
        });

        it('edge count invariant holds', () => {
            const ctx = runAlgorithmV5(vertices);
            const {graph} = ctx;
            expect(graph.edges.length).toBe(graph.numExteriorNodes + graph.interiorEdges.length);
        });

        it('interior nodes are within bounding box', () => {
            const ctx = runAlgorithmV5(vertices);
            const {graph} = ctx;
            const xs = vertices.map(v => v.x);
            const ys = vertices.map(v => v.y);
            const minX = Math.min(...xs);
            const maxX = Math.max(...xs);
            const minY = Math.min(...ys);
            const maxY = Math.max(...ys);
            for (const node of graph.nodes.slice(graph.numExteriorNodes)) {
                expect(node.position.x).toBeGreaterThanOrEqual(minX - 1);
                expect(node.position.x).toBeLessThanOrEqual(maxX + 1);
                expect(node.position.y).toBeGreaterThanOrEqual(minY - 1);
                expect(node.position.y).toBeLessThanOrEqual(maxY + 1);
            }
        });
    });
});
