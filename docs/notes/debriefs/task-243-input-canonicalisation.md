# Task 243 — Input canonicalisation (reissue, expanded ownership)

Spec: [`docs/notes/input-canonicalisation-decisions.md`](../input-canonicalisation-decisions.md)

## 0. Recovery baseline — the phase plan

`git log` shows task 242 left **no implementation on this branch**: `canonicalisation.ts` does not
exist in any commit reachable from here (`git log --all --diff-filter=A -- '*canonicalisation*'`
returns only the unrelated node-offset-table work of task 241). What landed from 242 is the spec
amendment alone — commit `a85360e`, decisions 19–22. So this is a **greenfield implementation** of a
spec whose measurement half has already been performed and ruled on.

That changes one thing about the work: decision 5 says establishing the floor is the first work of
the task, and decision 19 has since **ruled** `SKELETON_NOISE_FLOOR = 1e-6` and recorded the sweep
that produced it. Re-deriving the floor would be re-litigating a ruling. What this task owes instead
is the *reporting* half of decisions 5, 14, 14a, 17 and 18 — re-measured against the implementation
that actually lands here.

Phases, each ending in a build so the remote has a resumable checkpoint:

| Phase | Content |
|-------|---------|
| A | This plan, committed. |
| B | Contract and stubs: `canonicalisation.ts` (`CanonicalPolygon`, `canonicalisePolygon`, `SKELETON_NOISE_FLOOR`), `'vertices-canonicalised'` on `SkeletonDiagnosticKind`, `noiseFloor` on `SolveSkeletonOptions`, barrel exports. Compiles, does nothing. |
| C | Red tests: `canonicalisation.test.ts` over decisions 1, 2, 3, 6, 7 and the reporting of 8/9. |
| D | Implement the pass and wire it into `solveSkeleton`, `runAlgorithmV5`, `runAlgorithmV5Stepped`. Green. |
| E | `silhouette-invariance.test.ts` — decisions 10, 11, 12, 13, and the decision-16 mutation conviction. |
| F | Re-measure and update the pinned lists: `reflex-subdivision.test.ts`, `stroke-derived-polygons.test.ts`, `offset-event-boundary-regression.test.ts` (decision 21), `parcel-slicing.test.ts` (decision 22). |
| G | The measurement reports of decisions 5, 17 and 18; full suite twice; final debrief. |

## 1. Task Summary

Add a normalisation stage that removes boundary vertices whose perpendicular deviation from the
chord between their neighbours falls below a render-scale noise floor, before the skeleton sees the
polygon. The stage exists to eliminate an input class the solver has a standing defect on, and to
stop the recursive subdivision arc from feeding fractal complexity back into itself.

## 2. Changes Made

Filled in per phase below.

### Phase A
- `docs/notes/debriefs/task-243-input-canonicalisation.md` — created; this plan.

## 3. Design Decisions

Filled in per phase.

## 4. Build & Test Results

Phase A: pending initial build.

## 5. Open Questions / Risks

- Decision 20 promotes decision 7 (root-relative floor) to a priority, but wiring the recursion
  driver is explicitly deferred by section 3. This task shapes the parameter and does not wire it,
  so the narrow `[1e-6, 3e-6]` band stays narrow at the end of this task by design.

## 6. Suggested Follow-ups

Filled in at the end.
