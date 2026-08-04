# @proc-geo/dashboard

React components for exploring the algorithms in [`@proc-geo/core`](https://www.npmjs.com/package/@proc-geo/core) —
an interactive straight-skeleton viewer, a pen-stroke → spline explorer, and a D0L L-system renderer, all drawn on a
Konva canvas and controlled by Mantine panels.

```bash
npm install @proc-geo/dashboard
```

## Peer dependencies

This package deliberately does not bundle React, Mantine, or Konva — install them yourself so there is exactly one
copy of each in your app:

```bash
npm install react react-dom @mantine/core @mantine/hooks @mantine/notifications konva react-konva zustand immer
```

| Peer                          | Range |
|-------------------------------|-------|
| `react`, `react-dom`          | `^19` |
| `@mantine/core`, `@mantine/hooks` | `^8`  |
| `@mantine/notifications`      | `^8`  |
| `konva`                       | `^10` |
| `react-konva`                 | `^19` |
| `zustand`                     | `^5`  |
| `immer`                       | `^11` |

`@proc-geo/core` and `@proc-geo/test-fixtures` are ordinary dependencies and install automatically.

## Setup

The components are Mantine components, so they need a `MantineProvider` and Mantine's stylesheet somewhere above them.
In a Next.js App Router project that goes in your root layout:

Some components report failures as toasts, so they also need `<Notifications />` mounted inside the provider:

```tsx
// app/layout.tsx
import { ColorSchemeScript, MantineProvider, mantineHtmlProps } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" {...mantineHtmlProps}>
      <head><ColorSchemeScript /></head>
      <body>
        <MantineProvider>
          <Notifications />
          {children}
        </MantineProvider>
      </body>
    </html>
  );
}
```

> **Mount `<Notifications />` even if you think you do not need it.** Without it, `notifications.show(...)` still
> succeeds — the toasts simply never render, so failures such as `ArticulationConstraintPanel`'s "Paste ignored"
> warning are silently swallowed, and the queued notifications accumulate unbounded for the life of the page.

Everything exported from this package is a client component. The published bundle carries a `"use client"` directive,
so you can import it directly from a server component without marking your own page.

---

## Pen-stroke → spline explorer

Draw a stroke with the mouse or a stylus and watch it get smoothed, simplified, corner-detected and fitted to a cubic
Bézier spline, with a slider to morph between the raw capture and the fitted curve.

Three pieces, none of which take props — they share state through the `usePenStrokeStore` Zustand store, so they wire
themselves together:

| Export                   | What it is                                                          |
|--------------------------|---------------------------------------------------------------------|
| `PenStrokeCanvas`        | The drawing surface.                                                |
| `PenStrokePipelinePanel` | Stage-by-stage controls (smoothing, simplification, corners, fitting). |
| `PenStrokeLerpPanel`     | The raw ↔ fitted morph slider.                                      |
| `usePenStrokeStore`      | The underlying store, if you want to drive it yourself.             |

### Embedding it

```tsx
'use client';

import dynamic from 'next/dynamic';
import { Stack } from '@mantine/core';
import { PenStrokeLerpPanel, PenStrokePipelinePanel } from '@proc-geo/dashboard';

// Konva touches the DOM on mount, so the canvas must not be server-rendered.
const PenStrokeCanvas = dynamic(
  () => import('@proc-geo/dashboard').then((m) => m.PenStrokeCanvas),
  { ssr: false },
);

export default function PenStrokeToy() {
  return (
    <div style={{ display: 'flex', gap: 16, height: 560 }}>
      {/* The canvas is a flex child that fills its parent — the parent needs a real height. */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <PenStrokeCanvas />
      </div>
      <div style={{ width: 280, overflowY: 'auto' }}>
        <Stack gap="sm">
          <PenStrokeLerpPanel />
          <PenStrokePipelinePanel />
        </Stack>
      </div>
    </div>
  );
}
```

Two things that will otherwise cost you an afternoon:

- **`PenStrokeCanvas` must not be server-rendered.** It mounts a Konva `Stage`, which needs a real DOM. Load it via
  `next/dynamic` with `ssr: false` (or your framework's client-only equivalent). Without this you get a server-side
  crash on first render.
- **Give the canvas a sized parent.** It renders into a `flex: 1; min-height: 0` container and measures itself with a
  `ResizeObserver`, so it fills whatever box you put it in. Drop it into a parent with no definite height and it
  collapses to nothing. A fixed pixel height, a grid track, or a flex parent that itself has a height all work.

If you only want the algorithm and not the UI, `runStrokePipeline` in
[`@proc-geo/core`](https://www.npmjs.com/package/@proc-geo/core) is the whole pipeline as a pure function, with no
React or Konva involved.

---

## Straight skeleton viewer

```tsx
import {
  SceneCanvas, skeletonToScene, SkeletonInteractionOverlay,
  useSkeletonAnimation, usePolygonStore,
  ControlsPanel, AlgorithmPanel, DebugPanel, RandomPolygonPanel, PlaybackController,
} from '@proc-geo/dashboard';
```

`useSkeletonAnimation` runs the solver and exposes stepping/playback state; `skeletonToScene` converts a solver result
into scene primitives that `SceneCanvas` draws.

### Migrating from `PolygonCanvas`

`PolygonCanvas` is **deprecated** and will be removed in a future release. It has been replaced by three pieces that
split what it used to do in one component:

| Concern | Now handled by |
|---------|----------------|
| What to draw | `skeletonToScene(...)` → `ScenePrimitive[]` |
| Canvas, zoom, pan, touch | `SceneCanvas` |
| Vertex dragging, node selection, click-edge-to-add-vertex | `SkeletonInteractionOverlay` + `useSkeletonStageClick` |

Nothing is lost in the move — every `PolygonCanvas` prop has a destination:

| `PolygonCanvas` prop | Goes to |
|----------------------|---------|
| `skeleton` | `skeletonToScene` |
| `primaryEdges` | `skeletonToScene` |
| `primaryEdgeIntersections` | `skeletonToScene` |
| `debug` | `skeletonToScene` |
| `collisionSweepLines` | `skeletonToScene` |
| `nodeOffsetDistances` | `skeletonToScene` |
| `selectedDebugNodes` | **both** — `skeletonToScene` (renders highlights) and `SkeletonInteractionOverlay` (handles clicks) |
| `onToggleDebugNode` | `SkeletonInteractionOverlay` |
| `stageScale`, `stagePosition` | `SceneCanvas` |
| `onScaleChange`, `onPositionChange` | `SceneCanvas` |

Three inputs are new and have no `PolygonCanvas` equivalent:

- **`vertices`** — `skeletonToScene` needs the polygon itself, which `PolygonCanvas` read from the store internally.
- **`invScale`** — `1 / stageScale`. Used to keep stroke widths, label sizes and hit targets constant on screen as you
  zoom. Required by both `skeletonToScene` and `SkeletonInteractionOverlay`; forgetting it is the most common mistake.
- **`skeletonNodePositions`** — a flattened `{ id, x, y }[]` for the overlay's clickable nodes.

#### Before

```tsx
<PolygonCanvas
  skeleton={animation.skeleton}
  primaryEdges={animation.primaryEdges}
  primaryEdgeIntersections={animation.primaryEdgeIntersections}
  stageScale={stageScale}
  stagePosition={stagePosition}
  onScaleChange={setStageScale}
  onPositionChange={setStagePosition}
  debug={debug}
  selectedDebugNodes={sweep.selectedDebugNodes}
  onToggleDebugNode={sweep.toggleDebugNode}
  collisionSweepLines={sweep.collisionSweepLines}
  nodeOffsetDistances={sweep.nodeOffsetDistances}
/>
```

#### After

```tsx
import {
  SceneCanvas, skeletonToScene,
  SkeletonInteractionOverlay, useSkeletonStageClick,
} from '@proc-geo/dashboard';

const invScale = 1 / stageScale;

const scene = skeletonToScene({
  vertices,
  skeleton: animation.skeleton,
  primaryEdges: animation.primaryEdges,
  primaryEdgeIntersections: animation.primaryEdgeIntersections,
  debug,
  collisionSweepLines: sweep.collisionSweepLines,
  nodeOffsetDistances: sweep.nodeOffsetDistances,
  selectedDebugNodes: sweep.selectedDebugNodes,
  invScale,
});

const skeletonNodePositions = useMemo(
  () => animation.skeleton?.nodes.map((n) => ({ id: n.id, x: n.position.x, y: n.position.y })) ?? [],
  [animation.skeleton],
);

const onStageClick = useSkeletonStageClick({ vertices, invScale });

const interactionOverlay = (overlayInvScale: number) => (
  <SkeletonInteractionOverlay
    invScale={overlayInvScale}
    selectedDebugNodes={sweep.selectedDebugNodes}
    onToggleDebugNode={sweep.toggleDebugNode}
    skeletonNodePositions={skeletonNodePositions}
    showSkeletonNodes={debug.showSkeletonNodes}
  />
);

return (
  <SceneCanvas
    scene={scene}
    stageScale={stageScale}
    stagePosition={stagePosition}
    onScaleChange={setStageScale}
    onPositionChange={setStagePosition}
    interactionOverlay={interactionOverlay}
    onStageClick={onStageClick}
  />
);
```

Everything around the canvas is unchanged: `usePolygonStore`, `useSkeletonAnimation`, `useCollisionSweep`, your
`debug` state and the control panels all carry over as-is. `SceneCanvas` has the same client-only and sized-parent
requirements as `PolygonCanvas` did — load it with `ssr: false` and give it a parent with a real height.

> **Note on `interactionOverlay`.** It is a *function* taking `invScale`, not a node. `SceneCanvas` calls it with the
> current inverse scale so the overlay resizes as you zoom — pass a callback, not `<SkeletonInteractionOverlay … />`.

A complete working migration lives in the demo app at `apps/demo/src/app/straight-skeleton/page.tsx`, which is the
reference this guide was written from.

## D0L L-systems

```tsx
import {
  DOL_PRESETS, useDolSystemStore, useDolGeneration,
  DolConfigPanel, DolGenerateButton, DolGenerationPanel, DolInstructionsPanel,
  turtleToScene, SceneCanvas,
} from '@proc-geo/dashboard';
```

`DOL_PRESETS` provides ready-made systems to start from. `turtleToScene` converts turtle output into scene primitives
for `SceneCanvas`.

---

## Notes

- **Stores are module-level singletons.** `usePenStrokeStore`, `usePolygonStore`, and the rest are created once per
  module instance, so two `PenStrokeCanvas` instances on the same page share one stroke. Mount one explorer per page.
- **Canvas components are client-only.** Anything that renders a Konva `Stage` needs `ssr: false`.
- The package is marked `sideEffects: false` and ships no CSS of its own — all styling comes from Mantine.

## Related packages

- **[`@proc-geo/core`](https://www.npmjs.com/package/@proc-geo/core)** — the algorithms, with no UI dependencies.
- **[`@proc-geo/test-fixtures`](https://www.npmjs.com/package/@proc-geo/test-fixtures)** — named polygon fixtures.

## License

MIT © Will Buchanan
