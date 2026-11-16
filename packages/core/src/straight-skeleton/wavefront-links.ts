import type {StraightSkeletonSolverContext, Wavefront, WavefrontSegment} from "./types";
import {SkeletonDirection} from "./types";
import {adjacentExteriorEdge} from "./graph-helpers";

/**
 * THE WAVEFRONT'S ORDER, STORED (skeleton-wavefront-order spec, stage 1).
 *
 * Every live bisector holds its two neighbours around the wavefront, a ring is an orbit of
 * `clockwiseNeighbour`, and a segment of an exterior edge is a linked pair `(from, to)`. The links are
 * WRITTEN BY THE EVENTS, each from the participants it holds (spec decision 9), and NEVER RECOVERED
 * AFTERWARDS (decision 10): no reader of order finds a neighbour by searching for a bisector with a
 * matching parent or by id distance, because that search is ambiguous as soon as one exterior edge bounds
 * two segments of one ring. Two bisectors are neighbours when the links say so ({@link areNeighbours}).
 * No id interval is left in the event path: the order a layer's partition births are born in is
 * `partitionArc` (`layer-links.ts`), a walk of the ring (skeleton join-and-divide spec, decisions 25 to 27), which
 * replaced `partitionSpan` and finds no neighbour.
 *
 * THE LINKS ARE THE SOLVER'S ONE SOURCE OF WAVEFRONT ORDER (decisions 19 to 22): an edge's segments, the
 * neighbour guard, a step's rings, a partitioning layer's child steps, whether two colliding bisectors are
 * neighbours and which side of a pair collapse each stands on are all read from them, and `checkWavefront`
 * holds them to W1 to W4 at every step boundary in the suite (decision 23).
 *
 * WRITING NEVER THROWS, WITH ONE EXCEPTION. A link write that meets a state it does not expect writes what
 * its participants say and leaves the judgement to `checkWavefront` (`wavefront-check.ts`). The exception is
 * `linkPairCollapse` (`layer-links.ts`), which refuses two bisectors that are not neighbours (BSA.D293): collapsing
 * them as though they were would splice out everything between them, which no later check could attribute.
 *
 * THIS MODULE HOLDS THE STORED LINKS ALONE: their slots, the first rings, retirement, the readers and the one
 * {@link orbit} every walk of them takes. A layer's pending births are `layer-links.ts`'s.
 */

/** The value a non-live bisector (and every exterior edge slot) holds in both arrays. */
export const NOT_LIVE = -1;

/** The links of the first ring of a polygon with `numExteriorEdges` edges, before any bisector exists. */
export function makeWavefront(numExteriorEdges: number): Wavefront {
    return {
        clockwiseNeighbour: new Array<number>(numExteriorEdges).fill(NOT_LIVE),
        widdershinsNeighbour: new Array<number>(numExteriorEdges).fill(NOT_LIVE),
    };
}

/** Give a newly created edge id its slot, holding {@link NOT_LIVE} until an event links it. */
export function openWavefrontSlot(context: StraightSkeletonSolverContext, edgeId: number): void {
    const {clockwiseNeighbour, widdershinsNeighbour} = context.wavefront;
    while (clockwiseNeighbour.length <= edgeId) {
        clockwiseNeighbour.push(NOT_LIVE);
    }
    while (widdershinsNeighbour.length <= edgeId) {
        widdershinsNeighbour.push(NOT_LIVE);
    }
    clockwiseNeighbour[edgeId] = NOT_LIVE;
    widdershinsNeighbour[edgeId] = NOT_LIVE;
}

/**
 * THE ORBIT: the ids after `start` round its ring, each the `next` of the one before (`next` a clockwise or a
 * widdershins reader). EVERY WALK OF THE LINKS IS ONE OF THESE, AND THIS IS ITS ONE GUARD: the orbit ends before an id
 * it has already given, `start` included, so before `start` comes round again, and at {@link NOT_LIVE}. It gives each
 * id once and ends on any links, sound or broken. A caller's own stop is a `break` of its own.
 */
