import {CollisionEvent, CollisionTypePriority, StraightSkeletonSolverContext, Vector2} from "./types";
import {arrivalsShareMoment, byArrival} from "./collision-helpers";

/*
 * THE ORDER OF ONE LAYER'S EVENTS: the comparators and partitions `handleInteriorNGon` and the coincidence clustering
 * read. Every rule here is a pure function of the events handed to it and, for the place and the ray readings, of the
 * solver context; nothing writes.
 */

/**
 * Lexicographic over two events' `[instigator, target]` edge ids.
 *
 * The canonical tie-break for events that a floating-point offset cannot separate. `collidingEdges`
 * identifies an event by the edges taking part in it, which is a property of the polygon's own
 * topology, so two distinct events at one offset are ordered by something no placement can move.
 */
export function compareEdgeIdLists(first: readonly [number, number], second: readonly [number, number]): number {
    for (let index = 0; index < 2; index++) {
        if (first[index] !== second[index]) {
            return first[index] - second[index];
        }
    }
    return 0;
}

/** The sort comparator of events by their colliding edge ids ({@link compareEdgeIdLists}). */
export function byEdgeIds(first: CollisionEvent, second: CollisionEvent): number {
    return compareEdgeIdLists(first.collidingEdges, second.collidingEdges);
}

/** Two events' {@link CollisionTypePriority} difference: the lower priority value first. */
export function comparePriority(first: CollisionEvent, second: CollisionEvent): number {
    return CollisionTypePriority[first.eventType] - CollisionTypePriority[second.eventType];
}

/**
 * The runs into which single linkage cuts `sorted`: a new run starts at every item that is not `linked` to the one
 * before it. The runs follow the given order, so they are a total order and not a sort under a non-transitive "close
 * enough" predicate; the accepted cost is chaining.
 */
export function singleLinkageRuns<T>(sorted: readonly T[], linked: (previous: T, next: T) => boolean): T[][] {
    const runs: T[][] = [];
    sorted.forEach((item, index) => {
        if (index === 0 || !linked(sorted[index - 1], item)) {
            runs.push([]);
        }
        runs[runs.length - 1].push(item);
    });
    return runs;
}

/**
 * The ARRIVAL MOMENTS of `events`: the events in arrival order ({@link byArrival}, a stable sort), cut by single linkage
 * at the 64-ulp moment bar ({@link arrivalsShareMoment}). The first moment is the earliest.
 */
export function arrivalMoments<T extends CollisionEvent>(events: T[]): T[][] {
    return singleLinkageRuns(events.toSorted(byArrival),
        (previous, next) => arrivalsShareMoment(previous.arrival, next.arrival));
}

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
 * MOMENTS BY SINGLE LINKAGE ({@link arrivalMoments}), over an offset-ascending list, so the result is a total order
 * rather than a sort under a non-transitive "close enough" predicate. (The coincidence clustering in
 * `coincident-events.ts` used the same single linkage until journal decision 155 made it anchored;
 * this partition is at the 64-ulp representation bar, S29, which C8 spec T26 keeps as it is.)
 *
 * AND WITHIN A MOMENT, WHAT `mustPrecede` ORDERS COMES BEFORE THE TIE-BREAK (BSA.D335). Where it is given, no event of a
 * moment is placed before one of the same moment that must precede it, and `tieBreak` decides only between events it
 * leaves unordered ({@link inPrecedenceOrder}). The pairwise fallback hands it {@link nearerAlongSharedBisector}.
 */
export function inArrivalOrder<T extends CollisionEvent>(
    events: T[],
    tieBreak: (first: T, second: T) => number,
    mustPrecede?: (first: T, second: T) => boolean,
): T[] {
    // W-spec W24, W25: ordered by ARRIVAL, division-free. At unit weights `byArrival` is the sign of
    // `a.offsetDistance - b.offsetDistance` with ties reported as zero, so the stable sort delivers exactly today's order.
    const ordered = arrivalMoments(events)
        .flatMap((members, moment) => members.map(event => ({event, moment})))
        .toSorted((a, b) => a.moment !== b.moment ? a.moment - b.moment : tieBreak(a.event, b.event));
    if (mustPrecede === undefined) {
        return ordered.map(entry => entry.event);
    }

    // `mustPrecede` reorders within a moment and never across one: separated arrivals keep their order (decision 102).
    const result: T[] = [];
    let start = 0;
    for (let end = 1; end <= ordered.length; end++) {
        if (end === ordered.length || ordered[end].moment !== ordered[start].moment) {
            result.push(...inPrecedenceOrder(ordered.slice(start, end).map(entry => entry.event), mustPrecede));
            start = end;
        }
    }
    return result;
}

