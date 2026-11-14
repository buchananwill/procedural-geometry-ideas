import type {
    AlgorithmStepInput,
    BisectionParams,
    InteriorEdge,
    StraightSkeletonSolverContext,
    Vector2,
    Wavefront,
    WavefrontSegment,
} from "./types";
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
 * The one id interval left in the event path is `partitionSpan` (`selectPartitionEvents`), which orders a
 * layer's partition births and finds no neighbour (decision 33).
 *
 * THE LINKS ARE THE SOLVER'S ONE SOURCE OF WAVEFRONT ORDER (decisions 19 to 22): an edge's segments, the
 * neighbour guard, a step's rings, a partitioning layer's child steps, whether two colliding bisectors are
 * neighbours and which side of a pair collapse each stands on are all read from them, and `checkWavefront`
 * holds them to W1 to W4 at every step boundary in the suite (decision 23).
 *
 * WRITING NEVER THROWS, WITH ONE EXCEPTION. A link write that meets a state it does not expect writes what
 * its participants say and leaves the judgement to {@link checkWavefront}. The exception is
 * {@link linkPairCollapse}, which refuses two bisectors that are not neighbours (BSA.D293): collapsing them
 * as though they were would splice out everything between them, which no later check could attribute.
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

// ── One layer's link state ───────────────────────────────────────────────────────────────────────

/*
 * WHY A LAYER NEEDS STATE OF ITS OWN. `handleInteriorNGon` resolves every event of a layer first and
 * creates the new bisectors afterwards, filtered and in an order of its own (partitions sorted by span,
 * then collapses), so an event cannot link its new bisector by id: the id does not exist yet, and one
 * event's new bisector is often the neighbour of another's. Each new bisector is therefore linked as a
 * PENDING BIRTH — a negative token, below `NOT_LIVE`, that stands in the arrays wherever the bisector will
 * stand — and the token is replaced by the real id at birth ({@link linkBirth}). A token whose bisector is
 * never born (its parameters were filtered out) is spliced out when the layer settles
 * ({@link settleLayerLinks}), joining its two neighbours.
 *
 * An event can also hold a participant that an EARLIER EVENT OF THE SAME LAYER has already replaced: a
 * split's struck segment is named when the event is generated, at the start of the layer. Each event
 * records which pending bisector took over each side of every bisector it retired (the successors), and
 * each split records the cut it made in its edge (the divisions), so a later split reads the segment it
 * struck through those records instead of searching for it.
 */

interface PendingLinks {
    clockwise: number;
    widdershins: number;
    /** The parents the bisector will be born with. */
    params: BisectionParams;
}

/** A cut a split made in one segment of `edge`: `before` now closes the piece behind the cut, `after` opens the piece ahead of it. */
interface Division {
    edge: number;
    position: Vector2;
    after: number;
}

interface LayerLinks {
    nextToken: number;
    pending: Map<number, PendingLinks>;
    tokenOf: Map<BisectionParams, number>;
    /** Retired bisector → the pending bisector that took over its clockwise side. */
    clockwiseSuccessor: Map<number, number>;
    /** Retired bisector → the pending bisector that took over its widdershins side. */
    widdershinsSuccessor: Map<number, number>;
    /** Keyed by `before`, the pending bisector closing the piece behind the cut. */
    divisions: Map<number, Division>;
}

const layers = new WeakMap<StraightSkeletonSolverContext, LayerLinks>();

function freshLayer(): LayerLinks {
    return {
        nextToken: NOT_LIVE - 1,
        pending: new Map(),
        tokenOf: new Map(),
        clockwiseSuccessor: new Map(),
        widdershinsSuccessor: new Map(),
        divisions: new Map(),
    };
}

function layerOf(context: StraightSkeletonSolverContext): LayerLinks {
    let layer = layers.get(context);
    if (layer === undefined) {
        layer = freshLayer();
        layers.set(context, layer);
    }
    return layer;
}

