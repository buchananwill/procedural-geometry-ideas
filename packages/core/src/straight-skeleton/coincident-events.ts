import {
    BisectionParams,
    CollisionEvent,
    StraightSkeletonSolverContext,
    Vector2,
} from "./types";
import {vectorsAreEqual} from "./core-functions";
import {ARITHMETIC_SAME_POINT_BOX} from "./constants";

/**
 * Are these two arrivals the same vertex event, as far as anything that will ever look at the
 * skeleton is concerned?
 *
 * THE BAR IS THE RENDER-SCALE FLOOR, NOT THE ARITHMETIC EPSILON — journal decision 78. Two events
 * closer together than the perceptual floor in unit space are one event: the same value, and the
 * same argument, that `canonicalisation.ts` removes an input vertex on. An input
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
 *
 * `floor` IS THE CLIENT'S, NOT A MODULE CONSTANT — journal decision 106. It arrives on the solver
 * context, defaulting to `SKELETON_NOISE_FLOOR`, and it is the SAME question the canonicalisation
 * bar asks about an input vertex, which is why one value answers both. There is deliberately no
 * default here: a floor omitted at a call site would be a silent second tolerance system, which is
 * the defect the unification exists to remove.
 */
function isOneEvent(a: Vector2, b: Vector2, floor: number): boolean {
    return Math.hypot(a.x - b.x, a.y - b.y) < floor;
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
    /**
     * The position of the cluster's ANCHOR — its earliest arrival (journal decision 155). Every member
     * lies strictly within the floor of it, and no two anchors of one layer lie within the floor of
     * each other; `position` is the members' medoid and so lies within the floor of this.
     */
    anchor: Vector2;
}

/**
 * Group the interior-to-interior collisions of a single offset layer by collision point.
 *
 * Events at the same offset but different points are genuinely independent and stay in
 * separate groups; events at the same point are one vertex event however many pairs
 * reported it.
 *
 * ANCHORED, NOT TRANSITIVE (journal decision 155(b), C8 dispatch 1). "Approximately equals" is not
 * an equivalence relation and the solver must never claim transitivity: A ≈ B and B ≈ C do not give
 * A ≈ C. The clustering used to be CONNECTED COMPONENTS under `isOneEvent` — single linkage, so a run
 * of events each within the floor of the next became one group however far its extremes lay apart —
 * and that is exactly the claim the ruling forbids. It is now anchored: events are visited EARLIEST
 * ARRIVAL FIRST, each joins the nearest existing anchor within the floor, and an event within the
 * floor of no anchor becomes an anchor itself. Every group therefore lies within the floor of its
 * earliest arrival's position and its diameter is below twice the floor, and a many-way meeting the
 * floor cannot hold in one group yields two nodes inside the floor, which decision 141 admits.
 *
 * MEASURED BEFORE IT MOVED (C8 dispatch 1, the component-diameter census): over `FULL_CORPUS` at 1e-6
 * and 1e-5, Circle 48 and Rosette5 40 at the 46 fine translations, and the jitter sweeps (the 160-cell
 * off-edge 1e-3 grid, the 160-cell along-edge stage-off grid, the 48-cell jittered Circle 32 ladder),
 * 23 421 components were formed. On the corpus the widest was 5.44e-7 at 1e-6 and 4.42e-6 at 1e-5 —
 * inside the floor, so there the anchored partition IS the component partition and nothing moves. Off
 * it, 15 components were wider than the floor (Circle 48 at 4e10, 5e10, 6e10 and 2e11; eleven
 * off-edge jitter cells; widest 1.906e-6), and those are the cells this restatement moves.
 *
 * NOT FIRST MATCH IN ARRIVAL ORDER. The oldest form of this function joined each event to the first
 * group already within tolerance of it in the order the layer happened to list them, which made the
 * partition depend on list order (a 48-gon fan left it as four groups). The anchored form visits the
 * events in a CANONICAL order — exact arrival, then the colliding edge ids, then position — so the
 * partition is a function of the event set, not of how it was listed.
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
export function clusterCoincidentMerges(events: CollisionEvent[], floor: number): CoincidentMerge[] {
    const clusters = anchoredClusters(events, floor);
    const merges = clusters.map(cluster => ({
        position: medoidPosition(cluster.members.map(index => events[index].position)),
        edgeIds: distinctEdgeIds(cluster.members.map(index => events[index])).sort((a, b) => a - b),
        anchor: events[cluster.anchor].position,
    }));

    assertMergesAreAnchored(merges, floor);

    return merges.sort((a, b) => a.edgeIds[0] - b.edgeIds[0]);
}

/**
 * The anchored partition's own postcondition: no two ANCHORS of one layer lie inside the perceptual
 * floor of each other, and every merge's representative lies inside the floor of its own anchor.
 *
 * RESTATED UNDER JOURNAL DECISION 155. This gate used to assert that no two merge POSITIONS lie within
 * the floor of each other — a claim that "within the floor" is one event, which is transitivity by
 * another name, and which an anchored partition does not (and must not) guarantee: two clusters whose
 * anchors are a floor apart can have medoids closer than that, and decision 141 admits the two nodes.
 * What the anchored construction DOES guarantee is checked rather than trusted: anchors pairwise
 * separated (an event within the floor of an anchor joins it rather than founding its own), and each
 * representative a member, hence within the floor of its anchor. A CENTROID representative breaks
 * the second — a centroid is on no member and, for a group chained around its anchor, lies a floor or
 * more from it — which is the mutation the suite convicts this gate against.
 *
 * Internal to the solver — deliberately not re-exported from the package index. It is exported
 * from this module only so the suite can convict it.
 */
