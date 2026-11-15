/*
 * WHEN AN EXTERIOR EDGE IS ACCEPTED (docs/notes/skeleton-edge-acceptance-decisions.md). An exterior edge is
 * accepted exactly when no live bisector names it as a parent (decisions 1 to 3), asked at step boundaries only,
 * where nothing is pending (decision 4). The predicate reads the stored wavefront and no graph topology, so no
 * chain of accepted edges through other faces can accept an edge whose own face is still open, which is how the
 * old connectivity test broke rings (BSA.F95, ISSUE-skeleton-edge-accepted-before-its-face-closes.md).
 *
 * Gate 29's constructed tests on a square after `initInteriorEdges`, decision 32's rule for a ring of births at
 * one node, and the solves that state decisions 7 to 9.
 */
import type {BisectionParams, StraightSkeletonSolverContext, Vector2} from '@proc-geo/core';
import {CLEAN_TEST_POLYGONS, FULL_CORPUS, initContext, RECTANGLE, SQUARE} from '@proc-geo/test-fixtures';
import {
    bisectWithParams,
    checkWavefront,
    makeStraightSkeletonSolverContext,
    ringsOfWavefront,
    setSkeletonLogLevel,
    solveSkeleton,
    tryToAcceptExteriorEdge,
} from '@proc-geo/core';
import {
    beginLayerLinks,
    birthsClosedAtOneNode,
    exteriorFaceIsClosed,
    linkBirth,
    linkPairCollapse,
    NOT_LIVE,
    settleLayerLinks,
} from '@proc-geo/core/straight-skeleton/wavefront';

setSkeletonLogLevel('silent');

const EDGES = [0, 1, 2, 3];

describe('exteriorFaceIsClosed on a square after initInteriorEdges (gate 29)', () => {
    /** The bisector at node j: clockwise parent edge j, widdershins parent edge j - 1. */
    const bisectorAt = (n: number, node: number) => n + (node + n) % n;

    it('leaves every edge open', () => {
        const context = initContext(SQUARE);
        expect(EDGES.map(edge => exteriorFaceIsClosed(context, edge))).toEqual([false, false, false, false]);
        expect(EDGES.map(edge => tryToAcceptExteriorEdge(context, edge))).toEqual([false, false, false, false]);
    });

    it.each(EDGES)('leaves edge %i open with only the bisector whose clockwise parent it is accepted', edge => {
        const context = initContext(SQUARE);
        const n = context.graph.numExteriorNodes;
        const bisector = bisectorAt(n, edge);
        expect(context.getInteriorWithId(bisector).clockwiseExteriorEdgeIndex).toBe(edge);
        context.accept(bisector);
        expect(exteriorFaceIsClosed(context, edge)).toBe(false);
        expect(tryToAcceptExteriorEdge(context, edge)).toBe(false);
        expect(context.isAccepted(edge)).toBe(false);
    });

    it.each(EDGES)('leaves edge %i open with only the bisector whose widdershins parent it is accepted', edge => {
        const context = initContext(SQUARE);
        const n = context.graph.numExteriorNodes;
        const bisector = bisectorAt(n, edge + 1);
        expect(context.getInteriorWithId(bisector).widdershinsExteriorEdgeIndex).toBe(edge);
        context.accept(bisector);
        expect(exteriorFaceIsClosed(context, edge)).toBe(false);
        expect(tryToAcceptExteriorEdge(context, edge)).toBe(false);
        expect(context.isAccepted(edge)).toBe(false);
    });

    it.each(EDGES)('closes edge %i when both bisectors that name it are accepted, and no other edge', edge => {
        const context = initContext(SQUARE);
        const n = context.graph.numExteriorNodes;
        context.accept(bisectorAt(n, edge));
        context.accept(bisectorAt(n, edge + 1));
        expect(exteriorFaceIsClosed(context, edge)).toBe(true);
        expect(tryToAcceptExteriorEdge(context, edge)).toBe(true);
        expect(context.isAccepted(edge)).toBe(true);
        // Each neighbour edge is still named by the live bisector at its far end.
        const others = EDGES.filter(other => other !== edge);
        expect(others.map(other => exteriorFaceIsClosed(context, other))).toEqual([false, false, false]);
    });

    it('reads no graph topology: the two bisectors have no target, and no chain joins the edge\'s ends (decision 3)', () => {
        const context = initContext(SQUARE);
        const n = context.graph.numExteriorNodes;
        context.accept(bisectorAt(n, 0));
        context.accept(bisectorAt(n, 1));
        expect(context.graph.edges[bisectorAt(n, 0)].target).toBeUndefined();
        expect(context.graph.edges[bisectorAt(n, 1)].target).toBeUndefined();
        expect(tryToAcceptExteriorEdge(context, 0)).toBe(true);
    });

    it('accepts nothing that is not an exterior edge', () => {
        const context = initContext(SQUARE);
        const n = context.graph.numExteriorNodes;
        expect(tryToAcceptExteriorEdge(context, n)).toBe(false);
        expect(context.isAccepted(n)).toBe(false);
    });

    it('accepts nothing on a context with no interior edges, as hasInteriorLoop did (BSA.F100)', () => {
        // Before `initInteriorEdges` no live bisector names any edge, so the predicate alone would read every face
        // as closed; no bisector has traced one, and none is accepted.
        const context = makeStraightSkeletonSolverContext(SQUARE);
        expect(context.graph.interiorEdges).toHaveLength(0);
        expect(EDGES.map(edge => exteriorFaceIsClosed(context, edge))).toEqual([true, true, true, true]);
        expect(EDGES.map(edge => tryToAcceptExteriorEdge(context, edge))).toEqual([false, false, false, false]);
        expect(EDGES.map(edge => context.isAccepted(edge))).toEqual([false, false, false, false]);
    });
});

