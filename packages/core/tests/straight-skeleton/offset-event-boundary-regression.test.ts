import {ALL_TEST_POLYGONS} from '@proc-geo/test-fixtures';
import {
    computeMaxOffset,
    computeNodeOffsets,
    computeOffsetRings,
    computeStrips,
    projectOffsetWavefront,
    setSkeletonLogLevel,
    SkeletonSolveResult,
    solveSkeleton,
    Vector2,
} from '@proc-geo/core';
import {
    eventOffsets,
    isContinuous,
    measureMutationReport,
    TERMINAL_BAND,
    totalRingArea,
} from './wavefront-measurement-helpers';

/*
 * ============================================================================
 *  THE DEFECT THIS FILE RECORDED IS FIXED. THESE ASSERTIONS ARE NOW A
 *  SPECIFICATION AND MUST NOT BE WEAKENED TO MAKE A CHANGE PASS.
 * ============================================================================
 *
 * WHAT THIS FILE GUARDS
 *
 * That `computeOffsetRings` returns the whole wavefront when the requested offset lands on, or
 * arbitrarily close to, an event offset — the offset of an interior skeleton node, which is where
 * the wavefront changes shape. Offsets away from events were never in doubt and are covered by
 * `offset-projection.test.ts`; this file exists because that suite samples at fractions of the
 * maximum offset and those never land on an event, so an entire class of offset went untested. A
 * caller walking the skeleton event by event — which is what a parcel generator does — asks for
 * exactly the offsets this file sweeps.
 *
 * ----------------------------------------------------------------------------
 * WHAT WAS WRONG, AND WHAT FIXED IT
 * ----------------------------------------------------------------------------
 *
 * Two independent faults, both of them a hand-over at an event failing by one bit.
 *
 * 1. THE LIFETIME WINDOW WAS SHIFTED, NOT DILATED. `collectAliveBisectors` kept a bisector when
 *    `offset >= birth - 1e-9 && offset < death - 1e-9`, so a bisector was already dead for the
 *    whole nanometre before it actually died. That was survivable on its own, but `birth` was
 *    derived from `sourceOffsetDistance` while `death` was derived from `computeNodeOffsets`'
 *    perpendicular distance. Those are the same quantity by two routes and they disagreed by up
 *    to 1.7e-13, so wherever they disagreed a bisector was dropped that nothing replaced.
 *
 *    Fixed by reading both ends from `computeNodeOffsets`, so `death` of the bisector dying at a
 *    node is bit-for-bit `birth` of the bisector born there, and by then dropping the tolerance
 *    the exact comparison no longer needs. Measured: 68 events that returned zero rings at
 *    `event - 1e-9` now return the full wavefront.
 *
 * 2. COINCIDENT ENDPOINTS SORTED OPEN-BEFORE-CLOSE. At the exact offset of a split event the
 *    bisector the split kills and the bisector it creates sit on the same point of the same
 *    exterior edge. `segmentsAlongExteriorEdge` broke that tie by putting the opening endpoint
 *    first, so the new bisector arrived while a start was still pending and `pendingStart ??=`
 *    dropped it. The new bisector then opened no span, the chain running through it had nothing
 *    to continue to, and the ring was lost.
 *
 *    Fixed by breaking the tie close-before-open. Measured: 32 events that lost nearly all their
 *    ring area — Duck Octagon @36.931349 went 11731.36 -> 0.35 -> 11731.35 — are now continuous.
 *
 * ----------------------------------------------------------------------------
 * WHY THE LOSS WAS WORTH CHASING
 * ----------------------------------------------------------------------------
 *
 * It was silent. A dropped bisector breaks the chain of wavefront segments, and `assembleRings`
 * discarded any chain that did not close without saying so. A parcel generator asking for the
 * wavefront at an event offset read the empty result as "no lots here" rather than as an error.
 * `projectOffsetWavefront` now reports every discarded chain on its return value, and the sweep
 * below asserts that it never has anything to report. That the report is a live detector rather
 * than a field nothing ever writes to is asserted by mutation, under "nothing is discarded
 * silently" — break a hand-over and it fires.
 *
 * ----------------------------------------------------------------------------
 * WHAT THIS FILE IS NOT
 * ----------------------------------------------------------------------------
 *
 * The near-regular fixtures are held out of `ALL_TEST_POLYGONS`, so nothing here sweeps them. The
 * projection used to lose rings on them; the simultaneous-mirror-event work has since fixed that,
 * and `near-regular-ring-loss-diagnosis.test.ts` carries both the diagnosis and the guarantee for
 * those four. They stay held out until they are promoted deliberately, which is a separate change:
 * promoting them moves the event count this file pins, and bundling the two would make any
 * regression unattributable. The two suites share their measurements through
 * `wavefront-measurement-helpers.ts` so that the guarantee and the diagnosis are stated over the
 * same quantities.
 *
 * ----------------------------------------------------------------------------
 * THE CHAIN THAT COULD NOT BE CLOSED, AND NO LONGER EXISTS
 * ----------------------------------------------------------------------------
 *
 * This file used to record one genuine exception: Pentagon House at the offset its two apex
 * nodes share. That was a solver artefact and the solver's coincident-event work removed it —
 * the terminating ridge used to wire itself to the roof apex behind it, and now cross-wires to
 * its partner. Every event of every fixture closes; the sweep asserting so has no exception in
 * it any more.
 *
 * ----------------------------------------------------------------------------
 * THE ONE BOUNDARY THAT IS REAL AND STAYS
 * ----------------------------------------------------------------------------
 *
 * Within `FLOATING_POINT_EPSILON` (1e-8) of the maximum offset the surviving ring is finer than
 * the coordinate-equality tolerance the whole module works to, so its vertices are indistinguishable
 * and `makeRing` drops it. That is a documented limit of the representation, not a lost ring, and
 * `projectOffsetWavefront` reports it as a degenerate cycle rather than an unclosed chain. Sweeps
 * that sample near an event therefore skip events within a micrometre of the maximum offset.
 */

