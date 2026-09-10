import { canonicaliseForSolve, runAlgorithmV5, runAlgorithmV5Stepped } from "@proc-geo/core";
import type {
    SteppedAlgorithmResult,
    StraightSkeletonSolverContext,
} from "@proc-geo/core";
import type { Vertex } from "../stores/usePolygonStore";

/*
 * ============================================================================
 *  THE SOLVE BOUNDARY: WHERE A REFUSAL BECOMES A MESSAGE
 * ============================================================================
 *
 * Arc decision 130. The weighted solver refuses two configurations AT ITS DOOR, before it looks at
 * any geometry it could recover from:
 *
 *   - the RATIO refusal (W-spec W3/W48, decision 119) — `max / min` weight above `MAX_WEIGHT_RATIO`;
 *   - the VISIBLE-CORNER refusal (W-spec W49, decision 124(b)) — a weight change at a vertex whose
 *     turn sine is below `MIN_WEIGHT_TURN_SINE`.
 *
 * Both are thrown `Error`s naming the offending edge or vertex. A UI that lets a user type a weight
 * can reach either one on any keystroke, so the throw has to become a value at exactly one place —
 * here — and the message the solver wrote has to survive the trip, because it names the index the
 * user has to go and fix.
 *
 * PLAIN FUNCTIONS, NO HOOKS. `useSkeletonAnimation` calls these from its memos; the dashboard has no
 * React renderer in its dev dependencies, so keeping the try/catch out here is also the only way the
 * refusal path is convictable by a test at all.
 */

/** Solver inputs the dashboard threads through every call it makes. */
export interface SkeletonSolveOptions {
    /** The host page's own rendering limit, in unit space. Omitted, the library default stands. */
    perceptualFloor?: number;
    /** Per-edge wavefront speed, parallel to the vertices. Omitted or empty, the solve is unweighted. */
    weights?: readonly number[];
}

/** A refusal's own words, or a stand-in when something that was not an `Error` came out. */
export function describeSolverRefusal(thrown: unknown): string {
    if (thrown instanceof Error) return thrown.message;
    return String(thrown);
}

export interface SkeletonBoundaryOutcome {
    /**
     * Input vertex index to solver exterior node, or `null` when the boundary stage refused the
     * polygon. Never a partial remap: a refused polygon has no solver indices to map onto.
     */
    indexRemap: number[] | null;
    /** The solver's own message when the boundary refused this input, else `null`. */
    error: string | null;
}

/**
 * The boundary stage alone — canonicalisation, which runs the weight door first (W-spec W49) and so
 * reaches BOTH refusals without paying for a solve.
 *
 * This is what makes the error visible whether or not the skeleton is being drawn: a bad weight is
 * refused the moment it is typed, not the next time someone presses "Show Skeleton".
 */
export function solveSkeletonBoundary(
    vertices: Vertex[],
    options: SkeletonSolveOptions,
): SkeletonBoundaryOutcome {
    if (vertices.length < 3) return { indexRemap: null, error: null };
    try {
        return { indexRemap: canonicaliseForSolve(vertices, options).indexRemap, error: null };
    } catch (thrown) {
        return { indexRemap: null, error: describeSolverRefusal(thrown) };
    }
}

export interface SkeletonSolveOutcome {
    /** The solved context, or `null` when the solver refused or failed. */
    context: StraightSkeletonSolverContext | null;
    /** The solver's own message when it refused or failed, else `null`. */
    error: string | null;
}

/** The direct solve, with its throw turned into a message the panel can show. */
export function solveSkeletonGuarded(
    vertices: Vertex[],
    options: SkeletonSolveOptions,
): SkeletonSolveOutcome {
    try {
        return { context: runAlgorithmV5(vertices, options), error: null };
    } catch (thrown) {
        return { context: null, error: describeSolverRefusal(thrown) };
    }
}

export interface SteppedSolveOutcome {
    /**
     * The stepped run, or `null` when the door refused the input before any step was taken. A run
     * that started and then failed is NOT null — it carries its own `error` and its partial
     * snapshots, which is a different thing from a refusal and is displayed differently.
     */
    result: SteppedAlgorithmResult | null;
    /** The door's message when nothing ran at all, else `null`. */
    error: string | null;
}

/** The stepped solve, with the door's throw turned into a message. */
export function solveSkeletonSteppedGuarded(
    vertices: Vertex[],
    options: SkeletonSolveOptions,
): SteppedSolveOutcome {
    try {
        return { result: runAlgorithmV5Stepped(vertices, options), error: null };
    } catch (thrown) {
        return { result: null, error: describeSolverRefusal(thrown) };
    }
}
