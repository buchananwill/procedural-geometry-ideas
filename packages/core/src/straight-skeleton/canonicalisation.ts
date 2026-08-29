import {distanceToSupportingLine} from '../stroke-spline/vertex-budget';
import {Vector2} from './types';

/**
 * The normalisation stage that removes boundary geometry too small to see, before the skeleton sees
 * it.
 *
 * WHY THIS EXISTS, AND IT IS NOT HYGIENE. A vertex whose perpendicular deviation from the chord
 * between its neighbours falls below a render-scale noise floor contributes nothing to the polygon's
 * silhouette. It contributes only numerical difficulty — and one specific, measured class of it: the
 * solver has a standing defect on exactly-subdivided reflex polygons, whose structural fix was
 * written, landed, measured and then reverted for costing several hundred lines in the solver's most
 * delicate function. Removing the input class is a better answer than handling it. The three known
 * failure lists that defect owns — `REFLEX_L_KNOWN_FAILURES`,
 * `DOUBLE_REFLEX_PLUS_KNOWN_FAILURES` and `failingSubdivisions(L_SHAPE)` — are what this stage is
 * measured against.
 *
 * The deeper reason is the recursive subdivision arc, which feeds solver output back in as solver
 * input at every level. RECURSION IS NOT ALLOWED TO ACCIDENTALLY INTRODUCE FRACTAL COMPLEXITY, and
 * this stage is the mechanism that enforces it.
 *
 * THE PREDICATE IS PERPENDICULAR DEVIATION FROM THE CHORD, NEVER TURN ANGLE. The two disagree in
 * both directions and deviation is the one that means "cannot be seen": a needle spike has an
 * invisible deviation and a turn angle approaching π, while a gently curving run of nearly-collinear
 * vertices has tiny turn angles and can bow visibly far off its chord.
 *
 * AND THE CHORD IS AN INFINITE LINE, NOT A SEGMENT — `distanceToSupportingLine`, not
 * `distanceToSegment`. This stage shipped for months on the clamped form and was wrong for the one
 * shape the paragraph above names as its motivating case. A FOLD is a vertex whose perpendicular foot
 * overshoots the END of the chord between its neighbours: the ring doubles back on itself, the apex
 * lies beyond `next`, and the clamped distance stops measuring the perpendicular and starts measuring
 * the distance to the endpoint — which is the fold's LENGTH along the boundary rather than its WIDTH
 * across it. Measured on the corpus (journal F37): a fold in one of the jitter fixtures' sub-regions
 * has a width of 8.4e-9 and a length of 9.9e-4, so the clamped form screened it at 3.88x the floor
 * while the shape it describes is a zero-area spike that a viewer cannot see and the solver cannot
 * resolve. The line distance is never larger than the segment distance, so this can only ever remove
 * MORE, and everything the clamped form removed it still removes.
 *
 * The primitive is reused from `vertex-budget.ts` rather than reimplemented, as its clamped sibling
 * was — a second copy of the chord arithmetic would be a second thing to keep correct — but WHICH of
 * the two is used is this stage's own decision and not RDP's. RDP genuinely wants the clamped one,
 * because its error bound is about distance to the reduced POLYLINE; this stage is asking a different
 * question of the same two points. See `canonicalisation.test.ts` for the fold and bump pair that
 * convicts the choice in both directions, and `region-boundary-folds.test.ts` for the sweep that
 * holds it over the whole recursion corpus.
 *
 * REMOVAL IS ITERATIVE TO A FIXED POINT, NOT A SINGLE PASS. Removing a vertex changes both
 * neighbours' chords, which can bring a previously-surviving vertex under the floor; a single pass
 * therefore leaves a result that depends on the order it happened to walk the ring in. Each
 * iteration here removes the ONE vertex with the smallest current deviation and recomputes, so every
 * removal is justified against the polygon as it stands at that moment rather than against the input,
 * and the outcome is a function of the geometry rather than of the traversal. See
 * {@link canonicalisePolygon} for why smallest-first specifically, rather than any under-floor vertex.
 *
 * A POLYGON IS NEVER REDUCED BELOW THREE VERTICES, whatever the floor says. A degenerate input stays
 * degenerate and fails honestly downstream, rather than being silently turned into something that is
 * not a polygon at all.
 *
 * THE FLOOR IS A PARAMETER AND IS NEVER RECOMPUTED FROM THE POLYGON IN HAND. For a direct
 * `solveSkeleton` call this is invisible, because the polygon in hand IS the root region. It matters
 * for the recursion driver, which will pass sub-regions through this same stage: normalising each
 * sub-region to its own extent would scale a thin sliver up enormously and leave it holding every
 * degenerate vertex it has — the exact opposite of the intent. The floor belongs to the ROOT region's
 * extent, so it travels down as an argument.
 *
 * NOTHING HERE REPLACES `dropRepeatedVertices` in `strip-decomposition.ts`. That handles coincident
 * vertices on offset contours: a different predicate at a different pipeline stage, on
 * machine-generated geometry that has not been measured for a render-scale floor. The two stay
 * separate.
 */