/** Start a layer's link state afresh, discarding whatever a layer that threw left behind. */
export function beginLayerLinks(context: StraightSkeletonSolverContext): void {
    layers.set(context, freshLayer());
}

function isToken(id: number): boolean {
    return id < NOT_LIVE;
}

function clockwiseOf(context: StraightSkeletonSolverContext, id: number): number {
    if (isToken(id)) {
        return layers.get(context)?.pending.get(id)?.clockwise ?? NOT_LIVE;
    }
    return id >= 0 ? context.wavefront.clockwiseNeighbour[id] ?? NOT_LIVE : NOT_LIVE;
}

function widdershinsOf(context: StraightSkeletonSolverContext, id: number): number {
    if (isToken(id)) {
        return layers.get(context)?.pending.get(id)?.widdershins ?? NOT_LIVE;
    }
    return id >= 0 ? context.wavefront.widdershinsNeighbour[id] ?? NOT_LIVE : NOT_LIVE;
}

function setClockwise(context: StraightSkeletonSolverContext, id: number, value: number): void {
    if (isToken(id)) {
        const pending = layers.get(context)?.pending.get(id);
        if (pending !== undefined) {
            pending.clockwise = value;
        }
    } else if (id >= 0) {
        context.wavefront.clockwiseNeighbour[id] = value;
    }
}

