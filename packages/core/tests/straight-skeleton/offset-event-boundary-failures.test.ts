import {ALL_TEST_POLYGONS} from '@proc-geo/test-fixtures';
import {
    computeMaxOffset,
    computeNodeOffsets,
    computeOffsetRings,
    computeStrips,
    setSkeletonLogLevel,
    SkeletonSolveResult,
    solveSkeleton,
    Vector2,
} from '@proc-geo/core';

/*
 * ============================================================================
 *  THIS FILE RECORDS A KNOWN DEFECT. THE FAILURES BELOW ARE NOT DESIRED
 *  BEHAVIOUR AND THESE ASSERTIONS ARE NOT A SPECIFICATION.
 * ============================================================================
 *
 * `computeOffsetRings` silently returns a fraction of the wavefront — sometimes none of it —
 * when the requested offset lands on, or within one nanometre below, an event offset.
 *
 * This is NOT the near-regular solver defect recorded in `near-regular-failures.test.ts`.
 * Every fixture used here solves completely, with no diagnostics, at ordinary screen-space
 * coordinates. The solver is fine; the projection is not.
 *
 * ----------------------------------------------------------------------------
 * WHY NOTHING CAUGHT THIS BEFORE
 * ----------------------------------------------------------------------------
 *
 * `offset-projection.test.ts` samples at 5 / 25 / 50 / 75 % of the maximum offset, and at
 * `(max * i) / (samples + 1)`. Neither ever lands on an event, because events sit at the
 * offsets of interior skeleton nodes and those are not rational fractions of the maximum.
 * The existing property assertions are all true; they are simply never evaluated at the one
 * class of offset where the half-open `[birth, death)` lifetime logic has to make a decision.
 *
 * ----------------------------------------------------------------------------
 * MEASURED — every distinct interior-node offset of all 37 ALL_TEST_POLYGONS fixtures
 * (271 events), sampled at the event and at +/- 1e-9 and +/- 1e-6
 * ----------------------------------------------------------------------------
 *
 *   sample point        outcome
 *   event - 1e-6        clean
 *   event - 1e-9        68 events return zero rings
 *   event  (exact)       1 event returns zero rings; 32 events lose most of the ring area
 *   event + 1e-9        clean
 *   event + 1e-6        clean
 *
 * The asymmetry is the tell. `collectAliveBisectors` keeps a bisector when
 *
 *     offset >= birth - LIFETIME_TOLERANCE  &&  offset < death - LIFETIME_TOLERANCE
 *
 * which is the interval `[birth - 1e-9, death - 1e-9)` — the documented `[birth, death)`
 * shifted one nanometre earlier, not dilated by a tolerance. A bisector is therefore already
 * dead for the whole nanometre before it actually dies. Nothing is wrong with a shifted
 * interval on its own, but `birth` is derived from `sourceOffsetDistance` while `death` is
 * derived from `computeNodeOffsets`' perpendicular distance, and the two disagree in the last
 * bits. Where they disagree, the hand-over at an event drops a bisector that nothing replaces.
 *
 * ----------------------------------------------------------------------------
 * WHY IT MATTERS RATHER THAN BEING A CURIOSITY
 * ----------------------------------------------------------------------------
 *
 * The loss is silent. A dropped bisector breaks the chain of wavefront segments, and
 * `assembleRings` discards any chain that does not close, without a diagnostic. A parcel
 * generator asking for the wavefront at an event offset — which is exactly what a caller
 * walking the skeleton event by event would ask for — reads the empty result as "no lots
 * here" rather than as an error.
 *
 * Measured on random polygons (400 generated across four parameter sets): at 60 evenly
 * spaced generic offsets per polygon, ZERO area dropouts. At the 2979 event offsets of the
 * same polygons, dropouts throughout, several losing over 99% of the wavefront area:
 *
 *     seed  9 @29.479693:  16657.236 ->     49.102 ->  16657.234
 *     seed 15 @21.360261: 1265251.565 ->  30763.088 -> 1265251.548
 *     seed 11 @49.609532:  19987.707 ->   2569.675 ->  19987.705
 *
 * So the ring-assembly omission fragility is real and it fires on ordinary inputs. It just
 * needs the offset to be an event offset.
 *
 * WHEN THE DEFECT IS FIXED, INVERT THESE ASSERTIONS — DO NOT DELETE THIS FILE.
 * The `describe` block "properties that do hold" is a genuine specification and should be
 * kept as-is; the two "known defect" blocks should become assertions that the ring set at an
 * event offset matches the ring set just either side of it.
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
    const interior = [...computeNodeOffsets(result).values()].filter(offset => offset > 0 && offset < maxOffset);
    return [...new Set(interior)].sort((a, b) => a - b);
}

/** Events at which the ring area collapses below both neighbours — a wavefront that vanished. */
function collapsingEvents(result: SkeletonSolveResult, retainedFraction: number): number[] {
    return eventOffsets(result).filter(event => {
        const at = totalRingArea(computeOffsetRings(result, event));
        const before = totalRingArea(computeOffsetRings(result, event - NEIGHBOURHOOD));
        const after = totalRingArea(computeOffsetRings(result, event + NEIGHBOURHOOD));
        return at < Math.min(before, after) * retainedFraction;
    });
}