export interface CanonicalPolygon {
    /** The surviving vertices, in input order, closed ring, no duplicated closing vertex. */
    vertices: Vector2[];
    /** How many input vertices were removed. Zero means the input was already canonical. */
    removedCount: number;
    /** The largest perpendicular deviation actually discarded. Zero when nothing was removed. */
    maxDeviation: number;
    /**
     * Input vertex index to surviving vertex index, {@link REMOVED_VERTEX_INDEX} where the vertex
     * did not survive. Always as long as the input.
     *
     * WHAT MAKES A BOUNDARY RUN SURVIVE THIS STAGE. Removing a vertex renumbers every index after
     * it, so anything recorded against the input ring — a `BoundaryRun`, an entrance, a supporting
     * edge — refers to the wrong geometry afterwards. Recomputing such a record from the surviving
     * geometry would be a proximity test standing in for a topological fact, which is the one thing
     * the region vocabulary exists to avoid; the record is carried through this remap instead. See
     * `remapRuns` in `region.ts`, and the stroke pipeline's `inputToDeduped` for the precedent.
     */
    indexRemap: number[];
    /**
     * How many distinct input vertices were pinned, and therefore exempt from removal.
     *
     * REPORTED BECAUSE IT IS A SIGNAL, not because the caller cannot count its own argument: a
     * polygon whose vertices are mostly pinned is a polygon whose runs are fragmented, and that is
     * worth seeing here rather than inferring later from a strange-looking slice.
     */
    pinnedCount: number;
    /**
     * How many of those pinned vertices are STILL under the floor in the returned ring — the ones
     * the pin, and only the pin, kept.
     *
     * This is what distinguishes a pinned vertex from a removed one in the report. A non-zero count
     * says the ring came back carrying geometry the floor calls invisible, which is a deliberate
     * outcome of decision 7 rather than a stage that failed to fire.
     */
    pinnedUnderFloorCount: number;
}

/** {@link CanonicalPolygon.indexRemap} entry for an input vertex that was removed. */
export const REMOVED_VERTEX_INDEX = -1;

/**
 * The unit-space deviation below which a vertex is invisible and is removed.
 *
 * A UNIT-SPACE CONSTANT, applied after `makeSkeletonNormalisation` has carried the polygon to unit
 * extent, so it is relative by construction and there is one tolerance system rather than two. A
 * caller-space floor scaled per polygon would reintroduce precisely the absolute-tolerance defect
 * that normalisation was landed to remove.
 *
 * IT CLEARS `FLOATING_POINT_EPSILON` BY TWO ORDERS OF MAGNITUDE, AND THAT GAP IS THE ENTIRE POINT OF
 * THE STAGE. If the two were comparable the pass would buy nothing: a vertex at 1.1x the epsilon
 * would survive canonicalisation and still be sitting inside the solver's degenerate band. The gap is
 * what makes every SURVIVING vertex comfortably non-degenerate rather than merely non-degenerate. A
 * candidate floor within one order of magnitude of the epsilon is evidence that the measurement is
 * wrong, not a result.
 *
 * MEASURED, AND THE BAND AROUND THIS VALUE IS NARROW RATHER THAN A PLATEAU — the distinction matters
 * because the plateau is real for the wrong population. Swept across the fixture corpus, the corpus
 * is insensitive: the only vertex removed anywhere below `1e-3` is one exactly-collinear vertex in a
 * hand-authored fixture, at deviation `7.85e-17`, which any non-zero floor removes. So the corpus
 * alone would suggest four decades of freedom. IT IS NOT THE CORPUS THAT BINDS. The recursive
 * subdivision arc's per-level tiling identity holds at `1e-6`, `2e-6` and `3e-6` and fails at `5e-6`
 * by `1.03e-6` against a `1e-6` tolerance, so the usable band is `[1e-6, 3e-6]` — a factor of three.
 *
 * That narrowness is an artefact of the root-relative floor not yet being wired through the recursion
 * driver: sub-regions still canonicalise against their own extent, so a thin sliver scales up and its
 * floor shrinks in world terms. Once the driver passes the root region's floor down, the arc's upper
 * bound relaxes and the band widens. Until then, `1e-6` sits at the bottom of a narrow band by
 * deliberate choice, not on a plateau.
 */
