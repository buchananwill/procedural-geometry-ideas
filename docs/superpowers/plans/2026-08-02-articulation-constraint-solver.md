# Articulation Constraint Solver Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A sandbox explorer where a user builds a single chain of articulated elements, attaches distance/angle constraints, and drags selections to compare three constraint-solving strategies (Rigid, Spread, Saturate).

**Architecture:** Pure-TS solver in `packages/core/src/articulation/` (Strategy Pattern with a `solveArticulation` orchestrator handling normalization, translation, and clamping); Zustand+Immer store and Konva canvas/panels in `packages/dashboard/`; Next.js page in `apps/demo/`. Spec: `docs/superpowers/specs/2026-08-02-articulation-constraint-solver-design.md` (read it before starting any task).

**Tech Stack:** TypeScript, Jest (ts-jest), React 19, Mantine v8, react-konva, Zustand + Immer. No new dependencies.

## Global Constraints

- **pnpm on this machine (Git Bash):** plain `pnpm` is broken. Always run: `node ~/AppData/Roaming/npm/node_modules/pnpm/bin/pnpm.cjs <args>` (referred to below as `PNPM`).
- Run core tests with: `PNPM --filter @proc-geo/core test -- --testPathPattern=articulation`
- Core package must stay React/browser-free.
- Angle convention: radians, counter-clockwise positive, joint angle = signed turning angle in `(−π, π]`, straight chain = 0.
- All constraints default to **unconstrained** (`undefined`).
- The solver never mutates its input; it returns fresh position arrays.
- Follow the repo's 4-space indentation and existing naming conventions.
- Commit messages: short imperative subject, ending with the two trailers used in recent commits (`Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01VA38ig5LZqPjWCPeR4ioTq`).
- Tests import from relative source paths (check an existing test in `packages/core/tests/` for the exact import style before writing yours).

---

### Task 1: Core types, geometry helpers, and validity

**Files:**
- Create: `packages/core/src/articulation/types.ts`
- Create: `packages/core/src/articulation/geometry.ts`
- Create: `packages/core/src/articulation/validity.ts`
- Test: `packages/core/tests/articulation/validity.test.ts`

**Interfaces:**
- Consumes: `Vector2` from `packages/core/src/shared/types.ts`
- Produces (later tasks rely on these exact names):
  - types: `MinMax`, `ElementConstraints`, `ArticulationChain`, `TransformDelta`, `SolveInput`, `SolveResult`, `StrategyId`, `ConstraintStrategy`, `RotationInput`
  - geometry: `addV(a,b)`, `subV(a,b)`, `scaleV(v,k)`, `distV(a,b)`, `lenV(v)`, `crossV(a,b)`, `dotV(a,b)`, `rotateAbout(p, center, angle)` — all `Vector2` in/out, pure
  - validity: `ARTICULATION_EPSILON` (1e-6), `jointAngleAt(elements, i): number | null`, `isPoseValid(elements, constraints): boolean`

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/tests/articulation/validity.test.ts
import { jointAngleAt, isPoseValid, ARTICULATION_EPSILON } from '../../src/articulation/validity';
import type { ElementConstraints } from '../../src/articulation/types';
import type { Vector2 } from '../../src/shared/types';

const straight: Vector2[] = [0, 1, 2, 3].map((y) => ({ x: 0, y }));
const none: ElementConstraints[] = straight.map(() => ({}));

describe('jointAngleAt', () => {
    it('is 0 along a straight chain', () => {
        expect(jointAngleAt(straight, 1)).toBeCloseTo(0, 9);
        expect(jointAngleAt(straight, 2)).toBeCloseTo(0, 9);
    });
    it('is null at chain ends', () => {
        expect(jointAngleAt(straight, 0)).toBeNull();
        expect(jointAngleAt(straight, 3)).toBeNull();
    });
    it('is CCW-positive for a left turn', () => {
        // walking +x then turning up (+y) is a CCW (positive) turn
        const bent: Vector2[] = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }];
        expect(jointAngleAt(bent, 1)).toBeCloseTo(Math.PI / 2, 9);
    });
    it('is null when a segment is degenerate', () => {
        const dup: Vector2[] = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }];
        expect(jointAngleAt(dup, 1)).toBeNull();
    });
});

