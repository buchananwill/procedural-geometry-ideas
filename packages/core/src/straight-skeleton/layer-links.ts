import type {
    BisectionParams,
    StraightSkeletonGraph,
    StraightSkeletonSolverContext,
    Vector2,
    WavefrontSegment,
} from "./types";
import {SkeletonDirection} from "./types";
import {adjacentExteriorEdge, loopOfExteriorEdge} from "./graph-helpers";
import {
    isLiveBisector,
    NOT_LIVE,
    orbit,
    retireBisector,
    retireBisectors,
    storedClockwiseOf,
} from "./wavefront-links";

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

/**
 * ONE LAYER'S LINK STATE, OWNED BY THE LAYER. `handleInteriorNGon` creates one at the start of each layer and passes
 * it to everything that reads or writes a pending birth: `handleCollisionEvent`, the merges' `bisectionsFor*`, the
 * partition selection, the births and the settling. It dies with the layer; nothing else holds it. Its readers and
 * writers see the context's stored links for a bisector and the layer's pending links for a token.
 */
export class LayerLinks {
    nextToken = NOT_LIVE - 1;
    readonly pending = new Map<number, PendingLinks>();
    readonly tokenOf = new Map<BisectionParams, number>();
    /** Retired bisector → the pending bisector that took over its clockwise side. */
    readonly clockwiseSuccessor = new Map<number, number>();
    /** Retired bisector → the pending bisector that took over its widdershins side. */
    readonly widdershinsSuccessor = new Map<number, number>();
    /** Keyed by `before`, the pending bisector closing the piece behind the cut. */
    readonly divisions = new Map<number, Division>();

    constructor(readonly context: StraightSkeletonSolverContext) {
    }

    clockwiseOf(id: number): number {
        if (isToken(id)) {
            return this.pending.get(id)?.clockwise ?? NOT_LIVE;
        }
        return storedClockwiseOf(this.context, id);
    }

    widdershinsOf(id: number): number {
        if (isToken(id)) {
            return this.pending.get(id)?.widdershins ?? NOT_LIVE;
        }
        return id >= 0 ? this.context.wavefront.widdershinsNeighbour[id] ?? NOT_LIVE : NOT_LIVE;
    }

    setClockwise(id: number, value: number): void {
        if (isToken(id)) {
            const pending = this.pending.get(id);
            if (pending !== undefined) {
                pending.clockwise = value;
            }
        } else if (id >= 0) {
            this.context.wavefront.clockwiseNeighbour[id] = value;
        }
    }

    setWiddershins(id: number, value: number): void {
        if (isToken(id)) {
            const pending = this.pending.get(id);
            if (pending !== undefined) {
                pending.widdershins = value;
            }
        } else if (id >= 0) {
            this.context.wavefront.widdershinsNeighbour[id] = value;
        }
    }
}

function isToken(id: number): boolean {
    return id < NOT_LIVE;
}

/** Link `params`' bisector, not yet born, between `widdershins` and `clockwise`. Returns its token. */
function linkPendingBirth(
    layer: LayerLinks,
    params: BisectionParams,
    widdershins: number,
    clockwise: number,
): number {
    const token = layer.nextToken--;
    layer.pending.set(token, {clockwise, widdershins, params});
    layer.tokenOf.set(params, token);
    layer.setClockwise(widdershins, token);
    layer.setWiddershins(clockwise, token);
    return token;
}

