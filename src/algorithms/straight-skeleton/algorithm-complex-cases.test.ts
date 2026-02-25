import {runAlgorithmV5} from './algorithm-termination-cases';
import type {StraightSkeletonGraph, Vector2} from './types';
import {
    SQUARE,
    RECTANGLE,
    PENTAGON_HOUSE,
    DEFAULT_PENTAGON,
    AWKWARD_HEXAGON,
    AWKWARD_HEPTAGON,
    SYMMETRICAL_OCTAGON,
    IMPOSSIBLE_OCTAGON,
    BROKEN_POLYGON,
} from './test-constants';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const interiorNodes = (g: StraightSkeletonGraph) => g.nodes.slice(g.numExteriorNodes);

function boundingBox(verts: Vector2[]) {
    const xs = verts.map(v => v.x);
    const ys = verts.map(v => v.y);
    return {
        minX: Math.min(...xs), maxX: Math.max(...xs),
        minY: Math.min(...ys), maxY: Math.max(...ys),
    };
}

// ---------------------------------------------------------------------------
// Group 1: Quadrilaterals
// ---------------------------------------------------------------------------

describe('RunAlgorithmV5 — quadrilaterals', () => {
    describe('SQUARE', () => {
        it('does not throw', () => {
            expect(() => runAlgorithmV5(SQUARE)).not.toThrow();
        });

        it('all exterior edges are accepted', () => {
            const ctx = runAlgorithmV5(SQUARE);
            for (let i = 0; i < ctx.graph.numExteriorNodes; i++) {
                expect(ctx.acceptedEdges[i]).toBe(true);
            }
        });

        it('produces exactly 1 interior node', () => {
            const ctx = runAlgorithmV5(SQUARE);
            expect(interiorNodes(ctx.graph)).toHaveLength(1);
        });

        it('interior node is at center (1, 1)', () => {
            const ctx = runAlgorithmV5(SQUARE);
            const [node] = interiorNodes(ctx.graph);
            expect(node.position.x).toBeCloseTo(1, 4);
            expect(node.position.y).toBeCloseTo(1, 4);
        });

        it('interior nodes lie inside bounding box', () => {
            const ctx = runAlgorithmV5(SQUARE);
            const bb = boundingBox(SQUARE);
            for (const n of interiorNodes(ctx.graph)) {
                expect(n.position.x).toBeGreaterThan(bb.minX);
                expect(n.position.x).toBeLessThan(bb.maxX);
                expect(n.position.y).toBeGreaterThan(bb.minY);
                expect(n.position.y).toBeLessThan(bb.maxY);
            }
        });

        it('total edges = numExteriorNodes + interiorEdges.length', () => {
            const ctx = runAlgorithmV5(SQUARE);
            const g = ctx.graph;
            expect(g.edges.length).toBe(g.numExteriorNodes + g.interiorEdges.length);
        });
    });

    describe('RECTANGLE', () => {
        it('does not throw', () => {
            expect(() => runAlgorithmV5(RECTANGLE)).not.toThrow();
        });

        it('all exterior edges are accepted', () => {
            const ctx = runAlgorithmV5(RECTANGLE);
            for (let i = 0; i < ctx.graph.numExteriorNodes; i++) {
                expect(ctx.acceptedEdges[i]).toBe(true);
            }
        });

        it('produces exactly 2 interior nodes', () => {
            const ctx = runAlgorithmV5(RECTANGLE);
            expect(interiorNodes(ctx.graph)).toHaveLength(2);
        });

        it('interior nodes are at (1,1) and (3,1)', () => {
            const ctx = runAlgorithmV5(RECTANGLE);
            const nodes = interiorNodes(ctx.graph)
                .sort((a, b) => a.position.x - b.position.x);
            expect(nodes[0].position.x).toBeCloseTo(1, 4);
            expect(nodes[0].position.y).toBeCloseTo(1, 4);
            expect(nodes[1].position.x).toBeCloseTo(3, 4);
            expect(nodes[1].position.y).toBeCloseTo(1, 4);
        });

        it('interior nodes lie inside bounding box', () => {
            const ctx = runAlgorithmV5(RECTANGLE);
            const bb = boundingBox(RECTANGLE);
            for (const n of interiorNodes(ctx.graph)) {
                expect(n.position.x).toBeGreaterThan(bb.minX);
                expect(n.position.x).toBeLessThan(bb.maxX);
                expect(n.position.y).toBeGreaterThan(bb.minY);
                expect(n.position.y).toBeLessThan(bb.maxY);
            }
        });

        it('total edges = numExteriorNodes + interiorEdges.length', () => {
            const ctx = runAlgorithmV5(RECTANGLE);
            const g = ctx.graph;
            expect(g.edges.length).toBe(g.numExteriorNodes + g.interiorEdges.length);
        });
    });
});

// ---------------------------------------------------------------------------
// Group 2: Pentagons
// ---------------------------------------------------------------------------

