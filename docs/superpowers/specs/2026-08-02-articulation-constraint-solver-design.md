# Articulation Constraint Solver — Design Spec

Date: 2026-08-02
Source design note: `docs/notes/articulation-constraint-solver.md` (normative for algorithm semantics; this spec
resolves its ambiguities and defines the module architecture).

## Purpose

A miniature sandbox explorer that lets a user build a single open chain of articulated elements on a canvas, attach
distance/angle constraints to elements, and interactively drag selections to see how three different constraint-solving
strategies interpret the same input. The goal is understanding the algorithms, not production IK.

## Module Placement (follows existing conventions)

| Layer     | Location                                            | Contents                                          |
|-----------|-----------------------------------------------------|---------------------------------------------------|
| Core      | `packages/core/src/articulation/`                   | Pure TS solver: types, validity, three strategies |
| Tests     | `packages/core/tests/articulation/`                 | Jest TDD tests; worked examples as fixtures       |
| Dashboard | `packages/dashboard/src/components/articulation/`, `stores/useArticulationStore.ts` | Konva canvas, panels, Zustand+Immer store |
| Demo      | `apps/demo/src/app/articulation/page.tsx`           | Page composed via `AlgorithmPageLayout`; NavLink added in `AppShellLayout.tsx` |

No new dependencies. Core stays React-free. Barrel exports extended in both `packages/core/src/index.ts` and
`packages/dashboard/src/index.ts`.

## Data Model (core)

```ts
import type { Vector2 } from '../shared/types';

/** Inclusive numeric bound; a constraint axis is unconstrained when undefined. */
interface MinMax { min: number; max: number; }

interface ElementConstraints {
  /** Distance to previous element (index i-1). Undefined = unconstrained. */
  distanceToPrev?: MinMax;
  /** Distance to next element (index i+1). Undefined = unconstrained. */
  distanceToNext?: MinMax;
  /** Signed turning angle at this element, radians. Undefined = unconstrained. */
  jointAngle?: MinMax;
}

interface ArticulationChain {
  /** Element positions, in chain order. Single line: no branching/looping. */
  elements: Vector2[];
  /** Parallel array, same length as elements. */
  constraints: ElementConstraints[];
}
```

**Conventions:**

- **Joint angle** at element `i` (requires `0 < i < n-1`): the signed turning angle between direction
  `(p[i] − p[i−1])` and direction `(p[i+1] − p[i])`, counter-clockwise positive, in `(−π, π]`. A straight chain has
  joint angle 0 everywhere. Constraints on end elements' `jointAngle` are ignored (no joint exists).
- **Link constraints:** the link `(i−1, i)` is governed by *both* `constraints[i].distanceToPrev` and
  `constraints[i−1].distanceToNext`; validity requires every enabled bound to hold (intersection semantics).
- All constraints default to unconstrained (undefined), per the design note.

## Validity (shared across strategies)

`isPoseValid(elements, constraints): boolean` — true iff every enabled distance bound and every enabled joint-angle
bound holds (within `FLOATING_POINT_EPSILON` tolerance). A pose invalid under one strategy is invalid under all —
validity is a property of the data, never of the strategy.

## Solver API (Strategy Pattern)

```ts
type TransformDelta =
  | { kind: 'rotate'; angle: number }        // radians, CCW positive, about the pivot
  | { kind: 'translate'; vector: Vector2 };

interface SolveInput {
  chain: ArticulationChain;
  selection: number[];       // element indices, any order
  pivotIndex: number;
  delta: TransformDelta;
}

interface SolveResult {
  elements: Vector2[];       // full new pose (unselected elements included, possibly unchanged)
  appliedFraction: number;   // 1 when raw delta was valid; < 1 when clamped; 0 when nothing moved
}

interface ConstraintStrategy {
  readonly id: 'rigid' | 'spread' | 'saturate';
  readonly label: string;
  solve(input: SolveInput): SolveResult;
}
```

Strategies are registered in a simple record (`STRATEGIES: Record<StrategyId, ConstraintStrategy>`) so new algorithms
can be added without touching call sites.

### Shared behaviors (all strategies)

1. **Translation is strategy-independent (v1 ruling).** A `translate` delta moves the selected elements as one rigid
   unit by the delta vector, regardless of the chosen strategy. The pivot plays no role in translation. Validity
   clamping applies (below).
2. **Delta clamping.** The solver always starts from the cached pre-drag pose. If the raw delta produces an invalid
   pose, apply the largest same-direction delta that is valid: bisection search on a scale factor `t ∈ [0, 1]` applied
   to the delta (angle or vector), fixed depth 8, keeping the largest valid `t` found (0 if even the smallest probe
   fails). `appliedFraction = t`.
3. **Discontiguous selection (ruling).** If the selected indices do not form one contiguous run, every strategy falls
   back to Rigid semantics (with clamping).
4. **Pivot inside a contiguous selection (ruling).** For Spread and Saturate, split the selection into the two spans
   walking in opposite directions from the pivot and apply the algorithm to each span independently, each receiving
   the full input delta; all other rules unchanged. (For Rigid this case needs no special handling — the pivot simply
   rotates onto itself.) Clamping is applied to the whole combined pose: one shared scale factor `t` for both spans.
5. **Degenerate inputs.** Empty selection, zero delta, or a chain with < 2 elements → identity result,
   `appliedFraction = 1`.

