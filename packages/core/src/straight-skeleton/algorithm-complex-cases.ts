import {
    AlgorithmStepInput,
    AlgorithmStepOutput, Arrival, BisectionParams, CollisionEvent, CollisionTypePriority,
    StraightSkeletonSolverContext, Vector2
} from "./types";
import {compareArrivals, findOrComputeCollision, priceHeadOnPair, timeOf} from "./collision-helpers";
import {ARRIVAL_MOMENT_ULPS, HELD_SIMULTANEITY_WINDOW, mergeDisplacementUncertainty} from "./constants";
import {rotateCw90} from "./core-functions";
import {applyDegenerateClosure, climbTerminalLadder} from "./algorithm-termination-cases";
import handleCollisionEvent from "./collision-handling";
import {bisectWithParams} from "./algorithm-helpers";
import {
    bisectionsForMerge,
    clusterCoincidentMerges,
    coincidentEventPositions,
    mergesShareAnEdge,
} from "./coincident-events";
import {
    beginLayerLinks,
    birthsClosedAtOneNode,
    componentsOfRings,
    droppableBirths,
    linkBirth,
    partitionArc,
    refuseStep,
    retireBisectors,
    ringsOfWavefront,
    settleLayerLinks
} from "./wavefront";

/**
 * Lexicographic over two edge-id lists, a shorter prefix first.
 *
 * The canonical tie-break for events that a floating-point offset cannot separate. `collidingEdges`
 * identifies an event by the edges taking part in it, which is a property of the polygon's own
 * topology, so two distinct events at one offset are ordered by something no placement can move.
 */
function compareEdgeIdLists(first: number[], second: number[]): number {
    for (let index = 0; index < Math.min(first.length, second.length); index++) {
        if (first[index] !== second[index]) {
            return first[index] - second[index];
        }
    }
    return first.length - second.length;
}

/*
 * THE MOMENT BAR — {@link ARRIVAL_MOMENT_ULPS}, ulps of the larger offset within which two arrivals are
 * ONE moment of the arithmetic (census S29). It lived here as `SIMULTANEOUS_ARRIVAL_ULPS` and moved to
 * `constants.ts` under C8 spec T26, value unchanged, because the offset projection's simultaneous-set
 * partition (S30) asks the same question and now spends the same bar.
 *
 * A REPRESENTATION BAR, NOT A GEOMETRIC TOLERANCE. Its only job is to stop the arithmetic's own
 * rounding from being read as causal order: two arrivals that are equal in exact arithmetic are
 * computed through different intersections and land a few ulps apart, and the two reciprocal reports
 * of ONE arrival ({@link createCollisions} reports every pair from both directions) agree to within
 * an ulp. Anything wider would be a claim about geometry, and every such claim in this package
 * belongs to a constant with a measurement behind it.
 *
 * SIXTY-FOUR, with the corpus's two live populations on either side of it. On
 * `OFF_EDGE_JITTER_L_SEED_55433`'s collapsing 4-ring the four candidate pairings arrive 2.52e-11 to
 * 7.07e-11 apart on offsets of 2.93e-1 — between 3.9e5 and 1.1e6 ulps, four orders above this bar.
 * The rounding noise it exists to absorb sits at one to a few ulps, six orders below it. Both
 * populations are asserted as ratios in `arrival-ordering.test.ts`.
 */

/**
 * Order one layer's events by ARRIVAL, breaking exact simultaneity with `tieBreak`.
 *
 * STRICT LINEAR CAUSALITY IS THE SOLVER'S MODEL (journal decision 102): where two arrivals are
 * separated at all, the earlier one is resolved first, and the wavefront it terminates cannot be
 * consumed by an event that had not happened yet. The fallback below used to sort a whole layer by
 * priority and edge id alone, which threw the offsets away — and because each event here CONSUMES
 * its edges, that was a PAIRING rule, not a display order: on `(seed 55433)` a collapsing 4-ring
 * whose true pairing arrives 2.52e-11 ahead of its rival was paired by edge id instead, so the arm
 * tip closed on the wrong two of its four walls and left its surviving ridge between the wrong
 * parents. What that cost downstream is the fold population — 24 region-boundary folds across three
 * fixtures before this ordering, 4 on one fixture after it, with both reflex Ls leaving it outright
 * (`region-boundary-folds.test.ts`) — and six of the plus's ten failing near-floor jitter cells.
 *
 * IT DOES NOT CURE THE DUPLICATE RIDGE, and saying so is the point. Both pairings leave TWO
 * bisectors spanning that ridge, so I5's count on this fixture is unmoved; the two collapse nodes
 * are 3.9e-6 apart in unit space and should not both exist, which is journal decision 101's
 * tolerance defect and not this one. Pairing decides which walls the ridge belongs to; it cannot
 * decide whether the ridge should have been a point.
 *
 * EXPORTED FOR ITS OWN TEST, not for other callers — see `arrival-ordering.test.ts`.
 *
 * THE TIE-BREAK KEEPS ITS PROPER SCOPE. Decision 65's lexicographic ordering exists so that events
 * a floating-point offset CANNOT separate are still resolved in an order no placement can move —
 * node identity must not turn on an ulp. That argument is about genuine simultaneity, so it applies
 * within {@link ARRIVAL_MOMENT_ULPS} and nowhere else.
 *
 * MOMENTS BY SINGLE LINKAGE, over an already offset-ascending list, so the result is a total order
 * rather than a sort under a non-transitive "close enough" predicate. (The coincidence clustering in
 * `coincident-events.ts` used the same single linkage until journal decision 155 made it anchored;
 * this partition is at the 64-ulp representation bar, S29, which C8 spec T26 keeps as it is.)
 */
