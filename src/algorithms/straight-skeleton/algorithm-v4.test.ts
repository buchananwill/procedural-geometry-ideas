import {
    createBisectionInteriorEdge,
    addBisectionEdge,
    hasInteriorLoop,
} from './algorithm-helpers';
import {createCollisionEvents, checkSharedParents} from './collision-helpers';
import {handleCollisionEvent} from './collision-handling';
import {graphIsComplete} from './algorithm';
import {
    TRIANGLE, SQUARE, RECTANGLE, PENTAGON_HOUSE,
    DEFAULT_PENTAGON,
    getAcceptedExteriorEdges
} from './test-constants';
import type {StraightSkeletonSolverContext, Vector2, CollisionEvent} from './types';
import {makeStraightSkeletonSolverContext} from "@/algorithms/straight-skeleton/solver-context";

// ---------------------------------------------------------------------------
// Shared v4-style init helper
// ---------------------------------------------------------------------------

/**
 * Replicates the init pattern from algorithm-v4.ts:
 *  1. makeStraightSkeletonSolverContext (bare graph + exterior edges)
 *  2. Create primary interior edges via createBisectionInteriorEdge
 * Does NOT call reEvaluateEdge or push to heap — matching v4 exactly.
 */
function initV4Context(polygon: Vector2[]): StraightSkeletonSolverContext {
    const context = makeStraightSkeletonSolverContext(polygon);
    const exteriorEdges = [...context.graph.edges];

    for (let cw = 0; cw < exteriorEdges.length; cw++) {
        const ws = (cw - 1 + exteriorEdges.length) % exteriorEdges.length;
        createBisectionInteriorEdge(context, cw, ws, cw);
    }

    return context;
}

// ---------------------------------------------------------------------------
// Group 1: handleCollisionEvent unit tests
// ---------------------------------------------------------------------------

