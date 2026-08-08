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
 * below asserts that it never has anything to report.
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

/** How close to the maximum offset a ring stops having distinguishable vertices. */
const TERMINAL_BAND = 1e-6;

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

/** Shoelace with the first vertex subtracted, so the value does not depend on where the ring sits. */
function signedRingArea(ring: Vector2[]): number {
    const origin = ring[0];
    let total = 0;
    for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        total += (a.x - origin.x) * (b.y - origin.y) - (b.x - origin.x) * (a.y - origin.y);
    }
    return total / 2;
}

function totalRingArea(rings: Vector2[][]): number {
    return rings.reduce((sum, ring) => sum + Math.abs(signedRingArea(ring)), 0);
}

/** The distinct offsets at which the wavefront has an event: the interior nodes' own offsets. */
function eventOffsets(result: SkeletonSolveResult): number[] {
    const maxOffset = computeMaxOffset(result);
    const interior = [...computeNodeOffsets(result).values()].filter(offset => offset > 0 && offset <= maxOffset);
    return [...new Set(interior)].sort((a, b) => a - b);
}

/**
 * Is the ring area at an event ordered between the areas a micrometre either side of it?
 *
 * The wavefront only ever shrinks, so the three readings must come out in that order. An event that
 * loses ring area comes out below both neighbours and fails; one that gains comes out above both.
 * The slack covers the genuine micrometre of shrinkage between the samples, nothing more.
 */
function isContinuous(before: number, at: number, after: number): boolean {
    const slack = Math.max(1e-9, before * 1e-6);
    return at <= before + slack && at >= after - slack;
}

const SWEPT_FIXTURES = ALL_TEST_POLYGONS
    .filter(polygon => {
        const result = solveSkeleton(polygon.vertices);
        return result.complete && result.context !== null;
    })
    .map(polygon => polygon.name);

describe('offset projection at event boundaries', () => {
    describe('the corpus this sweeps', () => {
        it('is every fixture, and 271 distinct event offsets across them', () => {
            expect(SWEPT_FIXTURES).toHaveLength(ALL_TEST_POLYGONS.length);

            const events = SWEPT_FIXTURES.reduce(
                (total, name) => total + eventOffsets(solvedFixture(name)).length, 0);
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
            for (const name of SWEPT_FIXTURES) {
                const result = solvedFixture(name);
                const maxOffset = computeMaxOffset(result);
                for (const event of eventOffsets(result).filter(e => maxOffset - e > TERMINAL_BAND)) {
                    for (const delta of [-1e-9, 0, 1e-9]) {
                        if (computeOffsetRings(result, event + delta).length === 0) {
                            problems.push(`${name} @${event.toFixed(6)}${delta >= 0 ? '+' : ''}${delta}: no rings`);
                        }
                    }
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
            for (const name of SWEPT_FIXTURES) {
                const result = solvedFixture(name);
                const maxOffset = computeMaxOffset(result);
                for (const event of eventOffsets(result).filter(e => maxOffset - e > TERMINAL_BAND)) {
                    for (const delta of [0, -1e-9, 1e-9, -NEIGHBOURHOOD, NEIGHBOURHOOD]) {
                        const offset = Math.max(0, event + delta);
                        const projection = projectOffsetWavefront(result, offset);
                        for (const chain of projection.unclosedChains) {
                            problems.push(
                                `${name} @${event.toFixed(6)}${delta >= 0 ? '+' : ''}${delta}: `
                                + `${chain.reason} over bisectors ${chain.bisectorIds.join('>')}`);
                        }
                    }
                }
            }
            expect(problems.join('; ')).toBe('');
        });

        it('closes Pentagon House at the terminal offset its two apex nodes share', () => {
            // This used to be the one chain in the corpus that could not be closed. Pentagon
            // House ends in a ridge whose two nodes sit at 2.9999999999999996 and 3 — the same
            // geometric offset, one ulp apart — and in the half-open window between them the
            // graph said two bisectors were alive whose partners were already dead.
            //
            // The two nodes are still one ulp apart, and that part was never wrong: they are two
            // distinct vertex events that both happen at offset 3. What changed is the wiring
            // between them. The ridge joining them used to run on into the roof apex behind it,
            // because `tryAttachEdgeToNode` snapped to the first node collinear with the ray
            // rather than the nearest. The two bisectors are now cross-wired to each other, the
            // chain has a successor, and the projection closes.
            const result = solvedFixture('Pentagon House');
            const maxOffset = computeMaxOffset(result);
            const event = eventOffsets(result).find(offset => offset < maxOffset)!;
            expect(maxOffset - event).toBeLessThan(1e-15);

            const projection = projectOffsetWavefront(result, event);
            expect(projection.unclosedChains).toEqual([]);

            // A micrometre either side of it the projection is sound too.
            for (const delta of [-NEIGHBOURHOOD, NEIGHBOURHOOD]) {
                expect(projectOffsetWavefront(result, event + delta).unclosedChains).toEqual([]);
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
            for (const name of SWEPT_FIXTURES) {
                const result = solvedFixture(name);
                // The last event is the maximum offset; `event + 1e-6` is past it, where an
                // empty result is the documented answer rather than a loss.
                const maxOffset = computeMaxOffset(result);
                for (const event of eventOffsets(result).filter(e => e + NEIGHBOURHOOD < maxOffset)) {
                    for (const delta of [-NEIGHBOURHOOD, NEIGHBOURHOOD]) {
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
                }
            }
            expect(problems.join('; ')).toBe('');
        });

        it('never returns a ring with a repeated vertex, at or around an event', () => {
            const problems: string[] = [];
            for (const name of SWEPT_FIXTURES) {
                const result = solvedFixture(name);
                for (const event of eventOffsets(result)) {
                    for (const delta of [0, -1e-9, 1e-9, -NEIGHBOURHOOD, NEIGHBOURHOOD]) {
                        for (const ring of computeOffsetRings(result, event + delta)) {
                            for (let i = 0; i < ring.length; i++) {
                                for (let j = i + 1; j < ring.length; j++) {
                                    if (Math.hypot(ring[i].x - ring[j].x, ring[i].y - ring[j].y) < 1e-9) {
                                        problems.push(`${name} @${event.toFixed(6)}+${delta} repeats a vertex`);
                                    }
                                }
                            }
                        }
                    }
                }
            }
            expect(problems.join('; ')).toBe('');
        });

        it('leaves strip decomposition completely unaffected — computeStrips is not implicated', () => {
            const problems: string[] = [];
            for (const name of SWEPT_FIXTURES) {
                const result = solvedFixture(name);
                for (const event of eventOffsets(result)) {
                    for (const delta of [0, -1e-9, 1e-9]) {
                        const strips = computeStrips(result, {depth: event + delta});
                        const empty = strips.filter(strip => strip.boundary.length < 3).length;
                        if (empty > 0) {
                            problems.push(`${name} @${event.toFixed(6)}+${delta}: ${empty} of ${strips.length} strips are empty`);
                        }
                    }
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
