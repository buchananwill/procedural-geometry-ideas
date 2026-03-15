import { useDolSystemStore } from '../../src/stores/useDolSystemStore';

// The store initializes with a real D0L compilation (first preset).
// We capture the initial state for resetting between tests.
const initialSnapshot = useDolSystemStore.getState();

beforeEach(() => {
    // Reset to initial state before each test.
    // We use setState with replace=true to fully restore the initial snapshot,
    // but actions are part of the prototype so we only reset data fields.
    useDolSystemStore.setState({
        config: initialSnapshot.config,
        generationCount: initialSnapshot.generationCount,
        compiledSystem: initialSnapshot.compiledSystem,
        generationResult: initialSnapshot.generationResult,
        turtleOutput: initialSnapshot.turtleOutput,
        compilationError: initialSnapshot.compilationError,
        isStale: initialSnapshot.isStale,
        maxWordLength: initialSnapshot.maxWordLength,
        wordTruncated: initialSnapshot.wordTruncated,
    });
});

// ── Initial state ───────────────────────────────────────────────────────────

describe('initial state', () => {
    it('starts with isStale = false', () => {
        expect(useDolSystemStore.getState().isStale).toBe(false);
    });

    it('starts with maxWordLength = 100000', () => {
        expect(useDolSystemStore.getState().maxWordLength).toBe(100000);
    });

    it('starts with wordTruncated = false', () => {
        expect(useDolSystemStore.getState().wordTruncated).toBe(false);
    });

    it('starts with a non-null compiledSystem (first preset compiles successfully)', () => {
        expect(useDolSystemStore.getState().compiledSystem).not.toBeNull();
    });
});

// ── Config mutations set isStale ────────────────────────────────────────────

describe('config mutations set isStale = true', () => {
    it('setAlphabet marks stale', () => {
        useDolSystemStore.getState().setAlphabet('draw', ['F', '+']);
        expect(useDolSystemStore.getState().isStale).toBe(true);
    });

    it('addLetter marks stale', () => {
        useDolSystemStore.getState().addLetter('Z', ['F']);
        expect(useDolSystemStore.getState().isStale).toBe(true);
    });

    it('removeLetter marks stale', () => {
        useDolSystemStore.getState().removeLetter('draw');
        expect(useDolSystemStore.getState().isStale).toBe(true);
    });

    it('setProduction marks stale', () => {
        useDolSystemStore.getState().setProduction('draw', ['F', '+']);
        expect(useDolSystemStore.getState().isStale).toBe(true);
    });

    it('setAxiom marks stale', () => {
        useDolSystemStore.getState().setAxiom(['F']);
        expect(useDolSystemStore.getState().isStale).toBe(true);
    });

    it('setTurtleParam marks stale', () => {
        useDolSystemStore.getState().setTurtleParam('angleDelta', 45);
        expect(useDolSystemStore.getState().isStale).toBe(true);
    });

    it('setGenerationCount marks stale', () => {
        useDolSystemStore.getState().setGenerationCount(2);
        expect(useDolSystemStore.getState().isStale).toBe(true);
    });
});

// ── setMaxWordLength ────────────────────────────────────────────────────────

describe('setMaxWordLength', () => {
    it('updates the maxWordLength value', () => {
        useDolSystemStore.getState().setMaxWordLength(500);
        expect(useDolSystemStore.getState().maxWordLength).toBe(500);
    });

    it('marks stale', () => {
        useDolSystemStore.getState().setMaxWordLength(500);
        expect(useDolSystemStore.getState().isStale).toBe(true);
    });
});

// ── triggerGeneration ───────────────────────────────────────────────────────

describe('triggerGeneration', () => {
    it('clears isStale on successful compilation', () => {
        // Make it stale first
        useDolSystemStore.getState().setGenerationCount(2);
        expect(useDolSystemStore.getState().isStale).toBe(true);

        useDolSystemStore.getState().triggerGeneration();
        expect(useDolSystemStore.getState().isStale).toBe(false);
    });

    it('updates generationResult after trigger', () => {
        const before = useDolSystemStore.getState().generationResult;
        useDolSystemStore.getState().setGenerationCount(1);
        useDolSystemStore.getState().triggerGeneration();
        const after = useDolSystemStore.getState().generationResult;
        // With a different generation count the result should differ
        expect(after).not.toBeNull();
        expect(after!.generations.length).not.toBe(before!.generations.length);
    });

    it('keeps isStale = true when compilation fails', () => {
        // Set an invalid axiom referencing an undeclared symbol
        useDolSystemStore.getState().setAxiom(['NONEXISTENT']);
        expect(useDolSystemStore.getState().isStale).toBe(true);

        useDolSystemStore.getState().triggerGeneration();
        // Compilation fails, so isStale should remain true
        expect(useDolSystemStore.getState().isStale).toBe(true);
        expect(useDolSystemStore.getState().compilationError).not.toBeNull();
    });
});

// ── loadPreset ──────────────────────────────────────────────────────────────

describe('loadPreset', () => {
    it('clears isStale after loading a valid preset', () => {
        // Make it stale first
        useDolSystemStore.getState().setGenerationCount(1);
        expect(useDolSystemStore.getState().isStale).toBe(true);

        useDolSystemStore.getState().loadPreset('Koch Curve');
        expect(useDolSystemStore.getState().isStale).toBe(false);
    });

    it('auto-generates (compiledSystem is non-null after loading)', () => {
        useDolSystemStore.getState().loadPreset('Sierpinski Triangle');
        expect(useDolSystemStore.getState().compiledSystem).not.toBeNull();
        expect(useDolSystemStore.getState().generationResult).not.toBeNull();
    });
});
