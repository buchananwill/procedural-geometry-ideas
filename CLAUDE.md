# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## General Protocol

1. When carrying out work split into **Phases**, _always_ pause at the end of a **Phase**, and await confirmation for beginning the next **Phase**  

## Commands

```bash
pnpm dev      # Start development server at http://localhost:3000
pnpm build    # Production build
pnpm lint     # Run ESLint
pnpm start    # Start production server
pnpm jest     # Run all tests
pnpm jest:watch  # Run tests in watch mode
```

### pnpm in Git Bash (Windows)

The `pnpm` shell script in Git Bash is broken on this machine — it chains through a stub `node` shim (
`C:\Users\thele\AppData\Roaming\npm\node_modules\node\bin\node`) that is intentionally blank, causing a "command not
found" error.

**Use this instead for all pnpm commands:**

```bash
node ~/AppData/Roaming/npm/node_modules/pnpm/bin/pnpm.cjs <args>
# e.g.
node ~/AppData/Roaming/npm/node_modules/pnpm/bin/pnpm.cjs jest
node ~/AppData/Roaming/npm/node_modules/pnpm/bin/pnpm.cjs jest -- --testPathPattern=algorithm-helpers
```

Root cause: `pnpm` → `~/AppData/Roaming/npm/node` (shim) → `node_modules/node/bin/node` (blank file). The real Node.js
is at `/c/Program Files/nodejs/node` (v22.12.0) but isn't used by the shim.

### Testing

Jest tests live alongside source files as `*.test.ts`. Test configuration is in `jest.config.cjs` (uses Next.js Jest
integration with jsdom environment and the `@/*` path alias). To run a single test file:

```bash
node ~/AppData/Roaming/npm/node_modules/pnpm/bin/pnpm.cjs jest -- --testPathPattern=core-functions
```

## Architecture

This is a Next.js + TypeScript web app for visualizing **computational geometry algorithms**, currently focused on the
**straight skeleton** algorithm.

**Path alias:** `@/*` maps to `./src/*`

**Key UI dependencies:** Mantine v8 (component library + PostCSS), Konva/react-konva (canvas), Zustand + Immer (state).

### Key Layers

- **`src/app/`** — Next.js App Router pages. `page.tsx` is the main UI with a polygon editor and algorithm panels.
- **`src/components/`** — `PolygonCanvas.tsx` (interactive Konva.js canvas with draggable vertices, click-on-edge
  insertion) and `RandomPolygonPanel.tsx` (UI for the random polygon generator).
- **`src/stores/`** — Zustand + Immer stores. `usePolygonStore.ts` (polygon vertex CRUD) and
  `useRandomPolygonStore.ts` (random polygon generator parameters).
- **`src/algorithms/straight-skeleton/`** — Core straight skeleton implementation (no React dependencies).
- **`src/algorithms/random-polygon/`** — Random polygon generator (`generator.ts`, `geometry-helpers.ts`).
- **`src/notes/`** — Markdown design notes documenting algorithm decisions and debugging sessions (e.g.
  `collision-handling.md`, `event-priority-rules.md`).

### Straight Skeleton Algorithm (`src/algorithms/straight-skeleton/`)

The algorithm computes a [straight skeleton](https://en.wikipedia.org/wiki/Straight_skeleton) — the locus of points
traced by polygon vertices as edges shrink inward at equal speed.

**Algorithm versions:** The current algorithm is **V5** (`runAlgorithmV5` in `algorithm-termination-cases.ts`). V1
(`algorithm.ts` + `algorithm-v1-helpers.ts`) is legacy and due for removal. V4 (`algorithm-v4.ts`) is an abandoned
approach. New work should target V5.

**Core infrastructure (shared by all versions):**

| File                      | Role                                                                                                                                                                             |
|---------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `types.ts`                | All TypeScript interfaces (`Vector2`, `PolygonNode`, `PolygonEdge`, `InteriorEdge`, `CollisionEvent`, `AlgorithmStepInput`/`Output`, `StraightSkeletonSolverContext`, etc.)      |
| `constants.ts`            | Epsilon tolerance for floating-point comparisons                                                                                                                                 |
| `core-functions.ts`       | Vector math (add, subtract, scale, normalize, cross/dot product), angle bisector construction, `fp_compare`/`areEqual`                                                           |
| `solver-context.ts`       | `makeStraightSkeletonSolverContext` — builds the solver context with graph, accepted-edges tracking, edge lookup methods (`getInteriorWithId`, `getEdgeWithId`, `findOrAddNode`) |
| `graph-helpers.ts`        | Graph construction (`initBoundingPolygon`), node creation                                                                                                                        |
| `algorithm-helpers.ts`    | Bisection edge creation (`createBisectionInteriorEdge`, `bisectWithParams`), `initInteriorEdges`, exterior edge acceptance (`tryToAcceptExteriorEdge`), interior loop detection  |
| `collision-helpers.ts`    | Collision event generation (`collideEdges`, `collideInteriorEdges`), shared-parent checks                                                                                        |
| `collision-handling.ts`   | `handleCollisionEvent` — processes a collision by finalizing nodes and returning proposed bisection parameters                                                                   |
| `intersection-edges.ts`   | Ray-ray intersection (`intersectRays`)                                                                                                                                           |
| `generate-split-event.ts` | Split event generation for reflex vertices                                                                                                                                       |

**V5 algorithm files:**

| File                             | Role                                                                                                                                    |
|----------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------|
| `algorithm-termination-cases.ts` | **V5 entry point** (`runAlgorithmV5`), `StepAlgorithm`, base cases for 2-edge pairs and 3-edge triangles                                |
| `algorithm-complex-cases.ts`     | `handleInteriorEdges` — generic handler for >3 interior edges: generates collisions, handles events, partitions into child sub-polygons |

**V5 algorithm flow:**

1. **Init** — Build solver context via `makeStraightSkeletonSolverContext`; create bisection interior edges at each
   vertex (`initInteriorEdges`). Start with a single `AlgorithmStepInput` containing all interior edge IDs.
2. **Step** (`StepAlgorithm`) — For each input, dispatch by edge count:
    - **2 edges** → `handleInteriorEdgePair` (head-on or co-linear collapse, base case)
    - **3 edges** → `handleInteriorEdgeTriangle` (find intersection point, base case)
    - **>3 edges** → `handleInteriorEdges` (generate all collision events, process the nearest offset layer, handle
      collapse vs. partition events, and emit child `AlgorithmStepInput`s for resulting sub-polygons)
3. **After each step** — Try to accept exterior edges (`tryToAcceptExteriorEdge`).
4. **Termination** — No more child steps are produced; all exterior edges are accepted.

**Data model:** The graph separates *exterior edges* (original polygon edges, never move) from *interior edges* (
bisector rays that evolve during computation). `acceptedEdges` is a boolean array indexed by exterior edge ID tracking
which edges are finalized. Interior edge IDs start at `graph.numExteriorNodes`; the solver context provides lookup
methods for converting between IDs and edge data.

**Test organization:** `test-cases/` contains named polygon fixtures (exported from `test-cases/index.ts`) used across
multiple test files. Test files include regression tests, fuzz tests (`fuzz-ellipse.test.ts`), and debug-specific tests
for tricky polygon configurations.
