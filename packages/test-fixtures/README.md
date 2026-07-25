# @proc-geo/test-fixtures

Polygon fixtures and solver test helpers for [`@proc-geo/core`](https://www.npmjs.com/package/@proc-geo/core).

These are not decorative sample shapes. Most of them are cases that broke the straight-skeleton solver at some point —
kept, named, and pinned so that regressions surface immediately. If you are benchmarking a skeleton implementation or
writing your own, this is a ready-made adversarial corpus.

```bash
npm install --save-dev @proc-geo/test-fixtures
```

## The polygon list

`ALL_TEST_POLYGONS` is the canonical set — **35 named polygons**, ranging from a triangle to two 32-gons:

```ts
import { ALL_TEST_POLYGONS } from '@proc-geo/test-fixtures';
import { runAlgorithmV5 } from '@proc-geo/core';

for (const { name, vertices } of ALL_TEST_POLYGONS) {
  const context = runAlgorithmV5(vertices);
  console.log(name, context.graph.edges.length);
}
```

```ts
interface NamedTestPolygon {
  name: string;
  vertices: Vector2[];
}
```

Every fixture is also exported individually by name, so you can pull a single case into a focused test:

```ts
import { AWKWARD_HEPTAGON, CRAZY_POLYGON } from '@proc-geo/test-fixtures';
```

All vertices are wound **clockwise**, which is what `runAlgorithmV5` expects.

### What's in the set

| Group | Fixtures |
|-------|----------|
| Basic shapes | `TRIANGLE`, `SQUARE`, `RECTANGLE`, `PENTAGON_HOUSE`, `DEFAULT_PENTAGON` |
| Known-awkward | `AWKWARD_HEXAGON`, `AWKWARD_HEPTAGON`, `IMPOSSIBLE_OCTAGON`, `BROKEN_POLYGON`, `CRAZY_POLYGON` |
| Duck / moorhen | `DUCK_OCTAGON_FAILS`, `DUCK_OCTAGON_PASSES`, `MOORHEN_FAILS`, `MOORHEN_PASSES` |
| Double reflex spaceship | `FAILURE_CASE_DOUBLE_SPACESHIP_V2`, `PREVIOUSLY_FAILURE_CASE_DOUBLE_REFLEX_SPACESHIP`, `SUCCESS_CASE_DOUBLE_REFLEX_SPACESHIP` |
| Isthmus convergence | `CONVERGENCE_TOWARDS_ISTHMUS_SUCCEEDS`, `DIVERGENCE_TOWARDS_ISTHMUS_FAILS_NODE_7`, `DIVERGENCE_TOWARDS_ISTHMUS_FAILS_NODE_4` |
| Long octagon | `LONG_OCTAGON`, `FAILING_LONG_OCTAGON`, `FAILING_GENTLE_REFLEX_PENTAGON` |
| Mid-case brackets | `SUCCESS_OUTER`, `FAILURE_START_CASE`, `FAILURE_END_CASE`, `SUCCESS_INNER` |
| Standalone edge cases | `MissingEdgeAtNode11`, `CAUSES_MISSING_SECONDARY_EDGE`, `WACKY_OCTAGON`, `NOT_SOLVABLE`, `WRONG_COLLISION_AT_NODE_10`, `PREMATURE_SPLIT_OCTAGON`, `LONG_SIDE_ACUTE_VERTEX`, `INCORRECT_ORDERING_E38_E30_COLLISION` |

The `(fails)` / `(passes)` naming is deliberate and worth understanding: these are **near-identical pairs** that
bracket a failure. `MOORHEN_FAILS` and `MOORHEN_PASSES` differ by a small perturbation, as do the isthmus and mid-case
groups. They isolate exactly which geometric configuration tips the solver over, which makes them far more useful for
debugging than either shape alone.

> The names record history, not current status. A fixture called `..._FAILS` describes the case that *once* failed —
> it is not a claim that the current solver fails it. The core test suite is the source of truth for what passes today.

### Exported but not in `ALL_TEST_POLYGONS`

Eight further polygons are exported individually and deliberately left out of the list: `SYMMETRICAL_OCTAGON`,
`CRAB_TEST_CASE`, `CRAB_TEST_CASE_2`, `CRAB_TEST_CASE_3`, `LOSES_WHEN_REFLEX_IS_FIRST_COLLISION`,
`PASSES_WITH_SOFTER_REFLEX`, `PASSES_WHEN_REFLEX_HITS_ADJACENT_BISECTOR`, and `SIMPLE_REFLEX`. Import them by name if
you want them; iterating `ALL_TEST_POLYGONS` will not include them.

## Test helpers

Utilities for inspecting a solver run rather than just its final output:

| Export | Signature | Purpose |
|--------|-----------|---------|
| `initContext` | `(vertices) => StraightSkeletonSolverContext` | Build a solver context with interior edges initialized. |
| `stepWithCapture` | `(vertices) => { snapshots, error, context, lastInputs }` | Run the algorithm step by step, capturing a `StepSnapshot` each time. |
| `collectCollisionEvents` | `(context) => LabelledCollisionEvent[]` | Gather the collision events pending in a context. |
| `interiorNodes` | `(graph) => PolygonNode[]` | Just the interior (skeleton) nodes. |
| `boundingBox` | `(vertices) => { minX, maxX, minY, maxY }` | Axis-aligned bounds of a vertex list. |
| `getAcceptedExteriorEdges` | `(…) => DiagnosticStepResult` | Which exterior edges the solver has finalized. |

`stepWithCapture` takes the **vertices**, not a context — it builds its own — and returns a result object rather than
a bare array:

```ts
import { stepWithCapture, AWKWARD_HEPTAGON } from '@proc-geo/test-fixtures';

const { snapshots, error, context } = stepWithCapture(AWKWARD_HEPTAGON);
```

`initContext` is the lower-level entry point, for when you want a context to inspect directly:

```ts
import { initContext, collectCollisionEvents, MOORHEN_PASSES } from '@proc-geo/test-fixtures';

const events = collectCollisionEvents(initContext(MOORHEN_PASSES));
```

## Notes

- `@proc-geo/core` is a regular dependency, so it installs alongside this package.
- Published as ESM + CJS with type declarations, like the rest of the set.
- Most consumers want this as a `devDependency` — it is test data, not runtime code. The one exception is
  [`@proc-geo/dashboard`](https://www.npmjs.com/package/@proc-geo/dashboard), which uses `ALL_TEST_POLYGONS` to
  populate its polygon picker.

## License

MIT © Will Buchanan
