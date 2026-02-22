import {computeStraightSkeleton} from './algorithm';
import type {StraightSkeletonGraph, StraightSkeletonSolverContext, Vector2} from './types';
import {initStraightSkeletonGraph} from "@/algorithms/straight-skeleton/core-functions";
import {
    acceptEdge,
    addTargetNodeAtInteriorEdgeIntersect,
    buildExteriorParentLists,
    finalizeTargetNodePosition,
    initStraightSkeletonSolverContext,
    pushHeapInteriorEdgesFromParentPairs,
    reEvaluateEdge,
} from "@/algorithms/straight-skeleton/algorithm-helpers";
import {positionsAreClose} from "@/algorithms/straight-skeleton/core-functions";

// ---------------------------------------------------------------------------
// Test constants - NODES MUST BE ORDERED CLOCKWISE
// ---------------------------------------------------------------------------

const TRIANGLE: Vector2[] = [{x: 0, y: 0},  {x: 2, y: 4}, {x: 4, y: 0}];
const SQUARE: Vector2[] = [{x: 0, y: 0}, {x: 0, y: 2}, {x: 2, y: 2}, {x: 2, y: 0}];
const RECTANGLE: Vector2[] = [{x: 0, y: 0}, {x: 0, y: 2}, {x: 4, y: 2}, {x: 4, y: 0}];
const PENTAGON: Vector2[] = [{x: 3, y: 9}, {x: 6, y: 6}, {x: 6, y: 0}, {x: 0, y: 0}, {x: 0, y: 6}];
const KIDNEY_BEAN_OCTAGON: Vector2[] = [
    {
        x: 316.9999990463257,
        y: 219.00000095367432
    },
    {
        x: 250,
        y: 250
    },
    {
        x: 300,
        y: 450
    },
    {
        x: 500,
        y: 450
    },
    {
        x: 577,
        y: 372
    },
    {
        x: 598.5056829452515,
        y: 227.50568294525146
    },
    {
        x: 522.5056829452515,
        y: 150.50568294525146
    },
    {
        x: 396,
        y: 214
    }
]

const IMPOSSIBLE_OCTAGON: Vector2[] = [
    {
        x: 316.9999990463257,
        y: 219.00000095367432
    },
    {
        x: 250,
        y: 250
    },
    {
        x: 300,
        y: 450
    },
    {
        x: 500,
        y: 450
    },
    {
        x: 577,
        y: 372
    },
    {
        x: 605.5056829452515,
        y: 334.50568294525146
    },
    {
        x: 580.5056829452515,
        y: 205.50568294525146
    },
    {
        x: 396,
        y: 214
    }
]

const BROKEN_POLYGON: Vector2[] = [
    {
        x: 342,
        y: 305
    },
    {
        x: 231.4124715468463,
        y: 348.6498861873851
    },
    {
        x: 219,
        y: 490
    },
    {
        x: 573.9551266342539,
        y: 440.59680388705004
    },
    {
        x: 655,
        y: 453
    },
    {
        x: 680,
        y: 232
    },
    {
        x: 572.4959638502904,
        y: 228.0766686722798
    },
    {
        x: 421,
        y: 169
    }
]

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
// 1. Return type and termination
// ---------------------------------------------------------------------------