/*
 * DECISION 32: a ring a layer leaves that is made only of that layer's pending births, all sourced at one node, is
 * closed at that node and none of it is born. Built with pair collapses, each of which retires two neighbours and
 * links one pending birth in their place, so a ring of k collapses on a 2k-gon leaves a ring of k births alone.
 */
describe('births that close at one node (decision 32)', () => {
    /** A clockwise regular polygon of `count` vertices. */
    const regular = (count: number): Vector2[] => Array.from({length: count}, (_unused, index) => ({
        x: Math.cos(-2 * Math.PI * index / count),
        y: Math.sin(-2 * Math.PI * index / count),
    }));

    /**
     * Collapse the bisectors at nodes (0, 1), (2, 3), ... of a fresh layer, as the solver does: both colliders
     * accepted, one pending birth linked in their place. The j-th birth is sourced at the interior node named
     * `sources[j]`; equal names are one node.
     */
    const collapsePairs = (vertices: Vector2[], sources: string[]): {context: StraightSkeletonSolverContext; births: BisectionParams[]} => {
        const context = initContext(vertices);
        const n = context.graph.numExteriorNodes;
        const nodeOf = new Map<string, number>();
        for (const name of sources) {
            if (!nodeOf.has(name)) {
                nodeOf.set(name, context.findOrAddNode({x: 0.1 * (nodeOf.size + 1), y: 0.05}, 0).id);
            }
        }
        beginLayerLinks(context);
        const births = sources.map((name, pair): BisectionParams => {
            const widdershinsCollider = n + 2 * pair;
            const clockwiseCollider = n + 2 * pair + 1;
            const params: BisectionParams = {
                clockwiseExteriorEdgeIndex: context.getInteriorWithId(clockwiseCollider).clockwiseExteriorEdgeIndex,
                widdershinsExteriorEdgeIndex: context.getInteriorWithId(widdershinsCollider).widdershinsExteriorEdgeIndex,
                source: nodeOf.get(name)!,
            };
            context.acceptAll([widdershinsCollider, clockwiseCollider]);
            linkPairCollapse(context, [widdershinsCollider, clockwiseCollider], widdershinsCollider, clockwiseCollider, params);
            return params;
        });
        return {context, births};
    };

    /**
     * Settle the layer as `handleInteriorNGon` does: bear every birth the rule does not close, link each, settle.
     * Returns the live bisectors left, so the links can be held to W1 to W4 over them.
     */
    const settleAsTheLayerDoes = (context: StraightSkeletonSolverContext, births: BisectionParams[]): number[] => {
        const closed = birthsClosedAtOneNode(context);
        for (const params of births.filter(params => !closed.has(params))) {
            linkBirth(context, params, bisectWithParams(context, params));
        }
        settleLayerLinks(context);
        return context.graph.interiorEdges.map(edge => edge.id).filter(id => !context.isAccepted(id));
    };

    /** W1 to W4 hold over the live bisectors, one input per ring, and no pending token is left in the arrays. */
    const expectSoundLinks = (context: StraightSkeletonSolverContext, live: number[]) => {
        const inputs = ringsOfWavefront(context, live).map(ring => ({interiorEdges: ring}));
        expect(checkWavefront(context, inputs)).toEqual([]);
        const {clockwiseNeighbour, widdershinsNeighbour} = context.wavefront;
        expect([...clockwiseNeighbour, ...widdershinsNeighbour].filter(id => id < NOT_LIVE)).toEqual([]);
    };

    it('closes a ring of two births at one node', () => {
        const {context, births} = collapsePairs(SQUARE, ['a', 'a']);
        expect(birthsClosedAtOneNode(context)).toEqual(new Set(births));
        const live = settleAsTheLayerDoes(context, births);
        expect(live).toEqual([]);
        expectSoundLinks(context, live);
    });

    it('closes a ring of three births at one node', () => {
        const {context, births} = collapsePairs(regular(6), ['a', 'a', 'a']);
        expect(birthsClosedAtOneNode(context)).toEqual(new Set(births));
        const live = settleAsTheLayerDoes(context, births);
        expect(live).toEqual([]);
        expectSoundLinks(context, live);
    });

    it('bears births at one node that are not a whole ring: the ring still holds live bisectors', () => {
        // Two of the hexagon's three pairs collapse, at one node: the ring is the two births and two live bisectors.
        const {context, births} = collapsePairs(regular(6), ['a', 'a']);
        expect(birthsClosedAtOneNode(context)).toEqual(new Set());
        const live = settleAsTheLayerDoes(context, births);
        expect(live).toHaveLength(4);
        expect(ringsOfWavefront(context, live)).toHaveLength(1);
        expectSoundLinks(context, live);
    });

    it('bears a whole ring of births sourced at two different nodes', () => {
        const square = collapsePairs(SQUARE, ['a', 'b']);
        expect(birthsClosedAtOneNode(square.context)).toEqual(new Set());
        const squareLive = settleAsTheLayerDoes(square.context, square.births);
        expect(squareLive).toHaveLength(2);
        expectSoundLinks(square.context, squareLive);

        const hexagon = collapsePairs(regular(6), ['a', 'a', 'b']);
        expect(birthsClosedAtOneNode(hexagon.context)).toEqual(new Set());
        const hexagonLive = settleAsTheLayerDoes(hexagon.context, hexagon.births);
        expect(hexagonLive).toHaveLength(3);
        expectSoundLinks(hexagon.context, hexagonLive);
    });

    it('finds nothing outside a layer', () => {
        expect(birthsClosedAtOneNode(initContext(SQUARE))).toEqual(new Set());
    });

    it('leaves FULL_CORPUS with exactly one pair of zero-length bisectors at one node with each other\'s parents', () => {
        // The solve-level form of the rule: born, such a ring is two self-loops at its node. The known-defect
        // fixture `Off-edge Jitter Reflex L (seed 55433, k=4)` bore one at node 25, edges (cw 0, ws 10) and
        // (cw 10, ws 0), before the rule, and bears none now.
        //
        // THE ONE PAIR LEFT IS `Offset Cross Junction`'S DEFECT, and it is outside decision 32: e27 (cw 10, ws 6)
        // is a bisector of an earlier layer, not a birth of the layer that bore e33 (cw 6, ws 10) beside it, so the
        // ring is not made only of one layer's births. Pinned as that fixture's signature (decision 19): a cure
        // and a new pair both fire here.
        const mirroredPairs = FULL_CORPUS.flatMap(fixture => {
            const {graph} = solveSkeleton(fixture.vertices);
            const selfLoops = graph.interiorEdges.filter(edge => graph.edges[edge.id].target === graph.edges[edge.id].source);
            return selfLoops.flatMap(first => selfLoops
                .filter(second => second.id > first.id
                    && graph.edges[second.id].source === graph.edges[first.id].source
                    && second.clockwiseExteriorEdgeIndex === first.widdershinsExteriorEdgeIndex
                    && second.widdershinsExteriorEdgeIndex === first.clockwiseExteriorEdgeIndex)
                .map(second => `${fixture.name}: e${first.id} and e${second.id} at n${graph.edges[first.id].source}`));
        });
        expect(mirroredPairs).toEqual(['Offset Cross Junction: e27 and e33 at n16']);
    });
});

