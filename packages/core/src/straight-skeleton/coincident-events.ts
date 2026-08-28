import {
    BisectionParams,
    CollisionEvent,
    StraightSkeletonSolverContext,
    Vector2,
} from "./types";
import {vectorsAreEqual} from "./core-functions";
import {SKELETON_NOISE_FLOOR} from "./canonicalisation";

/**
 * Are these two arrivals the same vertex event, as far as anything that will ever look at the
 * skeleton is concerned?
 *
 * THE BAR IS THE RENDER-SCALE FLOOR, NOT THE ARITHMETIC EPSILON — journal decision 78. Two events
 * closer together than {@link SKELETON_NOISE_FLOOR} in unit space are one event: the same constant,
 * and the same argument, that `canonicalisation.ts` removes an input vertex on. An input
 * perturbation the boundary stage would have erased must not survive as two skeleton nodes it did
 * not erase, and one tolerance system is the point.
 *
 * WHAT THE EPSILON BAR LEFT BEHIND, MEASURED. On `OFF_EDGE_JITTER_L_SEED_15838` the wavefront
 * reaches a ridge where four walls are equidistant, and resolved it as two events 3.13e-7 apart in
 * unit space — correctly distinct at 31 times the epsilon, and 2.7e-7 of the polygon's extent, so a
 * **7480x** zoom would be needed to put two pixels between the nodes they produced. The pair then
 * carried a bisector leaving one of them 5.2e-6 radians from its neighbour, which is a distinction
 * no downstream planar consumer can act on.
 *
 * A DISTANCE, NOT A BOUNDING BOX. `vectorsAreEqual` compares components, which at the epsilon scale
 * is indistinguishable from a distance and at this scale is a square up to sqrt(2) wider on the
 * diagonal than on the axes. The floor is a statement about how far apart two points are.
 *
 * RESOLVED HERE, BEFORE ANY NODE EXISTS, AND THAT IS THE WHOLE MECHANISM. The rejected first
 * attempt widened `findOrAddNode` instead, so a later arrival was absorbed into a node already
 * placed and already carrying edges: the arriving edge was re-pointed at a target its own wavefront
 * vertex never travelled to, which put an edge on `OFF_EDGE_JITTER_L_SEED_15838` running BACKWARDS
 * in the wavefront clock, took its census from 0 failed regions to 4, cost the strips their exact
 * tiling, and stopped two CLEAN fixtures solving under translation. Merged at the event layer the
 * hub is computed from its whole arrival set at once — the path a regular n-gon's k-way hub already
 * takes — and none of that arises. See F27.
 */
function isOneEvent(a: Vector2, b: Vector2): boolean {
    return Math.hypot(a.x - b.x, a.y - b.y) < SKELETON_NOISE_FLOOR;
}

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
    /** Interior edge ids arriving at `position`, ascending. */
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
 *
 * THE RESULT IS A CANONICAL FUNCTION OF THE EVENT SET, not of the order it arrived in: each
 * merge's `edgeIds` ascending, and the merges themselves ordered by their smallest edge id. The
 * caller resolves them in this order and therefore NUMBERS THE NODES it creates in this order.
 * Arrival order is the offset sort's order, and offsets that are equal in exact arithmetic differ
 * by an ulp once the input is scaled, so numbering from arrival made node identity turn on an ulp:
 * the two interior nodes of an exact mirror pair swapped ids between a polygon and the same polygon
 * scaled by 7 (`NEAR_REGULAR_ELLIPSE_16/32`, journal decision 65). Edge ids are integers assigned
 * from the polygon's own vertex order, so the key carries no arithmetic at all.
 *
 * THE KEY NEEDS NO TIE-BREAK. A merge is one vertex event and a bisector arrives at one point, so
 * the caller only resolves a set of merges that share no edge — `mergesShareAnEdge` is its guard —
 * and disjoint non-empty sets have distinct minima.
 */
export function clusterCoincidentMerges(events: CollisionEvent[]): CoincidentMerge[] {
    const merges = coincidentComponents(events).map(component => ({
        position: medoidPosition(component.map(index => events[index].position)),
        edgeIds: distinctEdgeIds(component.map(index => events[index])).sort((a, b) => a - b),
    }));

    assertMergePositionsAreDistinct(merges);

    return merges.sort((a, b) => a.edgeIds[0] - b.edgeIds[0]);
}

