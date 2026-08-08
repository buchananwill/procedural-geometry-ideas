import {
    BisectionParams,
    CollisionEvent,
    StraightSkeletonSolverContext,
    Vector2,
} from "./types";
import {makeBisectedBasis, vectorsAreEqual} from "./core-functions";

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
 * Put a step's interior edges into clockwise ring order, one ring per closed wavefront.
 *
 * Consecutive interior edges share one exterior parent: the clockwise parent of an edge is
 * the widdershins parent of its clockwise neighbour. A step's edges usually form a single
 * ring, but not always — so every ring is returned, and each edge appears in exactly one.
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

    const byWiddershinsParent = new Map<number, number>();
    for (const edgeId of edgeIds) {
        const interior = context.getInteriorWithId(edgeId);
        if (byWiddershinsParent.has(interior.widdershinsExteriorEdgeIndex)) {
            return null;
        }
        byWiddershinsParent.set(interior.widdershinsExteriorEdgeIndex, edgeId);
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

            const next = byWiddershinsParent.get(
                context.getInteriorWithId(current).clockwiseExteriorEdgeIndex,
            );
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

/** Maximal runs of `members` that are contiguous in the cyclic order of `ring`. */
export function contiguousRuns(ring: number[], members: ReadonlySet<number>): number[][] {
    const length = ring.length;
    const isMember = ring.map(edgeId => members.has(edgeId));

    if (isMember.every(Boolean)) {
        return [[...ring]];
    }

    const runs: number[][] = [];
    for (let index = 0; index < length; index++) {
        if (!isMember[index] || isMember[(index - 1 + length) % length]) {
            continue;
        }

        const run: number[] = [];
        let cursor = index;
        while (isMember[cursor]) {
            run.push(ring[cursor]);
            cursor = (cursor + 1) % length;
        }
        runs.push(run);
    }

    return runs;
}

/**
 * The bisectors born from one vertex event.
 *
 * The event removes its participating edges from the ring. What remains is one arc per gap
 * between consecutive runs of participants, and each arc gets exactly one new bisector,
 * sourced at the event point and bounded by the exterior parents on either side of the gap.
 *
 * - one run, covering the whole ring — the sub-polygon closes here and nothing is born;
 * - one run, a proper subset — a collapse, one new bisector (the two-edge case of which is
 *   the classic edge-collapse event);
 * - two or more runs — a partition, one new bisector per resulting sub-polygon.
 */
export function bisectionsForMerge(
    ring: number[],
    merge: CoincidentMerge,
    sourceNodeId: number,
    context: StraightSkeletonSolverContext,
): BisectionParams[] {
    const runs = contiguousRuns(ring, new Set(merge.edgeIds));

    if (runs.length === 0 || (runs.length === 1 && runs[0].length === ring.length)) {
        return [];
    }

    return runs.map((precedingRun, index) => {
        const followingRun = runs[(index + 1) % runs.length];
        const lastArrival = precedingRun[precedingRun.length - 1];
        const firstDeparture = followingRun[0];

        return {
            clockwiseExteriorEdgeIndex: context.getInteriorWithId(lastArrival).clockwiseExteriorEdgeIndex,
            widdershinsExteriorEdgeIndex: context.getInteriorWithId(firstDeparture).widdershinsExteriorEdgeIndex,
            source: sourceNodeId,
            approximateDirection: makeBisectedBasis(
                context.getEdgeWithId(lastArrival).basisVector,
                context.getEdgeWithId(firstDeparture).basisVector,
            ),
        };
    });
}