function setWiddershins(context: StraightSkeletonSolverContext, id: number, value: number): void {
    if (isToken(id)) {
        const pending = layers.get(context)?.pending.get(id);
        if (pending !== undefined) {
            pending.widdershins = value;
        }
    } else if (id >= 0) {
        context.wavefront.widdershinsNeighbour[id] = value;
    }
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

/** Link `params`' bisector, not yet born, between `widdershins` and `clockwise`. Returns its token. */
function linkPendingBirth(
    context: StraightSkeletonSolverContext,
    params: BisectionParams,
    widdershins: number,
    clockwise: number,
): number {
    const layer = layerOf(context);
    const token = layer.nextToken--;
    layer.pending.set(token, {clockwise, widdershins, params});
    layer.tokenOf.set(params, token);
    setClockwise(context, widdershins, token);
    setWiddershins(context, clockwise, token);
    return token;
}

/** `params` has been born as bisector `id`: its token is replaced by the id wherever it stands. */
export function linkBirth(context: StraightSkeletonSolverContext, params: BisectionParams, id: number): void {
    const layer = layers.get(context);
    const token = layer?.tokenOf.get(params);
    if (layer === undefined || token === undefined) {
        return;
    }
    const links = layer.pending.get(token);
    layer.tokenOf.delete(params);
    if (links === undefined) {
        return;
    }
    layer.pending.delete(token);
    const clockwise = links.clockwise === token ? id : links.clockwise;
    const widdershins = links.widdershins === token ? id : links.widdershins;
    context.wavefront.clockwiseNeighbour[id] = clockwise;
    context.wavefront.widdershinsNeighbour[id] = widdershins;
    setClockwise(context, widdershins, id);
    setWiddershins(context, clockwise, id);
}

/** The parents of a live bisector or a pending birth, or `undefined` for anything else. */
function parentsOf(context: StraightSkeletonSolverContext, id: number): {clockwise: number; widdershins: number} | undefined {
    if (isToken(id)) {
        const params = layers.get(context)?.pending.get(id)?.params;
        return params === undefined
            ? undefined
            : {clockwise: params.clockwiseExteriorEdgeIndex, widdershins: params.widdershinsExteriorEdgeIndex};
    }
    if (!isLiveBisector(context, id)) {
        return undefined;
    }
    const edge = context.getInteriorWithId(id);
    return {clockwise: edge.clockwiseExteriorEdgeIndex, widdershins: edge.widdershinsExteriorEdgeIndex};
}

/**
 * Which of these pending births may go unborn without breaking W2 (BSA.F97 finding 1, BSA.D293).
 *
 * A birth that is never born is spliced out when the layer settles, joining its two neighbours, and the
 * splice is sound only if their parents meet. The candidates are taken in maximal runs of consecutive
 * pending births, because a run goes together: a run bounded by two neighbours may go only if the clockwise
 * parent of the one is the widdershins parent of the other. A whole ring of candidates is the run whose two
 * ends are each other's neighbours, so it goes exactly when it is sound by W2 itself, which is the case the
 * rosters meet (a pair of re-reports born at one node with each other's parents). A run bounded by a
 * neighbour that is neither live nor pending may go: the links are already broken there, and the judgement
 * is {@link checkWavefront}'s.
 *
 * Asked by the same-start, same-source dedupe, which takes such events for re-reports of one split: two
 * splits sited at one point are no re-report, and dropping either leaves its neighbours with parents that
 * do not meet.
 */
export function droppableBirths(
    context: StraightSkeletonSolverContext,
    candidates: readonly BisectionParams[],
): Set<BisectionParams> {
    const layer = layers.get(context);
    const droppable = new Set<BisectionParams>();
    const candidateOf = new Map<number, BisectionParams>();
    for (const params of candidates) {
        const token = layer?.tokenOf.get(params);
        if (token === undefined || !layer!.pending.has(token)) {
            // Not linked anywhere: going unborn changes no link.
            droppable.add(params);
        } else {
            candidateOf.set(token, params);
        }
    }

    const placed = new Set<number>();
    for (const token of candidateOf.keys()) {
        if (placed.has(token)) {
            continue;
        }
        // The run's first token: walk widdershins while the neighbour is a candidate too.
        let first = token;
        for (let hops = 0; hops <= candidateOf.size; hops++) {
            const previous = widdershinsOf(context, first);
            if (!candidateOf.has(previous) || previous === token) {
                break;
            }
            first = previous;
        }
        const run: number[] = [first];
        let last = first;
        for (let hops = 0; hops <= candidateOf.size; hops++) {
            const next = clockwiseOf(context, last);
            if (!candidateOf.has(next) || next === first) {
                break;
            }
            run.push(next);
            last = next;
        }
        run.forEach(id => placed.add(id));

        const widdershins = parentsOf(context, widdershinsOf(context, first));
        const clockwise = parentsOf(context, clockwiseOf(context, last));
        const mayGo = widdershins === undefined
            || clockwise === undefined
            || widdershins.clockwise === clockwise.widdershins;
        if (mayGo) {
            run.forEach(id => droppable.add(candidateOf.get(id)!));
        }
    }
    return droppable;
}

/**
 * The layer is over: every pending bisector that was never born is spliced out, joining its two
 * neighbours, and the layer's records are discarded.
 */
export function settleLayerLinks(context: StraightSkeletonSolverContext): void {
    const layer = layers.get(context);
    if (layer === undefined) {
        return;
    }
    for (const [token, links] of [...layer.pending.entries()].sort((a, b) => b[0] - a[0])) {
        if (!layer.pending.has(token)) {
            continue;
        }
        layer.pending.delete(token);
        const clockwise = links.clockwise === token ? NOT_LIVE : links.clockwise;
        const widdershins = links.widdershins === token ? NOT_LIVE : links.widdershins;
        setClockwise(context, widdershins, clockwise);
        setWiddershins(context, clockwise, widdershins);
    }
    layers.delete(context);
}

// ── The events' link writes (spec decision 9) ────────────────────────────────────────────────────

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
    return clockwiseOf(context, a) === b || clockwiseOf(context, b) === a;
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
    if (clockwiseOf(context, a) === b) {
        return [a, b];
    }
    if (clockwiseOf(context, b) === a) {
        return [b, a];
    }
    return undefined;
}

/**
 * The pair collapse: two adjacent bisectors meet and one bisector replaces them. `widdershinsCollider`
 * is the one on the widdershins side, whose clockwise neighbour is `clockwiseCollider`; the new bisector
 * takes the widdershins collider's widdershins neighbour and the clockwise collider's clockwise neighbour.
 *
 * REFUSES A PAIR THAT IS NOT ADJACENT, by throwing (BSA.D293): the one link write that does. Linked as
 * though they were neighbours, two bisectors with others between them would cut those others out of
 * every ring.
 */