describe('acceptance on solves (decisions 7 to 9)', () => {
    it('ends every complete CLEAN_TEST_POLYGONS solve with every exterior edge accepted', () => {
        const unaccepted = CLEAN_TEST_POLYGONS.flatMap(fixture => {
            const result = solveSkeleton(fixture.vertices);
            if (!result.complete || result.context === null) {
                return [];
            }
            const edges = Array.from({length: result.graph.numExteriorNodes}, (_unused, edge) => edge)
                .filter(edge => !result.context!.isAccepted(edge));
            return edges.length === 0 ? [] : [`${fixture.name}: ${edges.join(', ')}`];
        });
        expect(unaccepted).toEqual([]);
    });

    it('Rectangle: both short walls collapse in one layer, and the births named only by the long walls are born', () => {
        // The two collapses retire all four first bisectors in one layer; the long walls are then named only by
        // the two pending births. Asked inside the layer without the pending births, the long walls would be
        // accepted and those births refused by `addBisectionEdge` (gate 30). Asked at the boundary, they are born.
        const result = solveSkeleton(RECTANGLE);
        expect(result.complete).toBe(true);
        expect(result.diagnostics.filter(diagnostic => diagnostic.kind === 'step-failure')).toEqual([]);
        expect([0, 1, 2, 3].every(edge => result.context!.isAccepted(edge))).toBe(true);
    });
});
