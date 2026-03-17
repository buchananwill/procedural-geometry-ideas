import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { current } from 'immer';
import type {
    SystemConfig,
    CompiledSystem,
    GenerationResult,
    TurtleOutput,
    Keyword,
    Letter,
    DolSymbol,
    TurtleConfig,
} from '@proc-geo/core';
import {
    compileDolSystem,
    generateDolSystem,
    interpretDolSystem,
    DolSystemValidationError,
} from '@proc-geo/core';
import { DOL_PRESETS } from '../dol-system/presets';

export interface DolSystemStoreState {
    config: SystemConfig;
    generationCount: number;
    compiledSystem: CompiledSystem | null;
    generationResult: GenerationResult | null;
    turtleOutput: TurtleOutput | null;
    compilationError: string | null;
    isStale: boolean;
    maxWordLength: number;
    wordTruncated: boolean;
    skipProvenance: boolean;

    loadPreset: (name: string) => void;
    setGenerationCount: (n: number) => void;
    setMaxWordLength: (n: number) => void;
    triggerGeneration: () => void;
    setAlphabet: (letter: Letter, definition: Keyword[]) => void;
    addLetter: (letter: Letter, definition: Keyword[]) => void;
    removeLetter: (letter: Letter) => void;
    setProduction: (letter: Letter, rhs: DolSymbol[]) => void;
    setAxiom: (axiom: DolSymbol[]) => void;
    setTurtleParam: (key: keyof TurtleConfig, value: number) => void;
    loadConfig: (config: SystemConfig) => void;
    setSkipProvenance: (v: boolean) => void;
}

function recompile(s: Pick<DolSystemStoreState, 'config' | 'generationCount' | 'compiledSystem' | 'generationResult' | 'turtleOutput' | 'compilationError' | 'wordTruncated'>, maxWordLength: number, skipProvenance?: boolean) {
    try {
        const plainConfig = current(s).config;
        const compiled = compileDolSystem(plainConfig);
        const result = generateDolSystem(compiled, s.generationCount, maxWordLength, skipProvenance);
        const output = interpretDolSystem(result, plainConfig.turtle);
        s.compiledSystem = compiled as CompiledSystem;
        s.generationResult = result as GenerationResult;
        s.turtleOutput = output as TurtleOutput;
        s.compilationError = null;
        s.wordTruncated = result.truncated;
    } catch (e) {
        if (e instanceof DolSystemValidationError) {
            s.compilationError = e.message;
        } else {
            s.compilationError = String(e);
        }
        s.compiledSystem = null;
        s.generationResult = null;
        s.turtleOutput = null;
        s.wordTruncated = false;
    }
}

const DEFAULT_MAX_WORD_LENGTH = 100000;

function computeInitialState() {
    const config = { ...DOL_PRESETS[0].config };
    const generationCount = config.maxIterations;
    try {
        const compiled = compileDolSystem(config);
        const result = generateDolSystem(compiled, generationCount, DEFAULT_MAX_WORD_LENGTH, false);
        const output = interpretDolSystem(result, config.turtle);
        return {
            config,
            generationCount,
            compiledSystem: compiled,
            generationResult: result,
            turtleOutput: output,
            compilationError: null,
            isStale: false,
            maxWordLength: DEFAULT_MAX_WORD_LENGTH,
            wordTruncated: result.truncated,
            skipProvenance: false,
        };
    } catch (e) {
        return {
            config,
            generationCount,
            compiledSystem: null,
            generationResult: null,
            turtleOutput: null,
            compilationError: e instanceof DolSystemValidationError ? e.message : String(e),
            isStale: false,
            maxWordLength: DEFAULT_MAX_WORD_LENGTH,
            wordTruncated: false,
            skipProvenance: false,
        };
    }
}

const initial = computeInitialState();

export const useDolSystemStore = create<DolSystemStoreState>()(
    immer((set) => ({
        ...initial,

        loadPreset: (name: string) =>
            set((s) => {
                const preset = DOL_PRESETS.find((p) => p.name === name);
                if (!preset) return;
                s.config = preset.config as SystemConfig;
                // Intentionally reset generationCount to the preset's maxIterations when switching presets.
                s.generationCount = preset.config.maxIterations;
                recompile(s, s.maxWordLength, s.skipProvenance);
                s.isStale = s.compilationError !== null;
            }),

        setGenerationCount: (n: number) =>
            set((s) => {
                s.generationCount = n;
                s.isStale = true;
            }),

        setMaxWordLength: (n: number) =>
            set((s) => {
                s.maxWordLength = n;
                s.isStale = true;
            }),

        triggerGeneration: () =>
            set((s) => {
                recompile(s, s.maxWordLength, s.skipProvenance);
                s.isStale = s.compilationError !== null;
            }),

        setAlphabet: (letter: Letter, definition: Keyword[]) =>
            set((s) => {
                s.config.alphabet[letter] = definition;
                s.isStale = true;
            }),

        addLetter: (letter: Letter, definition: Keyword[]) =>
            set((s) => {
                s.config.alphabet[letter] = definition;
                s.config.productions[letter] = [letter];
                s.isStale = true;
            }),

        removeLetter: (letter: Letter) =>
            set((s) => {
                delete s.config.alphabet[letter];
                delete s.config.productions[letter];
                s.isStale = true;
            }),

        setProduction: (letter: Letter, rhs: DolSymbol[]) =>
            set((s) => {
                s.config.productions[letter] = rhs;
                s.isStale = true;
            }),

        setAxiom: (axiom: DolSymbol[]) =>
            set((s) => {
                s.config.axiom = axiom;
                s.isStale = true;
            }),

        setTurtleParam: (key: keyof TurtleConfig, value: number) =>
            set((s) => {
                s.config.turtle[key] = value;
                s.isStale = true;
            }),

        loadConfig: (config: SystemConfig) =>
            set((s) => {
                s.config = config as SystemConfig;
                recompile(s, s.maxWordLength, s.skipProvenance);
                s.isStale = s.compilationError !== null;
            }),

        setSkipProvenance: (v: boolean) =>
            set((s) => {
                s.skipProvenance = v;
                s.isStale = true;
            }),
    }))
);
