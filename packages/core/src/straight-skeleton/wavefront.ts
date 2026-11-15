import type {
    AlgorithmStepInput,
    BisectionParams,
    InteriorEdge,
    StraightSkeletonGraph,
    StraightSkeletonSolverContext,
    Vector2,
    Wavefront,
    WavefrontSegment,
} from "./types";
import {SkeletonDirection} from "./types";
import {adjacentExteriorEdge, loopOfExteriorEdge} from "./graph-helpers";
import {degenerateAreaBar} from "./constants";
import {ringPerimeter, signedArea} from "../random-polygon/geometry-helpers";
import {distanceToSegment} from "../stroke-spline/vertex-budget";
import {isPointInPolygon} from "../terrain/polygon-slope";
import {findFirstCrossing} from "./polygon-decomposition";

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
 * {@link partitionArc}, a walk of the ring (skeleton join-and-divide spec, decisions 25 to 27), which replaced
 * `partitionSpan` and finds no neighbour.
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
 * never born (a re-report the dedupe dropped, or a ring closed at one node) is spliced out when the layer settles
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
 * THE RINGS THAT CLOSE WHERE THEY WOULD BE BORN (skeleton edge-acceptance spec, decision 32): every pending birth
 * of this layer that stands on a ring made ONLY of this layer's pending births, ALL SOURCED AT ONE NODE. Such a ring
 * has no extent — every one of its segments has both ends at that one point — so it is closed there and none of it
 * is born. It is the residue of a vertex event resolved pairwise: two births with each other's parents at the node
 * where their shared face has just closed (`fine:rosette40` at 7e10 to 1e11).
 *
 * READ FROM THE LINKS AND THE SOURCE NODE ALONE: no position, no tolerance. A ring that holds any live bisector, or
 * births from two nodes, is born as it is. Asked when the layer's events are resolved, before any birth; the births
 * it names are never born, so they are not pending and the acceptance predicate is unchanged. Splicing them out at
 * {@link settleLayerLinks} touches no live bisector, because the ring holds none.
 */