export function assertMergesAreAnchored(merges: CoincidentMerge[], floor: number): void {
    for (let i = 0; i < merges.length; i++) {
        if (!isOneEvent(merges[i].position, merges[i].anchor, floor)) {
            throw new Error(
                `Coincidence clustering placed merge [${merges[i].edgeIds.join(', ')}] at `
                + `(${merges[i].position.x}, ${merges[i].position.y}), outside the floor of its anchor `
                + `(${merges[i].anchor.x}, ${merges[i].anchor.y}).`,
            );
        }
        for (let j = i + 1; j < merges.length; j++) {
            if (isOneEvent(merges[i].anchor, merges[j].anchor, floor)) {
                throw new Error(
                    `Coincidence clustering produced two merges anchored at the same position: `
                    + `[${merges[i].edgeIds.join(', ')}] and [${merges[j].edgeIds.join(', ')}] `
                    + `both at (${merges[i].anchor.x}, ${merges[i].anchor.y}).`,
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
 * A GROUP THE ARITHMETIC SAME-POINT BAR ALREADY UNIFIES IS LEFT EXACTLY ALONE, and that restraint is
 * what keeps this change to the pairs it is for. Where every member is within `findOrAddNode`'s own
 * bar ({@link ARITHMETIC_SAME_POINT_BOX}, C8 census S2) of the representative, `findOrAddNode` already
 * hands them one node at the first-established member's position; re-pointing them at the medoid
 * would move that node by whichever member the centroid happens to favour. Measured, that is not
 * hypothetical: it moves one coordinate by one ulp on four CLEAN fixtures, for no gain at all — they
 * were one node before and one node after. The defect is the group the node lookup does NOT unify,
 * and only that group is touched.
 *
 * REGISTER C12 MEASURED THIS BAR EXACT, WITH THE BOX, AND IT IS HELD WITH IT (journal-5 decision 167;
 * see "THE WINDOW AND THE BOX" in constants.ts). Read as coordinate equality alone it re-points the
 * re-report groups of seven CLEAN fixtures (`Failing Long Octagon`, `Not Solvable Heptagon`, `Long
 * Unbroken Side Then Extreme Acute Angle`, `Incorrect Ordering e38-e30 Collision`, both `Premature
 * Bisector Split`s, `Short Edge Promontory`) — every one a group of reports of ONE split, one instigator,
 * 0.03 to 1.93 ulps apart — and moves their digests by that much. The exact form that moved no clean
 * digest also left alone any group whose members all name one instigator, which acceptance already
 * resolves to one node (the first resolved consumes the instigator; the rest place nothing).
 *
 * The same ANCHORED grouping as {@link clusterCoincidentMerges} (journal decision 155).
 *
 * A MOVED EVENT IS CHARGED FOR THE MOVE (journal-5 decision 171(c)): the caller raises the node's budget to
 * the equi-time residual of the bisectors each re-pointed split emits there — the merge's own term
 * (`chargeSitingResidual`, algorithm-complex-cases.ts). Unpaid, the residual rode those bisectors to their
 * next meeting unbudgeted: 13 off-edge plus cells carried a split node up to 2.3e-4 caller units off its
 * bisectors' loci against a budget of 7.5e-13.
 */
export function coincidentEventPositions(events: CollisionEvent[], floor: number): Vector2[] {
    const resolved = events.map(event => event.position);

    for (const {members} of anchoredClusters(events, floor)) {
        if (members.length < 2) {
            continue;
        }
        const positions = members.map(index => events[index].position);
        const position = medoidPosition(positions);
        if (positions.every(member => vectorsAreEqual(member, position, ARITHMETIC_SAME_POINT_BOX))) {
            continue;
        }
        for (const index of members) {
            resolved[index] = position;
        }
    }

    return resolved;
}

/**
 * The canonical visiting order of the anchored clustering: EARLIEST ARRIVAL FIRST, by the exact
 * cross-multiplied comparison (no window — this orders, it does not decide simultaneity), then by the
 * colliding edge ids lexicographically, then by position (x, then y). Edge ids are integers from the
 * polygon's own vertex order, so the tie-breaks carry no arithmetic and no placement can move them.
 */
function canonicalEventOrder(first: CollisionEvent, second: CollisionEvent): number {
    const difference = first.arrival.distance * second.arrival.weight - second.arrival.distance * first.arrival.weight;
    if (difference !== 0) {
        return difference < 0 ? -1 : 1;
    }
    const edges = first.collidingEdges;
    const others = second.collidingEdges;
    for (let index = 0; index < Math.min(edges.length, others.length); index++) {
        if (edges[index] !== others[index]) {
            return edges[index] - others[index];
        }
    }
    if (edges.length !== others.length) {
        return edges.length - others.length;
    }
    if (first.position.x !== second.position.x) {
        return first.position.x < second.position.x ? -1 : 1;
    }
    if (first.position.y !== second.position.y) {
        return first.position.y < second.position.y ? -1 : 1;
    }
    return 0;
}

/** One anchored group: the index of its anchor (its earliest arrival) and every member, anchor first. */
interface AnchoredCluster {
    anchor: number;
    members: number[];
}

/**
 * The events of one layer partitioned ANCHORED at the floor (journal decision 155): visited in
 * {@link canonicalEventOrder}, each event joins the NEAREST existing anchor strictly within the floor
 * of it, or founds a group of its own. Anchors are therefore pairwise at least the floor apart, and
 * every member lies strictly within the floor of its group's anchor.
 *
 * Groups appear in the order their anchors were founded. That ordering does not survive into the
 * returned merges — `clusterCoincidentMerges` replaces it with the canonical one — so nothing
 * downstream may reason from it.
 */
function anchoredClusters(events: CollisionEvent[], floor: number): AnchoredCluster[] {
    const order = events.map((_event, index) => index)
        .sort((first, second) => canonicalEventOrder(events[first], events[second]));

    const clusters: AnchoredCluster[] = [];
    for (const index of order) {
        const position = events[index].position;
        let nearest: AnchoredCluster | undefined;
        let nearestDistance = Number.POSITIVE_INFINITY;
        for (const cluster of clusters) {
            const anchor = events[cluster.anchor].position;
            const distance = Math.hypot(anchor.x - position.x, anchor.y - position.y);
            if (isOneEvent(anchor, position, floor) && distance < nearestDistance) {
                nearest = cluster;
                nearestDistance = distance;
            }
        }
        if (nearest === undefined) {
            clusters.push({anchor: index, members: [index]});
        } else {
            nearest.members.push(index);
        }
    }

    return clusters;
}

/**
 * The member position nearest the group's centroid, exact ties broken lexicographically by
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
    merge: Pick<CoincidentMerge, 'position' | 'edgeIds'>,
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
