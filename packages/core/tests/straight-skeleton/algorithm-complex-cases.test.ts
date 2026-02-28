import {runAlgorithmV5} from '@proc-geo/core';
import {interiorNodes} from '@proc-geo/test-fixtures';
import {
    SQUARE,
    RECTANGLE,
    PENTAGON_HOUSE,
} from '@proc-geo/test-fixtures';

// ---------------------------------------------------------------------------
// Shape-specific assertions beyond what regression.test.ts covers.
// Generic invariants (no-throw, all-accepted, edge-count, bounding-box)
// are verified by regression.test.ts for every polygon.
// ---------------------------------------------------------------------------

describe('RunAlgorithmV5 — shape-specific results', () => {
    it('SQUARE: 1 interior node at center (1, 1)', () => {
        const ctx = runAlgorithmV5(SQUARE);
        const nodes = interiorNodes(ctx.graph);
        expect(nodes).toHaveLength(1);
        expect(nodes[0].position.x).toBeCloseTo(1, 4);
        expect(nodes[0].position.y).toBeCloseTo(1, 4);
    });

    it('RECTANGLE: 2 interior nodes at (1,1) and (3,1)', () => {
        const ctx = runAlgorithmV5(RECTANGLE);
        const nodes = interiorNodes(ctx.graph)
            .sort((a, b) => a.position.x - b.position.x);
        expect(nodes).toHaveLength(2);
        expect(nodes[0].position.x).toBeCloseTo(1, 4);
        expect(nodes[0].position.y).toBeCloseTo(1, 4);
        expect(nodes[1].position.x).toBeCloseTo(3, 4);
        expect(nodes[1].position.y).toBeCloseTo(1, 4);
    });

    it('PENTAGON_HOUSE: 2 interior nodes', () => {
        const ctx = runAlgorithmV5(PENTAGON_HOUSE);
        expect(interiorNodes(ctx.graph)).toHaveLength(2);
    });
});