/**
 * `events` in their given order, except that no event is placed before one that `mustPrecede` it: at each place, the
 * first event of the given order that no event still unplaced must precede (a stable topological order). The given order
 * therefore decides only between events the relation leaves unordered.
 *
 * Should every unplaced event have one that must precede it, the relation has a cycle and cannot be honoured; the first
 * unplaced event of the given order is placed and the rest go on as before, so the order is always total and always a
 * function of the given order and the relation.
 */
function inPrecedenceOrder<T extends CollisionEvent>(
    events: T[],
    mustPrecede: (first: T, second: T) => boolean,
): T[] {
    const blockedBy = events.map(() => 0);
    const blocks = events.map((): number[] => []);
    events.forEach((first, i) => events.forEach((second, j) => {
        if (i !== j && mustPrecede(first, second)) {
            blocks[i].push(j);
            blockedBy[j]++;
        }
    }));

    const placed = events.map(() => false);
    const ordered: T[] = [];
    while (ordered.length < events.length) {
        let next = blockedBy.findIndex((count, index) => !placed[index] && count === 0);
        if (next < 0) {
            next = placed.indexOf(false);
        }
        placed[next] = true;
        ordered.push(events[next]);
        blocks[next].forEach(index => blockedBy[index]--);
    }
    return ordered;
}

/**
 * The bisectors an event's meeting point lies on: both of an interior pair's, and a split's instigator (its other
 * colliding edge is the exterior wall it strikes).
 */
function bisectorsMeeting(event: CollisionEvent, context: StraightSkeletonSolverContext): number[] {
    return event.collidingEdges.filter(edgeId => edgeId >= context.graph.numExteriorNodes);
}

/** How far `point` lies along bisector `edgeId`'s ray from its source: its projection on the ray's direction. */
function distanceAlongRay(point: Vector2, edgeId: number, context: StraightSkeletonSolverContext): number {
    const ray = context.projectRayInterior(context.getInteriorWithId(edgeId));
    const basis = ray.basisVector;
    return (basis.x * (point.x - ray.sourceVector.x) + basis.y * (point.y - ray.sourceVector.y)) / Math.hypot(basis.x, basis.y);
}

/**
 * OF TWO SIMULTANEOUS EVENTS THAT SHARE A BISECTOR, THE ONE NEARER ALONG THAT BISECTOR'S RAY IS RESOLVED FIRST (BSA.D335,
 * BSA.F107): the relation `inArrivalOrder` honours within a moment, over `events`.
 *
 * A bisector carries ONE wavefront vertex from its source outward, so of two meetings on its ray the nearer is the one
 * that vertex reaches, and it ends the bisector there. Time says the same thing wherever time moves along the ray, and
 * there two meetings at two points of one ray are not one moment. It stops saying it on a LEVEL bisector, the ridge two
 * walls that face each other bear: every point of it has one time, so every other bisector with one of those two walls
 * as a parent meets it at the same instant, wherever it meets it. Two such meetings are one moment at two points, and
 * the edge-id tie-break used to pick between them. On the user's layout files 4, 7 and 9 it took the far one, ran the
 * ridge past the near one and left a node inside another wall's face, with the solve complete and undiagnosed
 * (`level-ridge-tie.test.ts` is the smallest outline found). So the order goes back to position.
 *
 * EVERY KIND OF EVENT, NOT ONLY PAIRS: a split lies on its instigator's ray, and is ordered against a pair on that ray
 * the same way, ahead of priority. Measured over the wide mixed-pitch fuzz (5,000 draws), 33 fallback layers held such a
 * cross-kind order, and restricting the relation to events of one priority changed no skeleton of its 8,878 islands.
 *
 * MORE THAN THE PERCEPTUAL FLOOR APART ALONG THE RAY, or the two are one point (the floor is the solver's bar for one
 * point, as `clusterCoincidentMerges` spends it), and the relation leaves them to the tie-break: the reciprocal reports
 * of one meeting must not be ordered by an ulp (journal decision 65). The distances are read once per event.
 *
 * ONLY IN THE PAIRWISE FALLBACK. The whole-event path's splits (`splitEvents` in `handleInteriorNGon`) are not ordered by
 * it: that order sites splits that land on one point, it is taken over the held window rather than one moment, and two
 * splits of one instigator more than the floor apart were found in no layer of `FULL_CORPUS`, `HOLED_TEST_POLYGONS`,
 * `WEIGHTED_TEST_POLYGONS` or either mixed-pitch fuzz, so the rule would change nothing there that a test could convict.
 */