export function inArrivalOrder(
    events: CollisionEvent[],
    tieBreak: (first: CollisionEvent, second: CollisionEvent) => number,
): CollisionEvent[] {
    // W-spec W24, W25: ordered by ARRIVAL, division-free. At unit weights `compareArrivals(a, b, 0)`
    // is the sign of `a.offsetDistance - b.offsetDistance` with ties reported as zero, so the stable
    // sort delivers exactly today's order.
    const byOffset = events.toSorted((e1, e2) => compareArrivals(e1.arrival, e2.arrival, 0));

    const moments: number[] = [];
    let moment = 0;
    for (let index = 0; index < byOffset.length; index++) {
        if (index > 0 && !areSimultaneousArrivals(byOffset[index - 1].arrival, byOffset[index].arrival)) {
            moment++;
        }
        moments.push(moment);
    }

    return byOffset
        .map((event, index) => ({event, moment: moments[index]}))
        .toSorted((a, b) => a.moment !== b.moment ? a.moment - b.moment : tieBreak(a.event, b.event))
        .map(entry => entry.event);
}

/**
 * W-spec W25: the 64-ulp bar, cross-multiplied. `|d₁·w₂ − d₂·w₁|` against the bar times the larger
 * of the two products — the exact restatement of the same window on `d₁/w₁` versus `d₂/w₂`, with no
 * division. At unit weights both products are by `1.0` and the verdict is today's.
 */
function areSimultaneousArrivals(first: Arrival, second: Arrival): boolean {
    const left = first.distance * second.weight;
    const right = second.distance * first.weight;
    const magnitude = Math.max(Math.abs(left), Math.abs(right));
    return Math.abs(left - right) <= ARRIVAL_MOMENT_ULPS * Number.EPSILON * magnitude;
}

/**
 * The events of the EARLIEST arrival moment in `events` — the first single-linkage run of
 * {@link ARRIVAL_MOMENT_ULPS} over the offset-ascending list, and nothing after it.
 *
 * THE MOMENT, NOT THE LAYER. `collisionsToHandle` is an `fp_compare` window on the best offset: an
 * ABSOLUTE 1e-8 on offsets of order 1e-1, so roughly 1e8 ulps wide. Everything inside it is resolved
 * in one step, and each interior event CONSUMES its edges — so a window that wide is a claim that
 * arrivals up to eight orders apart in the wavefront clock happened together. Journal decision 102
 * says the opposite: the pairing winner is the lower offset, always, and an event cannot consume a
 * wavefront that had not arrived yet. This narrows the window to the moment the ulp bar can actually
 * defend, and only where the whole-event resolution has already refused the layer.
 *
 * It is the same bar, the same single linkage and the same accepted chaining cost as
 * {@link inArrivalOrder}'s moment partition — this is that partition's first class, taken alone.
 */
function earliestArrivalMoment(events: CollisionEvent[]): CollisionEvent[] {
    const byOffset = events.toSorted((e1, e2) => compareArrivals(e1.arrival, e2.arrival, 0));

    for (let index = 1; index < byOffset.length; index++) {
        if (!areSimultaneousArrivals(byOffset[index - 1].arrival, byOffset[index].arrival)) {
            return byOffset.slice(0, index);
        }
    }
    return byOffset;
}

/** The inward perpendicular distance of `point` from wall `wallId`'s supporting line, through its stored source. */
function distanceFromWallLine(point: Vector2, wallId: number, context: StraightSkeletonSolverContext): number {
    const normal = rotateCw90(context.getEdgeWithId(wallId).basisVector);
    const source = context.sourcePosition(wallId);
    return normal.x * (point.x - source.x) + normal.y * (point.y - source.y);
}

/**
 * A NODE CARRIES WHERE IT WAS PUT (journal-5 decisions 170 and 171(c)): raise `nodeId`'s position budget to
 * the largest equi-time residual, at the node, of the bisectors it emits — {@link mergeDisplacementUncertainty}
 * for each one's two parents. ONE TERM, TWO SITES, because both sites take ONE release: the coincidence
 * clustering sites a group of meetings at its MEDOID (decision 157's release, below the floor the solver is
 * not obliged to tell them apart), and every bisector born there reads its clock from the node's distance to
 * its clockwise parent, so wherever the node is off that bisector's own locus the reading carries the residual
 * to the bisector's next meeting. The whole-event merge pays it (decision 170); so does a split re-pointed by
 * `coincidentEventPositions` (decision 171(c)).
 *
 * THE RESIDUAL, NOT THE DISTANCE MOVED. The budget answers for the disagreement between the emitted bisector's
 * two parent clocks at the node, and the residual IS that disagreement, exactly. The distance from a member's
 * own point to the medoid is not a bound on it in either direction: a displacement ALONG the bisector's locus
 * moves no clock and costs nothing, and one across it moves both parents' distances, by up to twice itself at
 * unit weights. So the distance would overcharge the first and could undercharge the second.
 */
function chargeSitingResidual(nodeId: number, bisections: BisectionParams[], context: StraightSkeletonSolverContext): void {
    const position = context.graph.nodes[nodeId].position;
    context.positionUncertainties[nodeId] = Math.max(
        context.positionUncertainties[nodeId] ?? 0,
        ...bisections.map(params => mergeDisplacementUncertainty(
            distanceFromWallLine(position, params.clockwiseExteriorEdgeIndex, context),
            context.weightOf(params.clockwiseExteriorEdgeIndex),
            distanceFromWallLine(position, params.widdershinsExteriorEdgeIndex, context),
            context.weightOf(params.widdershinsExteriorEdgeIndex))));
}

