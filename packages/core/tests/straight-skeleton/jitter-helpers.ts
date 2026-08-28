import {isClockwise, solveSkeleton, Vector2} from '@proc-geo/core';

import {makeRandom} from './subdivision-helpers';

/*
 * ============================================================================
 *  THE THIRD INSERTION FAMILY: JITTERED SAMPLES. Defined once, used by two suites.
 * ============================================================================
 *
 * `subdivision-helpers.ts` holds the two families whose inserted vertices lie EXACTLY on the segment
 * they subdivide. This file holds the family that does not: samples placed at even parameters and
 * then displaced, either purely along the edge's own direction or with a component across it. It is
 * the construction `docs/notes/solver-hardening-backlog.md` item 2 was measured with, reconstructed
 * on 2026-08-28, and it is shared by `along-edge-jitter.test.ts` (the sweep pin) and
 * `along-edge-jitter-known-failures.test.ts` (the fixtures that fall out of it).
 *
 * WHY THE TWO DIRECTIONS ARE A DIFFERENT REGIME AND NOT A DIFFERENT MAGNITUDE. Displacing a sample
 * along its own edge leaves the edge's SUPPORTING LINE exactly where it was: wall-to-wall distances
 * stay equal and the pinches still land in one offset layer, so the shape is still degenerate in the
 * way that matters. A component across the edge moves the supporting line and breaks that. The two
 * columns of the sweep are that distinction measured, and they only mean the same thing across the
 * two suites if they are the same displacement — hence one definition, here.
 *
 * EVERY CONSTANT BELOW IS LOAD-BEARING:
 *
 *   - CORNERS ARE NEVER MOVED. A corner displaced along one of its edges translates the OTHER edge's
 *     supporting line, which is a different silhouette rather than a different sampling of the same
 *     one — the premise the whole measurement rests on.
 *   - BOTH RANDOM DRAWS HAPPEN FOR EVERY SAMPLE, and the along-edge family discards the second. That
 *     is what makes the off-edge family "the same displacement plus a perpendicular component"
 *     rather than a differently-seeded second experiment, so the two columns are comparable cell by
 *     cell.
 *   - THE CLAMP IS ON THE ALONG-EDGE COMPONENT ONLY, at 0.49 of the sample spacing, so samples stay
 *     strictly between their neighbours and in boundary order. An overshoot would be a
 *     self-intersecting ring and would be measuring the decomposition path instead.
 *   - {@link makeRandom} is imported rather than copied. Its constants ARE the seed sequence, so a
 *     second copy that drifted would renumber every seed the two suites pin counts against.
 *
 * This file is deliberately NOT named `*.test.ts`; see `subdivision-helpers.ts` for why.
 */

/** The reflex L of `reflex-subdivision.test.ts`, spanning 300 units. */
export const JITTER_REFLEX_L: Vector2[] = [
    {x: 100, y: 100}, {x: 100, y: 400}, {x: 250, y: 400},
    {x: 250, y: 250}, {x: 400, y: 250}, {x: 400, y: 100},
];

/** The double-reflex plus of `reflex-subdivision.test.ts`, spanning 300 units. */
export const JITTER_DOUBLE_REFLEX_PLUS: Vector2[] = [
    {x: 200, y: 100}, {x: 200, y: 200}, {x: 100, y: 200}, {x: 100, y: 300},
    {x: 200, y: 300}, {x: 200, y: 400}, {x: 300, y: 400}, {x: 300, y: 300},
    {x: 400, y: 300}, {x: 400, y: 200}, {x: 300, y: 200}, {x: 300, y: 100},
];

/**
 * The eight seeds of the sweep, written as literals so a cell is named by a number a reader can find
 * in this file rather than by an index into a generated list.
 */
export const JITTER_SEEDS = [7919, 15838, 23757, 31676, 39595, 47514, 55433, 63352];

/** The ten insertion counts of the sweep. `k = 1` inserts nothing, so its eight cells are the bare fixture. */
export const JITTER_K = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/** The solver only handles clockwise winding; these fixtures are authored either way. */
export function clockwise(polygon: readonly Vector2[]): Vector2[] {
    return isClockwise([...polygon]) ? [...polygon] : [...polygon].reverse();
}

/**
 * `polygon` resampled into `k` pieces per edge, with every INSERTED sample displaced.
 *
 * `offEdge` adds a second, independent displacement along the edge normal. Without it the samples
 * stay exactly on their edge's supporting line.
 */
export function jitteredSamples(
    polygon: readonly Vector2[], k: number, seed: number, magnitude: number, offEdge: boolean,
): Vector2[] {
    const random = makeRandom(seed);
    const vertices: Vector2[] = [];

    for (let index = 0; index < polygon.length; index++) {
        const from = polygon[index];
        const to = polygon[(index + 1) % polygon.length];
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const length = Math.hypot(dx, dy);
        const unitX = dx / length;
        const unitY = dy / length;
        const limit = 0.49 * (length / k);

        vertices.push({x: from.x, y: from.y});
        for (let step = 1; step < k; step++) {
            const along = Math.max(-limit, Math.min(limit, (random() * 2 - 1) * magnitude));
            const across = (random() * 2 - 1) * magnitude;
            vertices.push({
                x: from.x + (dx * step) / k + unitX * along + (offEdge ? -unitY * across : 0),
                y: from.y + (dy * step) / k + unitY * along + (offEdge ? unitX * across : 0),
            });
        }
    }

    return vertices;
}

/** One cell of the sweep: does this (k, seed) configuration solve completely? */
export function jitterCellFails(
    polygon: readonly Vector2[], k: number, seed: number, magnitude: number, offEdge: boolean, noiseFloor: number,
): boolean {
    const vertices = jitteredSamples(clockwise(polygon), k, seed, magnitude, offEdge);
    return !solveSkeleton(vertices, {noiseFloor}).complete;
}

/** One column of the sweep table, summarised. Eighty cells by default; see {@link jitterSweep}. */
export interface JitterSweep {
    /** How many cells failed. */
    failed: number;
    /** The insertion counts at which at least one seed failed — the SHAPE of the failure, not its size. */
    failingCounts: number[];
}

/**
 * Run every cell of a column and summarise it.
 *
 * ONE PASS, RETURNING BOTH NUMBERS, because the expensive columns are minutes of solving: a
 * `failed` helper and a separate `failingCounts` helper would double every one of them, and a
 * suite too slow to run is a suite that stops being run.
 *
 * `counts` AND `seeds` DEFAULT TO THE FULL EIGHTY-CELL GRID, and exist so that one caller can take a
 * SUBSET of it without a second implementation. Journal decision 68 slimmed the closed class's
 * standing regression to a representative subset while the live defect
 * (`along-edge-jitter-known-failures.test.ts`) keeps the full grid; both must be the same sweep, run
 * over different cells, or the two files stop being comparable. A subset's `failed` is out of
 * `counts.length * seeds.length`, not out of eighty — every caller states which.
 */
export function jitterSweep(
    polygon: readonly Vector2[], magnitude: number, offEdge: boolean, noiseFloor: number,
    counts: readonly number[] = JITTER_K, seeds: readonly number[] = JITTER_SEEDS,
): JitterSweep {
    let failed = 0;
    const failingCounts: number[] = [];

    for (const k of counts) {
        let failedThisCount = false;
        for (const seed of seeds) {
            if (jitterCellFails(polygon, k, seed, magnitude, offEdge, noiseFloor)) {
                failed += 1;
                failedThisCount = true;
            }
        }
        if (failedThisCount) {
            failingCounts.push(k);
        }
    }

    return {failed, failingCounts};
}
