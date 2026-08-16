import {
    ALL_TEST_POLYGONS,
    NEAR_REGULAR_ELLIPSE_16,
    NEAR_REGULAR_ELLIPSE_32,
    NEAR_REGULAR_PEANUT_32,
    NEAR_REGULAR_ROSETTE5_40,
} from '@proc-geo/test-fixtures';
import {
    computeMaxOffset,
    computeNodeOffsets,
    computeOffsetRings,
    computeStrips,
    dotProduct,
    projectOffsetWavefront,
    setSkeletonLogLevel,
    SkeletonSolveResult,
    solveSkeleton,
    UnclosedChain,
    UnclosedChainReason,
    Vector2,
} from '@proc-geo/core';
// Package-internal: the projection's own derivation of which bisectors are alive at an offset and
// where they sit. The diagnosis below is a claim about that exact derivation, so it has to call it
// rather than restate it — a restatement would keep passing after the real formula moved.
import {AliveBisector, collectAliveBisectors} from '../../src/straight-skeleton/offset-projection';

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

/*
 * ============================================================================
 *  THE NEAR-REGULAR LOSS IS A SIMULTANEOUS-EVENT PAIR, NOT A TERMINATED RING.
 *  MEASURED, NOT ASSUMED. THESE ASSERTIONS PIN A DIAGNOSIS.
 * ============================================================================
 *
 * WHAT THIS SECTION RECORDS
 *
 * Backlog item 4 — "terminal many-way events cannot be projected" — proposed that at the exact
 * offset of a terminal many-way event the wavefront has finished, so every bisector in the failing
 * chain dies at one node, nothing is born there, and the chain has no successor because its ring has
 * legitimately ceased to exist.
 *
 * THAT HYPOTHESIS IS REFUTED. Every clause of it fails, in every named case, and the assertions
 * below are the measurement rather than a description of it:
 *
 *   1. The chain's bisectors do NOT all die at one node. Near Regular Ellipse 16 @72.361834 walks
 *      thirteen bisectors that die at six distinct nodes.
 *   2. The node the chain runs into DOES have a bisector born at it — in every case, without
 *      exception. Nothing has ceased to exist there.
 *   3. That node is NOT terminal. Near Regular Rosette5 40 fails at 37.456461 of a maximum 88.670259,
 *      and the whole ring is present and sound a nanometre either side of the failure.
 *
 * WHAT IS ACTUALLY HAPPENING
 *
 * These fixtures are symmetric, so they produce *simultaneous mirror events*: two or more events at
 * genuinely different places in the plane which happen at the same offset. `computeNodeOffsets`
 * re-derives each node's offset from the supporting line of one of its own parent edges, and mirror
 * nodes have different parent edges, so the same instant comes back as offsets 7e-15 to 3.5e-13
 * apart. They are one event in the wavefront and several distinct numbers in the table.
 *
 * Query at the LOWER of such a pair and the pair of bisectors meeting at the HIGHER node is still
 * alive by the table while having already met in the plane. Their span along the exterior edge they
 * share therefore comes out with length zero or slightly negative. `segmentsAlongExteriorEdge` drops
 * both of its endpoints — an inverted span sorts close-before-open and the close finds no pending
 * start, and an exactly-zero-length span hits the deliberate close-before-open tie-break to the same
 * effect. The chain that ran through that bisector has nothing to continue to, and the ring is lost.
 *
 * The signature is unambiguous: the failure is always at the lower member of an ULP-separated pair,
 * and the higher member always projects cleanly.
 *
 * ONE BREAK IS REPORTED TWICE
 *
 * A broken loop yields two `UnclosedChain`s, not one, and only the first of them is about the
 * defect. `assembleRings` seeds a walk at every unvisited segment: the walk that reaches the dropped
 * span stops with `no-successor`, and a later seed picks up the rest of the same loop and walks
 * forward into the segment that first walk started from — already visited, so it stops with
 * `rejoined-mid-chain`. The two are one ring. That is asserted rather than asserted-in-prose: every
 * rejoined chain's last bisector is the FIRST bisector of a `no-successor` chain at the same offset,
 * which is precisely the seed the earlier walk began at. So the mechanism below is measured on the
 * `no-successor` population — the half that carries a terminal bisector to interrogate — and the
 * other half is tied back to it by that linkage.
 *
 * The module header of `offset-projection.ts` states that two live bisectors bounding a zero-length
 * span cannot occur. On these fixtures it does occur, and that is the defect. Fixing it is NOT the
 * change proposed by item 4 — a "terminated chain" predicate would be answering a question none of
 * these cases asks.
 *
 * WHY THESE TESTS ASSERT THE PRESENT, BROKEN BEHAVIOUR
 *
 * They pin a diagnosis so it cannot rot, in the same spirit as `reflex-subdivision.test.ts` pinning
 * its failing set. A change in either direction is a real finding: if the counts below move, the
 * mechanism has moved with them and this comment needs re-measuring, not adjusting.
 *
 * The near-regular fixtures are imported individually and stay OUT of `ALL_TEST_POLYGONS` and out of
 * `SWEPT_FIXTURES` above. Nothing here promotes them.
 */

