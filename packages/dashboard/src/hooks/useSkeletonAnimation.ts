import { useState, useEffect, useMemo, useCallback } from "react";
import type {
    SkeletonLoopMap,
    SkeletonSolveResult,
    StraightSkeletonGraph,
    StraightSkeletonSolverContext,
    PrimaryInteriorEdge,
    Vector2,
} from "@proc-geo/core";
import {
    angularResolution,
    coaxialityFloor,
    computePrimaryInteriorEdges,
    computePrimaryEdgeIntersections,
    resolvePerceptualFloor,
} from "@proc-geo/core";
import type { SteppedAlgorithmResult } from "@proc-geo/core";
import type { StoredHole, Vertex } from "../stores/usePolygonStore";
import { usePlaybackStore } from "../stores/usePlaybackStore";
import type { PlaybackControllerState } from "./PlaybackControllerState";
import {
    adaptHoledSteppedResult,
    solveHoledSkeletonGuarded,
    solveHoledSkeletonSteppedGuarded,
    solveSkeletonBoundary,
    solveSkeletonGuarded,
    solveSkeletonSteppedGuarded,
} from "./skeleton-solve-boundary";
import type { HoledSolveOutcome } from "./skeleton-solve-boundary";

/** No holed solve: the single-loop path's value for it. */
const NO_HOLED_SOLVE: HoledSolveOutcome = { result: null, error: null };

export interface SkeletonAnimationState {
    showSkeleton: boolean;
    setShowSkeleton: (v: boolean | ((prev: boolean) => boolean)) => void;
    showPrimaryEdges: boolean;
    setShowPrimaryEdges: (v: boolean | ((prev: boolean) => boolean)) => void;

    animationMode: boolean;
    steppedResult: SteppedAlgorithmResult | null;
    errorModalOpen: boolean;
    setErrorModalOpen: (v: boolean) => void;

    playback: PlaybackControllerState;
    hasError: boolean;
    errorMessage: string | null;

    /**
     * The solver's own message when it REFUSED this input, else `null` (arc decision 130).
     *
     * Distinct from {@link SkeletonAnimationState.errorMessage}, which is a stepped run that started
     * and then failed. A refusal is the door: the weight ratio is out of contract, or a weight
     * changes at a vertex with no visible corner. The message names the offending edge or vertex and
     * is shown verbatim, because that index is what the user has to go and fix.
     *
     * WHILE THIS IS SET, THE LAST GOOD SOLUTION STAYS ON THE CANVAS. A blanked canvas would tell the
     * user only that something broke; the last picture that solved, beside the refusal's words, tells
     * them what they broke it from.
     */
    solveError: string | null;

    solverContext: StraightSkeletonSolverContext | null;
    skeleton: StraightSkeletonGraph | null;
    /**
     * Input vertex index to solver exterior node, `REMOVED_VERTEX_INDEX` where the boundary stage
     * dropped the vertex as invisible; null for a polygon the solver would refuse.
     *
     * EVERY CONSUMER THAT DRAWS AN INPUT INDEX NEXT TO A SOLVER INDEX NEEDS THIS. The two agree
     * only while nothing is removed, and a vertex clicked onto an edge is removed every time.
     */
    solverVertexRemap: number[] | null;
    /**
     * THE HOLED SOLVE (dashboard holed-fixtures spec, decisions 13 and 14), run whenever holes are loaded, shown or
     * not, so a refusal appears as the outline is dragged. On a refusal the last good holed result stands, as the last
     * good context does on a single loop. `null` on a single loop.
     */
    holedSolve: SkeletonSolveResult | null;
    /** The holed solve's `loopMaps`, one per caller loop; `null` on a single loop or when the holed solve refused. */
    solverLoopMaps: SkeletonLoopMap[] | null;
    primaryEdges: PrimaryInteriorEdge[];
    primaryEdgeIntersections: Vector2[];

    startAnimation: () => void;
    exitAnimation: () => void;
}

