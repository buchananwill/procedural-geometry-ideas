---
title: "Building Shell: Per-Stretch Gable Settings"
type: decision-spec
status: implementer-handoff
---

# Per-stretch gable settings

**Status: ruled by the user on 2026-11-13 (journal decisions 234, 251, 252, 253 in
[the session 2 journal](./building-shell-arc-journal-02.md)); the wording of the numbered decisions is the arc
lead's.** It extends [the gable rise proposal](./building-shell-gable-rise-proposal.md), whose decisions still
hold except where this document says otherwise.

## Intent

Some questions about a gable have no objective answer: how tall it may stand, whether it joins a gable that only
partly faces it, and whether it merges with an equal gable beside it. The user rules that these are the author's
choices. Each becomes a setting on the gable stretch, carried in memory, on the wire and in the editor, with a
default that reproduces today's roof. The solver stays best effort: it builds what the settings say and tames
nothing.

The prototype's job is speed to good geometry. The C++ port follows when its own cycle allows, so the wire format
changes here as the geometry needs, and no decision below is held back for the port.

## Vocabulary

| Term | Meaning |
|---|---|
| **Gable stretch** | A run of a Ring side whose form is gable (`SideRun` in `src/fixture.ts`). |
| **Facing strategy** | How a rise decides whether the wall opposite it is replaced by a gable on its path, and so whether it runs through and joins that gable or is limited by the opposite slope (gable rise decision 11 as amended by journal decision 243). |
| **Stands apart** | A gable stretch that is its own gable, never merged with a gable stretch beside it. |

## Surface roster

| File | Change |
|---|---|
| [fixture.ts](../../apps/building-shell/src/fixture.ts) | `SideRun` gains `facing` and `apart`. `maxHeight` and `limit` are there already. |
| [rise.ts](../../apps/building-shell/src/rise.ts) | A table of facing strategies beside the limit policies. Merging honours `apart`. |
| [ring-forms.ts](../../apps/building-shell/src/ring-forms.ts) | Extents and claimed bands carry the new settings and split where a stretch stands apart. |
| `src/wire/` (schema stand-in, defaults, refinement, types, adapter) | Three optional per-run fields. |
| `golden/`, `fixtures/playtest/` | Re-exported if `writeInput`'s bytes change. |
| `src/viewer/` (`edit.ts`, `draft.ts`, `edit-panel.ts`, `catalogue-facts.ts`) | Three controls on a gable stretch's row. Canonical spelling honours them. |
| `src/roof/`, `packages/core/` | **No change.** |

## Decisions

Numbers are for citation. They are not an order of work.

### The settings

1. **A gable stretch carries four settings**: `maxHeight` (cm above its plate, optional), `limit` (the limit
   policy, as today), `facing` (the facing strategy) and `apart` (stands apart). A hip stretch carries none of
   them, and setting a stretch to hip clears all four.
2. **Every default reproduces today's roof.** No `maxHeight`; `limit` `ridgeSlope`; `facing` `centreLine`; `apart`
   false. A fixture or file that sets none of them builds byte-identical shells.
3. **The settings are per stretch, not per building.** One building may hold gables that join and gables that do
   not.

### Facing strategies

4. **The facing strategy is a named entry in a table**, as the limit policy is, so adding one touches no other.
   A stretch's `facing` names its entry.
5. **Three strategies are built first**:
   - `centreLine`: today's test. The rise runs through when the middle of its band, walked inward, arrives under
     a gable stretch on the opposite wall. One answer for the whole width.
   - `whole`: the rise runs through only when its whole width arrives under gable stretches on the opposite
     wall. Otherwise the opposite slope limits it, where that slope is in the finished building.
   - `split`: the answer is taken across the width. The part of the rise that arrives under a gable runs
     through; the part that arrives at slope is limited by it. The rise is built as one piece per part.
6. **Each rise applies its own strategy.** Two rises that face each other may use different strategies, and each
   is built by its own.
7. **A strategy decides only whether the opposite slope is replaced on the rise's path.** Journal decision 231
   still holds under every strategy: a slope that is not in the finished building never limits.

### Standing apart

8. **Adjacent gable stretches merge into one gable only when neither stands apart** and they agree in pitch,
   `maxHeight`, `limit` and `facing`. This amends gable rise decision 6.
9. **A stretch that stands apart is its own gable**, with its own two rakes and its own apex, whatever lies
   beside it. A row of equal gables along one wall is authored as stretches that each stand apart.
10. **A boundary between two runs does not by itself mean two gables.** A file from the game may split one
    gabled side into several runs for reasons of geometry. Only `apart` separates them.
11. **A line extent that holds a stretch standing apart is not kept as algorithm B's one gable** (gable rise
    decision 5): its stretches are built as rises, so that each can be its own.

### The wire

12. **`input@1` gains three optional fields on a run**: the maximum height in cm, the facing strategy, and
    whether the run stands apart. A file without them reads with decision 2's defaults, so every existing file
    means what it meant.
13. **`limit` is not put on the wire yet**: it has one value. It goes on when a second limit policy exists.
14. **`readInput(writeInput(f))` keeps all four settings of every gable stretch.** The editor's round trip then
    has one named exception left: `defaultDeg` on a Ring with all four sides listed.
15. **A document that builds a rise is still marked not yet C++-replayable** (gable rise decision 17, journal
    decision 249). The new fields do not change that.

### The editor

16. **A gable stretch's row gains three controls**: a maximum height field, empty meaning none; a facing
    strategy choice; and a "stands apart" tick. A hip stretch's row shows none of them.
17. **The canonical spelling merges two neighbouring gable stretches only under decision 8.** Two equal gable
    stretches that stand apart stay two rows.
18. **Splitting a gable stretch may produce two gable stretches.** The editor offers it, and the two halves stand
    apart, since otherwise they would merge at once.
19. **The note that Download and Copy link drop `maxHeight` is removed**, because they no longer do.

### Not in this package

20. **A side gabled along its whole length, built by algorithm B, takes none of these settings.** A maximum
    height on such a gable, and on a hip slope, is the wider clamp of journal decision 234, and is a later
    package.

### Verification

21. **A gable stretch with every setting at its default builds the same shell as before**, over the whole
    corpus. This is the gate against an unintended change.
22. **Roster fixtures**: opposite stretches offset by half their width, built once under each facing strategy;
    three equal gable stretches standing apart along one wall; two equal neighbours of which one stands apart;
    a stretch with a maximum height in the editor's own spelling.
23. **Each fixture asserts its roof by closed forms written in the test**, independent of the code's own choice
    of planes, as `tests/rise.test.ts` does.
24. **Gates, each convicted by mutation**: a strategy's entry swapped for another's; `apart` ignored by the
    merge; `apart` ignored by the whole-wall verdict; a setting dropped by `writeInput`; a setting dropped by
    the editor's canonical spelling.
25. **What the fixtures build is reported as fact**: Cheeks, conflicts, Unclassified Edges, throws. A Cheek is not
    a failure of this package. A throw, a shell that is not closed, or an Unclassified Edge is reported with its
    smallest input and does not block the rest.
