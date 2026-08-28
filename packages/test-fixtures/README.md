# @proc-geo/test-fixtures

Polygon fixtures and solver test helpers for [`@proc-geo/core`](https://www.npmjs.com/package/@proc-geo/core).

These are not decorative sample shapes. Most of them are cases that broke the straight-skeleton solver at some point —
kept, named, and pinned so that regressions surface immediately. If you are benchmarking a skeleton implementation or
writing your own, this is a ready-made adversarial corpus.

```bash
npm install --save-dev @proc-geo/test-fixtures
```

## The polygon lists

There are **two rosters and 59 named polygons**, ranging from a triangle to a 48-gon.

| Export | Contents | What a sweep over it should assert |
|--------|----------|------------------------------------|
| `CLEAN_TEST_POLYGONS` | 53 clean fixtures | Every entry solves, tiles and subdivides. |
| `KNOWN_DEFECT_POLYGONS` | 6 fixtures with a measured defect | Each entry's **pinned signature**, exactly. |
| `FULL_CORPUS` | the two concatenated, clean first | Whichever bar applies per entry. |

All three share the `NamedTestPolygon` shape, so a sweep can move between them without changing how it iterates.

> **There is no `ALL_TEST_POLYGONS`.** Earlier versions of this package exported the clean roster under that name.
> It was removed rather than aliased, so an import of it is a build error and never a quiet change of meaning.
> Replace it with `CLEAN_TEST_POLYGONS` for the old behaviour, or `FULL_CORPUS` to include the defect fixtures.

```ts
import { CLEAN_TEST_POLYGONS } from '@proc-geo/test-fixtures';
import { runAlgorithmV5 } from '@proc-geo/core';

for (const { name, vertices } of CLEAN_TEST_POLYGONS) {
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
| Basic shapes | `TRIANGLE`, `SQUARE`, `RECTANGLE`, `PENTAGON_HOUSE`, `DEFAULT_PENTAGON`, `SYMMETRICAL_OCTAGON` |
| Known-awkward | `AWKWARD_HEXAGON`, `AWKWARD_HEPTAGON`, `IMPOSSIBLE_OCTAGON`, `BROKEN_POLYGON`, `CRAZY_POLYGON` |
| Duck / moorhen | `DUCK_OCTAGON_FAILS`, `DUCK_OCTAGON_PASSES`, `MOORHEN_FAILS`, `MOORHEN_PASSES` |
| Double reflex spaceship | `FAILURE_CASE_DOUBLE_SPACESHIP_V2`, `PREVIOUSLY_FAILURE_CASE_DOUBLE_REFLEX_SPACESHIP`, `SUCCESS_CASE_DOUBLE_REFLEX_SPACESHIP` |
| Isthmus convergence | `CONVERGENCE_TOWARDS_ISTHMUS_SUCCEEDS`, `DIVERGENCE_TOWARDS_ISTHMUS_FAILS_NODE_7`, `DIVERGENCE_TOWARDS_ISTHMUS_FAILS_NODE_4` |
| Long octagon | `LONG_OCTAGON`, `FAILING_LONG_OCTAGON`, `FAILING_GENTLE_REFLEX_PENTAGON` |
| Mid-case brackets | `SUCCESS_OUTER`, `FAILURE_START_CASE`, `FAILURE_END_CASE`, `SUCCESS_INNER` |
| Standalone edge cases | `MissingEdgeAtNode11`, `CAUSES_MISSING_SECONDARY_EDGE`, `WACKY_OCTAGON`, `NOT_SOLVABLE`, `WRONG_COLLISION_AT_NODE_10`, `PREMATURE_SPLIT_OCTAGON`, `LONG_SIDE_ACUTE_VERTEX`, `INCORRECT_ORDERING_E38_E30_COLLISION` |
| Premature bisector split | `PREMATURE_BISECTOR_SPLIT_FAILS`, `PREMATURE_BISECTOR_SPLIT_PASSES` |
| Rectilinear | `CROSS`, `T_SHAPE`, `GOLF_CART` |
| Short-edge promontory | `SHORT_EDGE_PROMONTORY` |
| Near-regular controls | `NEAR_REGULAR_CIRCLE_16`, `NEAR_REGULAR_CIRCLE_32`, `NEAR_REGULAR_PEANUT_32`, `NEAR_REGULAR_ELLIPSE_16`, `NEAR_REGULAR_ELLIPSE_32` |
| Deformed peanut waists | `SLIGHTLY_DEFORMED_PEANUT_1`, `SLIGHTLY_DEFORMED_PEANUT_2` |

The `(fails)` / `(passes)` naming is deliberate and worth understanding: these are **near-identical pairs** that
bracket a failure. `MOORHEN_FAILS` and `MOORHEN_PASSES` differ by a small perturbation, as do the isthmus and mid-case
groups. They isolate exactly which geometric configuration tips the solver over, which makes them far more useful for
debugging than either shape alone.

> The names record history, not current status. A fixture called `..._FAILS` describes the case that *once* failed —
> it is not a claim that the current solver fails it. The core test suite is the source of truth for what passes today.

### `KNOWN_DEFECT_POLYGONS`

Fixtures with a defect that has been measured and written down. They are **enrolled, not excluded**: the sweeps in
`@proc-geo/core` run the full corpus and hold each of these to its own recorded signature, so a fixture doing better
than its pin breaks the suite as loudly as one doing worse. The cure is promotion into `CLEAN_TEST_POLYGONS`, never a
softened number.

| Fixture | Defect |
|---------|--------|
| `OFF_EDGE_JITTER_L_SEED_15838` | Solves silently wrong: 5 failed regions under the recursive driver, plus causality violations. |
| `OFF_EDGE_JITTER_L_SEED_55433` | Solves silently wrong: 10 failed regions, two edges terminating behind their source. |
| `OFF_EDGE_JITTER_PLUS_SEED_7919` | Does not solve — the one fixture in either roster that reports `complete: false`. |
| `OFF_EDGE_JITTER_L_SEED_55433_K4` | Solves silently wrong: 14 failed regions, the heaviest driver-level residue. |
| `NEAR_REGULAR_CIRCLE_48` | Clean where it sits; fails at three large translations. |
| `NEAR_REGULAR_ROSETTE5_40` | Clean where it sits; fails at ten large translations. |

Each fixture file states its own case, and the pins live beside the sweeps that measure them.

### Exported but in neither roster

Study cases, exported individually for focused tests. All of them solve cleanly today; they stay out of the rosters
as historical specimens for the bugs they are named after, rather than as shapes worth regression-sweeping:
`CRAB_TEST_CASE`, `CRAB_TEST_CASE_2`, `CRAB_TEST_CASE_3`, `LOSES_WHEN_REFLEX_IS_FIRST_COLLISION`,
`PASSES_WITH_SOFTER_REFLEX`, `PASSES_WHEN_REFLEX_HITS_ADJACENT_BISECTOR`, `SIMPLE_REFLEX`. `WHY_NO_COLLISION` is a
recorded solver graph rather than a polygon.

`SYMMETRICAL_OCTAGON` was among them until 2026-08-28. It sat out on a "does not terminate in fuzz test" note that
re-measurement found dead, and it is now an ordinary member of `CLEAN_TEST_POLYGONS`.

`COLLINEAR_DUMBBELL` left `KNOWN_DEFECT_POLYGONS` on 2026-08-28, the way that list says a fixture leaves it: by being
fixed. It reported success with empty diagnostics while its strips overlapped by a tenth of its area, because the
midline of its bar was born at each end pointing OUT of the bar and the shaft carried no skeleton at all. It now
tiles exactly, and `ASYMMETRIC_DUMBBELL` and `THREE_GLOBE_CHAIN` joined the clean roster beside it as the other two
shapes of that class.

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
  [`@proc-geo/dashboard`](https://www.npmjs.com/package/@proc-geo/dashboard), which uses `FULL_CORPUS` to populate
  its polygon picker — defect fixtures included, marked, so they can be loaded and inspected.

## License

MIT © Will Buchanan