/**
 * `perceptualFloor` is the host page's own rendering limit, in unit space, and it reaches all three
 * solver calls below — the direct solve, the stepped solve, and the boundary stage the vertex remap
 * is read from. All three must agree, because the overlay draws input indices against solver indices
 * and a remap computed at a different floor would describe a different polygon.
 *
 * A SCALAR, NOT AN OPTIONS OBJECT, so the memo dependency is a number the caller can hold constant.
 * Omitted, the library default stands and this hook behaves exactly as it did before the option
 * existed. See `PerceptualFloorOptions` in `@proc-geo/core`.
 *
 * `weights` is the per-edge wavefront SPEED array of the weighted-offsets extension, `weights[i]`
 * the speed of the edge leaving vertex `i` (W-spec W1). IT REACHES ALL FOUR DERIVATIONS BELOW, and
 * that is the point of the parameter rather than an implementation detail (W-spec W15, arc decision
 * 114(ii)):
 *
 *  - the direct solve and the stepped solve, because they are what the weights are for;
 *  - the boundary stage the vertex remap is read from, because a weight change at a near-collinear
 *    vertex PINS that vertex (W-spec W44) and a remap computed without the weights would describe a
 *    ring the weighted solve never saw;
 *  - the primary-bisector overlay, because an unweighted overlay drawn over a weighted solve draws
 *    bisectors the solve does not have. That is a wrong picture, not a simplified one.
 *
 * Omitted or empty, everything here is bit-for-bit what it was before weights existed.
 *
 * `holes` are a holed fixture's, read-only (dashboard holed-fixtures spec, decisions 12 to 16). THE HOLED PATH IS
 * TAKEN EXACTLY WHEN `holes` IS NON-EMPTY: every derivation then reads the one holed solve, `solveSkeleton` with
 * holes, and the step-through runs `solveSkeletonStepped`. Omitted or empty, every single-loop path is today's.
 */
