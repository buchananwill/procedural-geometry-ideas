  # D0L System V1 — Implementation Plan

  > **Target spec:** `docs/notes/dol-system-v1-spec.md`
  > **Date:** 2026-03-14
  > **Approach:** TDD — all phases beyond Phase 0 begin with failing tests against agreed interfaces, and proceed until
  the test suite is green.

  ---

  ## Overview

  The D0L system is a three-layer pipeline:

  SystemConfig ──compile()──► CompiledSystem
                                   │
                ──generate()──► GenerationResult  (rewriting + terminal expansion)
                                   │
                ──interpret()──► TurtleOutput       (turtle geometry)

  This plan breaks the work into six phases, with a mandatory pause-and-confirm between each:

  | Phase | Title                                     | Kind       |
  |-------|-------------------------------------------|------------|
  | 0     | Hoist `Vector2` to shared module          | Refactor   |
  | 1     | D0L module skeleton — types only          | New code   |
  | 2     | Compile layer (TDD)                       | New code   |
  | 3     | Generate layer (TDD)                      | New code   |
  | 4     | Interpret layer (TDD)                     | New code   |
  | 5     | Integration, barrel export, solved tests  | New code   |

  ---

  ## Phase 0 — Pre-work: Hoist `Vector2` to a Shared Module

  ### Rationale

  `Vector2` is currently defined in `packages/core/src/straight-skeleton/types.ts` (line 1–4).
  `random-polygon/types.ts` already cross-imports it from the straight-skeleton module — a clear layering violation: a
  utility that generates random polygons should not depend on a directory named after a specific algorithm in order to
  obtain a 2D point type.

  The incoming D0L module will also need `Vector2` (for `Segment.from/to` and `TurtleOutput.bounds`). That would create
  a third cross-dependency, cementing the wrong pattern.

  `Vector2` is the only type in `straight-skeleton/types.ts` that qualifies for hoisting: it is a **pure,
  algorithm-agnostic geometric primitive**. Every other type in that file (`PolygonNode`, `InteriorEdge`,
  `StraightSkeletonSolverContext`, etc.) is tightly coupled to the straight skeleton algorithm and must stay where it
  is.

  ### Files to Create

  #### `packages/core/src/shared/types.ts` *(new)*

  ```typescript
  /**
   * Shared geometric primitives used across all @proc-geo/core modules.
   */

  /** An immutable 2-D point or direction vector. */
  export interface Vector2 {
    x: number;
    y: number;
  }
  ```

  ▎ Keep this file small: only types that are demonstrably needed by two or more independent algorithm modules belong
  here. Do not pre-emptively add Segment, Ray, or anything else at this stage.

  Files to Modify

  packages/core/src/straight-skeleton/types.ts

  Remove the Vector2 interface definition (lines 1–4).
  Add at the top:

  `export type { Vector2 } from '../shared/types';`

  Re-exporting via the straight-skeleton barrel preserves the existing public API contract for any downstream consumers
  who import Vector2 from @proc-geo/core (they won't notice the change).

  `packages/core/src/random-polygon/types.ts`

  Change line 1 from:

  `import type { Vector2 } from "../straight-skeleton/types";`

  to:

  ```
  import type { Vector2 } from "../shared/types";

  packages/core/src/index.ts
  ```

  The existing barrel already re-exports Vector2 through the straight-skeleton/types path. Because
  straight-skeleton/types.ts now re-exports Vector2 from shared/types, the barrel chain is unbroken — no change required
   here. Verify with tsc --noEmit and the full Jest suite.

  Validation Checklist

  - pnpm --filter @proc-geo/core build passes with no TypeScript errors
  - pnpm --filter @proc-geo/core test — all 16 existing test files remain green
  - grep -r "from.*straight-skeleton/types" packages/core/src/random-polygon returns nothing
  - grep -r "from.*shared/types" packages/core/src shows exactly two files (random-polygon and the straight-skeleton
  re-export)

  ---
  Phase 1 — D0L Module Skeleton (Types Only)

  Directory structure to create

  packages/core/src/dol-system/
  ├── types.ts        ← all interfaces & type aliases from the spec
  ├── compile.ts      ← stub (Phase 2)
  ├── generate.ts     ← stub (Phase 3)
  ├── interpret.ts    ← stub (Phase 4)
  └── index.ts        ← barrel (Phase 5)

  packages/core/tests/dol-system/
  ├── compile.test.ts    ← (Phase 2)
  ├── generate.test.ts   ← (Phase 3)
  ├── interpret.test.ts  ← (Phase 4)
  └── fixtures.ts        ← shared solved examples (built in Phase 2, extended in 3 & 4)

```
  packages/core/src/dol-system/types.ts

  import type { Vector2 } from '../shared/types';

  // ── Symbol vocabulary ─────────────────────────────────────────────────────────

  /** The five built-in turtle control symbols. */
  export type Keyword = 'F' | '+' | '-' | '[' | ']';

  /** A user-defined, non-terminal symbol name (max 16 characters). */
  export type Letter = string;

  /** A token that may appear in a production rule's right-hand side or in the axiom. */
  export type Symbol = Keyword | Letter;

  /** Opcode constants for the five keywords — dense integers 0..4. */
  export const KEYWORD_OPCODES = {
    F:    0,
    PLUS: 1,
    MINUS: 2,
    PUSH: 3,
    POP:  4,
  } as const;

  export const NUM_KEYWORDS = 5;

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
    /** Always 5. Keyword opcodes are 0..4; letter opcodes start at NUM_KEYWORDS. */
    numKeywords: 5;
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
     * All generations from axiom (index 0) through the final terminal expansion
     * (last index). The terminal expansion is always the last entry, even when
     * the axiom contains only keywords (in which case it is a copy of gen 0).
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
```
  Stub files

  Create compile.ts, generate.ts, interpret.ts with signature-only stubs that throw new Error('not implemented'). This
  lets the test files import and typecheck before any implementation exists.

  // compile.ts stub
  import { SystemConfig, CompiledSystem } from './types';
  export function compile(_config: SystemConfig): CompiledSystem {
    throw new Error('not implemented');
  }

  // generate.ts stub
  import { CompiledSystem, LinkedWord, GenerationResult } from './types';
  export function step(_system: CompiledSystem, _word: LinkedWord): LinkedWord {
    throw new Error('not implemented');
  }
  export function generate(_system: CompiledSystem, _generations: number): GenerationResult {
    throw new Error('not implemented');
  }

  // interpret.ts stub
  import { GenerationResult, TurtleConfig, TurtleOutput } from './types';
  export function interpret(_result: GenerationResult, _config: TurtleConfig): TurtleOutput {
    throw new Error('not implemented');
  }

  Validation Checklist

  - pnpm --filter @proc-geo/core build — TypeScript compiles (stubs are valid)
  - All existing tests still pass (no regressions from Phase 0 carry-through)

  ---
  Phase 2 — Compile Layer (TDD)

  Solved Fixture Used in This Phase

  The test fixtures file packages/core/tests/dol-system/fixtures.ts defines three concrete, fully-solved D0L
  configurations. These fixtures are shared across Phases 2–4.

  Fixture A — "Unit Square" (SQUARE_CONFIG)

  A single letter X with production X → F+X (grow by prepending F+). After 3 generations and terminal expansion, the
  final word is F+F+F+F, which the turtle traces as a unit square.

  export const SQUARE_CONFIG: SystemConfig = {
    alphabet: { X: ['F'] },
    productions: { X: ['F', '+', 'X'] },
    axiom: ['X'],
    turtle: { stepLength: 1, angleDelta: 90, generationScaling: 1 },
    maxIterations: 3,
  };

  Compilation — expected CompiledSystem:

  ┌────────┬────────┐
  │ Symbol │ Opcode │
  ├────────┼────────┤
  │ F      │ 0      │
  ├────────┼────────┤
  │ +      │ 1      │
  ├────────┼────────┤
  │ -      │ 2      │
  ├────────┼────────┤
  │ [      │ 3      │
  ├────────┼────────┤
  │ ]      │ 4      │
  ├────────┼────────┤
  │ X      │ 5      │
  └────────┴────────┘

  productions[0] = [0]          // F → F (identity)
  productions[1] = [1]          // + → +
  productions[2] = [2]          // - → -
  productions[3] = [3]          // [ → [
  productions[4] = [4]          // ] → ]
  productions[5] = [0, 1, 5]   // X → F + X

  definitions[0..4] = []        // keywords have no letter-level definition
  definitions[5]    = [0]       // X means: draw F

  axiom = [5]                   // X
  reverseTable = ['F','+','-','[',']','X']

  Generation trace (maxIterations=3):

  ┌────────────────────────┬─────────────────────┬─────────────────┬────────────┐
  │          Gen           │ Word (symbol names) │  Opcode array   │ Converged? │
  ├────────────────────────┼─────────────────────┼─────────────────┼────────────┤
  │ 0                      │ X                   │ [5]             │ no         │
  ├────────────────────────┼─────────────────────┼─────────────────┼────────────┤
  │ 1                      │ F + X               │ [0,1,5]         │ no         │
  ├────────────────────────┼─────────────────────┼─────────────────┼────────────┤
  │ 2                      │ F + F + X           │ [0,1,0,1,5]     │ no         │
  ├────────────────────────┼─────────────────────┼─────────────────┼────────────┤
  │ 3                      │ F + F + F + X       │ [0,1,0,1,0,1,5] │ no         │
  ├────────────────────────┼─────────────────────┼─────────────────┼────────────┤
  │ 4 (terminal expansion) │ F + F + F + F       │ [0,1,0,1,0,1,0] │ —          │
  └────────────────────────┴─────────────────────┴─────────────────┴────────────┘

  converged = false (iteration limit reached, not all-keyword convergence).

  Provenance chain for terminal-expansion token at pos 6:

  pos 6: {op:0 (F), pIdx:6}   ← gen3 pos 6: {op:5 (X), pIdx:4}
                               ← gen2 pos 4: {op:5 (X), pIdx:2}
                               ← gen1 pos 2: {op:5 (X), pIdx:0}
                               ← gen0 pos 0: {op:5 (X), pIdx:-1}  ← root (axiom)

  ---
  Fixture B — "Immediate Convergence" (CONVERGE_CONFIG)

  Axiom is pure keywords — no letters at all. Rewriting converges in generation 0.

  export const CONVERGE_CONFIG: SystemConfig = {
    alphabet: {},
    productions: {},
    axiom: ['F', '+', 'F', '-', 'F'],
    turtle: { stepLength: 1, angleDelta: 90, generationScaling: 1 },
    maxIterations: 5,
  };

  Compilation:

  productions[0..4] = [[0],[1],[2],[3],[4]]   // all identity
  definitions[0..4] = []
  axiom = [0, 1, 0, 2, 0]
  opcodeTable = {}  (no letters)
  reverseTable = ['F','+','-','[',']']

  Generation trace:

  ┌─────────────────────┬───────────┬───────────────────────────────────────┐
  │         Gen         │   Word    │              Converged?               │
  ├─────────────────────┼───────────┼───────────────────────────────────────┤
  │ 0                   │ F + F − F │ yes (all keywords, stops immediately) │
  ├─────────────────────┼───────────┼───────────────────────────────────────┤
  │ 1 (terminal, no-op) │ F + F − F │ —                                     │
  └─────────────────────┴───────────┴───────────────────────────────────────┘

  converged = true, generations.length = 2.

  ---
  Fixture C — "Simple Branch" (BRANCH_CONFIG)

  Two letters: stem (definition F) and tip (definition [+F][-F]). Production stem → stem tip. After 1 generation and
  terminal expansion, the word is F[+F][-F].

  export const BRANCH_CONFIG: SystemConfig = {
    alphabet: {
      stem: ['F'],
      tip:  ['[', '+', 'F', ']', '[', '-', 'F', ']'],
    },
    productions: {
      stem: ['stem', 'tip'],   // stem → stem tip
      // tip has no explicit production → receives identity
    },
    axiom: ['stem'],
    turtle: { stepLength: 1, angleDelta: 90, generationScaling: 1 },
    maxIterations: 1,
  };

  Compilation — opcode assignment (alphabet keys sorted: stem < tip):

  ┌────────┬────────┐
  │ Symbol │ Opcode │
  ├────────┼────────┤
  │ F      │ 0      │
  ├────────┼────────┤
  │ +      │ 1      │
  ├────────┼────────┤
  │ -      │ 2      │
  ├────────┼────────┤
  │ [      │ 3      │
  ├────────┼────────┤
  │ ]      │ 4      │
  ├────────┼────────┤
  │ stem   │ 5      │
  ├────────┼────────┤
  │ tip    │ 6      │
  └────────┴────────┘

  productions[5] = [5, 6]              // stem → stem tip
  productions[6] = [6]                 // tip → tip (identity)
  definitions[5] = [0]                 // stem = F
  definitions[6] = [3, 1, 0, 4, 3, 2, 0, 4]  // tip = [+F][-F]
  axiom = [5]

  Generation trace (maxIterations=1):

  ┌────────────────────────┬────────────────┬─────────────────────┐
  │          Gen           │ Word (symbols) │    Opcode array     │
  ├────────────────────────┼────────────────┼─────────────────────┤
  │ 0                      │ stem           │ [5]                 │
  ├────────────────────────┼────────────────┼─────────────────────┤
  │ 1                      │ stem tip       │ [5, 6]              │
  ├────────────────────────┼────────────────┼─────────────────────┤
  │ 2 (terminal expansion) │ F [+F][-F]     │ [0,3,1,0,4,3,2,0,4] │
  └────────────────────────┴────────────────┴─────────────────────┘

  converged = false.

  ---
  Test File: packages/core/tests/dol-system/compile.test.ts

  All tests import from @proc-geo/core (resolved by jest.config.cjs moduleNameMapper to src/index.ts). The public API
  for the D0L module will be added to the barrel in Phase 5; for now, tests import directly from the source path via the
   moduleNameMapper pattern '^@proc-geo/core/(.*)$': '<rootDir>/src/$1'.

  // compile.test.ts — write these BEFORE implementing compile.ts

  import { compile } from '@proc-geo/core/dol-system/compile';
  import { DolSystemValidationError, NUM_KEYWORDS } from '@proc-geo/core/dol-system/types';
  import { SQUARE_CONFIG, CONVERGE_CONFIG, BRANCH_CONFIG } from './fixtures';

  // ── Validation failures ───────────────────────────────────────────────────────

  describe('compile() — validation', () => {
    it('throws DolSystemValidationError for an alphabet value containing a Letter', () => {
      expect(() => compile({
        ...SQUARE_CONFIG,
        alphabet: { X: ['F'], Y: ['X' as any] },  // Y's definition contains a Letter
      })).toThrow(DolSystemValidationError);
    });

    it('throws for a letter name exceeding 16 characters', () => {
      const longName = 'A'.repeat(17);
      expect(() => compile({
        ...SQUARE_CONFIG,
        alphabet: { [longName]: ['F'] },
      })).toThrow(DolSystemValidationError);
    });

    it('throws for a production rule referencing an undeclared letter', () => {
      expect(() => compile({
        ...SQUARE_CONFIG,
        productions: { X: ['F', '+', 'Z'] },  // Z not in alphabet
      })).toThrow(DolSystemValidationError);
    });

    it('throws for an axiom referencing an undeclared letter', () => {
      expect(() => compile({
        ...SQUARE_CONFIG,
        axiom: ['X', 'Y'],  // Y not in alphabet
      })).toThrow(DolSystemValidationError);
    });

    it('accepts a valid config without throwing', () => {
      expect(() => compile(SQUARE_CONFIG)).not.toThrow();
    });

    it('accepts an empty alphabet and empty axiom without throwing', () => {
      expect(() => compile(CONVERGE_CONFIG)).not.toThrow();
    });

    it('collects multiple errors into a single thrown DolSystemValidationError', () => {
      let caught: DolSystemValidationError | null = null;
      try {
        compile({
          alphabet: { toolongname12345678: ['F'], Y: ['Z' as any] },
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

  // ── Opcode assignment ─────────────────────────────────────────────────────────

  describe('compile() — opcode table', () => {
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

  // ── Productions ───────────────────────────────────────────────────────────────

  describe('compile() — productions array', () => {
    it('keyword productions are identity: productions[k] = [k] for k in 0..4', () => {
      const cs = compile(SQUARE_CONFIG);
      for (let k = 0; k < 5; k++) {
        expect(cs.productions[k]).toEqual([k]);
      }
    });

    it('compiles X → F + X correctly', () => {
      const cs = compile(SQUARE_CONFIG);
      expect(cs.productions[5]).toEqual([0, 1, 5]);  // F=0, +=1, X=5
    });

    it('unspecified letter production defaults to identity', () => {
      const cs = compile(BRANCH_CONFIG);
      expect(cs.productions[6]).toEqual([6]);  // tip → tip (identity)
    });

    it('compiles stem → stem tip correctly', () => {
      const cs = compile(BRANCH_CONFIG);
      expect(cs.productions[5]).toEqual([5, 6]);
    });
  });

  // ── Definitions ───────────────────────────────────────────────────────────────

  describe('compile() — definitions array', () => {
    it('keyword definitions are all empty arrays', () => {
      const cs = compile(SQUARE_CONFIG);
      for (let k = 0; k < 5; k++) {
        expect(cs.definitions[k]).toEqual([]);
      }
    });

    it('compiles X definition (F) correctly', () => {
      const cs = compile(SQUARE_CONFIG);
      expect(cs.definitions[5]).toEqual([0]);  // [F]
    });

    it('compiles tip definition ([+F][-F]) correctly', () => {
      const cs = compile(BRANCH_CONFIG);
      expect(cs.definitions[6]).toEqual([3, 1, 0, 4, 3, 2, 0, 4]);
    });
  });

  // ── Axiom ─────────────────────────────────────────────────────────────────────

  describe('compile() — axiom', () => {
    it('compiles single-letter axiom', () => {
      const cs = compile(SQUARE_CONFIG);
      expect(cs.axiom).toEqual([5]);  // X=5
    });

    it('compiles all-keyword axiom', () => {
      const cs = compile(CONVERGE_CONFIG);
      expect(cs.axiom).toEqual([0, 1, 0, 2, 0]);  // F+F-F
    });
  });

  Implementation Notes for compile.ts

  1. Opcode assignment order: Sort Object.keys(config.alphabet) lexicographically, then assign opcodes 5, 6, 7, ... The
  sort must be stable and deterministic so fixture expectations hold. Use localeCompare or standard JS string sort.
  2. Validation pass: Collect all errors before throwing; never throw on the first error. Iterate the alphabet, then
  productions, then axiom in sequence.
  3. Keywords in productions: When compiling a production right-hand side, a symbol that is itself a keyword ('F', '+',
  etc.) maps to its fixed opcode. A symbol not in KEYWORD_OPCODES and not in opcodeTable is a validation error.
  4. Keyword identity in productions array: Always set productions[k] = [k] for k ∈ 0..4 — the generation engine relies
  on this unconditionally.
  5. reverseTable construction: Pre-populate indices 0–4 with the keyword strings, then for each letter (in opcode
  order) set reverseTable[opcode] = letterName.

  Validation Checklist

  - compile.test.ts has N tests, all RED (not-implemented throws)
  - Implement compile.ts
  - All compile tests GREEN, existing tests still GREEN

  ---
  Phase 3 — Generate Layer (TDD)

  Test File: packages/core/tests/dol-system/generate.test.ts

  import { compile } from '@proc-geo/core/dol-system/compile';
  import { step, generate } from '@proc-geo/core/dol-system/generate';
  import { SQUARE_CONFIG, CONVERGE_CONFIG, BRANCH_CONFIG } from './fixtures';

  const squareSystem  = compile(SQUARE_CONFIG);
  const convergeSystem = compile(CONVERGE_CONFIG);
  const branchSystem  = compile(BRANCH_CONFIG);

  // ── step() ────────────────────────────────────────────────────────────────────

  describe('step()', () => {
    it('expands a single Letter token into its production', () => {
      // X(op:5) → [F(0), +(1), X(5)]
      const axiomWord = [{ opcode: 5, parentIndex: -1 }];
      const gen1 = step(squareSystem, axiomWord);
      expect(gen1.map(t => t.opcode)).toEqual([0, 1, 5]);
    });

    it('every output token references its parent index in the input word', () => {
      const axiomWord = [{ opcode: 5, parentIndex: -1 }];
      const gen1 = step(squareSystem, axiomWord);
      // All three tokens in F+X came from index 0 (the X)
      expect(gen1.every(t => t.parentIndex === 0)).toBe(true);
    });

    it('keywords pass through unchanged', () => {
      const word = [{ opcode: 0, parentIndex: -1 }, { opcode: 1, parentIndex: -1 }];
      const result = step(squareSystem, word);
      expect(result.map(t => t.opcode)).toEqual([0, 1]);
    });

    it('parentIndex for pass-through keyword tokens is the source index', () => {
      const word = [{ opcode: 0, parentIndex: -1 }, { opcode: 1, parentIndex: -1 }];
      const result = step(squareSystem, word);
      expect(result[0].parentIndex).toBe(0);
      expect(result[1].parentIndex).toBe(1);
    });

    it('expands two letters independently in the same word', () => {
      // stem(5) tip(6) → [stem(5), tip(6)] then step → [stem(5), tip(6), tip(6)]
      const stemTip = [{ opcode: 5, parentIndex: -1 }, { opcode: 6, parentIndex: -1 }];
      const result = step(branchSystem, stemTip);
      // stem → [stem, tip], tip → [tip]
      expect(result.map(t => t.opcode)).toEqual([5, 6, 6]);
    });
  });

  // ── generate() — axiom handling ───────────────────────────────────────────────

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
      // generations = [axiom, gen1, gen2, gen3, terminalExpansion] → length 5
      expect(result.generations.length).toBe(5);
    });

    it('gen1 word matches expected expansion of X', () => {
      const result = generate(squareSystem, 3);
      expect(result.generations[1].map(t => t.opcode)).toEqual([0, 1, 5]);  // F+X
    });

    it('gen3 word is F+F+F+X (7 tokens)', () => {
      const result = generate(squareSystem, 3);
      expect(result.generations[3].map(t => t.opcode)).toEqual([0,1,0,1,0,1,5]);
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
      // [axiom, terminalExpansion] → length 2
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
      const gen3 = result.generations[3];
      const terminal = result.generations[4];
      // gen3 ends with X at position 6; terminal expands it to F at position 6
      // X's definition is [0] (F), so terminal token 6 should be {op:0, pIdx:6}
      expect(terminal[6].opcode).toBe(0);
      expect(terminal[6].parentIndex).toBe(6);
    });

    it('terminal expansion passes keywords through unchanged', () => {
      const result = generate(squareSystem, 3);
      const gen3 = result.generations[3];
      const terminal = result.generations[4];
      // First 6 tokens in gen3 are already keywords; they should be identical in terminal
      for (let i = 0; i < 6; i++) {
        expect(terminal[i].opcode).toBe(gen3[i].opcode);
        expect(terminal[i].parentIndex).toBe(i);
      }
    });

    it('terminal expansion of all-keyword axiom is a no-op copy', () => {
      const result = generate(convergeSystem, 5);
      const axiom  = result.generations[0];
      const terminal = result.generations[1];
      expect(terminal.map(t => t.opcode)).toEqual(axiom.map(t => t.opcode));
    });
  });

  // ── generate() — provenance chain ────────────────────────────────────────────

  describe('generate() — provenance tracing', () => {
    it('can trace the final F at pos 6 back to the axiom X at pos 0', () => {
      const result = generate(squareSystem, 3);
      const gens = result.generations;
      // Walk the chain from terminal gen back to axiom
      let genIdx = gens.length - 1;
      let tokenIdx = 6;
      const chain: { gen: number; opcode: number }[] = [];

      while (genIdx >= 0) {
        chain.push({ gen: genIdx, opcode: gens[genIdx][tokenIdx].opcode });
        const pIdx = gens[genIdx][tokenIdx].parentIndex;
        if (pIdx === -1) break;
        tokenIdx = pIdx;
        genIdx--;
      }

      // Chain should end with the axiom token: op=5 (X), gen=0
      const root = chain[chain.length - 1];
      expect(root.opcode).toBe(5);  // X
      expect(root.gen).toBe(0);
    });
  });

  Implementation Notes for generate.ts

  1. step(system, word): For each token at index i in word, look up system.productions[token.opcode] and emit one
  LinkedToken per opcode in the production, each with parentIndex = i. The identity production [k] for a keyword emits
  exactly one token.
  2. generate(system, generations):
    - Build gen0 from system.axiom: map each opcode to {opcode, parentIndex: -1}.
    - Check convergence: if all opcodes in gen0 are < NUM_KEYWORDS, set converged = true, do not rewrite.
    - Otherwise, loop 1..N: call step, check convergence after each step.
    - After rewriting loop, perform terminal expansion as a final step-like pass where Letters are replaced by
  definitions[opcode] entries, each linked to the Letter token's index in the previous generation. Keywords are passed
  through with parentIndex = i.
    - Return { generations, system, converged }.
  3. Terminal expansion detail: This is distinct from step() — it uses definitions not productions. Consider a private
  terminalExpand(system, word) helper rather than reusing step.

  Validation Checklist

  - generate.test.ts — all tests RED
  - Implement generate.ts
  - All generate tests GREEN
  - All prior tests still GREEN

  ---
  Phase 4 — Interpret Layer (TDD)

  Turtle Coordinate Convention

  - Initial position: {x: 0, y: 0}
  - Initial heading: 0° (east — positive-X direction)
  - + (turn left): heading += angleDelta (counter-clockwise in standard math coordinates)
  - - (turn right): heading -= angleDelta
  - F move direction: { x: cos(heading_rad), y: sin(heading_rad) }
  - [ push: saves { position, heading } onto stack
  - ] pop: restores { position, heading } and ends the current path (pushes to paths if non-empty), starts a fresh
  current path
  - At end of word: if current path is non-empty, push to paths

  Effective step length formula: stepLength × (generationScaling ^ rewritingGenerations)
  where rewritingGenerations = generations.length - 2 (subtracts the axiom entry and the terminal expansion entry). With
   generationScaling = 1, this is always stepLength regardless of depth.

  letter field on Segment: Resolve via provenance chain — walk parentIndex from the terminal generation backwards until
  finding the first token whose opcode ≥ NUM_KEYWORDS (i.e., a Letter). Use system.reverseTable[opcode] to get the name.
   If the ancestor chain reaches gen 0 with the token still being a keyword (i.e., the keyword appeared directly in the
  axiom), use the keyword's name (e.g. 'F').

  Test File: packages/core/tests/dol-system/interpret.test.ts

  import { compile }    from '@proc-geo/core/dol-system/compile';
  import { generate }   from '@proc-geo/core/dol-system/generate';
  import { interpret }  from '@proc-geo/core/dol-system/interpret';
  import {
    SQUARE_CONFIG,
    CONVERGE_CONFIG,
    BRANCH_CONFIG,
    EXPECTED_SQUARE_PATHS,
    EXPECTED_CONVERGE_PATHS,
    EXPECTED_BRANCH_PATHS,
  } from './fixtures';

  // ── Primitive turtle tests ────────────────────────────────────────────────────

  describe('interpret() — single F command', () => {
    const sys = compile({ ...CONVERGE_CONFIG, axiom: ['F'] });
    const result = generate(sys, 0);
    const output = interpret(result, CONVERGE_CONFIG.turtle);

    it('produces one path with one segment', () => {
      expect(output.paths.length).toBe(1);
      expect(output.paths[0].length).toBe(1);
    });

    it('segment goes from (0,0) to (1,0) for heading=0°', () => {
      const seg = output.paths[0][0];
      expect(seg.from).toEqual({ x: 0, y: 0 });
      expect(seg.to.x).toBeCloseTo(1);
      expect(seg.to.y).toBeCloseTo(0);
    });

    it('bounds are {min:{0,0}, max:{1,0}}', () => {
      expect(output.bounds.min).toEqual({ x: 0, y: 0 });
      expect(output.bounds.max.x).toBeCloseTo(1);
    });
  });

  describe('interpret() — F+F (turn left)', () => {
    const sys = compile({ ...CONVERGE_CONFIG, axiom: ['F', '+', 'F'] });
    const result = generate(sys, 0);
    const output = interpret(result, { stepLength: 1, angleDelta: 90, generationScaling: 1 });

    it('produces one path with two segments', () => {
      expect(output.paths[0].length).toBe(2);
    });

    it('first segment is horizontal (east)', () => {
      const s = output.paths[0][0];
      expect(s.from).toEqual({ x: 0, y: 0 });
      expect(s.to.x).toBeCloseTo(1);
      expect(s.to.y).toBeCloseTo(0);
    });

    it('second segment is vertical (north) after 90° left turn', () => {
      const s = output.paths[0][1];
      expect(s.from.x).toBeCloseTo(1);
      expect(s.from.y).toBeCloseTo(0);
      expect(s.to.x).toBeCloseTo(1);
      expect(s.to.y).toBeCloseTo(1);
    });
  });

  describe('interpret() — F-F (turn right)', () => {
    const sys = compile({ ...CONVERGE_CONFIG, axiom: ['F', '-', 'F'] });
    const result = generate(sys, 0);
    const output = interpret(result, { stepLength: 1, angleDelta: 90, generationScaling: 1 });

    it('second segment goes south after 90° right turn', () => {
      const s = output.paths[0][1];
      expect(s.to.y).toBeCloseTo(-1);
    });
  });

  // ── Branching ─────────────────────────────────────────────────────────────────

  describe('interpret() — branching with [ and ]', () => {
    // F[+F]F — one branch left, then continue
    const sys = compile({ ...CONVERGE_CONFIG, axiom: ['F', '[', '+', 'F', ']', 'F'] });
    const result = generate(sys, 0);
    const output = interpret(result, { stepLength: 1, angleDelta: 90, generationScaling: 1 });

    it('produces 2 paths (one ] → two path entries)', () => {
      expect(output.paths.length).toBe(2);
    });

    it('path 0 contains the initial F and the branch F', () => {
      // F, then [, +, F → branch F in path 0; ] closes path 0
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
    // F[[+F]F] — nested brackets produce 3 paths
    const sys = compile({ ...CONVERGE_CONFIG, axiom: ['F', '[', '[', '+', 'F', ']', 'F', ']'] });
    const result = generate(sys, 0);
    const output = interpret(result, { stepLength: 1, angleDelta: 90, generationScaling: 1 });

    it('two ] pops produce 3 path entries', () => {
      expect(output.paths.length).toBe(3);
    });
  });

  // ── Step length scaling ───────────────────────────────────────────────────────

  describe('interpret() — generationScaling', () => {
    it('applies scaling: stepLength=1, generationScaling=0.5, 2 generations → step=0.25', () => {
      const config = {
        alphabet: { X: ['F'] as ['F'] },
        productions: { X: ['F', '+', 'X'] as any },
        axiom: ['X'] as any,
        turtle: { stepLength: 1, angleDelta: 90, generationScaling: 0.5 },
        maxIterations: 2,
      };
      const sys = compile(config);
      const result = generate(sys, 2);
      // 2 rewriting generations → effectiveStep = 1 * 0.5^2 = 0.25
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

  // ── Segment provenance ────────────────────────────────────────────────────────

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

  Solved Pipeline Outputs (add to fixtures.ts)

  These expected values let Phase 5 end-to-end tests make precise assertions.

  EXPECTED_SQUARE_PATHS (from SQUARE_CONFIG with maxIterations=3)

  // The turtle traces a unit square counter-clockwise (with angleDelta=90, turning left)
  export const EXPECTED_SQUARE_PATHS = {
    pathCount: 1,
    segmentCount: 4,
    // path[0][0]: (0,0)→(1,0)
    // path[0][1]: (1,0)→(1,1)
    // path[0][2]: (1,1)→(0,1)
    // path[0][3]: (0,1)→(0,0)
    bounds: { min: { x: 0, y: 0 }, max: { x: 1, y: 1 } },
  };

  EXPECTED_CONVERGE_PATHS (from CONVERGE_CONFIG, axiom F+F-F)

  export const EXPECTED_CONVERGE_PATHS = {
    pathCount: 1,
    segmentCount: 3,
    // F: (0,0)→(1,0)
    // + : turn left 90°
    // F: (1,0)→(1,1)
    // - : turn right 90° (back to 0°)
    // F: (1,1)→(2,1)
    bounds: { min: { x: 0, y: 0 }, max: { x: 2, y: 1 } },
  };

  EXPECTED_BRANCH_PATHS (from BRANCH_CONFIG, maxIterations=1)

  Final word: F[+F][-F]

  export const EXPECTED_BRANCH_PATHS = {
    pathCount: 2,
    // path[0]: F (main trunk) + branch-left F → 2 segments
    // path[1]: branch-right F → 1 segment
    segmentCounts: [2, 1],
    // path[0][0]: (0,0)→(1,0)      (stem, heading=0°)
    // path[0][1]: (1,0)→(1,1)      (branch left, after +90°)
    // ] → new path
    // path[1][0]: (1,0)→(1,-1)     (branch right, after −90°)
    bounds: { min: { x: 0, y: -1 }, max: { x: 1, y: 1 } },
  };

  Implementation Notes for interpret.ts

  1. Heading arithmetic: Use degrees internally; convert to radians only at the cos/sin call site. headingRad = heading
  * Math.PI / 180.
  2. Floating-point accumulation: Turtle position accumulates floating-point errors over many steps. Tests should use
  toBeCloseTo (default 2 decimal places) rather than toEqual for positions.
  3. Bounds tracking: Update min/max on every F command using both from and to.
  4. Path lifecycle: Maintain a currentPath: Segment[]. On ], push currentPath to paths if currentPath.length > 0, then
  reset currentPath = []. At end of word, push currentPath if non-empty.
  5. letter resolution: Walk parentIndex backwards through result.generations. Start at the terminal generation. If the
  token at the current position has opcode < NUM_KEYWORDS (it's a keyword in the terminal expansion), go to parentIndex
  in the previous generation. Continue until either you find a token with opcode >= NUM_KEYWORDS (return
  reverseTable[opcode]), or you exhaust all generations (return reverseTable[opcode] of whatever is at gen 0 — which
  will be a keyword if the axiom was pure keywords, or the axiom Letter if the axiom had letters).
  6. generation field on Segment: Once the provenance walk finds the Letter ancestor, record its generation index.
  7. effectiveStepLength: config.stepLength * Math.pow(config.generationScaling, result.generations.length - 2). The −2
  accounts for the axiom entry (index 0) and the terminal expansion entry (last index). generations.length - 2 = number
  of rewriting steps.

  Validation Checklist

  - interpret.test.ts — all tests RED
  - Implement interpret.ts
  - All interpret tests GREEN
  - All prior tests still GREEN

  ---
  Phase 5 — Integration, Barrel Export, and End-to-End Tests

  End-to-end pipeline tests

  Add packages/core/tests/dol-system/pipeline.test.ts:

  import { compile }   from '@proc-geo/core/dol-system/compile';
  import { generate }  from '@proc-geo/core/dol-system/generate';
  import { interpret } from '@proc-geo/core/dol-system/interpret';
  import {
    SQUARE_CONFIG, EXPECTED_SQUARE_PATHS,
    CONVERGE_CONFIG, EXPECTED_CONVERGE_PATHS,
    BRANCH_CONFIG, EXPECTED_BRANCH_PATHS,
  } from './fixtures';

  describe('Full pipeline — Unit Square', () => {
    const sys    = compile(SQUARE_CONFIG);
    const result = generate(sys, SQUARE_CONFIG.maxIterations);
    const output = interpret(result, SQUARE_CONFIG.turtle);

    it('produces exactly 1 path', () =>
      expect(output.paths.length).toBe(EXPECTED_SQUARE_PATHS.pathCount));

    it('path has exactly 4 segments', () =>
      expect(output.paths[0].length).toBe(EXPECTED_SQUARE_PATHS.segmentCount));

    it('bounds are unit square', () => {
      expect(output.bounds.min).toEqual(EXPECTED_SQUARE_PATHS.bounds.min);
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
    const sys    = compile(CONVERGE_CONFIG);
    const result = generate(sys, CONVERGE_CONFIG.maxIterations);
    const output = interpret(result, CONVERGE_CONFIG.turtle);

    it('converged flag is true', () =>  expect(result.converged).toBe(true));
    it('produces 1 path with 3 segments', () => {
      expect(output.paths.length).toBe(EXPECTED_CONVERGE_PATHS.pathCount);
      expect(output.paths[0].length).toBe(EXPECTED_CONVERGE_PATHS.segmentCount);
    });
    it('bounds match expected', () => {
      expect(output.bounds.max.x).toBeCloseTo(EXPECTED_CONVERGE_PATHS.bounds.max.x);
      expect(output.bounds.max.y).toBeCloseTo(EXPECTED_CONVERGE_PATHS.bounds.max.y);
    });
  });

  describe('Full pipeline — Simple Branch', () => {
    const sys    = compile(BRANCH_CONFIG);
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
      // path[0][0] came from the stem expansion
      expect(output.paths[0][0].letter).toBe('stem');
    });

    it('segment letters: tip-derived F has letter="tip"', () => {
      // path[0][1] came from the tip expansion
      expect(output.paths[0][1].letter).toBe('tip');
    });
  });

  Barrel Export

  packages/core/src/dol-system/index.ts

  export { compile }          from './compile';
  export { step, generate }   from './generate';
  export { interpret }        from './interpret';
  export type {
    Keyword,
    Letter,
    Symbol,
    TurtleConfig,
    SystemConfig,
    CompiledSystem,
    LinkedToken,
    LinkedWord,
    GenerationResult,
    Segment,
    TurtleOutput,
    ValidationError,
  } from './types';
  export {
    KEYWORD_OPCODES,
    NUM_KEYWORDS,
    DolSystemValidationError,
  } from './types';

  packages/core/src/index.ts additions

  Append a new section at the bottom:

  // ── D0L system ────────────────────────────────────────────────────────────────
  export { compile as compileDolSystem, generate as generateDolSystem, interpret as interpretDolSystem }
    from './dol-system';
  export type {
    Keyword, Letter, TurtleConfig, SystemConfig,
    CompiledSystem, LinkedToken, LinkedWord, GenerationResult,
    Segment as DolSegment, TurtleOutput,
    ValidationError as DolValidationError,
  } from './dol-system/types';
  export { KEYWORD_OPCODES, NUM_KEYWORDS, DolSystemValidationError } from './dol-system/types';

  ▎ Note on re-export naming: Segment is aliased to DolSegment in the barrel to prevent a future collision if Segment is
   eventually promoted to shared/types. Internally (within the dol-system module) it remains Segment.

  Validation Checklist

  - pipeline.test.ts — all tests GREEN (if interpret is correct, these should pass immediately)
  - pnpm --filter @proc-geo/core build — full clean build passes
  - pnpm --filter @proc-geo/core test — complete suite GREEN (18+ test files)
  - pnpm build — full monorepo build passes (dashboard and demo unaffected)

  ---
  Phase 6 — Dashboard Integration (Deferred, Out of V1 Scope)

  This phase is not part of the V1 deliverable but is recorded here so it can be planned in a follow-up sprint.

  Prospective work:
  - Add a DolSystemPanel component in packages/dashboard/src/components/
  - Use Zustand + Immer store (useDolSystemStore) for SystemConfig state
  - Render TurtleOutput.paths as Konva Line elements on the existing PolygonCanvas
  - Hover interaction: highlight all Segments sharing the same letter or same generation
  - Generation-by-generation animation using the provenance model

  ---
  Appendix A — Complete File Map

  ┌──────────────────────────────────────────────────┬──────────────────────────┬───────┐
  │                    File path                     │          Status          │ Phase │
  ├──────────────────────────────────────────────────┼──────────────────────────┼───────┤
  │ packages/core/src/shared/types.ts                │ Create                   │ 0     │
  ├──────────────────────────────────────────────────┼──────────────────────────┼───────┤
  │ packages/core/src/straight-skeleton/types.ts     │ Modify (hoist Vector2)   │ 0     │
  ├──────────────────────────────────────────────────┼──────────────────────────┼───────┤
  │ packages/core/src/random-polygon/types.ts        │ Modify (update import)   │ 0     │
  ├──────────────────────────────────────────────────┼──────────────────────────┼───────┤
  │ packages/core/src/dol-system/types.ts            │ Create                   │ 1     │
  ├──────────────────────────────────────────────────┼──────────────────────────┼───────┤
  │ packages/core/src/dol-system/compile.ts          │ Create (stub → impl)     │ 1→2   │
  ├──────────────────────────────────────────────────┼──────────────────────────┼───────┤
  │ packages/core/src/dol-system/generate.ts         │ Create (stub → impl)     │ 1→3   │
  ├──────────────────────────────────────────────────┼──────────────────────────┼───────┤
  │ packages/core/src/dol-system/interpret.ts        │ Create (stub → impl)     │ 1→4   │
  ├──────────────────────────────────────────────────┼──────────────────────────┼───────┤
  │ packages/core/src/dol-system/index.ts            │ Create                   │ 5     │
  ├──────────────────────────────────────────────────┼──────────────────────────┼───────┤
  │ packages/core/src/index.ts                       │ Modify (add D0L exports) │ 5     │
  ├──────────────────────────────────────────────────┼──────────────────────────┼───────┤
  │ packages/core/tests/dol-system/fixtures.ts       │ Create                   │ 2     │
  ├──────────────────────────────────────────────────┼──────────────────────────┼───────┤
  │ packages/core/tests/dol-system/compile.test.ts   │ Create                   │ 2     │
  ├──────────────────────────────────────────────────┼──────────────────────────┼───────┤
  │ packages/core/tests/dol-system/generate.test.ts  │ Create                   │ 3     │
  ├──────────────────────────────────────────────────┼──────────────────────────┼───────┤
  │ packages/core/tests/dol-system/interpret.test.ts │ Create                   │ 4     │
  ├──────────────────────────────────────────────────┼──────────────────────────┼───────┤
  │ packages/core/tests/dol-system/pipeline.test.ts  │ Create                   │ 5     │
  └──────────────────────────────────────────────────┴──────────────────────────┴───────┘

  Files not touched: All of straight-skeleton/, random-polygon/, packages/test-fixtures/, packages/dashboard/,
  apps/demo/, jest.config.cjs, tsconfig.json, pnpm-workspace.yaml.

  ---
  Appendix B — Design Decisions and Rationale

  Why only Vector2 is hoisted

  Three signals confirm Vector2 is the right and only type to hoist at this stage:

  1. It is already cross-imported (random-polygon/types.ts → straight-skeleton/types.ts) — an existing layering
  violation that hoisting fixes.
  2. It is completely algorithm-agnostic: no fields, no methods, no dependencies.
  3. Every other candidate type (RayProjection, PolygonNode, InteriorEdge, etc.) references at least one other
  algorithm-specific type, or has semantics that only make sense in the straight skeleton context.

  Segment is not hoisted at this stage. The D0L Segment (with letter, generation, opcodeIndex) is specific to turtle
  provenance and is unlikely to be reused directly by the straight skeleton. If a future algorithm needs a simpler
  {from, to} line segment type, that can be added to shared/types.ts then.

  Why opcode-indexed plain arrays rather than Maps

  The spec explicitly explains this: dense sequential integer opcodes guarantee all major JS runtimes (V8, SpiderMonkey,
   JavaScriptCore) store the backing array as a contiguous typed array, giving O(1) indexed access with a single pointer
   offset. The generation hot loop calls productions[opcode] once per token; hash map overhead (even for small maps)
  would be measurable over long words. The trade-off is a fixed minimum size of 5 entries for keyword opcodes — entirely
   acceptable.

  Why terminal expansion is a separate pass (not reusing step)

  The generation and terminal-expansion passes use different lookup tables (productions vs definitions), and they have
  different handling for keywords: in generation, keywords pass through via identity production; in terminal expansion,
  keywords pass through too but for a semantically different reason (they have no definition to expand). Keeping them as
   separate private functions (step for rewriting, terminalExpand for the final pass) keeps each function's invariants
  clear and independently testable.

  TDD phase ordering

  The phases are ordered to respect data dependencies: compile produces CompiledSystem, which generate consumes, which
  produces GenerationResult, which interpret consumes. Each phase can be tested in isolation by constructing inputs
  directly (stubs for downstream, literals for upstream) but the natural ordering ensures test fixtures are already
  correct by the time they are needed by later phases.

  Provenance storage is always enabled in V1

  The spec notes provenance storage is "optional and can be disabled for performance when provenance tracing is not
  needed." V1 makes no attempt at this optimisation — parentIndex is always stored. A V2 performance mode could accept a
   { skipProvenance: boolean } option to generate() and use a flat number[] instead of LinkedToken[], but this would be
  a separate opt-in path.

  ---

  That's the complete implementation plan. Here's a summary of the key decisions made:

  ## Summary of Key Architectural Decisions

  ### Type Hoisting (Phase 0)
  **Only `Vector2` is hoisted** to `packages/core/src/shared/types.ts`. It's the sole type that: (a) is already
  illegitimately cross-imported between algorithm directories, (b) has zero algorithm-specific semantics, and (c) will
  be needed by the new D0L module. All other types in `straight-skeleton/types.ts` are algorithm-bound and stay put. The
   refactor is purely mechanical — no type shapes change, the barrel export chain is unbroken, and all 16 existing test
  files will pass without modification.

  ### TDD Fixture Strategy
  Three **hand-verified solved examples** are established up front in `fixtures.ts` and used across all four
  implementation phases:
  4. **Unit Square** — multi-generation rewriting (`X → F+X`, 3 gens), no branching, produces a closed loop — verifiable
   by inspection
  5. **Immediate Convergence** — all-keyword axiom proves the convergence-detection path
  6. **Simple Branch** — `stem/tip` definitions exercise the terminal-expansion-of-Letter-definitions path and the
  `]`-splits-paths mechanic

  ### No New Packages
  Everything lives in `@proc-geo/core`. Adding a separate `@proc-geo/dol-system` package would be premature at V1; the
  D0L module has no dependencies outside `@proc-geo/core` (it needs only `Vector2` from the shared module), and
  splitting it out would require a new `package.json`, `tsconfig.json`, `tsup.config`, and workspace wiring before a
  single line of real logic is written.