setSkeletonLogLevel('silent');

const NEIGHBOURHOOD = 1e-6;

function solvedFixture(name: string): SkeletonSolveResult {
    const fixture = ALL_TEST_POLYGONS.find(polygon => polygon.name === name);
    if (fixture === undefined) {
        throw new Error(`No fixture named "${name}" in ALL_TEST_POLYGONS`);
    }
    const result = solveSkeleton(fixture.vertices);
    if (!result.complete || result.context === null) {
        throw new Error(`Fixture "${name}" no longer solves; this file assumes it does.`);
    }
    return result;
}

/**
 * Does a ring visit the same point twice?
 *
 * A wavefront ring is a simple closed walk, so two of its vertices landing on the same point means a
 * bisector was assembled into it twice or a chain closed on itself early. A nanometre is the same
 * separation the sweeps either side of an event are taken at: closer than that and the two readings
 * are the same reading.
 */
function hasRepeatedVertex(ring: Vector2[], tolerance: number): boolean {
    for (let i = 0; i < ring.length; i++) {
        for (let j = i + 1; j < ring.length; j++) {
            if (Math.hypot(ring[i].x - ring[j].x, ring[i].y - ring[j].y) < tolerance) {
                return true;
            }
        }
    }
    return false;
}

const SWEPT_FIXTURES = ALL_TEST_POLYGONS
    .filter(polygon => {
        const result = solveSkeleton(polygon.vertices);
        return result.complete && result.context !== null;
    })
    .map(polygon => polygon.name);

/** One offset a sweep visits: an event of a fixture, and how far from that event to sample. */
interface EventSample {
    name: string;
    result: SkeletonSolveResult;
    event: number;
    delta: number;
}

/** Which of a fixture's events a sweep visits, judged against that fixture's maximum offset. */
type EventFilter = (event: number, maxOffset: number) => boolean;

/** Every event the fixture has: the sweep has nothing to steer around. */
const EVERY_EVENT: EventFilter = () => true;

/** Events clear of the terminal band, where an empty projection is a loss rather than the answer. */
const MID_SOLVE_EVENT: EventFilter = (event, maxOffset) => maxOffset - event > TERMINAL_BAND;

