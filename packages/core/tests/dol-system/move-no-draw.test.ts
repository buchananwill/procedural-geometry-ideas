import {compile} from '@proc-geo/core/dol-system/compile';
import {generate} from '@proc-geo/core/dol-system/generate';
import {interpret} from '@proc-geo/core/dol-system/interpret';
import {KEYWORD_OPCODES, NUM_KEYWORDS} from '@proc-geo/core/dol-system/types';
import type {SystemConfig, TurtleOutput} from '@proc-geo/core/dol-system/types';
import {CONVERGE_CONFIG} from './fixtures';

// -- Compile: f keyword opcode assignment -------------------------------------

describe('compile() — f keyword', () => {
    it('assigns f opcode 5 (MOVE_NO_DRAW)', () => {
        const cs = compile(CONVERGE_CONFIG);
        expect(cs.reverseTable[5]).toBe('f');
    });

    it('KEYWORD_OPCODES.MOVE_NO_DRAW is 5', () => {
        expect(KEYWORD_OPCODES.MOVE_NO_DRAW).toBe(5);
    });

    it('f production is identity: productions[5] = [5]', () => {
        const cs = compile(CONVERGE_CONFIG);
        expect(cs.productions[5]).toEqual([5]);
    });

    it('f definition is empty', () => {
        const cs = compile(CONVERGE_CONFIG);
        expect(cs.definitions[5]).toEqual([]);
    });

    it('compiles f in an alphabet definition', () => {
        const config: SystemConfig = {
            alphabet: {gap: ['F', 'f', 'F']},
            productions: {},
            axiom: ['gap'],
            turtle: {stepLength: 1, angleDelta: 90, generationScaling: 1},
            maxIterations: 1,
        };
        const cs = compile(config);
        const gapOpcode = cs.opcodeTable.get('gap')!;
        expect(cs.definitions[gapOpcode]).toEqual([0, 5, 0]);
    });
});

// -- Interpret: F f F path splitting and position advancement -----------------

describe('interpret() — F f F (move without drawing)', () => {
    let output: TurtleOutput;

    beforeAll(() => {
        const sys = compile({...CONVERGE_CONFIG, axiom: ['F', 'f', 'F']});
        const result = generate(sys, 0);
        output = interpret(result, {stepLength: 1, angleDelta: 90, generationScaling: 1});
    });

    it('produces 2 paths (f splits the path)', () => {
        expect(output.paths.length).toBe(2);
    });

    it('first path has 1 segment from the first F', () => {
        expect(output.paths[0].length).toBe(1);
    });

    it('second path has 1 segment from the second F', () => {
        expect(output.paths[1].length).toBe(1);
    });

    it('no segment is created for the f step', () => {
        const totalSegments = output.paths.reduce((sum, p) => sum + p.length, 0);
        expect(totalSegments).toBe(2);
    });

    it('first F segment goes from (0,0) to (1,0)', () => {
        const seg = output.paths[0][0];
        expect(seg.from).toEqual({x: 0, y: 0});
        expect(seg.to.x).toBeCloseTo(1);
        expect(seg.to.y).toBeCloseTo(0);
    });

    it('second F segment starts where f moved to: (2,0)', () => {
        const seg = output.paths[1][0];
        expect(seg.from.x).toBeCloseTo(2);
        expect(seg.from.y).toBeCloseTo(0);
    });

    it('second F segment ends at (3,0)', () => {
        const seg = output.paths[1][0];
        expect(seg.to.x).toBeCloseTo(3);
        expect(seg.to.y).toBeCloseTo(0);
    });

    it('bounds include the f movement: min=(0,0), max=(3,0)', () => {
        expect(output.bounds.min.x).toBeCloseTo(0);
        expect(output.bounds.min.y).toBeCloseTo(0);
        expect(output.bounds.max.x).toBeCloseTo(3);
        expect(output.bounds.max.y).toBeCloseTo(0);
    });
});

// -- Interpret: f alone produces no segments ----------------------------------

describe('interpret() — lone f command', () => {
    let output: TurtleOutput;

    beforeAll(() => {
        const sys = compile({...CONVERGE_CONFIG, axiom: ['f']});
        const result = generate(sys, 0);
        output = interpret(result, {stepLength: 1, angleDelta: 90, generationScaling: 1});
    });

    it('produces no paths (no segments drawn)', () => {
        expect(output.paths.length).toBe(0);
    });

    it('bounds include the movement from (0,0) to (1,0)', () => {
        expect(output.bounds.max.x).toBeCloseTo(1);
        expect(output.bounds.max.y).toBeCloseTo(0);
    });
});

// -- Interpret: f respects heading after a turn -------------------------------

describe('interpret() — f after a turn', () => {
    let output: TurtleOutput;

    beforeAll(() => {
        // F + f F: draw east, turn left 90, move-no-draw north, draw north
        const sys = compile({...CONVERGE_CONFIG, axiom: ['F', '+', 'f', 'F']});
        const result = generate(sys, 0);
        output = interpret(result, {stepLength: 1, angleDelta: 90, generationScaling: 1});
    });

    it('produces 2 paths', () => {
        expect(output.paths.length).toBe(2);
    });

    it('second F starts at (1,1) — f moved north from (1,0)', () => {
        const seg = output.paths[1][0];
        expect(seg.from.x).toBeCloseTo(1);
        expect(seg.from.y).toBeCloseTo(1);
    });

    it('second F ends at (1,2) — continues north', () => {
        const seg = output.paths[1][0];
        expect(seg.to.x).toBeCloseTo(1);
        expect(seg.to.y).toBeCloseTo(2);
    });
});

// -- Pipeline integration: letter with f in definition ------------------------

describe('Full pipeline — letter using f in definition', () => {
    const DASHED_CONFIG: SystemConfig = {
        alphabet: {dash: ['F', 'f']},
        productions: {dash: ['dash', 'dash']},
        axiom: ['dash'],
        turtle: {stepLength: 1, angleDelta: 90, generationScaling: 1},
        maxIterations: 1,
    };

    const sys = compile(DASHED_CONFIG);
    const result = generate(sys, DASHED_CONFIG.maxIterations);
    const output = interpret(result, DASHED_CONFIG.turtle);

    it('compiles and generates without error', () => {
        expect(result.generations.length).toBeGreaterThan(0);
    });

    it('produces 2 paths (each dash = F f, and there are 2 dashes)', () => {
        // gen0: [dash], gen1: [dash, dash]
        // terminal expansion: [F, f, F, f]
        // F -> path0(1seg), f -> flush, F -> path1(1seg), f -> flush (empty)
        expect(output.paths.length).toBe(2);
    });

    it('each path has exactly 1 segment', () => {
        expect(output.paths[0].length).toBe(1);
        expect(output.paths[1].length).toBe(1);
    });

    it('segments are spaced with gaps: first at (0,0)-(1,0), second at (2,0)-(3,0)', () => {
        expect(output.paths[0][0].from.x).toBeCloseTo(0);
        expect(output.paths[0][0].to.x).toBeCloseTo(1);
        expect(output.paths[1][0].from.x).toBeCloseTo(2);
        expect(output.paths[1][0].to.x).toBeCloseTo(3);
    });

    it('bounds span full extent including gaps: (0,0) to (4,0)', () => {
        expect(output.bounds.min.x).toBeCloseTo(0);
        expect(output.bounds.max.x).toBeCloseTo(4);
    });

    it('segment letter is "dash"', () => {
        expect(output.paths[0][0].letter).toBe('dash');
        expect(output.paths[1][0].letter).toBe('dash');
    });
});
