# D0L System UI V3 Sprint Plan

## Context

The D0L system UI (L-System explorer) has been through two sprints building out the visual production rule builder, playback controller, and turtle rendering. V3 addresses 8 usability and polish items from `docs/notes/dol-system-ui-v3-spec.md`: clipboard support, auto-centering, keyword reordering, resizable panels, provenance toggle, Generate button placement, icon buttons, and drag-and-drop fixes.

## Design Decisions

- **Clipboard JSON shape**: Full `SystemConfig` object (alphabet, productions, axiom, turtle). Session params like generationCount/maxWordLength are excluded.
- **Auto-center**: Fit-to-bounds (scale + translate) with 10% padding, triggered when `turtleOutput` changes. `SceneCanvas` gains an `onResize` callback to expose container dimensions.
- **Resizable splitter**: Use `react-resizable-panels` library (exports `Group`, `Panel`, `Separator`). Clean declarative API with `minSize`/`defaultSize`, handles all mouse/touch/keyboard interaction. Applied in `AlgorithmPageLayout.tsx` for desktop; mobile drawer unchanged.
- **Drag-and-drop overhaul**: Replace native HTML5 DnD with `@dnd-kit/react` library. Provides `DragDropProvider`, `useDraggable` (palette pills), `useSortable` (production row pills). dnd-kit handles hit testing across wrapped lines natively, fixing both 8a and 8b. Keep the horizontal flex-wrap pill layout (a columnar redesign would consume too much vertical space in the narrow panel).
- **Provenance toggle**: `skipProvenance` boolean in store, passed to `generate()` in core. When off, all segments resolve to generation 0 (single flat color).
- **Icons**: Need to add `@tabler/icons-react` as dependency to `@proc-geo/dashboard`.

## New Dependencies

| Package | Where | Purpose |
|---------|-------|---------|
| `react-resizable-panels` | `@proc-geo/dashboard` or `apps/demo` | Resizable canvas/panel split |
| `@dnd-kit/react` | `@proc-geo/dashboard` | Production rule pill DnD |
| `@tabler/icons-react` | `@proc-geo/dashboard` | Circle +/- icons |

---

## Phase 1 — Quick UI Fixes (items 3, 6, 7)

Small, self-contained changes with no architectural impact.

### Item 3: Keyword palette order → `F, f, +, -, [, ]`

**File:** `packages/dashboard/src/components/dol-system/DolProductionComposer.tsx`
- Add `const PALETTE_ORDER = ['F', 'f', '+', '-', '[', ']'] as const;`
- Replace `KEYWORD_NAMES.map(...)` at line 181 with `PALETTE_ORDER.map(...)`
- Do NOT touch core `KEYWORD_NAMES` in `types.ts` (opcode order must not change)

### Item 6: Generate button to top of config panels

**File:** `packages/dashboard/src/components/dol-system/DolGenerationPanel.tsx`
- Export a new `DolGenerateButton` component: a standalone teal Button that calls `triggerGeneration()` from the store, with the stale badge next to it
- Keep `DolGenerationPanel` as the collapsible settings (Max Generations, Max Word Length, truncation alert) but remove the Button from inside it

**File:** `packages/dashboard/src/components/dol-system/index.ts` (barrel)
- Export `DolGenerateButton`

**File:** `apps/demo/src/app/dol-system/page.tsx`
- Place `<DolGenerateButton />` at the top of `controlPanels`, above `DolInstructionsPanel`
- Keep `DolGenerationPanel` at the bottom for settings

### Item 7: Replace text `x` / `Add` with SVG circle icons

**File:** `packages/dashboard/package.json`
- Add `@tabler/icons-react` to dependencies (check if `apps/demo` already has it; if so, add as peer dep instead)

**File:** `packages/dashboard/src/components/dol-system/DolAlphabetSection.tsx`
- Import `IconCircleMinus`, `IconCirclePlus` from `@tabler/icons-react`
- Line 35: Replace `<Text size="xs">x</Text>` with `<IconCircleMinus size={14} />`
- Lines 92-105: Replace `<Button size="compact-xs">Add</Button>` with `<ActionIcon size="sm" variant="light"><IconCirclePlus size={14} /></ActionIcon>`

---

## Phase 2 — Clipboard Copy/Paste (item 1)

### Store action

**File:** `packages/dashboard/src/stores/useDolSystemStore.ts`
- Add `loadConfig: (config: SystemConfig) => void` action
- Implementation: replace `s.config`, call `recompile(s, s.maxWordLength)`, set `s.isStale` based on error

### UI

**File:** `packages/dashboard/src/components/dol-system/DolConfigPanel.tsx`
- Add `copied` and `pasted` flash state (matching `ControlsPanel.tsx` pattern)
- Add `copyConfig()`: `navigator.clipboard.writeText(JSON.stringify(config, null, 2))`
- Add `pasteConfig()`: read clipboard, JSON.parse, validate has `alphabet`/`productions`/`axiom`/`turtle` keys, call `loadConfig(parsed)`
- Render two buttons (Copy / Paste) with flash feedback inside the Collapse, below preset selector

**Reuse:** Follow exact pattern from `packages/dashboard/src/components/ControlsPanel.tsx:21-54`

---

## Phase 3 — Auto-Center on Generation (item 2)

### SceneCanvas resize callback

**File:** `packages/dashboard/src/scene/SceneCanvas.tsx`
- Add optional prop `onResize?: (size: { width: number; height: number }) => void`
- In the ResizeObserver callback (line 145-148), call `onResize?.({ width, height })` alongside `setSize`

### Fit-to-bounds logic