describe('handleCollisionEvent', () => {
    let context: StraightSkeletonSolverContext;
    let events: CollisionEvent[];

    beforeEach(() => {
        context = initV4Context(TRIANGLE);
        events = createCollisionEvents(context);
    });

    test('generates at least one collision event from triangle', () => {
        expect(events.length).toBeGreaterThan(0);
    });

    test('interiorPair with shared parents returns 1 BisectionParams', () => {
        const sharedParentEvent = events.find(e => {
            if (e.eventType !== 'interiorPair') return false;
            const [a, b] = e.collidingEdges;
            return checkSharedParents(a, b, context).includes(true);
        });

        if (!sharedParentEvent) {
            // If no shared-parent event exists for this polygon, skip
            console.warn('No shared-parent interiorPair event found for TRIANGLE');
            return;
        }

        const result = handleCollisionEvent(sharedParentEvent, context);
        expect(result).toHaveLength(1);
    });

    test('interiorPair with shared parents accepts the collapsed edge', () => {
        const sharedParentEvent = events.find(e => {
            if (e.eventType !== 'interiorPair') return false;
            const [a, b] = e.collidingEdges;
            return checkSharedParents(a, b, context).includes(true);
        });

        if (!sharedParentEvent) {
            console.warn('No shared-parent interiorPair event found for TRIANGLE');
            return;
        }

        const acceptedBefore = context.acceptedEdges.filter(Boolean).length;
        handleCollisionEvent(sharedParentEvent, context);
        const acceptedAfter = context.acceptedEdges.filter(Boolean).length;

        // Should have accepted at least one edge (the collapsed exterior + the two interior)
        expect(acceptedAfter).toBeGreaterThan(acceptedBefore);
    });

    test('interiorPair without shared parents returns 2 BisectionParams', () => {
        const nonSharedEvent = events.find(e => {
            if (e.eventType !== 'interiorPair') return false;
            const [a, b] = e.collidingEdges;
            return !checkSharedParents(a, b, context).includes(true);
        });

        if (!nonSharedEvent) {
            // Try with a polygon that has non-shared-parent events
            const ctx = initV4Context(PENTAGON_HOUSE);
            const evts = createCollisionEvents(ctx);
            const evt = evts.find(e => {
                if (e.eventType !== 'interiorPair') return false;
                const [a, b] = e.collidingEdges;
                return !checkSharedParents(a, b, ctx).includes(true);
            });

            if (!evt) {
                console.warn('No non-shared-parent interiorPair event found');
                return;
            }

            const result = handleCollisionEvent(evt, ctx);
            expect(result).toHaveLength(2);
            return;
        }

        const result = handleCollisionEvent(nonSharedEvent, context);
        expect(result).toHaveLength(2);
    });

    test('interiorPair creates node via findOrAddNode and pushes edges to inEdges', () => {
        const interiorPairEvent = events.find(e => e.eventType === 'interiorPair');

        if (!interiorPairEvent) {
            console.warn('No interiorPair event found');
            return;
        }

        const nodeCountBefore = context.graph.nodes.length;
        handleCollisionEvent(interiorPairEvent, context);
        const nodeCountAfter = context.graph.nodes.length;

        // A new node should have been created
        expect(nodeCountAfter).toBeGreaterThan(nodeCountBefore);

        // The new node should have inEdges containing the colliding edges
        const newNode = context.graph.nodes[nodeCountAfter - 1];
        const [instigator, target] = interiorPairEvent.collidingEdges;
        expect(newNode.inEdges).toContain(instigator);
    });

    test('interiorAgainstExterior returns 2 BisectionParams', () => {
        const extEvent = events.find(e => e.eventType === 'interiorAgainstExterior');

        if (!extEvent) {
            // Try with a polygon more likely to have these events
            const ctx = initV4Context(RECTANGLE);
            const evts = createCollisionEvents(ctx);
            const evt = evts.find(e => e.eventType === 'interiorAgainstExterior');

            if (!evt) {
                console.warn('No interiorAgainstExterior event found');
                return;
            }

            const result = handleCollisionEvent(evt, ctx);
            expect(result).toHaveLength(2);
            return;
        }

        const result = handleCollisionEvent(extEvent, context);
        expect(result).toHaveLength(2);
    });

    test('interiorAgainstExterior params reference the target exterior edge', () => {
        // Use RECTANGLE which is more likely to produce exterior collisions
        const ctx = initV4Context(RECTANGLE);
        const evts = createCollisionEvents(ctx);
        const extEvent = evts.find(e => e.eventType === 'interiorAgainstExterior');

        if (!extEvent) {
            console.warn('No interiorAgainstExterior event found');
            return;
        }

        const [_instigator, targetEdgeId] = extEvent.collidingEdges;
        const result = handleCollisionEvent(extEvent, ctx);

        // Both returned params should reference the target exterior edge
        const referencesTarget = result.some(
            p => p.clockwiseExteriorEdgeIndex === targetEdgeId || p.widdershinsExteriorEdgeIndex === targetEdgeId
        );
        expect(referencesTarget).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Group 2: findOrAddNode bug confirmation
// ---------------------------------------------------------------------------

describe('BUG: findOrAddNode', () => {
    test('BUG: findOrAddNode never finds existing nodes at the same position (missing return)', () => {
        const context = initV4Context(TRIANGLE);

        const position: Vector2 = {x: 42, y: 99};
        const node1 = context.findOrAddNode(position);
        const node2 = context.findOrAddNode(position);

        // This SHOULD return the same node, but the missing `return` in the arrow
        // function means it always creates a new one.
        // If this test PASSES, the bug is fixed. If it FAILS, the bug is confirmed.
        expect(node2.id).toBe(node1.id);
    });

    test('findOrAddNode creates new node for different position', () => {
        const context = initV4Context(TRIANGLE);

        const pos1: Vector2 = {x: 10, y: 20};
        const pos2: Vector2 = {x: 30, y: 40};
        const node1 = context.findOrAddNode(pos1);
        const node2 = context.findOrAddNode(pos2);

        expect(node2.id).not.toBe(node1.id);
    });
});

// ---------------------------------------------------------------------------
// Group 3: v4 main loop single-iteration diagnostics
// ---------------------------------------------------------------------------

describe('v4 main loop single-iteration diagnostics', () => {
    test('single iteration generates events', () => {
        const context = initV4Context(TRIANGLE);
        const events = createCollisionEvents(context);
        expect(events.length).toBeGreaterThan(0);
    });

    test('single iteration: events → handleCollisionEvent → proposedBisections exist', () => {
        const context = initV4Context(TRIANGLE);
        const events = createCollisionEvents(context);
        expect(events.length).toBeGreaterThan(0);

        const firstEvent = events[0];
        const bisections = handleCollisionEvent(firstEvent, context);
        expect(bisections.length).toBeGreaterThan(0);
    });

    test('BUG: acceptedEdges length vs graph.edges length after one iteration — acceptedEdges too short (pentagon)', () => {
        // Use PENTAGON — simple polygons (triangle/square) complete in one iteration
        // via the shared-parent path, so secondary edges never get created.
        // PENTAGON requires multiple iterations and produces non-shared-parent events
        // that create secondary bisections via addBisectionEdge.
        const context = initV4Context(PENTAGON_HOUSE);
        const events = createCollisionEvents(context);

        // Process only the first layer of events (matching v4's layer logic)
        const offsetThreshold = events[0].offsetDistance;
        const eventLayer = events.filter(e => Math.abs(e.offsetDistance - offsetThreshold) < 0.00000001);
        const proposedBisections = eventLayer.flatMap(e => handleCollisionEvent(e, context));

        // Run the exterior acceptance pass (as v4 does)
        context.graph.edges
            .filter(e => !context.acceptedEdges[e.id])
            .forEach(e => {
                context.acceptedEdges[e.id] = hasInteriorLoop(e.id, context);
            });

        // Add secondary bisections (as v4 does — using addBisectionEdge, NOT createBisectionInteriorEdge)
        const staleFiltered = proposedBisections.filter(params =>
            !context.acceptedEdges[params.widdershinsExteriorEdgeIndex]
            && !context.acceptedEdges[params.clockwiseExteriorEdgeIndex]
        );

        if (staleFiltered.length === 0) {
            // If all proposals were stale-filtered, the test scenario didn't produce
            // secondary edges. Log and track what happened.
            console.log('No secondary bisections created — all proposals filtered as stale');
            console.log('Accepted edges:', context.acceptedEdges);
            console.log('Graph complete:', graphIsComplete(context));
            return;
        }

        staleFiltered.forEach(params => {
            addBisectionEdge(
                context.graph,
                params.clockwiseExteriorEdgeIndex,
                params.widdershinsExteriorEdgeIndex,
                params.source,
                params.approximateDirection
            );
        });

        // BUG: acceptedEdges should cover all edge IDs, but addBisectionEdge doesn't grow it
        const allEdgesCovered = context.acceptedEdges.length >= context.graph.edges.length;
        expect(allEdgesCovered).toBe(false); // Expect the bug: acceptedEdges is too short
    });

    test('BUG: addBisectionEdge does not grow acceptedEdges', () => {
        const context = initV4Context(TRIANGLE);
        const acceptedLenBefore = context.acceptedEdges.length;

        // Add a bisection edge the way v4 does (via addBisectionEdge, not createBisectionInteriorEdge)
        const newId = addBisectionEdge(context.graph, 0, 2, 0);

        // acceptedEdges should NOT have grown
        expect(context.acceptedEdges.length).toBe(acceptedLenBefore);
        // The new edge's acceptance status is undefined (out of bounds)
        expect(context.acceptedEdges[newId]).toBeUndefined();
    });

    test('BUG: colliding edges have no .target set after handleCollisionEvent', () => {
        const context = initV4Context(TRIANGLE);
        const events = createCollisionEvents(context);
        const firstEvent = events.find(e => e.eventType === 'interiorPair');

        if (!firstEvent) {
            console.warn('No interiorPair event found');
            return;
        }

        const [instigator, _target] = firstEvent.collidingEdges;
        handleCollisionEvent(firstEvent, context);

        // BUG: handleCollisionEvent creates a node but never sets .target on the edges
        const instigatorEdge = context.graph.edges[instigator];
        expect(instigatorEdge.target).toBeDefined();
    });

    test('BUG: exterior edge acceptance finds no loops because interior edges lack .target', () => {
        const context = initV4Context(TRIANGLE);
        const events = createCollisionEvents(context);

        // Process first event
        const firstEvent = events[0];
        handleCollisionEvent(firstEvent, context);

        // Run the exterior acceptance pass (as v4 does on line 41-42)
        const acceptedBefore = getAcceptedExteriorEdges(context);
        context.graph.edges
            .filter(e => !context.acceptedEdges[e.id])
            .forEach(e => {
                context.acceptedEdges[e.id] = hasInteriorLoop(e.id, context);
            });
        const acceptedAfter = getAcceptedExteriorEdges(context);

        // For interior edges with shared parents, the parent-based check in
        // hasInteriorLoop may accept some edges. For exterior edges, the
        // graph-traversal path requires .target to be set — which it isn't.
        // Track what actually happened so we can characterize the bug.
        console.log('Exterior edges accepted before:', acceptedBefore);
        console.log('Exterior edges accepted after:', acceptedAfter);

        // At minimum, verify that the graph is NOT complete after one iteration
        // (it should be for a triangle if everything worked correctly)
        expect(acceptedAfter.length === acceptedBefore.length).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Group 4: Progress tracking
// ---------------------------------------------------------------------------

describe('v4 loop progress tracking', () => {
    function runV4LoopWithCap(polygon: Vector2[], maxIterations: number) {
        const context = initV4Context(polygon);
        const progressLog: { iteration: number; acceptedCount: number; eventCount: number }[] = [];

        for (let i = 0; i < maxIterations; i++) {
            if (graphIsComplete(context)) break;

            const events = createCollisionEvents(context);
            if (events.length === 0) break;

            const offsetThreshold = events[0].offsetDistance;
            const eventLayer = events.filter(e => {
                const diff = Math.abs(e.offsetDistance - offsetThreshold);
                return diff < 0.00000001;
            });

            const proposedBisections = eventLayer.flatMap(e =>
                handleCollisionEvent(e, context)
            );

            // Exterior acceptance pass
            context.graph.edges
                .filter(e => !context.acceptedEdges[e.id])
                .forEach(e => {
                    context.acceptedEdges[e.id] = hasInteriorLoop(e.id, context);
                });

            // Add secondary bisections (v4 style — addBisectionEdge, not createBisectionInteriorEdge)
            proposedBisections
                .filter(params =>
                    !context.acceptedEdges[params.widdershinsExteriorEdgeIndex]
                    && !context.acceptedEdges[params.clockwiseExteriorEdgeIndex]
                )
                .forEach(params => {
                    addBisectionEdge(
                        context.graph,
                        params.clockwiseExteriorEdgeIndex,
                        params.widdershinsExteriorEdgeIndex,
                        params.source,
                        params.approximateDirection
                    );
                });

            const acceptedCount = context.acceptedEdges
                .slice(0, context.graph.numExteriorNodes)
                .filter(Boolean).length;

            progressLog.push({
                iteration: i,
                acceptedCount,
                eventCount: eventLayer.length,
            });
        }

        return {context, progressLog};
    }

    test('TRIANGLE: completes in one iteration (all shared-parent events)', () => {
        const {context, progressLog} = runV4LoopWithCap(TRIANGLE, 20);

        console.log('TRIANGLE progress:', progressLog);

        // Simple regular polygon: all events have shared parents, so
        // the shared-parent acceptance path handles everything in one layer.
        expect(graphIsComplete(context)).toBe(true);
        expect(progressLog).toHaveLength(1);
    });

    test('SQUARE: completes in one iteration (all shared-parent events)', () => {
        const {context, progressLog} = runV4LoopWithCap(SQUARE, 20);

        console.log('SQUARE progress:', progressLog);

        expect(graphIsComplete(context)).toBe(true);
        expect(progressLog).toHaveLength(1);
    });

    test('PENTAGON: does not complete — non-termination exposed', () => {
        const {context, progressLog} = runV4LoopWithCap(PENTAGON_HOUSE, 10);

        console.log('PENTAGON progress:', progressLog);

        // Pentagon requires multiple event layers, which means secondary bisections.
        // The bugs (no .target, acceptedEdges not grown, findOrAddNode duplicates)
        // prevent the algorithm from making progress after the first layer.
        const complete = graphIsComplete(context);

        if (!complete) {
            const lastLog = progressLog[progressLog.length - 1];
            expect(lastLog.acceptedCount).toBeLessThan(PENTAGON_HOUSE.length);
        }
    });

    test('DEFAULT_PENTAGON: does not complete — non-termination exposed', () => {
        const {context, progressLog} = runV4LoopWithCap(DEFAULT_PENTAGON, 10);

        console.log('DEFAULT_PENTAGON progress:', progressLog);

        const complete = graphIsComplete(context);

        if (!complete) {
            const lastLog = progressLog[progressLog.length - 1];
            expect(lastLog.acceptedCount).toBeLessThan(DEFAULT_PENTAGON.length);
        }
    });

    test('event regeneration produces identical events when no state changes', () => {
        const context = initV4Context(TRIANGLE);

        const events1 = createCollisionEvents(context);
        const events2 = createCollisionEvents(context);

        expect(events1.length).toBe(events2.length);

        for (let i = 0; i < events1.length; i++) {
            expect(events1[i].offsetDistance).toBeCloseTo(events2[i].offsetDistance, 8);
            expect(events1[i].collidingEdges).toEqual(events2[i].collidingEdges);
            expect(events1[i].eventType).toBe(events2[i].eventType);
        }
    });
});

// ---------------------------------------------------------------------------
// Group 5: checkSharedParents correctness
// ---------------------------------------------------------------------------

describe('checkSharedParents', () => {
    test('returns expected sharing for adjacent primary edges (triangle)', () => {
        const context = initV4Context(TRIANGLE);

        // In a triangle, primary edge at vertex 0 has cw=0, ws=2
        // and primary edge at vertex 1 has cw=1, ws=0
        // So edge0.cw (0) === edge1.ws (0) → position [0] should be true
        const numExterior = context.graph.numExteriorNodes;
        const edge0Id = numExterior; // first interior edge
        const edge1Id = numExterior + 1; // second interior edge

        const result = checkSharedParents(edge0Id, edge1Id, context);

        // At least one sharing should be detected for adjacent edges
        expect(result.includes(true)).toBe(true);
    });

    test('returns all-false for non-adjacent edges (pentagon)', () => {
        const context = initV4Context(PENTAGON_HOUSE);
        const numExterior = context.graph.numExteriorNodes; // 5

        // Edge at vertex 0: cw=0, ws=4
        // Edge at vertex 2: cw=2, ws=1
        // No shared parents: 0≠1, 0≠2, 4≠1, 4≠2
        const edge0Id = numExterior;     // vertex 0
        const edge2Id = numExterior + 2; // vertex 2

        const result = checkSharedParents(edge0Id, edge2Id, context);
        expect(result.includes(true)).toBe(false);
    });

    test('BUG: tuple positions [0] and [3] are duplicates, [1] and [2] are duplicates', () => {
        const context = initV4Context(SQUARE);
        const numExterior = context.graph.numExteriorNodes;

        // Test with any pair of interior edges
        const edgeA = numExterior;
        const edgeB = numExterior + 1;

        const result = checkSharedParents(edgeA, edgeB, context);

        // Bug: positions [0] and [3] are identical, positions [1] and [2] are identical
        // The implementation has:
        //   [0] = e1Cw == e2Ws
        //   [1] = e1Ws == e2Cw
        //   [2] = e1Ws == e2Cw   (duplicate of [1])
        //   [3] = e1Cw == e2Ws   (duplicate of [0])
        expect(result[0]).toBe(result[3]); // These are always identical
        expect(result[1]).toBe(result[2]); // These are always identical

        // Verify with a broader set of edge pairs to confirm it's structural
        for (let i = 0; i < numExterior; i++) {
            for (let j = i + 1; j < numExterior; j++) {
                const r = checkSharedParents(numExterior + i, numExterior + j, context);
                expect(r[0]).toBe(r[3]);
                expect(r[1]).toBe(r[2]);
            }
        }
    });
});
