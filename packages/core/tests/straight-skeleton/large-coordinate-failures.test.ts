import {ALL_TEST_POLYGONS} from '@proc-geo/test-fixtures';
import {
    computeMaxOffset,
    computeOffsetRings,
    computeStrips,
    isClockwise,
    setSkeletonLogLevel,
    signedArea,
    solveSkeleton,
    Vector2,
} from '@proc-geo/core';
import {place} from './placement-helpers';

/*
 * ============================================================================
 *  EVERY BLOCK IN THIS FILE IS NOW A SPECIFICATION. THE LAST ONE USED TO
 *  RECORD A KNOWN DEFECT; UNIT-EXTENT NORMALISATION CLOSED IT AND ITS
 *  ASSERTIONS ARE INVERTED ACCORDINGLY.
 * ============================================================================
 *
 * How far from the origin, and at what size, the solver and its projections stop working.
 *
 * The fixture corpus is entirely screen-space: 10^2 to 10^3 units, near the origin. The
 * eventual consumer works in world-space centimetres, where a 300 m region is 30 000 units
 * across and may sit 10^5 to 10^6 from the origin. This file measures that envelope.
 *
 * ----------------------------------------------------------------------------
 * THE SHOELACE DEFECT — FIXED
 * ----------------------------------------------------------------------------
 *
 * `signedArea` used to sum `a.x * b.y - b.x * a.y` over ABSOLUTE coordinates, in both
 * `strip-decomposition.ts` and `random-polygon/geometry-helpers.ts`. Each term is then of
 * order D^2 for a polygon at distance D, so the sum carried an absolute error of about
 * `D^2 * 2^-52` while the answer itself is only the true area A. The sign was lost once
 * `D > sqrt(A) * 6.7e7`:
 *
 *     a unit-square strip tile, A ~= 0.75   ->  D ~= 5.8e7    (observed: failed at 1e8)
 *     a 550-span fixture's strip, A ~= 1e4  ->  D ~= 6.7e9    (observed: failed at 1e10)
 *
 * Both implementations now subtract the ring's own first vertex before summing. The shoelace
 * is invariant under translation, so the result is mathematically identical — but the
 * intermediate products no longer carry the D^2 term, and the computation is numerically
 * translation-invariant as well.
 *
 * ----------------------------------------------------------------------------
 * MEASURED — all 37 ALL_TEST_POLYGONS fixtures, solve + offset rings at 50% of max
 * + strips at depth 50% of max. Cell shows how many of the 37 came through all three.
 * ----------------------------------------------------------------------------
 *
 * Translation only (fixtures keep their native 10^2-10^3 span). `shoelace` is the shoelace fix
 * alone; `normalised` adds unit-extent normalisation on top of it:
 *
 *     translate      0    1e3    1e4    1e5    1e6    1e7    1e8    1e9   1e10   1e11
 *     original      37     37     37     37     37     37     33     33      0      0
 *     shoelace      37     37     37     37     37     37     35     37     29     29
 *     normalised    37     37     37     37     37     37     37     37     37     37
 *
 * Scale only (span stretched, still centred on the origin). The shoelace fix left this sweep
 * UNCHANGED, and correctly so: at scale S about the origin, D ~= S * span while sqrt(A) ~=
 * S * span, so the shoelace has the same relative headroom at every scale. What limited it was
 * the other numerical problem entirely — an absolute `1e-8` degeneracy tolerance measured
 * against coordinates that grow — and normalisation is what removes that:
 *
 *     scale       1e-6   1e-4   1e-2      1    1e2    1e4    1e6    1e8
 *     original      37     37     37     37     37     37     27     18
 *     shoelace      37     37     37     37     37     37     27     18
 *     normalised    37     37     37     37     37     37     37     37
 *
 * RE-MEASURED IN FULL when the normalisation scale became the nearest POWER OF TWO to the longest
 * side rather than the side itself (see `normalisation.ts`). That change moves the floating-point
 * pass/fail boundary — the normalised extent is now in [1/sqrt(2), sqrt(2)] instead of exactly 1 —
 * so the whole envelope was reproduced rather than assumed. NOT ONE CELL MOVED:
 *
 *     translate      0    1e3    1e4    1e5    1e6    1e7    1e8    1e9   1e10   1e11
 *     power-of-two  37     37     37     37     37     37     37     37     37     37
 *
 *     scale       1e-6   1e-4   1e-2      1    1e2    1e4    1e6    1e8
 *     power-of-two  37     37     37     37     37     37     37     37
 *
 *     translate      0    1e4    1e5    1e6    1e7    1e8      (at scale 50)
 *     power-of-two  37     37     37     37     37     37
 *
 * Realistic world-space: scale 50 — every fixture becomes 15 000 to 40 000 units across,
 * i.e. a 150-400 m region in centimetres — then translated. Was clean throughout:
 *
 *     translate      0    1e4    1e5    1e6    1e7    1e8
 *     all three     37     37     37     37     37     37
 *
 * ----------------------------------------------------------------------------
 * THE TWO FAILURE MODES, AND WHERE THEY NOW STAND
 * ----------------------------------------------------------------------------
 *
 * 1. FIXED BY THE SHOELACE CHANGE — `computeStrips` returning strips with an EMPTY boundary.
 *    The clipped face's computed area rounded to exactly zero, so it satisfied neither
 *    `signedArea < 0` (outer) nor `signedArea > 0` (hole), and `outer[0] ?? []` handed back
 *    nothing. Not one fixture produces an empty or miscounted strip at any translation up to
 *    1e11 now: wherever the solve and the offset ring are sound, the strips are too. The Square
 *    survives to 1e11 with an exact area of -4, exact winding and four full faces.
 *
 * 2. FIXED BY UNIT-EXTENT NORMALISATION, AND IT NEVER WAS THE SHOELACE — `solveSkeleton`
 *    returning `complete: true` with `diagnostics: []` and a WRONG skeleton. Broken Polygon
 *    translated to 1e8 used to report a maximum offset of 308.9784380383704 where its native
 *    value is 126.63015964243034, and `computeOffsetRings` then returned nothing past a quarter
 *    of the way in. It now reports 126.630159636494 — the native value to a relative 5e-11 —
 *    and its rings project all the way in. Under the power-of-two scale it reports the SAME
 *    126.630159636494 bit for bit, while the native figure moved from 126.63015964243039 to
 *    126.63015964243037, so the gap between them closed from 5.936385605309624e-9 to
 *    5.936371394454909e-9. The canary moved TOWARDS native, which is the direction that change
 *    exists to produce. The cause was `FLOATING_POINT_EPSILON`: an absolute
 *    `1e-8` compared against raw coordinates is a relative tolerance that TIGHTENS as the
 *    polygon moves away from the origin, so the degeneracy test the solver depends on became
 *    unreachably strict. `solveSkeleton` now normalises the polygon to unit extent before
 *    solving and denormalises on the way out, which leaves the constant alone and makes it
 *    relative by construction. See `normalisation.ts` and `normalisation.test.ts`.
 *
 *    That it was NOT the shoelace is still asserted in the last block, because the measurement
 *    is what ruled the shoelace out: that polygon's area is 95 054.8, so its absolute-form
 *    shoelace at 1e8 is accurate to a relative 1.6e-6 with the correct sign and a safe distance
 *    of 2.07e10 — 200x headroom. The shoelace change accordingly left the wrong answer
 *    bit-for-bit identical, 308.9784380383704 before and after; only normalisation moved it.
 *
 * The third limit is gone with the second: every fixture now survives translation to 1e11 and
 * scaling to 1e8, where eight of the thirty-seven used to fail with `step-failure` /
 * `unresolved-edges`. Unlike the wrong-skeleton mode, that one was at least SIGNALLED.
 *
 * Neither defect was the near-regular defect of `near-regular-polygons.test.ts`. Every fixture
 * here solves cleanly untranslated, and the trigger was position, not symmetry.
 *
 * DO NOT DELETE THIS FILE. It is a genuine specification of the operating envelope and should
 * be kept and widened.
 */

