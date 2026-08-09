# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## General Protocol

1. When carrying out work split into **Phases**, _always_ pause at the end of a **Phase**, and await confirmation for
   beginning the next **Phase**

## Monorepo Structure

This is a **pnpm workspaces** monorepo with four packages:

```
procedural-geometry-ideas/
├── packages/
│   ├── core/            # @proc-geo/core — standalone geometry solver library
│   ├── test-fixtures/   # @proc-geo/test-fixtures — polygon fixtures for testing
│   └── dashboard/       # @proc-geo/dashboard — React component library
├── apps/
│   └── demo/            # @proc-geo/demo — Next.js demo app
├── docs/notes/          # Design notes and algorithm documentation
├── pnpm-workspace.yaml
├── tsconfig.base.json   # Shared TS compiler options
└── CLAUDE.md
```

| Package                   | Description                                                                                     | Publishable  |
|---------------------------|-------------------------------------------------------------------------------------------------|--------------|
| `@proc-geo/core`          | Pure TypeScript geometry library (straight skeleton, random polygon generation). No React deps. | Yes          |
| `@proc-geo/test-fixtures` | 35 named polygon fixtures + test helpers. Optional for consumers.                               | Yes          |
| `@proc-geo/dashboard`     | React components for exploring geometry algorithms (Mantine, Konva, Zustand).                   | Yes          |
| `@proc-geo/demo`          | Example Next.js app showcasing the integration.                                                 | No (private) |

**Dependency graph:** `demo -> dashboard -> core`, `demo -> test-fixtures -> core`, `core <-(devDep) test-fixtures`

## Commands

### pnpm in Git Bash (Windows)

The `pnpm` shell script in Git Bash is broken on this machine -- it chains through a stub `node` shim (
`C:\Users\thele\AppData\Roaming\npm\node_modules\node\bin\node`) that is intentionally blank, causing a "command not
found" error.

**Use this instead for all pnpm commands:**

```bash
node ~/AppData/Roaming/npm/node_modules/pnpm/bin/pnpm.cjs <args>
```

Root cause: `pnpm` -> `~/AppData/Roaming/npm/node` (shim) -> `node_modules/node/bin/node` (blank file). The real Node.js
is at `/c/Program Files/nodejs/node` (v22.12.0) but isn't used by the shim.

### Workspace Commands

```bash
# Root convenience scripts
pnpm dev       # Start demo dev server at http://localhost:3000
pnpm build     # Build all packages in order (core -> test-fixtures -> dashboard -> demo)
pnpm test      # Run all tests (currently in @proc-geo/core)
pnpm lint      # Lint the demo app

# Per-package commands
pnpm --filter @proc-geo/core build
pnpm --filter @proc-geo/core test
pnpm --filter @proc-geo/core test -- --testPathPatterns=core-functions
pnpm --filter @proc-geo/test-fixtures build
pnpm --filter @proc-geo/dashboard build
pnpm --filter @proc-geo/demo dev
pnpm --filter @proc-geo/demo build
```

### Testing

Tests live in `packages/core/tests/` as `*.test.ts`. Test configuration is in `packages/core/jest.config.cjs` (uses
`ts-jest` with `node` environment). Jest `moduleNameMapper` resolves `@proc-geo/core` and `@proc-geo/test-fixtures`
to source for fast iteration without rebuilding.

## Architecture

### `@proc-geo/core` (`packages/core/`)

Pure TypeScript library for computational geometry algorithms. No React or browser dependencies. Runtime dep:
`loglevel`.

**Key directories:**

- `src/straight-skeleton/` -- Straight skeleton algorithm implementation
- `src/random-polygon/` -- Random polygon generator (`generator.ts`, `geometry-helpers.ts`, `types.ts`)
- `tests/straight-skeleton/` -- 16 test files (regression, fuzz, debug)
- `tests/random-polygon/` -- 2 test files

**Build:** tsup -> ESM + CJS + `.d.ts`. Barrel export: `src/index.ts`.

#### Straight Skeleton Algorithm

