---
title: "Simultaneous Mirror Events: Fixed Design Decisions"
type: decision-spec
area: straight-skeleton
status: completed
date: 2026-08-17
part_of: [recursive-skeleton-subdivision.md]
verified_by: [packages/core/tests/straight-skeleton/near-regular-ring-loss-diagnosis.test.ts, packages/core/tests/straight-skeleton/offset-projection.test.ts, packages/core/tests/straight-skeleton/offset-event-boundary-regression.test.ts]
---

# Simultaneous mirror events

## Implementer's Brief

**You are running under the FSM review protocol.** Before any implementation, post your smoketest hello to the `general` channel, then drive the work through the mandated role transitions. **You may not self-certify completion**: a task is done only when the review cycle has posted approving verdicts and the server marks it integrated. Skipping the smoketest, the transitions, or the review cycle is a protocol violation, not a shortcut.

**This document is a design specification, not a sequenced plan — you have full discretion over implementation order.** **First, inspect `git log`** to determine which case you are in. **Greenfield** (no prior plan or work committed): derive your own phased implementation plan and **write it into the repository as your first action** — this committed plan is the recovery baseline that lets any later run (including your own, after an interruption) resume instead of restarting. **Resuming** an interrupted run (a committed plan and/or partial implementation already exists): read that plan, locate the last committed checkpoint, and continue from there — do not restart, and do not re-author the plan. **Do not commit manually** — in the container a manual commit stays local and is lost when the container exits; persistence to the remote happens *only* through the build flow, which auto-commits and pushes. So the moment your plan is written, **request a build to checkpoint it to the remote**, and trigger a build at every suitably-scoped milestone thereafter — each build-commit is the audit trail required to diagnose and resume from a failure mid-run. To keep your own context lean for steering the work, launch sub-agents whenever additional code-context is needed (existing systems, engine APIs, style references); you may write and edit directly, or delegate implementation to sub-agents to preserve that leanness. Reconcile everything against the project's established style practices and the existing code. Your work will be reviewed against the artefacts in this document — **the type roster and the decisions/specification** — treat them as the contract.

---

A symmetric polygon produces events at genuinely different places in the plane at the same instant.
`computeNodeOffsets` derives each node's offset from the supporting line of one of *its own* parent
edges, and mirror nodes have different parent edges, so **one instant comes back as several numbers
7e-15 to 3.5e-13 apart**. Querying the wavefront at the lowest of such a set leaves the bisectors
meeting at the higher nodes alive by the table though they have already met in the plane; their span
along the shared exterior edge is then zero or negative, `segmentsAlongExteriorEdge` drops both of its
endpoints, and the ring is lost.

**This mechanism is measured, not hypothesised.** It was established by the previous task, which
refuted a different hypothesis of its own spec and pinned this one positively in
`near-regular-ring-loss-diagnosis.test.ts`: a bisector *is* born at the node, the node is *not*
terminal, the query is the lower member of a simultaneous pair whose nodes sit 149 units apart in the
plane, and the dropped span has non-positive length. Failure is always at the lowest member of an
ULP-separated set; the higher members project cleanly.

**Why it matters beyond the fixtures.** `computeOffsetRings` is how the recursive arc's residue stream
obtains its region at partial depth, and recursion generates symmetric machine-made geometry — which
is what produces simultaneous mirror events in the first place.

## 1. Type Roster

**Changed — [offset-projection.ts](../../packages/core/src/straight-skeleton/offset-projection.ts)**

- `computeNodeOffsets` — behaviour changes, signature unchanged: `(result: SkeletonSolveResult) => Map<number, number>`. Nodes belonging to one simultaneous set receive one identical offset value.
- New module-private helpers for partitioning the raw offsets and choosing each set's representative.

Nothing else changes. No solver file is touched, no fixture is promoted, and every other entry point
in the module keeps its current shape.

## 2. Decisions / Specification

### The fix

1. **`computeNodeOffsets` canonicalises its table: offsets belonging to one simultaneous set are
   collapsed to a single identical value before the map is returned.** Downstream reads are then
   unchanged and every lifetime comparison stays exactly as it is.

2. **This is NOT a tolerance in the lifetime comparison, and the distinction is the whole design.**
   The module header is correct that no slack is admissible where `birth` and `death` are compared —
   widening duplicates a vertex and shifting reintroduces the dropout. What changes here is the
   *table those comparisons read*, so after canonicalisation the comparison remains bit-exact and
   mirror nodes agree by construction rather than by luck. **Do not add slack to any comparison.**