export const SKELETON_NOISE_FLOOR = 1e-6;

/** Below this a ring is not a polygon, and no floor is allowed to take it there. */
const MINIMUM_RING_SIZE = 3;

/**
 * Remove every vertex whose perpendicular deviation from the chord between its neighbours falls below
 * `noiseFloor`, iterating to a fixed point.
 *
 * `noiseFloor` is expected in the SAME SPACE as `vertices`, and the solver entry points call this in
 * unit space with {@link SKELETON_NOISE_FLOOR}. It is taken as a parameter and never derived from the
 * polygon: see this module's header for why that distinction is load-bearing rather than stylistic.
 *
 * SMALLEST-DEVIATION-FIRST, ONE VERTEX PER ITERATION. Removing every under-floor vertex in one sweep
 * would be cheaper and is wrong: a staircase of vertices can have every step individually under the
 * floor against its immediate neighbours while the run as a whole bows far above it, and a
 * simultaneous sweep would flatten the whole run in one go. Taking the smallest first and recomputing
 * means each removal is measured against the ring that actually remains, so the discarded deviation
 * reported in {@link CanonicalPolygon.maxDeviation} is a true bound on what was thrown away.
 *
 * A non-positive or non-finite floor removes nothing, because the comparison is strict and no
 * distance is negative or compares true against `NaN`. That makes a zero floor an exact identity —
 * which is what lets the metamorphic gate be convicted by mutation through the public option rather
 * than through a test seam in this module.
 *
 * A PINNED VERTEX IS NEVER REMOVED, whatever its deviation. `pinnedIndices` are indices into
 * `vertices`, and the caller that has them is the one holding boundary runs: a run boundary is where
 * access changes to non-access, semantically significant however small its deviation happens to be,
 * and a lane mouth meeting a frontage almost tangentially genuinely can fall under the floor. See
 * `runBoundaryVertexIndices` in `region.ts` for which vertices those are. An index that is not an
 * integer inside the ring is REJECTED rather than ignored, because a pin silently dropped is exactly
 * the failure the pinning exists to prevent. Pinning nothing — the default — leaves this stage
 * behaving precisely as it did before pins existed.
 *
 * Returns fresh vertex objects and never aliases the input, matching `vertex-budget.ts`, so a caller
 * mutating the result cannot reach back into the polygon it passed in.
 */
export function canonicalisePolygon(
    vertices: readonly Vector2[],
    noiseFloor: number,
    pinnedIndices: readonly number[] = [],
): CanonicalPolygon {
    const pinned = validatePinnedIndices(pinnedIndices, vertices.length);
    const surviving: Vector2[] = vertices.map(vertex => ({x: vertex.x, y: vertex.y}));
    // The input index each surviving vertex came from, kept alongside the ring rather than searched
    // for afterwards: it is what makes a pin follow its vertex through every renumbering, and it is
    // the remap itself, read the other way round.
    const origins: number[] = vertices.map((_unused, index) => index);

    let removedCount = 0;
    let maxDeviation = 0;

    while (surviving.length > MINIMUM_RING_SIZE) {
        const weakest = findWeakestVertex(surviving, origins, pinned);
        // NEGATED RATHER THAN `>=`, so a `NaN` floor breaks the loop instead of spinning on it.
        if (weakest === null || !(weakest.deviation < noiseFloor)) {
            break;
        }

        surviving.splice(weakest.index, 1);
        origins.splice(weakest.index, 1);
        removedCount += 1;
        maxDeviation = Math.max(maxDeviation, weakest.deviation);
    }

    const indexRemap: number[] = new Array(vertices.length).fill(REMOVED_VERTEX_INDEX);
    origins.forEach((origin, index) => {
        indexRemap[origin] = index;
    });

    return {
        vertices: surviving,
        removedCount,
        maxDeviation,
        indexRemap,
        pinnedCount: pinned.size,
        pinnedUnderFloorCount: countPinnedUnderFloor(surviving, origins, pinned, noiseFloor),
    };
}

