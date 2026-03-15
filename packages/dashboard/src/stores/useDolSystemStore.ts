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

    loadPreset: (name: string) => void;
    setGenerationCount: (n: number) => void;
    setAlphabet: (letter: Letter, definition: Keyword[]) => void;
    addLetter: (letter: Letter, definition: Keyword[]) => void;
    removeLetter: (letter: Letter) => void;
    setProduction: (letter: Letter, rhs: DolSymbol[]) => void;
    setAxiom: (axiom: DolSymbol[]) => void;
    setTurtleParam: (key: keyof TurtleConfig, value: number) => void;
}

function recompile(s: Pick<DolSystemStoreState, 'config' | 'generationCount' | 'compiledSystem' | 'generationResult' | 'turtleOutput' | 'compilationError'>) {
    try {
        const plainConfig = current(s).config;
        const compiled = compileDolSystem(plainConfig);
        const result = generateDolSystem(compiled, s.generationCount);
        const output = interpretDolSystem(result, plainConfig.turtle);
        s.compiledSystem = compiled as CompiledSystem;
        s.generationResult = result as GenerationResult;
        s.turtleOutput = output as TurtleOutput;
        s.compilationError = null;
    } catch (e) {
        if (e instanceof DolSystemValidationError) {
            s.compilationError = e.message;
        } else {
            s.compilationError = String(e);
        }
        s.compiledSystem = null;
        s.generationResult = null;
        s.turtleOutput = null;
    }
}

function computeInitialState() {
    const config = { ...DOL_PRESETS[0].config };
    const generationCount = config.maxIterations;
    try {
        const compiled = compileDolSystem(config);
        const result = generateDolSystem(compiled, generationCount);
        const output = interpretDolSystem(result, config.turtle);
        return {
            config,
            generationCount,
            compiledSystem: compiled,
            generationResult: result,
            turtleOutput: output,
            compilationError: null,
        };
    } catch (e) {
        return {
            config,
            generationCount,
            compiledSystem: null,
            generationResult: null,
            turtleOutput: null,
            compilationError: e instanceof DolSystemValidationError ? e.message : String(e),
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
                recompile(s);
            }),

        setGenerationCount: (n: number) =>
            set((s) => {
                s.generationCount = n;
                recompile(s);
            }),

        setAlphabet: (letter: Letter, definition: Keyword[]) =>
            set((s) => {
                s.config.alphabet[letter] = definition;
                recompile(s);
            }),

        addLetter: (letter: Letter, definition: Keyword[]) =>
            set((s) => {
                s.config.alphabet[letter] = definition;
                s.config.productions[letter] = [letter];
                recompile(s);
            }),

        removeLetter: (letter: Letter) =>
            set((s) => {
                delete s.config.alphabet[letter];
                delete s.config.productions[letter];
                recompile(s);
            }),

        setProduction: (letter: Letter, rhs: DolSymbol[]) =>
            set((s) => {
                s.config.productions[letter] = rhs;
                recompile(s);
            }),

        setAxiom: (axiom: DolSymbol[]) =>
            set((s) => {
                s.config.axiom = axiom;
                recompile(s);
            }),

        setTurtleParam: (key: keyof TurtleConfig, value: number) =>
            set((s) => {
                s.config.turtle[key] = value;
                recompile(s);
            }),
    }))
);
