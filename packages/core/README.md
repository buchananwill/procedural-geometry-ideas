# @proc-geo/core

Procedural geometry algorithms in pure TypeScript. No React, no browser APIs, no canvas — just functions over plain
`{ x, y }` data, so the same code runs in Node, a worker, or the browser.

```bash
npm install @proc-geo/core
```

Ships ESM + CJS with bundled type declarations. The only runtime dependency is
[`loglevel`](https://www.npmjs.com/package/loglevel).

## Modules

| Module              | What it does                                                                        |
|---------------------|-------------------------------------------------------------------------------------|
| **Straight skeleton** | Computes the straight skeleton of a simple polygon, with or without holes, including reflex/split events. |
| **Random polygon**    | Generates random non-self-intersecting polygons from tunable parameters.           |
| **Stroke → spline**   | Turns raw pointer-capture samples into a fitted cubic Bézier spline.               |
| **D0L system**        | Deterministic context-free L-systems with turtle interpretation.                   |

Everything is exported from the package root:

```ts
import { solveSkeleton, runStrokePipeline, generateRandomPolygon } from '@proc-geo/core';
```

---

## Straight skeleton

The [straight skeleton](https://en.wikipedia.org/wiki/Straight_skeleton) is the locus traced by a polygon's vertices as
its edges move inward at equal speed. It underpins roof generation, straight-line polygon offsetting, and medial-axis
approximation.

```ts
import { solveSkeleton } from '@proc-geo/core';
import type { Vector2 } from '@proc-geo/core';

const polygon: Vector2[] = [
  { x: 0, y: 0 },
  { x: 0, y: 120 },
  { x: 200, y: 120 },
  { x: 200, y: 0 },
];

const result = solveSkeleton(polygon);
result.complete;    // true when the skeleton is fully resolved and can be trusted
result.diagnostics; // what the boundary stage did to the input, and anything that went wrong
result.graph;       // nodes + edges of the skeleton
```

For this rectangle the graph has 6 nodes and 10 edges: the 4 original corners plus the two ridge nodes where the
bisectors meet. The solve is `complete` with no diagnostics.

> **Winding is normalised for you.** By default the outline is wound clockwise and every hole counter-clockwise
> before solving, and a reversal is reported as a `winding-normalised` diagnostic, which does not make the result
> incomplete. Pass `normaliseWinding: false` to say your winding is already right: a counter-clockwise single loop then
> yields an unresolved skeleton, and a holed input with a mis-wound loop is refused by a throw.
>
> Note that "clockwise" is measured in the coordinate system you supply. Screen coordinates put y downward, so a
> polygon that looks clockwise on screen is counter-clockwise numerically. `isClockwise` is exported if you want to
> check.

`solveSkeleton(vertices, options?)` takes these options (`SolveSkeletonOptions`), all optional:

| Option             | Meaning                                                                                              |
|--------------------|------------------------------------------------------------------------------------------------------|
| `holes`            | The outline's holes, each a `SkeletonHole`: `{ vertices, weights? }`. Omitted or empty is a single loop. |
| `weights`          | The outline's per-edge wavefront speeds, one per vertex: `weights[i]` is the edge from vertex `i` to `i + 1`. Omitted is all ones. |
| `normaliseWinding` | Wind the loops before solving, as above. Defaults to `true`.                                         |
| `perceptualFloor`  | The smallest separation the client can render, in unit space (a fraction of the polygon's extent). Defaults to `SKELETON_NOISE_FLOOR`. |
| `noiseFloor`       | The canonicalisation bar, in unit space. Defaults to `perceptualFloor`; set by the recursion driver, and best left alone. |

It returns a `SkeletonSolveResult`:

| Field           | Meaning                                                                                                 |
|-----------------|---------------------------------------------------------------------------------------------------------|
| `graph`         | The `StraightSkeletonGraph`: nodes, exterior and interior edges, and `loops`, the loop table.           |
| `context`       | The `StraightSkeletonSolverContext`, with the solver's edge-lookup helpers, or `null` when the input self-intersected and was decomposed and merged. |
| `complete`      | `true` when no blocking diagnostic was raised and the graph has at least one interior edge.            |
| `diagnostics`   | `SkeletonDiagnostic[]`, each a `kind` and a `detail` line. `isBlockingDiagnosticKind` says which kinds make a result incomplete. |
| `normalisation` | The unit-extent transform the solve ran in, already undone on `graph` and `context`.                    |
| `weights`       | The per-exterior-edge weights the solve ran on, normalised to a minimum of `1`, every loop's concatenated. |
| `loopMaps`      | Per loop, the outline first and then each hole, where each caller vertex and edge landed in the graph; `null` exactly when `context` is. |

Exterior edges (the original boundary) and interior edges (the bisector rays generated during the run) are tracked
separately; interior edge IDs begin at `graph.numExteriorNodes`. Self-intersecting single-loop input is decomposed
automatically (`decomposePolygon`), the sub-results merged (`mergeSkeletonGraphs`), and a `self-intersecting`
diagnostic says so.

`solveSkeleton` **throws** a `SkeletonInputRefusal`, whose `kind` names the rule broken, when the input cannot be
solved at all: a loop of fewer than three vertices or with a non-finite coordinate, a weight refused at the door, a
mis-wound loop under `normaliseWinding: false`, or loops that cross, touch or nest wrongly.

### Holes

An outline may carry holes, passed on `options.holes`. Each hole may be wound either way, and may carry its own
`weights`:

```ts
const outline: Vector2[] = [
  { x: 0, y: 0 },
  { x: 0, y: 10 },
  { x: 10, y: 10 },
  { x: 10, y: 0 },
];
const courtyard: Vector2[] = [
  { x: 4, y: 4 },
  { x: 6, y: 4 },
  { x: 6, y: 6 },
  { x: 4, y: 6 },
];

const holed = solveSkeleton(outline, { holes: [{ vertices: courtyard }] });
holed.loopMaps; // per loop (outline first, then each hole): caller vertex -> exterior node
```

This concentric square solves `complete`, with the ridge square (2,2)–(8,8): 4 interior nodes and 16 interior edges.
A holed solve can be refused by name where events of several rings coincide in a form the solver does not settle; the
refusal is a `simultaneous-across-rings` or `multi-ring-step-refused` diagnostic, and `complete` is then `false`.

### Stepping through a run

For visualization or debugging, `solveSkeletonStepped` runs the same solve, holes and options included, and returns a
snapshot of the graph after initialisation and after every step, each in the caller's coordinates. It throws exactly
what `solveSkeleton` throws:

```ts
import { solveSkeletonStepped } from '@proc-geo/core';

const { snapshots, result: stepped, firstFailedSnapshot } = solveSkeletonStepped(polygon);
```

`stepped` is what `solveSkeleton` returns, and `firstFailedSnapshot` is the snapshot after the first step that
recorded a failure, or `null`.

The older entries `runAlgorithmV5` and `runAlgorithmV5Stepped` are **deprecated**: they take no holes and have no
diagnostics channel. Use `solveSkeleton` and `solveSkeletonStepped`.

### Logging

The solver logs through `loglevel` under the `skeleton:*` namespaces, defaulting to `warn`:

```ts
import { setSkeletonLogLevel } from '@proc-geo/core';

setSkeletonLogLevel('debug'); // 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'silent'
```

---

## Random polygon

Generates a random simple polygon by walking edges with randomized lengths and turn angles, retrying until the result
is non-self-intersecting.

```ts
import { generateRandomPolygon, DEFAULT_PARAMS } from '@proc-geo/core';

const polygon = generateRandomPolygon({
  ...DEFAULT_PARAMS,
  maxEdges: 12,
});
```

`RandomPolygonParams` takes `edgeLength` and `angleDelta` as `{ min, max, variance }` ranges plus a `maxEdges` cap.
`variance` blends between a uniform distribution (`0`) and one peaked at the range's center (`1`). The optional second
and third arguments set the start position and the retry limit (default `10`); if every attempt fails, a small triangle
is returned rather than throwing.

Pair it with `@proc-geo/test-fixtures` for 59 named polygons covering known tricky cases, split into a clean roster
and a known-defect one.

---

## Stroke → spline

A four-stage pipeline that converts raw pointer samples into a fitted cubic Bézier spline. Each stage is independently
configurable and every stage has a `pass-through` variant, so you can isolate one stage's effect.

```ts
import { runStrokePipeline, DEFAULT_STROKE_PIPELINE_CONFIG } from '@proc-geo/core';
import type { StrokePoint } from '@proc-geo/core';

// Captured from pointermove: t is the event timestamp in ms.
const raw: StrokePoint[] = [
  { x: 10, y: 10, t: 0 },
  { x: 24, y: 31, t: 16 },
  // …
];

const result = runStrokePipeline(raw, DEFAULT_STROKE_PIPELINE_CONFIG);
result.fit?.segments;  // CubicBezier[]
result.fit?.maxError;  // worst deviation from the input points
```

### Stages and variants

| Stage             | Variants                                                        |
|-------------------|-----------------------------------------------------------------|
| `smoothing`       | `pass-through`, `moving-average`, `gaussian`, `one-euro`, `chaikin` |
| `simplification`  | `pass-through`, `rdp`, `resample`                               |
| `cornerDetection` | `pass-through`, `angle-threshold`                               |
| `fitting`         | `pass-through`, `schneider`, `catmull-rom`                      |
| `closure`         | `pass-through`, `distance-threshold` (optional; see *Closed loops*) |

Each variant is a discriminated union member carrying its own parameters, so the type checker enforces that
`{ variant: 'gaussian' }` supplies `sigma` and nothing else:

```ts
const result = runStrokePipeline(raw, {
  smoothing: { variant: 'one-euro', minCutoff: 1, beta: 0.005 },
  simplification: { variant: 'rdp', epsilon: 2 },
  cornerDetection: { variant: 'angle-threshold', thresholdDeg: 60, span: 4 },
  fitting: { variant: 'schneider', errorTolerance: 4 },
});
```

`SMOOTHING_VARIANT_DEFAULTS` and its three siblings provide a sensible starting config per variant — useful for
building a UI where changing a dropdown swaps in fresh parameters.

Notes on the individual stages:

- **`one-euro`** is the [1€ filter](https://gery.casiez.net/1euro/) (Casiez et al. 2012): velocity-adaptive, so it
  smooths hard when the pen is slow and lags little when it is fast. It reads the `t` timestamps and, being causal,
  does not pin the final point. The kernel smoothers (`moving-average`, `gaussian`) shrink their window at the ends
  and so pin both endpoints exactly.
- **`schneider`** is Schneider's classic least-squares fitting with recursive subdivision, adding segments until
  `errorTolerance` is met. **`catmull-rom`** interpolates every input point exactly (zero error) — pick it when the
  curve must pass through the samples rather than approximate them.
- **Corner detection** feeds hard breakpoints into fitting. Sections between corners are fitted independently, so
  tangents are one-sided and the curve creases at a corner instead of rounding it off.

### Closed loops

`closure` decides whether the stroke is a loop rather than an open curve. It is an optional fifth config field, not a
stage — it produces no polyline of its own, it only changes how the ends of the chain are joined. Omitting it is
identical to `{ variant: 'pass-through' }`, which is what `DEFAULT_STROKE_PIPELINE_CONFIG` uses, so open-curve output
is untouched.

| Variant              | Behaviour                                                                              |
|----------------------|----------------------------------------------------------------------------------------|
| `pass-through`       | Always open.                                                                            |
| `distance-threshold` | Closed when the *raw* stroke's last sample is within `threshold` of its first (inclusive). |

```ts
const result = runStrokePipeline(raw, {
  ...DEFAULT_STROKE_PIPELINE_CONFIG,
  closure: { variant: 'distance-threshold', threshold: 20 },
});
result.closed;  // true when the stroke was interpreted as a loop
```

`CLOSURE_VARIANT_DEFAULTS` provides a starting config per variant, as for the four stages. `isStrokeClosed(raw, config)`
runs the detection on its own.

When `result.closed` is true:

- **The chain is a genuine loop.** The last segment's `p3` is *exactly* the first segment's `p0` — strict equality,
  not "within epsilon" — so a polygon consumer comparing with an absolute tolerance sees no sliver. The final point of
  `corners.points` is moved onto the first point (by at most `threshold`); the point count is unchanged, so the
  index-matched correspondence still applies.
- **The seam does not crease**, unless it is a corner. The fitters are given the points either side of the seam as
  virtual neighbours, so the end tangents are the two-sided direction across the join — the same construction used at
  an interior split. If the seam's own turn angle exceeds the `angle-threshold` detector's `thresholdDeg`, the crease
  is kept instead, exactly as at any other detected corner.

Detection reads the raw stroke, so it does not shift when you change smoothing or simplification. Strokes of fewer
than four samples are never closed — collapsing the seam would leave too few distinct points to bound a region.

**Known limitation.** Closure joins the ends; it does not wrap the *stages* around the seam. The smoothing window and
the simplification / corner-detection spans still shrink at the first and last points, so the samples nearest the seam
are smoothed less than the rest of the loop. On a clean radius-150 circle with `moving-average` `windowSize: 5`, the
interior is pulled in to radius 147.4 while the seam stays at 150 — a ~2.6-unit outward bump; `windowSize: 9` widens
that to ~8.4. The curve is still tangent-continuous across the seam, it just bulges slightly there. Wrapping the
stages' neighbourhoods is a separate change with its own tuning consequences.

### Correspondence and morphing

`result.correspondence` is index-matched to `raw`: entry `i` is where raw point `i` lands on the final curve. This
holds even when a stage changes the point count (`rdp`, `resample`, `chaikin`) — the pipeline falls back to
arc-length-fraction mapping in that case. It makes animating the cleanup a one-liner:

```ts
import { lerpStroke } from '@proc-geo/core';

const midway = lerpStroke(raw, result.correspondence, 0.5);
```

The intermediate stage outputs (`smoothed`, `simplified`, `corners`) are all returned too, so you can render the
pipeline stage by stage.

---

## D0L system

Deterministic, context-free Lindenmayer systems with a turtle-graphics interpreter. An alphabet of user-defined
*letters* rewrites over generations; each letter resolves to a sequence of the six turtle *keywords*
`F`, `+`, `-`, `[`, `]`, `f`.

```ts
import {
  compileDolSystem,
  generateDolSystem,
  interpretDolSystem,
} from '@proc-geo/core';

const system = compileDolSystem({
  alphabet: { A: ['F'], B: ['F'] },
  productions: { A: ['B', '[', '+', 'A', ']', '-', 'A'], B: ['B', 'B'] },
  axiom: ['A'],
  turtle: { stepLength: 10, angleDelta: 25, generationScaling: 0.9 },
  maxIterations: 8,
});

const generated = generateDolSystem(system, 5);
const { paths, bounds } = interpretDolSystem(generated, {
  stepLength: 10,
  angleDelta: 25,
  generationScaling: 0.9,
});
```

`compileDolSystem` validates the configuration and throws `DolSystemValidationError` — carrying an `errors` array of
`{ field, message }` — when it fails. Letters missing from `productions` receive an identity rule.

`generateDolSystem(system, generations, maxWordLength?, skipProvenance?)` accepts a word-length cap to bound runaway
growth. `interpretDolSystem` returns `paths` as an array of polylines — a new polyline starts after each `]` pop — plus
the overall `bounds`. Each `Segment` carries the `letter` it descended from, so output can be styled by which rule
produced it.

---

## Related packages

- **[`@proc-geo/test-fixtures`](https://www.npmjs.com/package/@proc-geo/test-fixtures)** — 59 named polygon fixtures
  in a clean and a known-defect roster, for regression testing and benchmarking.
- **[`@proc-geo/dashboard`](https://www.npmjs.com/package/@proc-geo/dashboard)** — React components (Mantine + Konva)
  for exploring all four modules interactively.

## License

MIT © Will Buchanan
