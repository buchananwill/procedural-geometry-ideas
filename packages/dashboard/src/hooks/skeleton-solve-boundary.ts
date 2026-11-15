import {
    canonicaliseForSolve,
    runAlgorithmV5,
    runAlgorithmV5Stepped,
    solveSkeleton,
    solveSkeletonStepped,
} from "@proc-geo/core";
import type {
    SkeletonDiagnostic,
    SkeletonLoopMap,
    SkeletonSolveResult,
    SteppedAlgorithmResult,
    SteppedSkeletonSolveResult,
    StraightSkeletonSolverContext,
} from "@proc-geo/core";
import {
    BLOCKING_DIAGNOSTIC_HEADINGS,
    isBlockingDiagnosticKind,
    STEP_REFUSAL_KINDS,
} from "../components/holed-fixture-text";
import type { Vertex } from "../stores/usePolygonStore";

/*
 * ============================================================================
 *  THE SOLVE BOUNDARY: WHERE A REFUSAL BECOMES A MESSAGE
 * ============================================================================
 *
 * Arc decision 130. The weighted solver refuses two configurations AT ITS DOOR, before it looks at
 * any geometry it could recover from:
 *
 *   - the RATIO refusal (W-spec W3/W48, decision 119) — `max / min` weight above `maxWeightRatio(δ)`
 *     (C8 spec T22; it was the retired `MAX_WEIGHT_RATIO = 100`);
 *   - the VISIBLE-CORNER refusal (W-spec W49, decision 124(b)) — a weight change at a vertex whose
 *     turn sine is below `minWeightTurnSine(δ, Δw)` (C8 spec T21).
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
    /**
     * The holes of a holed fixture, each with its own weights (dashboard holed-fixtures spec, decision 12). Read only
     * by the holed functions below; the three single-loop functions never pass it on, so their calls are today's.
     */
    holes?: readonly { vertices: Vertex[]; weights?: readonly number[] }[];
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
        return { indexRemap: canonicaliseForSolve(vertices, singleLoopOptions(options)).indexRemap, error: null };
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
        return { context: runAlgorithmV5(vertices, singleLoopOptions(options)), error: null };
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
        return { result: runAlgorithmV5Stepped(vertices, singleLoopOptions(options)), error: null };
    } catch (thrown) {
        return { result: null, error: describeSolverRefusal(thrown) };
    }
}

/**
 * The options the three single-loop functions pass on: the floor and the weights, exactly the object they always
 * passed, so the legacy entries never see a `holes` field (which they would refuse) and their calls are today's.
 */
function singleLoopOptions(options: SkeletonSolveOptions): { perceptualFloor?: number; weights?: readonly number[] } {
    if (options.holes === undefined) {
        return options;
    }
    return { perceptualFloor: options.perceptualFloor, weights: options.weights };
}

/** The options of a holed solve, as `solveSkeleton` takes them (decision 12). */
function holedSolveOptionsOf(options: SkeletonSolveOptions) {
    return {
        perceptualFloor: options.perceptualFloor,
        weights: options.weights,
        holes: (options.holes ?? []).map((hole) => ({ vertices: hole.vertices, weights: hole.weights })),
    };
}

export interface HoledSolveOutcome {
    /** The holed solve, or `null` when core refused the input. */
    result: SkeletonSolveResult | null;
    /** Core's own message when it refused, verbatim (decision 36), else `null`. */
    error: string | null;
}

/**
 * THE HOLED SOLVE, with its throw turned into a message (decision 15). It is the boundary stage and the final solve
 * at once (decision 13): `canonicaliseForSolve` stays single-loop, so a refusal of a hole that crosses the outline, or
 * of an outline dragged across its hole, is met here, and the remap is the result's `loopMaps`.
 */
export function solveHoledSkeletonGuarded(vertices: Vertex[], options: SkeletonSolveOptions): HoledSolveOutcome {
    try {
        return { result: solveSkeleton(vertices, holedSolveOptionsOf(options)), error: null };
    } catch (thrown) {
        return { result: null, error: describeSolverRefusal(thrown) };
    }
}

export interface HoledSteppedSolveOutcome {
    /** The holed stepped solve, or `null` when core refused the input before any step. */
    result: SteppedSkeletonSolveResult | null;
    /** Core's own message when it refused, verbatim, else `null`. */
    error: string | null;
}