/**
 * The partition bisectors a layer will bear, in the order it bears them: sorted by arc, with nested re-reports
 * of one split removed.
 *
 * EXPORTED FOR ITS OWN TEST, not for other callers — see `wavefront-order.test.ts`.
 */
export function selectPartitionEvents(context: StraightSkeletonSolverContext, partitionEvents: BisectionParams[]): BisectionParams[] {
    /* Clover Leaf Example:

    Partition Pair 1:  [[0,4], [4,0]]
    Partition Pair 2:  [[4,8], [8,4]]
    Partition Pair 3:  [[8,0], [0,8]]

    Outcome we want is: [[0,4], [4,8], [8,0]]

    Rule is: sort by the arc of bisection, then clockwise bisection.
    Arc of bisection, on one loop = (end - start + length) % length

     * */
    // THE ORDER IS THE ARC ROUND THE PENDING BISECTOR'S RING (skeleton join-and-divide spec, decisions 25 to 27):
    // `partitionArc` sums the gaps between consecutive clockwise parents round the ring, a gap within one loop
    // counted in clockwise steps and a gap between two loops as 1. It replaced `partitionSpan`, the id interval
    // `(ws − cw + n) mod n`, which has no meaning across loops; on one loop the arc telescopes to exactly that span,
    // so the births are numbered as they were. This order decides no child step — the rings do — but it is the order
    // the partition bisectors are BORN in, and it chooses which of two same-start, same-source re-reports survives.
    // Ordering by ring size instead (BSA.F96) left out the closed edges inside the arc and renumbered 16 digests.
    const arcs = new Map(partitionEvents.map(params => [params, partitionArc(context, params)] as const));
    const arcOf = (params: BisectionParams) => arcs.get(params)!;
    // NO ACCEPTED-PARENT FILTER (skeleton edge-acceptance spec, decision 7). Acceptance changes only at step
    // boundaries, and at the last one every parent of every birth of this layer was named by a then-live bisector,
    // so no partition event here can name an accepted edge. A silently refused birth is how early acceptance broke
    // rings; `addBisectionEdge`'s throw is the one guard left, so such a birth would be a step failure.
    const sorted = partitionEvents
        .toSorted((params1, params2) => {
            const arcDelta = arcOf(params1) - arcOf(params2);
            if (arcDelta !== 0) {
                return arcDelta;
            }

            return params1.clockwiseExteriorEdgeIndex - params2.clockwiseExteriorEdgeIndex;
        });

    // Same-start events are nested re-reports of ONE split only when they share the split node:
    // each re-report widens the widdershins claim past a parent it cannot see, so the smallest
    // span is the tightest claim and wins. Same-start events from DIFFERENT split nodes are
    // distinct simultaneous splits of that exterior edge — two reflex bisectors splitting it at
    // different points in one layer — and every one of them partitions the polygon, so all
    // survive. Which child each survivor's bisector lands in is no longer a question of spans: the
    // child steps below are the rings the layer left.
    //
    // AND A RE-REPORT IS DROPPED ONLY WHERE THE LINKS AGREE IT IS ONE (BSA.F97 finding 1, BSA.D293). Two
    // splits sited at one point share their node, so their bisectors on the struck edge's far side share a
    // start and a source and look like a re-report; they are two splits, and dropping either leaves its two
    // neighbours with parents that do not meet. `droppableBirths` keeps any such candidate. Every drop the
    // rosters make goes with a whole ring of dropped births, and is kept as it was.
    const keptSourcesByStart = new Map<number, Set<number>>();
    const duplicates = new Set<BisectionParams>();
    for (const partitionEvent of sorted) {
        const start = partitionEvent.clockwiseExteriorEdgeIndex;
        let sources = keptSourcesByStart.get(start);
        if (sources === undefined) {
            sources = new Set();
            keptSourcesByStart.set(start, sources);
        }
        if (sources.has(partitionEvent.source)) {
            duplicates.add(partitionEvent);
            continue;
        }

        sources.add(partitionEvent.source);
    }
    if (duplicates.size === 0) {
        return sorted;
    }
    const droppable = droppableBirths(context, [...duplicates]);
    return sorted.filter(partitionEvent => !duplicates.has(partitionEvent) || !droppable.has(partitionEvent));
}

export function createCollisions(interiorEdges: number[], exteriorParents: number[], context: StraightSkeletonSolverContext): CollisionEvent[][] {
    return interiorEdges.map(e1 => {
        const list: (CollisionEvent | null)[] = [];
        const edgeData = context.getInteriorWithId(e1)
        const checkExteriorCollisions = context.isReflexEdge(edgeData) && context.edgeRank(edgeData.id) === 'primary'
        list.push(...interiorEdges.flatMap(e2 => findOrComputeCollision(e1, e2, context)));

        if (checkExteriorCollisions) {
            list.push(...exteriorParents.flatMap(e2 => findOrComputeCollision(e1, e2, context)))
        }

        return list.filter((event): event is CollisionEvent => {
            return !!event && CollisionTypePriority[event.eventType] < 3;
        })
    })
        .filter(list => list.length > 0);
}