export function linkPairCollapse(
    context: StraightSkeletonSolverContext,
    participants: readonly number[],
    widdershinsCollider: number,
    clockwiseCollider: number,
    params: BisectionParams,
): void {
    if (clockwiseOf(context, widdershinsCollider) !== clockwiseCollider) {
        throw new Error(`Pair collapse of e${widdershinsCollider} and e${clockwiseCollider}, which are not neighbours `
            + `on the wavefront (e${widdershinsCollider}'s clockwise neighbour is e${clockwiseOf(context, widdershinsCollider)}).`);
    }
    const widdershins = widdershinsOf(context, widdershinsCollider);
    const clockwise = clockwiseOf(context, clockwiseCollider);
    retireBisectors(context, participants);
    const token = linkPendingBirth(context, params, widdershins, clockwise);
    const layer = layerOf(context);
    layer.clockwiseSuccessor.set(clockwiseCollider, token);
    layer.widdershinsSuccessor.set(widdershinsCollider, token);
}

/**
 * The vertex-to-vertex event of two bisectors that share no parent. `first` is born with the
 * instigator's clockwise parent and the target's widdershins parent, `second` with the target's clockwise
 * parent and the instigator's widdershins parent: the same rewrite as a split, with the target's two
 * sides standing for the struck segment's two ends.
 */
export function linkVertexToVertex(
    context: StraightSkeletonSolverContext,
    instigator: number,
    target: number,
    first: BisectionParams,
    second: BisectionParams,
): void {
    const instigatorClockwise = clockwiseOf(context, instigator);
    const instigatorWiddershins = widdershinsOf(context, instigator);
    const targetClockwise = clockwiseOf(context, target);
    const targetWiddershins = widdershinsOf(context, target);
    retireBisectors(context, [instigator, target]);
    const firstToken = linkPendingBirth(context, first, targetWiddershins, instigatorClockwise);
    const secondToken = linkPendingBirth(context, second, instigatorWiddershins, targetClockwise);
    const layer = layerOf(context);
    layer.clockwiseSuccessor.set(instigator, firstToken);
    layer.widdershinsSuccessor.set(target, firstToken);
    layer.clockwiseSuccessor.set(target, secondToken);
    layer.widdershinsSuccessor.set(instigator, secondToken);
}

/**
 * The bisector now standing in a retired bisector's place on one side: the retired bisector itself if
 * nothing in this layer replaced it, else the pending bisector an earlier event recorded as its successor.
 */
function successorOn(
    context: StraightSkeletonSolverContext,
    successors: Map<number, number>,
    id: number,
): number {
    let current = id;
    for (let hops = 0; hops < 8; hops++) {
        const live = isToken(current) || !context.isAccepted(current);
        if (live) {
            return current;
        }
        const next = successors.get(current);
        if (next === undefined) {
            return current;
        }
        current = next;
    }
    return current;
}

function alongEdge(context: StraightSkeletonSolverContext, edge: number, from: Vector2, to: Vector2): number {
    const basis = context.getEdgeWithId(edge).basisVector;
    return (to.x - from.x) * basis.x + (to.y - from.y) * basis.y;
}

/**
 * Every bisector, live or pending, on the ring through `start`: its orbit of clockwise links, in this
 * layer's current state. An orbit that breaks is returned as far as it went.
 */
function ringThrough(context: StraightSkeletonSolverContext, start: number): Set<number> {
    const ring = new Set<number>([start]);
    const limit = context.wavefront.clockwiseNeighbour.length + (layers.get(context)?.pending.size ?? 0);
    let current = clockwiseOf(context, start);
    while (current !== start && current !== NOT_LIVE && !ring.has(current) && ring.size <= limit) {
        ring.add(current);
        current = clockwiseOf(context, current);
    }
    return ring;
}

