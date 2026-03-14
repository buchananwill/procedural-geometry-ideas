import {compile} from '@proc-geo/core/dol-system/compile';
import {DolSystemValidationError, NUM_KEYWORDS} from '@proc-geo/core/dol-system/types';
import {SQUARE_CONFIG, CONVERGE_CONFIG, BRANCH_CONFIG} from './fixtures';

// -- Validation failures ------------------------------------------------------

describe('compile() -- validation', () => {
    it('throws DolSystemValidationError for an alphabet value containing a Letter', () => {
        expect(() => compile({
            ...SQUARE_CONFIG,
            alphabet: {X: ['F'], Y: ['X' as any]},
        })).toThrow(DolSystemValidationError);
    });

    it('throws for a letter name exceeding 16 characters', () => {
        const longName = 'A'.repeat(17);
        expect(() => compile({
            ...SQUARE_CONFIG,
            alphabet: {[longName]: ['F']},
        })).toThrow(DolSystemValidationError);
    });

    it('throws for a production rule referencing an undeclared letter', () => {
        expect(() => compile({
            ...SQUARE_CONFIG,
            productions: {X: ['F', '+', 'Z']},
        })).toThrow(DolSystemValidationError);
    });

    it('throws for an axiom referencing an undeclared letter', () => {
        expect(() => compile({
            ...SQUARE_CONFIG,
            axiom: ['X', 'Y'],
        })).toThrow(DolSystemValidationError);
    });

    it('accepts a valid config without throwing', () => {
        expect(() => compile(SQUARE_CONFIG)).not.toThrow();
    });

    it('accepts an empty alphabet and keyword-only axiom without throwing', () => {
        expect(() => compile(CONVERGE_CONFIG)).not.toThrow();
    });

    it('collects multiple errors into a single thrown DolSystemValidationError', () => {
        let caught: DolSystemValidationError | null = null;
        try {
            compile({
                alphabet: {toolongname12345678: ['F'], Y: ['Z' as any]},
                productions: {},
                axiom: ['W' as any],
                turtle: SQUARE_CONFIG.turtle,
                maxIterations: 3,
            });
        } catch (e) {
            if (e instanceof DolSystemValidationError) caught = e;
        }
        expect(caught).not.toBeNull();
        expect(caught!.errors.length).toBeGreaterThan(1);
    });
});

// -- Opcode assignment --------------------------------------------------------

describe('compile() -- opcode table', () => {
    it('assigns F=0, +=1, -=2, [=3, ]=4', () => {
        const cs = compile(SQUARE_CONFIG);
        expect(cs.reverseTable[0]).toBe('F');
        expect(cs.reverseTable[1]).toBe('+');
        expect(cs.reverseTable[2]).toBe('-');
        expect(cs.reverseTable[3]).toBe('[');
        expect(cs.reverseTable[4]).toBe(']');
    });

    it('assigns letter opcodes starting at NUM_KEYWORDS (5)', () => {
        const cs = compile(SQUARE_CONFIG);
        expect(cs.opcodeTable.get('X')).toBe(5);
    });

    it('assigns multiple letters in sorted key order', () => {
        const cs = compile(BRANCH_CONFIG);
        expect(cs.opcodeTable.get('stem')).toBe(5);
        expect(cs.opcodeTable.get('tip')).toBe(6);
    });

    it('numKeywords is always 5', () => {
        expect(compile(SQUARE_CONFIG).numKeywords).toBe(NUM_KEYWORDS);
        expect(compile(BRANCH_CONFIG).numKeywords).toBe(NUM_KEYWORDS);
    });
});

// -- Productions --------------------------------------------------------------

describe('compile() -- productions array', () => {
    it('keyword productions are identity: productions[k] = [k] for k in 0..4', () => {
        const cs = compile(SQUARE_CONFIG);
        for (let k = 0; k < 5; k++) {
            expect(cs.productions[k]).toEqual([k]);
        }
    });

    it('compiles X -> F + X correctly', () => {
        const cs = compile(SQUARE_CONFIG);
        expect(cs.productions[5]).toEqual([0, 1, 5]);
    });

    it('unspecified letter production defaults to identity', () => {
        const cs = compile(BRANCH_CONFIG);
        expect(cs.productions[6]).toEqual([6]);
    });

    it('compiles stem -> stem tip correctly', () => {
        const cs = compile(BRANCH_CONFIG);
        expect(cs.productions[5]).toEqual([5, 6]);
    });
});

// -- Definitions --------------------------------------------------------------

describe('compile() -- definitions array', () => {
    it('keyword definitions are all empty arrays', () => {
        const cs = compile(SQUARE_CONFIG);
        for (let k = 0; k < 5; k++) {
            expect(cs.definitions[k]).toEqual([]);
        }
    });

    it('compiles X definition (F) correctly', () => {
        const cs = compile(SQUARE_CONFIG);
        expect(cs.definitions[5]).toEqual([0]);
    });

    it('compiles tip definition ([+F][-F]) correctly', () => {
        const cs = compile(BRANCH_CONFIG);
        expect(cs.definitions[6]).toEqual([3, 1, 0, 4, 3, 2, 0, 4]);
    });
});

// -- Axiom --------------------------------------------------------------------

describe('compile() -- axiom', () => {
    it('compiles single-letter axiom', () => {
        const cs = compile(SQUARE_CONFIG);
        expect(cs.axiom).toEqual([5]);
    });

    it('compiles all-keyword axiom', () => {
        const cs = compile(CONVERGE_CONFIG);
        expect(cs.axiom).toEqual([0, 1, 0, 2, 0]);
    });
});
