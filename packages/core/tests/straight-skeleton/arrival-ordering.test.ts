import type {CollisionEvent, CollisionType} from '../../src/straight-skeleton/types';
import {inArrivalOrder} from '../../src/straight-skeleton/algorithm-complex-cases';
import {CollisionTypePriority} from '../../src/straight-skeleton/types';
import {solveSkeleton} from '../../src/straight-skeleton/algorithm-termination-cases';
import {OFF_EDGE_JITTER_L_SEED_55433} from '@proc-geo/test-fixtures';

/*
 * ============================================================================
 *  ARRIVAL ORDER IS A PAIRING RULE — journal decision 102.
 * ============================================================================
 *
 * `handleInteriorNGon`'s pairwise fallback resolves a layer one reported pair at a time, and each
 * resolution CONSUMES its two edges: every rival report of those edges then returns nothing. So
 * whichever pair is handled first is the pair the collapsing ring is paired on, and the order that
 * list is sorted in decides the skeleton rather than decorating it.
 *
 * It used to be sorted by event priority and then by lexicographic edge id, with the offsets thrown
 * away entirely. That ordering was written for a real reason — node identity must not turn on an ulp
 * (decision 65) — but it was applied to a whole layer rather than to the ties it was for, and on
 * `OFF_EDGE_JITTER_L_SEED_55433` it paired a four-edge arm ring the wrong way round while the right
 * pairing sat 2.52e-11 of offset earlier.
 *
 * THE MEASUREMENT THAT SETS THE SCALES, taken from that ring — interior edges 28, 46, 34, 44, whose
 * exterior walls run 9, 10, 15, 16 — with all eight reported arrivals inside one epsilon layer:
 *
 *   [34,44]   2.92971968798038274e-1   walls 16 vanishing
 *   [28,46]   2.92971968823266316e-1   walls 10 vanishing
 *   [28,44]   2.92971968856249931e-1
 *   [34,46]   2.92971968868775967e-1
 *
 * The first two are the true pairing and are the two earliest; lexicographic order takes [28,44]
 * first and gets the ring's other diagonal. The gap the ordering has to resolve is 2.52e-11 — 3.88e5
 * ulps at this magnitude, and the whole spread is 7.07e-11, or 1.09e6 — while a reciprocal report of
 * ONE arrival ([34,44] against [44,34]) differs by under an ulp. Those two populations are five
 * orders apart, and the simultaneity window sits between them.
 */

const CONVERGING = [0, 0, 'converging'] as const;

function event(offsetDistance: number, collidingEdges: number[], eventType: CollisionType = 'interiorPair'): CollisionEvent {
    return {
        offsetDistance,
        // Under weights a time is carried as the `{distance, weight}` pair it came from (W-spec W7).
        // These fixtures are stated as times, so the pair is that time against unit speed.
        arrival: {distance: offsetDistance, weight: 1, uncertainty: 0},
        collidingEdges,
        position: {x: 0, y: 0},
        intersectionData: [CONVERGING[0], CONVERGING[1], CONVERGING[2]],
        eventType,
    };
}

/** The tie-break the solver hands `inArrivalOrder`: priority, then the colliding edge ids. */
function byEventPriority(first: CollisionEvent, second: CollisionEvent): number {
    const priority = CollisionTypePriority[first.eventType] - CollisionTypePriority[second.eventType];
    if (priority !== 0) {
        return priority;
    }
    for (let index = 0; index < Math.min(first.collidingEdges.length, second.collidingEdges.length); index++) {
        if (first.collidingEdges[index] !== second.collidingEdges[index]) {
            return first.collidingEdges[index] - second.collidingEdges[index];
        }
    }
    return first.collidingEdges.length - second.collidingEdges.length;
}

function pairs(events: CollisionEvent[]): number[][] {
    return events.map(candidate => candidate.collidingEdges);
}