/** One piece of a struck segment that earlier splits of this layer have cut: `from` to `end`. */
interface Piece {
    from: number;
    end: number;
    /** The cut that closes this piece; absent on the last piece, which runs on to the segment's `to`. */
    cut?: Division;
}

/**
 * The split (spec decisions 11 and 12): the instigator strikes `segment`, and four links are rewritten.
 * `segment.from` goes to the new bisector whose widdershins parent is the struck edge (`towardsClockwise`,
 * the instigator's clockwise parent beside it), which goes on to the instigator's clockwise neighbour; the
 * instigator's widdershins neighbour goes to the new bisector whose clockwise parent is the struck edge
 * (`towardsWiddershins`), which goes on to `segment.to`. The same rewrite divides a ring when the instigator
 * and the segment share it and joins two rings when they do not.
 *
 * The segment was named when the event was generated, so an earlier event of this layer may have replaced
 * either end or cut the segment itself; it is read through that layer's records (see the layer note above).
 *
 * WHICH PIECE OF A CUT SEGMENT THE STRIKE TAKES IS DECIDED BY THE LINKS (BSA.F97 finding 1, BSA.D293): the
 * piece on the instigator's own ring. An earlier split divided the ring it cut, leaving the piece behind its
 * cut on one ring and the piece ahead on the other, so where the instigator stands on the ring relative to
 * the earlier instigator decides it. A position along the edge cannot: two splits sited at one point (the
 * coincidence clustering re-sites them to one medoid) tie, and a tie read either way is wrong for one of
 * the two orders the instigators can stand in. Only where the instigator's ring holds no piece at all — a
 * strike that joins two rings, which one input loop never makes — does the position along the edge decide,
 * as the one reading left.
 */
export function linkSplit(
    context: StraightSkeletonSolverContext,
    instigator: number,
    segment: WavefrontSegment | undefined,
    position: Vector2,
    towardsClockwise: BisectionParams,
    towardsWiddershins: BisectionParams,
): void {
    const layer = layerOf(context);
    if (segment === undefined) {
        retireBisector(context, instigator);
        return;
    }

    const segmentFrom = successorOn(context, layer.clockwiseSuccessor, segment.from);
    const to = successorOn(context, layer.widdershinsSuccessor, segment.to);

    // Walk the cuts earlier splits of this layer made in the segment, in order along the edge, into pieces.
    const pieces: Piece[] = [];
    let pieceFrom = segmentFrom;
    let end = clockwiseOf(context, pieceFrom);
    for (let hops = 0; end !== to && hops < 64; hops++) {
        const division = layer.divisions.get(end);
        if (division === undefined || division.edge !== segment.exteriorEdge) {
            break;
        }
        pieces.push({from: pieceFrom, end, cut: division});
        pieceFrom = division.after;
        end = clockwiseOf(context, pieceFrom);
    }
    pieces.push({from: pieceFrom, end: to});

    let struck = pieces[0];
    if (pieces.length > 1) {
        const ring = ringThrough(context, instigator);
        struck = pieces.find(piece => ring.has(piece.from))
            ?? pieces.find(piece => piece.cut === undefined
                || alongEdge(context, segment.exteriorEdge, piece.cut.position, position) < 0)!;
    }
    const from = struck.from;
    const pieceEnd = struck.end;

    const instigatorClockwise = clockwiseOf(context, instigator);
    const instigatorWiddershins = widdershinsOf(context, instigator);
    retireBisector(context, instigator);
    const before = linkPendingBirth(context, towardsClockwise, from, instigatorClockwise);
    const after = linkPendingBirth(context, towardsWiddershins, instigatorWiddershins, pieceEnd);
    layer.clockwiseSuccessor.set(instigator, before);
    layer.widdershinsSuccessor.set(instigator, after);
    layer.divisions.set(before, {edge: segment.exteriorEdge, position, after});
}

