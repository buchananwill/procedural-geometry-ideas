# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

This is a Next.js + TypeScript web app for visualizing **computational geometry algorithms**, currently focused on the *
*straight skeleton** algorithm.

**Path alias:** `@/*` maps to `./src/*`

**Key UI dependencies:** Mantine v8 (component library + PostCSS), Konva/react-konva (canvas), Zustand + Immer (state).

### Key Layers

- **`src/app/`** — Next.js App Router pages. `page.tsx` is the main UI with a polygon editor and placeholder panels for
  algorithm controls/output.
- **`src/components/PolygonCanvas.tsx`** — Interactive Konva.js canvas. Handles draggable vertices, click-on-edge to
  insert vertices, and visual selection feedback.
- **`src/stores/usePolygonStore.ts`** — Zustand + Immer store. Single source of truth for polygon vertex data (add,
  move, remove, reset).
- **`src/algorithms/straight-skeleton/`** — Core algorithm implementation (no React dependencies).

### Straight Skeleton Algorithm (`src/algorithms/straight-skeleton/`)

The algorithm computes a [straight skeleton](https://en.wikipedia.org/wiki/Straight_skeleton) — the locus of points
traced by polygon vertices as edges shrink inward at equal speed.

**Files:**
| File | Role |
|---|---|
| `types.ts` | All TypeScript interfaces: `Vector2`, `PolygonNode`, `PolygonEdge`, `InteriorEdge`,
`StraightSkeletonGraph`, `HeapInteriorEdge`, `StraightSkeletonSolverContext` |
| `constants.ts` | Epsilon tolerance for floating-point comparisons |
| `core-functions.ts` | Vector math (add, subtract, scale, normalize), angle bisector construction, graph node/edge
primitives |
| `algorithm-helpers.ts` | Ray-ray intersection (`unitsToIntersection`), bisection edge creation (`addBisectionEdge`),
solver context initialization (`initStraightSkeletonSolverContext`), interior loop detection (`hasInteriorLoop`), node
finalization |
| `algorithm.ts` | Public entry point: `computeStraightSkeleton` (main event loop) |

**Algorithm flow:**

1. **Init** — Build graph from polygon vertices; compute angle bisectors (interior edges) at each vertex; find their
   intersections; push all into a min-heap ordered by ray length.
2. **Loop** — Pop the shortest edge from the heap. Create a new node at the intersection. If a closed loop is detected (
   `hasInteriorLoop`), accept those exterior edges as finalized. Compute new bisector edges from the merged node and
   push them onto the heap.
3. **Termination** — All exterior edges are accepted.

**Data model:** The graph separates *exterior edges* (original polygon edges, never move) from *interior edges* (
bisector rays that evolve during computation). `acceptedEdges` is a boolean array indexed by exterior edge ID tracking
which edges are finalized. Interior edge IDs start at `graph.numExteriorNodes`; `interiorEdgeIndex(edge, graph)`
converts an edge ID to an `interiorEdges[]` array index.
