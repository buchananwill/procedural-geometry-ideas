# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev      # Start development server at http://localhost:3000
pnpm build    # Production build
pnpm lint     # Run ESLint
pnpm start    # Start production server
```

There are currently no automated tests configured. Verification is done by running the dev server and interacting with the UI.

## Architecture

This is a Next.js + TypeScript web app for visualizing **computational geometry algorithms**, currently focused on the **straight skeleton** algorithm.

**Path alias:** `@/*` maps to `./src/*`

### Key Layers

- **`src/app/`** — Next.js App Router pages. `page.tsx` is the main UI with a polygon editor and placeholder panels for algorithm controls/output.
- **`src/components/PolygonCanvas.tsx`** — Interactive Konva.js canvas. Handles draggable vertices, click-on-edge to insert vertices, and visual selection feedback.
- **`src/stores/usePolygonStore.ts`** — Zustand + Immer store. Single source of truth for polygon vertex data (add, move, remove, reset).
- **`src/algorithms/straight-skeleton/`** — Core algorithm implementation (no React dependencies).

### Straight Skeleton Algorithm (`src/algorithms/straight-skeleton/`)

The algorithm computes a [straight skeleton](https://en.wikipedia.org/wiki/Straight_skeleton) — the locus of points traced by polygon vertices as edges shrink inward at equal speed.

**Files:**
| File | Role |
|---|---|
| `types.ts` | All TypeScript interfaces: `Vector2`, `PolygonNode`, `PolygonEdge`, `InteriorEdge`, `StraightSkeletonGraph`, `HeapInteriorEdge`, `StraightSkeletonSolverContext` |
| `constants.ts` | Epsilon tolerance for floating-point comparisons |
| `core-functions.ts` | Vector math (add, subtract, scale, normalize), angle bisector construction, graph node/edge primitives |
| `algorithm-helpers.ts` | Ray-ray intersection (`unitsToIntersection`), bisection edge creation (`addBisectionEdge`), interior loop detection (`hasInteriorLoop`), node finalization |
| `algorithm.ts` | Entry point: `initStraightSkeletonSolverContext` (builds initial graph + heap) and `computeStraightSkeleton` (main event loop) |

**Algorithm flow:**
1. **Init** — Build graph from polygon vertices; compute angle bisectors (interior edges) at each vertex; find their intersections; push all into a min-heap ordered by ray length.
2. **Loop** — Pop the shortest edge from the heap. Create a new node at the intersection. If a closed loop is detected (`hasInteriorLoop`), accept those exterior edges as finalized. Compute new bisector edges from the merged node and push them onto the heap.
3. **Termination** — All exterior edges are accepted.

**Data model:** The graph separates *exterior edges* (original polygon edges, never move) from *interior edges* (bisector rays that evolve during computation). `acceptedEdges` is a boolean array indexed by exterior edge ID tracking which edges are finalized.
