# Translate Strategies — Implementation Plan

**Spec:** `docs/superpowers/specs/2026-08-03-translate-strategies-design.md`
**Branch:** `feature/constraint-solving-explorer`

## Process

Each unit: implementer sub-agent (Sonnet 5 or better) → adversarial review sub-agent → revise, ping-ponging up to five rounds until the review comes back clean. Core test suite must pass at the end of every unit. Style: expressive full-word naming, no abbreviations, comments only as a last resort, single abstraction level per function.

Test command (Git Bash):
`node ~/AppData/Roaming/npm/node_modules/pnpm/bin/pnpm.cjs --filter @proc-geo/core test -- --testPathPatterns=articulation`

## Unit 1 — Core strategy interface unification

Files: `packages/core/src/articulation/{types.ts, solve.ts, strategies/rigid.ts, strategies/spread.ts, strategies/saturate.ts, index.ts}`, existing tests.

- Replace `ConstraintStrategy.solveRotation(RotationInput)` with `solve(StrategyInput)` where `StrategyInput = { chain, selection, selectionSet, pivotIndex, delta }` (sanitized selection; delta is the whole `TransformDelta` union).
- `solveArticulation` keeps only delta-agnostic normalization + discontiguous ⇒ rigid dispatch. Span splitting moves into the rotation paths of strategies (shared helper usage of `splitSpans`).
- Rigid gains the translate implementation (moved from `solve.ts`'s `translateRigid`), exported as a shared helper; spread's translate path delegates to it.
- Saturate translate: temporary delegation to the shared rigid translate helper (replaced in Unit 2) so the suite stays green.
- Update existing tests for the interface change; extend dispatch tests for discontiguous-translate ⇒ rigid. All tests pass.

## Unit 2 — Saturate Translate probe cascade

Files: `packages/core/src/articulation/strategies/saturate.ts`, new `packages/core/tests/articulation/saturate-translate.test.ts`.

- Implement the probe cascade per spec §2: boundary elements of the contiguous active set are probed with validity restricted to their boundary link (distance bounds on the link from both endpoints + joint-angle bounds at both endpoints); minimum probe wins; argmin element(s) freeze; recurse until delta consumed or all frozen; `appliedFraction = consumed distance / requested distance`.
- Tests per spec §4 (free motion, single-boundary spill, boundary race, full saturation, whole-chain, single-element, fraction values). All tests pass.

## Unit 3 — Reporting & badge wording

Files: `packages/core/src/articulation/types.ts` (doc comment), `packages/dashboard/src/components/articulation/ArticulationControlsPanel.tsx`.

- `SolveResult.appliedFraction` doc comment states both readings (scaled vs absorbed).
- Badge reads `Clamped to N%` for rigid/spread, `Absorbed N%` for saturate.

## Unit 4 — Documentation

- `docs/notes/articulation-constraint-solver.md`: add a Translate section (rigid-unit semantics for rigid/spread; saturate probe cascade; pivot plays no role in translation).

## Unit 5 — Visual verification

- Run the demo dev server; use Playwright to exercise the `/articulation` page: build a constrained chain, translate with saturate selected, verify spill behaviour and the `Absorbed N%` badge, screenshot for the user.

## Completion

- Full core suite green; dashboard and core builds pass.
- Commit per unit or as a coherent series on the feature branch.
