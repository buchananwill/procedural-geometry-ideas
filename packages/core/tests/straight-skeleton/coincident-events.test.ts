import type {CollisionEvent, Vector2} from '../../src/straight-skeleton/types';
import {
    assertMergePositionsAreDistinct,
    clusterCoincidentMerges,
    coincidentEventPositions,
    CoincidentMerge,
} from '../../src/straight-skeleton/coincident-events';
import {vectorsAreEqual} from '../../src/straight-skeleton/core-functions';
import {SKELETON_NOISE_FLOOR} from '../../src/straight-skeleton/canonicalisation';

/*
 * ============================================================================
 *  COINCIDENCE CLUSTERING — connected components under an unchanged predicate.
 * ============================================================================
 *
 * `clusterCoincidentMerges` used to join each event to the *first* group already within
 * `vectorsAreEqual` of it. Proximity under a fixed absolute tolerance is not transitive, so that
 * partition depended on the order the events arrived in: a 48-gon fan measured downstream produced
 * 1424 events over 48 edge ids and came out as four groups where the same relation, replayed as
 * connected components, gives one.
 *
 * These tests fix the three properties that replacement has to have — the partition is the
 * transitive closure, it does not depend on arrival order, and the representative of a group is
 * always one of that group's own members — and convict the invariant gate that protects the third.
 */

/**
 * The default tolerance the clustering predicate carries. Never varied here; see decision 2.
 *
 * SINCE JOURNAL DECISION 78 THIS IS THE RENDER-SCALE FLOOR, not the arithmetic epsilon: two events
 * closer together than a viewer could ever see are one event. Every construction below is written
 * as a RATIO of this bar and so carries its meaning across the change — a chain whose neighbours sit
 * at 0.6 of the bar and whose extremes sit at 1.8 of it still requires transitive closure to become
 * one group, which is the property these tests exist for. Left at 1e-8 the same constructions would
 * all fall inside a single bar and pass without asking anything.
 */
const CLUSTERING_BAR = SKELETON_NOISE_FLOOR;

/**
 * A step small enough to chain under the tolerance and exactly representable, so the medoid tie in
 * `TIE_CHAIN` below is an exact one rather than an artefact of decimal rounding.
 */
const STEP = 2 ** -28;

function eventAt(position: Vector2, collidingEdges: number[]): CollisionEvent {
    return {
        offsetDistance: 1,
        collidingEdges,
        position,
        intersectionData: [1, 1, 'converging'],
        eventType: 'interiorPair',
    };
}

/** Positions of a component chained end to end: neighbours within tolerance, extremes not. */
function chainPositions(count: number, step: number): Vector2[] {
    return Array.from({length: count}, (_, index) => ({x: index * step, y: 0}));
}

function isOneOf(position: Vector2, candidates: Vector2[]): boolean {
    return candidates.some(candidate => candidate.x === position.x && candidate.y === position.y);
}

/**
 * The representative decision 3 and decision 4 rule out: the arithmetic mean of the members.
 *
 * Reproduced here — and nowhere in the solver — so the gate that forbids it can be convicted
 * against real data rather than trusted. Component discovery is deliberately identical to the
 * production relation; only the representative differs.
 */
function clusterByCentroid(events: CollisionEvent[]): CoincidentMerge[] {
    const componentOf = new Map<number, number[]>();
    const labels = events.map(() => -1);
    let nextLabel = 0;

    for (let i = 0; i < events.length; i++) {
        if (labels[i] === -1) {
            labels[i] = nextLabel++;
        }
        for (let j = i + 1; j < events.length; j++) {
            // The SAME relation production clusters by, at the same bar — decision 78's render
            // floor, not `vectorsAreEqual`'s epsilon. Only the representative may differ, or the
            // mutation stops being a mutation of one decision and becomes a different partition.
            if (Math.hypot(events[i].position.x - events[j].position.x,
                events[i].position.y - events[j].position.y) >= CLUSTERING_BAR) {
                continue;
            }
            if (labels[j] === -1) {
                labels[j] = labels[i];
            } else if (labels[j] !== labels[i]) {
                const absorbed = labels[j];
                for (let k = 0; k < labels.length; k++) {
                    if (labels[k] === absorbed) {
                        labels[k] = labels[i];
                    }
                }
            }
        }
    }

    labels.forEach((label, index) => {
        const members = componentOf.get(label);
        if (members === undefined) {
            componentOf.set(label, [index]);
        } else {
            members.push(index);
        }
    });

    return [...componentOf.values()].map(members => {
        let x = 0;
        let y = 0;
        for (const index of members) {
            x += events[index].position.x;
            y += events[index].position.y;
        }
        return {
            position: {x: x / members.length, y: y / members.length},
            edgeIds: [...new Set(members.flatMap(index => events[index].collidingEdges))],
        };
    });
}

