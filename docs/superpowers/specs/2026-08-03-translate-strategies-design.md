# Translate Strategies — Design

**Date:** 2026-08-03
**Status:** Draft, awaiting approval
**Scope:** Unify the `ConstraintStrategy` interface around the transform delta union, add Saturate Translate (probe cascade), redefine `appliedFraction` reporting for saturate. Spread Translate is explicitly out of scope today.

## Motivation

Translation currently short-circuits in `solveArticulation` to a shared rigid implementation before strategies are consulted, and `ConstraintStrategy` exposes a rotation-only method (`solveRotation`). A rotation is not a translation, but both are *interpretations of an input delta* — the strategy interface should accept the whole `TransformDelta` union and interpret it, rather than growing one method per delta kind.

Today's goals:

1. Refactor the strategy interface to a single `solve(input)` method taking the delta union.
2. Implement Saturate Translate: rigid-group translation that spills remaining delta into the still-movable elements when a boundary element clamps.
3. Make the "Clamped to X%" reporting honest for the saturate strategy.

## 1. Interface refactor

```ts
interface StrategyInput {
    chain: ArticulationChain;
    /** Sanitized: sorted, unique, in-bounds, non-empty. */
    selection: number[];
    selectionSet: Set<number>;
    pivotIndex: number;
    delta: TransformDelta;   // the discriminated union, passed through whole
}

interface ConstraintStrategy {
    readonly id: StrategyId;
    readonly label: string;
    solve(input: StrategyInput): SolveResult;
}
```

- `RotationInput` and the precomputed `spans` field disappear from the public interface. Spans are a rotation concept, not a solver concept: strategies that need them call the existing `splitSpans` helper themselves.
- `solveArticulation` keeps only delta-agnostic normalization:
  - sanitize the selection (dedupe, bounds-check, sort);
  - return an identity result for degenerate inputs (empty selection, chain shorter than 2, zero or non-finite delta, invalid pivot for rotations);
  - apply the one shared topology rule: **discontiguous selection ⇒ dispatch to rigid**, regardless of delta kind.
- Strategy internals switch on `delta.kind`:
  - **Rigid** — rotate: unchanged. Translate: the current `translateRigid` logic moves into the strategy, exported as a shared helper.
  - **Spread** — rotate: unchanged. Translate: calls the shared rigid-translate helper, with a comment stating spread defines no distinct translate semantics (per today's scope decision).
  - **Saturate** — rotate: unchanged. Translate: the probe cascade below.
- The dashboard store needs no changes — it already routes everything through `solveArticulation`.

## 2. Saturate Translate — probe cascade

The pivot plays no role in translation, neither for the input delta nor for ordering. The solver guarantees a contiguous selection (discontiguous fell back to rigid), so the active set always has **one or two boundary elements** — active elements adjacent to an inactive neighbour. "Inactive" means unselected or frozen; a chain end is no boundary at all, so a whole-chain selection has zero boundaries and translates freely.

```
active = selection; out = copy of elements; remaining = vector; consumed = 0
while active nonempty and |remaining| > ε:
    for each boundary element b (inactive neighbour n):
        probe(b) = clampToValid(translate active by t·remaining,
                                validity restricted to constraints touching the boundary link (n, b):
                                distance bounds on (n, b) from both endpoints,
                                plus joint-angle bounds at b and at n)
    t = min over probes           // no boundaries ⇒ t = 1
    apply t·remaining to active in out
    consumed += t·|remaining|; remaining *= (1 − t)
    if t ≥ 1: break
    freeze the argmin boundary element(s) — both on an ε-tie — remove from active
appliedFraction = consumed / |vector|
```

**Why restricted-validity probes are sound:** rigid translation of a contiguous active set perturbs only the boundary links. Each probe therefore isolates exactly the constraints that boundary can violate, and `min(probes)` equals the true group clamp — but unlike a single global clamp, it identifies *which* element bound.

**Cascade correctness details:**

- When an element freezes, its link to its still-active neighbour becomes the next boundary link; the next iteration's probe covers its constraints automatically. Frozen elements never move again.
- A single-element active set with inactive neighbours on both sides is one probe covering both links (and the joint bounds at the element and both neighbours).
- When all elements are frozen and delta remains, the remainder is discarded (mirrors Saturate Rotate).
- Each probe re-derives the pose from the iteration's base scaled by `t` (never cumulative), reusing `clampToValid` unchanged.

## 3. `appliedFraction` redefinition + badge wording

`SolveResult.appliedFraction` for **saturate** (both delta kinds) is defined as *consumed delta / requested delta*. The rotate implementation already computes this; translate follows the same convention.

- Doc comment on `SolveResult` states the two readings:
  - rigid / spread: "the input delta scaled by this factor produces the result pose";
  - saturate: "fraction of the input absorbed before the remainder was discarded".
- `ArticulationControlsPanel` words the badge by strategy: `Clamped to N%` for rigid/spread, `Absorbed N%` for saturate.

## 4. Tests & housekeeping

- New `packages/core/tests/articulation/saturate-translate.test.ts`:
  - unconstrained motion applies fully (`t = 1`);
  - single-boundary clamp, remainder spills into remaining elements;
  - both-boundaries race — the element with the smaller probe freezes, the other keeps moving;
  - full saturation discards the remainder; `appliedFraction < 1`;
  - whole-chain selection translates freely (no boundaries);
  - single-element selection with neighbours on both sides;
  - `appliedFraction` equals consumed / requested distance.
- Existing suites updated for the interface change (`RotationInput` → `StrategyInput`); dispatch tests extended to cover discontiguous-translate → rigid.
- Exports updated in `packages/core/src/articulation/index.ts` and the package barrel.
- `docs/notes/articulation-constraint-solver.md` gains a Translate section documenting rigid-unit semantics for rigid/spread and the saturate probe cascade.

## Out of scope

- Distinct Spread Translate semantics (spread translates as a rigid unit today).
- Changing Saturate Rotate's ordering (it keeps its fixed walk-away-from-pivot order).
- Richer `SolveResult` reporting types beyond the redefined `appliedFraction`.