/**
 * One gap of a whole-event merge: the new bisector closes the arc between `lastArrival` (the last
 * participant before the gap) and `firstDeparture` (the first participant after it), taking the clockwise
 * neighbour of the one and the widdershins neighbour of the other. The participants are retired by the
 * merge itself once every gap is linked.
 */
export function linkMergeGap(
    context: StraightSkeletonSolverContext,
    lastArrival: number,
    firstDeparture: number,
    params: BisectionParams,
): void {
    const token = linkPendingBirth(context, params,
        widdershinsOf(context, firstDeparture), clockwiseOf(context, lastArrival));
    const layer = layerOf(context);
    layer.clockwiseSuccessor.set(lastArrival, token);
    layer.widdershinsSuccessor.set(firstDeparture, token);
}

// ── Reading the links ────────────────────────────────────────────────────────────────────────────

function isLiveBisector(context: StraightSkeletonSolverContext, id: number): boolean {
    return id >= context.graph.numExteriorNodes
        && id < context.graph.edges.length
        && !context.acceptedEdges[id];
}

/**
 * The rings through these bisectors: the orbit of `clockwiseNeighbour` from each, in clockwise order.
 * An orbit that breaks (reaches a bisector holding {@link NOT_LIVE}, or runs into another orbit) is
 * returned as far as it went; {@link checkWavefront} is the judge of whether it should have broken.
 */
