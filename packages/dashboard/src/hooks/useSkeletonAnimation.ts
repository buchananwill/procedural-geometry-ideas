import { useState, useEffect, useMemo, useCallback } from "react";
import type {
    StraightSkeletonGraph,
    StraightSkeletonSolverContext,
    PrimaryInteriorEdge,
    Vector2,
} from "@proc-geo/core";
import {
    coaxialityFloor,
    computePrimaryInteriorEdges,
    computePrimaryEdgeIntersections,
    resolvePerceptualFloor,
} from "@proc-geo/core";
import type { SteppedAlgorithmResult } from "@proc-geo/core";
import type { Vertex } from "../stores/usePolygonStore";
import { usePlaybackStore } from "../stores/usePlaybackStore";
import type { PlaybackControllerState } from "./PlaybackControllerState";
import {
    solveSkeletonBoundary,
    solveSkeletonGuarded,
    solveSkeletonSteppedGuarded,
} from "./skeleton-solve-boundary";

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
 */
export function useSkeletonAnimation(
    vertices: Vertex[],
    perceptualFloor?: number,
    weights?: readonly number[],
): SkeletonAnimationState {
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
        if (!showSkeleton) return { context: null, error: null };
        return solveSkeletonGuarded(vertices, { perceptualFloor, weights });
    }, [showSkeleton, vertices, perceptualFloor, weights]);

    // THE LAST SOLUTION THAT SOLVED, kept so a refusal leaves a picture on the canvas rather than a
    // blank one (arc decision 130). Held in state and written from an effect, never during render.
    const [lastGoodContext, setLastGoodContext] =
        useState<StraightSkeletonSolverContext | null>(null);
    useEffect(() => {
        if (solve.context !== null) setLastGoodContext(solve.context);
    }, [solve.context]);

    // On a refusal the last good context stands in; with no error it does not, so hiding the
    // skeleton still hides it.
    const solverContext = solve.error !== null ? lastGoodContext : solve.context;

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
    const boundary = useMemo(
        () => solveSkeletonBoundary(vertices, { perceptualFloor, weights }),
        [vertices, perceptualFloor, weights]);
    const solverVertexRemap = boundary.indexRemap;

    // The coaxiality lane the overlay's ray intersections are answered at (spec A9/A10): the host
    // page's own floor, resolved exactly as the solve resolves it, so the drawing and the solve
    // agree about which two lines are one line.
    const overlayCoaxialityFloor = coaxialityFloor(resolvePerceptualFloor({ perceptualFloor }));

    const primaryEdges = useMemo<PrimaryInteriorEdge[]>(() => {
        if (!showPrimaryEdges) return [];
        try {
            // W-spec W15 / arc decision 114(ii): the overlay is drawn at the SOLVE's weights.
            return computePrimaryInteriorEdges(vertices, overlayCoaxialityFloor, weights);
        } catch {
            // A weights array of the wrong length is refused rather than padded; the overlay is a
            // drawing, so it goes away rather than taking the canvas down with it.
            return [];
        }
    }, [showPrimaryEdges, vertices, overlayCoaxialityFloor, weights]);

    const primaryEdgeIntersections = useMemo<Vector2[]>(() => {
        if (primaryEdges.length === 0) return [];
        return computePrimaryEdgeIntersections(primaryEdges, overlayCoaxialityFloor);
    }, [primaryEdges, overlayCoaxialityFloor]);

    // Clear animation state when the polygon or its weights change
    useEffect(() => {
        setAnimationMode(false);
        setSteppedResult(null);
        setStartRefusal(null);
        resetPlayback();
    }, [vertices, weights, resetPlayback]);

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
    }, [vertices, resetPlayback, perceptualFloor, weights]);

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
    const solveError = boundary.error ?? solve.error ?? startRefusal;

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
        primaryEdges,
        primaryEdgeIntersections,
        startAnimation,
        exitAnimation,
    };
}