export function nearerAlongSharedBisector(
    events: CollisionEvent[],
    context: StraightSkeletonSolverContext,
): (first: CollisionEvent, second: CollisionEvent) => boolean {
    const along = new Map(events.map(event => [event, new Map(bisectorsMeeting(event, context)
        .map(edgeId => [edgeId, distanceAlongRay(event.position, edgeId, context)] as const))] as const));
    return (first, second) => {
        const secondAlong = along.get(second)!;
        for (const [edgeId, firstDistance] of along.get(first)!) {
            const secondDistance = secondAlong.get(edgeId);
            if (secondDistance !== undefined && secondDistance - firstDistance > context.perceptualFloor) {
                return true;
            }
        }
        return false;
    };
}

/**
 * The runs of `items`, in ascending `key`, into which single linkage at `floor` cuts them: a new run starts wherever a key
 * lies more than `floor` above the one before it. The runs are a function of the set of keys, so of the items handed,
 * not of their order.
 */
function linkedRuns<T>(items: T[], key: (item: T) => number, floor: number): T[][] {
    return singleLinkageRuns(items.toSorted((first, second) => key(first) - key(second)),
        (previous, next) => !(key(next) - key(previous) > floor));
}

/**
 * THE ORDER BY PLACE (BSA.D335 stage 2): a comparator over `events` that orders them by where they meet, in unit space,
 * and reports zero for two that meet at one point.
 *
 * The events are cut into COLUMNS by single linkage on x at `floor`, and each column into CELLS by single linkage on y at
 * `floor`; a cell further left, then lower, comes first. Two events of one cell are one point at the floor and are left
 * equal, for the caller's next key. The cut is single linkage over a sorted list, as `inArrivalOrder`'s moments are, so
 * the result is a total order of the cells and not a sort under a non-transitive "close enough" predicate; its accepted
 * cost is the same chaining.
 *
 * WHAT IT ORDERS IN THE PAIRWISE FALLBACK: the events `nearerAlongSharedBisector` leaves unordered, which share no
 * bisector or meet at one point. Two events that share no bisector consume no common edge, so their order decides no
 * pairing. Measured before it was built: reversing the edge-id order there changed no skeleton of `FULL_CORPUS`,
 * `HOLED_TEST_POLYGONS` or `WEIGHTED_TEST_POLYGONS` at any sampled starting vertex, none of the 11,878 islands of the two
 * mixed-pitch fuzzes, and no sweep-harness record but 135 along-edge digests, by node and edge numbering alone, every
 * node position bit-identical; this order, against the edge-id order, measured the same with 138. So it decides the
 * numbering, and the numbering now follows the geometry rather than the order the caller listed the vertices in; within
 * one point, where nothing geometric tells two events apart, the edge ids still decide.
 *
 * THE COST, STATED: a place is a coordinate, and the edge ids it replaces carry no arithmetic (journal decision 65). Two
 * events whose x or y lie a floor apart can change cells under a placement that moves them by an ulp, and their nodes
 * swap ids. The floor keeps that to gaps at the floor's own scale, where the edge-id order had none.
 *
 * EXPORTED FOR ITS OWN TEST, not for other callers — see `arrival-ordering.test.ts`.
 */
export function inPlaceOrder(events: CollisionEvent[], floor: number): (first: CollisionEvent, second: CollisionEvent) => number {
    const cellOf = new Map<CollisionEvent, {column: number; row: number}>();
    linkedRuns(events, event => event.position.x, floor).forEach((column, columnIndex) =>
        linkedRuns(column, event => event.position.y, floor).forEach((cell, rowIndex) =>
            cell.forEach(event => cellOf.set(event, {column: columnIndex, row: rowIndex}))));
    return (first, second) => {
        const a = cellOf.get(first)!;
        const b = cellOf.get(second)!;
        return a.column !== b.column ? a.column - b.column : a.row - b.row;
    };
}

/**
 * The events of the EARLIEST arrival moment in `events` — the first of {@link arrivalMoments}, and nothing after it.
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
export function earliestArrivalMoment<T extends CollisionEvent>(events: T[]): T[] {
    return arrivalMoments(events)[0] ?? [];
}
