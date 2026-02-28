import { useState, useEffect, useMemo } from "react";
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

export interface SkeletonAnimationState {
    showSkeleton: boolean;
    setShowSkeleton: (v: boolean | ((prev: boolean) => boolean)) => void;
    showPrimaryEdges: boolean;
    setShowPrimaryEdges: (v: boolean | ((prev: boolean) => boolean)) => void;

    animationMode: boolean;
    steppedResult: SteppedAlgorithmResult | null;
    currentStep: number;
    setCurrentStep: (v: number | ((prev: number) => number)) => void;
    isPlaying: boolean;
    setIsPlaying: (v: boolean | ((prev: boolean) => boolean)) => void;
    stepDelay: number;
    setStepDelay: (v: number) => void;
    errorModalOpen: boolean;
    setErrorModalOpen: (v: boolean) => void;
    maxStep: number;

    solverContext: StraightSkeletonSolverContext | null;
    skeleton: StraightSkeletonGraph | null;
    primaryEdges: PrimaryInteriorEdge[];
    primaryEdgeIntersections: Vector2[];

    startAnimation: () => void;
    togglePlayPause: () => void;
    stepForward: () => void;
    stepBackward: () => void;
    exitAnimation: () => void;
}

export function useSkeletonAnimation(vertices: Vertex[]): SkeletonAnimationState {
    const [showSkeleton, setShowSkeleton] = useState(false);
    const [showPrimaryEdges, setShowPrimaryEdges] = useState(false);

    const [animationMode, setAnimationMode] = useState(false);
    const [steppedResult, setSteppedResult] = useState<SteppedAlgorithmResult | null>(null);
    const [currentStep, setCurrentStep] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [stepDelay, setStepDelay] = useState(500);
    const [errorModalOpen, setErrorModalOpen] = useState(false);

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
            return steppedResult.snapshots[Math.min(currentStep, steppedResult.snapshots.length - 1)];
        }
        if (!showSkeleton) return null;
        return solverContext?.graph ?? null;
    }, [showSkeleton, animationMode, steppedResult, currentStep, solverContext]);

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
        setIsPlaying(false);
        setCurrentStep(0);
    }, [vertices]);

    // Auto-advance playback timer
    useEffect(() => {
        if (!isPlaying || !steppedResult) return;
        const maxStep = steppedResult.snapshots.length - 1;
        if (currentStep >= maxStep) {
            setIsPlaying(false);
            return;
        }
        const timer = setTimeout(() => {
            setCurrentStep(prev => Math.min(prev + 1, maxStep));
        }, stepDelay);
        return () => clearTimeout(timer);
    }, [isPlaying, currentStep, stepDelay, steppedResult]);

    function startAnimation() {
        const result = runAlgorithmV5Stepped(vertices);
        setSteppedResult(result);
        setCurrentStep(0);
        setAnimationMode(true);
        setShowSkeleton(true);
        setIsPlaying(false);
        if (result.error) {
            setErrorModalOpen(true);
        }
    }

    function togglePlayPause() {
        if (!steppedResult) return;
        if (currentStep >= steppedResult.snapshots.length - 1) {
            setCurrentStep(0);
            setIsPlaying(true);
        } else {
            setIsPlaying(prev => !prev);
        }
    }

    function stepForward() {
        if (!steppedResult) return;
        setIsPlaying(false);
        setCurrentStep(prev => Math.min(prev + 1, steppedResult.snapshots.length - 1));
    }

    function stepBackward() {
        setIsPlaying(false);
        setCurrentStep(prev => Math.max(prev - 1, 0));
    }

    function exitAnimation() {
        setAnimationMode(false);
        setSteppedResult(null);
        setIsPlaying(false);
        setCurrentStep(0);
    }

    const maxStep = steppedResult ? steppedResult.snapshots.length - 1 : 0;

    return {
        showSkeleton,
        setShowSkeleton,
        showPrimaryEdges,
        setShowPrimaryEdges,
        animationMode,
        steppedResult,
        currentStep,
        setCurrentStep,
        isPlaying,
        setIsPlaying,
        stepDelay,
        setStepDelay,
        errorModalOpen,
        setErrorModalOpen,
        maxStep,
        solverContext,
        skeleton,
        primaryEdges,
        primaryEdgeIntersections,
        startAnimation,
        togglePlayPause,
        stepForward,
        stepBackward,
        exitAnimation,
    };
}