3. **Partition by CONNECTED COMPONENTS under the proximity relation, never by first match.** Proximity
   under a fixed tolerance is not transitive, so a first-match join makes the partition depend on
   iteration order. This repo has already been bitten by exactly that in `clusterCoincidentMerges`,
   whose fix is the direct precedent for this one — read it before writing this.

4. **Each set's representative must be a MEMBER of the set, not a computed mean.** A mean is not one of
   the values it summarises and nothing bounds its distance from them, so it can collide with a
   neighbouring set where no member does. Taking a member inherits the partition's separation
   guarantee directly. Pick the member deterministically — the same value must come out whatever order
   the nodes are visited.

5. **The proximity tolerance is RELATIVE to the polygon's maximum offset, never absolute.** Offsets are
   caller-space lengths, so an absolute tolerance would mean different things at different magnitudes
   — the precise defect unit-extent normalisation was landed to remove. Derive the scale from the
   solved geometry rather than introducing a world constant.

6. **State and measure the tolerance rather than choosing it.** The observed spread within one instant
   is 7e-15 to 3.5e-13; the gap to the nearest genuinely distinct event is what bounds it from above.
   **Measure both across the corpus and report them** — a tolerance whose two bounds are within an
   order of magnitude of each other is a finding that this approach is marginal, and worth knowing
   before it ships rather than after.

### What must not regress

7. **The unclosed-chain report stays, and must still fire for a genuinely dropped bisector.** It is the
   module's honest signal that a ring is missing. Convict it by mutation: perturb one node's offset so
   a real hand-over breaks, and show the report still fires. A suite that stays green under that
   mutation has disabled the reporting rather than fixed the cause.

8. **Two nodes at the same offset and different positions must remain two nodes.** This task unifies
   *offsets*; it must not fuse graph nodes. The peanut's waist puts two nodes close together on
   opposite banks of a thin neck and fusing those is topologically wrong — the same warning that
   governs every proximity question in this codebase.

9. **`near-regular-ring-loss-diagnosis.test.ts` pins the CURRENT broken behaviour and will need
   updating.** That is expected and in scope. Update it to assert the corrected behaviour while
   keeping its positive diagnosis of the mechanism, so the file continues to document why the fix
   exists rather than simply going green.

### Verification

10. **The four measured counts must go to zero, and they are the headline result.** `unclosedChains`
    currently stands at ellipse-16 4, ellipse-32 6, peanut-32 7, rosette5-40 19. Report the new
    figures. **If they do not reach zero, report what remains and stop** rather than reaching for a
    second mechanism — a partial result honestly reported is the useful outcome, and this defect has
    already produced one wrong hypothesis.

11. **Area continuity at event offsets is the numerical gate.** Area at an exact event offset must
    equal the limit approached from either side, within the tolerance the surrounding tests use. A
    ring that closes while enclosing the wrong area is worse than one that fails to close, because
    nothing downstream would report it.

12. **Re-measure the near-regular fixtures' promotability and promote nothing.** This task is expected
    to clear their last blocker. Promoting them requires updating the hard-coded event-offset count in
    `offset-event-boundary-regression.test.ts` and re-running every sweeping suite, and bundling that
    here would make a regression unattributable.

13. **The acceptance gate is the full core suite twice with the failure sets intersected, plus the
    translation and scale envelope unmoved** at 37 of 37 `ALL_TEST_POLYGONS` across every translate
    from native to 1e11 and every scale from 1e-6 to 1e8. Core stood at 63 suites and 2731 tests;
    report actual counts.

## 3. Deferred (explicitly out of scope)

- **Promoting the near-regular fixtures.** Decision 12.
- **The residue stream and partial-depth recursion.** This removes their blocker; it does not build
  them.
- **Input canonicalisation.** Specced separately.
- **`inEdges` ordering instability.** Pre-existing, unstable under any arithmetic perturbation, and a
  finding to report rather than a defect to fix here.
- **Backlog item 7, the collinear dumbbell.** A different mechanism entirely — non-adjacent edges
  sharing a supporting line — and untouched by anything here.

## 4. Retirement

Nothing is deleted. The module header's section on one instant being several numbers is the diagnosis
this task acts on; **extend it to record the resolution rather than removing it**, because the reason
the table is canonicalised is exactly as load-bearing as the canonicalisation itself.
