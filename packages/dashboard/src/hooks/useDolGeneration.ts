import { useEffect, useMemo, useCallback } from 'react';
import type { TurtleOutput } from '@proc-geo/core';
import { generateDolSystem, interpretDolSystem } from '@proc-geo/core';
import { useDolSystemStore } from '../stores/useDolSystemStore';
import { usePlaybackStore } from '../stores/usePlaybackStore';
import type { PlaybackControllerState } from './PlaybackControllerState';

export interface DolGenerationState {
    playback: PlaybackControllerState;
    currentTurtleOutput: TurtleOutput | null;
}

export function useDolGeneration(): DolGenerationState {
    const compiledSystem = useDolSystemStore((s) => s.compiledSystem);
    const generationCount = useDolSystemStore((s) => s.generationCount);
    const turtle = useDolSystemStore((s) => s.config.turtle);
    const maxWordLength = useDolSystemStore((s) => s.maxWordLength);

    const currentFrame = usePlaybackStore((s) => s.currentFrame);
    const isPlaying = usePlaybackStore((s) => s.isPlaying);
    const playDelay = usePlaybackStore((s) => s.playDelay);
    const setCurrentFrame = usePlaybackStore((s) => s.setCurrentFrame);
    const setIsPlaying = usePlaybackStore((s) => s.setIsPlaying);
    const setPlayDelay = usePlaybackStore((s) => s.setPlayDelay);
    const resetPlayback = usePlaybackStore((s) => s.resetPlayback);
    const clampToMax = usePlaybackStore((s) => s.clampToMax);

    const maxFrame = generationCount;

    const currentTurtleOutput = useMemo<TurtleOutput | null>(() => {
        if (!compiledSystem) return null;
        const result = generateDolSystem(compiledSystem, currentFrame, maxWordLength);
        return interpretDolSystem(result, turtle);
    }, [compiledSystem, currentFrame, turtle, maxWordLength]);

    // Reset playback when compiledSystem changes
    useEffect(() => {
        resetPlayback();
    }, [compiledSystem, resetPlayback]);

    // Clamp when generationCount changes
    useEffect(() => {
        clampToMax(generationCount);
    }, [generationCount, clampToMax]);

    // Auto-advance playback
    useEffect(() => {
        if (!isPlaying) return;
        if (currentFrame >= maxFrame) {
            setIsPlaying(false);
            return;
        }
        const timer = setTimeout(() => {
            setCurrentFrame(Math.min(currentFrame + 1, maxFrame));
        }, playDelay);
        return () => clearTimeout(timer);
    }, [isPlaying, currentFrame, playDelay, maxFrame, setCurrentFrame, setIsPlaying]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            setIsPlaying(false);
        };
    }, [setIsPlaying]);

    const play = useCallback(() => {
        if (currentFrame >= maxFrame) {
            setCurrentFrame(0);
        }
        setIsPlaying(true);
    }, [currentFrame, maxFrame, setCurrentFrame, setIsPlaying]);

    const pause = useCallback(() => {
        setIsPlaying(false);
    }, [setIsPlaying]);

    const togglePlayPause = useCallback(() => {
        if (isPlaying) {
            setIsPlaying(false);
        } else {
            if (currentFrame >= maxFrame) {
                setCurrentFrame(0);
            }
            setIsPlaying(true);
        }
    }, [isPlaying, currentFrame, maxFrame, setCurrentFrame, setIsPlaying]);

    const stepForward = useCallback(() => {
        setIsPlaying(false);
        setCurrentFrame(Math.min(currentFrame + 1, maxFrame));
    }, [currentFrame, maxFrame, setCurrentFrame, setIsPlaying]);

    const stepBackward = useCallback(() => {
        setIsPlaying(false);
        setCurrentFrame(Math.max(currentFrame - 1, 0));
    }, [currentFrame, setCurrentFrame, setIsPlaying]);

    const playback: PlaybackControllerState = {
        currentFrame,
        maxFrame,
        isPlaying,
        playDelay,
        setCurrentFrame,
        setPlayDelay,
        play,
        pause,
        togglePlayPause,
        stepForward,
        stepBackward,
        frameLabel: `Gen ${currentFrame} / ${maxFrame}`,
    };

    return {
        playback,
        currentTurtleOutput,
    };
}
