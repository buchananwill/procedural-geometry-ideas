# D0L Dashboard + Unified Rendering DSL + Multi-Algorithm Routing

A D0L (Lindenmayer) system generator has been added to `@proc-geo/core`. The goal is not just to add another canvas —
it's to establish a **unified rendering DSL** that all procedural algorithms produce, rendered by a single shared
canvas.
This sets the architectural foundation for a pool of algorithms that can exchange outputs and be visualized through a
common pipeline.

> **This is a design document, not a migration guide.** It records how the Scene DSL was designed and which files the
> refactor touched. If you are porting an existing consumer off the deprecated `PolygonCanvas`, read the
> [dashboard README migration section](../../packages/dashboard/README.md#migrating-from-polygoncanvas) instead — it
> has a prop-by-prop mapping and a verified before/after. The complete worked example is
> [the demo's straight-skeleton page](../../apps/demo/src/app/straight-skeleton/page.tsx).

## Architecture: Rendering DSL

### Core Insight

PolygonCanvas currently mixes two concerns:

1. **Scene content** — what to draw (lines, points, labels with styles). This is declarative and algorithm-agnostic.
2. **Interaction** — how the user edits input data (drag vertices, click edges, select nodes). This is imperative and
   algorithm-specific.

The DSL captures concern #1. Concern #2 is handled by an algorithm-specific interaction overlay.

### DSL Primitives (in `packages/dashboard/src/scene/types.ts`)

Derived from the union of what both algorithms render:

```typescript
interface StrokeStyle {
    color: string;
    width: number;        // logical units, auto-scaled by 1/stageScale
    dash?: number[];      // auto-scaled
    opacity?: number;
}

interface FillStyle {
    color: string;
    opacity?: number;
}

interface TextStyle {
    fontSize: number;     // auto-scaled
    color: string;
    bold?: boolean;
}

interface SceneLine {
    type: 'line';
    points: number[];     // flat [x1,y1,x2,y2,...] — matches Konva format
    closed?: boolean;
    stroke: StrokeStyle;
    fill?: FillStyle;     // for closed shapes (polygon fill)
    arrow?: { pointerLength: number; pointerWidth: number };
}

interface ScenePoint {
    type: 'point';
    x: number;
    y: number;
    radius: number;       // auto-scaled
    fill: FillStyle;
    stroke?: StrokeStyle;
}

interface SceneLabel {
    type: 'label';
    x: number;
    y: number;
    offsetX?: number;     // auto-scaled
    offsetY?: number;     // auto-scaled
    text: string;
    style: TextStyle;
}

interface SceneGroup {
    type: 'group';
    id: string;           // for debug toggling, layer identification
    children: ScenePrimitive[];
    visible?: boolean;
}

type ScenePrimitive = SceneLine | ScenePoint | SceneLabel | SceneGroup;
```

### Data Flow

```
Algorithm output (skeleton graph / turtle paths)
        ↓
  toScene() adapter (algorithm-specific, lives in dashboard)
        ↓
  ScenePrimitive[]
        ↓
  SceneCanvas (shared, renders any ScenePrimitive[])
    Stage (zoom/pan/resize — shared infrastructure)
      Layer 1: ScenePrimitive[] rendering
      Layer 2: interaction overlay (optional, algorithm-specific ReactNode)
```

---

## Phase 1 — Scene DSL Types + Unified Canvas

| Action | File                                           | Purpose                                              |
|--------|------------------------------------------------|------------------------------------------------------|
| New    | `packages/dashboard/src/scene/types.ts`        | DSL type definitions                                 |
| New    | `packages/dashboard/src/scene/SceneCanvas.tsx` | Unified Konva canvas that renders `ScenePrimitive[]` |
| New    | `packages/dashboard/src/scene/index.ts`        | Barrel export                                        |

### `SceneCanvas` Design

**Props:**

```typescript
interface SceneCanvasProps {
    scene: ScenePrimitive[];
    stageScale: number;
    stagePosition: { x: number; y: number };
    onScaleChange: (scale: number) => void;
    onPositionChange: (pos: { x: number; y: number }) => void;
    interactionOverlay?: (invScale: number) => React.ReactNode;
    onStageClick?: (logicalPos: { x: number; y: number }, e: KonvaEventObject<MouseEvent>) => void;
}
```

**Responsibilities:**

- Container with ResizeObserver (extract from current PolygonCanvas)
- Konva Stage with zoom/pan handlers (extract wheel zoom, middle-click pan, touch pinch/pan from PolygonCanvas)
- Recursive `renderPrimitive(p: ScenePrimitive, invScale: number)` that maps DSL → Konva elements:
    - `SceneLine` → `<Line>` or `<Arrow>` (if `arrow` is set)
    - `ScenePoint` → `<Circle>`
    - `SceneLabel` → `<Text>`
    - `SceneGroup` → fragment with `visible` check, recurse children
- All `width`, `dash`, `radius`, `fontSize`, `offset` values multiplied by `invScale`
- Layer 1: scene primitives. Layer 2: `interactionOverlay?.(invScale)` for algorithm-specific interactive elements

**Reuse from PolygonCanvas:** The zoom/pan/touch logic (~190 lines) moves here verbatim. Helper functions
(`distanceToSegment`, `segmentLength`, `midpoint`, `decollideLabels`) stay available but are NOT part of the canvas —
they're used by adapters or interaction overlays.

---

## Phase 2 — Skeleton Scene Adapter + Interaction Overlay

| Action    | File                                                               | Purpose                                                |
|-----------|--------------------------------------------------------------------|--------------------------------------------------------|
| New       | `packages/dashboard/src/scene/adapters/skeletonToScene.ts`         | Converts skeleton output → `ScenePrimitive[]`          |
| New       | `packages/dashboard/src/scene/adapters/index.ts`                   | Barrel                                                 |
| New       | `packages/dashboard/src/components/SkeletonInteractionOverlay.tsx` | Draggable vertices, clickable nodes, edge-click-to-add |
| Deprecate | `packages/dashboard/src/components/PolygonCanvas.tsx`              | Replaced by SceneCanvas + adapter + overlay            |

### `skeletonToScene()` adapter

```typescript
function skeletonToScene(params: {
    vertices: Vertex[];
    skeleton: StraightSkeletonGraph | null;
    primaryEdges?: PrimaryInteriorEdge[];
    primaryEdgeIntersections?: Vector2[];
    debug: DebugDisplayOptions;
    collisionSweepLines: CollisionSweepLine[] | null;
    nodeOffsetDistances: Map<number, number> | null;
    selectedDebugNodes: Set<number>;
    invScale: number;
}): ScenePrimitive[]
```

`invScale` is `1 / stageScale`. It keeps stroke widths, label sizes and hit targets constant on screen as the stage
zooms, so every primitive that has an on-screen dimension scales by it.

This function extracts the rendering logic from PolygonCanvas into a pure function that returns `ScenePrimitive[]`. Each
current rendering block maps to a `SceneGroup`:

- `group:primary-edges` — dashed magenta lines
- `group:skeleton-edges` — yellow lines/arrows
- `group:unresolved-edges` — red dashed rays
- `group:selected-node-edges` — green highlights
- `group:collision-sweep` — cyan dashed lines + target circles + labels
- `group:polygon` — blue outline/arrows + fill
- `group:debug-labels` — edge lengths, indices, parent edges, offset distances
- `group:debug-nodes` — skeleton nodes, vertex indices
- `group:intersection-nodes` — magenta circles
- `group:vertices` — vertex circles (non-interactive; interaction overlay handles the draggable ones)

The `decollideLabels` helper is called inside the adapter for sweep labels.

### `SkeletonInteractionOverlay`

Renders as Layer 2 in SceneCanvas. Contains:

- Draggable vertex circles (reads from `usePolygonStore`, calls `moveVertex`/`addVertex`/`setSelectedVertex`)
- Clickable skeleton nodes (calls `onToggleDebugNode`)
- Handles click-on-edge-to-add-vertex logic (via `onStageClick` prop on SceneCanvas)

This keeps all polygon-editing interaction logic together, separate from rendering.

---

## Phase 3 — D0L Store, Hook & Presets

| Action | File                                                 | Purpose                                               |
|--------|------------------------------------------------------|-------------------------------------------------------|
| New    | `packages/dashboard/src/dol-system/presets.ts`       | 4 preset L-system configs                             |
| New    | `packages/dashboard/src/stores/useDolSystemStore.ts` | Zustand+Immer store for D0L config + compiled results |
| New    | `packages/dashboard/src/hooks/useDolGeneration.ts`   | Generation stepping/playback hook                     |

### Presets (`presets.ts`)

`DOL_PRESETS: Array<{ name: string; config: SystemConfig }>` with:

- **Koch Curve** — letter `draw`→`['F']`, production `draw→[draw,+,draw,-,-,draw,+,draw]`, axiom `[draw]`, angle 60°,
  scaling 1/3
- **Sierpinski Triangle** — letters `A`→`['F']`, `B`→`['F']`, axiom `[A]`, angle 60°
- **Dragon Curve** — letters `X`→`[]`, `Y`→`[]`, angle 90°
- **Fractal Plant** — letter `X`→`['F']`, uses `[`/`]` branching, angle 25°

All must pass `compile()` validation.

### Store (`useDolSystemStore.ts`)

Follow `useRandomPolygonStore` pattern.

```typescript
interface DolSystemStoreState {
    config: SystemConfig;
    generationCount: number;
    compiledSystem: CompiledSystem | null;
    generationResult: GenerationResult | null;
    turtleOutput: TurtleOutput | null;
    compilationError: string | null;

    loadPreset: (name: string) => void;
    setGenerationCount: (n: number) => void;
    setAlphabet: (letter: Letter, definition: Keyword[]) => void;
    addLetter: (letter: Letter, definition: Keyword[]) => void;
    removeLetter: (letter: Letter) => void;
    setProduction: (letter: Letter, rhs: DolSymbol[]) => void;
    setAxiom: (axiom: DolSymbol[]) => void;
    setTurtleParam: (key: keyof TurtleConfig, value: number) => void;
}
```

Internal `recompile()`: `compile()` → `generate(system, generationCount)` → `interpret(result, config.turtle)`. Catches
`DolSystemValidationError` → `compilationError`. Every setter calls `recompile()`.

### Generation Hook (`useDolGeneration.ts`)

Follow `useSkeletonAnimation` pattern.

```typescript
interface DolGenerationState {
    currentGeneration: number;
    setCurrentGeneration: (n: number) => void;
    maxGeneration: number;
    isPlaying: boolean;
    playDelay: number;
    setPlayDelay: (ms: number) => void;
    play: () => void;
    pause: () => void;
    stepForward: () => void;
    stepBackward: () => void;
    currentTurtleOutput: TurtleOutput | null;
}
```

Uses `useMemo` to call `generate(compiledSystem, currentGeneration)` → `interpret(result, turtle)` for the viewed
generation. Auto-advance timer via `useEffect`.

---

## Phase 4 — D0L UI Components + Scene Adapter

| Action | File                                                                  | Purpose                                      |
|--------|-----------------------------------------------------------------------|----------------------------------------------|
| New    | `packages/dashboard/src/scene/adapters/turtleToScene.ts`              | Converts `TurtleOutput` → `ScenePrimitive[]` |
| New    | `packages/dashboard/src/components/dol-system/DolConfigPanel.tsx`     | Config editing panel                         |
| New    | `packages/dashboard/src/components/dol-system/DolGenerationPanel.tsx` | Generation playback panel                    |
| New    | `packages/dashboard/src/components/dol-system/index.ts`               | Component barrel                             |

### `turtleToScene()` adapter

```typescript
function turtleToScene(params: {
    turtleOutput: TurtleOutput;
    colorMode: 'letter' | 'generation';
}): ScenePrimitive[]
```

Maps `paths: Segment[][]` to `SceneLine[]`. Color assignment:

- `'letter'` mode: assign palette color per unique `segment.letter`
- `'generation'` mode: gradient from cool→warm by `segment.generation`

Each path becomes a `SceneLine` with `points` flattened from segments.

### `DolConfigPanel`

Mantine Paper (collapsible, matching `AlgorithmPanel` style):

1. Preset selector — `Select` dropdown
2. Alphabet editor — letter rows with keyword definition, add/remove
3. Productions editor — text inputs parsing `"draw + draw - draw"` on blur
4. Axiom editor — single text input
5. Turtle params — `NumberInput` for stepLength, angleDelta, generationScaling
6. Error display — red `Alert` when `compilationError` is set

### `DolGenerationPanel`

Transport controls (reuse pattern from `AlgorithmPanel`):

- Generation slider (0 → maxGeneration)
- Transport: `|<` `<` play/pause `>` `>|`
- Delay slider
- Generation count `NumberInput`

---

## Phase 5 — Demo App Routing Restructure

| Action  | File                                           | Purpose                                             |
|---------|------------------------------------------------|-----------------------------------------------------|
| New     | `apps/demo/src/app/AppShellLayout.tsx`         | Client component: AppShell + header + nav drawer    |
| New     | `apps/demo/src/app/AlgorithmPageLayout.tsx`    | Shared responsive canvas+sidebar layout             |
| Modify  | `apps/demo/src/app/layout.tsx`                 | Wrap children in AppShellLayout                     |
| Replace | `apps/demo/src/app/page.tsx`                   | Redirect to `/straight-skeleton`                    |
| New     | `apps/demo/src/app/straight-skeleton/page.tsx` | Skeleton page using SceneCanvas + adapter + overlay |
| New     | `apps/demo/src/app/dol-system/page.tsx`        | D0L page using SceneCanvas + adapter                |

### `AppShellLayout` (client component)

Wraps children in Mantine `AppShell`:

- **Header (60px):** `Burger` icon (left) + `Title` "Procedural Geometry"
- **Navigation drawer:** Opens from burger. `NavLink` items:
    - `/straight-skeleton` — "Straight Skeleton"
    - `/dol-system` — "L-System (D0L)"
- Drawer closes on navigation (use `usePathname` + `useEffect`)

### `AlgorithmPageLayout` (client component)

Extracts the responsive layout pattern from current `page.tsx`:

```typescript
interface AlgorithmPageLayoutProps {
    canvas: React.ReactNode;
    panels: React.ReactNode;
}
```

- Desktop (≥768px): `Group` with flex canvas + 240px `ScrollArea` sidebar
- Mobile: Full canvas + floating `ActionIcon` → `Drawer` with panels

### Route Pages

**`/straight-skeleton`** — relocate current `page.tsx` logic:

- `usePolygonStore`, `useSkeletonAnimation`, `useCollisionSweep`, debug state
- `skeletonToScene()` produces `ScenePrimitive[]`
- `SceneCanvas` with `interactionOverlay` for vertex editing
- Control panels: `ControlsPanel`, `AlgorithmPanel`, `RandomPolygonPanel`, `DebugPanel`

**`/dol-system`** — new page:

- `useDolSystemStore`, `useDolGeneration`
- `turtleToScene()` produces `ScenePrimitive[]`
- `SceneCanvas` (no interaction overlay needed)
- Control panels: `DolConfigPanel`, `DolGenerationPanel`

### `layout.tsx` changes

Stays as server component with metadata. Renders:

```
<html><body>
  <MantineProvider>
    <AppShellLayout>{children}</AppShellLayout>
  </MantineProvider>
</body></html>
```

---

## Phase 6 — Barrel Exports + Build + Verify

### Modify: `packages/dashboard/src/index.ts`

Add exports for all new modules:

- Scene DSL: types, `SceneCanvas`, adapters
- D0L: `useDolSystemStore`, `useDolGeneration`, `DolConfigPanel`, `DolGenerationPanel`, `DOL_PRESETS`
- Interaction: `SkeletonInteractionOverlay`

### Build

```bash
node ~/AppData/Roaming/npm/node_modules/pnpm/bin/pnpm.cjs build
```

### Verification Checklist

- [ ] `/` redirects to `/straight-skeleton`
- [ ] Straight skeleton works identically to current behavior (same rendering via DSL adapter, same interactions via
  overlay)
- [ ] Burger menu opens nav drawer, links navigate between routes
- [ ] D0L page loads with Koch curve preset, renders correctly
- [ ] Changing presets updates canvas
- [ ] Generation stepping (slider, play/pause, buttons) animates through generations
- [ ] Editing turtle params (angle, step length, scaling) updates rendering
- [ ] Editing productions/axiom triggers recompile + re-render
- [ ] Compilation errors display in red alert
- [ ] Mobile responsive: floating button, control drawer, canvas fills viewport
- [ ] Zoom/pan works on both algorithm pages

---

## File Summary

| #  | Action    | File                                                                  |
|----|-----------|-----------------------------------------------------------------------|
| 1  | New       | `packages/dashboard/src/scene/types.ts`                               |
| 2  | New       | `packages/dashboard/src/scene/SceneCanvas.tsx`                        |
| 3  | New       | `packages/dashboard/src/scene/index.ts`                               |
| 4  | New       | `packages/dashboard/src/scene/adapters/skeletonToScene.ts`            |
| 5  | New       | `packages/dashboard/src/scene/adapters/turtleToScene.ts`              |
| 6  | New       | `packages/dashboard/src/scene/adapters/index.ts`                      |
| 7  | New       | `packages/dashboard/src/components/SkeletonInteractionOverlay.tsx`    |
| 8  | New       | `packages/dashboard/src/dol-system/presets.ts`                        |
| 9  | New       | `packages/dashboard/src/stores/useDolSystemStore.ts`                  |
| 10 | New       | `packages/dashboard/src/hooks/useDolGeneration.ts`                    |
| 11 | New       | `packages/dashboard/src/components/dol-system/DolConfigPanel.tsx`     |
| 12 | New       | `packages/dashboard/src/components/dol-system/DolGenerationPanel.tsx` |
| 13 | New       | `packages/dashboard/src/components/dol-system/index.ts`               |
| 14 | New       | `apps/demo/src/app/AppShellLayout.tsx`                                |
| 15 | New       | `apps/demo/src/app/AlgorithmPageLayout.tsx`                           |
| 16 | New       | `apps/demo/src/app/straight-skeleton/page.tsx`                        |
| 17 | New       | `apps/demo/src/app/dol-system/page.tsx`                               |
| 18 | Modify    | `packages/dashboard/src/index.ts`                                     |
| 19 | Modify    | `apps/demo/src/app/layout.tsx`                                        |
| 20 | Replace   | `apps/demo/src/app/page.tsx`                                          |
| 21 | Deprecate | `packages/dashboard/src/components/PolygonCanvas.tsx`                 |

### Key patterns to reuse

- `packages/dashboard/src/stores/useRandomPolygonStore.ts` — Zustand+Immer store
- `packages/dashboard/src/hooks/useSkeletonAnimation.ts` — stepping/playback hook
- `packages/dashboard/src/components/AlgorithmPanel.tsx` — collapsible panel + transport controls
- `packages/dashboard/src/components/PolygonCanvas.tsx` — zoom/pan/touch handlers (move to SceneCanvas), rendering logic
  (move to skeletonToScene adapter)
- `packages/core/src/dol-system/index.ts` — D0L API (compile, generate, interpret)
