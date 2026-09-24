import type {CollisionEvent, Vector2} from '../../src/straight-skeleton/types';
import {
    assertMergesAreAnchored,
    clusterCoincidentMerges,
    coincidentEventPositions,
    CoincidentMerge,
} from '../../src/straight-skeleton/coincident-events';
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
 * That replacement was connected components — the transitive closure. JOURNAL DECISION 155(b)
 * RETIRES IT: approximate equality is not an equivalence relation, and the solver must never claim
 * transitivity. The partition is now ANCHORED — events visited earliest arrival first, each joining
 * the nearest anchor strictly within the floor or founding its own — so every group lies within the
 * floor of its anchor and a run the floor cannot hold in one group is two groups.
 *
 * These tests fix the three properties the anchored partition has to have — it is anchored and not
 * transitive, it does not depend on the order the layer lists its events in, and the representative of
 * a group is always one of that group's own members — and convict the invariant gate that protects
 * the partition.
 */

/**
 * The tolerance the clustering predicate is given. Never varied here; see decision 2.
 *
 * PASSED IN RATHER THAN READ FROM THE MODULE since journal decision 106 made the perceptual floor
 * the client's: the production call site takes it from the solver context, and this suite states the
 * library default so its constructions keep meaning what they meant. That the floor is now a
 * parameter is what `perceptual-floor-option.test.ts` holds; what varying it does is not this
 * suite's question.
 *
 * SINCE JOURNAL DECISION 78 THIS IS THE RENDER-SCALE FLOOR, not the arithmetic epsilon: two events
 * closer together than a viewer could ever see are one event. Every construction below is written
 * as a RATIO of this bar and so carries its meaning across the change — a chain whose neighbours sit
 * at 0.6 of the bar and whose extremes sit at 1.8 of it would need transitive closure to become one
 * group, which is exactly what the anchored partition refuses (decision 155). Left at 1e-8 the same constructions would
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
        // The pair the time came from (W-spec W7): unit speed, so distance and time coincide.
        arrival: {distance: 1, weight: 1},
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
            // The group's first-listed member stands as its anchor, so the gate can read the mutant.
            anchor: events[members[0]].position,
        };
    });
}

describe('clusterCoincidentMerges: the partition is anchored, never transitive (decision 155)', () => {
    it('does NOT chain: a run whose extremes lie beyond the floor is two groups, each within the floor of its anchor', () => {
        // Neighbours are 0.6 of the bar apart and the extremes 1.8 of it. Connected components — the
        // retired rule — made this ONE group, a claim that 0 ≈ 0.6 ≈ 1.2 ≈ 1.8 makes 0 ≈ 1.8. Anchored,
        // the earliest (edge 10, at 0) holds 0.6; 1.2 is a floor or more from it and founds its own
        // group, which holds 1.8.
        const positions = chainPositions(4, 0.6 * CLUSTERING_BAR);
        const events = positions.map((position, index) => eventAt(position, [10 + index]));

        const merges = clusterCoincidentMerges(events, CLUSTERING_BAR);

        expect(merges).toHaveLength(2);
        expect(merges[0].edgeIds).toEqual([10, 11]);
        expect(merges[1].edgeIds).toEqual([12, 13]);
        expect(merges[0].anchor).toEqual({x: 0, y: 0});
        expect(merges[1].anchor).toEqual(positions[2]);
    });

    it('anchors on the EARLIEST arrival, whatever the edge ids say', () => {
        // The same run, but the event at 1.8 arrives first: it anchors, holds 1.2, and 0.6 then founds
        // the second group with 0. Arrival decides the anchor; the ids only break exact ties.
        const positions = chainPositions(4, 0.6 * CLUSTERING_BAR);
        const events = positions.map((position, index) => ({
            ...eventAt(position, [10 + index]),
            arrival: {distance: index === 3 ? 0.5 : 1, weight: 1},
        }));

        const merges = clusterCoincidentMerges(events, CLUSTERING_BAR);

        expect(merges.map(merge => merge.edgeIds)).toEqual([[10, 11], [12, 13]]);
        expect(merges[1].anchor).toEqual(positions[3]);
    });

    it('keeps genuinely separate points in separate groups', () => {
        const events = [
            eventAt({x: 0, y: 0}, [10, 11]),
            eventAt({x: 5, y: 0}, [12, 13]),
            eventAt({x: 0, y: 0}, [11, 14]),
        ];

        const merges = clusterCoincidentMerges(events, CLUSTERING_BAR);

        expect(merges).toHaveLength(2);
        expect(merges[0].edgeIds).toEqual([10, 11, 14]);
        expect(merges[1].edgeIds).toEqual([12, 13]);
    });

    it('returns nothing for an empty layer', () => {
        expect(clusterCoincidentMerges([], CLUSTERING_BAR)).toEqual([]);
    });

    it('does not depend on arrival order', () => {
        const positions = chainPositions(5, 0.6 * CLUSTERING_BAR);
        const forward = positions.map((position, index) => eventAt(position, [20 + index]));
        const reversed = [...forward].reverse();
        const interleaved = [forward[2], forward[0], forward[4], forward[1], forward[3]];

        const partitions = [forward, reversed, interleaved].map(events =>
            clusterCoincidentMerges(events, CLUSTERING_BAR).map(merge => [...merge.edgeIds].sort((a, b) => a - b)));

        expect(partitions[0]).toEqual([[20, 21], [22, 23], [24]]);
        expect(partitions[1]).toEqual(partitions[0]);
        expect(partitions[2]).toEqual(partitions[0]);
    });

    it('gives every arrival order the same representative', () => {
        const positions = chainPositions(4, STEP);
        const forward = positions.map((position, index) => eventAt(position, [30 + index]));
        const reversed = [...forward].reverse();

        expect(clusterCoincidentMerges(reversed, CLUSTERING_BAR)[0].position)
            .toEqual(clusterCoincidentMerges(forward, CLUSTERING_BAR)[0].position);
    });
});

describe('clusterCoincidentMerges: the representative is a medoid', () => {
    it('is always one of the grouped events own positions', () => {
        const positions = chainPositions(4, 0.6 * CLUSTERING_BAR);
        const events = positions.map((position, index) => eventAt(position, [40 + index]));

        expect(isOneOf(clusterCoincidentMerges(events, CLUSTERING_BAR)[0].position, positions)).toBe(true);
    });

    it('breaks an exact tie on position rather than on arrival index', () => {
        // Four collinear members at 0, q, 2q, 3q: the centroid is exactly 1.5q and the two inner
        // members are exactly 0.5q from it either side. Both orders must pick the lower x.
        const positions = chainPositions(4, STEP);
        const forward = positions.map((position, index) => eventAt(position, [50 + index]));
        const reversed = [...forward].reverse();

        expect(clusterCoincidentMerges(forward, CLUSTERING_BAR)[0].position).toEqual({x: STEP, y: 0});
        expect(clusterCoincidentMerges(reversed, CLUSTERING_BAR)[0].position).toEqual({x: STEP, y: 0});
    });

    it('breaks a tie on y when x is equal', () => {
        const positions: Vector2[] = [
            {x: 0, y: -STEP},
            {x: 0, y: STEP},
        ];
        const events = positions.map((position, index) => eventAt(position, [60 + index]));

        expect(clusterCoincidentMerges(events, CLUSTERING_BAR)[0].position).toEqual({x: 0, y: -STEP});
    });

    it('never answers with the centroid when no member sits there', () => {
        // Decision 4, made concrete: a ring about the origin has its centroid exactly at the origin,
        // which is not within tolerance of any of its members. Anchored, the ring is several groups
        // (its neighbours chain, its anchors cannot); every group still answers with one of its own.
        const ring = ringPositions();
        const events = ring.map((position, index) => eventAt(position, [70 + index]));

        const merges = clusterCoincidentMerges(events, CLUSTERING_BAR);

        expect(merges.length).toBeGreaterThan(1);
        for (const merge of merges) {
            expect(isOneOf(merge.position, ring)).toBe(true);
            expect(merge.position).not.toEqual({x: 0, y: 0});
        }
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

describe('the invariant gate: the partition is anchored (decision 155)', () => {
    it('passes the medoid partition of a layer that would collide under a centroid', () => {
        const ring = ringPositions();
        const events = [
            ...ring.map((position, index) => eventAt(position, [80 + index])),
            eventAt({x: 0, y: 0}, [200]),
        ];

        const merges = clusterCoincidentMerges(events, CLUSTERING_BAR);

        // The centre is two floors from every ring member, so it founds its own group; the ring is
        // several anchored groups. Every anchor is a floor or more from every other.
        expect(merges.length).toBeGreaterThan(2);
        expect(() => assertMergesAreAnchored(merges, CLUSTERING_BAR)).not.toThrow();
    });

    it('fires on the centroid partition of that same layer', () => {
        // The mutation this gate exists to catch: the retired transitive partition with a CENTROID
        // representative — the ring chained into one component answers at the origin, on no member and
        // two floors from its own anchor.
        const ring = ringPositions();
        const events = [
            ...ring.map((position, index) => eventAt(position, [80 + index])),
            eventAt({x: 0, y: 0}, [200]),
        ];

        const mutant = clusterByCentroid(events);

        expect(mutant).toHaveLength(2);
        expect(mutant[0].position).toEqual(mutant[1].position);
        expect(() => assertMergesAreAnchored(mutant, CLUSTERING_BAR)).toThrow(/outside the floor of its anchor/);
    });

    it('fires on two groups anchored within the floor of each other', () => {
        // The transitivity the anchored partition exists to refuse, stated as merges: two anchors
        // closer than the floor would be one event split in two by the order it was visited in.
        const merges: CoincidentMerge[] = [
            {position: {x: 0, y: 0}, edgeIds: [10], anchor: {x: 0, y: 0}},
            {position: {x: 0.5 * CLUSTERING_BAR, y: 0}, edgeIds: [11], anchor: {x: 0.5 * CLUSTERING_BAR, y: 0}},
        ];

        expect(() => assertMergesAreAnchored(merges, CLUSTERING_BAR)).toThrow(/anchored at the same position/);
    });

    it('accepts a layer whose merges are distinct', () => {
        const merges: CoincidentMerge[] = [
            {position: {x: 0, y: 0}, edgeIds: [10], anchor: {x: 0, y: 0}},
            {position: {x: 1, y: 0}, edgeIds: [11], anchor: {x: 1, y: 0}},
        ];

        expect(() => assertMergesAreAnchored(merges, CLUSTERING_BAR)).not.toThrow();
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

        const resolved = coincidentEventPositions([splitAt(first, [30, 4]), splitAt(second, [31, 9])], CLUSTERING_BAR);

        expect(resolved[0]).toBe(resolved[1]);
        expect(isOneOf(resolved[0], [first, second])).toBe(true);
    });

    it('leaves events further apart than the floor exactly where they were', () => {
        const first = {x: 0, y: 0};
        const second = {x: CLUSTERING_BAR * 1.5, y: 0};

        const resolved = coincidentEventPositions([splitAt(first, [30, 4]), splitAt(second, [31, 9])], CLUSTERING_BAR);

        expect(resolved[0]).toBe(first);
        expect(resolved[1]).toBe(second);
    });

    it('leaves a pair the node lookup already unifies exactly where it was', () => {
        // THE RESTRAINT THAT KEEPS THE CLEAN ROSTER BIT-IDENTICAL. Inside the arithmetic same-point bar,
        // `findOrAddNode` already returns one node at the first-established position; re-pointing
        // the pair at its medoid would move that node for no gain, which is measured to cost one ulp
        // on four clean fixtures.
        const first = {x: 0, y: 0};
        const second = {x: 2 ** -40, y: 0};

        const resolved = coincidentEventPositions([splitAt(first, [30, 4]), splitAt(second, [31, 9])], CLUSTERING_BAR);

        expect(resolved[0]).toBe(first);
        expect(resolved[1]).toBe(second);
    });
});