The algorithm computes a [straight skeleton](https://en.wikipedia.org/wiki/Straight_skeleton) -- the locus of points
traced by polygon vertices as edges shrink inward at equal speed.

**Algorithm versions:** The current algorithm is **V5** (`runAlgorithmV5` in `algorithm-termination-cases.ts`). Previous versions are now consigned to the git history. New work should target V5.

**Core infrastructure (shared by all versions):**

| File                       | Role                                                                                                                                                                        |
|----------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `types.ts`                 | All TypeScript interfaces (`Vector2`, `PolygonNode`, `PolygonEdge`, `InteriorEdge`, `CollisionEvent`, `AlgorithmStepInput`/`Output`, `StraightSkeletonSolverContext`, etc.) |
| `constants.ts`             | Epsilon tolerance for floating-point comparisons                                                                                                                            |
| `core-functions.ts`        | Vector math (add, subtract, scale, normalize, cross/dot product), angle bisector construction, `fp_compare`/`areEqual`                                                      |
| `solver-context.ts`        | `makeStraightSkeletonSolverContext` -- builds the solver context with graph, accepted-edges tracking, edge lookup methods                                                   |
| `graph-helpers.ts`         | Graph construction (`initBoundingPolygon`), node creation                                                                                                                   |
| `algorithm-helpers.ts`     | Bisection edge creation, `initInteriorEdges`, exterior edge acceptance, interior loop detection                                                                             |
| `collision-helpers.ts`     | Collision event generation (`collideEdges`, `collideInteriorEdges`), shared-parent checks                                                                                   |
| `collision-handling.ts`    | `handleCollisionEvent` -- processes a collision by finalizing nodes and returning proposed bisection parameters                                                             |
| `intersection-edges.ts`    | Ray-ray intersection (`intersectRays`)                                                                                                                                      |
| `generate-split-event.ts`  | Split event generation for reflex vertices                                                                                                                                  |
| `polygon-decomposition.ts` | Pre-pass decomposition for overlapping/crossing polygons                                                                                                                    |
| `graph-merge.ts`           | Post-merge of decomposed polygon results                                                                                                                                    |

**V5 algorithm files:**

| File                             | Role                                                                                                                                     |
|----------------------------------|------------------------------------------------------------------------------------------------------------------------------------------|
| `algorithm-termination-cases.ts` | **V5 entry point** (`runAlgorithmV5`), `StepAlgorithm`, base cases for 2-edge pairs and 3-edge triangles                                 |
| `algorithm-complex-cases.ts`     | `handleInteriorEdges` -- generic handler for >3 interior edges: generates collisions, handles events, partitions into child sub-polygons |

**V5 algorithm flow:**

1. **Init** -- Build solver context via `makeStraightSkeletonSolverContext`; create bisection interior edges at each
   vertex (`initInteriorEdges`). Start with a single `AlgorithmStepInput` containing all interior edge IDs.
2. **Step** (`StepAlgorithm`) -- For each input, dispatch by edge count:
    - **2 edges** -> `handleInteriorEdgePair` (head-on or co-linear collapse, base case)
    - **3 edges** -> `handleInteriorEdgeTriangle` (find intersection point, base case)
    - **>3 edges** -> `handleInteriorEdges` (generate all collision events, process the nearest offset layer, handle
      collapse vs. partition events, and emit child `AlgorithmStepInput`s for resulting sub-polygons)
3. **After each step** -- Try to accept exterior edges (`tryToAcceptExteriorEdge`).
4. **Termination** -- No more child steps are produced; all exterior edges are accepted.

**Data model:** The graph separates *exterior edges* (original polygon edges, never move) from *interior edges* (
bisector rays that evolve during computation). `acceptedEdges` is a boolean array indexed by exterior edge ID tracking
which edges are finalized. Interior edge IDs start at `graph.numExteriorNodes`; the solver context provides lookup
methods for converting between IDs and edge data.

### `@proc-geo/test-fixtures` (`packages/test-fixtures/`)

37 named polygon fixtures (`ALL_TEST_POLYGONS`) exported from `src/index.ts`, plus `test-helpers.ts` and
`test-constants.ts`. Further polygons are exported individually but excluded from that list -- several suites
sweep `ALL_TEST_POLYGONS` asserting that every entry solves completely, so a known-failing fixture must stay
out of it. Depends on
`@proc-geo/core`. Consumers can install this package for benchmarking or testing against known polygon shapes.

### `@proc-geo/dashboard` (`packages/dashboard/`)

React component library for exploring geometry algorithms. Depends on `@proc-geo/core` and `@proc-geo/test-fixtures`.

**Key UI dependencies (peer deps):** React 19, Mantine v8, Konva/react-konva, Zustand + Immer.

| Directory         | Contents                                                                                                          |
|-------------------|-------------------------------------------------------------------------------------------------------------------|
| `src/components/` | `PolygonCanvas` (interactive Konva canvas), `RandomPolygonPanel`, `ControlsPanel`, `AlgorithmPanel`, `DebugPanel` |
| `src/hooks/`      | `useSkeletonAnimation` (animation/stepping state machine), `useCollisionSweep` (sweep line computation)           |
| `src/stores/`     | `usePolygonStore` (polygon vertex CRUD), `useRandomPolygonStore` (random polygon generator params)                |
| `src/types.ts`    | `DebugDisplayOptions`, `CollisionSweepLine`                                                                       |

**Build:** tsup -> ESM + CJS + `.d.ts`. Barrel export: `src/index.ts`.

### `@proc-geo/demo` (`apps/demo/`)

Next.js App Router application. Thin shell (~120 lines in `page.tsx`) that composes dashboard components. Uses
`transpilePackages` in `next.config.ts` to consume workspace packages.
