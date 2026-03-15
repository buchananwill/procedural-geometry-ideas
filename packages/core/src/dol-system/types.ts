import type {Vector2} from '../shared/types';

// ── Symbol vocabulary ─────────────────────────────────────────────────────────

/** The six built-in turtle control symbols. */
export type Keyword = 'F' | '+' | '-' | '[' | ']' | 'f';

/** A user-defined, non-terminal symbol name (max 16 characters). */
export type Letter = string;

/** A token that may appear in a production rule's right-hand side or in the axiom. */
export type Symbol = Keyword | Letter;

/** Opcode constants for the six keywords — dense integers 0..5. */
export const KEYWORD_OPCODES = {
    F: 0,
    PLUS: 1,
    MINUS: 2,
    PUSH: 3,
    POP: 4,
    MOVE_NO_DRAW: 5,
} as const;

export const NUM_KEYWORDS = 6;

/**
 * Keyword character literals in opcode order.
 * KEYWORD_NAMES[i] is the character whose opcode is i.
 * This is the single source of truth for keyword identity — KEYWORD_OPCODES,
 * compile()'s reverseTable, and all keyword membership checks derive from this.
 */
export const KEYWORD_NAMES: readonly string[] = ['F', '+', '-', '[', ']', 'f'] as const;

// ── User-facing configuration ─────────────────────────────────────────────────

export interface TurtleConfig {
    /** Base forward distance per F command. */
    stepLength: number;
    /** Turn angle in degrees for + and −. */
    angleDelta: number;
    /** Multiplier applied to stepLength per rewriting generation. */
    generationScaling: number;
}

export interface SystemConfig {
    /** Letter → keyword-only definition sequence. */
    alphabet: Record<Letter, Keyword[]>;
    /** Letter → (Letter | Keyword)[] rewriting rule. Missing entries receive identity. */
    productions: Record<Letter, Symbol[]>;
    /** Starting word (may contain Letters and/or Keywords). */
    axiom: Symbol[];
    turtle: TurtleConfig;
    /** Maximum number of rewriting generations before forced termination. */
    maxIterations: number;
}

// ── Compiled system ───────────────────────────────────────────────────────────

export interface CompiledSystem {
    /** Maps Letter name → opcode (≥ NUM_KEYWORDS). Used at compile/decompile boundary only. */
    opcodeTable: Map<Letter, number>;
    /** reverseTable[opcode] → symbol name (keyword string or letter name). */
    reverseTable: string[];
    /**
     * productions[opcode] → opcode[] expansion.
     * Keywords expand to themselves (identity): productions[0] = [0], etc.
     * Letters expand to their production rule (identity if not specified).
     */
    productions: number[][];
    /**
     * definitions[opcode] → keyword opcode[].
     * Keywords have empty definitions (they ARE keywords; no expansion needed).
     * Letters contain the keyword sequence that defines their geometric meaning.
     */
    definitions: number[][];
    /** Compiled axiom in opcode space. */
    axiom: number[];
    /** Always 6. Keyword opcodes are 0..5; letter opcodes start at NUM_KEYWORDS. */
    numKeywords: 6;
}

// ── Generation (rewriting) ────────────────────────────────────────────────────

export interface LinkedToken {
    opcode: number;
    /**
     * Index of the token in the previous generation that produced this token.
     * For axiom tokens (generation 0), parentIndex = -1 (sentinel: no parent).
     */
    parentIndex: number;
}

/** A single generation's word with full provenance. */
export type LinkedWord = LinkedToken[];

export interface GenerationResult {
    /**
     * All rewriting generations from axiom (index 0) through the final rewritten
     * word (last index). Contains only rewriting steps — terminal expansion of
     * Letters to keywords is performed by interpret(), not stored here.
     */
    generations: LinkedWord[];
    /** Back-reference for opcode→symbol resolution. */
    system: CompiledSystem;
    /** True if rewriting stopped early because the word became all keywords. */
    converged: boolean;
}

// ── Turtle output ─────────────────────────────────────────────────────────────

export interface Segment {
    from: Vector2;
    to: Vector2;
    /** Position of this token in the final (terminal-expanded) generation's word. */
    opcodeIndex: number;
    /** The keyword opcode (always F = 0) that produced this segment. */
    opcode: number;
    /** The Letter name of the ancestor token resolved via reverseTable (or 'F' if axiom was pure keyword). */
    letter: Letter;
    /** The generation index in GenerationResult.generations of the Letter ancestor. */
    generation: number;
}

export interface TurtleOutput {
    /**
     * Array of polylines. A new polyline begins at the start of interpretation
     * and after each ']' pop. Empty polylines are omitted.
     */
    paths: Segment[][];
    bounds: { min: Vector2; max: Vector2 };
}

// ── Validation ────────────────────────────────────────────────────────────────

export interface ValidationError {
    field: 'alphabet' | 'productions' | 'axiom' | 'letterName';
    message: string;
}

export class DolSystemValidationError extends Error {
    readonly errors: ValidationError[];

    constructor(errors: ValidationError[]) {
        super(errors.map(e => `[${e.field}] ${e.message}`).join('; '));
        this.name = 'DolSystemValidationError';
        this.errors = errors;
    }
}
