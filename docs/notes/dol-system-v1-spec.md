# D0L Geometry Generator — V1 Spec

## Overview

A deterministic, context-free Lindenmayer system (D0L-system) that generates 2D geometry via turtle
interpretation. The system is designed with educational value as a priority: every layer of the process is
exposed and inspectable, including full expansion lineage from axiom to final geometric output.

## Symbol Classes

The system distinguishes two classes of symbol:

### Keywords (terminals)

Five built-in symbols with fixed turtle semantics and immutable identity production rules:

| Keyword | Turtle action                                     |
|---------|---------------------------------------------------|
| `F`     | Move forward and draw                             |
| `+`     | Turn left by angle delta                          |
| `-`     | Turn right by angle delta                         |
| `[`     | Push turtle state (position + heading) onto stack |
| `]`     | Pop turtle state from stack                       |

Keywords are irreducible. They pass through all rewriting steps unchanged.

### Letters (non-terminals)

User-defined symbols — strings up to 16 characters long — that carry no intrinsic turtle semantics. Each
Letter has:

1. **A definition**: a sequence of keywords that describes its geometric meaning (e.g. `branch = F[+F][-F]F`).
   Definitions may only contain keywords, never other Letters.
2. **A production rule** (optional): a rewriting rule that maps the Letter to a sequence of Letters and/or
   keywords. Letters without an explicit production rule are assigned the identity production.

This separation enforces two distinct layers of composition:

- **Letter → Keyword[]** — semantic layer (what does this symbol mean geometrically?)
- **Letter → (Letter | Keyword)[]** — growth layer (how does the system evolve over generations?)

## User-Facing Configuration

```
SystemConfig {
  alphabet: Record<Letter, Keyword[]>                // letter definitions
  productions: Record<Letter, (Letter | Keyword)[]>  // rewriting rules
  axiom: (Letter | Keyword)[]                        // starting word

  turtle: TurtleConfig {
    stepLength: number            // base forward distance
    angleDelta: number            // turn angle in degrees
    generationScaling: number     // multiplier applied to stepLength per generation
  }

  maxIterations: number           // upper bound on rewriting generations
}
```

## Validation Rules

Applied at compilation time; invalid input fails fast with descriptive errors.

- Letter definitions: values must contain only keywords.
- Production rule values: every non-keyword symbol must exist in `alphabet`.
- Axiom: every non-keyword symbol must exist in `alphabet`.
- Keywords appearing in production outputs and axiom are valid by definition.
- Letters without an explicit production rule receive the identity production.
- Keywords always have the identity production (user cannot override).
- Letter names must be ≤ 16 characters.

## Pipeline

The system is a three-layer pipeline. Each layer's output is a first-class inspectable artifact.

### Layer 1 — Compilation

```
compile(config: SystemConfig): CompiledSystem
```

Validates inputs, assigns numeric opcodes to all symbols (keywords + letters), and compiles all
rules into opcode space.

Opcodes are assigned as dense sequential integers: keywords occupy opcodes 0–4 (in the order
`F`, `+`, `-`, `[`, `]`), and Letters are assigned opcodes starting at 5 in alphabet order.
This density guarantee means all runtime lookup structures are plain arrays indexed by opcode,
avoiding hash map overhead in the generation hot loop. This is engine-agnostic: all major JS
runtimes (V8, SpiderMonkey, JavaScriptCore, Hermes) store dense integer arrays as contiguous
typed backing stores internally, making indexed access a single pointer offset.

```
CompiledSystem {
  opcodeTable: Map<Letter, number>   // letter → opcode (used at compile/decompile boundary only)
  reverseTable: string[]             // reverseTable[opcode] → symbol name (letter or keyword)
  productions: number[][]            // productions[opcode] → opcode[] expansion
  definitions: number[][]            // definitions[opcode] → keyword opcode[] (letters only; keywords are empty)
  axiom: number[]                    // compiled starting word
  numKeywords: 5                     // opcodes 0..4 are keywords; letter opcodes start at 5
}
```

### Layer 2 — Generation (Rewriting)

```
step(system: CompiledSystem, word: LinkedWord): LinkedWord
generate(system: CompiledSystem, generations: number): GenerationResult
```

Pure rewriting engine operating in opcode space. Applies production rules in parallel across the
word. Each rewriting step produces a new generation where every element is linked to its parent in
the previous generation.

```
LinkedToken {
  opcode: number
  parentIndex: number       // index of the token in the previous generation that produced this one
}

LinkedWord = LinkedToken[]  // a single generation's word with provenance

GenerationResult {
  generations: LinkedWord[]  // every generation from axiom through final
  system: CompiledSystem     // back-reference for opcode resolution
  converged: boolean         // true if generation stopped early (word is all keywords)
}
```

**Generation phase (rewriting):** Iterates 0..N times, applying production rules. Keywords pass
through unchanged. Stops when:

1. **Convergence**: the word contains only keyword opcodes — further steps would be identity.
2. **Iteration limit**: `maxIterations` reached.

**Terminal expansion (final step):** After rewriting completes, a single expansion step replaces
every remaining Letter opcode with its keyword definition. This is the final entry in `generations`.
Each keyword token in this expansion links back to the Letter that produced it.

Convergence is a natural feature of the system: production rules that emit keywords "shed"
non-terminals over successive generations, and keywords accumulate inertly until the word is fully
terminal.

### Layer 3 — Interpretation (Turtle)

```
interpret(result: GenerationResult, config: TurtleConfig): TurtleOutput
```

Walks the final generation (which is pure keywords after terminal expansion) and executes turtle
commands to produce geometry.

```
TurtleConfig {
  stepLength: number            // base forward distance
  angleDelta: number            // turn angle in degrees
  generationScaling: number     // multiplier applied to stepLength per generation
}

Segment {
  from: Vector2
  to: Vector2
  opcodeIndex: number           // position in the final generation's word
  opcode: number                // the keyword opcode that produced this segment
  letter: Letter                // the Letter ancestor resolved via reverseTable
  generation: number            // which generation this word belongs to
}

TurtleOutput {
  paths: Segment[][]            // array of polylines (branches produce separate paths)
  bounds: { min: Vector2, max: Vector2 }
}
```

Effective step length: `stepLength * (generationScaling ^ totalGenerations)`.

**Branching:** `[` pushes the turtle's `{ position, heading }` onto a stack. `]` pops it. Each
pop starts a new entry in `paths`. This produces tree-like branching structures.

## Provenance Model

Every `Segment` in the geometric output can be traced back through the full expansion history to
the axiom. Given a segment at position `i` in the final generation:

1. Look up `generations[final][i].parentIndex` → position `j` in the previous generation
2. Repeat through each generation until reaching the axiom

This yields a lineage chain, e.g.:

```
F (final, pos 12) ← branch (gen 3, pos 5) ← A (gen 2, pos 2) ← root (axiom, pos 0)
```

A UI can use this chain to show hover tooltips, highlight related segments that share a common
ancestor, or animate the expansion process generation by generation.

Storing the linked representation (parentIndex on every token) is optional and can be disabled
for performance when provenance tracing is not needed.
