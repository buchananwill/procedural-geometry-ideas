# Procedural Geometry

A TypeScript monorepo of procedural geometry algorithms and the interactive tools for exploring them.

The algorithms live in a dependency-free core library; the visual explorers are a separate React component package, so
you can take the maths without the UI — or drop a ready-made explorer into an existing site.

## Packages

| Package | npm | Description |
|---------|-----|-------------|
| [`@proc-geo/core`](./packages/core) | [![npm](https://img.shields.io/npm/v/@proc-geo/core.svg)](https://www.npmjs.com/package/@proc-geo/core) | The algorithms. Pure TypeScript, no React or browser APIs. |
| [`@proc-geo/test-fixtures`](./packages/test-fixtures) | [![npm](https://img.shields.io/npm/v/@proc-geo/test-fixtures.svg)](https://www.npmjs.com/package/@proc-geo/test-fixtures) | 35 named polygon fixtures and solver test helpers, for regression testing and benchmarking. |
| [`@proc-geo/dashboard`](./packages/dashboard) | [![npm](https://img.shields.io/npm/v/@proc-geo/dashboard.svg)](https://www.npmjs.com/package/@proc-geo/dashboard) | React components (Mantine + Konva) that visualise every algorithm. |
| [`@proc-geo/demo`](./apps/demo) | — | Next.js app wiring the components together. Not published. |

## What's in here

### Straight skeleton

The [straight skeleton](https://en.wikipedia.org/wiki/Straight_skeleton) of a polygon — the locus traced by its
vertices as the edges move inward at equal speed. Handles reflex vertices and split events, and decomposes
self-intersecting input automatically. Underpins roof generation, straight-line offsetting, and medial-axis
approximation.

### Pen stroke → spline

A four-stage pipeline turning raw pointer samples into a fitted cubic Bézier spline: smoothing (moving average,
Gaussian, [1€ filter](https://gery.casiez.net/1euro/), Chaikin) → simplification (RDP, resampling) → corner detection →
fitting (Schneider least-squares, or Catmull-Rom for exact interpolation). Every stage has a pass-through variant, so
you can isolate any one of them, and the result carries an index-matched correspondence back to the raw input for
morphing between the two.

### D0L systems

Deterministic context-free [L-systems](https://en.wikipedia.org/wiki/L-system) with a turtle-graphics interpreter.
User-defined letters rewrite over generations and resolve to turtle keywords, with provenance tracked so output can be
styled by the rule that produced it.

### Random polygon generation

Parameterised random simple polygons — tunable edge-length and turn-angle distributions, with self-intersection
rejection and retry.

## Using the library

```bash
npm install @proc-geo/core
```

```ts
import { runAlgorithmV5, runStrokePipeline, DEFAULT_STROKE_PIPELINE_CONFIG } from '@proc-geo/core';
```

See [the core README](./packages/core/README.md) for the full API, and
[the dashboard README](./packages/dashboard/README.md) for embedding the interactive explorers — including the
peer-dependency list and the client-only rendering requirements for the Konva canvases.

## Development

A [pnpm workspaces](https://pnpm.io/workspaces) monorepo. Requires pnpm and Node 20+.

```bash
pnpm install
pnpm dev     # demo app at http://localhost:3000
pnpm build   # build all packages in dependency order
pnpm test    # run the test suite
pnpm lint
```

Per-package commands use pnpm filters:

```bash
pnpm --filter @proc-geo/core test
pnpm --filter @proc-geo/dashboard build
```

### Layout

```
packages/core/            # algorithms — the published library
packages/test-fixtures/   # polygon fixtures
packages/dashboard/       # React components
apps/demo/                # Next.js demo app
docs/notes/               # design notes and algorithm write-ups
```

**Dependency graph:** `demo → dashboard → core`, `demo → test-fixtures → core`

Tests live in `packages/core/tests/` and run under Jest via `ts-jest`. Jest resolves the workspace packages to source,
so tests pick up changes without a rebuild.

Design notes and algorithm write-ups are in [`docs/notes/`](./docs/notes) — including the
[algorithm overview](./docs/notes/algorithm-overview.md) and the
[pen-stroke design points](./docs/notes/pen-stroke-design-points.md).

## License

MIT © Will Buchanan — see [LICENSE](./LICENSE).