export function useSkeletonAnimation(
    vertices: Vertex[],
    perceptualFloor?: number,
    weights?: readonly number[],
    holes?: readonly StoredHole[],
): SkeletonAnimationState {
    const holed = holes !== undefined && holes.length > 0;
    const [showSkeleton, setShowSkeleton] = useState(false);
    const [showPrimaryEdges, setShowPrimaryEdges] = useState(false);

    const [animationMode, setAnimationMode] = useState(false);
    const [steppedResult, setSteppedResult] = useState<SteppedAlgorithmResult | null>(null);
    const [errorModalOpen, setErrorModalOpen] = useState(false);
    // A door refusal met while STARTING a stepped run. The direct solve and the boundary stage below
    // reach the same refusal on their own, so this only has to keep the click from throwing.
    const [startRefusal, setStartRefusal] = useState<string | null>(null);

    const currentFrame = usePlaybackStore((s) => s.currentFrame);
    const isPlaying = usePlaybackStore((s) => s.isPlaying);
    const playDelay = usePlaybackStore((s) => s.playDelay);
    const setCurrentFrame = usePlaybackStore((s) => s.setCurrentFrame);
    const setIsPlaying = usePlaybackStore((s) => s.setIsPlaying);
    const setPlayDelay = usePlaybackStore((s) => s.setPlayDelay);
    const resetPlayback = usePlaybackStore((s) => s.resetPlayback);

    const maxStep = steppedResult ? steppedResult.snapshots.length - 1 : 0;

    const solve = useMemo(() => {
        if (!showSkeleton || holed) return { context: null, error: null };
        return solveSkeletonGuarded(vertices, { perceptualFloor, weights });
    }, [showSkeleton, holed, vertices, perceptualFloor, weights]);

    // THE HOLED SOLVE, IN ONE MEMO, SHOWN OR NOT (decision 13): it is the boundary stage and the final solve at once.
    const holedOutcome = useMemo<HoledSolveOutcome>(() => {
        if (!holed) return NO_HOLED_SOLVE;
        return solveHoledSkeletonGuarded(vertices, { perceptualFloor, weights, holes });
    }, [holed, vertices, perceptualFloor, weights, holes]);

    // THE LAST SOLUTION THAT SOLVED, kept so a refusal leaves a picture on the canvas rather than a
    // blank one (arc decision 130). Held in state and written from an effect, never during render.
    const [lastGoodContext, setLastGoodContext] =
        useState<StraightSkeletonSolverContext | null>(null);
    useEffect(() => {
        if (solve.context !== null) setLastGoodContext(solve.context);
    }, [solve.context]);
    // The holed path's, the same way (decision 14).
    const [lastGoodHoled, setLastGoodHoled] = useState<SkeletonSolveResult | null>(null);
    useEffect(() => {
        if (holedOutcome.result !== null) setLastGoodHoled(holedOutcome.result);
    }, [holedOutcome.result]);
    const holedSolve = !holed ? null : holedOutcome.error !== null ? lastGoodHoled : holedOutcome.result;

    // On a refusal the last good context stands in; with no error it does not, so hiding the
    // skeleton still hides it. On the holed path it is the holed solve's context, gated by the same toggle.
    const solverContext = holed
        ? (showSkeleton ? holedSolve?.context ?? null : null)
        : solve.error !== null ? lastGoodContext : solve.context;

    const skeleton = useMemo<StraightSkeletonGraph | null>(() => {
        if (animationMode && steppedResult && steppedResult.snapshots.length > 0) {
            return steppedResult.snapshots[Math.min(currentFrame, steppedResult.snapshots.length - 1)];
        }
        if (!showSkeleton) return null;
        return solverContext?.graph ?? null;
    }, [showSkeleton, animationMode, steppedResult, currentFrame, solverContext]);

    // Computed whether or not the skeleton is showing, and from the polygon rather than from the
    // solve: it is the boundary stage alone, so it stays valid for the stepped snapshots too.
    // It also runs the WEIGHT DOOR (W-spec W49 runs before canonicalisation), so both refusals are
    // caught here whether or not the skeleton is showing — a bad weight is refused as it is typed.
    // ON THE HOLED PATH THE HOLED SOLVE IS THE BOUNDARY STAGE (decision 13): `canonicaliseForSolve` stays single-loop,
    // and the remap is the outline's loop map (decision 14).
    const boundary = useMemo(
        () => holed ? { indexRemap: null, error: null } : solveSkeletonBoundary(vertices, { perceptualFloor, weights }),
        [holed, vertices, perceptualFloor, weights]);
    const solverLoopMaps = holedSolve?.loopMaps ?? null;
    const solverVertexRemap = holed ? solverLoopMaps?.[0]?.vertexToNode ?? null : boundary.indexRemap;

    // The coaxiality lane the overlay's ray intersections are answered at (spec A9/A10): the host
    // page's own floor, resolved exactly as the solve resolves it, so the drawing and the solve
    // agree about which two lines are one line.
    const overlayFloor = resolvePerceptualFloor({ perceptualFloor });
    const overlayCoaxialityFloor = coaxialityFloor(overlayFloor);
    // And the angular resolution (spec A1), from the same resolved floor, for the same reason: the
    // overlay and the solve agree about which two directions are one direction.
    const overlayAngularResolution = angularResolution(overlayFloor);

    const primaryEdges = useMemo<PrimaryInteriorEdge[]>(() => {
        if (!showPrimaryEdges) return [];
        if (holed) {
            // THE HOLED PREVIEW (decision 12): the holed graph's exterior positions, in exterior id order, at the
            // weights the solve ran on, with its loop table, so every vertex's two walls wrap in its own loop.
            const graph = holedSolve?.context !== null ? holedSolve?.graph : undefined;
            if (holedSolve === null || graph === undefined) return [];
            try {
                return computePrimaryInteriorEdges(
                    graph.nodes.slice(0, graph.numExteriorNodes).map(node => node.position),
                    overlayCoaxialityFloor, overlayAngularResolution, holedSolve.weights, graph.loops);
            } catch {
                return [];
            }
        }
        try {
            // W-spec W15 / arc decision 114(ii): the overlay is drawn at the SOLVE's weights.
            return computePrimaryInteriorEdges(
                vertices, overlayCoaxialityFloor, overlayAngularResolution, weights);
        } catch {
            // A weights array of the wrong length is refused rather than padded; the overlay is a
            // drawing, so it goes away rather than taking the canvas down with it.
            return [];
        }
    }, [showPrimaryEdges, holed, holedSolve, vertices, overlayCoaxialityFloor, overlayAngularResolution, weights]);

    const primaryEdgeIntersections = useMemo<Vector2[]>(() => {
        if (primaryEdges.length === 0) return [];
        return computePrimaryEdgeIntersections(
            primaryEdges, overlayCoaxialityFloor, overlayAngularResolution);
    }, [primaryEdges, overlayCoaxialityFloor, overlayAngularResolution]);

    // Clear animation state when the polygon, its weights or its holes change (decision 14)
    useEffect(() => {
        setAnimationMode(false);
        setSteppedResult(null);
        setStartRefusal(null);
        resetPlayback();
    }, [vertices, weights, holes, resetPlayback]);

    // Auto-advance playback timer
    useEffect(() => {
        if (!isPlaying || !steppedResult) return;
        if (currentFrame >= maxStep) {
            setIsPlaying(false);
            return;
        }
        const timer = setTimeout(() => {
            setCurrentFrame(Math.min(currentFrame + 1, maxStep));
        }, playDelay);
        return () => clearTimeout(timer);
    }, [isPlaying, currentFrame, playDelay, steppedResult, maxStep, setCurrentFrame, setIsPlaying]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            setIsPlaying(false);
        };
    }, [setIsPlaying]);

    const startAnimation = useCallback(() => {
        if (holed) {
            // THE HOLED STEP-THROUGH (decisions 12 and 16): `solveSkeletonStepped`, adapted to the panel's shape, its
            // error the `Skeleton incomplete` text.
            const holedStepped = solveHoledSkeletonSteppedGuarded(vertices, { perceptualFloor, weights, holes });
            if (holedStepped.result === null) {
                setStartRefusal(holedStepped.error);
                return;
            }
            const adapted = adaptHoledSteppedResult(holedStepped.result);
            setStartRefusal(null);
            setSteppedResult(adapted);
            resetPlayback();
            setAnimationMode(true);
            setShowSkeleton(true);
            if (adapted.error) {
                setErrorModalOpen(true);
            }
            return;
        }
        const outcome = solveSkeletonSteppedGuarded(vertices, { perceptualFloor, weights });
        if (outcome.result === null) {
            // The door refused before a single step ran. There is nothing to step through, so the
            // run does not start; the refusal is reported through `solveError` like any other.
            setStartRefusal(outcome.error);
            return;
        }
        setStartRefusal(null);
        setSteppedResult(outcome.result);
        resetPlayback();
        setAnimationMode(true);
        setShowSkeleton(true);
        if (outcome.result.error) {
            setErrorModalOpen(true);
        }
    }, [holed, holes, vertices, resetPlayback, perceptualFloor, weights]);

    const togglePlayPause = useCallback(() => {
        if (!steppedResult) {
            setIsPlaying(false);
            return;
        }
        if (currentFrame >= steppedResult.snapshots.length - 1) {
            setCurrentFrame(0);
            setIsPlaying(true);
        } else {
            setIsPlaying(!isPlaying);
        }
    }, [steppedResult, currentFrame, isPlaying, setCurrentFrame, setIsPlaying]);

    const stepForward = useCallback(() => {
        if (!steppedResult) return;
        setIsPlaying(false);
        setCurrentFrame(Math.min(currentFrame + 1, steppedResult.snapshots.length - 1));
    }, [steppedResult, currentFrame, setCurrentFrame, setIsPlaying]);

    const stepBackward = useCallback(() => {
        setIsPlaying(false);
        setCurrentFrame(Math.max(currentFrame - 1, 0));
    }, [currentFrame, setCurrentFrame, setIsPlaying]);

    const exitAnimation = useCallback(() => {
        setAnimationMode(false);
        setSteppedResult(null);
        resetPlayback();
    }, [resetPlayback]);

    const hasError = steppedResult?.error != null;
    const errorMessage = steppedResult?.error ?? null;

    // ONE REFUSAL, WHICHEVER BOUNDARY MET IT FIRST. The boundary stage runs on every keystroke, so
    // it is the one that normally speaks; the direct solve and the stepped start are behind it.
    // On the holed path the holed solve is the boundary and the solve at once (decision 13).
    const solveError = holed
        ? holedOutcome.error ?? startRefusal
        : boundary.error ?? solve.error ?? startRefusal;

    const play = useCallback(() => {
        if (currentFrame >= maxStep) {
            setCurrentFrame(0);
        }
        setIsPlaying(true);
    }, [currentFrame, maxStep, setCurrentFrame, setIsPlaying]);

    const pause = useCallback(() => {
        setIsPlaying(false);
    }, [setIsPlaying]);

    const playback: PlaybackControllerState = {
        currentFrame,
        maxFrame: maxStep,
        isPlaying,
        playDelay,
        setCurrentFrame,
        setPlayDelay,
        play,
        pause,
        togglePlayPause,
        stepForward,
        stepBackward,
        frameLabel: `Step ${currentFrame} / ${maxStep}`,
    };

    return {
        showSkeleton,
        setShowSkeleton,
        showPrimaryEdges,
        setShowPrimaryEdges,
        animationMode,
        steppedResult,
        errorModalOpen,
        setErrorModalOpen,
        playback,
        hasError,
        errorMessage,
        solveError,
        solverContext,
        skeleton,
        solverVertexRemap,
        holedSolve,
        solverLoopMaps,
        primaryEdges,
        primaryEdgeIntersections,
        startAnimation,
        exitAnimation,
    };
}
