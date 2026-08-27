import {
    computeMaxOffset,
    computeOffsetRings,
    computeStrips,
    setSkeletonLogLevel,
    solveSkeleton,
    Vector2,
} from '@proc-geo/core';
import {NEAR_REGULAR_CIRCLE_48, NEAR_REGULAR_ROSETTE5_40} from '@proc-geo/test-fixtures';
import {place} from './placement-helpers';

/*
 * ============================================================================
 *  TWO RECORDED DEFECTS, PINNED AS THEY STAND. Read this before "fixing" a failure here.
 * ============================================================================
 *
 * `NEAR_REGULAR_CIRCLE_48` and `NEAR_REGULAR_ROSETTE5_40` are the last two fixtures kept out of
 * `ALL_TEST_POLYGONS` on the large-coordinate envelope. Journal decision 53 allows an exclusion
 * only as a visible, pinned characterisation of a defect awaiting its fix, and this file is that
 * pin: it asserts the CURRENT FAILING BEHAVIOUR, exactly, and fires in both directions. If a cell
 * starts passing, promote that fixture into `ALL_TEST_POLYGONS` — see the near-regular fixture
 * header for the count pins the promotion moves — and delete its block here. If a passing cell
 * starts failing, the envelope regressed.
 *
 * WHAT THE ENVELOPE IS. `large-coordinate-failures.test.ts` asserts that every corpus fixture
 * survives solve, offset projection and strip decomposition at translations up to 1e11 and scales
 * up to 1e8. These two survive everything that suite asserts except one cell each.
 *
 * WHAT WAS RE-MEASURED, 2026-08-27 (journal F14). The two blockers those exclusion headers were
 * written against — the translation-to-1e9 envelope and the many-way-event offset projection —
 * are dead on all eight historically excluded fixtures. What survives is these two cells alone.
 *
 * CIRCLE 48 FAILS AT TRANSLATION 1e10 ONLY, AND NON-MONOTONICALLY: 1e9 passes and 1e11 passes.
 * That rules out a monotone precision-loss story. It is signalled — `step-failure` plus
 * `unresolved-edges` — not a silent wrong answer, so no consumer reads it as a skeleton.
 *
 * ROSETTE5 40 FAILS AT TRANSLATION 1e11 ONLY, in a two-edge base case whose two source nodes sit
 * about 6e-8 apart in unit space, inside `FLOATING_POINT_EPSILON` (1e-8) of each other on the
 * terminal ring but not close enough to be merged. That is the terminal-ring-finer-than-tolerance
 * regime journal decision 54 leaves open, and it is the evidence this fixture exists to carry: the
 * failure mode SHIFTED into it when the double-split partition fix landed (journal F15b), so a
 * change here is a change in that regime rather than in the partition layer.
 */

setSkeletonLogLevel('silent');

/** The full translation sweep `large-coordinate-failures.test.ts` asserts over the corpus. */
const TRANSLATIONS = [1e5, 1e6, 1e7, 1e8, 1e9, 1e10, 1e11];

/** The scale sweep from the same suite. */
const SCALES = [1e-6, 1e-4, 1e-2, 1e2, 1e4, 1e6, 1e8];

/**
 * Replicated from `large-coordinate-failures.test.ts`: does this fixture survive solve, offset
 * projection and strip decomposition at this placement? The predicate is copied rather than shared
 * so that a change to the enrolment sweep cannot silently redefine what these pins claim.
 */
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

function diagnosticKinds(vertices: Vector2[], translate: number): string[] {
    return solveSkeleton(place(vertices, 1, translate)).diagnostics.map(diagnostic => diagnostic.kind);
}

