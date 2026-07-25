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
npm install react react-dom @mantine/core @mantine/hooks konva react-konva zustand immer
```

| Peer                          | Range |
|-------------------------------|-------|
| `react`, `react-dom`          | `^19` |
| `@mantine/core`, `@mantine/hooks` | `^8`  |
| `konva`                       | `^10` |
| `react-konva`                 | `^19` |
| `zustand`                     | `^5`  |
| `immer`                       | `^11` |

`@proc-geo/core` and `@proc-geo/test-fixtures` are ordinary dependencies and install automatically.

## Setup

The components are Mantine components, so they need a `MantineProvider` and Mantine's stylesheet somewhere above them.
In a Next.js App Router project that goes in your root layout:

```tsx
// app/layout.tsx
import { ColorSchemeScript, MantineProvider, mantineHtmlProps } from '@mantine/core';
import '@mantine/core/styles.css';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" {...mantineHtmlProps}>
      <head><ColorSchemeScript /></head>
      <body>
        <MantineProvider>{children}</MantineProvider>
      </body>
    </html>
  );
}
```

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
into scene primitives that `SceneCanvas` draws. `PolygonCanvas` still exists but is **deprecated** in favour of
`SceneCanvas` + `skeletonToScene` + `SkeletonInteractionOverlay`.

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
