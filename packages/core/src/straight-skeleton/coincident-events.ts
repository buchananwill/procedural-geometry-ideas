import {
    BisectionParams,
    CollisionEvent,
    StraightSkeletonSolverContext,
    Vector2,
} from "./types";
import {addVectors, areEqual, makeBisectedBasis, sizeOfVector, vectorsAreEqual} from "./core-functions";

/**
 * One wavefront vertex event: every interior edge that arrives at the same point at the
 * same offset.
 *
 * A pairwise collision is the two-edge case of this. Exact symmetry — a regular n-gon, an
 * evenly resampled stroke — routinely produces the k-edge case, where k bisectors reach one
 * point simultaneously. Those k arrivals surface as O(k^2) separate `CollisionEvent`s that
 * all describe the same physical event, so they must be merged before any of them is acted
 * on; handling them one pair at a time invents skeleton edges that do not exist.
 */
export interface CoincidentMerge {
    position: Vector2;
    /** Interior edge ids arriving at `position`, in first-seen order. */
    edgeIds: number[];
}

/**
 * Group the interior-to-interior collisions of a single offset layer by collision point.
 *
 * Events at the same offset but different points are genuinely independent and stay in
 * separate groups; events at the same point are one vertex event however many pairs
 * reported it.
 */
export function clusterCoincidentMerges(events: CollisionEvent[]): CoincidentMerge[] {
    const merges: CoincidentMerge[] = [];

    for (const event of events) {
        let merge = merges.find(candidate => vectorsAreEqual(candidate.position, event.position));
        if (merge === undefined) {
            merge = {position: event.position, edgeIds: []};
            merges.push(merge);
        }

        for (const edgeId of event.collidingEdges) {
            if (!merge.edgeIds.includes(edgeId)) {
                merge.edgeIds.push(edgeId);
            }
        }
    }

    return merges;
}

/**
 * Does any edge arrive in more than one of these groups?
 *
 * Each group is meant to be one vertex event, and a bisector can only arrive somewhere once.
 * An edge in two groups means it reaches two different points at the same offset, which
 * happens when it runs *along* a collapsing ridge and meets everything on that ridge at once.
 * That is a whole strip closing simultaneously, not a set of independent vertex events, and
 * resolving the groups in turn would let the first one consume the shared edges and strand
 * the rest.
 */
export function mergesShareAnEdge(merges: CoincidentMerge[]): boolean {
    const seen = new Set<number>();
    for (const merge of merges) {
        for (const edgeId of merge.edgeIds) {
            if (seen.has(edgeId)) {
                return true;
            }
            seen.add(edgeId);
        }
    }
    return false;
}

/**
 * Order the bisectors attached to one exterior parent by where along it they sit.
 *
 * An exterior edge normally carries one wavefront segment, bounded by one bisector at each end.
 * A split event divides it into two, and from then on the edge carries several segments whose
 * bounding bisectors have to be told apart.
 *
 * The ordering is the sweep index `activeExteriorEdgeSegments` already sorts by, and it is
 * deliberately topological rather than geometric. Ordering by where each bisector's source
 * projects onto the parent looks equivalent and is not: a split point is only guaranteed to lie
 * on the parent's *line*, and on `PREMATURE_BISECTOR_SPLIT` one lands 22 units beyond the
 * parent's widdershins end, which sorts the two bisectors born there in front of the segment
 * they are supposed to bound and pairs each with the wrong neighbour. Indices of the other
 * parent cannot slide off the edge that way.
 *
 * The two bisectors born at a split share a source and would tie under any positional measure,
 * which is the second reason the clockwise and widdershins users of a parent are ordered
 * separately and then zipped: along the parent they strictly alternate, so rank against rank is
 * the correct pairing and the tie never arises.
 */
function orderAlongParent(
    edgeIds: number[],
    parentId: number,
    context: StraightSkeletonSolverContext,
): number[] {
    if (edgeIds.length < 2) {
        return edgeIds;
    }

    const exteriorCount = context.graph.numExteriorNodes;
    const rotate = (id: number) => (id - parentId + exteriorCount) % exteriorCount;
    const sweepIndex = (edgeId: number) => {
        const interior = context.getInteriorWithId(edgeId);
        return exteriorCount
            - rotate(interior.widdershinsExteriorEdgeIndex)
            - rotate(interior.clockwiseExteriorEdgeIndex)
            - 1;
    };

    return edgeIds.toSorted((first, second) => sweepIndex(first) - sweepIndex(second));
}

/**
 * Put a step's interior edges into clockwise ring order, one ring per closed wavefront.
 *
 * Consecutive interior edges share one exterior parent: the clockwise parent of an edge is
 * the widdershins parent of its clockwise neighbour. A step's edges usually form a single
 * ring, but not always — so every ring is returned, and each edge appears in exactly one.
 *
 * That relation is a function only while every exterior edge carries a single wavefront
 * segment. Once a split event has divided one, the same parent bounds two segments and is
 * therefore the clockwise parent of two edges and the widdershins parent of two others; which
 * of them follows which is settled by `orderAlongParent`, not by the parent's identity alone.
 *
 * Returns `null` when the edges do not partition cleanly into cycles under that relation,
 * which is the signal to fall back to pairwise handling rather than reason about an order
 * that does not exist.
 */
