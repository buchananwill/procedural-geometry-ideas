import {compile} from '@proc-geo/core/dol-system/compile';
import {step, generate} from '@proc-geo/core/dol-system/generate';
import {SQUARE_CONFIG, CONVERGE_CONFIG, BRANCH_CONFIG} from './fixtures';

const squareSystem = compile(SQUARE_CONFIG);
const convergeSystem = compile(CONVERGE_CONFIG);
const branchSystem = compile(BRANCH_CONFIG);

// ── step() ────────────────────────────────────────────────────────────────────

describe('step()', () => {
    it('expands a single Letter token into its production', () => {
        const axiomWord = [{opcode: 5, parentIndex: -1}];
        const gen1 = step(squareSystem, axiomWord);
        expect(gen1.map(t => t.opcode)).toEqual([0, 1, 5]);
    });

    it('every output token references its parent index in the input word', () => {
        const axiomWord = [{opcode: 5, parentIndex: -1}];
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
        const stemTip = [{opcode: 5, parentIndex: -1}, {opcode: 6, parentIndex: -1}];
        const result = step(branchSystem, stemTip);
        expect(result.map(t => t.opcode)).toEqual([5, 6, 6]);
    });
});

// ── generate() — generations array structure ─────────────────────────────────

describe('generate() — generations array structure', () => {
    it('generations[0] is the compiled axiom with parentIndex=-1 for each token', () => {
        const result = generate(squareSystem, 3);
        expect(result.generations[0].map(t => t.opcode)).toEqual([5]);
        expect(result.generations[0][0].parentIndex).toBe(-1);
    });

    it('includes a back-reference to the compiled system', () => {
        const result = generate(squareSystem, 3);
        expect(result.system).toBe(squareSystem);
    });
});

// ── generate() — rewriting ────────────────────────────────────────────────────

describe('generate() — rewriting', () => {
    it('applies exactly maxIterations rewriting steps before terminal expansion', () => {
        const result = generate(squareSystem, 3);
        expect(result.generations.length).toBe(5);
    });

    it('gen1 word matches expected expansion of X', () => {
        const result = generate(squareSystem, 3);
        expect(result.generations[1].map(t => t.opcode)).toEqual([0, 1, 5]);
    });

    it('gen3 word is F+F+F+X (7 tokens)', () => {
        const result = generate(squareSystem, 3);
        expect(result.generations[3].map(t => t.opcode)).toEqual([0, 1, 0, 1, 0, 1, 5]);
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
        expect(result.generations.length).toBe(2);
    });

    it('sets converged=false when iteration limit is reached with letters remaining', () => {
        const result = generate(squareSystem, 3);
        expect(result.converged).toBe(false);
    });
});

// ── generate() — terminal expansion ──────────────────────────────────────────

describe('generate() — terminal expansion', () => {
    it('final generation contains only keyword opcodes (0..4)', () => {
        const result = generate(squareSystem, 3);
        const terminal = result.generations[result.generations.length - 1];
        expect(terminal.every(t => t.opcode < 5)).toBe(true);
    });

    it('terminal expansion of X gives [F] with correct parent linking', () => {
        const result = generate(squareSystem, 3);
        const terminal = result.generations[4];
        expect(terminal[6].opcode).toBe(0);
        expect(terminal[6].parentIndex).toBe(6);
    });

    it('terminal expansion passes keywords through unchanged', () => {
        const result = generate(squareSystem, 3);
        const gen3 = result.generations[3];
        const terminal = result.generations[4];
        for (let i = 0; i < 6; i++) {
            expect(terminal[i].opcode).toBe(gen3[i].opcode);
            expect(terminal[i].parentIndex).toBe(i);
        }
    });

    it('terminal expansion of all-keyword axiom is a no-op copy', () => {
        const result = generate(convergeSystem, 5);
        const axiom = result.generations[0];
        const terminal = result.generations[1];
        expect(terminal.map(t => t.opcode)).toEqual(axiom.map(t => t.opcode));
    });

    it('terminal expansion of BRANCH_CONFIG produces full keyword word', () => {
        const result = generate(branchSystem, 1);
        const terminal = result.generations[result.generations.length - 1];
        expect(terminal.map(t => t.opcode)).toEqual([0, 3, 1, 0, 4, 3, 2, 0, 4]);
    });

    it('multi-token definition expansion links all tokens to the parent letter', () => {
        const result = generate(branchSystem, 1);
        const terminal = result.generations[result.generations.length - 1];
        // Token 0 (F) came from stem at gen1 index 0
        expect(terminal[0].parentIndex).toBe(0);
        // Tokens 1-8 came from tip at gen1 index 1
        for (let i = 1; i <= 8; i++) {
            expect(terminal[i].parentIndex).toBe(1);
        }
    });
});

// ── generate() — provenance chain ────────────────────────────────────────────

describe('generate() — provenance tracing', () => {
    it('can trace the final F at pos 6 back to the axiom X at pos 0', () => {
        const result = generate(squareSystem, 3);
        const gens = result.generations;
        let genIdx = gens.length - 1;
        let tokenIdx = 6;
        const chain: { gen: number; opcode: number }[] = [];

        while (genIdx >= 0) {
            chain.push({gen: genIdx, opcode: gens[genIdx][tokenIdx].opcode});
            const pIdx = gens[genIdx][tokenIdx].parentIndex;
            if (pIdx === -1) break;
            tokenIdx = pIdx;
            genIdx--;
        }

        const root = chain[chain.length - 1];
        expect(root.opcode).toBe(5);  // X
        expect(root.gen).toBe(0);
    });
});