/**
 * THE CROSS-RING REFUSAL (skeleton join-and-divide spec, decisions 18 to 21): why this layer's events are not
 * generic, or `undefined` when they are.
 *
 * Among the events the layer will resolve, an interior-to-interior event — a pair, a non-adjacent pair, or a merge
 * the coincidence clustering gathers at δ — with participants on two rings is a vertex meeting across rings. It
 * needs a vertex of each ring to arrive together, which is two strikes coinciding: node 5's work, under any reported
 * type (decision 18). And a JOIN — a split whose instigator and struck segment's `from` lie on different rings of the
 * step at the layer's start (decision 9) — that shares the layer with another event touching either of its two
 * rings is two events of different rings at one moment. Reports that name one instigator are one event. The events
 * are the layer's own, chosen by `HELD_SIMULTANEITY_WINDOW`, the narrowing to the earliest moment and the
 * clustering at δ, so no window or tolerance is added here (decision 19).
 *
 * `ringOf` gives each bisector's ring at the layer's start; it is the only place a split is read as a join.
 */
function crossRingCoincidence(
    context: StraightSkeletonSolverContext,
    ringOf: ReadonlyMap<number, number>,
    events: CollisionEvent[],
): string | undefined {
    const describe = (event: CollisionEvent) =>
        `${event.eventType} [${event.collidingEdges.join(', ')}] at time ${timeOf(event.arrival)}`;
    const interior = events.filter(event => event.eventType === 'interiorPair' || event.eventType === 'interiorNonAdjacent');
    for (const event of interior) {
        if (ringOf.get(event.collidingEdges[0]) !== ringOf.get(event.collidingEdges[1])) {
            return `${describe(event)} meets bisectors of two rings.`;
        }
    }
    for (const merge of clusterCoincidentMerges(interior, context.perceptualFloor)) {
        if (new Set(merge.edgeIds.map(id => ringOf.get(id))).size > 1) {
            return `the vertex event [${merge.edgeIds.join(', ')}] gathers bisectors of two rings.`;
        }
    }
    /** The rings an event touches: its interior participants', and a split's struck segment's. */
    const touched = (event: CollisionEvent): (number | undefined)[] => [
        ...event.collidingEdges.filter(id => context.edgeRank(id) !== 'exterior').map(id => ringOf.get(id)),
        ...(event.struckSegment === undefined
            ? []
            : [ringOf.get(event.struckSegment.from), ringOf.get(event.struckSegment.to)]),
    ];
    for (const join of events) {
        if (!isJoin(join, ringOf)) {
            continue;
        }
        const instigator = join.collidingEdges[0];
        const joined = new Set([ringOf.get(instigator), ringOf.get(join.struckSegment!.from)]);
        const other = events.find(event => event.collidingEdges[0] !== instigator
            && touched(event).some(ring => joined.has(ring)));
        if (other !== undefined) {
            return `the join ${describe(join)} shares the layer with ${describe(other)}, which touches one of its rings.`;
        }
    }
    return undefined;
}

/**
 * IS THIS SPLIT A JOIN (decision 9): do its instigator and its struck segment's `from` lie on different rings of the
 * step at the layer's start? A divide otherwise. Read once, before the layer resolves any event, and by the
 * cross-ring refusal only: the solver never branches on join against divide when it writes links or bears
 * bisectors (decision 8).
 */
function isJoin(event: CollisionEvent, ringOf: ReadonlyMap<number, number>): boolean {
    return event.eventType === 'interiorAgainstExterior'
        && event.struckSegment !== undefined
        && ringOf.get(event.collidingEdges[0]) !== ringOf.get(event.struckSegment.from);
}

/**
 * THE CHILD STEPS OF A STEP OF SEVERAL RINGS: ITS COMPONENTS (decisions 10 to 17). The rings the layer left are read
 * from the links over the step's outgoing bisectors (`outgoing`, in the order they were gathered), classified and
 * grouped by {@link componentsOfRings} at `layerTime`, and each component — an outer ring and the inner rings inside
 * it — is one child. A child lists its members in the order they were gathered, and children are ordered by today's
 * claim: the earliest partition event whose bisector the component holds, then the position of its first member
 * (decision 17).
 */
function componentsAsChildren(
    context: StraightSkeletonSolverContext,
    outgoing: number[],
    partitionBirths: number[],
    layerTime: number,
    born: ReadonlySet<number>,
): AlgorithmStepInput[] {
    const position = new Map(outgoing.map((id, index) => [id, index]));
    const partitionIndex = new Map(partitionBirths.map((id, index) => [id, index] as const));
    // Only this layer's bisectors, as for one ring: a ring the links cannot close never reaches into another step.
    const left = ringsOfWavefront(context, outgoing).map(ring => ring.filter(id => position.has(id)));
    return componentsOfRings(context, left, layerTime, born)
        .map(component => {
            const members = [component.outer, ...component.inner].flat()
                .toSorted((a, b) => position.get(a)! - position.get(b)!);
            return {members, claim: Math.min(...members.map(id => partitionIndex.get(id) ?? Infinity))};
        })
        .toSorted((a, b) => a.claim !== b.claim
            ? a.claim - b.claim
            : position.get(a.members[0])! - position.get(b.members[0])!)
        .map(child => ({interiorEdges: child.members}));
}