/** The holed stepped solve, `solveSkeletonStepped`, with its throw turned into a message (decision 15). */
export function solveHoledSkeletonSteppedGuarded(
    vertices: Vertex[],
    options: SkeletonSolveOptions,
): HoledSteppedSolveOutcome {
    try {
        return { result: solveSkeletonStepped(vertices, holedSolveOptionsOf(options)), error: null };
    } catch (thrown) {
        return { result: null, error: describeSolverRefusal(thrown) };
    }
}

/**
 * The `Skeleton incomplete` alert's text (decisions 15 and 37): each blocking diagnostic as its kind's heading, then
 * its `detail` verbatim, in the order core reported them. `null` when no diagnostic blocks.
 *
 * A REFUSAL READS AS A REFUSAL, ITS DETAIL ONCE (BSA.D323). Core's `refuseStep` pushes the refusal and throws the same
 * text, which `stepAlgorithm` records again as a `step-failure` with the identical detail. Such a `step-failure` is
 * the refusal's echo, not a second event, so it is left out; a `step-failure` whose detail no refusal carries is a
 * genuine throw and keeps its own heading.
 */
export function describeBlockingDiagnostics(diagnostics: readonly SkeletonDiagnostic[]): string | null {
    const refusalDetails = new Set(diagnostics
        .filter((diagnostic) => (STEP_REFUSAL_KINDS as readonly string[]).includes(diagnostic.kind))
        .map((diagnostic) => diagnostic.detail));
    const lines: string[] = [];
    for (const diagnostic of diagnostics) {
        if (diagnostic.kind === "step-failure" && refusalDetails.has(diagnostic.detail)) continue;
        if (isBlockingDiagnosticKind(diagnostic.kind)) {
            lines.push(`${BLOCKING_DIAGNOSTIC_HEADINGS[diagnostic.kind]}\n${diagnostic.detail}`);
        }
    }
    return lines.length === 0 ? null : lines.join("\n\n");
}

/** What the canvas and the panels read of the holed solve, given the current outcome and the last one that solved. */
export interface HoledSolveView {
    /** The holed result on screen: the current one, or the last good one while core refuses. `null` on a single loop. */
    holedSolve: SkeletonSolveResult | null;
    /** True while core refuses the CURRENT loops (the outline as it now stands, with its holes). */
    refused: boolean;
    /**
     * The current solve's `loopMaps`. `null` WHILE A REFUSAL STANDS (BSA.D323): the last good result's maps describe
     * the last good outline, and indexed against the current one they put a removed mark, an arrow's direction or a
     * label on the wrong vertex, and miscount the removed vertices.
     */
    solverLoopMaps: SkeletonLoopMap[] | null;
    /** The outline's map, `solverLoopMaps[0].vertexToNode`, under the same rule. */
    solverVertexRemap: number[] | null;
}

/**
 * The holed solve as `useSkeletonAnimation` exposes it (decision 14, as amended by BSA.D323): on a refusal the last
 * good result stays on screen, but nothing indexed by the caller's vertices is taken from it.
 */
export function holedSolveView(
    holed: boolean,
    outcome: HoledSolveOutcome,
    lastGood: SkeletonSolveResult | null,
): HoledSolveView {
    if (!holed) return { holedSolve: null, refused: false, solverLoopMaps: null, solverVertexRemap: null };
    if (outcome.error !== null) {
        return { holedSolve: lastGood, refused: true, solverLoopMaps: null, solverVertexRemap: null };
    }
    const solverLoopMaps = outcome.result?.loopMaps ?? null;
    return {
        holedSolve: outcome.result,
        refused: false,
        solverLoopMaps,
        solverVertexRemap: solverLoopMaps?.[0]?.vertexToNode ?? null,
    };
}

/**
 * A holed step-through as the panel's stepped shape (decision 16): its snapshots, and the `Skeleton incomplete` text
 * as its error, so `AlgorithmPanel`'s error label and modal serve both paths.
 */
export function adaptHoledSteppedResult(stepped: SteppedSkeletonSolveResult): SteppedAlgorithmResult {
    return { snapshots: stepped.snapshots, error: describeBlockingDiagnostics(stepped.result.diagnostics) };
}