export function* orbit(next: (id: number) => number, start: number): Generator<number> {
    const seen = new Set<number>([start]);
    for (let id = next(start); id !== NOT_LIVE && !seen.has(id); id = next(id)) {
        seen.add(id);
        yield id;
    }
}

/** A bisector's clockwise neighbour as the context stores it: {@link NOT_LIVE} for anything that is not a bisector id. */
export function storedClockwiseOf(context: StraightSkeletonSolverContext, id: number): number {
    return id >= 0 ? context.wavefront.clockwiseNeighbour[id] ?? NOT_LIVE : NOT_LIVE;
}

/** A bisector leaves the wavefront: both of its links become {@link NOT_LIVE}. */
export function retireBisector(context: StraightSkeletonSolverContext, id: number): void {
    if (id >= 0) {
        context.wavefront.clockwiseNeighbour[id] = NOT_LIVE;
        context.wavefront.widdershinsNeighbour[id] = NOT_LIVE;
    }
}

/** Every bisector of a closure leaves the wavefront (the pair, the triangle, the terminal ladder). */
export function retireBisectors(context: StraightSkeletonSolverContext, ids: readonly number[]): void {
    ids.forEach(id => retireBisector(context, id));
}

/**
 * `initInteriorEdges`: THE FIRST RINGS, ONE PER LOOP (spec decision 8; skeleton loops-input spec, decisions 9,
 * 12 and 13). `bisectorAtNode[e]` is the bisector born at exterior node `e`. Each bisector's clockwise neighbour
 * is the bisector at the next node of its own loop and its widdershins neighbour the bisector at the previous
 * one, read through `adjacentExteriorEdge`, so every ring wraps within its loop. With one loop this is the ring
 * {@link linkInitialRing} links from the vertex order.
 */
export function linkInitialRings(context: StraightSkeletonSolverContext, bisectorAtNode: readonly number[]): void {
    const {graph} = context;
    bisectorAtNode.forEach((id, node) => {
        openWavefrontSlot(context, id);
        context.wavefront.clockwiseNeighbour[id] =
            bisectorAtNode[adjacentExteriorEdge(graph, node, SkeletonDirection.Clockwise)];
        context.wavefront.widdershinsNeighbour[id] =
            bisectorAtNode[adjacentExteriorEdge(graph, node, SkeletonDirection.Widdershins)];
    });
}

/** Link the given bisectors into one ring, in the order given: each one's clockwise neighbour is the next. */
export function linkInitialRing(context: StraightSkeletonSolverContext, clockwiseOrder: readonly number[]): void {
    const count = clockwiseOrder.length;
    clockwiseOrder.forEach((id, index) => {
        openWavefrontSlot(context, id);
        context.wavefront.clockwiseNeighbour[id] = clockwiseOrder[(index + 1) % count];
        context.wavefront.widdershinsNeighbour[id] = clockwiseOrder[(index - 1 + count) % count];
    });
}

/**
 * Are `a` and `b` neighbours on the wavefront: is either the other's clockwise neighbour? This, and never
 * a shared parent, is what makes two colliding bisectors a pair collapse (BSA.F97 finding 3, BSA.D293):
 * once an exterior edge bounds two segments of one ring, two bisectors that share it need not be adjacent.
 */
export function areNeighbours(context: StraightSkeletonSolverContext, a: number, b: number): boolean {
    return storedClockwiseOf(context, a) === b || storedClockwiseOf(context, b) === a;
}

/**
 * The pair collapse's two sides, from the links: `[widdershins, clockwise]`, where the widdershins collider
 * is the one whose clockwise neighbour is the other. `undefined` when the two are not neighbours.
 */
export function pairCollapseSides(
    context: StraightSkeletonSolverContext,
    a: number,
    b: number,
): [number, number] | undefined {
    if (storedClockwiseOf(context, a) === b) {
        return [a, b];
    }
    if (storedClockwiseOf(context, b) === a) {
        return [b, a];
    }
    return undefined;
}

// ── Reading the links ────────────────────────────────────────────────────────────────────────────

