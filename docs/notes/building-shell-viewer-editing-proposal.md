---
title: "Building Shell: Viewer Editing (Proposal)"
type: decision-spec
status: proposed
---

# Editing buildings in the viewer

**Status at 2026-11-13: built and accepted on the arc branch at `56e1c1b` (journal decisions 197 to 202 and 212 to
217), as amended below.** It began as a proposal by the arc lead (2026-11-12). It answers the
first item of the [session 2 charter](./building-shell-arc-journal-02.md#1-the-arcs-charter), and the user's ruling
5 in the [covered-storeys findings](./building-shell-covered-storeys-and-sections-findings.md): the viewport gains
editing first. The evidence is finding F62 in that journal.

## Intent

The viewer shows a fixed roster today. It becomes a place where a building is changed and the result is seen at
once: add and remove Rings, move and resize them, set their storeys, set each side's pitch, and choose hip or gable.
The editor is a thin layer. **It edits the pipeline's own input, `ShellFixture`, checks it with the wire's own
rules, and calls the pipeline unchanged.** The pipeline, the wire format and the golden set do not move.

The first version is a form panel with numeric fields. It is the simplest UI that makes every input reachable, and
every later nicety (dragging in the viewport, a plan view) sits on the same pure edit functions.

## Surface roster

| File | Change |
|---|---|
| `src/viewer/edit.ts` (new) | Pure edit functions, `ShellFixture` to `ShellFixture`. No DOM, no scene. |
| `src/viewer/draft.ts` (new) | Pure draft state: the fixture, its undo history, and its validation result. |
| `src/viewer/edit-panel.ts` (new) | The DOM for the panel. The only new file that touches the document. |
| [viewer/main.ts](../../apps/building-shell/src/viewer/main.ts) | Wires the panel in, and gains a build path that keeps the camera. |
| [viewer/hash.ts](../../apps/building-shell/src/viewer/hash.ts) | `Selection` gains a third kind, `draft`. |
| [viewer/scene.ts](../../apps/building-shell/src/viewer/scene.ts) | `setBuild` gains an option to keep the view. Ring highlighting. |
| [index.html](../../apps/building-shell/index.html) | The panel's container. |
| `tests/viewer-edit.test.ts`, `tests/viewer-draft.test.ts` (new) | Node tests of the pure modules. |
| Pipeline, `src/wire/`, `golden/`, `src/roof/` | **No change.** |

## Decisions

Numbers are for citation. They are not an order of work.

### The model

1. **The editor edits a `ShellFixture`.** It is what `buildShellDetailed` takes, and it holds exactly the four
   things the user named: Rings, storeys (`baseStorey`, `storeys`), size (`rect`) and roof (`defaultDeg`, `sides`).
   There is no separate editor model.
2. **Every edit is a pure function that returns a new fixture** and never mutates its argument. The set is: add a
   Ring, remove a Ring, duplicate a Ring, set a Ring's rect, set its `baseStorey`, set its `storeys`, set its
   `defaultDeg`, set one side's form, set one side's pitch, clear one side back to the default, move a Ring up or
   down the index order, and set the fixture's `storeyHeight`.
3. **Ring order is editable and shown**, because the lowest index wins a contested wall. The panel lists Rings in
   index order.
4. **A new Ring is a 500 × 500 cm hip Ring at 45°**, one storey, at base storey 0, placed beside the selected
   Ring's east side, or at the origin when the fixture is empty.
5. **Rect coordinates snap to the fixture's `cellSize`** (50 cm). Pitch fields step by 0.5°.

### Validity

6. **One validity law: a draft is valid when `readInput(writeInput(draft))` accepts it.** The editor writes no
   validator of its own. This gives the editor the wire's rules for free: pitch within 7° to 75°, positive area,
   grid corners.
7. **An invalid draft is not built.** The panel marks the offending field and shows the wire's refusal text. The
   viewport keeps the last good build.
8. **A valid draft that the pipeline refuses** (a `PlanRefusal` or any thrown error) shows the message in the
   panel, and the viewport keeps the last good build, dimmed. The existing blank-and-red `showFailure` stays for
   roster fixtures and defect cases.
9. **An edit is never blocked.** The user can always pass through an invalid state to reach a valid one. Undo is
   always available.

### Building

10. **A draft rebuilds on a committed change**: a field's `change` event, a button, or a stepper click. It does not
    rebuild on each keystroke.
11. **A rebuild from an edit keeps the camera, the toggles and the storey visibility.** Only choosing a different
    fixture re-frames the view.
12. **The build stays on the main thread in this version.** No build time is recorded anywhere in the repo (F62),
    so the first work measures it on the roster and on a ten-Ring draft, and reports. A Web Worker is added only if
    a build exceeds 250 ms on the ten-Ring draft, and that is a separate decision.

### The panel

13. **The panel sits in the existing right-hand column, above the report**, and has three parts: the Ring list, the
    selected Ring's fields, and the draft's actions.
14. **The Ring's fields are**: x0, y0, x1, y1; base storey; storeys; default pitch; and four side rows (S, E, N, W),
    each with a hip/gable choice and a pitch field that shows the default pitch greyed until overridden.
15. **Selecting a Ring in the list highlights it in the viewport.** Clicking a face in the viewport selects the
    Ring that face's provenance names. Dragging in the viewport is not in this version.
16. **The draft's actions are**: undo, redo, reset to the source fixture, download JSON, load JSON, and copy link.

### Identity and persistence

17. **Any roster fixture or defect case becomes a draft with one "Edit" button.** The draft's name is the source's
    name with the suffix `-draft`. A blank draft is also offered.
18. **`Selection` gains the kind `draft`.** The draft is saved to `localStorage` on every committed change, and a
    reload restores it. The viewer renders correctly when `localStorage` is unavailable.
19. **Download and load use `input@1` JSON**, through `writeInput` and `readInput`. A downloaded draft is therefore
    a file the C++ port can ingest and the playtest-seed folder can hold. Its provenance `subject` is the draft's
    name.
20. **"Copy link" encodes the draft's `input@1` JSON in the URL hash.** A link that fails `readInput` shows the
    refusal and falls back to the first fixture.
21. **Undo history is a list of fixtures**, capped at 200, and is not persisted.

### Testing

22. **`edit.ts` and `draft.ts` are tested in Node, following `toggles.ts`**: plain values in, plain values out.
    `edit-panel.ts` and `main.ts` hold no logic worth testing: a branch that decides anything belongs in a pure
    module.
23. **Gates, each convicted by mutation**: every edit function leaves its input unchanged; every edit of a valid
    roster fixture that the panel can make with in-range values yields a draft that passes decision 6; a draft
    survives download then load unchanged; an out-of-range pitch is refused by decision 6 and not built.
24. **The golden drift test and the whole existing suite stay green with no golden re-exported.**

### Relation to gable rises

25. **This version edits one form per side**, which is today's model. When the
    [gable rise proposal](./building-shell-gable-rise-proposal.md) lands, the side row gains a run list (split a
    run, set its ends, set its form and pitch) on the same edit functions. The editor comes first, so that rises
    are explored in it.

## Amendments

**2026-11-12, journal decision 198, after the reviews of the first implementation.**

- **Decision 14 is amended.** A listed side always carries its own pitch. Choosing a form on a side pins that
  side's pitch at its current value, and "Default" unlists the side. The original had a listed side's pitch field
  "greyed until overridden", which the wire cannot represent.
- **Decision 15 is amended.** Clicking a Wall or Gable face selects its Ring. Other faces carry no Ring identity
  in the pipeline and select nothing.
- **Decision 23 is amended.** "A draft survives download then load unchanged" means the loaded fixture equals the
  draft, with one named exception: `defaultDeg` on a Ring with all four sides listed, which `input@1` has no field
  for.
- **Decision 12 gains a guard.** A build that did not finish is not retried on reload, and a draft whose Rings'
  storeys sum above 100 asks before building.

**2026-11-13, journal decision 210: the run list (decision 25), now that gable rises are built.**

- **A side row gains a run list.** Each run has a start, an end, a hip/gable choice and a pitch. The edits are:
  add a run, remove a run, set a run's start or end, set its form, set its pitch. All are pure functions beside
  the existing ones, and all go through the same draft, undo and validity path.
- **A run always carries its own pitch**, as a listed side does (the amendment to decision 14).
- **Run ends snap to the fixture's `cellSize`**, in cm from the side's start.
- **Setting a side's form or pitch keeps that side's runs.** Clearing the side to "Default" removes them.
- **The run list does not expose a rise's `maxHeight` or `limit`.** `input@1` has no field for either, so a
  downloaded draft would load back as a different building. They stay reachable in fixtures only, until the wire
  carries them.
- **Validity is unchanged**: the wire round trip of decision 6. An overlapping, reversed or out-of-side run is an
  invalid draft like any other, shown on the run's fields, never blocked.
- **Gates, by mutation**: every run edit leaves its input unchanged; a draft with runs survives download then load
  unchanged; setting a side's form keeps its runs.

**2026-11-13, journal decision 214, after the reviews of the run list. This replaces the run list amendment above
where the two differ.**

- **A side is plain or split.** A plain side has no runs. A split side's runs are stretches that cover its whole
  length in order, with no gap and no overlap.
- **One spelling.** Neighbouring stretches that agree in form, pitch, `maxHeight` and `limit` are merged. A split
  side that merges to one stretch becomes plain. A split side's own `form` and `deg` are derived: the first hip
  stretch, else the first stretch. The editor applies this after every valid edit and on load.
- **The edits are on stretches**: split a stretch, move the boundary between two stretches, set a stretch's form,
  set its pitch, and return the side to plain ("Default"). Moving a boundary moves both stretches that share it.
  On a split side the side's own form and pitch controls do not act.
- **A new hip stretch takes the side's existing hip pitch.** Setting a stretch to hip clears its `maxHeight` and
  `limit`.
- **Download then load returns the draft itself for every valid draft**, with two named exceptions: `defaultDeg`
  on a Ring with all four sides listed, and `maxHeight` and `limit`. No other spelling exception exists.
- **Gate, by mutation**: a seeded fuzz of edit sequences, stretch edits included, in the suite. For every valid
  draft it reaches, the loaded copy equals the draft apart from the two exceptions.

## Not in this version

- Dragging handles in the viewport, and a 2D plan view.
- Non-rectangular Rings. The model has none.
- Sections (the covered-storeys findings). They wait for the editor, by the user's ruling 5.
- A production build of the viewer. It stays dev-server only.