describe('RunAlgorithmV5 — pentagons', () => {
    describe('PENTAGON_HOUSE', () => {
        it('does not throw', () => {
            expect(() => runAlgorithmV5(PENTAGON_HOUSE)).not.toThrow();
        });

        it('all exterior edges are accepted', () => {
            const ctx = runAlgorithmV5(PENTAGON_HOUSE);
            for (let i = 0; i < ctx.graph.numExteriorNodes; i++) {
                expect(ctx.acceptedEdges[i]).toBe(true);
            }
        });

        it('produces 2 interior nodes', () => {
            const ctx = runAlgorithmV5(PENTAGON_HOUSE);
            expect(interiorNodes(ctx.graph)).toHaveLength(2);
        });

        it('interior nodes lie inside bounding box', () => {
            const ctx = runAlgorithmV5(PENTAGON_HOUSE);
            const bb = boundingBox(PENTAGON_HOUSE);
            for (const n of interiorNodes(ctx.graph)) {
                expect(n.position.x).toBeGreaterThan(bb.minX);
                expect(n.position.x).toBeLessThan(bb.maxX);
                expect(n.position.y).toBeGreaterThan(bb.minY);
                expect(n.position.y).toBeLessThan(bb.maxY);
            }
        });

        it('total edges = numExteriorNodes + interiorEdges.length', () => {
            const ctx = runAlgorithmV5(PENTAGON_HOUSE);
            const g = ctx.graph;
            expect(g.edges.length).toBe(g.numExteriorNodes + g.interiorEdges.length);
        });
    });

    describe('DEFAULT_PENTAGON', () => {
        it('does not throw', () => {
            expect(() => runAlgorithmV5(DEFAULT_PENTAGON)).not.toThrow();
        });

        it('all exterior edges are accepted', () => {
            const ctx = runAlgorithmV5(DEFAULT_PENTAGON);
            for (let i = 0; i < ctx.graph.numExteriorNodes; i++) {
                expect(ctx.acceptedEdges[i]).toBe(true);
            }
        });

        it('interior nodes lie inside bounding box', () => {
            const ctx = runAlgorithmV5(DEFAULT_PENTAGON);
            const bb = boundingBox(DEFAULT_PENTAGON);
            for (const n of interiorNodes(ctx.graph)) {
                expect(n.position.x).toBeGreaterThan(bb.minX);
                expect(n.position.x).toBeLessThan(bb.maxX);
                expect(n.position.y).toBeGreaterThan(bb.minY);
                expect(n.position.y).toBeLessThan(bb.maxY);
            }
        });

        it('total edges = numExteriorNodes + interiorEdges.length', () => {
            const ctx = runAlgorithmV5(DEFAULT_PENTAGON);
            const g = ctx.graph;
            expect(g.edges.length).toBe(g.numExteriorNodes + g.interiorEdges.length);
        });
    });
});

// ---------------------------------------------------------------------------
// Group 3: Hexagons and Heptagons
// ---------------------------------------------------------------------------

describe('RunAlgorithmV5 — hexagons and heptagons', () => {
    describe('AWKWARD_HEXAGON', () => {
        it('does not throw', () => {
            expect(() => runAlgorithmV5(AWKWARD_HEXAGON)).not.toThrow();
        });
    });

    describe('AWKWARD_HEPTAGON', () => {
        it('does not throw', () => {
            expect(() => runAlgorithmV5(AWKWARD_HEPTAGON)).not.toThrow();
        });

        it('all exterior edges are accepted', () => {
            const ctx = runAlgorithmV5(AWKWARD_HEPTAGON);
            for (let i = 0; i < ctx.graph.numExteriorNodes; i++) {
                expect(ctx.acceptedEdges[i]).toBe(true);
            }
        });

        it('interior nodes lie inside bounding box', () => {
            const ctx = runAlgorithmV5(AWKWARD_HEPTAGON);
            const bb = boundingBox(AWKWARD_HEPTAGON);
            for (const n of interiorNodes(ctx.graph)) {
                expect(n.position.x).toBeGreaterThan(bb.minX);
                expect(n.position.x).toBeLessThan(bb.maxX);
                expect(n.position.y).toBeGreaterThan(bb.minY);
                expect(n.position.y).toBeLessThan(bb.maxY);
            }
        });

        it('total edges = numExteriorNodes + interiorEdges.length', () => {
            const ctx = runAlgorithmV5(AWKWARD_HEPTAGON);
            const g = ctx.graph;
            expect(g.edges.length).toBe(g.numExteriorNodes + g.interiorEdges.length);
        });
    });
});

// ---------------------------------------------------------------------------
// Group 4: Octagons
// ---------------------------------------------------------------------------

describe('RunAlgorithmV5 — octagons', () => {
    describe('SYMMETRICAL_OCTAGON', () => {
        it('does not throw', () => {
            expect(() => runAlgorithmV5(SYMMETRICAL_OCTAGON)).not.toThrow();
        });

        it('all exterior edges are accepted', () => {
            const ctx = runAlgorithmV5(SYMMETRICAL_OCTAGON);
            for (let i = 0; i < ctx.graph.numExteriorNodes; i++) {
                expect(ctx.acceptedEdges[i]).toBe(true);
            }
        });

        it('interior nodes lie inside bounding box', () => {
            const ctx = runAlgorithmV5(SYMMETRICAL_OCTAGON);
            const bb = boundingBox(SYMMETRICAL_OCTAGON);
            for (const n of interiorNodes(ctx.graph)) {
                expect(n.position.x).toBeGreaterThan(bb.minX);
                expect(n.position.x).toBeLessThan(bb.maxX);
                expect(n.position.y).toBeGreaterThan(bb.minY);
                expect(n.position.y).toBeLessThan(bb.maxY);
            }
        });

        it('total edges = numExteriorNodes + interiorEdges.length', () => {
            const ctx = runAlgorithmV5(SYMMETRICAL_OCTAGON);
            const g = ctx.graph;
            expect(g.edges.length).toBe(g.numExteriorNodes + g.interiorEdges.length);
        });
    });

    describe('IMPOSSIBLE_OCTAGON', () => {
        it('does not throw', () => {
            expect(() => runAlgorithmV5(IMPOSSIBLE_OCTAGON)).not.toThrow();
        });
    });

    describe('BROKEN_POLYGON', () => {
        it('does not throw', () => {
            expect(() => runAlgorithmV5(BROKEN_POLYGON)).not.toThrow();
        });
    });
});
