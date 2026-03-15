# D0L System — Sprint 2 Plan

Consolidated from user feedback (`dol-system-ui-v2.md`) and code review notes (`dol-dashboard-review-issues.md`).
User feedback takes precedence where the two conflict.

---

## Phase 1: Scene rendering fixes & code quality cleanup

**Files:** `SceneCanvas.tsx`, `skeletonToScene.ts`, `SkeletonInteractionOverlay.tsx`, `useDolSystemStore.ts`,
`turtleToScene.ts`

Addresses review items W1–W8:

1. **W1** — Make `applyOpacity` handle 3-digit hex, named colors, and `rgb()`/`rgba()` strings gracefully (fall back to
   passing color through with opacity appended, or normalize via a small parser)
2. **W2** — `ScenePoint`: bake opacity into fill color via `applyOpacity` instead of using the Konva `opacity` prop,
   matching `SceneLine` behavior
3. **W3** — Rename `group:debug-nodes` → `group:debug-node-labels`
4. **W4** — Destructure `vertices` and `invScale` as direct params in `useSkeletonStageClick`
5. **W5** — Add `visible` property to `group:collision-sweep`
6. **W6** — Change `recompile()` parameter type to `Pick<DolSystemStoreState, ...>`
7. **W7** — Add inline comment on `loadPreset` documenting intentional `generationCount` reset
8. **W8** — Add comment in `turtleToScene` documenting that color assignment is per-path (intentional simplification)

---

## Phase 2: D0L input handling & small UI fixes

**Files:** `DolConfigPanel.tsx`, `types.ts` (core), `compile.ts` (core), `interpret.ts` (core)

Addresses user items 6–9 and review items W10–W11:

1. **Item 6** — Numeric inputs (`NumberInput`) validate/propagate on blur instead of on every keystroke
2. **W10/W11** — Convert alphabet, production, and axiom inputs to controlled components; use
   `key={JSON.stringify(config)}` (full config) for robust preset remount
3. **Item 7** — Shorten keyword placeholder to `"Keywords"` (move full help text `F + - [ ] f` to tooltip)
4. **Item 8** — Add `f` keyword (move-without-drawing) to core: extend `Keyword` type, add opcode
   `MOVE_NO_DRAW: 5`, update `KEYWORD_NAMES`, `NUM_KEYWORDS`, `compile()`, and `interpret()` to handle `f` as a forward
   step that doesn't produce a segment
5. **Item 9** — Replace `Badge` with Mantine `Pill` for alphabet letters so case is preserved (no forced capitalization)

---

## Phase 3: AppShell header & Reset View

**Files:** `AppShellLayout.tsx`, `AlgorithmPageLayout.tsx`, `page.tsx` (dol-system), `page.tsx` (straight-skeleton)

Addresses user item 1 (global), item 1 (D0L), and review W12:

1. **Global item 1** — Display algorithm title in AppShell header: `Procedural Geometry — {algorithmName}`. Pass
   algorithm name from each page to the layout.
2. **W12** — Evaluate replacing `Drawer` with `AppShell.Navbar` for the navigation. If the overlay behavior is
   intentional, add a comment; otherwise migrate.
3. **D0L item 1** — Add "Reset View" button that resets `stageScale` and `stagePosition` to defaults (matching the
   straight skeleton page's existing behavior).

---

## Phase 4: Floating playback controller

**Files:** New `PlaybackController.tsx` component, `useDolGeneration.ts`, `useSkeletonAnimation.ts`, `page.tsx` (both
pages)

Addresses global items 2–3 (the biggest architectural change):

1. Extract playback controls (play/pause, step forward/back, slider, delay) from the side panel into a new
   `PlaybackController` component
2. Position it as a floating element over the canvas using Mantine `Affix` (both mobile and desktop)
3. Add a toggle button (also via `Affix`) to show/hide the playback controller
4. Make playback frame global state (Zustand) so it persists across config updates; clamp to new max when generation
   count decreases
5. Both the D0L and straight skeleton pages consume the same `PlaybackController` — unify the playback interface between
   `useDolGeneration` and `useSkeletonAnimation`

---

## Phase 5: Generation safety & manual control

**Files:** `useDolSystemStore.ts`, `useDolGeneration.ts`, `DolGenerationPanel.tsx` (or successor)

Addresses user items 4–5:

1. **Item 4** — Make generation pause-able: don't auto-recompile on every config change. Add a "Generate" button that
   triggers compilation + generation on demand. Show a "stale" indicator when config has changed since last generation.
2. **Item 5** — Add a configurable safety cap (`maxWordLength`, default e.g. 100,000). Generation halts early if the
   word exceeds this threshold. Surface a warning when the cap is hit.
3. Update store to track `isStale` flag and `maxWordLength` setting.

---

## Phase 6: Config panel restructure + Instructions + Tooltips

**Files:** `DolConfigPanel.tsx` (split into sub-components), new `DolInstructionsPanel.tsx`

Addresses user items 2, 3, 11:

1. **Item 11** — Split the monolithic `DolConfigPanel` into separate accordion/disclosure sections:
    - **Alphabet Definitions** — letter CRUD with keyword assignments
    - **Production Rules (Text)** — raw text editing of production rules
    - **Turtle Parameters** — step length, angle delta, generation scaling
2. **Item 2 (D0L)** — Add an `Instructions` section (collapsible, open by default on first visit) explaining how D0L
   configurations work: alphabet defines drawing meaning, productions define rewriting rules, axiom is the seed.
3. **Item 3** — Add tooltips (Mantine `Tooltip`) to each config parameter explaining its role in detail.

---

## Phase 7: Drag-and-drop production rule composer

**Files:** New `DolProductionComposer.tsx`, updates to `DolConfigPanel.tsx` (or its successor section)

Addresses user item 10 and item 11.3:

1. Build a pill-based drag-and-drop composer for production rules:
    - Display the full alphabet (letters + keywords) as draggable `Pill` components
    - Provide a drop-zone / combo-box per production rule where pills can be dragged to build up the RHS
    - The combo-box parses the pill sequence back into the actual `Symbol[]` production rule
2. Add this as an additional disclosure section ("Production Rules (Visual)") alongside the raw text editor
3. Both editors stay in sync — editing in one reflects in the other via the shared store

---

## Priority notes

- **Phases 1–3** are quick wins: bug fixes, code quality, and small UX improvements.
- **Phase 4** is the highest-impact global change — it reshapes the educational UX across both algorithms.
- **Phase 5** is critical for usability — explosive word growth currently makes the UI unusable for experimental configs.
- **Phases 6–7** are the largest UI restructuring and should come after the foundation is solid.
