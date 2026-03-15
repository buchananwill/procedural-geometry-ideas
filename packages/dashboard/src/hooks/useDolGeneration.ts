import { useState, useEffect, useMemo, useCallback } from 'react';
import type { TurtleOutput } from '@proc-geo/core';
import { generateDolSystem, interpretDolSystem } from '@proc-geo/core';
import { useDolSystemStore } from '../stores/useDolSystemStore';

export interface DolGenerationState {
    currentGeneration: number;
    setCurrentGeneration: (n: number) => void;
    maxGeneration: number;
    isPlaying: boolean;
    playDelay: number;
    setPlayDelay: (ms: number) => void;
    play: () => void;
    pause: () => void;
    stepForward: () => void;
    stepBackward: () => void;
    currentTurtleOutput: TurtleOutput | null;
}

export function useDolGeneration(): DolGenerationState {
    const compiledSystem = useDolSystemStore((s) => s.compiledSystem);
    const generationCount = useDolSystemStore((s) => s.generationCount);
    const turtle = useDolSystemStore((s) => s.config.turtle);

    const [currentGeneration, setCurrentGeneration] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [playDelay, setPlayDelay] = useState(500);

    const maxGeneration = generationCount;

    const currentTurtleOutput = useMemo<TurtleOutput | null>(() => {
        if (!compiledSystem) return null;
        const result = generateDolSystem(compiledSystem, currentGeneration);
        return interpretDolSystem(result, turtle);
    }, [compiledSystem, currentGeneration, turtle]);

    // Reset currentGeneration when compiledSystem changes
    useEffect(() => {
        setCurrentGeneration(0);
        setIsPlaying(false);
    }, [compiledSystem]);

    // Auto-advance playback
    useEffect(() => {
        if (!isPlaying) return;
        if (currentGeneration >= maxGeneration) {
            setIsPlaying(false);
            return;
        }
        const timer = setTimeout(() => {
            setCurrentGeneration((prev) => Math.min(prev + 1, maxGeneration));
        }, playDelay);
        return () => clearTimeout(timer);
    }, [isPlaying, currentGeneration, playDelay, maxGeneration]);

    const play = useCallback(() => {
        if (currentGeneration >= maxGeneration) {
            setCurrentGeneration(0);
        }
        setIsPlaying(true);
    }, [currentGeneration, maxGeneration]);

    const pause = useCallback(() => {
        setIsPlaying(false);
    }, []);

    const stepForward = useCallback(() => {
        setIsPlaying(false);
        setCurrentGeneration((prev) => Math.min(prev + 1, maxGeneration));
    }, [maxGeneration]);

    const stepBackward = useCallback(() => {
        setIsPlaying(false);
        setCurrentGeneration((prev) => Math.max(prev - 1, 0));
    }, []);

    return {
        currentGeneration,
        setCurrentGeneration,
        maxGeneration,
        isPlaying,
        playDelay,
        setPlayDelay,
        play,
        pause,
        stepForward,
        stepBackward,
        currentTurtleOutput,
    };
}