### Rigid Assembly

Rotation by `angle` about the pivot position transforms every selected element in the pivot's local space (standard
rotation of each selected position around the pivot point). Consequences (these are checks, not extra steps): distances
and joint angles internal to the selection are preserved; pivot-to-selected distances are preserved; boundary
joints/links between selection and non-selection may change and are validated against constraint data; unselected
elements never move.

### Spread Articulation

Walking away from the pivot through the span: the **qualifying pairs** are consecutive element pairs `(i, i+1)` (in
walk order) whose second element is selected. The input angle is divided equally: each qualifying pair's yaw (direction
of the link) is rotated by `angle / numQualifyingPairs`, and the rotation propagates rigidly to all elements beyond
that link in walk order (selected ones — unselected elements past the selection do not move; the joint at the last
selected element absorbs the difference, which the design note permits because its far element is unselected).
Distances between consecutive selected elements, between unselected pairs, and from the last unselected element to the
first selected element are preserved by construction. During clamping, the per-pair share is always
`(t × angle) / numQualifyingPairs` — the divisor never changes.

### Saturate Articulation

Selected elements ordered by ascending index distance from the pivot. Rotate the whole selection rigidly about the
pivot until the *first* selected element's constraints block further motion (its saturation angle found by bisection,
depth 8). If surplus angle remains, recurse: the saturated element becomes the new pivot, and the remaining selected
elements (beyond it) receive the surplus via the same procedure. When all selected elements are saturated, discard the
remainder. `appliedFraction` reports the fraction of the input angle consumed overall.

## Dashboard UI

**Store** (`useArticulationStore`, Zustand + Immer, following `usePenStrokeStore` shape): chain state, `selection:
number[]`, `pivotIndex: number` (defaults to 0; clamped when elements are deleted), `strategyId`, `transformMode:
'translate' | 'rotate'`, drag session state (cached pre-drag pose + drag origin), and actions for every interaction
below. The solver is invoked live during drag (each pointer-move recomputes from the cached pose — never cumulative).

**Canvas** (`ArticulationCanvas`, dedicated Konva component like `PenStrokeCanvas`): renders links as lines, elements
as circles (selected = filled accent, pivot = distinct ring, both = both), marquee rectangle while dragging on empty
space, and a subtle "clamped" flash on the selection when `appliedFraction < 1` (feedback that constraints bit).

**Interactions** (resolving the design note's LMB overlap: press location + drag threshold disambiguates):

| Gesture | On | Effect |
|---|---|---|
| LMB click | empty canvas | Add element at click point, attached to nearest chain end (nearer of first/last element; becomes new end) |
| LMB drag | empty canvas | Marquee select (replaces selection; Shift+marquee adds) |
| LMB click | element | Select only that element |
| Shift + LMB click | element | Toggle element in/out of selection |
| Ctrl + LMB click | element | Set pivot |
| LMB drag | selected element | Transform selection via current strategy + mode. Rotate: delta = angle swept by cursor around the pivot position. Translate: delta = cursor displacement vector |
| Delete key | — | Remove selected elements (chain re-links across gaps) |

**Panels:**

- `ArticulationControlsPanel` — strategy select (SegmentedControl), transform mode toggle, delete button, clear-all.
- `ArticulationConstraintPanel` — for the single selected element (multi-select shows a hint): per-axis enable switch +
  min/max numeric inputs for `distanceToPrev`, `distanceToNext`, `jointAngle` (degrees in UI, radians in data). Copy
  button serializes the element's `ElementConstraints` to the OS clipboard as JSON; Paste applies clipboard JSON to
  all selected elements (invalid JSON → Mantine error notification).

**Demo page** — `apps/demo/src/app/articulation/page.tsx` mirroring `pen-stroke/page.tsx` (dynamic import of canvas,
`ssr: false`), plus a NavLink "Articulation" in `AppShellLayout.tsx`.

## Error Handling

- Solver functions are pure and total: bad input (out-of-range indices, NaN) returns identity `SolveResult` rather
  than throwing; `min > max` constraint treated as unsatisfiable for that axis (blocks motion crossing it).
- UI guards: constraint inputs clamp min ≤ max on commit; deleting the pivot reassigns pivot to nearest surviving
  element (index 0 fallback).

## Testing (TDD, jest in `packages/core/tests/articulation/`)

- **Validity:** distance and joint-angle bounds, intersection semantics for shared links, epsilon tolerance.
- **Rigid:** the design note's worked example (6 collinear elements, selection [1,2,3], pivot 0, delta π/3) — assert
  preserved distances/angles per the note's free/fixed table; translation as rigid unit; clamping against a joint
  limit.
- **Spread:** worked example — qualifying pairs [0,1],[1,2],[2,3], per-pair π/9, elements 4–5 stationary; divisor
  invariance under clamping.
- **Saturate:** worked example — joint [0,1,2] limited to π/9 saturates, surplus recurses about element 2 onto [3,4];
  full-saturation discards remainder.
- **Topology rules:** discontiguous → rigid fallback; pivot-in-selection → two-span application; degenerate inputs.
- Dashboard/store logic covered indirectly by Playwright-driven visual verification of the demo page (no dashboard
  unit-test infra exists today; not adding any in v1).

## Out of Scope (v1)

Branching/looping chains, per-strategy translation semantics, undo/redo, persistence, animation/playback, touch
gestures.