/**
 * No two merges of one layer may carry positions inside {@link SKELETON_NOISE_FLOOR} of each other.
 *
 * First-match clustering gave this for free by construction. Components plus a member
 * representative restore it by an argument about the partition — distinct components contain no
 * pair within tolerance of each other, and a medoid is a member — so it is checked rather than
 * trusted. `CoincidentMerge.position` feeds `terminateEdgesAtPoint` and thence `findOrAddNode`, so
 * two merges within the floor of each other would be two vertex events the picture cannot tell
 * apart, fused or not fused according to a tolerance further down. That skeleton is causally
 * consistent, so the causality, clearance and direction audits all pass it: the failure mode is
 * silent, which is why it is asserted here rather than left to a downstream check.
 *
 * STATED AT THE CLUSTERING'S OWN BAR, which since journal decision 78 is the render-scale floor
 * rather than `findOrAddNode`'s epsilon. It is therefore stronger than what the node lookup needs:
 * it asserts the postcondition this module is responsible for, not the precondition of the next
 * one.
 *
 * Internal to the solver — deliberately not re-exported from the package index. It is exported
 * from this module only so the suite can convict it against a centroid representative, the
 * mutation it exists to catch.
 */
export function assertMergePositionsAreDistinct(merges: CoincidentMerge[]): void {
    for (let i = 0; i < merges.length; i++) {
        for (let j = i + 1; j < merges.length; j++) {
            if (isOneEvent(merges[i].position, merges[j].position)) {
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
 * The position each of these events resolves to once render-floor-coincident arrivals are one event:
 * the medoid of the event's own coincidence component, or its own position when it has no company.
 *
 * FOR THE EVENTS THAT NEVER REACH {@link clusterCoincidentMerges} — the split/partition arrivals,
 * which `handleCollisionEvent` resolves in a pass of its own and which therefore built a node each,
 * however close together they landed (journal decision 85). Two splits of one layer at one point are
 * one vertex event by exactly the argument decision 78 makes about every other kind, and this gives
 * that pass the same identity without giving it the merge machinery: the caller re-points the event
 * at the resolved position and `findOrAddNode` then hands both arrivals the same node.
 *
 * POSITION ONLY, DELIBERATELY. A split's own bisections are computed from its instigator and the
 * exterior edge it splits, and remain each event's own; nothing here decides what is emitted, only
 * where from. The same medoid convention as the merge path, for the same reason — a member of the
 * set, never a centroid that no arrival visited.
 *
 * A COMPONENT THE EPSILON ALREADY UNIFIES IS LEFT EXACTLY ALONE, and that restraint is what keeps
 * this change to the pairs it is for. Where every member is within `vectorsAreEqual` of the
 * representative, `findOrAddNode` already hands them one node at the first-established member's
 * position; re-pointing them at the medoid would move that node by whichever member the centroid
 * happens to favour. Measured, that is not hypothetical: it moves one coordinate by one ulp on four
 * CLEAN fixtures, for no gain at all — they were one node before and one node after. The defect is
 * the component the epsilon does NOT unify, and only that component is touched.
 */
export function coincidentEventPositions(events: CollisionEvent[]): Vector2[] {
    const resolved = events.map(event => event.position);

    for (const component of coincidentComponents(events)) {
        if (component.length < 2) {
            continue;
        }
        const positions = component.map(index => events[index].position);
        const position = medoidPosition(positions);
        if (positions.every(member => vectorsAreEqual(member, position))) {
            continue;
        }
        for (const index of component) {
            resolved[index] = position;
        }
    }

    return resolved;
}

/**
 * The events of one layer partitioned into connected components under `vectorsAreEqual`, as
 * lists of indices into `events`.
 *
 * Components appear in the order their first member arrived, and members within a component in
 * arrival order. Neither ordering survives into the returned merges — `clusterCoincidentMerges`
 * replaces both with the canonical one — so nothing downstream may reason from it.
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
            if (isOneEvent(events[i].position, events[j].position)) {
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

/** Every edge id reported by these events, deduplicated; the caller imposes the order. */
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
 *
 * PARENTS AND SOURCE ONLY: THE DIRECTION IS NOT THIS FUNCTION'S TO GUESS. Each gap used to be
 * handed an `approximateDirection` — the bisection of the two arrivals bracketing it — for
 * `addBisectionEdge` to flip its parent-derived basis with. That construction is SYMMETRIC in the
 * two arrivals, so a two-run event gave both of its gaps the same hint while the gaps face opposite
 * ways: it was wrong for one of them by construction. It only ever reached the basis where the
 * offset rate is zero, which is the anti-parallel-parent case, and there the ordered parent pair
 * already says which way the corridor runs. Three fixtures were being drawn wrong on the strength
 * of it — see `addBisectionEdge`.
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
        };
    });
}