/** Events with a micrometre still to run, so `event + NEIGHBOURHOOD` is short of the maximum. */
const EVENT_CLEAR_OF_MAXIMUM: EventFilter = (event, maxOffset) => event + NEIGHBOURHOOD < maxOffset;

/**
 * Every (fixture, event, delta) the sweeps below visit, enumerated in one place.
 *
 * The sweeps walk the same three nested loops and differ only in which events they keep and how far
 * either side of one they sample. Spelling the walk out at each of them put up to four `for`
 * statements between the reader and the property being asserted, and left the "which events are
 * sampleable" rule restated once per sweep to drift. Each fixture is still solved once and its
 * maximum offset taken once, exactly as when each sweep did its own walking.
 *
 * It THROWS rather than yielding nothing. Every sweep here asserts that a list of problems came out
 * empty, which an empty population satisfies just as well as a sound projection does, so an
 * enumeration that quietly stopped producing samples would retire this file's guarantees without
 * failing anything.
 */
function* eventSamples(deltas: number[], keep: EventFilter): Generator<EventSample> {
    let yielded = 0;
    for (const name of SWEPT_FIXTURES) {
        const result = solvedFixture(name);
        const maxOffset = computeMaxOffset(result);
        for (const event of eventOffsets(result).filter(offset => keep(offset, maxOffset))) {
            for (const delta of deltas) {
                yielded += 1;
                yield {name, result, event, delta};
            }
        }
    }
    if (yielded === 0) {
        throw new Error('eventSamples enumerated nothing; every sweep over it would pass vacuously.');
    }
}