export function handleInteriorNGon(context: StraightSkeletonSolverContext, input: AlgorithmStepInput): AlgorithmStepOutput {
    if (input.interiorEdges.length < 3) {
        throw new Error("Greater than 3 edges required for generic step handling.")
    }

    const result: AlgorithmStepOutput = {
        childSteps: []
    };

    // THE LAYER'S LINK STATE (skeleton wavefront-order spec): the events below link the bisectors they bear
    // as pending births, which are replaced by their ids as they are created at the foot of this function.
    beginLayerLinks(context);

    // THE STEP'S RINGS ARE THE LINKS' RINGS, ALWAYS (skeleton join-and-divide spec, decision 1), read at the layer's
    // start. A step of one ring is every step of a single-loop solve and is handled exactly as before; a step of
    // several rings — an outline and the holes inside it — is refused where its events coincide across rings
    // (decisions 18 to 21) and leaves its components as children (decisions 10 to 17).
    const rings = ringsOfWavefront(context, input.interiorEdges);
    const multiRing = rings.length > 1;
    const ringOf = new Map<number, number>();
    rings.forEach((ring, index) => ring.forEach(id => ringOf.set(id, index)));

    // DECISION 7: the step's exterior parents as today, duplicates included. An edge bounding two segments of one
    // step is listed twice, and its two reports of one split are one event: the first resolved retires the
    // instigator.
    const exteriorParents = context.exteriorParentsOfSubPolygon(input.interiorEdges);


    // Generate all currently valid collision events
    const collisionLists: CollisionEvent[][] = createCollisions(input.interiorEdges, exteriorParents, context)

    // W-spec W24: the layer window, on arrivals. `bestArrival` is the earliest by the same
    // comparator, and the window is compared against it, ANCHORED on the earliest arrival (journal
    // decision 155) and stated per pair (C8 spec T13). Census S22: the window is HELD at 1e-8
    // (`HELD_SIMULTANEITY_WINDOW`) — its move to the solve's `simultaneityWindow` (δ, T12) hit T37's
    // STOPs, measured by toggle; see the constant. At unit weights every product is by `1.0` and this
    // is `fp_compare(offset, bestOffset, 1e-8) <= 0` on an offset-ascending list.
    //
    // REGISTER C12 MEASURED THE PER-PAIR FORM HERE WITH THE COMPLETE ERROR MODEL (journal-5 decision 167)
    // AND IT STOPPED — see "THE WINDOW AND THE BOX" in constants.ts. Two readings of "every arrival within
    // the per-pair window of the earliest" were measured. FILTERING the whole list admits a later arrival
    // with a wide budget while refusing an earlier one of the SAME EDGE with a narrow budget: on `Off-edge
    // Jitter Plus (seed 7919)` the ring [22, 25, 26, 43, 45] took 26 × 43 (4.07e-11 after the earliest,
    // budget 2.79e-11) into the layer with 25 × 45 (budget 1.52e-11) and left 22 × 43 (2.29e-11 after it,
    // budget 2.2e-15) out, and a direction violation appeared. The PREFIX form — this loop's own shape,
    // cut at the first refusal — removes that, but still resolves a wide-budget arrival with the earliest
    // while a narrow-budget arrival of the same edges, unorderable against it, is left out: `Off-edge Jitter
    // Plus`, k = 9, seed 23757 took 164 × 229 (8.6e-11 after a split, budget 9.5e-10) with the split and
    // left 164 × 237 (2.8e-12 later still, budget 1.1e-11), and its strips came out 1.1% short.
    const collisionsToHandle: CollisionEvent[] = [];
    let bestArrival: Arrival | undefined;
    const flattenedCollisions = collisionLists.flat()
        .toSorted((e1, e2) => compareArrivals(e1.arrival, e2.arrival, 0))

    for (const flattenedCollision of flattenedCollisions) {
        if (bestArrival === undefined || compareArrivals(flattenedCollision.arrival, bestArrival, 0) < 0) {
            bestArrival = flattenedCollision.arrival;
        }
        if (compareArrivals(flattenedCollision.arrival, bestArrival, HELD_SIMULTANEITY_WINDOW) <= 0){
            collisionsToHandle.push(flattenedCollision)
        }
        else
        {
            break;
        }

    }

    if (collisionLists.length === 0 && multiRing) {
        // DECISION 23: a step of several rings with no event never climbs the terminal ladder. Its closures and its
        // coaxial completion are statements about one live set, and would pair bisectors of different rings.
        refuseStep(context, 'multi-ring-step-refused', `a step of ${rings.length} rings `
            + `(${rings.map(ring => `[${ring.join(', ')}]`).join(', ')}) produced no event.`);
    }

    if (collisionLists.length === 0) {
        // THE TERMINAL LADDER (journal decision 145), the same one the pair and the triangle climb:
        // an n-gon whose live edges produce no event is a generalisation of the triangle that does,
        // and it was refused the same handling only because the terminal cases were first
        // characterised too simply. The throw below stands ONLY where no rung applies and no
        // candidate pair exists.
        const rung = climbTerminalLadder(context, input.interiorEdges);
        if (rung === undefined) {
            throw new Error("Unable to generate any collisions from graph context. Skeleton remains incomplete.");
        }
        if (rung.rung === 'closure') {
            // No acceptance here: exterior edges are accepted at the step boundary only (skeleton edge-acceptance
            // spec, decision 6).
            applyDegenerateClosure(context, input.interiorEdges, rung.position);
            settleLayerLinks(context);
            return result;
        }
        // THE COMPLETION, IN THE N-GON'S OWN TERMS: the named pair's head-on event is priced as
        // `collideInteriorEdges` prices a head-on verdict and becomes the layer, so it is resolved by
        // exactly the machinery below — whole-event merge or pairwise fallback, bisections emitted
        // for the surviving arcs, children partitioned — as any found event would be.
        collisionsToHandle.push(priceHeadOnPair(
            context.getInteriorWithId(rung.completion.firstId),
            context.getInteriorWithId(rung.completion.secondId),
            context));
    }

    // Handle collisions
    const collapseEvents: BisectionParams[] = [];
    const partitionEvents: BisectionParams[] = [];

    const recordBisections = (bisectionList: BisectionParams[]) => {
        if (bisectionList.length > 1) {
            partitionEvents.push(...bisectionList)
        } else {
            collapseEvents.push(...bisectionList)
        }
    };

    // THE TIE-BREAK FOR SIMULTANEOUS ARRIVALS, and only for those: priority, then the colliding edge
    // ids, so events an offset cannot separate are still resolved in an order that is a function of
    // the events themselves. `toSorted` is stable, so priority alone left equal-priority events in
    // the order the offset sort delivered them — and offsets that are equal in exact arithmetic
    // differ by an ulp once the input is placed elsewhere in the plane. Each event handled here
    // CREATES A NODE, so that made node identity turn on an ulp: `Golf Cart`'s two simultaneous
    // splits of its top edge (journal F12) swapped ids under a translation of 1e3, the same defect
    // decision 65 records for the ellipses' mirror pair. Edge ids are integers taken from the
    // polygon's own vertex order and carry no arithmetic at all.
    //
    // It is NOT a layer ordering. Passed to `inArrivalOrder`, it decides only within one moment of
    // the wavefront clock; separated arrivals are ordered by their offsets (decision 102).
    const byEventPriority = (e1: CollisionEvent, e2: CollisionEvent) => {
        const priority = CollisionTypePriority[e1.eventType] - CollisionTypePriority[e2.eventType];
        if (priority !== 0) {
            return priority;
        }
        return compareEdgeIdLists(e1.collidingEdges, e2.collidingEdges);
    };

    // Every interior-to-interior collision at this offset that shares a collision point is one
    // vertex event, not several. Resolve each such event whole — terminate all its arrivals on
    // one node, then emit one bisector per surviving arc — before touching the next. Handling
    // the reported pairs individually is what leaves the ring inconsistent on symmetric input,
    // where a single point can absorb every edge at once.
    //
    // THE RINGS ARE THE WAVEFRONT'S, READ FROM ITS LINKS (skeleton wavefront-order spec, decision 20; skeleton
    // join-and-divide spec, decision 1), `rings` above. `ringsOfSubPolygon`, whose `null` once sent a layer to the
    // pairwise fallback, is deleted: it keyed a ring on a unique widdershins parent, which every joined ring breaks
    // (BSA.F91), and part A found it `null` on no layer of any roster (BSA.F95).

    /**
     * These events resolved as WHOLE vertex events, or `null` when they cannot be.
     *
     * A merge is only resolvable as a whole if all its arrivals lie on one wavefront ring (join-and-divide spec,
     * decision 2: a merge with arrivals on two rings is a vertex meeting across rings, which the cross-ring refusal
     * below refuses), and no two merges may claim the same edge — a bisector arrives somewhere once, so an edge in
     * two merges means the first merge resolved would consume it and strand the second. Deciding both
     * for every merge before mutating anything keeps the answer all-or-nothing, rather than leaving
     * half a set resolved two different ways.
     */
    const asWholeEvents = (events: CollisionEvent[]) => {
        const candidates = clusterCoincidentMerges(
            events.filter(event => event.eventType === 'interiorPair' || event.eventType === 'interiorNonAdjacent'),
            context.perceptualFloor,
        );
        const ringOfMerge = candidates.map(merge =>
            rings.find(ring => merge.edgeIds.every(edgeId => ring.includes(edgeId))));

        if (ringOfMerge.some(ring => ring === undefined) || mergesShareAnEdge(candidates)) {
            return null;
        }
        return {merges: candidates, ringOfMerge: ringOfMerge as number[][]};
    };

    // WHEN THE WHOLE-EVENT RESOLUTION REFUSES THE LAYER, THE ANSWER IS A NARROWER LAYER — NOT A
    // PAIRWISE ONE. Journal decision 102: strict linear causality, the earliest arrival wins. That
    // ruling was applied to the ORDER events are read in and not to how many of them one step
    // CONSUMES, and the gap between those two is this defect. `collisionsToHandle` above is an
    // `fp_compare` window — an absolute 1e-8 on offsets of order 1e-1, some 1e8 ulps wide — and the
    // pairwise fallback used to resolve all of it, so arrivals a million ulps apart in the wavefront
    // clock were consumed as though they were simultaneous.
    //
    // WHAT THAT COST, MEASURED. Every refusal on this corpus is an edge claimed by two merges at
    // once, and every one of those is one wavefront closing at two points a few render floors apart
    // at offsets a few hundredths of an ulp-moment apart — a near-degenerate ring, not a
    // simultaneous event. Resolved whole, BOTH closures fire in one step and each emits its own
    // bisector into the corridor between them, where a ridge admits one; on `(seed 55433, k=4)` a
    // three-way arrival is paired two at a time and the leftover wires backwards (that fixture's
    // pinned direction violation, `wavefront-causality.test.ts`, and this narrowing's own
    // conviction). Narrowed to the earliest moment, the earlier closure resolves alone and the later
    // one is RECOMPUTED next step against the wavefront the first one left, so the third arrival of
    // a three-way event terminates on the node the first two built.
    //
    // ONLY WHERE THE WHOLE-EVENT RESOLUTION HAS ALREADY REFUSED, and that restraint is load-bearing:
    // narrowing unconditionally breaks the k-way hubs this file's clustering exists for — the
    // reciprocal reports of one 48-way convergence are not within the ulp bar of each other — and
    // was measured at over thirty failures across ten suites, F27's finding restated.
    //
    // The two nodes still exist and are still a few floors apart. That separation is real structure
    // (journal decision 92 / F26a) and contracting it is downstream's business, not the solver's.
    let eventsToResolve = collisionsToHandle;
    let resolution = asWholeEvents(eventsToResolve);
    if (resolution === null) {
        eventsToResolve = earliestArrivalMoment(collisionsToHandle);
        resolution = asWholeEvents(eventsToResolve);
    }

    // THE CROSS-RING REFUSAL, ONCE THE LAYER'S EVENT SET IS FINAL AND BEFORE ITS FIRST EVENT IS RESOLVED
    // (join-and-divide spec, decisions 19 and 20), so a refused layer changes no link, node or acceptance. On one
    // ring it cannot fire (decision 21): every event's participants stand on the one ring, and no split joins. It is
    // asked on every layer all the same, so that what it reads is one rule whatever the ring count.
    const coincidence = crossRingCoincidence(context, ringOf, eventsToResolve);
    if (coincidence !== undefined) {
        refuseStep(context, 'simultaneous-across-rings', `rings `
            + `${rings.map(ring => `[${ring.join(', ')}]`).join(', ')}: ${coincidence} Events of different `
            + `rings coincide in this layer, which the holed-skeleton roadmap's node 5 owns.`);
    }

    // THE PAIRWISE FALLBACK IS A PAIRING RULE. Each event here consumes its two edges, so whichever
    // reported pair is handled first is the pair the ring collapses on and every rival report of
    // those edges returns empty. That makes arrival order load-bearing, not cosmetic. It now only
    // ever sees ONE arrival moment, so the pairing it decides is between arrivals no offset separates.
    if (resolution === null) {
        inArrivalOrder(eventsToResolve, byEventPriority)
            .map(event => handleCollisionEvent(event, context))
            .forEach(recordBisections)
    } else {
        // NO CONCURRENCY GATE HERE, AND THE MEASUREMENT IS WHY. The tolerance audit's placed-node
        // spec would resolve an arrival set to one node only where its PARENT set is concurrent —
        // full rank and residual under a bar — and refuse loudly otherwise, because a least-squares
        // node over a non-concurrent parent set is on none of the pairwise bisector loci (F32/F39).
        // Swept over the 346 merges this branch actually resolves across the corpus: 253 carry three
        // distinct oriented normals, 88 carry four, four are the high-degree hubs (10/16/32/48), and
        // the worst concurrency residual anywhere is 5.56e-12 — three orders inside `EQUIDISTANCE_BAR`,
        // with 344 of the 346 at machine zero. Exactly ONE set is rank-deficient: a two-arrival
        // head-on corridor closure on `(seed 7919)` whose position comes from the collision itself
        // and whose residual is 2.8e-17, which is the case a rank test would have refused wrongly.
        //
        // The pairs the audit measured as rank-2 — the 29/30 class — never reach this branch as one
        // set at all: the narrowing above separates them into two arrival moments, so they resolve
        // as two nodes joined by one ridge, which is what the rank-2 ruling prescribes, reached by
        // causality instead of by a rank predicate. The gate is therefore unbuilt because the corpus
        // offers nothing to convict it on, in the manner of journal decision 107(b).
        resolution.merges.forEach((merge, index) => {
            const arrivals = merge.edgeIds.filter(edgeId => !context.isAccepted(edgeId));
            if (arrivals.length < 2) {
                return;
            }

            // The merge's node carries the largest position budget among the events it gathers (journal-5
            // decision 167): its position is one of theirs (the medoid), and it answers for all of them.
            const positionUncertainty = Math.max(0, ...eventsToResolve
                .filter(event => merge.edgeIds.includes(event.collidingEdges[0])
                    && merge.edgeIds.includes(event.collidingEdges[1]))
                .map(event => event.positionUncertainty));
            const node = context.terminateEdgesAtPoint(arrivals, merge.position, positionUncertainty);
            context.acceptAll(arrivals);
            const bisections = bisectionsForMerge(resolution.ringOfMerge[index], {position: merge.position, edgeIds: arrivals}, node.id, context);
            // The arrivals leave the wavefront, once `bisectionsForMerge` has linked each gap from them.
            retireBisectors(context, arrivals);
            // AND IT CARRIES WHERE IT WAS PUT (journal-5 decision 170): the medoid siting is decision 157's
            // release, and its cost downstream is each emitted bisector's equi-time residual at the node.
            // The node's budget is the larger of the members' pricing budget above and the largest residual
            // over the bisectors it emits — {@link chargeSitingResidual}.
            chargeSitingResidual(node.id, bisections, context);
            recordBisections(bisections)
        })

        // Splits of one layer landing on one point are ONE vertex event, and this is where they are
        // told so. `handleCollisionEvent` places a node at whatever position it is handed, so two
        // simultaneous splits a fraction of the render floor apart used to build two nodes joined by
        // a degenerate pair of bisectors. Only the POSITION is resolved here; each split still emits
        // its own bisections, and `findOrAddNode` does the joining.
        const splitEvents = eventsToResolve
            .filter(event => event.eventType === 'interiorAgainstExterior')
            .toSorted(byEventPriority);
        const splitPositions = coincidentEventPositions(splitEvents, context.perceptualFloor);

        // A RE-POINTED SPLIT PAYS FOR THE MOVE, AS A MERGE DOES (journal-5 decision 171(c)). Its node is
        // sited at the group's medoid, not at its own meeting, so the bisectors it emits inherit that
        // node's residual on their parents' clocks — {@link chargeSitingResidual}, the merge's term. Only
        // an event actually moved is charged: at its own point a split's residual is its own pricing's
        // rounding, which its position budget already answers for, and the medoid member is not moved.
        splitEvents.forEach((event, index) => {
            const sited = splitPositions[index];
            const bisections = handleCollisionEvent({...event, position: sited}, context);
            if (bisections.length > 0 && (sited.x !== event.position.x || sited.y !== event.position.y)) {
                chargeSitingResidual(bisections[0].source, bisections, context);
            }
            recordBisections(bisections);
        });
    }

    // NO ACCEPTANCE HERE (skeleton edge-acceptance spec, decision 5): exterior edges are accepted at the step
    // boundary only, where nothing is pending. Under that rule no reader in this step can observe an acceptance
    // made here: every parent of every birth below was named by a then-live bisector at the last boundary, and every
    // other in-step reader asks only of edges its own live bisectors name. The edge is accepted at the next boundary.

    // A RING MADE ONLY OF THIS LAYER'S BIRTHS, ALL AT ONE NODE, CLOSES THERE AND NONE OF IT IS BORN (decision 32):
    // it has no extent. It is the residue of a vertex event resolved pairwise, two births with each other's parents
    // at the node where their shared face has just closed. Read from the links and the source node alone.
    const closedAtOneNode = birthsClosedAtOneNode(context);
    const unborn = (params: BisectionParams) => !closedAtOneNode.has(params);

    // Collapse/partition into child
    const finalPartitionEvents = selectPartitionEvents(context, partitionEvents.filter(unborn));

    const allOutgoingInteriorEdges = [...input.interiorEdges.filter(e => !context.isAccepted(e))]

    // Each bisector is linked where its event left its pending birth, the moment it has an id.
    const bear = (params: BisectionParams): number => {
        const id = bisectWithParams(context, params);
        linkBirth(context, params, id);
        return id;
    };

    // NO ACCEPTED-PARENT FILTER ON EITHER KIND OF BIRTH (decision 7). None can fire under the boundary rule, and a
    // silently refused birth is how early acceptance broke rings: `addBisectionEdge`'s throw is the one guard left,
    // so a birth with a finished parent becomes a step failure.
    // Indexed as `finalPartitionEvents`: the bisector each partition event bore.
    const partitionBirths = finalPartitionEvents.map(bear);
    allOutgoingInteriorEdges.push(...partitionBirths)

    allOutgoingInteriorEdges.push(...collapseEvents.filter(unborn).map(bear))

    // Every pending birth that was never born — a re-report the dedupe dropped, or a ring closed at one node — is
    // spliced out of its ring (skeleton wavefront-order spec).
    settleLayerLinks(context);

    if (multiRing) {
        // A STEP OF SEVERAL RINGS LEAVES ITS COMPONENTS (join-and-divide spec, decisions 10 to 17), whatever its
        // layer did: a join leaves one ring where there were two, a divide two outer rings, and a layer of both
        // whatever its rings make, by the one rule. The rings are classified at the time of the layer's earliest
        // arrival, a bisector born in it standing at its source node.
        const layerTime = timeOf(eventsToResolve.reduce((earliest, event) =>
            compareArrivals(event.arrival, earliest.arrival, 0) < 0 ? event : earliest).arrival);
        const stepMembers = new Set(input.interiorEdges);
        const born = new Set(allOutgoingInteriorEdges.filter(id => !stepMembers.has(id)));
        result.childSteps = componentsAsChildren(
            context, allOutgoingInteriorEdges, partitionBirths, layerTime, born);
        return result;
    }

    if (finalPartitionEvents.length === 0) {
        result.childSteps.push({interiorEdges: allOutgoingInteriorEdges})

        return result;
    }

    // THE CHILD STEPS ARE THE RINGS THE LAYER LEFT (skeleton wavefront-order spec, decision 19). This replaced
    // an assignment of each bisector to the first id interval holding both its parents, which presumed every
    // ring is an interval of ids: on the stage-off along-edge cells it shattered a true ring into one-edge
    // children (BSA.F95), and a ring joined from two loops is no interval at all (BSA.F91).
    //
    // IN TODAY'S ORDER (decision 13), because child order numbers what later steps create: a ring goes where
    // the earliest partition event whose bisector it holds put its child, and a child lists its members in
    // the order they were gathered above. Part A measured that every child of every partitioning layer of
    // the corpus, the sweep and the census that completed was exactly one ring.
    const position = new Map(allOutgoingInteriorEdges.map((id, index) => [id, index]));
    const partitionIndex = new Map(partitionBirths.map((id, index) => [id, index] as const));
    const children = ringsOfWavefront(context, allOutgoingInteriorEdges)
        .map(ring => ({
            // Only this layer's bisectors: a ring the links cannot close (a broken link, which checkWavefront
            // reports) never reaches into another step.
            members: ring.filter(id => position.has(id)).toSorted((a, b) => position.get(a)! - position.get(b)!),
            claim: Math.min(...ring.map(id => partitionIndex.get(id) ?? Infinity)),
        }))
        .toSorted((a, b) => a.claim !== b.claim
            ? a.claim - b.claim
            : position.get(a.members[0])! - position.get(b.members[0])!);
    result.childSteps = children.map(child => ({interiorEdges: child.members}));

    return result;
}
