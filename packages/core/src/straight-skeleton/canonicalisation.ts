import {distanceToSegment} from '../stroke-spline/vertex-budget';
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
 * vertices has tiny turn angles and can bow visibly far off its chord. `distanceToSegment` is reused
 * from `vertex-budget.ts` rather than reimplemented — it is already the predicate this codebase's RDP
 * simplification is built on, and a second copy would be a second thing to keep correct.
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
}

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
 * Returns fresh vertex objects and never aliases the input, matching `vertex-budget.ts`, so a caller
 * mutating the result cannot reach back into the polygon it passed in.
 */
export function canonicalisePolygon(
    vertices: readonly Vector2[],
    noiseFloor: number,
): CanonicalPolygon {
    const surviving: Vector2[] = vertices.map(vertex => ({x: vertex.x, y: vertex.y}));

    let removedCount = 0;
    let maxDeviation = 0;

    while (surviving.length > MINIMUM_RING_SIZE) {
        const weakest = findWeakestVertex(surviving);
        // NEGATED RATHER THAN `>=`, so a `NaN` floor breaks the loop instead of spinning on it.
        if (!(weakest.deviation < noiseFloor)) {
            break;
        }

        surviving.splice(weakest.index, 1);
        removedCount += 1;
        maxDeviation = Math.max(maxDeviation, weakest.deviation);
    }

    return {vertices: surviving, removedCount, maxDeviation};
}

/** The vertex of a closed ring contributing least to its silhouette, and by how little. */
interface WeakestVertex {
    index: number;
    deviation: number;
}

/**
 * The ring vertex with the smallest perpendicular deviation from the chord between its neighbours.
 *
 * Ties resolve to the LOWEST INDEX, which is what keeps the fixed point deterministic: an exactly
 * subdivided edge produces runs of vertices whose deviations are bit-identical, and an arbitrary
 * tie-break would make the surviving ring depend on the scan direction.
 */
function findWeakestVertex(ring: readonly Vector2[]): WeakestVertex {
    let index = 0;
    let deviation = Infinity;

    for (let candidate = 0; candidate < ring.length; candidate++) {
        const previous = ring[(candidate - 1 + ring.length) % ring.length];
        const next = ring[(candidate + 1) % ring.length];
        const candidateDeviation = distanceToSegment(ring[candidate], previous, next);
        if (candidateDeviation < deviation) {
            index = candidate;
            deviation = candidateDeviation;
        }
    }

    return {index, deviation};
}
