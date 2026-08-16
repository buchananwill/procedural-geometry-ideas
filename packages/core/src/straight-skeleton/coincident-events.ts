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
 *
 * CONNECTED COMPONENTS, NOT FIRST MATCH. This used to join each event to the first group
 * already within `vectorsAreEqual` of it. Proximity under a fixed absolute tolerance is not
 * transitive, so that partition depended on the order the events arrived in: instrumentation
 * of a 48-gon fan measured 1424 events over 48 distinct edge ids reaching this function intact
 * and leaving it as *four* groups, where the identical relation at the identical tolerance,
 * replayed as connected components, gives one at every placement measured.
 *
 * The predicate and its tolerance do not move — only the rule for turning that relation into a
 * partition. Changing both at once would make any fixture regression unattributable.
 *
 * SINGLE-LINKAGE CHAINING IS AN ACCEPTED COST. Transitive closure under a fixed tolerance means
 * a run of events each within tolerance of the next becomes one group however far its extremes
 * lie apart. On this corpus that is the wanted behaviour — it is what reunites a fan whose
 * extremes are measured 1.95e-08 apart. The alternative not taken is gap-based partitioning,
 * which bounds a group's diameter at the price of a second threshold nothing has measured.
 */
export function clusterCoincidentMerges(events: CollisionEvent[]): CoincidentMerge[] {
    const merges = coincidentComponents(events).map(component => ({
        position: medoidPosition(component.map(index => events[index].position)),
        edgeIds: distinctEdgeIds(component.map(index => events[index])),
    }));

    assertMergePositionsAreDistinct(merges);

    return merges;
}

/**
 * No two merges of one layer may carry positions comparing equal under `vectorsAreEqual`.
 *
 * First-match clustering gave this for free by construction. Components plus a member
 * representative restore it by an argument about the partition — distinct components contain no
 * pair within tolerance of each other, and a medoid is a member — so it is checked rather than
 * trusted. `CoincidentMerge.position` feeds `terminateEdgesAtPoint` and thence `findOrAddNode`,
 * which matches existing nodes by *the same* tolerance this module clusters by, so two merges
 * whose positions compare equal there would collapse onto one graph node and fuse two
 * independent vertex events into one junction. That skeleton is causally consistent, so the
 * causality, clearance and direction audits all pass it: the failure mode is silent, which is
 * why it is asserted here rather than left to a downstream check.
 *
 * Internal to the solver — deliberately not re-exported from the package index. It is exported
 * from this module only so the suite can convict it against a centroid representative, the
 * mutation it exists to catch.
 */
export function assertMergePositionsAreDistinct(merges: CoincidentMerge[]): void {
    for (let i = 0; i < merges.length; i++) {
        for (let j = i + 1; j < merges.length; j++) {
            if (vectorsAreEqual(merges[i].position, merges[j].position)) {
                throw new Error(
                    `Coincidence clustering produced two merges at the same position: `
                    + `[${merges[i].edgeIds.join(', ')}] and [${merges[j].edgeIds.join(', ')}] `
                    + `both at (${merges[i].position.x}, ${merges[i].position.y}).`,
                );
            }
        }
    }
}

/**
 * The events of one layer partitioned into connected components under `vectorsAreEqual`, as
 * lists of indices into `events`.
 *
 * Components appear in the order their first member arrived, and members within a component in
 * arrival order, so `edgeIds` keeps the first-seen ordering the type documents.
 */
function coincidentComponents(events: CollisionEvent[]): number[][] {
    const parent = events.map((_, index) => index);

    const find = (index: number): number => {
        let root = index;
        while (parent[root] !== root) {
            root = parent[root];
        }
        for (let step = index; parent[step] !== root; ) {
            const next = parent[step];
            parent[step] = root;
            step = next;
        }
        return root;
    };

    for (let i = 0; i < events.length; i++) {
        for (let j = i + 1; j < events.length; j++) {
            if (find(i) === find(j)) {
                continue;
            }
            if (vectorsAreEqual(events[i].position, events[j].position)) {
                parent[find(j)] = find(i);
            }
        }
    }

    const componentByRoot = new Map<number, number[]>();
    for (let index = 0; index < events.length; index++) {
        const root = find(index);
        const component = componentByRoot.get(root);
        if (component === undefined) {
            componentByRoot.set(root, [index]);
        } else {
            component.push(index);
        }
    }

    return [...componentByRoot.values()];
}

/**
 * The member position nearest the component's centroid, exact ties broken lexicographically by
 * position — x first, then y.
 *
 * THE CENTROID IS THE YARDSTICK, NEVER THE ANSWER. Nothing bounds a centroid's distance from any
 * member: a component chained into a ring of radius R about a point P has centroid exactly P,
 * and a separate single-event component at P is genuinely distinct from it at every member yet
 * collapses to the same place. Under single-linkage chaining the centroid's drift from its own
 * extremes grows as `(k - 1) * epsilon / 2`. The representative must therefore be a member.
 *
 * TIES BREAK ON POSITION, NOT ARRIVAL INDEX. For a two-member component the centroid is
 * bit-identical under either arrival order — IEEE-754 addition commutes, and only associativity
 * fails, which needs three terms — so both distances are computed identically and the selection
 * can differ only on an exact tie. An index tie-break would decide that case by arrival order and
 * be the last remaining source of order dependence; a positional one makes the representative an
 * exact function of the member set. Exact ties are characteristic of the symmetric input this
 * clustering exists for, not a curiosity.
 */
function medoidPosition(positions: Vector2[]): Vector2 {
    const centroid = centroidOf(positions);

    let best = positions[0];
    let bestDistance = squaredDistance(best, centroid);

    for (const position of positions.slice(1)) {
        const distance = squaredDistance(position, centroid);
        if (distance < bestDistance || (distance === bestDistance && precedesLexicographically(position, best))) {
            best = position;
            bestDistance = distance;
        }
    }

    return best;
}

function centroidOf(positions: Vector2[]): Vector2 {
    let x = 0;
    let y = 0;
    for (const position of positions) {
        x += position.x;
        y += position.y;
    }
    return {x: x / positions.length, y: y / positions.length};
}

function squaredDistance(from: Vector2, to: Vector2): number {
    const dx = from.x - to.x;
    const dy = from.y - to.y;
    return dx * dx + dy * dy;
}

function precedesLexicographically(candidate: Vector2, incumbent: Vector2): boolean {
    return candidate.x < incumbent.x || (candidate.x === incumbent.x && candidate.y < incumbent.y);
}

/** Every edge id reported by these events, deduplicated, in first-seen order. */
function distinctEdgeIds(events: CollisionEvent[]): number[] {
    const edgeIds: number[] = [];
    for (const event of events) {
        for (const edgeId of event.collidingEdges) {
            if (!edgeIds.includes(edgeId)) {
                edgeIds.push(edgeId);
            }
        }
    }
    return edgeIds;
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

        const params: BisectionParams = {
            clockwiseExteriorEdgeIndex: context.getInteriorWithId(lastArrival).clockwiseExteriorEdgeIndex,
            widdershinsExteriorEdgeIndex: context.getInteriorWithId(firstDeparture).widdershinsExteriorEdgeIndex,
            source: sourceNodeId,
        };

        const approximateDirection = approximateDirectionForArrivals(
            context.getEdgeWithId(lastArrival).basisVector,
            context.getEdgeWithId(firstDeparture).basisVector,
        );
        if (approximateDirection !== undefined) {
            params.approximateDirection = approximateDirection;
        }

        return params;
    });
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