/** Is `id` a bisector that has not been accepted: an interior edge id, live on the wavefront? */
export function isLiveBisector(context: StraightSkeletonSolverContext, id: number): boolean {
    return id >= context.graph.numExteriorNodes
        && id < context.graph.edges.length
        && !context.acceptedEdges[id];
}

/**
 * IS THIS EXTERIOR EDGE'S FACE CLOSED: does no live bisector name it as a parent (skeleton edge-acceptance spec,
 * decisions 1 to 3)? A live bisector is one {@link isLiveBisector} says is live, and both of its parents are read.
 * Where the links are sound W2 makes the two readings agree: a live bisector whose widdershins parent is the edge
 * has a live widdershins neighbour whose clockwise parent it is.
 *
 * IT READS NO GRAPH TOPOLOGY — no `inEdges`, `outEdges`, targets or nodes — so no cycle in the accepted subgraph,
 * no pair of unified nodes and no bisector wired onto another face can close an edge whose own face still has a
 * bisector tracing it. And it reads no loop, so it is loop-neutral by construction.
 */
export function exteriorFaceIsClosed(context: StraightSkeletonSolverContext, exteriorEdge: number): boolean {
    for (const edge of context.graph.interiorEdges) {
        if ((edge.clockwiseExteriorEdgeIndex === exteriorEdge || edge.widdershinsExteriorEdgeIndex === exteriorEdge)
            && isLiveBisector(context, edge.id)) {
            return false;
        }
    }
    return true;
}

/**
 * The rings through these bisectors: the orbit of `clockwiseNeighbour` from each, in clockwise order.
 * An orbit that breaks (reaches a bisector holding {@link NOT_LIVE}, or runs into another orbit) is
 * returned as far as it went; `checkWavefront` is the judge of whether it should have broken.
 */
export function ringsOfWavefront(context: StraightSkeletonSolverContext, interiorEdgeIds: readonly number[]): number[][] {
    const placed = new Set<number>();
    const rings: number[][] = [];
    // The stored links alone: a pending token, which only a layer can read, ends the orbit as NOT_LIVE does.
    const next = (id: number) => {
        const clockwise = storedClockwiseOf(context, id);
        return clockwise < 0 ? NOT_LIVE : clockwise;
    };
    for (const start of interiorEdgeIds) {
        if (placed.has(start)) {
            continue;
        }
        const ring: number[] = [start];
        placed.add(start);
        for (const id of orbit(next, start)) {
            if (placed.has(id)) {
                break;
            }
            ring.push(id);
            placed.add(id);
        }
        rings.push(ring);
    }
    return rings;
}

/** The live segments of an exterior edge as the links state them (W4): `from` has it as clockwise parent. */
export function wavefrontSegmentsOf(context: StraightSkeletonSolverContext, exteriorEdge: number): WavefrontSegment[] {
    return context.graph.interiorEdges
        .filter(edge => isLiveBisector(context, edge.id) && edge.clockwiseExteriorEdgeIndex === exteriorEdge)
        .map(edge => ({
            exteriorEdge,
            from: edge.id,
            to: context.wavefront.clockwiseNeighbour[edge.id] ?? NOT_LIVE,
        }));
}

/**
 * THE NEIGHBOUR GUARD (spec decisions 16 and 19): a split is refused when its struck segment is bounded by
 * the instigator or by the instigator's neighbour on the side the segment would be reached from — the
 * segment of one of the instigator's own parents, or of the edge next to one. Such a strike is the edge
 * event of the instigator and its neighbour misread as a split.
 *
 * THIS REPLACED A COUNT OF UNACCEPTED EXTERIOR EDGE IDS between the struck edge and the instigator's
 * parents, which counted the edges of a sibling ring as if they lay between and so let through strikes on
 * a neighbour's neighbour (BSA.F95). The links count places along the instigator's own ring.
 */
export function linkGuardRefuses(
    context: StraightSkeletonSolverContext,
    instigator: number,
    segment: WavefrontSegment,
): boolean {
    const {clockwiseNeighbour, widdershinsNeighbour} = context.wavefront;
    return segment.from === instigator
        || segment.from === clockwiseNeighbour[instigator]
        || segment.to === instigator
        || segment.to === widdershinsNeighbour[instigator];
}