/** A fixture that is exported individually and deliberately kept out of `ALL_TEST_POLYGONS`. */
export interface HeldOutFixture {
    name: string;
    vertices: Vector2[];
}

/** One run of wavefront the projection could not close, with everything needed to explain it. */
export interface LostRingCase {
    fixtureName: string;
    result: SkeletonSolveResult;
    /** The event offset that was queried. */
    offset: number;
    chain: UnclosedChain;
}

/**
 * The span the projection failed to build: the opening endpoint of the chain's terminal bisector and
 * the closing endpoint that should have paired with it, measured along their shared exterior edge.
 */
export interface FailedSpan {
    exteriorEdgeId: number;
    openBisectorId: number;
    closeBisectorId: number;
    /** Signed length along the edge basis — the close's coordinate minus the open's. */
    length: number;
}

const NEAR_REGULAR_FIXTURES: HeldOutFixture[] = [
    {name: 'Near Regular Ellipse 16', vertices: NEAR_REGULAR_ELLIPSE_16},
    {name: 'Near Regular Ellipse 32', vertices: NEAR_REGULAR_ELLIPSE_32},
    {name: 'Near Regular Rosette5 40', vertices: NEAR_REGULAR_ROSETTE5_40},
    {name: 'Near Regular Peanut 32', vertices: NEAR_REGULAR_PEANUT_32},
];

/**
 * The unclosed-chain count per fixture, measured rather than inherited.
 *
 * Item 4 recorded a different set and the decision spec a third; both are superseded by this one,
 * taken at this commit. These are counts of (event offset, chain) pairs over every event offset of
 * the fixture.
 */
const LOST_RINGS_PER_FIXTURE: Record<string, number> = {
    'Near Regular Ellipse 16': 4,
    'Near Regular Ellipse 32': 6,
    'Near Regular Rosette5 40': 19,
    'Near Regular Peanut 32': 7,
};

/**
 * The same losses split by how the walk failed, rather than by fixture.
 *
 * Both halves are pinned because they are one mechanism reported twice: the walk that dies is a
 * `no-successor`, and the remainder of the very same loop, walked from a different seed, arrives
 * back at that dead walk's first segment and is reported as a `rejoined-mid-chain`. The linkage is
 * asserted below; these counts stop either population drifting unnoticed behind it.
 */
const LOST_RINGS_PER_REASON: Record<UnclosedChainReason, number> = {
    'no-successor': 23,
    'rejoined-mid-chain': 13,
};

/** How far apart two re-derived offsets of one simultaneous event may be. Femtometres, not slack. */
const SIMULTANEITY_BAND = 1e-12;

const NEAR_REGULAR_SOLVES = new Map<string, SkeletonSolveResult>();

function solvedHeldOutFixture(fixture: HeldOutFixture): SkeletonSolveResult {
    const cached = NEAR_REGULAR_SOLVES.get(fixture.name);
    if (cached !== undefined) {
        return cached;
    }
    const result = solveSkeleton(fixture.vertices);
    if (!result.complete || result.context === null) {
        throw new Error(`Fixture "${fixture.name}" no longer solves; this section assumes it does.`);
    }
    NEAR_REGULAR_SOLVES.set(fixture.name, result);
    return result;
}

/** Every chain the projection failed to close, over every event offset of every near-regular fixture. */
function lostRingCases(): LostRingCase[] {
    const cases: LostRingCase[] = [];
    for (const fixture of NEAR_REGULAR_FIXTURES) {
        const result = solvedHeldOutFixture(fixture);
        for (const offset of eventOffsets(result)) {
            for (const chain of projectOffsetWavefront(result, offset).unclosedChains) {
                cases.push({fixtureName: fixture.name, result, offset, chain});
            }
        }
    }
    return cases;
}

