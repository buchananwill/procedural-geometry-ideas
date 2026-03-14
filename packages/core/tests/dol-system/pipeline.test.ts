import {compile} from '@proc-geo/core/dol-system/compile';
import {generate} from '@proc-geo/core/dol-system/generate';
import {interpret} from '@proc-geo/core/dol-system/interpret';
import {
    SQUARE_CONFIG, EXPECTED_SQUARE_PATHS,
    CONVERGE_CONFIG, EXPECTED_CONVERGE_PATHS,
    BRANCH_CONFIG, EXPECTED_BRANCH_PATHS,
} from './fixtures';

describe('Full pipeline — Unit Square', () => {
    const sys = compile(SQUARE_CONFIG);
    const result = generate(sys, SQUARE_CONFIG.maxIterations);
    const output = interpret(result, SQUARE_CONFIG.turtle);

    it('produces exactly 1 path', () =>
        expect(output.paths.length).toBe(EXPECTED_SQUARE_PATHS.pathCount));

    it('path has exactly 4 segments', () =>
        expect(output.paths[0].length).toBe(EXPECTED_SQUARE_PATHS.segmentCount));

    it('bounds are unit square', () => {
        expect(output.bounds.min.x).toBeCloseTo(EXPECTED_SQUARE_PATHS.bounds.min.x);
        expect(output.bounds.min.y).toBeCloseTo(EXPECTED_SQUARE_PATHS.bounds.min.y);
        expect(output.bounds.max.x).toBeCloseTo(EXPECTED_SQUARE_PATHS.bounds.max.x);
        expect(output.bounds.max.y).toBeCloseTo(EXPECTED_SQUARE_PATHS.bounds.max.y);
    });

    it('closes back to origin (last segment ends at start)', () => {
        const last = output.paths[0][3];
        expect(last.to.x).toBeCloseTo(0);
        expect(last.to.y).toBeCloseTo(0);
    });
});

describe('Full pipeline — Immediate Convergence', () => {
    const sys = compile(CONVERGE_CONFIG);
    const result = generate(sys, CONVERGE_CONFIG.maxIterations);
    const output = interpret(result, CONVERGE_CONFIG.turtle);

    it('converged flag is true', () => expect(result.converged).toBe(true));

    it('produces 1 path with 3 segments', () => {
        expect(output.paths.length).toBe(EXPECTED_CONVERGE_PATHS.pathCount);
        expect(output.paths[0].length).toBe(EXPECTED_CONVERGE_PATHS.segmentCount);
    });

    it('bounds match expected', () => {
        expect(output.bounds.min.x).toBeCloseTo(EXPECTED_CONVERGE_PATHS.bounds.min.x);
        expect(output.bounds.min.y).toBeCloseTo(EXPECTED_CONVERGE_PATHS.bounds.min.y);
        expect(output.bounds.max.x).toBeCloseTo(EXPECTED_CONVERGE_PATHS.bounds.max.x);
        expect(output.bounds.max.y).toBeCloseTo(EXPECTED_CONVERGE_PATHS.bounds.max.y);
    });
});

describe('Full pipeline — Simple Branch', () => {
    const sys = compile(BRANCH_CONFIG);
    const result = generate(sys, BRANCH_CONFIG.maxIterations);
    const output = interpret(result, BRANCH_CONFIG.turtle);

    it('produces 2 paths', () =>
        expect(output.paths.length).toBe(EXPECTED_BRANCH_PATHS.pathCount));

    it('path 0 has 2 segments, path 1 has 1 segment', () => {
        expect(output.paths[0].length).toBe(EXPECTED_BRANCH_PATHS.segmentCounts[0]);
        expect(output.paths[1].length).toBe(EXPECTED_BRANCH_PATHS.segmentCounts[1]);
    });

    it('bounds span from y=-1 to y=1', () => {
        expect(output.bounds.min.y).toBeCloseTo(EXPECTED_BRANCH_PATHS.bounds.min.y);
        expect(output.bounds.max.y).toBeCloseTo(EXPECTED_BRANCH_PATHS.bounds.max.y);
    });

    it('segment letters: stem-derived F has letter="stem"', () => {
        expect(output.paths[0][0].letter).toBe('stem');
    });

    it('segment letters: tip-derived F has letter="tip"', () => {
        expect(output.paths[0][1].letter).toBe('tip');
    });
});

describe('Barrel re-exports', () => {
    it('core barrel exports compileDolSystem', async () => {
        const core = await import('@proc-geo/core');
        expect(typeof core.compileDolSystem).toBe('function');
    });

    it('core barrel exports generateDolSystem', async () => {
        const core = await import('@proc-geo/core');
        expect(typeof core.generateDolSystem).toBe('function');
    });

    it('core barrel exports interpretDolSystem', async () => {
        const core = await import('@proc-geo/core');
        expect(typeof core.interpretDolSystem).toBe('function');
    });

    it('core barrel exports KEYWORD_OPCODES', async () => {
        const core = await import('@proc-geo/core');
        expect(core.KEYWORD_OPCODES).toBeDefined();
        expect(core.KEYWORD_OPCODES.F).toBe(0);
    });

    it('core barrel exports NUM_KEYWORDS', async () => {
        const core = await import('@proc-geo/core');
        expect(core.NUM_KEYWORDS).toBe(5);
    });

    it('core barrel exports DolSystemValidationError', async () => {
        const core = await import('@proc-geo/core');
        expect(core.DolSystemValidationError).toBeDefined();
    });
});