describe('isPoseValid', () => {
    it('accepts any pose when unconstrained', () => {
        expect(isPoseValid(straight, none)).toBe(true);
    });
    it('enforces distanceToPrev', () => {
        const c = straight.map(() => ({} as ElementConstraints));
        c[1] = { distanceToPrev: { min: 2, max: 3 } }; // actual distance is 1
        expect(isPoseValid(straight, c)).toBe(false);
        c[1] = { distanceToPrev: { min: 0.5, max: 1.5 } };
        expect(isPoseValid(straight, c)).toBe(true);
    });
    it('enforces distanceToNext on the same link (intersection semantics)', () => {
        const c = straight.map(() => ({} as ElementConstraints));
        c[0] = { distanceToNext: { min: 2, max: 3 } }; // link (0,1) has length 1
        expect(isPoseValid(straight, c)).toBe(false);
    });
    it('enforces jointAngle bounds', () => {
        const bent: Vector2[] = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }]; // +PI/2 at 1
        const c: ElementConstraints[] = bent.map(() => ({}));
        c[1] = { jointAngle: { min: -Math.PI / 4, max: Math.PI / 4 } };
        expect(isPoseValid(bent, c)).toBe(false);
        c[1] = { jointAngle: { min: 0, max: Math.PI } };
        expect(isPoseValid(bent, c)).toBe(true);
    });
    it('treats min > max as unsatisfiable', () => {
        const c = straight.map(() => ({} as ElementConstraints));
        c[1] = { distanceToPrev: { min: 2, max: 0.5 } };
        expect(isPoseValid(straight, c)).toBe(false);
    });
    it('tolerates epsilon-scale violations', () => {
        const c = straight.map(() => ({} as ElementConstraints));
        c[1] = { distanceToPrev: { min: 1 + ARTICULATION_EPSILON / 2, max: 2 } };
        expect(isPoseValid(straight, c)).toBe(true);
    });
    it('ignores jointAngle constraints on end elements', () => {
        const c = straight.map(() => ({} as ElementConstraints));
        c[0] = { jointAngle: { min: 1, max: 2 } };
        expect(isPoseValid(straight, c)).toBe(true);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PNPM --filter @proc-geo/core test -- --testPathPattern=articulation`
Expected: FAIL (cannot resolve `../../src/articulation/validity`)

- [ ] **Step 3: Write the implementation**

```ts
// packages/core/src/articulation/types.ts
import type { Vector2 } from '../shared/types';

/** Inclusive numeric bound; an axis is unconstrained when the field is undefined. */
export interface MinMax {
    min: number;
    max: number;
}

export interface ElementConstraints {
    /** Distance to previous element (index i-1). */
    distanceToPrev?: MinMax;
    /** Distance to next element (index i+1). */
    distanceToNext?: MinMax;
    /** Signed turning angle at this element, radians, CCW positive. */
    jointAngle?: MinMax;
}

export interface ArticulationChain {
    elements: Vector2[];
    /** Parallel to elements. */
    constraints: ElementConstraints[];
}

export type TransformDelta =
    | { kind: 'rotate'; angle: number }
    | { kind: 'translate'; vector: Vector2 };

export type StrategyId = 'rigid' | 'spread' | 'saturate';

export interface SolveInput {
    chain: ArticulationChain;
    selection: number[];
    pivotIndex: number;
    strategyId: StrategyId;
    delta: TransformDelta;
}

export interface SolveResult {
    /** Full new pose; unselected elements are unchanged copies. */
    elements: Vector2[];
    /** 1 = raw delta applied; <1 = clamped by constraints; 0 = fully blocked. */
    appliedFraction: number;
}

/** Normalized rotation input handed to strategies by solveArticulation. */
export interface RotationInput {
    chain: ArticulationChain;
    selectionSet: Set<number>;
    pivotIndex: number;
    /**
     * Contiguous runs of selected indices, each ordered walking away from the
     * pivot. One entry normally; two when the pivot is inside the selection.
     */
    spans: number[][];
    angle: number;
}

export interface ConstraintStrategy {
    readonly id: StrategyId;
    readonly label: string;
    solveRotation(input: RotationInput): SolveResult;
}
```

```ts
// packages/core/src/articulation/geometry.ts
import type { Vector2 } from '../shared/types';

export const addV = (a: Vector2, b: Vector2): Vector2 => ({ x: a.x + b.x, y: a.y + b.y });
export const subV = (a: Vector2, b: Vector2): Vector2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scaleV = (v: Vector2, k: number): Vector2 => ({ x: v.x * k, y: v.y * k });
export const lenV = (v: Vector2): number => Math.hypot(v.x, v.y);
export const distV = (a: Vector2, b: Vector2): number => Math.hypot(a.x - b.x, a.y - b.y);
export const crossV = (a: Vector2, b: Vector2): number => a.x * b.y - a.y * b.x;
export const dotV = (a: Vector2, b: Vector2): number => a.x * b.x + a.y * b.y;

/** Rotate point p about center by angle (radians, CCW positive). */
export function rotateAbout(p: Vector2, center: Vector2, angle: number): Vector2 {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const dx = p.x - center.x;
    const dy = p.y - center.y;
    return { x: center.x + dx * cos - dy * sin, y: center.y + dx * sin + dy * cos };
}
```

```ts
// packages/core/src/articulation/validity.ts
import type { Vector2 } from '../shared/types';
import type { ElementConstraints, MinMax } from './types';
import { crossV, dotV, distV, lenV, subV } from './geometry';

export const ARTICULATION_EPSILON = 1e-6;

/**
 * Signed turning angle at element i between (p[i]-p[i-1]) and (p[i+1]-p[i]),
 * CCW positive, in (-PI, PI]. Null at chain ends or when a segment is
 * degenerate (constraint cannot be evaluated).
 */
export function jointAngleAt(elements: Vector2[], i: number): number | null {
    if (i <= 0 || i >= elements.length - 1) return null;
    const vIn = subV(elements[i], elements[i - 1]);
    const vOut = subV(elements[i + 1], elements[i]);
    if (lenV(vIn) < ARTICULATION_EPSILON || lenV(vOut) < ARTICULATION_EPSILON) return null;
    return Math.atan2(crossV(vIn, vOut), dotV(vIn, vOut));
}

function boundHolds(value: number, bound: MinMax): boolean {
    return value >= bound.min - ARTICULATION_EPSILON && value <= bound.max + ARTICULATION_EPSILON;
}

/**
 * Shared validity predicate: true iff every enabled bound holds. A link is
 * governed by BOTH endpoints' constraints (intersection semantics). Validity
 * is a property of the data, never of the strategy.
 */
export function isPoseValid(elements: Vector2[], constraints: ElementConstraints[]): boolean {
    for (let i = 1; i < elements.length; i++) {
        const d = distV(elements[i - 1], elements[i]);
        const prevBound = constraints[i]?.distanceToPrev;
        if (prevBound && !boundHolds(d, prevBound)) return false;
        const nextBound = constraints[i - 1]?.distanceToNext;
        if (nextBound && !boundHolds(d, nextBound)) return false;
    }
    for (let i = 1; i < elements.length - 1; i++) {
        const bound = constraints[i]?.jointAngle;
        if (!bound) continue;
        const angle = jointAngleAt(elements, i);
        if (angle === null) continue;
        if (!boundHolds(angle, bound)) return false;
    }
    return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `PNPM --filter @proc-geo/core test -- --testPathPattern=articulation`
Expected: PASS (all validity tests)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/articulation packages/core/tests/articulation
git commit -m "Add articulation core types, geometry helpers, and pose validity"
```

---

### Task 2: Clamping and selection topology helpers

**Files:**
- Create: `packages/core/src/articulation/clamping.ts`
- Create: `packages/core/src/articulation/topology.ts`
- Test: `packages/core/tests/articulation/clamping-topology.test.ts`

**Interfaces:**
- Consumes: `Vector2`; `isPoseValid` signature from Task 1 (only via the `isValid` callback)
- Produces:
  - `CLAMP_BISECTION_DEPTH` (8), `clampToValid(poseAt: (t: number) => Vector2[], isValid: (els: Vector2[]) => boolean): { elements: Vector2[]; t: number }`
  - `isContiguous(sortedIndices: number[]): boolean`
  - `splitSpans(sortedSelection: number[], pivotIndex: number): number[][]` — sorted, unique, contiguous input; returns spans in walk order away from the pivot, pivot itself excluded

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/tests/articulation/clamping-topology.test.ts
import { clampToValid, CLAMP_BISECTION_DEPTH } from '../../src/articulation/clamping';
import { isContiguous, splitSpans } from '../../src/articulation/topology';
import type { Vector2 } from '../../src/shared/types';

describe('clampToValid', () => {
    // 1-D probe: pose is a single point moving +x by t * 10
    const poseAt = (t: number): Vector2[] => [{ x: t * 10, y: 0 }];

    it('returns t=1 when the full delta is valid', () => {
        const r = clampToValid(poseAt, () => true);
        expect(r.t).toBe(1);
        expect(r.elements[0].x).toBeCloseTo(10, 9);
    });
    it('bisects to the largest valid t', () => {
        const isValid = (els: Vector2[]) => els[0].x <= 4; // valid iff t <= 0.4
        const r = clampToValid(poseAt, isValid);
        expect(r.t).toBeLessThanOrEqual(0.4);
        expect(r.t).toBeGreaterThan(0.4 - 1 / 2 ** CLAMP_BISECTION_DEPTH);
        expect(isValid(r.elements)).toBe(true);
    });
    it('returns identity (t=0) when even tiny deltas are invalid', () => {
        const r = clampToValid(poseAt, (els) => els[0].x <= -1);
        expect(r.t).toBe(0);
        expect(r.elements[0].x).toBe(0);
    });
});

describe('isContiguous', () => {
    it('accepts single runs and rejects gaps', () => {
        expect(isContiguous([2])).toBe(true);
        expect(isContiguous([1, 2, 3])).toBe(true);
        expect(isContiguous([1, 3, 5])).toBe(false);
        expect(isContiguous([])).toBe(true);
    });
});

describe('splitSpans', () => {
    it('pivot outside selection: one span walking away from pivot', () => {
        expect(splitSpans([1, 2, 3], 0)).toEqual([[1, 2, 3]]);
        expect(splitSpans([1, 2, 3], 5)).toEqual([[3, 2, 1]]);
    });
    it('pivot inside selection: two spans, pivot excluded, each walking outward', () => {
        expect(splitSpans([1, 2, 3, 4, 5], 3)).toEqual([[2, 1], [4, 5]]);
    });
    it('pivot at selection edge: single outward span', () => {
        expect(splitSpans([3, 4, 5], 3)).toEqual([[4, 5]]);
    });
    it('selection is only the pivot: no spans', () => {
        expect(splitSpans([3], 3)).toEqual([]);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PNPM --filter @proc-geo/core test -- --testPathPattern=articulation`
Expected: FAIL (modules not found)

- [ ] **Step 3: Write the implementation**

```ts
// packages/core/src/articulation/clamping.ts
import type { Vector2 } from '../shared/types';

export const CLAMP_BISECTION_DEPTH = 8;

export interface ClampResult {
    elements: Vector2[];
    /** Largest known-valid scale factor in [0, 1]. */
    t: number;
}

/**
 * Largest-valid-delta search. poseAt(t) must be deterministic and computed
 * from the ORIGINAL pose scaled by t (never cumulative). If poseAt(1) is
 * valid it is returned directly; otherwise bisect t in [0, 1] to fixed depth,
 * keeping the largest valid pose seen. poseAt(0) must equal the original
 * pose; if even that is invalid the result is identity with t = 0.
 */
export function clampToValid(
    poseAt: (t: number) => Vector2[],
    isValid: (elements: Vector2[]) => boolean,
): ClampResult {
    const full = poseAt(1);
    if (isValid(full)) return { elements: full, t: 1 };
    let lo = 0;
    let hi = 1;
    let best = poseAt(0);
    let bestT = 0;
    for (let i = 0; i < CLAMP_BISECTION_DEPTH; i++) {
        const mid = (lo + hi) / 2;
        const pose = poseAt(mid);
        if (isValid(pose)) {
            lo = mid;
            best = pose;
            bestT = mid;
        } else {
            hi = mid;
        }
    }
    return { elements: best, t: bestT };
}
```

```ts
// packages/core/src/articulation/topology.ts

/** True when the sorted index list has no gaps. */
export function isContiguous(sortedIndices: number[]): boolean {
    for (let i = 1; i < sortedIndices.length; i++) {
        if (sortedIndices[i] !== sortedIndices[i - 1] + 1) return false;
    }
    return true;
}

/**
 * Split a sorted, unique, contiguous selection into spans walking away from
 * the pivot. Pivot outside the selection: one span ordered from the
 * nearest-to-pivot element outward. Pivot inside: two spans (below
 * descending, above ascending), pivot excluded.
 */
export function splitSpans(sortedSelection: number[], pivotIndex: number): number[][] {
    const below = sortedSelection.filter((i) => i < pivotIndex).reverse();
    const above = sortedSelection.filter((i) => i > pivotIndex);
    const spans: number[][] = [];
    if (below.length > 0) spans.push(below);
    if (above.length > 0) spans.push(above);
    return spans;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `PNPM --filter @proc-geo/core test -- --testPathPattern=articulation`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/articulation packages/core/tests/articulation
git commit -m "Add articulation delta clamping and selection topology helpers"
```

---

### Task 3: Rigid strategy, shared translation, and the solveArticulation orchestrator

**Files:**
- Create: `packages/core/src/articulation/strategies/rigid.ts`
- Create: `packages/core/src/articulation/solve.ts`
- Test: `packages/core/tests/articulation/rigid-solve.test.ts`

**Interfaces:**
- Consumes (exact names from Tasks 1–2): all types from `../types`; `rotateAbout`, `addV`, `scaleV`, `lenV` from `../geometry`; `isPoseValid` from `../validity`; `clampToValid` from `../clamping`; `isContiguous`, `splitSpans` from `../topology`
- Produces:
  - `rigidStrategy: ConstraintStrategy` (id `'rigid'`, label `'Rigid Assembly'`) in `strategies/rigid.ts`, plus exported helper `rigidRotationPose(chain: ArticulationChain, selectionSet: Set<number>, pivotPos: Vector2, angle: number): Vector2[]`
  - `solveArticulation(input: SolveInput): SolveResult` in `solve.ts`. Tasks 4–5 will register their strategies in the `STRATEGIES` record inside `solve.ts`; until then the record contains rigid only and unknown ids fall back to rigid.

- [ ] **Step 1: Write the failing test**

The worked example from the spec: six collinear elements, selection [1,2,3], pivot 0, rotate by PI/3.

```ts
// packages/core/tests/articulation/rigid-solve.test.ts
import { solveArticulation } from '../../src/articulation/solve';
import { jointAngleAt } from '../../src/articulation/validity';
import { distV } from '../../src/articulation/geometry';
import type { ArticulationChain, SolveInput } from '../../src/articulation/types';
import type { Vector2 } from '../../src/shared/types';

const PI_OVER_THREE = Math.PI / 3;

function verticalChain(): ArticulationChain {
    const elements: Vector2[] = [0, 1, 2, 3, 4, 5].map((y) => ({ x: 0, y }));
    return { elements, constraints: elements.map(() => ({})) };
}

function rotateInput(chain: ArticulationChain, overrides: Partial<SolveInput> = {}): SolveInput {
    return {
        chain,
        selection: [1, 2, 3],
        pivotIndex: 0,
        strategyId: 'rigid',
        delta: { kind: 'rotate', angle: PI_OVER_THREE },
        ...overrides,
    };
}

describe('rigid rotation (spec worked example)', () => {
    const chain = verticalChain();
    const result = solveArticulation(rotateInput(chain));
    const p = result.elements;

    it('applies the full delta when unconstrained', () => {
        expect(result.appliedFraction).toBe(1);
    });
    it('rotates selected elements about the pivot position', () => {
        // (0,1) rotated CCW by PI/3 about origin -> (-sin60, cos60)
        expect(p[1].x).toBeCloseTo(-Math.sin(PI_OVER_THREE), 9);
        expect(p[1].y).toBeCloseTo(Math.cos(PI_OVER_THREE), 9);
    });
    it('preserves pivot-to-selected distances', () => {
        [1, 2, 3].forEach((i) => expect(distV(p[0], p[i])).toBeCloseTo(i, 9));
    });
    it('preserves intra-selection distances and joint angles', () => {
        expect(distV(p[1], p[2])).toBeCloseTo(1, 9);
        expect(distV(p[2], p[3])).toBeCloseTo(1, 9);
        expect(jointAngleAt(p, 1)).toBeCloseTo(0, 9);
        expect(jointAngleAt(p, 2)).toBeCloseTo(0, 9);
    });
    it('leaves unselected elements unmoved; boundary distance [3,4] changes', () => {
        expect(p[0]).toEqual({ x: 0, y: 0 });
        expect(p[4]).toEqual({ x: 0, y: 4 });
        expect(p[5]).toEqual({ x: 0, y: 5 });
        expect(distV(p[3], p[4])).not.toBeCloseTo(1, 2);
    });
    it('does not mutate the input chain', () => {
        expect(chain.elements[1]).toEqual({ x: 0, y: 1 });
    });
});

describe('rigid clamping', () => {
    it('clamps to the largest valid same-direction delta', () => {
        const chain = verticalChain();
        // Joint at element 4 forms between links (3,4) and (4,5); rotating
        // [1,2,3] bends the joint at 3 and 4. Constrain joint 4 tightly.
        chain.constraints[4] = { jointAngle: { min: -0.1, max: 0.1 } };
        const result = solveArticulation(rotateInput(chain));
        expect(result.appliedFraction).toBeGreaterThan(0);
        expect(result.appliedFraction).toBeLessThan(1);
        const angle = jointAngleAt(result.elements, 4)!;
        expect(Math.abs(angle)).toBeLessThanOrEqual(0.1 + 1e-6);
    });
    it('returns identity when the starting pose is already invalid', () => {
        const chain = verticalChain();
        chain.constraints[1] = { distanceToPrev: { min: 5, max: 6 } };
        const result = solveArticulation(rotateInput(chain));
        expect(result.appliedFraction).toBe(0);
        expect(result.elements).toEqual(chain.elements);
    });
});

describe('translation (strategy-independent, rigid-unit)', () => {
    it('moves the selection as a unit for every strategy id', () => {
        for (const strategyId of ['rigid', 'spread', 'saturate'] as const) {
            const chain = verticalChain();
            const result = solveArticulation(rotateInput(chain, {
                strategyId,
                delta: { kind: 'translate', vector: { x: 2, y: 0 } },
            }));
            expect(result.elements[2]).toEqual({ x: 2, y: 2 });
            expect(result.elements[4]).toEqual({ x: 0, y: 4 });
            expect(result.appliedFraction).toBe(1);
        }
    });
    it('clamps translation against distance constraints', () => {
        const chain = verticalChain();
        // link (0,1) must stay <= 2 long; translating [1,2,3] by +x 5 stretches it
        chain.constraints[1] = { distanceToPrev: { min: 0, max: 2 } };
        const result = solveArticulation(rotateInput(chain, {
            delta: { kind: 'translate', vector: { x: 5, y: 0 } },
        }));
        expect(result.appliedFraction).toBeLessThan(1);
        expect(distV(result.elements[0], result.elements[1])).toBeLessThanOrEqual(2 + 1e-6);
    });
});

describe('degenerate inputs and fallbacks', () => {
    it('empty selection, zero delta, or short chain are identity', () => {
        const chain = verticalChain();
        expect(solveArticulation(rotateInput(chain, { selection: [] })).elements).toEqual(chain.elements);
        expect(solveArticulation(rotateInput(chain, { delta: { kind: 'rotate', angle: 0 } })).elements).toEqual(chain.elements);
        const tiny: ArticulationChain = { elements: [{ x: 0, y: 0 }], constraints: [{}] };
        expect(solveArticulation(rotateInput(tiny, { selection: [0] })).elements).toEqual(tiny.elements);
    });
    it('out-of-range indices are dropped / identity, never a throw', () => {
        const chain = verticalChain();
        expect(solveArticulation(rotateInput(chain, { selection: [99] })).elements).toEqual(chain.elements);
        expect(solveArticulation(rotateInput(chain, { pivotIndex: 99 })).elements).toEqual(chain.elements);
    });
    it('discontiguous selection uses rigid semantics regardless of strategy id', () => {
        const chain = verticalChain();
        const result = solveArticulation(rotateInput(chain, { selection: [1, 3, 5], strategyId: 'spread' }));
        // rigid: each selected element rotated about pivot; distances to pivot preserved
        [1, 3, 5].forEach((i) => expect(distV(result.elements[0], result.elements[i])).toBeCloseTo(i, 9));
        expect(result.elements[2]).toEqual({ x: 0, y: 2 });
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PNPM --filter @proc-geo/core test -- --testPathPattern=articulation`
Expected: FAIL (solve module not found)

- [ ] **Step 3: Write the implementation**

```ts
// packages/core/src/articulation/strategies/rigid.ts
import type { Vector2 } from '../../shared/types';
import type { ArticulationChain, ConstraintStrategy, RotationInput, SolveResult } from '../types';
import { rotateAbout } from '../geometry';
import { clampToValid } from '../clamping';
import { isPoseValid } from '../validity';

/** Rotate every selected element about pivotPos; unselected elements copied unchanged. */
export function rigidRotationPose(
    chain: ArticulationChain,
    selectionSet: Set<number>,
    pivotPos: Vector2,
    angle: number,
): Vector2[] {
    return chain.elements.map((p, i) => (selectionSet.has(i) ? rotateAbout(p, pivotPos, angle) : { ...p }));
}

export const rigidStrategy: ConstraintStrategy = {
    id: 'rigid',
    label: 'Rigid Assembly',
    solveRotation(input: RotationInput): SolveResult {
        const pivotPos = input.chain.elements[input.pivotIndex];
        const clamp = clampToValid(
            (t) => rigidRotationPose(input.chain, input.selectionSet, pivotPos, t * input.angle),
            (els) => isPoseValid(els, input.chain.constraints),
        );
        return { elements: clamp.elements, appliedFraction: clamp.t };
    },
};
```

```ts
// packages/core/src/articulation/solve.ts
import type { ConstraintStrategy, SolveInput, SolveResult, StrategyId } from './types';
import type { ArticulationChain } from './types';
import type { Vector2 } from '../shared/types';
import { addV, lenV, scaleV } from './geometry';
import { clampToValid } from './clamping';
import { isPoseValid } from './validity';
import { isContiguous, splitSpans } from './topology';
import { rigidStrategy } from './strategies/rigid';

/**
 * Strategy registry. Tasks adding strategies register them here; unknown ids
 * fall back to rigid so the record can grow without breaking callers.
 */
export const STRATEGIES: Partial<Record<StrategyId, ConstraintStrategy>> = {
    rigid: rigidStrategy,
};

function identity(chain: ArticulationChain): SolveResult {
    return { elements: chain.elements.map((p) => ({ ...p })), appliedFraction: 1 };
}

function translateRigid(chain: ArticulationChain, selectionSet: Set<number>, vector: Vector2): SolveResult {
    const clamp = clampToValid(
        (t) => chain.elements.map((p, i) => (selectionSet.has(i) ? addV(p, scaleV(vector, t)) : { ...p })),
        (els) => isPoseValid(els, chain.constraints),
    );
    return { elements: clamp.elements, appliedFraction: clamp.t };
}

/**
 * Entry point. Normalizes the selection, dispatches translation (shared,
 * rigid-unit semantics for every strategy), applies the discontiguous ->
 * rigid fallback, splits spans around a selected pivot, and delegates
 * rotation to the chosen strategy. Never throws on bad input.
 */
export function solveArticulation(input: SolveInput): SolveResult {
    const { chain, pivotIndex, delta } = input;
    const n = chain.elements.length;
    const sorted = [...new Set(input.selection)]
        .filter((i) => Number.isInteger(i) && i >= 0 && i < n)
        .sort((a, b) => a - b);
    if (n < 2 || sorted.length === 0) return identity(chain);

    if (delta.kind === 'translate') {
        if (!Number.isFinite(delta.vector.x) || !Number.isFinite(delta.vector.y) || lenV(delta.vector) === 0) {
            return identity(chain);
        }
        return translateRigid(chain, new Set(sorted), delta.vector);
    }

    if (!Number.isFinite(delta.angle) || delta.angle === 0) return identity(chain);
    if (!Number.isInteger(pivotIndex) || pivotIndex < 0 || pivotIndex >= n) return identity(chain);

    const selectionSet = new Set(sorted);
    if (!isContiguous(sorted)) {
        return rigidStrategy.solveRotation({ chain, selectionSet, pivotIndex, spans: [sorted], angle: delta.angle });
    }
    const spans = splitSpans(sorted, pivotIndex);
    if (spans.length === 0) return identity(chain); // selection is exactly the pivot

    const strategy = STRATEGIES[input.strategyId] ?? rigidStrategy;
    return strategy.solveRotation({ chain, selectionSet, pivotIndex, spans, angle: delta.angle });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `PNPM --filter @proc-geo/core test -- --testPathPattern=articulation`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/articulation packages/core/tests/articulation
git commit -m "Add rigid strategy and solveArticulation orchestrator with shared translation"
```

---

### Task 4: Spread Articulation strategy

**Files:**
- Create: `packages/core/src/articulation/strategies/spread.ts`
- Modify: `packages/core/src/articulation/solve.ts` (register `spread` in `STRATEGIES`)
- Test: `packages/core/tests/articulation/spread.test.ts`

**Interfaces:**
- Consumes: `RotationInput`, `ConstraintStrategy`, `SolveResult` from `../types`; `rotateAbout` from `../geometry`; `clampToValid` from `../clamping`; `isPoseValid` from `../validity`
- Produces: `spreadStrategy: ConstraintStrategy` (id `'spread'`, label `'Spread Articulation'`)

**Algorithm (from the spec, exact):** For each span, walk from the pivot outward to the span's far end. The walk path is the sequence of index pairs `(j - dir, j)` from `pivot + dir` to the far end. **Qualifying pairs** are those whose second element is selected. Each qualifying pair's link yaw rotates by `angle / totalQualifyingPairsInSpan`; apply pairs in walk order, rotating every selected element at-or-beyond the pair's second element about the *current* position of the pair's first element. The divisor is computed from indices, so under clamping the per-pair share is always `(t * angle) / divisor` — the divisor never changes. Clamping uses one shared `t` across all spans.

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/tests/articulation/spread.test.ts
import { solveArticulation } from '../../src/articulation/solve';
import { jointAngleAt } from '../../src/articulation/validity';
import { distV } from '../../src/articulation/geometry';
import type { ArticulationChain, SolveInput } from '../../src/articulation/types';
import type { Vector2 } from '../../src/shared/types';

const PI_OVER_THREE = Math.PI / 3;
const PI_OVER_NINE = Math.PI / 9;

function verticalChain(): ArticulationChain {
    const elements: Vector2[] = [0, 1, 2, 3, 4, 5].map((y) => ({ x: 0, y }));
    return { elements, constraints: elements.map(() => ({})) };
}

function input(chain: ArticulationChain, overrides: Partial<SolveInput> = {}): SolveInput {
    return {
        chain,
        selection: [1, 2, 3],
        pivotIndex: 0,
        strategyId: 'spread',
        delta: { kind: 'rotate', angle: PI_OVER_THREE },
        ...overrides,
    };
}

describe('spread rotation (spec worked example)', () => {
    const chain = verticalChain();
    const result = solveArticulation(input(chain));
    const p = result.elements;

    it('applies the full delta when unconstrained', () => {
        expect(result.appliedFraction).toBe(1);
    });
    it('rotates element 1 by delta/3 about the pivot', () => {
        expect(p[1].x).toBeCloseTo(-Math.sin(PI_OVER_NINE), 9);
        expect(p[1].y).toBeCloseTo(Math.cos(PI_OVER_NINE), 9);
    });
    it('sets joint angles at 1 and 2 to delta/3 each', () => {
        expect(jointAngleAt(p, 1)).toBeCloseTo(PI_OVER_NINE, 9);
        expect(jointAngleAt(p, 2)).toBeCloseTo(PI_OVER_NINE, 9);
    });
    it('preserves selected-neighbour distances', () => {
        expect(distV(p[0], p[1])).toBeCloseTo(1, 9);
        expect(distV(p[1], p[2])).toBeCloseTo(1, 9);
        expect(distV(p[2], p[3])).toBeCloseTo(1, 9);
    });
    it('does not move unselected elements 4 and 5', () => {
        expect(p[4]).toEqual({ x: 0, y: 4 });
        expect(p[5]).toEqual({ x: 0, y: 5 });
    });
    it('lets boundary distance [3,4] change', () => {
        expect(distV(p[3], p[4])).not.toBeCloseTo(1, 2);
    });
});

describe('spread with a gap between pivot and selection', () => {
    it('counts only pairs whose second element is selected', () => {
        const chain = verticalChain();
        // pivot 0, selection [2,3]: pairs (1,2) and (2,3) qualify -> divisor 2
        const result = solveArticulation(input(chain, { selection: [2, 3] }));
        const p = result.elements;
        // element 1 unselected: unmoved; distance (1,2) preserved (last
        // unselected to first selected)
        expect(p[1]).toEqual({ x: 0, y: 1 });
        expect(distV(p[1], p[2])).toBeCloseTo(1, 9);
        expect(jointAngleAt(p, 2)).toBeCloseTo(PI_OVER_THREE / 2, 9);
    });
});

describe('spread clamping keeps the divisor fixed', () => {
    it('halved delta still spreads over the same pairs', () => {
        const chain = verticalChain();
        // Constrain joint 1 so only half the per-pair share fits.
        chain.constraints[1] = { jointAngle: { min: -PI_OVER_NINE / 2, max: PI_OVER_NINE / 2 } };
        const result = solveArticulation(input(chain));
        const p = result.elements;
        expect(result.appliedFraction).toBeLessThan(1);
        expect(result.appliedFraction).toBeGreaterThan(0);
        // Every qualifying pair still gets an equal share: joints 1 and 2 stay equal.
        expect(jointAngleAt(p, 1)).toBeCloseTo(jointAngleAt(p, 2)!, 6);
    });
});

describe('spread with pivot inside the selection', () => {
    it('applies the full delta independently to both spans', () => {
        const chain = verticalChain();
        const result = solveArticulation(input(chain, { selection: [1, 2, 3], pivotIndex: 2 }));
        const p = result.elements;
        // below span [1]: one qualifying pair (2,1) -> element 1 rotates by
        // the full delta about the pivot
        expect(distV(p[2], p[1])).toBeCloseTo(1, 9);
        expect(p[1]).not.toEqual({ x: 0, y: 1 });
        // above span [3]: one qualifying pair (2,3)
        expect(distV(p[2], p[3])).toBeCloseTo(1, 9);
        expect(p[3]).not.toEqual({ x: 0, y: 3 });
        // pivot itself does not move
        expect(p[2]).toEqual({ x: 0, y: 2 });
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PNPM --filter @proc-geo/core test -- --testPathPattern=articulation`
Expected: FAIL (spread falls back to rigid until registered; joint-angle expectations differ)

- [ ] **Step 3: Write the implementation**

```ts
// packages/core/src/articulation/strategies/spread.ts
import type { Vector2 } from '../../shared/types';
import type { ConstraintStrategy, RotationInput, SolveResult } from '../types';
import { rotateAbout } from '../geometry';
import { clampToValid } from '../clamping';
import { isPoseValid } from '../validity';

/** Index pairs (a, b) walking from the pivot to the far end of the span. */
function walkPairs(pivotIndex: number, span: number[]): Array<[number, number]> {
    const far = span[span.length - 1];
    const dir = far > pivotIndex ? 1 : -1;
    const pairs: Array<[number, number]> = [];
    for (let j = pivotIndex + dir; dir > 0 ? j <= far : j >= far; j += dir) {
        pairs.push([j - dir, j]);
    }
    return pairs;
}

function applySpreadToSpan(
    out: Vector2[],
    input: RotationInput,
    span: number[],
    angle: number,
): void {
    const { pivotIndex, selectionSet } = input;
    const far = span[span.length - 1];
    const dir = far > pivotIndex ? 1 : -1;
    const qualifying = walkPairs(pivotIndex, span).filter(([, b]) => selectionSet.has(b));
    if (qualifying.length === 0) return;
    const share = angle / qualifying.length;
    for (const [a, b] of qualifying) {
        const center = out[a];
        for (let j = b; dir > 0 ? j <= far : j >= far; j += dir) {
            if (selectionSet.has(j)) out[j] = rotateAbout(out[j], center, share);
        }
    }
}

function spreadPose(input: RotationInput, angle: number): Vector2[] {
    const out = input.chain.elements.map((p) => ({ ...p }));
    for (const span of input.spans) {
        applySpreadToSpan(out, input, span, angle);
    }
    return out;
}

export const spreadStrategy: ConstraintStrategy = {
    id: 'spread',
    label: 'Spread Articulation',
    solveRotation(input: RotationInput): SolveResult {
        const clamp = clampToValid(
            (t) => spreadPose(input, t * input.angle),
            (els) => isPoseValid(els, input.chain.constraints),
        );
        return { elements: clamp.elements, appliedFraction: clamp.t };
    },
};
```

In `solve.ts`, add the import and registry entry:

```ts
import { spreadStrategy } from './strategies/spread';
// ...
export const STRATEGIES: Partial<Record<StrategyId, ConstraintStrategy>> = {
    rigid: rigidStrategy,
    spread: spreadStrategy,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `PNPM --filter @proc-geo/core test -- --testPathPattern=articulation`
Expected: PASS (including all earlier suites)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/articulation packages/core/tests/articulation
git commit -m "Add spread articulation strategy"
```

---

### Task 5: Saturate Articulation strategy

**Files:**
- Create: `packages/core/src/articulation/strategies/saturate.ts`
- Modify: `packages/core/src/articulation/solve.ts` (register `saturate`)
- Test: `packages/core/tests/articulation/saturate.test.ts`

**Interfaces:**
- Consumes: `RotationInput`, `ConstraintStrategy`, `SolveResult` from `../types`; `rotateAbout` from `../geometry`; `clampToValid` from `../clamping`; `isPoseValid`, `ARTICULATION_EPSILON` from `../validity`
- Produces: `saturateStrategy: ConstraintStrategy` (id `'saturate'`, label `'Saturate Articulation'`)

**Algorithm (from the spec, exact):** Per span (walk order away from pivot): the active set starts as the whole span; the rotation center starts at the pivot's position. Loop: rotate the active set rigidly about the center by the remaining angle, clamped to validity (bisection via `clampToValid`). Commit the clamped pose. If the full remainder applied, the span is done. Otherwise the first active element is saturated: it becomes the new rotation center (its committed position), it leaves the active set, and the loop continues with the surplus angle. When the active set empties, discard the remainder. The span's consumed fraction is total-angle-consumed / requested; the result's `appliedFraction` is the mean across spans.

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/tests/articulation/saturate.test.ts
import { solveArticulation } from '../../src/articulation/solve';
import { jointAngleAt } from '../../src/articulation/validity';
import { distV } from '../../src/articulation/geometry';
import type { ArticulationChain, SolveInput } from '../../src/articulation/types';
import type { Vector2 } from '../../src/shared/types';

const PI_OVER_THREE = Math.PI / 3;
const PI_OVER_NINE = Math.PI / 9;

function verticalChain(): ArticulationChain {
    const elements: Vector2[] = [0, 1, 2, 3, 4, 5].map((y) => ({ x: 0, y }));
    return { elements, constraints: elements.map(() => ({})) };
}

function input(chain: ArticulationChain, overrides: Partial<SolveInput> = {}): SolveInput {
    return {
        chain,
        selection: [2, 3, 4],
        pivotIndex: 0,
        strategyId: 'saturate',
        delta: { kind: 'rotate', angle: PI_OVER_THREE },
        ...overrides,
    };
}

describe('saturate rotation (spec worked example)', () => {
    // Joint [0,1,2] (at element 1) limited to PI/9; selection [2,3,4], pivot 0.
    const chain = verticalChain();
    chain.constraints[1] = { jointAngle: { min: -PI_OVER_NINE, max: PI_OVER_NINE } };
    const result = solveArticulation(input(chain));
    const p = result.elements;

    it('saturates the constrained joint (within bisection resolution)', () => {
        const angle = Math.abs(jointAngleAt(p, 1)!);
        expect(angle).toBeLessThanOrEqual(PI_OVER_NINE + 1e-6);
        expect(angle).toBeGreaterThan(PI_OVER_NINE - 0.05);
    });
    it('preserves pivot-to-first-selected distance and unselected links', () => {
        expect(distV(p[0], p[2])).toBeCloseTo(2, 6);
        expect(distV(p[0], p[1])).toBeCloseTo(1, 9);
        expect(p[1]).toEqual({ x: 0, y: 1 }); // unselected, never moves
    });
    it('passes the surplus to the rest of the selection about element 2', () => {
        // 3 and 4 stay rigid relative to each other and to 2
        expect(distV(p[2], p[3])).toBeCloseTo(1, 6);
        expect(distV(p[3], p[4])).toBeCloseTo(1, 6);
        // the recursion actually moved them beyond the phase-1 rigid pose:
        // joint at 2 absorbed surplus, so it is decidedly non-zero
        expect(Math.abs(jointAngleAt(p, 2)!)).toBeGreaterThan(0.05);
    });
    it('consumes (nearly) the whole delta across the recursion', () => {
        expect(result.appliedFraction).toBeGreaterThan(0.9);
    });
    it('element 5 stays unmoved', () => {
        expect(p[5]).toEqual({ x: 0, y: 5 });
    });
});

describe('saturate full saturation discards the remainder', () => {
    it('stops once every selected element is saturated', () => {
        const chain = verticalChain();
        chain.constraints[1] = { jointAngle: { min: -PI_OVER_NINE, max: PI_OVER_NINE } };
        // single selected element: once joint 1 saturates there is nothing to recurse into
        const result = solveArticulation(input(chain, { selection: [2] }));
        expect(result.appliedFraction).toBeLessThan(1);
        const angle = Math.abs(jointAngleAt(result.elements, 1)!);
        expect(angle).toBeLessThanOrEqual(PI_OVER_NINE + 1e-6);
    });
});

describe('saturate without constraints degrades to rigid', () => {
    it('matches the rigid pose when nothing saturates', () => {
        const chain = verticalChain();
        const sat = solveArticulation(input(chain));
        const rig = solveArticulation(input(verticalChain(), { strategyId: 'rigid' }));
        sat.elements.forEach((pt, i) => {
            expect(pt.x).toBeCloseTo(rig.elements[i].x, 9);
            expect(pt.y).toBeCloseTo(rig.elements[i].y, 9);
        });
        expect(sat.appliedFraction).toBe(1);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PNPM --filter @proc-geo/core test -- --testPathPattern=articulation`
Expected: FAIL (saturate falls back to rigid; the saturation/joint expectations differ)

- [ ] **Step 3: Write the implementation**

```ts
// packages/core/src/articulation/strategies/saturate.ts
import type { Vector2 } from '../../shared/types';
import type { ConstraintStrategy, RotationInput, SolveResult } from '../types';
import { rotateAbout } from '../geometry';
import { clampToValid } from '../clamping';
import { ARTICULATION_EPSILON, isPoseValid } from '../validity';

/**
 * Consume as much of `angle` as constraints allow for one span. Mutates
 * `out` in place; returns the fraction of the requested angle consumed.
 */
function saturateSpan(out: Vector2[], input: RotationInput, span: number[], angle: number): number {
    const { chain } = input;
    const active = [...span];
    let center = out[input.pivotIndex];
    let remaining = angle;
    let consumed = 0;
    while (active.length > 0 && Math.abs(remaining) > ARTICULATION_EPSILON) {
        const base = out.map((p) => ({ ...p }));
        const stepAngle = remaining;
        const clamp = clampToValid(
            (t) => base.map((p, i) => (active.includes(i) ? rotateAbout(p, center, t * stepAngle) : p)),
            (els) => isPoseValid(els, chain.constraints),
        );
        for (let i = 0; i < out.length; i++) out[i] = clamp.elements[i];
        consumed += clamp.t * stepAngle;
        remaining = stepAngle * (1 - clamp.t);
        if (clamp.t >= 1) break;
        // First active element saturates and becomes the new rotation center.
        const saturated = active.shift()!;
        center = out[saturated];
    }
    return angle === 0 ? 1 : consumed / angle;
}

export const saturateStrategy: ConstraintStrategy = {
    id: 'saturate',
    label: 'Saturate Articulation',
    solveRotation(input: RotationInput): SolveResult {
        const out = input.chain.elements.map((p) => ({ ...p }));
        let fractionSum = 0;
        for (const span of input.spans) {
            fractionSum += saturateSpan(out, input, span, input.angle);
        }
        const appliedFraction = input.spans.length === 0 ? 1 : fractionSum / input.spans.length;
        return { elements: out, appliedFraction };
    },
};
```

Note: `active.includes(i)` inside the pose closure is O(span) per element but spans are tiny in a sandbox; do not optimize prematurely. In `solve.ts` add:

```ts
import { saturateStrategy } from './strategies/saturate';
// ...
export const STRATEGIES: Partial<Record<StrategyId, ConstraintStrategy>> = {
    rigid: rigidStrategy,
    spread: spreadStrategy,
    saturate: saturateStrategy,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `PNPM --filter @proc-geo/core test -- --testPathPattern=articulation`
Expected: PASS (all articulation suites)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/articulation packages/core/tests/articulation
git commit -m "Add saturate articulation strategy"
```

---

### Task 6: Core barrel exports and package build

**Files:**
- Create: `packages/core/src/articulation/index.ts`
- Modify: `packages/core/src/index.ts` (append an articulation section)

**Interfaces:**
- Produces (what the dashboard imports from `@proc-geo/core`): `solveArticulation`, `STRATEGIES`, `isPoseValid`, `jointAngleAt`, `ARTICULATION_EPSILON`, and types `ArticulationChain`, `ElementConstraints`, `MinMax`, `TransformDelta`, `SolveInput`, `SolveResult`, `StrategyId`, `ConstraintStrategy`

- [ ] **Step 1: Write the barrel**

```ts
// packages/core/src/articulation/index.ts
export type {
    MinMax,
    ElementConstraints,
    ArticulationChain,
    TransformDelta,
    StrategyId,
    SolveInput,
    SolveResult,
    RotationInput,
    ConstraintStrategy,
} from './types';
export { ARTICULATION_EPSILON, jointAngleAt, isPoseValid } from './validity';
export { clampToValid, CLAMP_BISECTION_DEPTH } from './clamping';
export { isContiguous, splitSpans } from './topology';
export { solveArticulation, STRATEGIES } from './solve';
export { rigidStrategy } from './strategies/rigid';
export { spreadStrategy } from './strategies/spread';
export { saturateStrategy } from './strategies/saturate';
```

Append to `packages/core/src/index.ts` (after the D0L section, matching the existing section-comment style):

```ts
// ── Articulation constraint solver ───────────────────────────────────────────
export type {
    MinMax,
    ElementConstraints,
    ArticulationChain,
    TransformDelta,
    StrategyId,
    SolveInput,
    SolveResult,
    RotationInput,
    ConstraintStrategy,
} from './articulation';
export {
    ARTICULATION_EPSILON,
    jointAngleAt,
    isPoseValid,
    solveArticulation,
    STRATEGIES,
} from './articulation';
```

- [ ] **Step 2: Run the full core test suite and build**

Run: `PNPM --filter @proc-geo/core test`
Expected: PASS (articulation and all pre-existing suites — straight-skeleton, random-polygon, etc.)

Run: `PNPM --filter @proc-geo/core build`
Expected: tsup succeeds, ESM + CJS + d.ts emitted, no type errors

- [ ] **Step 3: Commit**

```bash
git add packages/core/src
git commit -m "Export articulation solver from @proc-geo/core"
```

---

### Task 7: Dashboard store (useArticulationStore)

**Files:**
- Create: `packages/dashboard/src/stores/useArticulationStore.ts`

**Interfaces:**
- Consumes from `@proc-geo/core`: `solveArticulation`, `SolveInput`, and types `ElementConstraints`, `StrategyId`, `TransformDelta`; `Vector2` type comes via `@proc-geo/core` exports.
- Produces (canvas and panels rely on these exact names): the state/actions shape below, exported as `useArticulationStore` plus the `ArticulationStoreState` interface and `TransformMode` type.

There is no dashboard unit-test infrastructure (spec decision: dashboard is verified via Playwright on the demo page). Correctness still matters — keep every action small and pure.

- [ ] **Step 1: Write the store**

```ts
// packages/dashboard/src/stores/useArticulationStore.ts
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { current } from 'immer';
import { solveArticulation } from '@proc-geo/core';
import type { ElementConstraints, StrategyId, Vector2 } from '@proc-geo/core';

export type TransformMode = 'translate' | 'rotate';

interface DragSession {
    /** Pose cached at drag start; every update re-solves from here. */
    originElements: Vector2[];
    startPointer: Vector2;
}

export interface ArticulationStoreState {
    elements: Vector2[];
    constraints: ElementConstraints[];
    selection: number[];
    pivotIndex: number;
    strategyId: StrategyId;
    transformMode: TransformMode;
    drag: DragSession | null;
    /** From the last solve; < 1 means constraints clamped the input. */
    appliedFraction: number;

    addElement: (p: Vector2) => void;
    deleteSelected: () => void;
    clearAll: () => void;
    selectOnly: (index: number) => void;
    toggleSelect: (index: number) => void;
    marqueeSelect: (indices: number[], additive: boolean) => void;
    clearSelection: () => void;
    setPivot: (index: number) => void;
    setStrategy: (id: StrategyId) => void;
    setTransformMode: (mode: TransformMode) => void;
    setConstraints: (index: number, constraints: ElementConstraints) => void;
    /** Apply one constraint struct to several elements (paste target). */
    applyConstraintsTo: (indices: number[], constraints: ElementConstraints) => void;
    beginDrag: (pointer: Vector2) => void;
    updateDrag: (pointer: Vector2) => void;
    endDrag: () => void;
}

const angleAround = (center: Vector2, p: Vector2) => Math.atan2(p.y - center.y, p.x - center.x);

/** Smallest signed representation of an angle difference, in (-PI, PI]. */
function normalizeAngle(a: number): number {
    let r = a;
    while (r <= -Math.PI) r += 2 * Math.PI;
    while (r > Math.PI) r -= 2 * Math.PI;
    return r;
}

export const useArticulationStore = create<ArticulationStoreState>()(
    immer((set) => ({
        elements: [],
        constraints: [],
        selection: [],
        pivotIndex: 0,
        strategyId: 'rigid',
        transformMode: 'rotate',
        drag: null,
        appliedFraction: 1,

        addElement: (p) =>
            set((s) => {
                if (s.elements.length === 0) {
                    s.elements.push(p);
                    s.constraints.push({});
                    return;
                }
                const dFirst = Math.hypot(p.x - s.elements[0].x, p.y - s.elements[0].y);
                const last = s.elements[s.elements.length - 1];
                const dLast = Math.hypot(p.x - last.x, p.y - last.y);
                if (dFirst < dLast) {
                    s.elements.unshift(p);
                    s.constraints.unshift({});
                    s.selection = s.selection.map((i) => i + 1);
                    s.pivotIndex += 1;
                } else {
                    s.elements.push(p);
                    s.constraints.push({});
                }
            }),

        deleteSelected: () =>
            set((s) => {
                if (s.selection.length === 0) return;
                const dead = new Set(s.selection);
                const survivors = s.elements
                    .map((el, i) => ({ el, c: s.constraints[i], i }))
                    .filter(({ i }) => !dead.has(i));
                // pivot follows the nearest surviving element by index distance
                let newPivot = 0;
                let bestDist = Infinity;
                survivors.forEach(({ i }, newIndex) => {
                    const d = Math.abs(i - s.pivotIndex);
                    if (d < bestDist) {
                        bestDist = d;
                        newPivot = newIndex;
                    }
                });
                s.elements = survivors.map(({ el }) => el);
                s.constraints = survivors.map(({ c }) => c);
                s.selection = [];
                s.pivotIndex = newPivot;
                s.drag = null;
            }),

        clearAll: () =>
            set((s) => {
                s.elements = [];
                s.constraints = [];
                s.selection = [];
                s.pivotIndex = 0;
                s.drag = null;
                s.appliedFraction = 1;
            }),

        selectOnly: (index) =>
            set((s) => {
                s.selection = [index];
            }),

        toggleSelect: (index) =>
            set((s) => {
                const at = s.selection.indexOf(index);
                if (at >= 0) s.selection.splice(at, 1);
                else s.selection.push(index);
            }),

        marqueeSelect: (indices, additive) =>
            set((s) => {
                s.selection = additive ? [...new Set([...s.selection, ...indices])] : indices;
            }),

        clearSelection: () =>
            set((s) => {
                s.selection = [];
            }),

        setPivot: (index) =>
            set((s) => {
                if (index >= 0 && index < s.elements.length) s.pivotIndex = index;
            }),

        setStrategy: (id) =>
            set((s) => {
                s.strategyId = id;
            }),

        setTransformMode: (mode) =>
            set((s) => {
                s.transformMode = mode;
            }),

        setConstraints: (index, constraints) =>
            set((s) => {
                if (index >= 0 && index < s.constraints.length) s.constraints[index] = constraints;
            }),

        applyConstraintsTo: (indices, constraints) =>
            set((s) => {
                for (const i of indices) {
                    if (i >= 0 && i < s.constraints.length) s.constraints[i] = { ...constraints };
                }
            }),

        beginDrag: (pointer) =>
            set((s) => {
                s.drag = { originElements: current(s).elements.map((p) => ({ ...p })), startPointer: pointer };
                s.appliedFraction = 1;
            }),

        updateDrag: (pointer) =>
            set((s) => {
                if (!s.drag) return;
                const plain = current(s);
                const origin = s.drag.originElements;
                let delta;
                if (plain.transformMode === 'translate') {
                    delta = {
                        kind: 'translate' as const,
                        vector: { x: pointer.x - s.drag.startPointer.x, y: pointer.y - s.drag.startPointer.y },
                    };
                } else {
                    const pivotPos = origin[plain.pivotIndex];
                    if (!pivotPos) return;
                    const a0 = angleAround(pivotPos, s.drag.startPointer);
                    const a1 = angleAround(pivotPos, pointer);
                    delta = { kind: 'rotate' as const, angle: normalizeAngle(a1 - a0) };
                }
                const result = solveArticulation({
                    chain: { elements: origin, constraints: plain.constraints },
                    selection: plain.selection,
                    pivotIndex: plain.pivotIndex,
                    strategyId: plain.strategyId,
                    delta,
                });
                s.elements = result.elements;
                s.appliedFraction = result.appliedFraction;
            }),

        endDrag: () =>
            set((s) => {
                s.drag = null;
            }),
    })),
);
```

- [ ] **Step 2: Type-check via dashboard build**

Run: `PNPM --filter @proc-geo/core build` (dashboard consumes built types)
Then: `PNPM --filter @proc-geo/dashboard build`
Expected: tsup succeeds with no type errors. (If `Vector2` is not exported from `@proc-geo/core`'s barrel, export the type there — it already exists in `src/shared/types.ts`.)

- [ ] **Step 3: Commit**

```bash
git add packages/dashboard/src/stores/useArticulationStore.ts packages/core/src
git commit -m "Add articulation dashboard store"
```

---

### Task 8: ArticulationCanvas component

**Files:**
- Create: `packages/dashboard/src/components/articulation/ArticulationCanvas.tsx`

**Interfaces:**
- Consumes: `useArticulationStore` (Task 7 shape) via `../../stores/useArticulationStore`
- Produces: default-exportable named component `ArticulationCanvas` (no props)

**Interaction rules (from the spec — implement exactly):**

| Gesture | On | Effect |
|---|---|---|
| LMB click (< 4 px movement) | empty canvas | `addElement(pos)` |
| LMB drag (≥ 4 px) | empty canvas | marquee select; Shift held at release → additive |
| LMB click | element | `selectOnly(i)` if unselected |
| Shift + LMB click | element | `toggleSelect(i)` |
| Ctrl + LMB click | element | `setPivot(i)` |
| LMB drag | already-selected element | `beginDrag` → `updateDrag` per move → `endDrag` |
| Delete/Backspace key | window | `deleteSelected()` |

Follow `PenStrokeCanvas` (`packages/dashboard/src/components/pen-stroke/PenStrokeCanvas.tsx`) for the container/ResizeObserver/Stage scaffolding, dark background (`#1a1b1e`), and pointer-event style. Read it before writing this file.

- [ ] **Step 1: Write the component**

```tsx
// packages/dashboard/src/components/articulation/ArticulationCanvas.tsx
import { useEffect, useRef, useState } from 'react';
import { Stage, Layer, Line, Circle, Rect } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { useArticulationStore } from '../../stores/useArticulationStore';

const LINK_COLOR = '#5c6470';
const ELEMENT_COLOR = '#7a8288';
const SELECTED_COLOR = '#4dd0e1';
const PIVOT_RING_COLOR = '#ffa94d';
const CLAMPED_COLOR = '#ff6b6b';
const ELEMENT_RADIUS = 8;
const DRAG_THRESHOLD_PX = 4;

type PointerSession =
    | { type: 'maybe-add'; start: { x: number; y: number }; shift: boolean }
    | { type: 'marquee'; start: { x: number; y: number }; currentPos: { x: number; y: number }; shift: boolean }
    | { type: 'transform' };

export function ArticulationCanvas() {
    const containerRef = useRef<HTMLDivElement>(null);
    const [size, setSize] = useState({ width: 800, height: 600 });
    const sessionRef = useRef<PointerSession | null>(null);
    const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

    const elements = useArticulationStore((s) => s.elements);
    const selection = useArticulationStore((s) => s.selection);
    const pivotIndex = useArticulationStore((s) => s.pivotIndex);
    const appliedFraction = useArticulationStore((s) => s.appliedFraction);
    const drag = useArticulationStore((s) => s.drag);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const ro = new ResizeObserver((entries) => {
            const { width, height } = entries[0].contentRect;
            if (width > 0 && height > 0) setSize({ width, height });
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Delete' || e.key === 'Backspace') {
                const target = e.target as HTMLElement;
                if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
                useArticulationStore.getState().deleteSelected();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    const stagePos = (e: KonvaEventObject<PointerEvent>) => {
        const stage = e.target.getStage();
        return stage?.getPointerPosition() ?? null;
    };

    const handleElementPointerDown = (index: number, e: KonvaEventObject<PointerEvent>) => {
        e.cancelBubble = true;
        if (e.evt.button !== 0) return;
        const store = useArticulationStore.getState();
        if (e.evt.ctrlKey || e.evt.metaKey) {
            store.setPivot(index);
            return;
        }
        if (e.evt.shiftKey) {
            store.toggleSelect(index);
            return;
        }
        if (store.selection.includes(index)) {
            const pos = stagePos(e);
            if (pos) {
                sessionRef.current = { type: 'transform' };
                store.beginDrag(pos);
            }
        } else {
            store.selectOnly(index);
        }
    };

    const handleStagePointerDown = (e: KonvaEventObject<PointerEvent>) => {
        if (e.target !== e.target.getStage()) return; // element handlers own their events
        if (e.evt.button !== 0) return;
        const pos = stagePos(e);
        if (pos) sessionRef.current = { type: 'maybe-add', start: pos, shift: e.evt.shiftKey };
    };

    const handlePointerMove = (e: KonvaEventObject<PointerEvent>) => {
        const session = sessionRef.current;
        const pos = stagePos(e);
        if (!session || !pos) return;
        if (session.type === 'transform') {
            useArticulationStore.getState().updateDrag(pos);
            return;
        }
        const moved = Math.hypot(pos.x - session.start.x, pos.y - session.start.y);
        if (session.type === 'maybe-add' && moved >= DRAG_THRESHOLD_PX) {
            sessionRef.current = { type: 'marquee', start: session.start, currentPos: pos, shift: session.shift };
        }
        if (sessionRef.current?.type === 'marquee') {
            const m = sessionRef.current;
            m.currentPos = pos;
            m.shift = m.shift || e.evt.shiftKey;
            setMarquee({
                x: Math.min(m.start.x, pos.x),
                y: Math.min(m.start.y, pos.y),
                w: Math.abs(pos.x - m.start.x),
                h: Math.abs(pos.y - m.start.y),
            });
        }
    };

    const handlePointerUp = () => {
        const session = sessionRef.current;
        sessionRef.current = null;
        const store = useArticulationStore.getState();
        if (!session) return;
        if (session.type === 'transform') {
            store.endDrag();
            return;
        }
        if (session.type === 'maybe-add') {
            store.addElement(session.start);
            return;
        }
        // marquee
        const x0 = Math.min(session.start.x, session.currentPos.x);
        const x1 = Math.max(session.start.x, session.currentPos.x);
        const y0 = Math.min(session.start.y, session.currentPos.y);
        const y1 = Math.max(session.start.y, session.currentPos.y);
        const hits = store.elements
            .map((p, i) => ({ p, i }))
            .filter(({ p }) => p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1)
            .map(({ i }) => i);
        store.marqueeSelect(hits, session.shift);
        setMarquee(null);
    };

    const clamped = drag !== null && appliedFraction < 1;
    const linkPoints = elements.flatMap((p) => [p.x, p.y]);

    return (
        <div ref={containerRef} style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
            <Stage
                width={size.width}
                height={size.height}
                onPointerDown={handleStagePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
                style={{ background: '#1a1b1e', borderRadius: 8, touchAction: 'none' }}
            >
                <Layer>
                    {elements.length >= 2 && (
                        <Line points={linkPoints} stroke={LINK_COLOR} strokeWidth={2} lineCap="round" lineJoin="round" listening={false} />
                    )}
                    {elements.map((p, i) => {
                        const isSelected = selection.includes(i);
                        const isPivot = i === pivotIndex;
                        return (
                            <Circle
                                key={i}
                                x={p.x}
                                y={p.y}
                                radius={ELEMENT_RADIUS}
                                fill={isSelected ? (clamped ? CLAMPED_COLOR : SELECTED_COLOR) : ELEMENT_COLOR}
                                stroke={isPivot ? PIVOT_RING_COLOR : undefined}
                                strokeWidth={isPivot ? 3 : 0}
                                onPointerDown={(e) => handleElementPointerDown(i, e)}
                            />
                        );
                    })}
                    {marquee && (
                        <Rect
                            x={marquee.x}
                            y={marquee.y}
                            width={marquee.w}
                            height={marquee.h}
                            stroke={SELECTED_COLOR}
                            dash={[4, 4]}
                            strokeWidth={1}
                            listening={false}
                        />
                    )}
                </Layer>
            </Stage>
        </div>
    );
}
```

- [ ] **Step 2: Type-check**

Run: `PNPM --filter @proc-geo/dashboard build`
Expected: builds clean. (The component is not yet exported from the barrel; tsup compiles `src/index.ts` entry — if unreferenced files are excluded from the build, defer the check to Task 9 and note it.)

- [ ] **Step 3: Commit**

```bash
git add packages/dashboard/src/components/articulation
git commit -m "Add articulation canvas with selection, pivot, marquee, and transform gestures"
```

---

### Task 9: Control and constraint panels, dashboard exports

**Files:**
- Create: `packages/dashboard/src/components/articulation/ArticulationControlsPanel.tsx`
- Create: `packages/dashboard/src/components/articulation/ArticulationConstraintPanel.tsx`
- Create: `packages/dashboard/src/components/articulation/index.ts`
- Modify: `packages/dashboard/src/index.ts`

**Interfaces:**
- Consumes: `useArticulationStore` (Task 7), `STRATEGIES` and `ElementConstraints`/`MinMax`/`StrategyId` from `@proc-geo/core`, Mantine v8 components
- Produces: `ArticulationCanvas`, `ArticulationControlsPanel`, `ArticulationConstraintPanel`, `useArticulationStore` all exported from `@proc-geo/dashboard`

- [ ] **Step 1: Write the controls panel**

```tsx
// packages/dashboard/src/components/articulation/ArticulationControlsPanel.tsx
import { Badge, Button, Group, Paper, SegmentedControl, Stack, Text, Title } from '@mantine/core';
import { STRATEGIES } from '@proc-geo/core';
import type { StrategyId } from '@proc-geo/core';
import { useArticulationStore } from '../../stores/useArticulationStore';

const STRATEGY_OPTIONS = (Object.keys(STRATEGIES) as StrategyId[]).map((id) => ({
    value: id,
    label: STRATEGIES[id]!.label,
}));

export function ArticulationControlsPanel() {
    const strategyId = useArticulationStore((s) => s.strategyId);
    const transformMode = useArticulationStore((s) => s.transformMode);
    const selection = useArticulationStore((s) => s.selection);
    const appliedFraction = useArticulationStore((s) => s.appliedFraction);
    const setStrategy = useArticulationStore((s) => s.setStrategy);
    const setTransformMode = useArticulationStore((s) => s.setTransformMode);
    const deleteSelected = useArticulationStore((s) => s.deleteSelected);
    const clearAll = useArticulationStore((s) => s.clearAll);

    return (
        <Paper p="sm" withBorder>
            <Stack gap="sm">
                <Title order={5}>Solver</Title>
                <SegmentedControl
                    fullWidth
                    data={STRATEGY_OPTIONS}
                    value={strategyId}
                    onChange={(v) => setStrategy(v as StrategyId)}
                />
                <SegmentedControl
                    fullWidth
                    data={[
                        { value: 'rotate', label: 'Rotate' },
                        { value: 'translate', label: 'Translate' },
                    ]}
                    value={transformMode}
                    onChange={(v) => setTransformMode(v as 'rotate' | 'translate')}
                />
                {appliedFraction < 1 && (
                    <Badge color="red" variant="light">
                        Clamped to {(appliedFraction * 100).toFixed(0)}%
                    </Badge>
                )}
                <Group gap="xs">
                    <Button size="xs" color="red" variant="light" disabled={selection.length === 0} onClick={deleteSelected}>
                        Delete selected
                    </Button>
                    <Button size="xs" variant="default" onClick={clearAll}>
                        Clear all
                    </Button>
                </Group>
                <Text size="xs" c="dimmed">
                    Click empty space to add an element. Drag empty space to marquee-select. Shift-click toggles
                    selection, Ctrl-click sets the pivot, drag a selected element to transform.
                </Text>
            </Stack>
        </Paper>
    );
}
```

- [ ] **Step 2: Write the constraint panel**

Angle fields are displayed in degrees, stored in radians. Distance fields are canvas pixels. Enabling an axis seeds it with a sensible default around the current value where possible.

```tsx
// packages/dashboard/src/components/articulation/ArticulationConstraintPanel.tsx
import { Button, Group, NumberInput, Paper, Stack, Switch, Text, Title } from '@mantine/core';
import type { ElementConstraints, MinMax } from '@proc-geo/core';
import { useArticulationStore } from '../../stores/useArticulationStore';

const RAD_TO_DEG = 180 / Math.PI;
const DEG_TO_RAD = Math.PI / 180;

type AxisKey = 'distanceToPrev' | 'distanceToNext' | 'jointAngle';

const AXES: Array<{ key: AxisKey; label: string; isAngle: boolean; defaultBound: MinMax }> = [
    { key: 'distanceToPrev', label: 'Distance to previous', isAngle: false, defaultBound: { min: 20, max: 200 } },
    { key: 'distanceToNext', label: 'Distance to next', isAngle: false, defaultBound: { min: 20, max: 200 } },
    { key: 'jointAngle', label: 'Joint angle (deg)', isAngle: true, defaultBound: { min: -Math.PI / 2, max: Math.PI / 2 } },
];

function AxisRow({
    axis,
    constraints,
    onChange,
}: {
    axis: (typeof AXES)[number];
    constraints: ElementConstraints;
    onChange: (next: ElementConstraints) => void;
}) {
    const bound = constraints[axis.key];
    const toDisplay = (v: number) => (axis.isAngle ? v * RAD_TO_DEG : v);
    const fromDisplay = (v: number) => (axis.isAngle ? v * DEG_TO_RAD : v);
    const setBound = (b: MinMax | undefined) => onChange({ ...constraints, [axis.key]: b });

    return (
        <Stack gap={4}>
            <Switch
                size="xs"
                label={axis.label}
                checked={bound !== undefined}
                onChange={(e) => setBound(e.currentTarget.checked ? { ...axis.defaultBound } : undefined)}
            />
            {bound && (
                <Group gap="xs" grow>
                    <NumberInput
                        size="xs"
                        label="min"
                        value={toDisplay(bound.min)}
                        onChange={(v) => {
                            if (typeof v !== 'number') return;
                            const min = fromDisplay(v);
                            setBound({ min, max: Math.max(min, bound.max) });
                        }}
                    />
                    <NumberInput
                        size="xs"
                        label="max"
                        value={toDisplay(bound.max)}
                        onChange={(v) => {
                            if (typeof v !== 'number') return;
                            const max = fromDisplay(v);
                            setBound({ min: Math.min(bound.min, max), max });
                        }}
                    />
                </Group>
            )}
        </Stack>
    );
}

export function ArticulationConstraintPanel() {
    const selection = useArticulationStore((s) => s.selection);
    const constraints = useArticulationStore((s) => s.constraints);
    const setConstraints = useArticulationStore((s) => s.setConstraints);
    const applyConstraintsTo = useArticulationStore((s) => s.applyConstraintsTo);

    const single = selection.length === 1 ? selection[0] : null;
    const active: ElementConstraints | null = single !== null ? (constraints[single] ?? {}) : null;

    const copy = async () => {
        if (active === null) return;
        await navigator.clipboard.writeText(JSON.stringify(active));
    };
    const paste = async () => {
        try {
            const text = await navigator.clipboard.readText();
            const parsed = JSON.parse(text) as ElementConstraints;
            applyConstraintsTo(selection, parsed);
        } catch {
            // invalid clipboard contents: ignore
        }
    };

    return (
        <Paper p="sm" withBorder>
            <Stack gap="sm">
                <Title order={5}>Constraints</Title>
                {single === null ? (
                    <Text size="xs" c="dimmed">
                        {selection.length === 0
                            ? 'Select an element to edit its constraints.'
                            : `${selection.length} elements selected — Paste applies to all of them.`}
                    </Text>
                ) : (
                    <>
                        <Text size="xs" c="dimmed">Element #{single}</Text>
                        {AXES.map((axis) => (
                            <AxisRow
                                key={axis.key}
                                axis={axis}
                                constraints={active!}
                                onChange={(next) => setConstraints(single, next)}
                            />
                        ))}
                    </>
                )}
                <Group gap="xs">
                    <Button size="xs" variant="default" disabled={single === null} onClick={copy}>
                        Copy
                    </Button>
                    <Button size="xs" variant="default" disabled={selection.length === 0} onClick={paste}>
                        Paste
                    </Button>
                </Group>
            </Stack>
        </Paper>
    );
}
```

- [ ] **Step 3: Barrel exports**

```ts
// packages/dashboard/src/components/articulation/index.ts
export { ArticulationCanvas } from './ArticulationCanvas';
export { ArticulationControlsPanel } from './ArticulationControlsPanel';
export { ArticulationConstraintPanel } from './ArticulationConstraintPanel';
```

Append to `packages/dashboard/src/index.ts`:

```ts
// Articulation constraint solver
export { useArticulationStore } from './stores/useArticulationStore';
export type { ArticulationStoreState, TransformMode } from './stores/useArticulationStore';
export { ArticulationCanvas, ArticulationControlsPanel, ArticulationConstraintPanel } from './components/articulation';
```

- [ ] **Step 4: Build**

Run: `PNPM --filter @proc-geo/dashboard build`
Expected: clean build, d.ts emitted

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src
git commit -m "Add articulation control and constraint panels; export from dashboard"
```

---

### Task 10: Demo page and navigation

**Files:**
- Create: `apps/demo/src/app/articulation/page.tsx`
- Modify: `apps/demo/src/app/AppShellLayout.tsx` (add NavLink)

**Interfaces:**
- Consumes: `ArticulationCanvas`, `ArticulationControlsPanel`, `ArticulationConstraintPanel` from `@proc-geo/dashboard`; `AlgorithmPageLayout` from `../AlgorithmPageLayout`

- [ ] **Step 1: Write the page** (mirror `apps/demo/src/app/pen-stroke/page.tsx`)

```tsx
// apps/demo/src/app/articulation/page.tsx
"use client";

import dynamic from "next/dynamic";
import { Stack } from "@mantine/core";
import { ArticulationControlsPanel, ArticulationConstraintPanel } from "@proc-geo/dashboard";
import AlgorithmPageLayout from "../AlgorithmPageLayout";

const ArticulationCanvas = dynamic(
    () => import("@proc-geo/dashboard").then((m) => ({ default: m.ArticulationCanvas })),
    { ssr: false },
);

export default function ArticulationPage() {
    return (
        <AlgorithmPageLayout
            algorithmName="Articulation Constraints"
            canvas={<ArticulationCanvas />}
            panels={
                <Stack gap="sm">
                    <ArticulationControlsPanel />
                    <ArticulationConstraintPanel />
                </Stack>
            }
        />
    );
}
```

- [ ] **Step 2: Add the NavLink** in `AppShellLayout.tsx`, after the Pen Stroke entry:

```tsx
<NavLink
    component={Link}
    href="/articulation"
    label="Articulation Constraints"
    active={pathname === "/articulation"}
/>
```

- [ ] **Step 3: Full build**

Run: `PNPM build` (root: core → test-fixtures → dashboard → demo)
Expected: all four packages build clean

- [ ] **Step 4: Commit**

```bash
git add apps/demo/src/app
git commit -m "Add articulation explorer demo page and nav entry"
```

---

## Post-implementation (steering engineer, not subagents)

1. **Adversarial review:** dispatch a fresh reviewer agent over the full diff (spec compliance, correctness of the three algorithms vs. the design note's worked examples, UI gesture conflicts, store/immer pitfalls). Fix confirmed findings via TDD.
2. **Playwright visual verification:** run the demo (`PNPM dev`), drive the articulation page — add elements, marquee, set pivot, drag under each strategy, set a joint constraint and confirm the clamped badge — and screenshot the result.
