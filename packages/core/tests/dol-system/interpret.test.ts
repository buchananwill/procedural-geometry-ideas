import {compile} from '@proc-geo/core/dol-system/compile';
import {generate} from '@proc-geo/core/dol-system/generate';
import {interpret} from '@proc-geo/core/dol-system/interpret';
import type {TurtleOutput} from '@proc-geo/core/dol-system/types';
import {
    SQUARE_CONFIG,
    CONVERGE_CONFIG,
    BRANCH_CONFIG,
} from './fixtures';

// -- Primitive turtle tests ---------------------------------------------------

describe('interpret() — single F command', () => {
    let output: TurtleOutput;

    beforeAll(() => {
        const sys = compile({...CONVERGE_CONFIG, axiom: ['F']});
        const result = generate(sys, 0);
        output = interpret(result, CONVERGE_CONFIG.turtle);
    });

    it('produces one path with one segment', () => {
        expect(output.paths.length).toBe(1);
        expect(output.paths[0].length).toBe(1);
    });

    it('segment goes from (0,0) to (1,0) for heading=0', () => {
        const seg = output.paths[0][0];
        expect(seg.from).toEqual({x: 0, y: 0});
        expect(seg.to.x).toBeCloseTo(1);
        expect(seg.to.y).toBeCloseTo(0);
    });

    it('bounds are {min:{0,0}, max:{1,0}}', () => {
        expect(output.bounds.min).toEqual({x: 0, y: 0});
        expect(output.bounds.max.x).toBeCloseTo(1);
        expect(output.bounds.max.y).toBeCloseTo(0);
    });
});

describe('interpret() — F+F (turn left)', () => {
    let output: TurtleOutput;

    beforeAll(() => {
        const sys = compile({...CONVERGE_CONFIG, axiom: ['F', '+', 'F']});
        const result = generate(sys, 0);
        output = interpret(result, {stepLength: 1, angleDelta: 90, generationScaling: 1});
    });

    it('produces one path with two segments', () => {
        expect(output.paths[0].length).toBe(2);
    });

    it('first segment is horizontal (east)', () => {
        const s = output.paths[0][0];
        expect(s.from).toEqual({x: 0, y: 0});
        expect(s.to.x).toBeCloseTo(1);
        expect(s.to.y).toBeCloseTo(0);
    });

    it('second segment is vertical (north) after 90 left turn', () => {
        const s = output.paths[0][1];
        expect(s.from.x).toBeCloseTo(1);
        expect(s.from.y).toBeCloseTo(0);
        expect(s.to.x).toBeCloseTo(1);
        expect(s.to.y).toBeCloseTo(1);
    });
});

describe('interpret() — F-F (turn right)', () => {
    let output: TurtleOutput;

    beforeAll(() => {
        const sys = compile({...CONVERGE_CONFIG, axiom: ['F', '-', 'F']});
        const result = generate(sys, 0);
        output = interpret(result, {stepLength: 1, angleDelta: 90, generationScaling: 1});
    });

    it('second segment goes south after 90 right turn', () => {
        const s = output.paths[0][1];
        expect(s.from.x).toBeCloseTo(1);
        expect(s.from.y).toBeCloseTo(0);
        expect(s.to.x).toBeCloseTo(1);
        expect(s.to.y).toBeCloseTo(-1);
    });
});

// -- Branching ----------------------------------------------------------------

describe('interpret() — branching with [ and ]', () => {
    let output: TurtleOutput;

    beforeAll(() => {
        // F[+F]F — one branch left, then continue
        const sys = compile({...CONVERGE_CONFIG, axiom: ['F', '[', '+', 'F', ']', 'F']});
        const result = generate(sys, 0);
        output = interpret(result, {stepLength: 1, angleDelta: 90, generationScaling: 1});
    });

    it('produces 2 paths (one ] produces two path entries)', () => {
        expect(output.paths.length).toBe(2);
    });

    it('path 0 contains the initial F and the branch F', () => {
        expect(output.paths[0].length).toBe(2);
    });

    it('path 1 contains the trailing F after the branch', () => {
        expect(output.paths[1].length).toBe(1);
        const s = output.paths[1][0];
        expect(s.from.x).toBeCloseTo(1);
        expect(s.from.y).toBeCloseTo(0);
        expect(s.to.x).toBeCloseTo(2);
        expect(s.to.y).toBeCloseTo(0);
    });
});