export function ringsOfWavefront(context: StraightSkeletonSolverContext, interiorEdgeIds: readonly number[]): number[][] {
    const placed = new Set<number>();
    const rings: number[][] = [];
    const limit = context.wavefront.clockwiseNeighbour.length;
    for (const start of interiorEdgeIds) {
        if (placed.has(start)) {
            continue;
        }
        const ring: number[] = [];
        let current = start;
        while (ring.length <= limit) {
            ring.push(current);
            placed.add(current);
            const next = context.wavefront.clockwiseNeighbour[current] ?? NOT_LIVE;
            if (next === start || next < 0 || placed.has(next)) {
                break;
            }
            current = next;
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

/**
 * The violations of W1 to W4 (spec decisions 2 to 5), empty when the wavefront is sound. Stated at a step
 * boundary, over the step inputs still to run (decision 6); not required to hold inside a layer.
 *
 * W3 is read as also requiring every live bisector to stand in some input: at a boundary the step inputs
 * are the whole wavefront, so a live bisector in none of them is a ring the solve has lost.
 */
export function checkWavefront(context: StraightSkeletonSolverContext, inputs: readonly AlgorithmStepInput[]): string[] {
    const violations: string[] = [];
    const {clockwiseNeighbour, widdershinsNeighbour} = context.wavefront;
    const live = (id: number) => isLiveBisector(context, id);
    const interior = (id: number): InteriorEdge => context.getInteriorWithId(id);

    for (const edge of context.graph.interiorEdges) {
        const id = edge.id;
        const clockwise = clockwiseNeighbour[id] ?? NOT_LIVE;
        const widdershins = widdershinsNeighbour[id] ?? NOT_LIVE;
        if (!live(id)) {
            if (clockwise !== NOT_LIVE || widdershins !== NOT_LIVE) {
                violations.push(`W1: e${id} is not live but holds neighbours (cw e${clockwise}, ws e${widdershins})`);
            }
            continue;
        }
        if (!live(clockwise)) {
            violations.push(`W1: live e${id} has clockwise neighbour e${clockwise}, which is not live`);
        } else {
            if (widdershinsNeighbour[clockwise] !== id) {
                violations.push(`W1: e${id}'s clockwise neighbour e${clockwise} has widdershins neighbour e${widdershinsNeighbour[clockwise]}`);
            }
            if (edge.clockwiseExteriorEdgeIndex !== interior(clockwise).widdershinsExteriorEdgeIndex) {
                violations.push(`W2: e${id}'s clockwise parent ${edge.clockwiseExteriorEdgeIndex} is not the widdershins parent ${interior(clockwise).widdershinsExteriorEdgeIndex} of its clockwise neighbour e${clockwise}`);
            }
        }
        if (!live(widdershins)) {
            violations.push(`W1: live e${id} has widdershins neighbour e${widdershins}, which is not live`);
        } else if (clockwiseNeighbour[widdershins] !== id) {
            violations.push(`W1: e${id}'s widdershins neighbour e${widdershins} has clockwise neighbour e${clockwiseNeighbour[widdershins]}`);
        }
    }

    const inputOf = new Map<number, number>();
    inputs.forEach((input, index) => {
        for (const id of input.interiorEdges) {
            if (!live(id)) {
                violations.push(`W3: step input ${index} holds e${id}, which is not live`);
            }
            const other = inputOf.get(id);
            if (other !== undefined) {
                violations.push(`W3: e${id} stands in step inputs ${other} and ${index}`);
            }
            inputOf.set(id, index);
        }
    });
    inputs.forEach((input, index) => {
        for (const id of input.interiorEdges) {
            const clockwise = clockwiseNeighbour[id] ?? NOT_LIVE;
            if (live(id) && live(clockwise) && inputOf.get(clockwise) !== index) {
                violations.push(`W3: step input ${index} holds e${id} but not its clockwise neighbour e${clockwise}`);
            }
        }
    });
    for (const edge of context.graph.interiorEdges) {
        if (live(edge.id) && !inputOf.has(edge.id)) {
            violations.push(`W3: live e${edge.id} stands in no step input`);
        }
    }

    for (let exteriorEdge = 0; exteriorEdge < context.graph.numExteriorNodes; exteriorEdge++) {
        const tos = new Set(context.graph.interiorEdges
            .filter(edge => live(edge.id) && edge.widdershinsExteriorEdgeIndex === exteriorEdge)
            .map(edge => edge.id));
        const segments = wavefrontSegmentsOf(context, exteriorEdge);
        const reached = new Set<number>();
        for (const segment of segments) {
            if (!tos.has(segment.to)) {
                violations.push(`W4: segment (e${segment.from}, e${segment.to}) of edge ${exteriorEdge} does not end on a bisector whose widdershins parent is the edge`);
            } else if (reached.has(segment.to)) {
                violations.push(`W4: two segments of edge ${exteriorEdge} end on e${segment.to}`);
            }
            reached.add(segment.to);
        }
        for (const to of tos) {
            if (!reached.has(to)) {
                violations.push(`W4: e${to} has widdershins parent ${exteriorEdge} but ends no segment of it`);
            }
        }
    }

    return violations;
}

// ── The standing gate's hook (spec decision 23) ──────────────────────────────────────────────────

/**
 * The hook `checkWavefront`'s standing gate runs through. OFF IN A NORMAL SOLVE: its call sites read
 * {@link activeWavefrontProbe} and do nothing more when it is `null` — in `runSimplePolygon`, the boundary
 * after `initInteriorEdges`, the boundary after each `stepAlgorithm`, and `solveFinished` at the end; in
 * `runSimplePolygonStepped`, the same boundaries and no `solveFinished`. Installed only by the test suite.
 */
export interface WavefrontProbe {
    /** After `initInteriorEdges`, and after each `stepAlgorithm` returns, with the inputs still to run. */
    stepBoundary?(context: StraightSkeletonSolverContext, inputs: readonly AlgorithmStepInput[]): void;
    /** At the end of one simple-polygon solve: `errors` are the step failures it accumulated. */
    solveFinished?(context: StraightSkeletonSolverContext, errors: readonly string[]): void;
}

let installedProbe: WavefrontProbe | null = null;

/** Install (or, with `null`, remove) the gate's probe. Test-side only. */
export function setWavefrontProbe(probe: WavefrontProbe | null): void {
    installedProbe = probe;
}

/** The installed probe, or `null` in a normal solve. */
export function activeWavefrontProbe(): WavefrontProbe | null {
    return installedProbe;
}