describe('NEAR_REGULAR_CIRCLE_48: the recorded defect at translation 1e10', () => {
    it('survives every other translation in the enrolment sweep', () => {
        const surviving = TRANSLATIONS.filter(translate => survives(NEAR_REGULAR_CIRCLE_48, 1, translate));
        expect(surviving).toEqual([1e5, 1e6, 1e7, 1e8, 1e9, 1e11]);
    });

    it('survives the whole scale sweep, and its native placement', () => {
        expect(survives(NEAR_REGULAR_CIRCLE_48, 1, 0)).toBe(true);
        for (const scale of SCALES) {
            expect(survives(NEAR_REGULAR_CIRCLE_48, scale, 0)).toBe(true);
        }
    });

    it('fails at 1e10 LOUDLY, with a step failure and unresolved edges', () => {
        // Signalled, not silent. The value of pinning the kinds rather than only `complete` is that
        // a regression into the silent wrong-skeleton mode — the one unit-extent normalisation
        // removed — would read as a pass on a bare completeness check.
        const result = solveSkeleton(place(NEAR_REGULAR_CIRCLE_48, 1, 1e10));

        expect(result.complete).toBe(false);
        expect(diagnosticKinds(NEAR_REGULAR_CIRCLE_48, 1e10)).toEqual(['step-failure', 'unresolved-edges']);
        expect(result.diagnostics.at(-1)?.detail)
            .toContain('2 interior edge(s) finished without a target node');
    });

    it('is NON-MONOTONIC in the translation, which is what rules out plain precision loss', () => {
        expect(survives(NEAR_REGULAR_CIRCLE_48, 1, 1e9)).toBe(true);
        expect(survives(NEAR_REGULAR_CIRCLE_48, 1, 1e10)).toBe(false);
        expect(survives(NEAR_REGULAR_CIRCLE_48, 1, 1e11)).toBe(true);
    });
});

describe('NEAR_REGULAR_ROSETTE5_40: the recorded defect at translation 1e11', () => {
    it('survives every other translation in the enrolment sweep', () => {
        const surviving = TRANSLATIONS.filter(translate => survives(NEAR_REGULAR_ROSETTE5_40, 1, translate));
        expect(surviving).toEqual([1e5, 1e6, 1e7, 1e8, 1e9, 1e10]);
    });

    it('survives the whole scale sweep, and its native placement', () => {
        expect(survives(NEAR_REGULAR_ROSETTE5_40, 1, 0)).toBe(true);
        for (const scale of SCALES) {
            expect(survives(NEAR_REGULAR_ROSETTE5_40, scale, 0)).toBe(true);
        }
    });

    it('fails at 1e11 LOUDLY, in two two-edge base cases, leaving four edges unresolved', () => {
        const result = solveSkeleton(place(NEAR_REGULAR_ROSETTE5_40, 1, 1e11));

        expect(result.complete).toBe(false);
        expect(diagnosticKinds(NEAR_REGULAR_ROSETTE5_40, 1e11))
            .toEqual(['step-failure', 'step-failure', 'unresolved-edges']);
        expect(result.diagnostics.at(-1)?.detail)
            .toContain('4 interior edge(s) finished without a target node');
    });

    it('dies with its two source nodes 6e-8 apart on the terminal ring', () => {
        // Journal F15b, pinned as the number rather than the story: this is the
        // terminal-ring-finer-than-tolerance regime, and the separation is what a fix has to move.
        // Both nodes sit on y = 0 in unit space, at x ~= -0.032224.
        const detail = solveSkeleton(place(NEAR_REGULAR_ROSETTE5_40, 1, 1e11)).diagnostics[0].detail;
        const positions = [...detail.matchAll(/"position":\{"x":(-?[\d.e-]+),"y":(-?[\d.e-]+)\}/g)]
            .map(match => ({x: Number(match[1]), y: Number(match[2])}));

        expect(positions.length).toBeGreaterThanOrEqual(2);
        for (const position of positions) {
            expect(position.x).toBeCloseTo(-0.032224, 6);
            expect(Math.abs(position.y)).toBeLessThan(1e-15);
        }
        const separation = Math.abs(positions[0].x - positions[1].x);
        expect(separation).toBeGreaterThan(1e-8);
        expect(separation).toBeLessThan(1e-7);
    });
});