setSkeletonLogLevel('silent');

function fixture(name: string): Vector2[] {
    const found = ALL_TEST_POLYGONS.find(polygon => polygon.name === name);
    if (found === undefined) {
        throw new Error(`No fixture named "${name}" in ALL_TEST_POLYGONS`);
    }
    return found.vertices;
}

/**
 * The shoelace as `strip-decomposition.ts` and `geometry-helpers.ts` USED to compute it, over
 * absolute coordinates. Retained as the witness of what the fix removed.
 */
function signedAreaAbsolute(ring: Vector2[]): number {
    let total = 0;
    for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        total += a.x * b.y - b.x * a.y;
    }
    return total / 2;
}

/** Does this fixture survive solve, offset projection and strip decomposition at this placement? */
function survives(vertices: Vector2[], scale: number, translate: number): boolean {
    const result = solveSkeleton(place(vertices, scale, translate));
    if (!result.complete || result.context === null) {
        return false;
    }
    const maxOffset = computeMaxOffset(result);
    const rings = computeOffsetRings(result, maxOffset * 0.5);
    if (rings.length === 0 || rings.some(ring => ring.length < 3)) {
        return false;
    }
    const strips = computeStrips(result, {depth: maxOffset * 0.5});
    return strips.length === result.graph.numExteriorNodes && strips.every(strip => strip.boundary.length >= 3);
}

