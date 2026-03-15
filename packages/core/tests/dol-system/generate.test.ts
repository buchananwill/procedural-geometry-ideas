import {compile} from '@proc-geo/core/dol-system/compile';
import {step, generate} from '@proc-geo/core/dol-system/generate';
import {SQUARE_CONFIG, CONVERGE_CONFIG, BRANCH_CONFIG} from './fixtures';

const squareSystem = compile(SQUARE_CONFIG);
const convergeSystem = compile(CONVERGE_CONFIG);
const branchSystem = compile(BRANCH_CONFIG);

// ── step() ────────────────────────────────────────────────────────────────────

describe('step()', () => {
    it('expands a single Letter token into its production', () => {
        const axiomWord = [{opcode: 6, parentIndex: -1}];
        const gen1 = step(squareSystem, axiomWord);
        expect(gen1.map(t => t.opcode)).toEqual([0, 1, 6]);
    });

    it('every output token references its parent index in the input word', () => {
        const axiomWord = [{opcode: 6, parentIndex: -1}];
        const gen1 = step(squareSystem, axiomWord);
        expect(gen1.every(t => t.parentIndex === 0)).toBe(true);
    });

    it('keywords pass through unchanged', () => {
        const word = [{opcode: 0, parentIndex: -1}, {opcode: 1, parentIndex: -1}];
        const result = step(squareSystem, word);
        expect(result.map(t => t.opcode)).toEqual([0, 1]);
    });

    it('parentIndex for pass-through keyword tokens is the source index', () => {
        const word = [{opcode: 0, parentIndex: -1}, {opcode: 1, parentIndex: -1}];
        const result = step(squareSystem, word);
        expect(result[0].parentIndex).toBe(0);
        expect(result[1].parentIndex).toBe(1);
    });

    it('expands two letters independently in the same word', () => {
        const stemTip = [{opcode: 6, parentIndex: -1}, {opcode: 7, parentIndex: -1}];
        const result = step(branchSystem, stemTip);
        expect(result.map(t => t.opcode)).toEqual([6, 7, 7]);
    });
});

// ── generate() — generations array structure ─────────────────────────────────

describe('generate() — generations array structure', () => {
    it('generations[0] is the compiled axiom with parentIndex=-1 for each token', () => {
        const result = generate(squareSystem, 3);
        expect(result.generations[0].map(t => t.opcode)).toEqual([6]);
        expect(result.generations[0][0].parentIndex).toBe(-1);
    });

    it('includes a back-reference to the compiled system', () => {
        const result = generate(squareSystem, 3);
        expect(result.system).toBe(squareSystem);
    });
});

// ── generate() — rewriting ────────────────────────────────────────────────────

describe('generate() — rewriting', () => {
    it('applies exactly maxIterations rewriting steps', () => {
        const result = generate(squareSystem, 3);
        expect(result.generations.length).toBe(4);
    });

    it('gen1 word matches expected expansion of X', () => {
        const result = generate(squareSystem, 3);
        expect(result.generations[1].map(t => t.opcode)).toEqual([0, 1, 6]);
    });

    it('gen3 word is F+F+F+X (7 tokens)', () => {
        const result = generate(squareSystem, 3);
        expect(result.generations[3].map(t => t.opcode)).toEqual([0, 1, 0, 1, 0, 1, 6]);
    });
});

// ── generate() — convergence ─────────────────────────────────────────────────

describe('generate() — convergence', () => {
    it('sets converged=true when axiom is all keywords', () => {
        const result = generate(convergeSystem, 5);
        expect(result.converged).toBe(true);
    });

    it('stops after 0 rewriting steps when axiom converges immediately', () => {
        const result = generate(convergeSystem, 5);
        expect(result.generations.length).toBe(1);
    });

    it('sets converged=false when iteration limit is reached with letters remaining', () => {
        const result = generate(squareSystem, 3);
        expect(result.converged).toBe(false);
    });
});

// ── generate() — provenance chain ────────────────────────────────────────────

describe('generate() — provenance tracing', () => {
    it('can trace the + at gen3 pos 5 back to the axiom X at pos 0', () => {
        const result = generate(squareSystem, 3);
        const gens = result.generations;
        let genIdx = gens.length - 1;
        let tokenIdx = 5;
        const chain: { gen: number; opcode: number }[] = [];

        while (genIdx >= 0) {
            chain.push({gen: genIdx, opcode: gens[genIdx][tokenIdx].opcode});
            const pIdx = gens[genIdx][tokenIdx].parentIndex;
            if (pIdx === -1) break;
            tokenIdx = pIdx;
            genIdx--;
        }

        const root = chain[chain.length - 1];
        expect(root.opcode).toBe(6);  // X
        expect(root.gen).toBe(0);
    });
});