const SWEPT_FIXTURES = ALL_TEST_POLYGONS
    .filter(polygon => {
        const result = solveSkeleton(polygon.vertices);
        return result.complete && result.context !== null;
    })
    .map(polygon => polygon.name);

describe('offset projection at event boundaries', () => {
    describe('properties that do hold', () => {
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
    });

    describe('the wavefront vanishes one nanometre before an event (known defect)', () => {
        it('currently returns no rings at all just below the final event of a square', () => {
            const result = solvedFixture('Square');
            const maxOffset = computeMaxOffset(result);

            // A square of side 2 offset to 1 - 1e-9 is a square of side 2e-9. It exists.
            expect(computeOffsetRings(result, maxOffset - 1e-6)).toHaveLength(1);
            expect(computeOffsetRings(result, maxOffset - 1e-9)).toEqual([]);
        });

        it('currently loses the whole wavefront just below a mid-solve event too', () => {
            const result = solvedFixture('Awkward Heptagon');
            const events = eventOffsets(result);
            const maxOffset = computeMaxOffset(result);

            const vanishing = events.filter(event =>
                event < maxOffset * 0.95 && computeOffsetRings(result, event - 1e-9).length === 0);

            // Measured: at least one event well short of the maximum offset loses everything.
            expect(vanishing.length).toBeGreaterThanOrEqual(1);
            // ...and the wavefront is plainly still there a micrometre earlier.
            expect(computeOffsetRings(result, vanishing[0] - NEIGHBOURHOOD).length).toBeGreaterThanOrEqual(1);
        });

        it('currently affects most of the fixture corpus, not one shape', () => {
            const affected = SWEPT_FIXTURES.filter(name => {
                const result = solvedFixture(name);
                return eventOffsets(result).some(event => computeOffsetRings(result, event - 1e-9).length === 0)
                    || computeOffsetRings(result, computeMaxOffset(result) - 1e-9).length === 0;
            });

            // Measured: 68 of the 271 swept events lose everything, spread across the corpus.
            expect(affected.length).toBeGreaterThanOrEqual(20);
        });
    });

    describe('the wavefront collapses at an event offset (known defect)', () => {
        it('currently loses almost the entire ring area at one event of the duck octagon', () => {
            const result = solvedFixture('Duck Octagon (passes)');
            const collapsed = collapsingEvents(result, 0.5);

            expect(collapsed.length).toBeGreaterThanOrEqual(1);

            // Measured: 11731.36 just before, 0.35 at the event, 11731.35 just after.
            const worst = collapsed[0];
            const at = totalRingArea(computeOffsetRings(result, worst));
            const before = totalRingArea(computeOffsetRings(result, worst - NEIGHBOURHOOD));
            expect(at).toBeLessThan(before * 0.01);
            expect(before).toBeGreaterThan(1000);
        });

        it('currently loses almost the entire ring area at one event of the moorhen', () => {
            const result = solvedFixture('Moorhen (passes)');
            const collapsed = collapsingEvents(result, 0.01);

            // Measured: 12102.84 just before, 0.026 at the event, 12102.83 just after.
            expect(collapsed.length).toBeGreaterThanOrEqual(1);
        });

        it('currently breaks monotone area at events across many fixtures', () => {
            const affected = SWEPT_FIXTURES.filter(name => collapsingEvents(solvedFixture(name), 0.999).length > 0);

            // Measured: 32 of the 271 swept events are non-monotone, over 17 of the 37 fixtures.
            // The bound is loose because a marginal event can fall either side of the threshold.
            expect(affected.length).toBeGreaterThanOrEqual(10);
        });

        it('is invisible to a sampler that avoids events — which is why it went unnoticed', () => {
            // The sampling grid used by offset-projection.test.ts, on a fixture that collapses badly.
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
