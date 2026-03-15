import {compile} from '@proc-geo/core/dol-system/compile';
import {generate} from '@proc-geo/core/dol-system/generate';
import {SQUARE_CONFIG, CONVERGE_CONFIG} from './fixtures';
import type {SystemConfig} from '../../src/dol-system/types';

const squareSystem = compile(SQUARE_CONFIG);
const convergeSystem = compile(CONVERGE_CONFIG);

/**
 * A rapidly-expanding system: X -> X X
 * Gen 0: [X]        (1 token)
 * Gen 1: [X, X]     (2 tokens)
 * Gen 2: [X, X, X, X] (4 tokens)
 * Gen N: 2^N tokens
 */
const DOUBLING_CONFIG: SystemConfig = {
    alphabet: {X: ['F']},
    productions: {X: ['X', 'X']},
    axiom: ['X'],
    turtle: {stepLength: 1, angleDelta: 90, generationScaling: 1},
    maxIterations: 10,
};

const doublingSystem = compile(DOUBLING_CONFIG);

// ── generate() — without maxWordLength ──────────────────────────────────────

describe('generate() — without maxWordLength', () => {
    it('truncated is false when maxWordLength is not provided', () => {
        const result = generate(squareSystem, 3);
        expect(result.truncated).toBe(false);
    });

    it('produces all requested generations', () => {
        const result = generate(squareSystem, 3);
        expect(result.generations.length).toBe(4); // gen0 + 3 steps
    });
});

// ── generate() — maxWordLength not hit ──────────────────────────────────────

describe('generate() — maxWordLength not hit', () => {
    it('truncated is false when word never reaches maxWordLength', () => {
        // SQUARE: gen3 has 7 tokens, so maxWordLength=100 is never hit
        const result = generate(squareSystem, 3, 100);
        expect(result.truncated).toBe(false);
    });

    it('produces all requested generations when maxWordLength is not reached', () => {
        const result = generate(squareSystem, 3, 100);
        expect(result.generations.length).toBe(4);
    });
});

// ── generate() — maxWordLength IS hit ───────────────────────────────────────

describe('generate() — maxWordLength IS hit', () => {
    it('sets truncated to true when a generation reaches maxWordLength', () => {
        // Doubling: gen 0=1, gen 1=2, gen 2=4, gen 3=8, gen 4=16
        // maxWordLength=5 => gen 3 (8 tokens) >= 5, so truncated
        const result = generate(doublingSystem, 10, 5);
        expect(result.truncated).toBe(true);
    });

    it('includes the over-length generation in the result', () => {
        const result = generate(doublingSystem, 10, 5);
        const lastGen = result.generations[result.generations.length - 1];
        expect(lastGen.length).toBeGreaterThanOrEqual(5);
    });

    it('stops early — fewer generations than requested', () => {
        const result = generate(doublingSystem, 10, 5);
        // Should stop at gen 3 (8 tokens >= 5), so 4 entries total (gen0..gen3)
        expect(result.generations.length).toBeLessThan(11);
        expect(result.generations.length).toBe(4); // gen0=1, gen1=2, gen2=4, gen3=8
    });

    it('truncates at gen 1 when maxWordLength=1', () => {
        // gen 0 = [X] (1 token), gen 0 length is NOT checked against maxWordLength
        // gen 1 = [X, X] (2 tokens) >= 1 => truncated
        const result = generate(doublingSystem, 10, 1);
        expect(result.truncated).toBe(true);
        expect(result.generations.length).toBe(2); // gen0 + gen1
    });

    it('truncates at exact boundary (maxWordLength equals word length)', () => {
        // gen 2 = 4 tokens, maxWordLength=4 => 4 >= 4, truncated
        const result = generate(doublingSystem, 10, 4);
        expect(result.truncated).toBe(true);
        expect(result.generations.length).toBe(3); // gen0, gen1, gen2
    });
});

// ── generate() — converged vs truncated independence ────────────────────────

describe('generate() — converged vs truncated independence', () => {
    it('converged system has truncated=false', () => {
        const result = generate(convergeSystem, 5, 100);
        expect(result.converged).toBe(true);
        expect(result.truncated).toBe(false);
    });

    it('truncated system has converged=false', () => {
        const result = generate(doublingSystem, 10, 5);
        expect(result.truncated).toBe(true);
        expect(result.converged).toBe(false);
    });

    it('neither converged nor truncated when iteration limit reached normally', () => {
        const result = generate(squareSystem, 3);
        expect(result.converged).toBe(false);
        expect(result.truncated).toBe(false);
    });
});

// ── generate() — maxWordLength edge cases ───────────────────────────────────

describe('generate() — maxWordLength edge cases', () => {
    it('maxWordLength=Infinity (default) never truncates', () => {
        const result = generate(doublingSystem, 5, Infinity);
        expect(result.truncated).toBe(false);
        expect(result.generations.length).toBe(6); // gen0..gen5
    });

    it('maxWordLength=0 truncates on the first rewriting step', () => {
        // gen0 = [X] (1 token), not checked. gen1 = [X,X] (2 tokens) >= 0 => truncated
        const result = generate(doublingSystem, 10, 0);
        expect(result.truncated).toBe(true);
        expect(result.generations.length).toBe(2);
    });
});