describe('clusterCoincidentMerges: the partition is the transitive closure', () => {
    it('chains a run of events into one group, however far its extremes lie apart', () => {
        // Neighbours are 0.6 of the bar apart and the extremes 1.8 of it: first-match grouping split
        // exactly this shape in two, because event 2 was compared against event 0's position.
        const positions = chainPositions(4, 0.6 * CLUSTERING_BAR);
        const events = positions.map((position, index) => eventAt(position, [10 + index]));

        const merges = clusterCoincidentMerges(events);

        expect(merges).toHaveLength(1);
        expect(merges[0].edgeIds).toEqual([10, 11, 12, 13]);
    });

    it('keeps genuinely separate points in separate groups', () => {
        const events = [
            eventAt({x: 0, y: 0}, [10, 11]),
            eventAt({x: 5, y: 0}, [12, 13]),
            eventAt({x: 0, y: 0}, [11, 14]),
        ];

        const merges = clusterCoincidentMerges(events);

        expect(merges).toHaveLength(2);
        expect(merges[0].edgeIds).toEqual([10, 11, 14]);
        expect(merges[1].edgeIds).toEqual([12, 13]);
    });

    it('returns nothing for an empty layer', () => {
        expect(clusterCoincidentMerges([])).toEqual([]);
    });

    it('does not depend on arrival order', () => {
        const positions = chainPositions(5, 0.6 * CLUSTERING_BAR);
        const forward = positions.map((position, index) => eventAt(position, [20 + index]));
        const reversed = [...forward].reverse();
        const interleaved = [forward[2], forward[0], forward[4], forward[1], forward[3]];

        const partitions = [forward, reversed, interleaved].map(events =>
            clusterCoincidentMerges(events).map(merge => [...merge.edgeIds].sort((a, b) => a - b)));

        expect(partitions[0]).toEqual([[20, 21, 22, 23, 24]]);
        expect(partitions[1]).toEqual(partitions[0]);
        expect(partitions[2]).toEqual(partitions[0]);
    });

    it('gives every arrival order the same representative', () => {
        const positions = chainPositions(4, STEP);
        const forward = positions.map((position, index) => eventAt(position, [30 + index]));
        const reversed = [...forward].reverse();

        expect(clusterCoincidentMerges(reversed)[0].position)
            .toEqual(clusterCoincidentMerges(forward)[0].position);
    });
});

describe('clusterCoincidentMerges: the representative is a medoid', () => {
    it('is always one of the grouped events own positions', () => {
        const positions = chainPositions(4, 0.6 * CLUSTERING_BAR);
        const events = positions.map((position, index) => eventAt(position, [40 + index]));

        expect(isOneOf(clusterCoincidentMerges(events)[0].position, positions)).toBe(true);
    });

    it('breaks an exact tie on position rather than on arrival index', () => {
        // Four collinear members at 0, q, 2q, 3q: the centroid is exactly 1.5q and the two inner
        // members are exactly 0.5q from it either side. Both orders must pick the lower x.
        const positions = chainPositions(4, STEP);
        const forward = positions.map((position, index) => eventAt(position, [50 + index]));
        const reversed = [...forward].reverse();

        expect(clusterCoincidentMerges(forward)[0].position).toEqual({x: STEP, y: 0});
        expect(clusterCoincidentMerges(reversed)[0].position).toEqual({x: STEP, y: 0});
    });

    it('breaks a tie on y when x is equal', () => {
        const positions: Vector2[] = [
            {x: 0, y: -STEP},
            {x: 0, y: STEP},
        ];
        const events = positions.map((position, index) => eventAt(position, [60 + index]));

        expect(clusterCoincidentMerges(events)[0].position).toEqual({x: 0, y: -STEP});
    });

    it('never answers with the centroid when no member sits there', () => {
        // Decision 4, made concrete: a component chained into a ring about the origin has its
        // centroid exactly at the origin, which is not within tolerance of any of its members.
        const ring = ringPositions();
        const events = ring.map((position, index) => eventAt(position, [70 + index]));

        const merges = clusterCoincidentMerges(events);

        expect(merges).toHaveLength(1);
        expect(isOneOf(merges[0].position, ring)).toBe(true);
        expect(vectorsAreEqual(merges[0].position, {x: 0, y: 0})).toBe(false);
    });
});