export function ringsOfSubPolygon(
    edgeIds: number[],
    context: StraightSkeletonSolverContext,
): number[][] | null {
    if (edgeIds.length === 0) {
        return null;
    }

    const clockwiseUsers = new Map<number, number[]>();
    const widdershinsUsers = new Map<number, number[]>();

    const record = (byParent: Map<number, number[]>, parentId: number, edgeId: number) => {
        const users = byParent.get(parentId);
        if (users === undefined) {
            byParent.set(parentId, [edgeId]);
        } else {
            users.push(edgeId);
        }
    };

    for (const edgeId of edgeIds) {
        const interior = context.getInteriorWithId(edgeId);
        record(clockwiseUsers, interior.clockwiseExteriorEdgeIndex, edgeId);
        record(widdershinsUsers, interior.widdershinsExteriorEdgeIndex, edgeId);
    }

    if (clockwiseUsers.size !== widdershinsUsers.size) {
        return null;
    }

    const successor = new Map<number, number>();
    const claimed = new Set<number>();

    for (const [parentId, clockwiseSide] of clockwiseUsers) {
        const widdershinsSide = widdershinsUsers.get(parentId);
        if (widdershinsSide === undefined || widdershinsSide.length !== clockwiseSide.length) {
            return null;
        }

        const orderedClockwise = orderAlongParent(clockwiseSide, parentId, context);
        const orderedWiddershins = orderAlongParent(widdershinsSide, parentId, context);

        for (let index = 0; index < orderedClockwise.length; index++) {
            const next = orderedWiddershins[index];
            if (claimed.has(next)) {
                return null;
            }
            claimed.add(next);
            successor.set(orderedClockwise[index], next);
        }
    }

    const rings: number[][] = [];
    const placed = new Set<number>();

    for (const start of edgeIds) {
        if (placed.has(start)) {
            continue;
        }

        const ring: number[] = [];
        let current = start;
        for (;;) {
            if (placed.has(current)) {
                return null;
            }
            placed.add(current);
            ring.push(current);

            const next = successor.get(current);
            if (next === undefined) {
                return null;
            }
            if (next === start) {
                break;
            }
            current = next;
        }

        rings.push(ring);
    }

    return rings;
}

/** One vertex event of a layer, after its arrivals have been terminated on a node. */
export interface ResolvedMerge {
    /** Interior edge ids that ended at `nodeId`, all of them members of one ring. */
    edgeIds: number[];
    /** The node they now share. */
    nodeId: number;
}

/**
 * A position on the wavefront ring after a layer has been resolved: either an interior edge
 * that survived the layer, or one appearance of a merge node that absorbed a stretch of it.
 *
 * A merge appears once per contiguous stretch it absorbed. Appearing more than once is the
 * ring pinching at that point — the loop closes there and reopens.
 */
type RingSlot =
    | {kind: 'survivor'; edgeId: number}
    /**
     * `cwArrival` / `wsArrival` name the arriving edges whose exterior parents bound this
     * appearance on the clockwise and widdershins sides. They start out as the same edge and
     * diverge as stretches are absorbed and loops are split off.
     */
    | {kind: 'merge'; nodeId: number; cwArrival: number; wsArrival: number};

/** Ring order, with each arriving edge replaced by its merge node and runs collapsed to one slot. */
function reduceRing(ring: number[], nodeOfEdge: ReadonlyMap<number, number>): RingSlot[] {
    const slots: RingSlot[] = [];

    for (const edgeId of ring) {
        const nodeId = nodeOfEdge.get(edgeId);
        if (nodeId === undefined) {
            slots.push({kind: 'survivor', edgeId});
            continue;
        }

        const previous = slots[slots.length - 1];
        if (previous !== undefined && previous.kind === 'merge' && previous.nodeId === nodeId) {
            previous.cwArrival = edgeId;
            continue;
        }

        slots.push({kind: 'merge', nodeId, cwArrival: edgeId, wsArrival: edgeId});
    }

    // The ring is cyclic, so a run that straddles the start is still one run.
    const first = slots[0];
    const last = slots[slots.length - 1];
    if (slots.length > 1 && first.kind === 'merge' && last.kind === 'merge' && first.nodeId === last.nodeId) {
        first.wsArrival = last.wsArrival;
        slots.pop();
    }

    return slots;
}

/**
 * Split the reduced ring into the closed loops it actually consists of.
 *
 * Every appearance of a merge node after the first is a pinch: the stretch back to its previous
 * appearance closes into its own loop, and the walk continues with what is left. Splitting
 * re-pairs the bounding parents — the loop that closes takes the clockwise parent of the earlier
 * appearance and the widdershins parent of the later one, and the appearance that stays behind
 * keeps the other two. That re-pairing is the whole content of a pinch, and getting it from the
 * split rather than from any one event is what lets several events on one ring be resolved
 * together.
 */
