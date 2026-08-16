---
title: "Recursive Subdivision Legibility: Fixed Design Decisions"
type: decision-spec
status: implementer-handoff
---

# Recursive subdivision legibility

## Implementer's Brief

**You are running under the FSM review protocol.** Before any implementation, post your smoketest hello to the `general` channel, then drive the work through the mandated role transitions. **You may not self-certify completion**: a task is done only when the review cycle has posted approving verdicts and the server marks it integrated. Skipping the smoketest, the transitions, or the review cycle is a protocol violation, not a shortcut.

**This document is a design specification, not a sequenced plan — you have full discretion over implementation order.** **First, inspect `git log`** to determine which case you are in. **Greenfield** (no prior plan or work committed): derive your own phased implementation plan and **write it into the repository as your first action** — this committed plan is the recovery baseline that lets any later run (including your own, after an interruption) resume instead of restarting. **Resuming** an interrupted run (a committed plan and/or partial implementation already exists): read that plan, locate the last committed checkpoint, and continue from there — do not restart, and do not re-author the plan. **Do not commit manually** — in the container a manual commit stays local and is lost when the container exits; persistence to the remote happens *only* through the build flow, which auto-commits and pushes. So the moment your plan is written, **request a build to checkpoint it to the remote**, and trigger a build at every suitably-scoped milestone thereafter — each build-commit is the audit trail required to diagnose and resume from a failure mid-run. To keep your own context lean for steering the work, launch sub-agents whenever additional code-context is needed (existing systems, engine APIs, style references); you may write and edit directly, or delegate implementation to sub-agents to preserve that leanness. Reconcile everything against the project's established style practices and the existing code. Your work will be reviewed against the artefacts in this document — **the type roster and the decisions/specification** — treat them as the contract.

---

`/recursive` works and its numbers are right — at three levels on Duck Octagon it reports 4 then 15
then 46 segments, 65 total, 46 leaf cells, every region subdivided. **The picture does not communicate
it.** Everything is strokes on black, so each level adds line density rather than visible structure,
and at a glance the result reads as a tangle rather than as four regions each subdivided twice.

This task changes rendering only. **No geometry, no driver, no new core code.** The subdivision itself
is correct and is not to be touched.

## 1. Type Roster

**Changed — [recursiveSubdivisionToScene.ts](../../packages/dashboard/src/scene/adapters/recursiveSubdivisionToScene.ts)**

- The adapter emits filled leaf cells in addition to the strokes it already emits. `styleForLevel` gains a companion for ancestor tinting.

**Changed — [RecursiveControlsPanel.tsx](../../packages/dashboard/src/components/RecursiveControlsPanel.tsx)**

- One new toggle, per decision 6.

Nothing in `@proc-geo/core` changes. `recursive-subdivision.ts` is not edited.

## 2. Decisions / Specification

1. **Leaf cells are filled, and tinted by the LEVEL-0 SEGMENT THEY DESCEND FROM — not by their own
   level.** This is the whole change. Every leaf sharing a root ancestor shares a hue, so the picture
   shows a small number of large coloured territories each visibly divided into many cells. Tinting by
   own-level instead would recolour the entire canvas one shade and communicate nothing, which is
   effectively what the current all-strokes rendering already does.

2. **Hues are assigned by the level-0 segment's index, spread evenly around the wheel**, so adjacent
   territories are far apart in hue rather than adjacent in it. With four root segments that is roughly
   90° apart.

3. **Fills are low-alpha and strokes stay on top.** The skeleton is the subject; the fill is the
   grouping cue. A fill opaque enough to compete with the strokes has overshot — target something the
   line work reads clearly through.

4. **Within one territory, cells vary slightly in lightness** so that individual leaves remain
   distinguishable from each other rather than merging into one flat blob. Vary lightness only; keep
   the hue fixed, because hue is what encodes ancestry.

5. **Level-0 skeleton strokes are the heaviest and each deeper level is lighter and thinner**, and the
   distinction must survive conversion to greyscale. This was specified for the previous task and the
   current rendering does not achieve it — level 0 is currently no more prominent than level 2.

6. **A single toggle controls the fills, default ON.** Off restores exactly today's stroke-only
   rendering, which is the honest comparison and the way to check the fills are not hiding anything.

7. **Failed cells keep a reserved appearance that no territory hue can collide with.** They are
   currently distinguished; whatever that treatment is, fills must not make a failure look like an
   ordinary tinted cell. Duck Octagon at three levels has no failures, so **verify this on a fixture
   that does** — the driver's own test suite records which fixtures fail at which level.

8. **The page must still render correctly on first paint with no interaction**, unchanged from the
   previous task. The default fixture, level count and toggle state all produce a finished picture on
   load.

9. **Default the page to three levels rather than two.** Two is legible but three is where the
   mechanism is obvious, and the counts confirm it subdivides cleanly there.

## 3. Deferred (explicitly out of scope)

- **Any change to `recursive-subdivision.ts` or to the geometry.** The subdivision is correct.
- **Parcel slicing, spine overlays, access runs, partial depth.**
- **New fixtures.** The existing `ALL_TEST_POLYGONS` list is enough.
- **Persisting toggle state.**

## 4. Retirement

Nothing is deleted. Stroke-only rendering survives behind decision 6's toggle.