/** `params` has been born as bisector `id`: its token is replaced by the id wherever it stands. */
export function linkBirth(layer: LayerLinks, params: BisectionParams, id: number): void {
    const {context} = layer;
    const token = layer.tokenOf.get(params);
    if (token === undefined) {
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
    layer.setClockwise(widdershins, id);
    layer.setWiddershins(clockwise, id);
}

/** The parents of a live bisector or a pending birth, or `undefined` for anything else. */
function parentsOf(layer: LayerLinks, id: number): {clockwise: number; widdershins: number} | undefined {
    if (isToken(id)) {
        const params = layer.pending.get(id)?.params;
        return params === undefined
            ? undefined
            : {clockwise: params.clockwiseExteriorEdgeIndex, widdershins: params.widdershinsExteriorEdgeIndex};
    }
    if (!isLiveBisector(layer.context, id)) {
        return undefined;
    }
    const edge = layer.context.getInteriorWithId(id);
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
 * is `checkWavefront`'s.
 *
 * Asked by the same-start, same-source dedupe, which takes such events for re-reports of one split: two
 * splits sited at one point are no re-report, and dropping either leaves its neighbours with parents that
 * do not meet.
 */
export function droppableBirths(
    layer: LayerLinks,
    candidates: readonly BisectionParams[],
): Set<BisectionParams> {
    const droppable = new Set<BisectionParams>();
    const candidateOf = new Map<number, BisectionParams>();
    for (const params of candidates) {
        const token = layer.tokenOf.get(params);
        if (token === undefined || !layer.pending.has(token)) {
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
        for (const previous of orbit(id => layer.widdershinsOf(id), token)) {
            if (!candidateOf.has(previous)) {
                break;
            }
            first = previous;
        }
        const run: number[] = [first];
        for (const next of orbit(id => layer.clockwiseOf(id), first)) {
            if (!candidateOf.has(next)) {
                break;
            }
            run.push(next);
        }
        const last = run[run.length - 1];
        run.forEach(id => placed.add(id));

        const widdershins = parentsOf(layer, layer.widdershinsOf(first));
        const clockwise = parentsOf(layer, layer.clockwiseOf(last));
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
export function birthsClosedAtOneNode(layer: LayerLinks): Set<BisectionParams> {
    const closed = new Set<BisectionParams>();
    const placed = new Set<number>();
    for (const token of layer.pending.keys()) {
        if (placed.has(token)) {
            continue;
        }
        const ring: number[] = [token];
        let onlyPending = true;
        for (const id of orbit(member => layer.clockwiseOf(member), token)) {
            if (!layer.pending.has(id)) {
                onlyPending = false;
                break;
            }
            ring.push(id);
        }
        // Whole: every member pending, and the orbit closed, back at the token rather than broken.
        const whole = onlyPending && layer.clockwiseOf(ring[ring.length - 1]) === token;
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
 * neighbours, and the layer's records are discarded, leaving it as it was created.
 */
export function settleLayerLinks(layer: LayerLinks): void {
    for (const [token, links] of [...layer.pending.entries()].sort((a, b) => b[0] - a[0])) {
        if (!layer.pending.has(token)) {
            continue;
        }
        layer.pending.delete(token);
        const clockwise = links.clockwise === token ? NOT_LIVE : links.clockwise;
        const widdershins = links.widdershins === token ? NOT_LIVE : links.widdershins;
        layer.setClockwise(widdershins, clockwise);
        layer.setWiddershins(clockwise, widdershins);
    }
    layer.nextToken = NOT_LIVE - 1;
    layer.tokenOf.clear();
    layer.clockwiseSuccessor.clear();
    layer.widdershinsSuccessor.clear();
    layer.divisions.clear();
}

// ── The events' link writes (spec decision 9) ────────────────────────────────────────────────────

/*
 * EVERY EVENT'S LINK WRITE IS ONE OF TWO REWRITES. A GAP: one new bisector closes the arc between the participant
 * before it (`lastArrival`) and the participant after it (`firstDeparture`), standing between the clockwise neighbour
 * of the one and the widdershins neighbour of the other ({@link linkGap}). A CUT: two new bisectors stand where the
 * gap's one would, each running on to one end of the piece of a wall's segment the strike takes, and the cut is
 * recorded ({@link cutSegment}). The five writers below are those two, each reading its participants' neighbours as a
 * {@link Bracket} before anything is retired.
 *
 * THE ORDER OF READ, RETIRE AND LINK IS EACH WRITER'S OWN, AND IS KEPT: the pair collapse, the vertex-to-vertex event
 * and the split retire their participants before linking; a merge's gaps link before the merge retires its arrivals.
 * On a ring of two a participant is its own neighbour's neighbour, so the order decides the links.
 */

/** A gap's two sides: the participants bracketing it, and the neighbours they had when it was read. */
interface Bracket {
    /** The participant before the gap, whose clockwise side the new bisector takes over. */
    lastArrival: number;
    /** The participant after the gap, whose widdershins side the new bisector takes over. */
    firstDeparture: number;
    /** `lastArrival`'s clockwise neighbour. */
    clockwise: number;
    /** `firstDeparture`'s widdershins neighbour. */
    widdershins: number;
}

/** Read the gap between `lastArrival` and `firstDeparture`: their outer neighbours, as the layer has them now. */
function bracketOf(layer: LayerLinks, lastArrival: number, firstDeparture: number): Bracket {
    return {
        lastArrival,
        firstDeparture,
        clockwise: layer.clockwiseOf(lastArrival),
        widdershins: layer.widdershinsOf(firstDeparture),
    };
}

/** THE GAP: `params`' bisector stands between the bracket's two neighbours, the successor on both of its sides. */
function linkGap(layer: LayerLinks, bracket: Bracket, params: BisectionParams): void {
    const token = linkPendingBirth(layer, params, bracket.widdershins, bracket.clockwise);
    layer.clockwiseSuccessor.set(bracket.lastArrival, token);
    layer.widdershinsSuccessor.set(bracket.firstDeparture, token);
}

/**
 * THE CUT: `piece` of a segment of wall `edge` is cut at `position`. `towardsClockwise` stands between the piece's
 * `from` and the bracket's clockwise neighbour, the successor on `lastArrival`'s clockwise side; `towardsWiddershins`
 * between the bracket's widdershins neighbour and the piece's end, the successor on `firstDeparture`'s widdershins side;
 * and the cut is recorded on `towardsClockwise`, for a later strike of the layer to read.
 */
function cutSegment(
    layer: LayerLinks,
    bracket: Bracket,
    piece: Piece,
    edge: number,
    position: Vector2,
    towardsClockwise: BisectionParams,
    towardsWiddershins: BisectionParams,
): void {
    const before = linkPendingBirth(layer, towardsClockwise, piece.from, bracket.clockwise);
    const after = linkPendingBirth(layer, towardsWiddershins, bracket.widdershins, piece.end);
    layer.clockwiseSuccessor.set(bracket.lastArrival, before);
    layer.widdershinsSuccessor.set(bracket.firstDeparture, after);
    layer.divisions.set(before, {edge, position, after});
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
    layer: LayerLinks,
    participants: readonly number[],
    widdershinsCollider: number,
    clockwiseCollider: number,
    params: BisectionParams,
): void {
    if (layer.clockwiseOf(widdershinsCollider) !== clockwiseCollider) {
        throw new Error(`Pair collapse of e${widdershinsCollider} and e${clockwiseCollider}, which are not neighbours `
            + `on the wavefront (e${widdershinsCollider}'s clockwise neighbour is e${layer.clockwiseOf(widdershinsCollider)}).`);
    }
    // A gap from the clockwise collider round to the widdershins one: the collapse bisector takes the outer sides.
    const gap = bracketOf(layer, clockwiseCollider, widdershinsCollider);
    retireBisectors(layer.context, participants);
    linkGap(layer, gap, params);
}

/**
 * The vertex-to-vertex event of two bisectors that share no parent. `first` is born with the
 * instigator's clockwise parent and the target's widdershins parent, `second` with the target's clockwise
 * parent and the instigator's widdershins parent: the same rewrite as a split, with the target's two
 * sides standing for the struck segment's two ends.
 */
export function linkVertexToVertex(
    layer: LayerLinks,
    instigator: number,
    target: number,
    first: BisectionParams,
    second: BisectionParams,
): void {
    // Two gaps, both read before either participant retires: instigator round to target, and target round to it.
    const firstGap = bracketOf(layer, instigator, target);
    const secondGap = bracketOf(layer, target, instigator);
    retireBisectors(layer.context, [instigator, target]);
    linkGap(layer, firstGap, first);
    linkGap(layer, secondGap, second);
}

/**
 * The bisector now standing in a retired bisector's place on one side: the retired bisector itself if
 * nothing in this layer replaced it, else the pending bisector an earlier event recorded as its successor.
 *
 * ONE STEP, NEVER A WALK: every successor is a pending birth ({@link linkGap} and {@link cutSegment} record only
 * tokens), and a pending birth is never retired within its layer, so a successor never has a successor of its own.
 */
function successorOn(
    context: StraightSkeletonSolverContext,
    successors: Map<number, number>,
    id: number,
): number {
    const live = isToken(id) || !context.isAccepted(id);
    return live ? id : successors.get(id) ?? id;
}

function alongEdge(context: StraightSkeletonSolverContext, edge: number, from: Vector2, to: Vector2): number {
    const basis = context.getEdgeWithId(edge).basisVector;
    return (to.x - from.x) * basis.x + (to.y - from.y) * basis.y;
}

/**
 * Every bisector, live or pending, on the ring through `start`: its orbit of clockwise links, in this
 * layer's current state. An orbit that breaks is returned as far as it went.
 */
function ringThrough(layer: LayerLinks, start: number): Set<number> {
    return new Set([start, ...orbit(id => layer.clockwiseOf(id), start)]);
}

/** One piece of a struck segment that earlier splits of this layer have cut: `from` to `end`. */
interface Piece {
    from: number;
    end: number;
    /** The cut that closes this piece; absent on the last piece, which runs on to the segment's `to`. */
    cut?: Division;
}

/**
 * THE BAR ON {@link struckPiece}'s WALK OF CUTS, which is no orbit: each hop passes from a cut's `before` to its `after`
 * and on to that bisector's clockwise neighbour. A sound walk passes each of this layer's cuts in the segment once, in
 * order along the edge, and ends at the segment's end long before the bar. Only a cycle of cuts, which broken links
 * alone make, reaches it, and the walk then ends where it stands.
 */
const MAX_CUTS_WALKED = 64;

/**
 * The piece of `segment` a strike at `position` takes, the segment read through this layer's records: its ends through
 * the successors, and the cuts earlier strikes of this layer made in it, in order along the edge, as pieces. `ring` gives
 * the bisectors on the striker's ring; it is read only when the segment has been cut.
 */
function struckPiece(
    layer: LayerLinks,
    segment: WavefrontSegment,
    position: Vector2,
    ring: () => ReadonlySet<number>,
): Piece {
    const {context} = layer;
    const segmentFrom = successorOn(context, layer.clockwiseSuccessor, segment.from);
    const to = successorOn(context, layer.widdershinsSuccessor, segment.to);

    // Walk the cuts earlier splits of this layer made in the segment, in order along the edge, into pieces.
    const pieces: Piece[] = [];
    let pieceFrom = segmentFrom;
    let end = layer.clockwiseOf(pieceFrom);
    for (let hops = 0; end !== to && hops < MAX_CUTS_WALKED; hops++) {
        const division = layer.divisions.get(end);
        if (division === undefined || division.edge !== segment.exteriorEdge) {
            break;
        }
        pieces.push({from: pieceFrom, end, cut: division});
        pieceFrom = division.after;
        end = layer.clockwiseOf(pieceFrom);
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
    layer: LayerLinks,
    instigator: number,
    segment: WavefrontSegment,
    position: Vector2,
    towardsClockwise: BisectionParams,
    towardsWiddershins: BisectionParams,
): void {
    const struck = struckPiece(layer, segment, position, () => ringThrough(layer, instigator));
    // The instigator is both sides of the gap it cuts the wall in.
    const gap = bracketOf(layer, instigator, instigator);
    retireBisector(layer.context, instigator);
    cutSegment(layer, gap, struck, segment.exteriorEdge, position, towardsClockwise, towardsWiddershins);
}

/**
 * One gap of a whole-event merge: the new bisector closes the arc between `lastArrival` (the last
 * participant before the gap) and `firstDeparture` (the first participant after it), taking the clockwise
 * neighbour of the one and the widdershins neighbour of the other. The participants are retired by the
 * merge itself once every gap is linked.
 */
export function linkMergeGap(
    layer: LayerLinks,
    lastArrival: number,
    firstDeparture: number,
    params: BisectionParams,
): void {
    linkGap(layer, bracketOf(layer, lastArrival, firstDeparture), params);
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
    layer: LayerLinks,
    lastArrival: number,
    firstDeparture: number,
    segment: WavefrontSegment,
    position: Vector2,
    towardsClockwise: BisectionParams,
    towardsWiddershins: BisectionParams,
): void {
    const struck = struckPiece(layer, segment, position,
        () => new Set([...ringThrough(layer, lastArrival), ...ringThrough(layer, firstDeparture)]));
    cutSegment(layer, bracketOf(layer, lastArrival, firstDeparture), struck, segment.exteriorEdge, position,
        towardsClockwise, towardsWiddershins);
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
export function partitionArc(layer: LayerLinks, params: BisectionParams): number {
    const {context} = layer;
    const token = layer.tokenOf.get(params);
    if (token === undefined || !layer.pending.has(token)) {
        return 0;
    }
    let arc = 0;
    let parent = params.clockwiseExteriorEdgeIndex;
    for (const member of orbit(id => layer.clockwiseOf(id), token)) {
        const next = parentsOf(layer, member);
        if (next === undefined) {
            break;
        }
        arc += exteriorGap(context.graph, parent, next.clockwise);
        parent = next.clockwise;
    }
    return arc;
}