function loopsOfReducedRing(slots: RingSlot[]): RingSlot[][] {
    const loops: RingSlot[][] = [];
    const walk: RingSlot[] = [];

    for (const slot of slots) {
        if (slot.kind === 'merge') {
            const earlier = walk.findIndex(seen => seen.kind === 'merge' && seen.nodeId === slot.nodeId);
            if (earlier >= 0) {
                const closed = walk.splice(earlier);
                const opening = closed[0] as Extract<RingSlot, {kind: 'merge'}>;

                loops.push([{...opening, wsArrival: slot.wsArrival}, ...closed.slice(1)]);
                walk.push({
                    kind: 'merge',
                    nodeId: slot.nodeId,
                    cwArrival: slot.cwArrival,
                    wsArrival: opening.wsArrival,
                });
                continue;
            }
        }

        walk.push(slot);
    }

    if (walk.length > 0) {
        loops.push(walk);
    }

    return loops;
}

/**
 * The bisectors born from every vertex event of one offset layer on one ring.
 *
 * Each event removes its arrivals from the ring; what is left is a set of closed loops, and
 * every appearance of an event node in a loop becomes exactly one new bisector, sourced at that
 * node and bounded by the exterior parents on either side of the stretch it absorbed.
 *
 * The layer must be resolved as a whole. Resolving one event at a time against the untouched
 * ring computes each event's surviving arcs as though no other event had removed anything, which
 * is true only when the event is the layer's sole one on that ring. Two or more ring-partitioning
 * events — facing walls of a reflex notch meeting at equal offsets — then produce overlapping
 * arcs that describe the same stretch of ring several times over.
 *
 * A loop of a single appearance and nothing else is a ring that closed completely: it bounds no
 * area and nothing is born from it.
 */
export function bisectionsForLayer(
    ring: number[],
    merges: readonly ResolvedMerge[],
    context: StraightSkeletonSolverContext,
): BisectionParams[] {
    const nodeOfEdge = new Map<number, number>();
    for (const merge of merges) {
        for (const edgeId of merge.edgeIds) {
            if (!nodeOfEdge.has(edgeId)) {
                nodeOfEdge.set(edgeId, merge.nodeId);
            }
        }
    }

    if (nodeOfEdge.size === 0) {
        return [];
    }

    const bisections: BisectionParams[] = [];

    for (const loop of loopsOfReducedRing(reduceRing(ring, nodeOfEdge))) {
        if (loop.length < 2) {
            continue;
        }

        for (const slot of loop) {
            if (slot.kind !== 'merge') {
                continue;
            }

            const params: BisectionParams = {
                clockwiseExteriorEdgeIndex: context.getInteriorWithId(slot.cwArrival).clockwiseExteriorEdgeIndex,
                widdershinsExteriorEdgeIndex: context.getInteriorWithId(slot.wsArrival).widdershinsExteriorEdgeIndex,
                source: slot.nodeId,
            };

            const approximateDirection = approximateDirectionForArrivals(
                context.getEdgeWithId(slot.cwArrival).basisVector,
                context.getEdgeWithId(slot.wsArrival).basisVector,
            );
            if (approximateDirection !== undefined) {
                params.approximateDirection = approximateDirection;
            }

            bisections.push(params);
        }
    }

    return bisections;
}

/**
 * The hint `addBisectionEdge` uses to decide whether to flip the bisector it derived from the
 * new edge's two exterior parents — or `undefined` when no honest hint exists.
 *
 * The hint is normally the bisection of the two arrivals that bracket the gap, which points
 * into the arc the new bisector has to sweep. That construction fails outright when the two
 * arrivals are exactly anti-parallel, as they are at a waist pinch: their sum is zero, so
 * `makeBisectedBasis` takes its degenerate branch and returns `rotateCw90` of whichever
 * argument came first — a perpendicular chosen by rotation convention alone, with no reference
 * to the geometry. The two gaps of such an event therefore receive opposite perpendiculars for
 * no reason but argument order, and `addBisectionEdge` flips the parent-derived bisector on the
 * strength of it.
 *
 * On `NEAR_REGULAR_PEANUT_32` that inverted both bisectors born at the neck: e64, bounded by the
 * two *left*-hand neck edges, was flipped to point right, and e65, bounded by the two right-hand
 * ones, was flipped to point left. The parent-derived bisector was correct in both cases.
 *
 * So when the sum degenerates, no hint is supplied and the parent derivation stands unmodified.
 * The check is made here rather than in `makeBisectedBasis` because that function's fallback is
 * meaningful to its other callers — it is the inward perpendicular at a *collinear* vertex, where
 * the two bases point the same way and the perpendicular is the genuine bisection.
 */
function approximateDirectionForArrivals(
    lastArrivalBasis: Vector2,
    firstDepartureBasis: Vector2,
): Vector2 | undefined {
    const sum = addVectors(lastArrivalBasis, firstDepartureBasis);
    if (areEqual(sizeOfVector(sum), 0)) {
        return undefined;
    }
    return makeBisectedBasis(lastArrivalBasis, firstDepartureBasis);
}
