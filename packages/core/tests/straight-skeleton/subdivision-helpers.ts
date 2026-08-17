import {Vector2} from '@proc-geo/core';

/*
 * ============================================================================
 *  THE TWO INSERTION FAMILIES, DEFINED ONCE.
 * ============================================================================
 *
 * Two suites insert vertices that lie on the segments they subdivide, which changes how a
 * boundary is written down and not what it looks like. `reflex-subdivision.test.ts` measures
 * which subdivisions the solver SOLVES with the canonicalisation stage on and off, and
 * `silhouette-invariance.test.ts` measures whether the pipeline's lot set MOVES under the same
 * insertions. The second is the general statement of what the first records on two fixtures, so
 * the two tables only mean the same thing if the insertions are the same insertion.
 *
 * These are formulae, not loop shapes, and every constant in them is load-bearing:
 *
 *   - {@link insertRegularly} places vertex `j` at exactly `from + (to - from) * j / k`. Equal
 *     subdivision is a SPECIAL input — it manufactures exact simultaneity and exactly equal
 *     spacing — and a copy that drifted to an accumulating `from + step * delta` would stop
 *     manufacturing it and quietly stop probing the regime both suites exist to probe.
 *   - {@link makeRandom} is a fixed LCG. Its constants are the seed sequence itself, so a copy
 *     that changed them would renumber every seed the suites pin failures against.
 *   - {@link insertIrregularly} holds its parameters inside `[0.05, 0.95]` and sorts them along
 *     the edge. An insertion that overshot a corner, or arrived out of boundary order, would be
 *     a DIFFERENT SILHOUETTE rather than a different spelling of the same one — which is the
 *     premise both suites rest on rather than a detail of how they generate input.
 *
 * PROBING BOTH FAMILIES IS LOAD-BEARING RATHER THAN THOROUGH. With the canonicalisation stage
 * switched off the two catch different failures: the reflex L fails 4 of 10 regular counts and 0
 * of 10 irregular seeds, while the double-reflex plus is the other way round. A suite probing
 * either family alone would have declared one of those two shapes clean — so both families
 * living here together, under one pair of names, is the point.
 *
 * This file is deliberately NOT named `*.test.ts`: `jest.config.cjs` matches
 * `tests/**\/*.test.ts`, so a helper module beside the suites is not collected as an empty suite.
 */

/**
 * Split every edge into `k` equal pieces. The regular family.
 *
 * The original corners are preserved (each edge contributes its own `from` at `step = 0`) and the
 * winding is untouched, so the ring that comes back is the same closed curve written with `k`
 * times as many vertices. `k = 1` returns the input's corners unchanged.
 */
export function insertRegularly(polygon: readonly Vector2[], k: number): Vector2[] {
    const vertices: Vector2[] = [];
    for (let index = 0; index < polygon.length; index++) {
        const from = polygon[index];
        const to = polygon[(index + 1) % polygon.length];
        for (let step = 0; step < k; step++) {
            vertices.push({
                x: from.x + ((to.x - from.x) * step) / k,
                y: from.y + ((to.y - from.y) * step) / k,
            });
        }
    }
    return vertices;
}

/** Deterministic sampler, so an irregular insertion either always reproduces or never appears. */
export function makeRandom(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 4294967296;
    };
}

/**
 * Insert `count` vertices per edge at pseudo-random parameters. The irregular family.
 *
 * The parameters are sorted along each edge and held away from 0 and 1, so the inserted vertices
 * stay strictly between the corners and in boundary order, and the original corners are preserved.
 */
export function insertIrregularly(polygon: readonly Vector2[], count: number, seed: number): Vector2[] {
    const random = makeRandom(seed);
    const vertices: Vector2[] = [];
    for (let index = 0; index < polygon.length; index++) {
        const from = polygon[index];
        const to = polygon[(index + 1) % polygon.length];
        vertices.push(from);

        const parameters = Array.from({length: count}, () => 0.05 + random() * 0.9).sort((a, b) => a - b);
        for (const t of parameters) {
            vertices.push({x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t});
        }
    }
    return vertices;
}