describe('inArrivalOrder: the earlier arrival is resolved first', () => {
    it('puts a later-lexicographic pair first when it arrives first', () => {
        // The defect in miniature, at the ring's own numbers. Sorted by edge id this list starts
        // [28,44]; sorted by arrival it starts [34,44], which is the pairing the geometry has.
        const layer = [
            event(2.92971968856249931e-1, [28, 44]),
            event(2.92971968823266316e-1, [28, 46]),
            event(2.92971968798038274e-1, [34, 44]),
            event(2.92971968868775967e-1, [34, 46]),
        ];

        expect(pairs(inArrivalOrder(layer, byEventPriority))).toEqual([
            [34, 44], [28, 46], [28, 44], [34, 46],
        ]);
        expect(pairs(layer.toSorted(byEventPriority))).toEqual([
            [28, 44], [28, 46], [34, 44], [34, 46],
        ]);
    });

    it('leaves the tie-break in charge of arrivals the offset cannot separate', () => {
        // Decision 65's scope, restored rather than removed: two arrivals a single ulp apart are one
        // moment of the wavefront clock, and the order they are resolved in — and so the ids of the
        // nodes they create — must come from the edge ids, which no placement can move.
        const base = 2.92971968798038274e-1;
        const layer = [
            event(base + 3 * Number.EPSILON * base, [44, 34]),
            event(base, [34, 44]),
        ];

        expect(pairs(inArrivalOrder(layer, byEventPriority))).toEqual([[34, 44], [44, 34]]);
    });

    it('separates the ring\'s true pairing from its rival, which is the whole point of the bar', () => {
        // The two populations either side of the window, asserted as the ratio they actually are
        // rather than as the constant. A window wide enough to swallow 2.52e-11 here would restore
        // the defect; one narrow enough to split 1.11e-19 would put node identity back on an ulp.
        const earliest = 2.92971968798038274e-1;
        const reciprocal = 2.92971968798038385e-1;
        const rival = 2.92971968823266316e-1;

        const ulp = Number.EPSILON * earliest;
        expect((reciprocal - earliest) / ulp).toBeLessThan(4);
        expect((rival - earliest) / ulp).toBeGreaterThan(3e5);
    });

    it('is a function of the event set, not of the order it is handed', () => {
        // The fallback receives its layer in whatever order the offset sort and the collision
        // generation left it. A permutation must not change the pairing.
        const layer = [
            event(2.92971968856249931e-1, [28, 44]),
            event(2.92971968823266316e-1, [28, 46]),
            event(2.92971968798038274e-1, [34, 44]),
            event(2.92971968868775967e-1, [34, 46]),
        ];
        const permuted = [layer[3], layer[0], layer[2], layer[1]];

        expect(pairs(inArrivalOrder(permuted, byEventPriority)))
            .toEqual(pairs(inArrivalOrder(layer, byEventPriority)));
    });

    it('orders separated moments by arrival and never lets the tie-break cross one', () => {
        // A split (priority 2) arriving before a pair (priority 0) is resolved first. Priority is a
        // tie-break WITHIN a moment; it does not reorder the clock.
        const layer = [
            event(2.0, [50, 60]),
            event(1.0, [10, 0], 'interiorAgainstExterior'),
        ];

        expect(pairs(inArrivalOrder(layer, byEventPriority))).toEqual([[10, 0], [50, 60]]);
    });
});

describe('the arm ring of (seed 55433) is paired on the walls that vanish first', () => {
    it('carries its surviving ridge between walls 9 and 15, not walls 10 and 16', () => {
        /*
         * THE END-TO-END CONVICTION, and the reading F36 asked for by name: "a duplicate
         * anti-parallel `{10,16}` pair sits where the single `{9,15}` ridge belongs".
         *
         * The arm tip is a four-walled ring — 9, 10, 15, 16 — and the pair of opposite walls that
         * closes first is the pair that disappears, leaving the other two facing each other across
         * the surviving ridge. Walls 16 and 10 close first, at 2.9297196879804e-1 and
         * 2.9297196882327e-1, so the ridge belongs to 9 and 15. Lexicographic order took the other
         * diagonal and built the ridge between 10 and 16.
         *
         * WHAT THIS DOES NOT CLAIM. Two bisectors still span that ridge, so I5 still fires on this
         * fixture with the same count — see `graph-index-invariants.test.ts`. The two collapse nodes
         * are 3.9e-6 apart in unit space, which is journal decision 101's defect and not this one:
         * the pairing is now right and the nodes should not both exist. Reverting the ordering flips
         * the parents below back to 10 and 16, which is what makes this a conviction.
         */
        const {graph} = solveSkeleton(OFF_EDGE_JITTER_L_SEED_55433);

        const ridge = graph.interiorEdges.find(interior =>
            interior.clockwiseExteriorEdgeIndex === 9 && interior.widdershinsExteriorEdgeIndex === 15);
        expect(ridge).toBeDefined();

        const walls = graph.interiorEdges
            .filter(interior => interior.clockwiseExteriorEdgeIndex === 10
                && interior.widdershinsExteriorEdgeIndex === 16);
        expect(walls).toEqual([]);
    });
});