describe('computeStraightSkeleton — return type and termination', () => {
    it('returns a graph for a triangle without throwing', () => {
        expect(() => computeStraightSkeleton(TRIANGLE)).not.toThrow();
        const g = computeStraightSkeleton(TRIANGLE);
        expect(g).toBeDefined();
        expect(typeof g.numExteriorNodes).toBe('number');
    });

    it('returns a graph for a square without throwing', () => {
        expect(() => computeStraightSkeleton(SQUARE)).not.toThrow();
        expect(computeStraightSkeleton(SQUARE)).toBeDefined();
    });

    it('returns a graph for a rectangle without throwing', () => {
        expect(() => computeStraightSkeleton(RECTANGLE)).not.toThrow();
        expect(computeStraightSkeleton(RECTANGLE)).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// 2. Exterior node count
// ---------------------------------------------------------------------------

describe('computeStraightSkeleton — exterior node count', () => {
    it('triangle: numExteriorNodes === 3', () => {
        expect(computeStraightSkeleton(TRIANGLE).numExteriorNodes).toBe(3);
    });

    it('square: numExteriorNodes === 4', () => {
        expect(computeStraightSkeleton(SQUARE).numExteriorNodes).toBe(4);
    });

    it('rectangle: numExteriorNodes === 4', () => {
        expect(computeStraightSkeleton(RECTANGLE).numExteriorNodes).toBe(4);
    });
});

// ---------------------------------------------------------------------------
// 3. Interior node count
// ---------------------------------------------------------------------------

describe('computeStraightSkeleton — interior node count', () => {
    it('triangle: 1 interior node', () => {
        expect(interiorNodes(computeStraightSkeleton(TRIANGLE))).toHaveLength(1);
    });

    it('square: 1 interior node', () => {
        expect(interiorNodes(computeStraightSkeleton(SQUARE))).toHaveLength(1);
    });

    it('rectangle: 2 interior nodes', () => {
        expect(interiorNodes(computeStraightSkeleton(RECTANGLE))).toHaveLength(2);
    });
});

// ---------------------------------------------------------------------------
// 4. Interior edge count
// ---------------------------------------------------------------------------

describe('computeStraightSkeleton — interior edge count', () => {
    it('triangle: 3 interior edges', () => {
        expect(computeStraightSkeleton(TRIANGLE).interiorEdges).toHaveLength(3);
    });

    it('square: 4 interior edges', () => {
        expect(computeStraightSkeleton(SQUARE).interiorEdges).toHaveLength(4);
    });

    it('rectangle: 5 interior edges (4 initial + 1 ridge)', () => {
        expect(computeStraightSkeleton(RECTANGLE).interiorEdges).toHaveLength(5);
    });

    it('triangle: total edges = numExteriorNodes + interiorEdges.length', () => {
        const g = computeStraightSkeleton(TRIANGLE);
        expect(g.edges.length).toBe(g.numExteriorNodes + g.interiorEdges.length);
    });

    it('square: total edges = numExteriorNodes + interiorEdges.length', () => {
        const g = computeStraightSkeleton(SQUARE);
        expect(g.edges.length).toBe(g.numExteriorNodes + g.interiorEdges.length);
    });

    it('rectangle: total edges = numExteriorNodes + interiorEdges.length', () => {
        const g = computeStraightSkeleton(RECTANGLE);
        expect(g.edges.length).toBe(g.numExteriorNodes + g.interiorEdges.length);
    });
});

// ---------------------------------------------------------------------------
// 5. Interior node positions
// ---------------------------------------------------------------------------

describe('computeStraightSkeleton — interior node positions', () => {
    it('triangle: single interior node at incenter (2, √5−1)', () => {
        const g = computeStraightSkeleton(TRIANGLE);
        const [node] = interiorNodes(g);
        expect(node.position.x).toBeCloseTo(2, 4);
        expect(node.position.y).toBeCloseTo(Math.sqrt(5) - 1, 4);
    });

    it('square: single interior node at center (1, 1)', () => {
        const g = computeStraightSkeleton(SQUARE);
        const [node] = interiorNodes(g);
        expect(node.position.x).toBeCloseTo(1, 4);
        expect(node.position.y).toBeCloseTo(1, 4);
    });

    it('rectangle: two interior nodes at (1, 1) and (3, 1) sorted by x', () => {
        const g = computeStraightSkeleton(RECTANGLE);
        const nodes = interiorNodes(g).sort((a, b) => a.position.x - b.position.x);
        expect(nodes[0].position.x).toBeCloseTo(1, 4);
        expect(nodes[0].position.y).toBeCloseTo(1, 4);
        expect(nodes[1].position.x).toBeCloseTo(3, 4);
        expect(nodes[1].position.y).toBeCloseTo(1, 4);
    });
});

// ---------------------------------------------------------------------------
// 6. All exterior nodes have at least one outgoing interior edge
// ---------------------------------------------------------------------------

describe('computeStraightSkeleton — exterior nodes have interior out-edges', () => {
    function allExteriorNodesHaveInteriorOutEdge(g: StraightSkeletonGraph): boolean {
        for (let i = 0; i < g.numExteriorNodes; i++) {
            const hasInterior = g.nodes[i].outEdges.some(eid => eid >= g.numExteriorNodes);
            if (!hasInterior) return false;
        }
        return true;
    }

    it('triangle: every exterior node has an outgoing interior edge', () => {
        expect(allExteriorNodesHaveInteriorOutEdge(computeStraightSkeleton(TRIANGLE))).toBe(true);
    });

    it('square: every exterior node has an outgoing interior edge', () => {
        expect(allExteriorNodesHaveInteriorOutEdge(computeStraightSkeleton(SQUARE))).toBe(true);
    });

    it('rectangle: every exterior node has an outgoing interior edge', () => {
        expect(allExteriorNodesHaveInteriorOutEdge(computeStraightSkeleton(RECTANGLE))).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// 7. Interior nodes lie strictly inside the polygon bounding box
// ---------------------------------------------------------------------------

describe('computeStraightSkeleton — interior nodes inside bounding box', () => {
    function allInteriorNodesInsideBBox(g: StraightSkeletonGraph, verts: Vector2[]): boolean {
        const bb = boundingBox(verts);
        return interiorNodes(g).every(n =>
            n.position.x > bb.minX && n.position.x < bb.maxX &&
            n.position.y > bb.minY && n.position.y < bb.maxY
        );
    }

    it('triangle: interior nodes inside bounding box', () => {
        expect(allInteriorNodesInsideBBox(computeStraightSkeleton(TRIANGLE), TRIANGLE)).toBe(true);
    });

    it('square: interior nodes inside bounding box', () => {
        expect(allInteriorNodesInsideBBox(computeStraightSkeleton(SQUARE), SQUARE)).toBe(true);
    });

    it('rectangle: interior nodes inside bounding box', () => {
        expect(allInteriorNodesInsideBBox(computeStraightSkeleton(RECTANGLE), RECTANGLE)).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// 8. Degenerate inputs — must not throw
// ---------------------------------------------------------------------------

describe('computeStraightSkeleton — degenerate inputs', () => {
    it('empty array: does not throw', () => {
        expect(() => computeStraightSkeleton([])).not.toThrow();
    });

    it('single vertex: does not throw', () => {
        expect(() => computeStraightSkeleton([{x: 0, y: 0}])).not.toThrow();
    });

    it('two vertices: does not throw', () => {
        expect(() => computeStraightSkeleton([{x: 0, y: 0}, {x: 1, y: 0}])).not.toThrow();
    });
});

// ---------------------------------------------------------------------------
// 9. Pentagon — step-by-step algorithm tracing
// ---------------------------------------------------------------------------

/**
 * Performs exactly one main-loop iteration of the straight skeleton solver.
 * Mirrors the body of the while-loop in computeStraightSkeleton, skipping
 * duplicate (already-accepted) heap entries exactly as the real loop does.
 *
 * Returns:
 *   poppedEdgeId         — the id of the edge actually processed (not skipped)
 *   acceptedInteriorEdges — interior edge ids accepted in this iteration
 *   newInteriorEdgeIds   — ids of any interior edges pushed during this iteration
 */
function performOneStep(context: StraightSkeletonSolverContext): {
    poppedEdgeId: number;
    acceptedInteriorEdges: number[];
    newInteriorEdgeIds: number[];
} {
    const {graph, acceptedEdges, heap} = context;

    // Mirror the revised stale-event logic from algorithm.ts
    let nextEdge = heap.pop();
    while (nextEdge !== undefined) {
        const ownerAccepted = nextEdge.ownerId < acceptedEdges.length && acceptedEdges[nextEdge.ownerId];

        // Fully stale: owner itself is accepted — discard
        if (ownerAccepted) {
            nextEdge = heap.pop();
            continue;
        }

        // Partially stale: owner is NOT accepted but some participants are
        const hasStaleParticipants = nextEdge.participatingEdges.some(
            eid => eid !== nextEdge!.ownerId && eid < acceptedEdges.length && acceptedEdges[eid]
        );

        if (hasStaleParticipants) {
            const interiorEdgeData = graph.interiorEdges[nextEdge.ownerId - graph.numExteriorNodes];
            const targetPos = finalizeTargetNodePosition(interiorEdgeData.id, graph);

            let existingNodeIndex = -1;
            for (let i = graph.numExteriorNodes; i < graph.nodes.length; i++) {
                if (positionsAreClose(graph.nodes[i].position, targetPos)) {
                    existingNodeIndex = i;
                    break;
                }
            }

            if (existingNodeIndex >= 0) {
                const ownerEdgeId = nextEdge.ownerId;
                if (!graph.nodes[existingNodeIndex].inEdges.includes(ownerEdgeId)) {
                    graph.nodes[existingNodeIndex].inEdges.push(ownerEdgeId);
                }
                graph.edges[ownerEdgeId].target = existingNodeIndex;
                acceptEdge(ownerEdgeId, context);

                const allNodeEdges = graph.nodes[existingNodeIndex].inEdges.filter(
                    e => e >= graph.numExteriorNodes
                );
                const [cw, ws] = buildExteriorParentLists(context, allNodeEdges);
                pushHeapInteriorEdgesFromParentPairs(context, cw, ws, existingNodeIndex);
            } else {
                reEvaluateEdge(context, nextEdge.ownerId);
            }
            nextEdge = heap.pop();
            continue;
        }

        // Not stale — process this event
        break;
    }
    if (nextEdge === undefined) throw new Error('Heap exhausted');

    const interiorEdgeData = graph.interiorEdges[nextEdge.ownerId - graph.numExteriorNodes];
    const prevInteriorEdgeCount = graph.interiorEdges.length;

    const nodeIndex = addTargetNodeAtInteriorEdgeIntersect(context, interiorEdgeData);

    // Accept only edges that aren't already accepted
    const acceptedInteriorEdges = graph.nodes[nodeIndex].inEdges.filter(
        e => !acceptedEdges[e]
    );
    acceptedInteriorEdges.forEach(e => acceptEdge(e, context));

    // Use ALL interior edges at the node for balanced parent lists
    const allInteriorEdgesAtNode = graph.nodes[nodeIndex].inEdges.filter(
        e => e >= graph.numExteriorNodes
    );
    const [cw, ws] = buildExteriorParentLists(context, allInteriorEdgesAtNode);
    pushHeapInteriorEdgesFromParentPairs(context, cw, ws, nodeIndex);

    const newInteriorEdgeIds = graph.interiorEdges
        .slice(prevInteriorEdgeCount)
        .map(e => e.id);

    return {poppedEdgeId: nextEdge.ownerId, acceptedInteriorEdges, newInteriorEdgeIds};
}

describe('Pentagon — step-by-step algorithm tracing', () => {

    // -----------------------------------------------------------------------
    // Stage 0: Initialization
    // -----------------------------------------------------------------------

    describe('stage 0 — after initStraightSkeletonSolverContext', () => {
        let context: StraightSkeletonSolverContext;

        beforeEach(() => {
            context = initStraightSkeletonSolverContext(PENTAGON);
        });

        it('creates exactly 5 interior edges (ids 5-9)', () => {
            expect(context.graph.interiorEdges.map(e => e.id)).toEqual([5, 6, 7, 8, 9]);
        });

        it('interior edge 5 bisects CW=0 and WS=4', () => {
            const e = context.graph.interiorEdges[0];
            expect(e.id).toBe(5);
            expect(e.clockwiseExteriorEdgeIndex).toBe(0);
            expect(e.widdershinsExteriorEdgeIndex).toBe(4);
        });

        it('interior edge 6 bisects CW=1 and WS=0', () => {
            const e = context.graph.interiorEdges[1];
            expect(e.id).toBe(6);
            expect(e.clockwiseExteriorEdgeIndex).toBe(1);
            expect(e.widdershinsExteriorEdgeIndex).toBe(0);
        });

        it('interior edge 7 bisects CW=2 and WS=1', () => {
            const e = context.graph.interiorEdges[2];
            expect(e.id).toBe(7);
            expect(e.clockwiseExteriorEdgeIndex).toBe(2);
            expect(e.widdershinsExteriorEdgeIndex).toBe(1);
        });

        it('interior edge 8 bisects CW=3 and WS=2', () => {
            const e = context.graph.interiorEdges[3];
            expect(e.id).toBe(8);
            expect(e.clockwiseExteriorEdgeIndex).toBe(3);
            expect(e.widdershinsExteriorEdgeIndex).toBe(2);
        });

        it('interior edge 9 bisects CW=4 and WS=3', () => {
            const e = context.graph.interiorEdges[4];
            expect(e.id).toBe(9);
            expect(e.clockwiseExteriorEdgeIndex).toBe(4);
            expect(e.widdershinsExteriorEdgeIndex).toBe(3);
        });

        it('no exterior edges are accepted yet', () => {
            for (let i = 0; i < context.graph.numExteriorNodes; i++) {
                expect(context.acceptedEdges[i]).toBe(false);
            }
        });

    });

    // -----------------------------------------------------------------------
    // Stage 1: First heap.pop()
    // -----------------------------------------------------------------------

    describe('stage 1 — after first heap.pop()', () => {
        let context: StraightSkeletonSolverContext;
        let step1: ReturnType<typeof performOneStep>;

        beforeEach(() => {
            context = initStraightSkeletonSolverContext(PENTAGON);
            step1 = performOneStep(context);
        });

        // Result 1: interior edges 5, 6, 9 accepted
        it('accepts interior edges 5, 6, and 9', () => {
            expect([...step1.acceptedInteriorEdges].sort((a, b) => a - b)).toEqual([5, 6, 9]);
        });

        it('marks interior edge 5 as accepted in acceptedEdges', () => {
            expect(context.acceptedEdges[5]).toBe(true);
        });

        it('marks interior edge 6 as accepted in acceptedEdges', () => {
            expect(context.acceptedEdges[6]).toBe(true);
        });

        it('marks interior edge 9 as accepted in acceptedEdges', () => {
            expect(context.acceptedEdges[9]).toBe(true);
        });

        // Result 2: exterior edges 0 and 4 accepted
        it('accepts exterior edge 0', () => {
            expect(context.acceptedEdges[0]).toBe(true);
        });

        it('accepts exterior edge 4', () => {
            expect(context.acceptedEdges[4]).toBe(true);
        });

        it('does not yet accept exterior edges 1, 2, or 3', () => {
            expect(context.acceptedEdges[1]).toBe(false);
            expect(context.acceptedEdges[2]).toBe(false);
            expect(context.acceptedEdges[3]).toBe(false);
        });

        // Result 3: edge 10 is pushed
        it('pushes exactly one new interior edge with id 10', () => {
            expect(step1.newInteriorEdgeIds).toEqual([10]);
        });

        it('graph now has 6 interior edges total', () => {
            expect(context.graph.interiorEdges).toHaveLength(6);
        });

        it('interior edges 7 and 8 are not yet accepted', () => {
            expect(context.acceptedEdges[7]).toBe(false);
            expect(context.acceptedEdges[8]).toBe(false);
        });
    });

    // -----------------------------------------------------------------------
    // Stage 2: Second heap.pop()
    // -----------------------------------------------------------------------

    describe('stage 2 — after second heap.pop()', () => {
        let context: StraightSkeletonSolverContext;
        let step2: ReturnType<typeof performOneStep>;

        beforeEach(() => {
            context = initStraightSkeletonSolverContext(PENTAGON);
            performOneStep(context); // stage 1
            step2 = performOneStep(context); // stage 2
        });

        // Result 4: interior edges 7, 10, 8 accepted
        it('accepts interior edges 7, 8, and 10', () => {
            expect([...step2.acceptedInteriorEdges].sort((a, b) => a - b)).toEqual([7, 8, 10]);
        });

        it('marks interior edge 7 as accepted in acceptedEdges', () => {
            expect(context.acceptedEdges[7]).toBe(true);
        });

        it('marks interior edge 8 as accepted in acceptedEdges', () => {
            expect(context.acceptedEdges[8]).toBe(true);
        });

        it('marks interior edge 10 as accepted in acceptedEdges', () => {
            expect(context.acceptedEdges[10]).toBe(true);
        });

        // Result 5: exterior edges 1, 2, 3 accepted
        it('accepts exterior edge 1', () => {
            expect(context.acceptedEdges[1]).toBe(true);
        });

        it('accepts exterior edge 2', () => {
            expect(context.acceptedEdges[2]).toBe(true);
        });

        it('accepts exterior edge 3', () => {
            expect(context.acceptedEdges[3]).toBe(true);
        });

        // Result 6: no new interior edges pushed
        it('pushes no new interior edges', () => {
            expect(step2.newInteriorEdgeIds).toHaveLength(0);
        });

        it('graph still has 6 interior edges total', () => {
            expect(context.graph.interiorEdges).toHaveLength(6);
        });

        // Result 7: all exterior edges accepted
        it('all 5 exterior edges are now accepted', () => {
            for (let i = 0; i < context.graph.numExteriorNodes; i++) {
                expect(context.acceptedEdges[i]).toBe(true);
            }
        });

        it('all entries in acceptedEdges are true (graphIsComplete equivalent)', () => {
            expect(context.acceptedEdges.every(flag => flag)).toBe(true);
        });
    });
});

// ---------------------------------------------------------------------------
// 10. Kidney-bean octagon
// ---------------------------------------------------------------------------

describe('KIDNEY_BEAN_OCTAGON — straight skeleton', () => {
    let g: StraightSkeletonGraph;

    beforeEach(() => {
        g = computeStraightSkeleton(KIDNEY_BEAN_OCTAGON);
    });

    it('does not throw', () => {
        expect(() => computeStraightSkeleton(KIDNEY_BEAN_OCTAGON)).not.toThrow();
    });

    it('numExteriorNodes === 8', () => {
        expect(g.numExteriorNodes).toBe(8);
    });

    it('has at most 6 interior nodes (geometric maximum for an octagon)', () => {
        expect(interiorNodes(g).length).toBeLessThanOrEqual(6);
    });

    it('has at least 1 interior node', () => {
        expect(interiorNodes(g).length).toBeGreaterThanOrEqual(1);
    });

    it('total edge count equals numExteriorNodes + interiorEdges.length', () => {
        expect(g.edges.length).toBe(g.numExteriorNodes + g.interiorEdges.length);
    });

    it('every exterior node has at least one outgoing interior edge', () => {
        for (let i = 0; i < g.numExteriorNodes; i++) {
            expect(g.nodes[i].outEdges.some(eid => eid >= g.numExteriorNodes)).toBe(true);
        }
    });

    it('all interior nodes lie strictly inside the bounding box', () => {
        const bb = boundingBox(KIDNEY_BEAN_OCTAGON);
        for (const n of interiorNodes(g)) {
            expect(n.position.x).toBeGreaterThan(bb.minX);
            expect(n.position.x).toBeLessThan(bb.maxX);
            expect(n.position.y).toBeGreaterThan(bb.minY);
            expect(n.position.y).toBeLessThan(bb.maxY);
        }
    });
});

// ---------------------------------------------------------------------------
// 11. Impossible octagon
// ---------------------------------------------------------------------------

describe('IMPOSSIBLE_OCTAGON — straight skeleton', () => {

    // -----------------------------------------------------------------------
    // Stage 0: initialization
    // -----------------------------------------------------------------------

    describe('stage 0 — after initStraightSkeletonSolverContext', () => {
        let context: StraightSkeletonSolverContext;

        beforeEach(() => {
            context = initStraightSkeletonSolverContext(IMPOSSIBLE_OCTAGON);
        });

        it('numExteriorNodes === 8', () => {
            expect(context.graph.numExteriorNodes).toBe(8);
        });

        it('creates exactly 8 interior edges (ids 8–15)', () => {
            expect(context.graph.interiorEdges.map(e => e.id)).toEqual([8, 9, 10, 11, 12, 13, 14, 15]);
        });

        it('no exterior edges are accepted at init', () => {
            for (let i = 0; i < context.graph.numExteriorNodes; i++) {
                expect(context.acceptedEdges[i]).toBe(false);
            }
        });

        it.each([
            [8,  0, 7],
            [9,  1, 0],
            [10, 2, 1],
            [11, 3, 2],
            [12, 4, 3],
            [13, 5, 4],
            [14, 6, 5],
            [15, 7, 6],
        ])('interior edge %i bisects CW=%i and WS=%i', (id, cw, ws) => {
            const e = context.graph.interiorEdges[id - 8];
            expect(e.id).toBe(id);
            expect(e.clockwiseExteriorEdgeIndex).toBe(cw);
            expect(e.widdershinsExteriorEdgeIndex).toBe(ws);
        });
    });

    // -----------------------------------------------------------------------
    // End-to-end: algorithm completes without throwing
    // -----------------------------------------------------------------------

    it('completes without throwing', () => {
        expect(() => computeStraightSkeleton(IMPOSSIBLE_OCTAGON))
            .not.toThrow();
    });

    // -----------------------------------------------------------------------
    // Step-by-step tracing
    // -----------------------------------------------------------------------

    describe('stage 1 — after first heap.pop()', () => {
        let context: StraightSkeletonSolverContext;
        let step1: ReturnType<typeof performOneStep>;

        beforeEach(() => {
            context = initStraightSkeletonSolverContext(IMPOSSIBLE_OCTAGON);
            step1 = performOneStep(context);
        });

        it('accepts interior edges 12 and 13', () => {
            expect([...step1.acceptedInteriorEdges].sort((a, b) => a - b)).toEqual([12, 13]);
        });

        it('pushes exactly one new interior edge (id 16)', () => {
            expect(step1.newInteriorEdgeIds).toEqual([16]);
        });
    });

    describe('stage 2 — after second heap.pop()', () => {
        let context: StraightSkeletonSolverContext;
        let step2: ReturnType<typeof performOneStep>;

        beforeEach(() => {
            context = initStraightSkeletonSolverContext(IMPOSSIBLE_OCTAGON);
            performOneStep(context);
            step2 = performOneStep(context);
        });

        it('accepts interior edges 10 and 11', () => {
            expect([...step2.acceptedInteriorEdges].sort((a, b) => a - b)).toEqual([10, 11]);
        });

        it('pushes exactly one new interior edge (id 17)', () => {
            expect(step2.newInteriorEdgeIds).toEqual([17]);
        });
    });

    // -----------------------------------------------------------------------
    // After fix: no double-accepts, all exterior edges accepted
    // -----------------------------------------------------------------------

    it('no interior edge is accepted more than once', () => {
        const context = initStraightSkeletonSolverContext(IMPOSSIBLE_OCTAGON);
        const acceptedSoFar = new Set<number>();
        const doubleAccepted: number[] = [];

        for (let i = 0; i < 20; i++) {
            if (context.acceptedEdges.every(f => f)) break;
            const step = performOneStep(context);
            for (const e of step.acceptedInteriorEdges) {
                if (acceptedSoFar.has(e)) doubleAccepted.push(e);
                acceptedSoFar.add(e);
            }
        }

        expect(doubleAccepted).toHaveLength(0);
    });

    it('all exterior edges are accepted after algorithm completes', () => {
        const context = initStraightSkeletonSolverContext(IMPOSSIBLE_OCTAGON);

        for (let i = 0; i < 20; i++) {
            if (context.acceptedEdges.every(f => f)) break;
            performOneStep(context);
        }

        const allExteriorAccepted = context.acceptedEdges
            .slice(0, context.graph.numExteriorNodes)
            .every(f => f);
        expect(allExteriorAccepted).toBe(true);
    });

    it('all interior nodes lie inside the bounding box', () => {
        const g = computeStraightSkeleton(IMPOSSIBLE_OCTAGON);
        const bb = boundingBox(IMPOSSIBLE_OCTAGON);
        for (const n of interiorNodes(g)) {
            expect(n.position.x).toBeGreaterThan(bb.minX);
            expect(n.position.x).toBeLessThan(bb.maxX);
            expect(n.position.y).toBeGreaterThan(bb.minY);
            expect(n.position.y).toBeLessThan(bb.maxY);
        }
    });

    it('total edge count equals numExteriorNodes + interiorEdges.length', () => {
        const g = computeStraightSkeleton(IMPOSSIBLE_OCTAGON);
        expect(g.edges.length).toBe(g.numExteriorNodes + g.interiorEdges.length);
    });
});

// Pentagon house

describe('Pentagon house', () => {
    let g: StraightSkeletonGraph;

    it('should have 5 exterior edges after init', () => {
        g = initStraightSkeletonGraph(PENTAGON);
        expect(g.edges.length).toBe(5);
    });

    it('should have 5 interior edges after context init', () => {
        const context = initStraightSkeletonSolverContext(PENTAGON);
        g = context.graph;
        expect(g.interiorEdges.length).toBe(5);
    });

    it('should have 7 nodes', () => {
        g = computeStraightSkeleton(PENTAGON);
        expect(g.nodes.length).toBe(7);
    });
})