**File:** `apps/demo/src/app/dol-system/page.tsx`
- Add `canvasSize` state, pass `onResize={setCanvasSize}` to `SceneCanvas`
- Add `fitToBounds(bounds, canvasSize)` helper:
  ```
  padding = 0.1
  scaleX = canvasSize.width * (1 - 2*padding) / (max.x - min.x)
  scaleY = canvasSize.height * (1 - 2*padding) / (max.y - min.y)
  scale = Math.min(scaleX, scaleY, 10)  // cap max zoom
  position = center canvas on bounds center
  ```
- Call `fitToBounds` in a `useEffect` when `dolGeneration.currentTurtleOutput` changes (use ref to track last fitted output to avoid re-centering on manual pan/zoom)
- Update `resetView()` to also call `fitToBounds` instead of resetting to scale=1, pos={0,0}

---

## Phase 4 — Resizable Panel Divider (item 4)

Uses `react-resizable-panels` (`Group`, `Panel`, `Separator`).

**File:** `apps/demo/src/app/AlgorithmPageLayout.tsx`
- Install: `pnpm add react-resizable-panels --filter @proc-geo/demo`
- Replace the desktop layout (currently a `Group` with fixed-width `ScrollArea`) with:
  ```tsx
  import { Group as PanelGroup, Panel, Separator } from 'react-resizable-panels';

  <PanelGroup orientation="horizontal">
    <Panel minSize={30}>{/* canvas */}</Panel>
    <Separator />
    <Panel defaultSize={20} minSize={10} maxSize={40}>{/* scroll + panels */}</Panel>
  </PanelGroup>
  ```
- Sizes are percentages. `defaultSize={20}` ≈ 240px on a 1200px screen. `minSize={10}` ≈ 120px, `maxSize={40}` ≈ 480px.
- Style the `Separator` as a thin vertical bar with hover highlight
- Mobile drawer is unchanged (only render `PanelGroup` when `isDesktop`)

---

## Phase 5 — Provenance Toggle (item 5)

### Core

**File:** `packages/core/src/dol-system/generate.ts`
- Add `skipProvenance?: boolean` parameter to `generate()`
- When true, `step()` sets `parentIndex: -1` for all tokens (skips linking)
- Export signature: `generate(system, generations, maxWordLength?, skipProvenance?)`

### Store + Hook

**File:** `packages/dashboard/src/stores/useDolSystemStore.ts`
- Add `skipProvenance: boolean` (default `false`) to state
- Add `setSkipProvenance: (v: boolean) => void` action (marks stale)
- Pass `skipProvenance` to `generateDolSystem` in `recompile()`

**File:** `packages/dashboard/src/hooks/useDolGeneration.ts`
- Read `skipProvenance` from store
- Pass to `generateDolSystem(compiledSystem, currentFrame, maxWordLength, skipProvenance)` at line 32

### UI

**File:** `packages/dashboard/src/components/dol-system/DolGenerationPanel.tsx`
- Add a `Switch` labeled "Skip provenance (faster)" inside the Collapse
- Note text: "Color by letter/generation unavailable when off"

---

## Phase 6 — Drag-and-Drop Overhaul with dnd-kit (items 8a, 8b)

Replace the entire native HTML5 DnD implementation with `@dnd-kit/react`.

**Install:** `pnpm add @dnd-kit/react --filter @proc-geo/dashboard`

**File:** `packages/dashboard/src/components/dol-system/DolProductionComposer.tsx`

### Architecture

```
DragDropProvider (wraps entire composer)
├── Palette: each keyword/letter pill uses useDraggable({ id: `palette-${symbol}` })
├── Per production row:
│   └── Each pill uses useSortable({ id: `${rowId}-${index}`, index, group: rowId })
│       → Reordering within a row = sortable
│       → Drop from palette = onDragEnd checks source id prefix
└── Axiom row: same as production rows with group="__axiom__"
```

### Key changes

1. **Remove** all native DnD code: `makePaletteDragStart`, `DragPayload`, `computeInsertIndex`, `handleDragOver`, `handleDrop`, `handleDragLeave`, all `draggable` props and `onDragStart` handlers
2. **Wrap** the composer in `<DragDropProvider onDragEnd={handleDragEnd}>`
3. **Palette pills**: use `useDraggable({ id: 'palette-F' })` — these are drag sources only, not sortable
4. **Row pills**: use `useSortable({ id: unique-key, index, group: rowId })` — handles reorder within the row and provides ref + transform style
5. **`handleDragEnd`**: Check if source is palette (id starts with `palette-`) → insert at target index. Otherwise it's a within-row sort → reorder array.
6. dnd-kit natively handles hit testing across flex-wrapped lines, fixing both 8a (last position) and 8b (middle line)
7. Add a `DragOverlay` for a smooth ghost pill during drag

### Benefits over native DnD
- No manual `computeInsertIndex` needed
- Works correctly with flex-wrap layouts
- Keyboard accessibility built-in
- Smooth animations during reorder

---

## Verification

After each phase:
1. `pnpm build` — all packages compile
2. `pnpm test` — core tests pass (especially after Phase 5 core changes)
3. `pnpm dev` — visual verification on http://localhost:3000/dol-system
   - Phase 1: palette shows `F f + - [ ]`, Generate button at top, circle icons in alphabet
   - Phase 2: Copy/Paste buttons work, JSON round-trips correctly
   - Phase 3: turtle output auto-centers on generation, Reset View fits to bounds
   - Phase 4: react-resizable-panels splitter works, drag to resize, min/max constraints hold
   - Phase 5: toggle skips provenance, coloring falls back correctly
   - Phase 6: dnd-kit pills — drag from palette into any position, reorder within wrapped rows, drag to last position works, middle-line drops work, keyboard a11y works