/**
 * The pins, deduplicated, having rejected anything that is not an index of `vertices`.
 *
 * Loud rather than lenient: a pin outside the ring means the caller's runs and the caller's polygon
 * disagree about which polygon they are, and continuing would canonicalise a run boundary away while
 * reporting that it was protected.
 */
function validatePinnedIndices(pinnedIndices: readonly number[], vertexCount: number): ReadonlySet<number> {
    const pinned = new Set<number>();
    for (const index of pinnedIndices) {
        if (!Number.isInteger(index) || index < 0 || index >= vertexCount) {
            throw new Error(
                `Pinned index ${index} is not a vertex of a ${vertexCount}-vertex polygon; `
                + `pins must be integers in [0, ${vertexCount}).`);
        }
        pinned.add(index);
    }
    return pinned;
}

/**
 * How many pinned vertices are still under `noiseFloor` in the ring that came back.
 *
 * Measured on the RESULT rather than tallied as the loop passes them over, so it answers the
 * question the report is about — what the caller is holding — rather than the question of how many
 * times the search happened to look at a pin. A `NaN` floor counts nothing, by the same negated
 * comparison the loop uses.
 */
function countPinnedUnderFloor(
    ring: readonly Vector2[],
    origins: readonly number[],
    pinned: ReadonlySet<number>,
    noiseFloor: number,
): number {
    if (pinned.size === 0) {
        return 0;
    }

    let count = 0;
    for (let index = 0; index < ring.length; index++) {
        if (!pinned.has(origins[index])) {
            continue;
        }
        if (deviationAt(ring, index) < noiseFloor) {
            count += 1;
        }
    }
    return count;
}

/**
 * The perpendicular deviation of `ring[index]` from the chord LINE between its cyclic neighbours.
 *
 * THE ONE PLACE THIS FORMULA IS SPELLED. Both the removal search and the pinned-under-floor tally ask
 * the same question of the ring, and the module header's two choices — deviation over turn angle, and
 * the chord's line over its segment — were each argued once; two hand-written copies of the wraparound
 * arithmetic would be two things to keep in lockstep every time either is revisited.
 */
function deviationAt(ring: readonly Vector2[], index: number): number {
    const previous = ring[(index - 1 + ring.length) % ring.length];
    const next = ring[(index + 1) % ring.length];
    return distanceToSupportingLine(ring[index], previous, next);
}

/** The vertex of a closed ring contributing least to its silhouette, and by how little. */
interface WeakestVertex {
    index: number;
    deviation: number;
}

/**
 * The removable ring vertex with the smallest perpendicular deviation from the chord between its
 * neighbours, or `null` when every remaining vertex is pinned.
 *
 * Ties resolve to the LOWEST INDEX, which is what keeps the fixed point deterministic: an exactly
 * subdivided edge produces runs of vertices whose deviations are bit-identical, and an arbitrary
 * tie-break would make the surviving ring depend on the scan direction.
 *
 * A pinned vertex is skipped as a CANDIDATE but still contributes its position: it remains a
 * neighbour, so the chords either side of it are the chords the surviving ring actually has.
 */
function findWeakestVertex(
    ring: readonly Vector2[],
    origins: readonly number[],
    pinned: ReadonlySet<number>,
): WeakestVertex | null {
    let index = -1;
    let deviation = Infinity;

    for (let candidate = 0; candidate < ring.length; candidate++) {
        if (pinned.has(origins[candidate])) {
            continue;
        }
        const candidateDeviation = deviationAt(ring, candidate);
        if (candidateDeviation < deviation) {
            index = candidate;
            deviation = candidateDeviation;
        }
    }

    return index === -1 ? null : {index, deviation};
}