export function birthsClosedAtOneNode(context: StraightSkeletonSolverContext): Set<BisectionParams> {
    const closed = new Set<BisectionParams>();
    const layer = layers.get(context);
    if (layer === undefined) {
        return closed;
    }
    const placed = new Set<number>();
    for (const token of layer.pending.keys()) {
        if (placed.has(token)) {
            continue;
        }
        const ring: number[] = [token];
        let current = layer.pending.get(token)!.clockwise;
        let whole = true;
        while (current !== token) {
            if (!isToken(current) || !layer.pending.has(current) || ring.includes(current)) {
                whole = false;
                break;
            }
            ring.push(current);
            current = layer.pending.get(current)!.clockwise;
        }
        if (!whole) {
            placed.add(token);
            continue;
        }
        ring.forEach(member => placed.add(member));
        const sources = new Set(ring.map(member => layer.pending.get(member)!.params.source));
        if (sources.size === 1) {
            ring.forEach(member => closed.add(layer.pending.get(member)!.params));
        }
    }
    return closed;
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
 * The piece of `segment` a strike at `position` takes, the segment read through this layer's records: its ends through
 * the successors, and the cuts earlier strikes of this layer made in it, in order along the edge, as pieces. `ring` gives
 * the bisectors on the striker's ring; it is read only when the segment has been cut.
 */
function struckPiece(
    context: StraightSkeletonSolverContext,
    segment: WavefrontSegment,
    position: Vector2,
    ring: () => ReadonlySet<number>,
): Piece {
    const layer = layerOf(context);
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

    if (pieces.length === 1) {
        return pieces[0];
    }
    const striker = ring();
    /** Does the strike lie behind this piece's closing cut along the edge: is it the piece that contains it? */
    const holdsStrike = (piece: Piece) => piece.cut === undefined
        || alongEdge(context, segment.exteriorEdge, piece.cut.position, position) < 0;
    const onRing = pieces.filter(piece => striker.has(piece.from));
    // THE PIECE RULE (skeleton simultaneous-rings spec, decision 17): when more than one piece stands on the
    // instigator's ring — which needs a join earlier in the layer, since on one loop rings only divide and each
    // ring holds at most one piece — the ring cannot choose, and the strike takes the first of those pieces that
    // contains it. Measured before it was relied on (decision 43): 0 such strikes on every single-loop roster.
    // Where none of them contains it, the piece that contains it by position along the edge is taken, as the
    // branch for no piece on the ring takes it (BSA.D314): the first piece on the ring would be a piece the
    // strike is known not to lie on. Unreached on every roster, measured.
    return onRing.length > 1
        ? onRing.find(holdsStrike) ?? pieces.find(holdsStrike)!
        : onRing[0] ?? pieces.find(holdsStrike)!;
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
 * as the one reading left. And where it holds more than one — a segment cut by a join earlier in the layer, both of
 * whose pieces the joined ring now holds — the position decides among those pieces (simultaneous-rings spec,
 * decision 17; C2′, where the ring's first piece is the wrong one).
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

    const struck = struckPiece(context, segment, position, () => ringThrough(context, instigator));
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

/**
 * THE GAP THAT FACES A STRUCK WALL (skeleton flat-ring and third-front spec, decisions 38 to 40): one gap of a whole-event
 * merge whose node lies on a third front is not born, and `segment` of the wall is cut at `position` instead, as a split
 * by the gap would cut it. `towardsClockwise` stands between the struck piece's `from` and `lastArrival`'s clockwise
 * neighbour, `towardsWiddershins` between `firstDeparture`'s widdershins neighbour and the piece's end, and the cut is
 * recorded as a split's is.
 *
 * BOTH SUCCESSORS ARE RECORDED, one on each arrival, as {@link linkMergeGap} records them: a later strike of the layer
 * may read either arrival (a variant recording one failed 22 of 51 grid layouts, BSA.F111). The struck piece is chosen
 * by {@link linkSplit}'s piece rule, the striker's ring being the union of the rings through the two arrivals.
 */
export function linkMergeGapOnWall(
    context: StraightSkeletonSolverContext,
    lastArrival: number,
    firstDeparture: number,
    segment: WavefrontSegment,
    position: Vector2,
    towardsClockwise: BisectionParams,
    towardsWiddershins: BisectionParams,
): void {
    const layer = layerOf(context);
    const struck = struckPiece(context, segment, position,
        () => new Set([...ringThrough(context, lastArrival), ...ringThrough(context, firstDeparture)]));
    const gapClockwise = clockwiseOf(context, lastArrival);
    const gapWiddershins = widdershinsOf(context, firstDeparture);
    const before = linkPendingBirth(context, towardsClockwise, struck.from, gapClockwise);
    const after = linkPendingBirth(context, towardsWiddershins, gapWiddershins, struck.end);
    layer.clockwiseSuccessor.set(lastArrival, before);
    layer.widdershinsSuccessor.set(firstDeparture, after);
    layer.divisions.set(before, {edge: segment.exteriorEdge, position, after});
}

// ── The current step (skeleton join-and-divide spec, decisions 4 and 22) ─────────────────────────

/*
 * WHICH STEP IS RUNNING. `handleAlgorithmStepInput` records the bisectors of the step it is about to handle, and
 * clears the record when the step returns or throws. The struck-segment search reads it: a split may strike only a
 * segment whose `from` stands in the current step (decision 4), because a ring of another step is another part of
 * the region. Outside a step — a direct call from a unit test — nothing is recorded and every segment is searched,
 * as before. Kept beside the layer's link state, keyed by context, and not on the context: it is the solver's
 * bookkeeping of one call, not part of the wavefront.
 */
const steps = new WeakMap<StraightSkeletonSolverContext, ReadonlySet<number>>();

/** Record the step about to be handled: its bisectors, which the struck-segment search is restricted to. */
export function beginStep(context: StraightSkeletonSolverContext, interiorEdgeIds: readonly number[]): void {
    steps.set(context, new Set(interiorEdgeIds));
}

/** The step has returned or thrown: nothing is recorded, and every segment is searched again. */
export function endStep(context: StraightSkeletonSolverContext): void {
    steps.delete(context);
}

/** The bisectors of the step being handled, or `null` outside a step. */
export function currentStepMembers(context: StraightSkeletonSolverContext): ReadonlySet<number> | null {
    return steps.get(context) ?? null;
}

/**
 * The two kinds a step of several rings is refused with (join-and-divide decisions 16, 22 and 23; simultaneous-rings
 * decisions 20 to 24).
 */
export type StepRefusalKind = 'simultaneous-across-rings' | 'multi-ring-step-refused';

/**
 * REFUSE THE CURRENT STEP, BY NAME: push a blocking diagnostic naming the step's bisectors and the reason, and throw
 * the same text, which `stepAlgorithm` records as the step's failure. Never a guess (decision 16), and never silent.
 */
export function refuseStep(context: StraightSkeletonSolverContext, kind: StepRefusalKind, reason: string): never {
    const members = currentStepMembers(context);
    const step = members === null ? 'outside a step' : `[${[...members].sort((a, b) => a - b).join(', ')}]`;
    const detail = `Step ${step}: ${reason}`;
    context.diagnostics.push({kind, detail});
    throw new Error(detail);
}

// ── The partition order (skeleton join-and-divide spec, decisions 25 to 27) ───────────────────────

/**
 * How many clockwise steps round the loop lead from exterior edge `from` to `to` (`adjacentExteriorEdge`), when the
 * two are of one loop; 1 when they are of two loops, which a joined ring crosses between (decision 25).
 */
function exteriorGap(graph: StraightSkeletonGraph, from: number, to: number): number {
    const loop = loopOfExteriorEdge(graph, from);
    if (loop !== loopOfExteriorEdge(graph, to)) {
        return 1;
    }
    const {count} = graph.loops[loop];
    let steps = 0;
    for (let edge = from; edge !== to && steps < count; steps++) {
        edge = adjacentExteriorEdge(graph, edge, SkeletonDirection.Clockwise);
    }
    return steps;
}

/**
 * THE PARTITION ORDER, ON ANY RING (decisions 25 to 27): walk the pending bisector's ring clockwise from the
 * bisector to the last member before it returns, and sum the gaps between consecutive clockwise parents.
 *
 *     partitionArc(b) = Σ_{k=0..m-1} gap(cp(e_k), cp(e_{k+1}))
 *       e_0 = b,  e_{k+1} = clockwise neighbour of e_k,  clockwise neighbour of e_m = b,  cp = clockwise parent
 *
 * ON ONE LOOP IT IS TODAY'S SPAN, `(ws − cw + n) mod n`, EXACTLY (decision 26): a ring cut from one loop has clockwise
 * parents that rise cyclically through less than one turn from the bisector's `cw` to its `ws` (W2 makes the last
 * parent `ws`), so the gaps telescope. Ordering by ring size (BSA.F96) leaves out the closed edges inside the arc,
 * which is why it renumbered 16 digests; this counts them.
 *
 * READ THROUGH THE LAYER'S LINK STATE (decision 27), because the order is taken before the births: the walk passes
 * pending births as their tokens. A bisector this layer has not linked, or a ring the links cannot close, gives
 * whatever it walks — 0 for the first.
 */
export function partitionArc(context: StraightSkeletonSolverContext, params: BisectionParams): number {
    const layer = layers.get(context);
    const token = layer?.tokenOf.get(params);
    if (layer === undefined || token === undefined || !layer.pending.has(token)) {
        return 0;
    }
    const limit = context.wavefront.clockwiseNeighbour.length + layer.pending.size;
    let arc = 0;
    let parent = params.clockwiseExteriorEdgeIndex;
    let current = clockwiseOf(context, token);
    for (let hops = 0; current !== token && hops <= limit; hops++) {
        const next = parentsOf(context, current);
        if (next === undefined) {
            break;
        }
        arc += exteriorGap(context.graph, parent, next.clockwise);
        parent = next.clockwise;
        current = clockwiseOf(context, current);
    }
    return arc;
}

// ── Components: which child each ring goes to (decisions 10 to 17) ────────────────────────────────

/**
 * A ring's polygon at the layer's `time`: each bisector born in the layer (`newborn`) at its source node, and each older
 * one at `context.wavefrontVertexAt(id, time)` (decision 12). The placement both `componentsOfRings` and the flat-ring
 * test read.
 */
export function ringPolygonAt(
    context: StraightSkeletonSolverContext,
    ring: readonly number[],
    time: number,
    newborn: ReadonlySet<number>,
): Vector2[] {
    const {graph} = context;
    return ring.map(id => newborn.has(id)
        ? graph.nodes[graph.edges[id].source].position
        : context.wavefrontVertexAt(id, time));
}

/** One child of a step of several rings: an outer ring and the inner rings inside it (decision 10). */
export interface RingComponent {
    outer: number[];
    inner: number[][];
}

/**
 * THE COMPONENTS OF THE RINGS A LAYER LEFT (decisions 12 to 16), for a step of more than one ring. Each ring is
 * classified at the layer's time `time`, the time of the earliest arrival the layer resolved: its polygon is its
 * bisectors' positions at `time` in clockwise-neighbour order, a bisector born in the layer (`newborn`) at its source
 * node and an older one at `context.wavefrontVertexAt(id, time)`.
 *
 *  - A ring whose polygon has NEGATIVE `signedArea` is OUTER, the outline's clockwise winding; positive is inner
 *    (decision 13).
 *  - Each outer ring founds one component, and each inner ring joins the component of the outer ring of least
 *    `|area|` whose polygon contains the inner ring's WITNESS, by `isPointInPolygon` (decision 14). The witness is the
 *    source node of the clockwise parent of the ring's first member: an inner ring holds only hole edges, so it is a
 *    vertex of a hole the ring encloses, and it lies on a wall, which every front left at offset zero (decision 15).
 *  - AMBIGUITY IS REFUSED, NEVER GUESSED (decision 16): a ring of `|area|` at or under `degenerateAreaBar(δ,
 *    perimeter)`, a witness closer than δ to an edge of an outer polygon by `distanceToSegment`, or an inner ring no
 *    outer ring contains is refused as `multi-ring-step-refused`, naming the step and the ring. δ is the solve's
 *    perceptual floor, read here and changed nowhere.
 *  - A RING WHOSE POLYGON CROSSES ITSELF IS REFUSED THE SAME WAY, BEFORE ITS AREA IS READ (BSA.D309): the sign of a
 *    self-crossing polygon's area is the difference of its lobes' and says nothing about its winding, so decision 15's
 *    premise that the rings are simple is checked, not trusted. The test is `findFirstCrossing` at δ, the
 *    decomposition's own, which skips an endpoint touch: a joined ring visits its join node twice, and its four edges
 *    there meet only at their ends. It costs one O(m²) pass per ring a step of several rings leaves; it is never
 *    reached on one loop, whose steps are each of one ring (decision 11).
 *
 *  - A RING OF EXACTLY TWO BISECTORS is its own component and is not classified (skeleton simultaneous-rings spec,
 *    decision 12): a ridge's corridor, which bounds nothing.
 *
 * Components are returned in the order of their outer rings (or rings of two) in `rings`, each inner ring in the order
 * given.
 */
export function componentsOfRings(
    context: StraightSkeletonSolverContext,
    rings: number[][],
    time: number,
    newborn: ReadonlySet<number> = new Set(),
): RingComponent[] {
    const {graph} = context;
    const floor = context.perceptualFloor;
    // A RING OF EXACTLY TWO BISECTORS IS ITS OWN COMPONENT, UNCLASSIFIED (skeleton simultaneous-rings spec, decision 12):
    // the corridor between two fronts meeting along a line, which the pair handler closes as it closes a single loop's
    // corridor (decision 11). Its polygon has two points and its area is exactly 0, so it would be refused below; it
    // bounds nothing and cannot hold a hole.
    const corridors = new Set(rings.filter(ring => ring.length === 2));
    const placed = rings.filter(ring => !corridors.has(ring)).map(ring => {
        const polygon = ringPolygonAt(context, ring, time, newborn);
        const crossing = findFirstCrossing(polygon, floor);
        if (crossing !== null) {
            refuseStep(context, 'multi-ring-step-refused', `ring [${ring.join(', ')}]'s polygon crosses itself at time `
                + `${time}: its edges ${crossing.edgeI} and ${crossing.edgeJ} cross at (${crossing.point.x}, `
                + `${crossing.point.y}), so the sign of its area cannot classify it as outer or inner.`);
        }
        const area = signedArea(polygon);
        const bar = degenerateAreaBar(floor, ringPerimeter(polygon));
        if (!(Math.abs(area) > bar)) {
            refuseStep(context, 'multi-ring-step-refused', `ring [${ring.join(', ')}] has area ${area} at time ${time}, `
                + `at or under the ${bar} degenerate-area bar: it cannot be classified as outer or inner.`);
        }
        return {ring, polygon, area};
    });

    const outers = placed.filter(entry => entry.area < 0);
    const componentOf = new Map(outers.map(entry => [entry.ring, {outer: entry.ring, inner: []} as RingComponent] as const));
    for (const ring of corridors) {
        componentOf.set(ring, {outer: ring, inner: []});
    }
    // In the order of their outer rings (or corridor rings) in `rings`.
    const components: RingComponent[] = rings.flatMap(ring => componentOf.get(ring) ?? []);
    for (const entry of placed.filter(candidate => candidate.area > 0)) {
        const parent = context.getInteriorWithId(entry.ring[0]).clockwiseExteriorEdgeIndex;
        const witness = graph.nodes[graph.edges[parent].source].position;
        let container = -1;
        outers.forEach((outer, index) => {
            const {polygon} = outer;
            const near = polygon.some((vertex, k) =>
                distanceToSegment(witness, vertex, polygon[(k + 1) % polygon.length]) < floor);
            if (near) {
                refuseStep(context, 'multi-ring-step-refused', `inner ring [${entry.ring.join(', ')}]'s witness `
                    + `(${witness.x}, ${witness.y}) lies within the ${floor} floor of outer ring `
                    + `[${outer.ring.join(', ')}] at time ${time}: which ring holds it cannot be read.`);
            }
            if (isPointInPolygon(witness, polygon)
                && (container === -1 || Math.abs(outer.area) < Math.abs(outers[container].area))) {
                container = index;
            }
        });
        if (container === -1) {
            refuseStep(context, 'multi-ring-step-refused', `inner ring [${entry.ring.join(', ')}]'s witness `
                + `(${witness.x}, ${witness.y}) lies in no outer ring at time ${time}.`);
        }
        componentOf.get(outers[container].ring)!.inner.push(entry.ring);
    }
    return components;
}

// ── Reading the links ────────────────────────────────────────────────────────────────────────────

function isLiveBisector(context: StraightSkeletonSolverContext, id: number): boolean {
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
    /** Once per flat ring closed in its step (skeleton flat-ring and third-front spec, decision 47). */
    flatRingClosed?(context: StraightSkeletonSolverContext, ring: readonly number[]): void;
    /** Once per third-front meeting resolved whole: the merge's arrivals and the struck wall (decision 47). */
    thirdFrontResolved?(context: StraightSkeletonSolverContext, merge: readonly number[], wall: number): void;
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