/**
 * The losses whose walk simply ran out of successor — the primary failure.
 *
 * The `rejoined-mid-chain` losses are the *other* half of the same broken loop and carry no
 * terminal bisector of their own to interrogate, so every test that reasons about the bisector a
 * walk died on starts here. That they share the root cause is asserted separately, by linkage,
 * rather than assumed.
 */
function noSuccessorLosses(): LostRingCase[] {
    return lostRingCases().filter(lost => lost.chain.reason === 'no-successor');
}

/** The losses whose walk forked back into ground an earlier walk had already covered. */
function rejoinedLosses(): LostRingCase[] {
    return lostRingCases().filter(lost => lost.chain.reason === 'rejoined-mid-chain');
}

/** The bisector the walk ran out of road on: the last id in the chain. */
function terminalBisectorOf(chain: UnclosedChain): number {
    return chain.bisectorIds[chain.bisectorIds.length - 1];
}

/**
 * The span that should have continued the chain and did not.
 *
 * The chain's terminal bisector opens a span on its clockwise parent edge; the live bisector naming
 * that same edge as its widdershins parent closes it. Returns null if no live bisector closes there
 * at all, which would be a different failure from the one measured here.
 */
function failedSpanOf(lost: LostRingCase): FailedSpan | null {
    const {result, offset} = lost;
    const {graph} = result;
    const alive: AliveBisector[] = collectAliveBisectors(result, computeNodeOffsets(result), offset);

    const openBisectorId = terminalBisectorOf(lost.chain);
    const opener = alive.find(candidate => candidate.id === openBisectorId);
    if (opener === undefined) {
        // The walk reached this bisector at this offset, so the projection called it alive; if the
        // same call now says otherwise, the diagnosis below is measuring a different mechanism.
        throw new Error(
            `${lost.fixtureName} @${offset}: b${openBisectorId} terminates a walked chain but is not alive.`);
    }
    const exteriorEdgeId = opener.clockwiseParentId;

    const closer = alive.find(candidate => candidate.widdershinsParentId === exteriorEdgeId);
    if (closer === undefined) {
        return null;
    }

    const exteriorEdge = graph.edges[exteriorEdgeId];
    const edgeSource = graph.nodes[exteriorEdge.source].position;
    const alongEdge = (point: Vector2): number =>
        dotProduct({x: point.x - edgeSource.x, y: point.y - edgeSource.y}, exteriorEdge.basisVector);

    return {
        exteriorEdgeId,
        openBisectorId,
        closeBisectorId: closer.id,
        length: alongEdge(closer.position) - alongEdge(opener.position),
    };
}

/** Node ids whose re-derived offset is exactly `offset`. */
function nodesAtExactly(nodeOffsets: Map<number, number>, offset: number): number[] {
    return [...nodeOffsets.entries()].filter(([, value]) => value === offset).map(([nodeId]) => nodeId);
}

function bisectorsBornAt(result: SkeletonSolveResult, nodeId: number): number[] {
    return result.graph.interiorEdges
        .filter(interiorEdge => result.graph.edges[interiorEdge.id]?.source === nodeId)
        .map(interiorEdge => interiorEdge.id);
}

