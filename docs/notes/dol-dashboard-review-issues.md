# D0L Dashboard + Rendering DSL — Outstanding Review Issues

Code review warnings collected during the 6-phase implementation of the unified rendering DSL and D0L dashboard
(see `dol-dashboard-and-rendering-dsl.md` for the original plan).

None of these are blocking — the full monorepo builds cleanly and all features are functional. They are recorded here
for future attention.

---

## Phase 1 — Scene DSL Types + Unified Canvas

### W1: `applyOpacity` assumes 6-digit hex colors

**File:** `packages/dashboard/src/scene/SceneCanvas.tsx`

`applyOpacity(color, opacity)` parses the color string as a 6-digit `#rrggbb` hex value. If a caller passes a 3-digit
shorthand (`#rgb`), a named color (`red`), or an `rgb()`/`rgba()` string, `parseInt` returns `NaN` and the output
becomes `rgba(NaN,NaN,NaN,opacity)`, which Konva ignores (renders transparent/black).

**Suggested fix:** Either document that `FillStyle.color` must be a 6-digit `#rrggbb` string, or make `applyOpacity`
detect non-hex input and fall back gracefully.

### W2: `ScenePoint` fill opacity uses whole-node `opacity` prop

**File:** `packages/dashboard/src/scene/SceneCanvas.tsx`

`ScenePoint` passes `p.fill.opacity` to the Konva `<Circle opacity={...}>` prop, which dims the entire node (including
stroke). `SceneLine` bakes opacity into the fill color via `applyOpacity`. This inconsistency means a `ScenePoint` with
both a fill opacity and a stroke will have its stroke unintentionally dimmed.

**Suggested fix:** Apply `applyOpacity(p.fill.color, p.fill.opacity)` to the `<Circle fill={...}>` prop and remove the
`opacity` prop, mirroring the `SceneLine` treatment.

---

## Phase 2 — Skeleton Scene Adapter + Interaction Overlay

### W3: `group:debug-nodes` name is a semantic mismatch

**File:** `packages/dashboard/src/scene/adapters/skeletonToScene.ts`

The group `group:debug-nodes` in the adapter contains only text labels (node indices, offset distances). The actual
skeleton-node circles are in the `SkeletonInteractionOverlay` (because they're interactive). The group name suggests it
contains nodes, but it doesn't.

**Suggested fix:** Rename to `group:debug-node-labels`, or document that node circles are intentionally in the overlay.

### W4: `useSkeletonStageClick` fragile params-object closure

**File:** `packages/dashboard/src/components/SkeletonInteractionOverlay.tsx`

The hook accepts a `params` object and captures it inside `useCallback`. The dependency array lists
`params.vertices` and `params.invScale` individually, but the callback body re-reads from the `params` object. If a
caller passes a stable `params` ref but mutates its contents, the callback stale-closes over old values.

**Suggested fix:** Destructure `vertices` and `invScale` as direct parameters instead of wrapping in a `params` object.

### W5: `group:collision-sweep` missing `visible` flag

**File:** `packages/dashboard/src/scene/adapters/skeletonToScene.ts`

Every other togglable debug group carries an explicit `visible` property mapped to a `debug.*` flag.
`group:collision-sweep` is pushed without one, making it the only group that cannot be suppressed via the scene DSL.

**Suggested fix:** Add a `visible` property, or document why this group has no toggle.

---

## Phase 3 — D0L Store, Hook & Presets

### W6: `recompile()` uses inline type instead of `Pick<DolSystemStoreState, ...>`

**File:** `packages/dashboard/src/stores/useDolSystemStore.ts`

The `recompile` helper declares its parameter type as an anonymous inline object shape duplicating the data fields of
`DolSystemStoreState`. If new fields are added to the store, the inline type silently falls out of sync.

**Suggested fix:** Use `Pick<DolSystemStoreState, 'config' | 'generationCount' | ...>` to derive the type from the
single source of truth.

### W7: `loadPreset` resets `generationCount` without documenting intent

**File:** `packages/dashboard/src/stores/useDolSystemStore.ts`

`loadPreset` always sets `generationCount = config.maxIterations`. This may surprise users who expected their manually
adjusted generation count to persist across preset loads.

**Suggested fix:** Add an inline comment documenting that `generationCount` is intentionally reset from the preset's
`maxIterations`.

---

## Phase 4 — D0L UI Components + Scene Adapter

### W8: `turtleToScene` colors per-path, not per-segment

**File:** `packages/dashboard/src/scene/adapters/turtleToScene.ts`

The adapter uses `path[0].letter` / `path[0].generation` as the representative for the whole path's color. The spec
language ("assign palette color per unique `segment.letter`") implies per-segment coloring. If a path contains segments
with mixed letters or generations, the entire path would be mis-colored.

**Suggested fix:** Either document that color is per-path (reasonable simplification), or emit one `SceneLine` per
consecutive run of the same letter/generation within a path.

### W9: Productions editor has no field-level validation

**File:** `packages/dashboard/src/components/dol-system/DolConfigPanel.tsx`

`parseSymbols()` accepts any token — invalid symbols are passed to the store, and the compilation error surfaces only as
a red `Alert`. Users get a cryptic `compilationError` rather than field-level feedback.

**Suggested fix:** No change required unless field-level validation is desired. Document as by-design.

### W10: Uncontrolled `defaultValue` inputs won't update on preset load

**File:** `packages/dashboard/src/components/dol-system/DolConfigPanel.tsx`

The alphabet, production, and axiom `TextInput` fields use `defaultValue` (uncontrolled). When a preset is loaded, the
store's `config` changes but the DOM inputs retain their previous values until the component remounts. The D0L page uses
a `key={JSON.stringify(config.axiom)}` workaround, but this is fragile.

**Suggested fix:** Convert to controlled inputs with local `useState` per row, synchronized via `useEffect` on store
changes. Or use `key={JSON.stringify(config)}` for a more robust remount trigger.

---

## Phase 5 — Demo App Routing Restructure

### W11: `DolConfigPanel` key uses only `config.axiom`

**File:** `apps/demo/src/app/dol-system/page.tsx`

The remount key is `JSON.stringify(config.axiom)`. If two presets share the same axiom but differ in productions or
alphabet, the uncontrolled inputs would show stale values.

**Suggested fix:** Use `JSON.stringify(config)` or a dedicated preset-load counter as the key.

### W12: Navigation uses floating `Drawer` instead of `AppShell.Navbar`

**File:** `apps/demo/src/app/AppShellLayout.tsx`

The spec says "navigation drawer" which typically implies `AppShell.Navbar` in Mantine. The implementation uses a
standalone `<Drawer>` that overlays content rather than pushing it. Functionally correct but semantically different.

**Suggested fix:** No change needed if overlay behavior is desired. Document the intent.