describe('interpret() — nested branches', () => {
    let output: TurtleOutput;

    beforeAll(() => {
        // F[[+F]F] — nested brackets
        const sys = compile({...CONVERGE_CONFIG, axiom: ['F', '[', '[', '+', 'F', ']', 'F', ']']});
        const result = generate(sys, 0);
        output = interpret(result, {stepLength: 1, angleDelta: 90, generationScaling: 1});
    });

    it('two ] pops produce 2 path entries', () => {
        // Path lifecycle: [ does not end a path, only ] does.
        // F -> currentPath=[seg0], [ push, [ push, +F -> currentPath=[seg0,seg1],
        // ] pop -> push path0 (2 segs), F -> currentPath=[seg2],
        // ] pop -> push path1 (1 seg). End: empty currentPath not pushed.
        expect(output.paths.length).toBe(2);
    });
});

// -- Step length scaling ------------------------------------------------------

describe('interpret() — generationScaling', () => {
    it('applies scaling: stepLength=1, generationScaling=0.5, 2 generations -> step=0.25', () => {
        const config = {
            alphabet: {X: ['F'] as ['F']},
            productions: {X: ['F', '+', 'X'] as any},
            axiom: ['X'] as any,
            turtle: {stepLength: 1, angleDelta: 90, generationScaling: 0.5},
            maxIterations: 2,
        };
        const sys = compile(config);
        const result = generate(sys, 2);
        const output = interpret(result, config.turtle);
        const firstSeg = output.paths[0][0];
        expect(firstSeg.to.x).toBeCloseTo(0.25);
    });

    it('generationScaling=1 has no effect', () => {
        const sys = compile(SQUARE_CONFIG);
        const result = generate(sys, 3);
        const output = interpret(result, SQUARE_CONFIG.turtle);
        const firstSeg = output.paths[0][0];
        expect(firstSeg.to.x).toBeCloseTo(1);
    });
});

// -- Segment provenance -------------------------------------------------------

describe('interpret() — segment.letter field', () => {
    it('segments produced by X-derived F have letter="X"', () => {
        const sys = compile(SQUARE_CONFIG);
        const result = generate(sys, 3);
        const output = interpret(result, SQUARE_CONFIG.turtle);
        for (const seg of output.paths[0]) {
            expect(seg.letter).toBe('X');
        }
    });

    it('segments produced by direct keyword F in axiom have letter="F"', () => {
        const sys = compile(CONVERGE_CONFIG);
        const result = generate(sys, 5);
        const output = interpret(result, CONVERGE_CONFIG.turtle);
        for (const seg of output.paths[0]) {
            expect(seg.letter).toBe('F');
        }
    });
});

describe('interpret() — segment.generation field', () => {
    it('X-derived segments have generation equal to when that X was last a Letter', () => {
        const sys = compile(SQUARE_CONFIG);
        const result = generate(sys, 3);
        const output = interpret(result, SQUARE_CONFIG.turtle);
        // 4 segments from terminal [F,+,F,+,F,+,F]
        // Each F traces back to an X at a different generation
        expect(output.paths[0][0].generation).toBe(0);  // oldest F, from gen0 X
        expect(output.paths[0][1].generation).toBe(1);  // from gen1 X
        expect(output.paths[0][2].generation).toBe(2);  // from gen2 X
        expect(output.paths[0][3].generation).toBe(3);  // from gen3 X (terminal expansion)
    });

    it('stem-derived segments trace back to generation 1 where stem appears after rewriting', () => {
        const sys = compile(BRANCH_CONFIG);
        const result = generate(sys, 1);
        const output = interpret(result, BRANCH_CONFIG.turtle);
        // path[0][0] is the F from stem definition; stem is at gen1 index 0
        expect(output.paths[0][0].generation).toBe(1);
    });

    it('keyword-only axiom segments have generation=0', () => {
        const sys = compile(CONVERGE_CONFIG);
        const result = generate(sys, 5);
        const output = interpret(result, CONVERGE_CONFIG.turtle);
        for (const seg of output.paths[0]) {
            expect(seg.generation).toBe(0);
        }
    });
});

describe('interpret() — segment.opcodeIndex field', () => {
    it('opcodeIndex reflects position in the final terminal generation', () => {
        const sys = compile(CONVERGE_CONFIG);
        const result = generate(sys, 5);
        const output = interpret(result, CONVERGE_CONFIG.turtle);
        // Axiom F+F-F -> terminal [F,+,F,-,F]. F tokens at indices 0, 2, 4
        expect(output.paths[0][0].opcodeIndex).toBe(0);
        expect(output.paths[0][1].opcodeIndex).toBe(2);
        expect(output.paths[0][2].opcodeIndex).toBe(4);
    });
});