describe('offset projection at event boundaries', () => {
    describe('the corpus this sweeps', () => {
        it('is every fixture, and 270 distinct event offsets across them', () => {
            expect(SWEPT_FIXTURES).toHaveLength(ALL_TEST_POLYGONS.length);

            const events = SWEPT_FIXTURES.reduce(
                (total, name) => total + eventOffsets(solvedFixture(name)).length, 0);
            // Was 271. Pentagon House's two apex nodes read 2.9999999999999996 and 3 — one instant
            // re-derived twice, one ulp apart — and `computeNodeOffsets` now collapses a
            // simultaneous set onto a single member, so those two offsets are one event rather than
            // two. That is the only pair in this corpus within the node-offset canonicalisation
            // band.
            //
            // THEN 270 BECAME 269, AND THAT IS A PINNED NUMBER DOING ITS JOB RATHER THAN A
            // REGRESSION. Input canonicalisation removes one exactly-collinear vertex from `Long
            // Unbroken Side Then Extreme Acute Angle` — 32 vertices to 31, at a discarded deviation
            // of 7.85e-17 — so that fixture is expressed in one fewer exterior edge and carries one
            // fewer event. Decision 12 of the input-canonicalisation brief places exterior edge ids
            // and counts explicitly OUTSIDE the observable the stage is required to preserve, so a
            // structural count moving here is exactly what should happen. Measured per fixture: the
            // other 36 are unmoved, and this one goes 30 events to 29.
            //
            // 269 BECAME 270 when the rectilinear Cross fixture joined the corpus: its four arms
            // are congruent, so every collision on one arm has a mirror on the other three at the
            // same offset, and `computeNodeOffsets` canonicalises those onto one shared event —
            // the whole shape resolves through a single distinct offset.
            //
            // 270 BECAME 271 when the T-Shape started solving completely (the degenerate-closure
            // path): like the Cross, everything in it collapses at one canonicalised offset —
            // stem spine, bar ridge and culled surplus bisectors all at half the stem width — so
            // the fixture contributes exactly one distinct event.
            expect(events).toBe(271);
        });
    });

    describe('the wavefront survives an event', () => {
        it('is still there one nanometre before the final event of a square', () => {
            const result = solvedFixture('Square');
            const maxOffset = computeMaxOffset(result);

            expect(computeOffsetRings(result, maxOffset - 1e-6)).toHaveLength(1);
            expect(computeOffsetRings(result, maxOffset - 1e-3)).toHaveLength(1);

            // Closer in than 1e-8 the ring is a square of side 4e-9, finer than the coordinate
            // equality tolerance the module works to, so it has no distinguishable vertices. The
            // projection reports that as a degenerate cycle, not as a chain it failed to close.
            const projection = projectOffsetWavefront(result, maxOffset - 1e-9);
            expect(projection.rings).toEqual([]);
            expect(projection.unclosedChains).toEqual([]);
            expect(projection.degenerateCycles).toHaveLength(1);
        });

        it('is still there one nanometre before every mid-solve event of every fixture', () => {
            const problems: string[] = [];
            for (const {name, result, event, delta} of eventSamples([-1e-9, 0, 1e-9], MID_SOLVE_EVENT)) {
                if (computeOffsetRings(result, event + delta).length === 0) {
                    problems.push(`${name} @${event.toFixed(6)}${delta >= 0 ? '+' : ''}${delta}: no rings`);
                }
            }
            expect(problems.join('; ')).toBe('');
        });

        it('keeps its area continuous through every event of every fixture', () => {
            const problems: string[] = [];
            for (const name of SWEPT_FIXTURES) {
                const result = solvedFixture(name);
                for (const event of eventOffsets(result)) {
                    const before = totalRingArea(computeOffsetRings(result, event - NEIGHBOURHOOD));
                    const at = totalRingArea(computeOffsetRings(result, event));
                    const after = totalRingArea(computeOffsetRings(result, event + NEIGHBOURHOOD));
                    if (!isContinuous(before, at, after)) {
                        problems.push(`${name} @${event.toFixed(6)}: ${before} -> ${at} -> ${after}`);
                    }
                }
            }
            expect(problems.join('; ')).toBe('');
        });

        it('keeps the whole ring area at the duck octagon event that used to lose it', () => {
            const result = solvedFixture('Duck Octagon (passes)');
            const event = eventOffsets(result).find(offset => Math.abs(offset - 36.931349) < 1e-5);
            expect(event).toBeDefined();

            // Was 11731.36 -> 0.35 -> 11731.35. The middle reading is now its neighbours' value.
            const before = totalRingArea(computeOffsetRings(result, event! - NEIGHBOURHOOD));
            const at = totalRingArea(computeOffsetRings(result, event!));
            expect(before).toBeGreaterThan(1000);
            expect(at / before).toBeCloseTo(1, 5);
        });

        it('keeps the whole ring area at the moorhen event that used to lose it', () => {
            const result = solvedFixture('Moorhen (passes)');
            const event = eventOffsets(result).find(offset => Math.abs(offset - 36.293964) < 1e-5);
            expect(event).toBeDefined();

            // Was 12102.84 -> 0.026 -> 12102.83.
            const before = totalRingArea(computeOffsetRings(result, event! - NEIGHBOURHOOD));
            const at = totalRingArea(computeOffsetRings(result, event!));
            expect(before).toBeGreaterThan(1000);
            expect(at / before).toBeCloseTo(1, 5);
        });

        it('splits into the same rings at an event as a nanometre after it', () => {
            // At a split event the wavefront has already parted; the configuration at the event is
            // the one that follows it, not the one that precedes it.
            const result = solvedFixture('Duck Octagon (passes)');
            const event = eventOffsets(result).find(offset => Math.abs(offset - 36.931349) < 1e-5)!;

            const at = computeOffsetRings(result, event).map(ring => ring.length).sort();
            const after = computeOffsetRings(result, event + 1e-9).map(ring => ring.length).sort();
            expect(at).toEqual(after);
            expect(at).toHaveLength(2);
        });
    });

    describe('nothing is discarded silently', () => {
        it('reports no unclosed chain at, or either side of, any event of any fixture', () => {
            const problems: string[] = [];
            const deltas = [0, -1e-9, 1e-9, -NEIGHBOURHOOD, NEIGHBOURHOOD];
            for (const {name, result, event, delta} of eventSamples(deltas, MID_SOLVE_EVENT)) {
                const projection = projectOffsetWavefront(result, Math.max(0, event + delta));
                for (const chain of projection.unclosedChains) {
                    problems.push(
                        `${name} @${event.toFixed(6)}${delta >= 0 ? '+' : ''}${delta}: `
                        + `${chain.reason} over bisectors ${chain.bisectorIds.join('>')}`);
                }
            }
            expect(problems.join('; ')).toBe('');
        });

        it('is a live report: breaking a hand-over by hand either fires it or costs no area', () => {
            // The sweep above is only worth anything if `unclosedChains` can still be non-empty. A
            // suite that suppressed the report — or a projection that quietly returned whatever rings
            // it could assemble — would pass it just as well, so the report is convicted here by
            // mutation. `measureMutationReport` is that mutation, defined once and run here over
            // `ALL_TEST_POLYGONS` and in `near-regular-ring-loss-diagnosis.test.ts` over the four
            // held-out fixtures, so the conviction the two suites claim is the same conviction.
            //
            // Measured at this commit: 232 clean events across the corpus, 101 of which the report
            // fires on and 131 of which cost no area at all.
            const {silentLosses, fired, mutated} = measureMutationReport(
                SWEPT_FIXTURES.map(name => ({name, result: solvedFixture(name)})));
            expect(silentLosses.join('; ')).toBe('');

            // Non-vacuity, pinned rather than bounded. A share-of-corpus bound would still pass if
            // the report's sensitivity quietly halved, and how loudly the mutation bites is exactly
            // what the assertion above depends on. These two counts are a measurement of this
            // corpus at this commit, so a change in either is drift to be re-measured and explained.
            //
            // BOTH MOVED WHEN INPUT CANONICALISATION LANDED — 233 to 232 and 103 to 101 — AND BOTH
            // HAVE THE SAME SINGLE CAUSE. `Long Unbroken Side Then Extreme Acute Angle` loses one
            // exactly-collinear vertex to the stage, so it is expressed in one fewer exterior edge
            // and its event structure is genuinely different geometry rather than the same events
            // minus one. Decision 12 of the input-canonicalisation brief places exterior edge
            // counts outside the observable, so this is the pinned numbers recording a structural
            // change. Attributed per fixture before repinning: 36 of the 37 are bit-unmoved on all
            // three counts, and that one goes mutated 29 to 28 and fired 14 to 12.
            //
            // The note this replaces said only a change in what the projection reports could move
            // `fired`. That held while the corpus geometry was fixed; a fixture whose boundary is
            // re-expressed moves both counts at once, and the per-fixture attribution above is what
            // tells the two causes apart.
            expect(mutated).toBe(232);
            expect(fired).toBe(101);
        });

        it('closes Pentagon House at the terminal offset its two apex nodes share', () => {
            // This used to be the one chain in the corpus that could not be closed. Pentagon
            // House ends in a ridge whose two nodes re-derived 2.9999999999999996 and 3 — the same
            // geometric offset, one ulp apart — and in the half-open window between them the
            // graph said two bisectors were alive whose partners were already dead.
            //
            // Two things fixed it, in that order. The wiring first: the ridge joining the two
            // nodes used to run on into the roof apex behind it, because `tryAttachEdgeToNode`
            // snapped to the first node collinear with the ray rather than the nearest, and the
            // two bisectors are now cross-wired to each other so the chain has a successor. The
            // table second: the two nodes are two distinct vertex events at ONE instant, and
            // `computeNodeOffsets` now hands that instant to both of them as one identical
            // number. There is no half-open window between them left to be inside.
            const result = solvedFixture('Pentagon House');
            const maxOffset = computeMaxOffset(result);

            // Two nodes, one offset — and the offset is a member of the pair rather than an
            // average of it, so it is still exactly the number the solve produced.
            const apexOffsets = [...computeNodeOffsets(result).values()].filter(offset => offset > 0);
            expect(apexOffsets.length).toBeGreaterThan(1);
            expect(new Set(apexOffsets)).toEqual(new Set([maxOffset]));
            expect(eventOffsets(result)).toEqual([maxOffset]);

            // The nodes themselves are untouched: unifying offsets must not fuse graph nodes.
            const apexNodeIds = [...computeNodeOffsets(result).entries()]
                .filter(([, offset]) => offset > 0)
                .map(([nodeId]) => nodeId);
            expect(new Set(apexNodeIds).size).toBe(apexNodeIds.length);

            // And the run-up to that terminal instant is sound rather than merely absent.
            for (const offset of [maxOffset - NEIGHBOURHOOD, maxOffset - 1e-3, maxOffset - 1e-1]) {
                const projection = projectOffsetWavefront(result, offset);
                expect(projection.unclosedChains).toEqual([]);
                expect(projection.rings.length).toBeGreaterThan(0);
            }
        });

        it('accounts for every ring it returns and every cycle it drops', () => {
            // The three ring entry points are one computation; the wide one only keeps the account.
            const result = solvedFixture('Duck Octagon (passes)');
            for (const event of eventOffsets(result)) {
                const projection = projectOffsetWavefront(result, event);
                expect(projection.offset).toBe(event);
                expect(projection.rings.map(ring => ring.vertices.map(vertex => vertex.position)))
                    .toEqual(computeOffsetRings(result, event));
                for (const cycle of projection.degenerateCycles) {
                    expect(cycle.keptSegmentCount).toBeLessThan(3);
                    expect(cycle.segmentCount).toBeGreaterThanOrEqual(cycle.keptSegmentCount);
                }
            }
        });
    });

    describe('properties that held before the fix and still hold', () => {
        it('is clean a micrometre either side of every event', () => {
            const problems: string[] = [];
            // The last event is the maximum offset; `event + 1e-6` is past it, where an empty
            // result is the documented answer rather than a loss — hence EVENT_CLEAR_OF_MAXIMUM.
            for (const {name, result, event, delta} of eventSamples([-NEIGHBOURHOOD, NEIGHBOURHOOD], EVENT_CLEAR_OF_MAXIMUM)) {
                const rings = computeOffsetRings(result, event + delta);
                if (rings.length === 0) {
                    problems.push(`${name} @${event.toFixed(6)}${delta > 0 ? '+' : '-'}1e-6 returned no rings`);
                }
                for (const ring of rings) {
                    if (ring.length < 3) {
                        problems.push(`${name} @${event.toFixed(6)} has a ${ring.length}-vertex ring`);
                    }
                }
            }
            expect(problems.join('; ')).toBe('');
        });

        it('never returns a ring with a repeated vertex, at or around an event', () => {
            const problems: string[] = [];
            const deltas = [0, -1e-9, 1e-9, -NEIGHBOURHOOD, NEIGHBOURHOOD];
            for (const {name, result, event, delta} of eventSamples(deltas, EVERY_EVENT)) {
                for (const [index, ring] of computeOffsetRings(result, event + delta).entries()) {
                    if (hasRepeatedVertex(ring, 1e-9)) {
                        problems.push(`${name} @${event.toFixed(6)}+${delta} ring ${index} repeats a vertex`);
                    }
                }
            }
            expect(problems.join('; ')).toBe('');
        });

        it('leaves strip decomposition completely unaffected — computeStrips is not implicated', () => {
            const problems: string[] = [];
            for (const {name, result, event, delta} of eventSamples([0, -1e-9, 1e-9], EVERY_EVENT)) {
                const strips = computeStrips(result, {depth: event + delta});
                const empty = strips.filter(strip => strip.boundary.length < 3).length;
                if (empty > 0) {
                    problems.push(`${name} @${event.toFixed(6)}+${delta}: ${empty} of ${strips.length} strips are empty`);
                }
            }
            expect(problems.join('; ')).toBe('');
        });

        it('shrinks monotonically on a sampling grid that avoids events entirely', () => {
            // The grid used by offset-projection.test.ts, on the fixture that used to collapse worst.
            const result = solvedFixture('Duck Octagon (passes)');
            const maxOffset = computeMaxOffset(result);

            let previousArea = Infinity;
            for (let i = 0; i <= 24; i++) {
                const area = totalRingArea(computeOffsetRings(result, (maxOffset * i) / 25));
                expect(area).toBeLessThan(previousArea);
                previousArea = area;
            }
        });
    });
});