describe('the near-regular ring loss, diagnosed', () => {
    describe('the loss itself', () => {
        it('is still present, in the numbers this comment was written against', () => {
            const counts: Record<string, number> = {};
            for (const fixture of NEAR_REGULAR_FIXTURES) {
                counts[fixture.name] = 0;
            }
            for (const lost of lostRingCases()) {
                counts[lost.fixtureName] += 1;
            }
            // A move in EITHER direction is a finding: the diagnosis above was measured against
            // these counts and has to be re-measured if they change.
            expect(counts).toEqual(LOST_RINGS_PER_FIXTURE);
        });

        it('reports every loss as one of exactly two chain reasons, in known proportion', () => {
            const counts: Record<string, number> = {'no-successor': 0, 'rejoined-mid-chain': 0};
            for (const lost of lostRingCases()) {
                // A reason outside the two seeded keys adds a third one and fails the comparison,
                // so this is also the assertion that no unaccounted-for reason has appeared.
                counts[lost.chain.reason] = (counts[lost.chain.reason] ?? 0) + 1;
            }
            expect(counts).toEqual(LOST_RINGS_PER_REASON);
        });

        it('accounts for the rejoined chains as the far side of a broken chain, not a second defect', () => {
            const problems: string[] = [];
            for (const rejoined of rejoinedLosses()) {
                const rejoinTarget = terminalBisectorOf(rejoined.chain);
                const where = `${rejoined.fixtureName} @${rejoined.offset.toFixed(6)}`;

                // The walk stopped because `indexByStartBisector` sent it to a segment already
                // visited. If the loop it rejoined is the one a `no-successor` walk broke, that
                // segment is the seed that walk started from — its chain's FIRST bisector.
                const broken = noSuccessorLosses().filter(lost =>
                    lost.fixtureName === rejoined.fixtureName
                    && lost.offset === rejoined.offset
                    && lost.chain.bisectorIds[0] === rejoinTarget);
                if (broken.length === 0) {
                    problems.push(
                        `${where}: rejoins at b${rejoinTarget}, which seeds no broken chain at this offset`);
                }
            }
            expect(problems.join('; ')).toBe('');
            expect(rejoinedLosses().length).toBe(LOST_RINGS_PER_REASON['rejoined-mid-chain']);
        });
    });

    describe('every clause of the terminal-event hypothesis fails', () => {
        it('runs into a node that has a bisector born at it', () => {
            const problems: string[] = [];
            for (const lost of noSuccessorLosses()) {
                const deathNode = lost.result.graph.edges[terminalBisectorOf(lost.chain)].target!;
                const born = bisectorsBornAt(lost.result, deathNode);
                if (born.length === 0) {
                    problems.push(`${lost.fixtureName} @${lost.offset.toFixed(6)}: nothing born at n${deathNode}`);
                }
            }
            expect(problems.join('; ')).toBe('');
        });

        it('runs into a node that is not terminal, and is not even the last event of its fixture', () => {
            const problems: string[] = [];
            for (const lost of noSuccessorLosses()) {
                const nodeOffsets = computeNodeOffsets(lost.result);
                const maxOffset = computeMaxOffset(lost.result);
                const deathNode = lost.result.graph.edges[terminalBisectorOf(lost.chain)].target!;
                const deathOffset = nodeOffsets.get(deathNode)!;
                if (!(deathOffset < maxOffset)) {
                    problems.push(
                        `${lost.fixtureName} @${lost.offset.toFixed(6)}: n${deathNode} is at the maximum offset`);
                }
            }
            expect(problems.join('; ')).toBe('');
        });

        it('walks bisectors that die at several different nodes, not at one', () => {
            const spreads = lostRingCases()
                .filter(lost => lost.chain.bisectorIds.length > 3)
                .map(lost => new Set(
                    lost.chain.bisectorIds.map(id => lost.result.graph.edges[id]?.target)).size);
            expect(spreads.length).toBeGreaterThan(0);
            expect(Math.min(...spreads)).toBeGreaterThan(1);
        });

        it('leaves the ring intact, and the projection sound, a nanometre either side', () => {
            const problems: string[] = [];
            for (const lost of lostRingCases()) {
                for (const delta of [-1e-9, 1e-9]) {
                    const projection = projectOffsetWavefront(lost.result, lost.offset + delta);
                    if (projection.unclosedChains.length > 0 || projection.rings.length === 0) {
                        problems.push(
                            `${lost.fixtureName} @${lost.offset.toFixed(6)}${delta > 0 ? '+' : ''}${delta}: `
                            + `${projection.rings.length} rings, ${projection.unclosedChains.length} chains`);
                    }
                }
            }
            expect(problems.join('; ')).toBe('');
        });
    });

    describe('what is actually happening', () => {
        it('queries the lower member of a pair of re-derived offsets for one simultaneous event', () => {
            const problems: string[] = [];
            for (const lost of noSuccessorLosses()) {
                const nodeOffsets = computeNodeOffsets(lost.result);
                const deathNode = lost.result.graph.edges[terminalBisectorOf(lost.chain)].target!;
                const deathOffset = nodeOffsets.get(deathNode)!;
                const gap = deathOffset - lost.offset;
                const where = `${lost.fixtureName} @${lost.offset.toFixed(6)}`;

                // The terminal bisector is still alive: its death is in the future, by femtometres.
                if (!(gap > 0)) {
                    problems.push(`${where}: n${deathNode} is not later than the query (gap ${gap})`);
                } else if (gap > SIMULTANEITY_BAND) {
                    problems.push(`${where}: n${deathNode} is ${gap.toExponential(3)} later, not one event`);
                }

                // And the query offset is some *other* node's reading of the same instant.
                const twins = nodesAtExactly(nodeOffsets, lost.offset).filter(nodeId => nodeId !== deathNode);
                if (twins.length === 0) {
                    problems.push(`${where}: no other node reads this offset`);
                }
            }
            expect(problems.join('; ')).toBe('');
        });

        it('pairs nodes that are the same instant at genuinely different places', () => {
            const problems: string[] = [];
            for (const lost of noSuccessorLosses()) {
                const nodeOffsets = computeNodeOffsets(lost.result);
                const deathNode = lost.result.graph.edges[terminalBisectorOf(lost.chain)].target!;
                const deathPosition = lost.result.graph.nodes[deathNode].position;
                for (const twin of nodesAtExactly(nodeOffsets, lost.offset)) {
                    const twinPosition = lost.result.graph.nodes[twin].position;
                    const separation = Math.hypot(
                        twinPosition.x - deathPosition.x, twinPosition.y - deathPosition.y);
                    if (separation < 1) {
                        problems.push(
                            `${lost.fixtureName} @${lost.offset.toFixed(6)}: n${twin} and n${deathNode} are `
                            + `${separation} apart — a coincident cluster, not a mirror pair`);
                    }
                }
            }
            expect(problems.join('; ')).toBe('');
        });

        it('drops a span of non-positive length between two bisectors the table still calls alive', () => {
            const problems: string[] = [];
            let measured = 0;
            for (const lost of noSuccessorLosses()) {
                const span = failedSpanOf(lost);
                const where = `${lost.fixtureName} @${lost.offset.toFixed(6)}`;
                if (span === null) {
                    problems.push(`${where}: no live bisector closes on the terminal bisector's parent edge`);
                    continue;
                }
                measured += 1;
                // Zero or inverted, and never more than a femtometre of either: the two bisectors have
                // met, which the module header asserts cannot happen while both are alive.
                if (span.length > 0) {
                    problems.push(
                        `${where}: span b${span.openBisectorId}->b${span.closeBisectorId} on `
                        + `e${span.exteriorEdgeId} has positive length ${span.length.toExponential(3)}`);
                } else if (span.length < -SIMULTANEITY_BAND) {
                    problems.push(`${where}: span is ${span.length.toExponential(3)}, too long to be one event`);
                }
            }
            expect(problems.join('; ')).toBe('');
            expect(measured).toBeGreaterThan(0);
        });
    });

    describe('the peanut lobes finish together, so no lobe is ever alone', () => {
        const peanut = NEAR_REGULAR_FIXTURES.find(fixture => fixture.name === 'Near Regular Peanut 32')!;

        it('carries two rings of equal area right up to a single shared maximum offset', () => {
            const result = solvedHeldOutFixture(peanut);
            const maxOffset = computeMaxOffset(result);

            // Sampled past the neck pinch, where the wavefront is two lobes rather than one ring.
            for (const offset of [maxOffset - 1e0, maxOffset - 1e-1, maxOffset - 1e-3]) {
                const rings = computeOffsetRings(result, offset);
                expect(rings).toHaveLength(2);
                expect(Math.abs(signedRingArea(rings[0]))).toBeCloseTo(Math.abs(signedRingArea(rings[1])), 9);
            }
            expect(computeOffsetRings(result, maxOffset)).toEqual([]);
        });

        it('loses one of the two mirror rings at the lower offset of each pair, and neither at the higher', () => {
            const result = solvedHeldOutFixture(peanut);
            const offsets = eventOffsets(result);
            const problems: string[] = [];

            for (const [index, offset] of offsets.entries()) {
                const projection = projectOffsetWavefront(result, offset);
                if (projection.unclosedChains.length === 0) {
                    continue;
                }
                const twin = offsets[index + 1];
                if (twin === undefined || twin - offset > SIMULTANEITY_BAND) {
                    problems.push(`@${offset.toFixed(6)}: no simultaneous twin above it`);
                    continue;
                }
                const atTwin = computeOffsetRings(result, twin);
                if (projection.rings.length !== 1 || atTwin.length !== 2) {
                    problems.push(
                        `@${offset.toFixed(6)}: ${projection.rings.length} rings here, ${atTwin.length} at the twin`);
                    continue;
                }
                // The ring that survived is one of the twin's two, unchanged: exactly one was lost.
                const survivor = Math.abs(signedRingArea(projection.rings[0].vertices.map(vertex => vertex.position)));
                for (const ring of atTwin) {
                    if (Math.abs(Math.abs(signedRingArea(ring)) - survivor) > 1e-9) {
                        problems.push(`@${offset.toFixed(6)}: surviving ring area ${survivor} is not the twin's`);
                    }
                }
            }
            expect(problems.join('; ')).toBe('');
        });
    });
});