/**
 * A ring of radius 2 floors about the origin, its members ordered as exact negation pairs so the
 * centroid sums to exactly (0, 0). Neighbours are 0.78 of a floor apart, so the ring is one
 * component; every member is 2 floors from the origin, so none of them is within tolerance of it.
 *
 * SCALED TO THE CLUSTERING'S OWN BAR, which since journal decision 78 is `SKELETON_NOISE_FLOOR`
 * rather than the arithmetic epsilon. The construction is unchanged in every ratio that carries its
 * meaning — one component, a centroid at the exact centre, no member within tolerance of that centre
 * — and only the unit it is expressed in has moved. Left at the epsilon scale the whole ring plus
 * its centre would fall inside one bar, the two components would be one, and both tests below would
 * pass vacuously on a layer that no longer poses the question they exist to ask.
 */
function ringPositions(): Vector2[] {
    const radius = 2 * CLUSTERING_BAR;
    const positions: Vector2[] = [];
    for (let half = 0; half < 8; half++) {
        const angle = (half * Math.PI) / 8;
        const point: Vector2 = {x: radius * Math.cos(angle), y: radius * Math.sin(angle)};
        positions.push(point, {x: -point.x, y: -point.y});
    }
    return positions;
}

describe('the invariant gate: no two merges of one layer share a position', () => {
    it('passes the medoid partition of a layer that would collide under a centroid', () => {
        const ring = ringPositions();
        const events = [
            ...ring.map((position, index) => eventAt(position, [80 + index])),
            eventAt({x: 0, y: 0}, [200]),
        ];

        const merges = clusterCoincidentMerges(events);

        expect(merges).toHaveLength(2);
        expect(() => assertMergePositionsAreDistinct(merges)).not.toThrow();
    });

    it('fires on the centroid partition of that same layer', () => {
        // The mutation this gate exists to catch: two components — the ring and the single event at
        // its centre — that are genuinely distinct at every member, collapsing onto one position.
        const ring = ringPositions();
        const events = [
            ...ring.map((position, index) => eventAt(position, [80 + index])),
            eventAt({x: 0, y: 0}, [200]),
        ];

        const mutant = clusterByCentroid(events);

        expect(mutant).toHaveLength(2);
        expect(vectorsAreEqual(mutant[0].position, mutant[1].position)).toBe(true);
        expect(() => assertMergePositionsAreDistinct(mutant)).toThrow(/same position/);
    });

    it('accepts a layer whose merges are distinct', () => {
        const merges: CoincidentMerge[] = [
            {position: {x: 0, y: 0}, edgeIds: [10]},
            {position: {x: 1, y: 0}, edgeIds: [11]},
        ];

        expect(() => assertMergePositionsAreDistinct(merges)).not.toThrow();
    });
});

describe('coincidentEventPositions: identity for the events the merge path never sees', () => {
    /*
     * The split/partition pass resolves its events one at a time and builds a node each, so two
     * splits of one layer at one point used to become two nodes joined by a degenerate pair of
     * bisectors — journal decision 85, measured on `OFF_EDGE_JITTER_L_SEED_55433_K4`. This function
     * gives that pass the same position identity the merge path has, and no more: it decides where,
     * never what is emitted.
     */

    function splitAt(position: Vector2, collidingEdges: number[]): CollisionEvent {
        return {...eventAt(position, collidingEdges), eventType: 'interiorAgainstExterior'};
    }

    it('re-points a sub-floor pair at one position, and it is one of the two', () => {
        const first = {x: 0, y: 0};
        const second = {x: CLUSTERING_BAR * 0.5, y: 0};

        const resolved = coincidentEventPositions([splitAt(first, [30, 4]), splitAt(second, [31, 9])]);

        expect(resolved[0]).toBe(resolved[1]);
        expect(isOneOf(resolved[0], [first, second])).toBe(true);
    });

    it('leaves events further apart than the floor exactly where they were', () => {
        const first = {x: 0, y: 0};
        const second = {x: CLUSTERING_BAR * 1.5, y: 0};

        const resolved = coincidentEventPositions([splitAt(first, [30, 4]), splitAt(second, [31, 9])]);

        expect(resolved[0]).toBe(first);
        expect(resolved[1]).toBe(second);
    });

    it('leaves a pair the node lookup already unifies exactly where it was', () => {
        // THE RESTRAINT THAT KEEPS THE CLEAN ROSTER BIT-IDENTICAL. Inside `vectorsAreEqual`,
        // `findOrAddNode` already returns one node at the first-established position; re-pointing
        // the pair at its medoid would move that node for no gain, which is measured to cost one ulp
        // on four clean fixtures.
        const first = {x: 0, y: 0};
        const second = {x: 2 ** -40, y: 0};

        const resolved = coincidentEventPositions([splitAt(first, [30, 4]), splitAt(second, [31, 9])]);

        expect(resolved[0]).toBe(first);
        expect(resolved[1]).toBe(second);
    });
});
