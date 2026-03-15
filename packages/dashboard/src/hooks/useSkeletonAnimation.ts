import { useState, useEffect, useMemo, useCallback } from "react";
import type {
    StraightSkeletonGraph,
    StraightSkeletonSolverContext,
    PrimaryInteriorEdge,
    Vector2,
} from "@proc-geo/core";
import {
    runAlgorithmV5,
    runAlgorithmV5Stepped,
    computePrimaryInteriorEdges,
    computePrimaryEdgeIntersections,
} from "@proc-geo/core";
import type { SteppedAlgorithmResult } from "@proc-geo/core";
import type { Vertex } from "../stores/usePolygonStore";
import { usePlaybackStore } from "../stores/usePlaybackStore";
import type { PlaybackControllerState } from "./PlaybackControllerState";

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

    solverContext: StraightSkeletonSolverContext | null;
    skeleton: StraightSkeletonGraph | null;
    primaryEdges: PrimaryInteriorEdge[];
    primaryEdgeIntersections: Vector2[];

    startAnimation: () => void;
    exitAnimation: () => void;
}

export function useSkeletonAnimation(vertices: Vertex[]): SkeletonAnimationState {
    const [showSkeleton, setShowSkeleton] = useState(false);
    const [showPrimaryEdges, setShowPrimaryEdges] = useState(false);

    const [animationMode, setAnimationMode] = useState(false);
    const [steppedResult, setSteppedResult] = useState<SteppedAlgorithmResult | null>(null);
    const [errorModalOpen, setErrorModalOpen] = useState(false);

    const currentFrame = usePlaybackStore((s) => s.currentFrame);
    const isPlaying = usePlaybackStore((s) => s.isPlaying);
    const playDelay = usePlaybackStore((s) => s.playDelay);
    const setCurrentFrame = usePlaybackStore((s) => s.setCurrentFrame);
    const setIsPlaying = usePlaybackStore((s) => s.setIsPlaying);
    const setPlayDelay = usePlaybackStore((s) => s.setPlayDelay);
    const resetPlayback = usePlaybackStore((s) => s.resetPlayback);

    const maxStep = steppedResult ? steppedResult.snapshots.length - 1 : 0;

    const solverContext = useMemo<StraightSkeletonSolverContext | null>(() => {
        if (!showSkeleton) return null;
        try {
            return runAlgorithmV5(vertices);
        } catch (e) {
            console.log(e);
            return null;
        }
    }, [showSkeleton, vertices]);

    const skeleton = useMemo<StraightSkeletonGraph | null>(() => {
        if (animationMode && steppedResult && steppedResult.snapshots.length > 0) {
            return steppedResult.snapshots[Math.min(currentFrame, steppedResult.snapshots.length - 1)];
        }
        if (!showSkeleton) return null;
        return solverContext?.graph ?? null;
    }, [showSkeleton, animationMode, steppedResult, currentFrame, solverContext]);

    const primaryEdges = useMemo<PrimaryInteriorEdge[]>(() => {
        if (!showPrimaryEdges) return [];
        return computePrimaryInteriorEdges(vertices);
    }, [showPrimaryEdges, vertices]);

    const primaryEdgeIntersections = useMemo<Vector2[]>(() => {
        if (primaryEdges.length === 0) return [];
        return computePrimaryEdgeIntersections(primaryEdges);
    }, [primaryEdges]);

    // Clear animation state when vertices change
    useEffect(() => {
        setAnimationMode(false);
        setSteppedResult(null);
        resetPlayback();
    }, [vertices, resetPlayback]);

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
        const result = runAlgorithmV5Stepped(vertices);
        setSteppedResult(result);
        resetPlayback();
        setAnimationMode(true);
        setShowSkeleton(true);
        if (result.error) {
            setErrorModalOpen(true);
        }
    }, [vertices, resetPlayback]);

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
        solverContext,
        skeleton,
        primaryEdges,
        primaryEdgeIntersections,
        startAnimation,
        exitAnimation,
    };
}