function survivorCount(scale: number, translate: number): number {
    return ALL_TEST_POLYGONS.filter(polygon => survives(polygon.vertices, scale, translate)).length;
}

describe('large coordinates', () => {
    describe('the world-space operating envelope is sound', () => {
        it.each([0, 1e4, 1e5, 1e6, 1e7, 1e8])(
            'solves, offsets and strips every fixture as a 15-40 km-of-centimetres region at distance %p',
            translate => {
                expect(survivorCount(50, translate)).toBe(ALL_TEST_POLYGONS.length);
            },
        );
    });

    describe('translation alone is safe well past the intended range', () => {
        // 1e10 and 1e11 were 29 of 37 before unit-extent normalisation.
        it.each([1e5, 1e6, 1e7, 1e8, 1e9, 1e10, 1e11])(
            'every fixture survives translation to %p at its native span',
            translate => {
                expect(survivorCount(1, translate)).toBe(ALL_TEST_POLYGONS.length);
            },
        );

        // 1e6 and 1e8 were 27 and 18 of 37 before unit-extent normalisation. The scale sweep is
        // the one the shoelace fix could not touch, because it is the tolerance and not the sum.
        it.each([1e-6, 1e-4, 1e-2, 1e2, 1e4, 1e6, 1e8])(
            'every fixture survives being scaled by %p about the origin',
            scale => {
                expect(survivorCount(scale, 0)).toBe(ALL_TEST_POLYGONS.length);
            },
        );
    });

    describe('strip faces survive any translation, because signedArea is translation-invariant', () => {
        it.each([1e8, 1e9, 1e10, 1e11])(
            'never loses or miscounts a strip face at translation %p, wherever solve and offset are sound',
            translate => {
                const checked: string[] = [];
                for (const polygon of ALL_TEST_POLYGONS) {
                    const result = solveSkeleton(place(polygon.vertices, 1, translate));
                    if (!result.complete || result.context === null) {
                        continue;
                    }
                    const maxOffset = computeMaxOffset(result);
                    const rings = computeOffsetRings(result, maxOffset * 0.5);
                    if (rings.length === 0 || rings.some(ring => ring.length < 3)) {
                        continue;
                    }
                    const strips = computeStrips(result, {depth: maxOffset * 0.5});
                    expect(strips).toHaveLength(result.graph.numExteriorNodes);
                    expect(strips.filter(strip => strip.boundary.length < 3)).toEqual([]);
                    checked.push(polygon.name);
                }
                // Guard against the assertions above passing vacuously.
                expect(checked.length).toBeGreaterThanOrEqual(29);
            },
        );

        it("keeps all four of a square's strips at 1e8, where two used to come back empty", () => {
            const result = solveSkeleton(place(fixture('Square'), 1, 1e8));

            expect(result.complete).toBe(true);
            expect(result.diagnostics).toEqual([]);
            expect(computeMaxOffset(result)).toBe(1);

            const rings = computeOffsetRings(result, 0.5);
            expect(rings).toHaveLength(1);
            expect(rings[0]).toHaveLength(4);

            const strips = computeStrips(result, {depth: 0.5});
            expect(strips).toHaveLength(4);
            expect(strips.filter(strip => strip.boundary.length === 0)).toEqual([]);
            expect(strips.every(strip => strip.boundary.length === 4)).toBe(true);
            expect(strips.every(strip => strip.holes.length === 0)).toBe(true);
        });

        it('computes the same strip tile area at the origin and at 1e8, where the absolute sum gave zero', () => {
            // The trapezoid that strip 0 of that square should be, at the origin and at 1e8.
            const tile: Vector2[] = [
                {x: 0, y: 0},
                {x: 0, y: 2},
                {x: 0.5, y: 1.5},
                {x: 0.5, y: 0.5},
            ];
            const shifted = tile.map(vertex => ({x: vertex.x + 1e8, y: vertex.y + 1e8}));

            expect(signedArea(tile)).toBeCloseTo(-0.75, 12);
            expect(signedArea(shifted)).toBeCloseTo(-0.75, 6);

            // What the source used to do, kept as the witness: neither the right value nor the right sign.
            expect(signedAreaAbsolute(shifted)).not.toBeLessThan(-0.7);
        });

        it("keeps a square's winding out to 1e11, where the absolute sum lost it by 1e9", () => {
            const atOrigin = fixture('Square');
            expect(isClockwise(atOrigin)).toBe(true);
            expect(signedArea(atOrigin)).toBe(-4);

            for (const translate of [1e8, 1e9, 1e10, 1e11]) {
                const far = place(atOrigin, 1, translate);
                expect(signedArea(far)).toBe(-4);
                expect(isClockwise(far)).toBe(true);
            }

            // The absolute sum returns exactly zero for the same 2-unit square at 1e9.
            expect(signedAreaAbsolute(place(atOrigin, 1, 1e9))).toBe(0);
        });

        it('decides winding exactly as the old absolute sum did, everywhere the old sum was reliable', () => {
            // `isClockwise` gates `solveSkeleton`'s winding normalisation, so a change in its
            // answer would change every solve. It changes for no fixture, in either winding, at
            // any scale >= 1 out to translation 1e7 — the whole realistic envelope and well past
            // it. The only placements where the two forms disagree are ones where the old form
            // had already lost the sign (span under a unit, translated 1e5 or more), and there
            // the new answer is the correct one: it matches the fixture's winding at the origin.
            const scales = [1, 10, 50, 1e2, 1e3, 1e4];
            const translations = [0, 1e2, 1e3, 1e4, 1e5, 1e6, 1e7];
            let compared = 0;

            for (const polygon of ALL_TEST_POLYGONS) {
                const clockwiseAtOrigin = isClockwise(polygon.vertices);
                for (const scale of scales) {
                    for (const translate of translations) {
                        const placed = place(polygon.vertices, scale, translate);
                        const reversed = [...placed].reverse();

                        expect(isClockwise(placed)).toBe(signedAreaAbsolute(placed) < 0);
                        expect(isClockwise(reversed)).toBe(signedAreaAbsolute(reversed) < 0);

                        // ...and both agree with the ground truth taken at the origin.
                        expect(isClockwise(placed)).toBe(clockwiseAtOrigin);
                        expect(isClockwise(reversed)).toBe(!clockwiseAtOrigin);
                        compared += 2;
                    }
                }
            }

            expect(compared).toBe(ALL_TEST_POLYGONS.length * scales.length * translations.length * 2);
        });
    });

    describe('translating a rigid shape no longer changes its skeleton', () => {
        // WAS THE FILE'S KNOWN DEFECT AND IS NOW ITS SPECIFICATION. Before unit-extent
        // normalisation these three tests asserted the opposite: a maximum offset above 300 at
        // 1e8, and offset rings that came back empty past a quarter of the way in.
        it('reports the same maximum offset at the origin and at 1e8', () => {
            const atOrigin = solveSkeleton(fixture('Broken Polygon'));
            const far = solveSkeleton(place(fixture('Broken Polygon'), 1, 1e8));

            expect(atOrigin.complete).toBe(true);
            expect(computeMaxOffset(atOrigin)).toBeCloseTo(126.630159, 5);

            // Translating a rigid shape cannot change how far its wavefront travels, and no
            // longer does. It used to report 308.9784380383704 here.
            expect(far.complete).toBe(true);
            expect(far.diagnostics).toEqual([]);
            expect(computeMaxOffset(far)).toBeCloseTo(126.630159, 5);
            expect(Math.abs(computeMaxOffset(far) - computeMaxOffset(atOrigin))).toBeLessThan(1e-6);
        });

        it('closes the gap to native rather than widening it, under the power-of-two scale', () => {
            // THE NAMED REGRESSION CANARY, PINNED AT THE MEASURED FIGURE. The point of scaling by an
            // exact power of two is to remove round-trip error, so this gap may shrink but must not
            // grow: a canary drifting AWAY from native would mean the exact scale had been
            // implemented as an approximation somewhere. Measured before the change at
            // 5.936385605309624e-9 (native 126.63015964243039), and after it at
            // 5.936371394454909e-9 (native 126.63015964243037, far 126.630159636494 unmoved).
            const gapBeforeThePowerOfTwoScale = 5.936385605309624e-9;
            const gapUnderThePowerOfTwoScale = 5.936371394454909e-9;

            const atOrigin = computeMaxOffset(solveSkeleton(fixture('Broken Polygon')));
            const far = computeMaxOffset(solveSkeleton(place(fixture('Broken Polygon'), 1, 1e8)));

            expect(Math.abs(far - atOrigin)).toBeLessThanOrEqual(gapUnderThePowerOfTwoScale);
            expect(Math.abs(far - atOrigin)).toBeLessThan(gapBeforeThePowerOfTwoScale);
        });

        it('offsets that skeleton all the way in, at every depth', () => {
            const far = solveSkeleton(place(fixture('Broken Polygon'), 1, 1e8));
            const maxOffset = computeMaxOffset(far);

            expect(computeOffsetRings(far, maxOffset * 0.25)).toHaveLength(1);
            expect(computeOffsetRings(far, maxOffset * 0.5)).toHaveLength(1);
            expect(computeOffsetRings(far, maxOffset * 0.75)).toHaveLength(1);
        });

        it('was not the shoelace: that polygon had 200x of headroom at 1e8', () => {
            const atOrigin = fixture('Broken Polygon');
            const far = place(atOrigin, 1, 1e8);

            const area = signedArea(atOrigin);
            expect(area).toBeCloseTo(-95054.8457, 4);

            // The absolute form — the one that was replaced — was already accurate here, to a
            // relative 1.6e-6 and with the correct sign. The safe distance for this area is
            // sqrt(95054.8) * 6.7e7 ~= 2.07e10, so 1e8 is nowhere near the cliff. The shoelace
            // change accordingly left the wrong answer bit-for-bit identical at
            // 308.9784380383704; only the tolerance fix moved it.
            const absolute = signedAreaAbsolute(far);
            expect(absolute).toBeLessThan(0);
            expect(Math.abs(absolute - signedArea(far)) / Math.abs(area)).toBeLessThan(1e-5);
            expect(Math.sqrt(Math.abs(area)) * 6.7e7).toBeGreaterThan(2e10);
        });
    });
});
