---
title: "Offset Projection at Terminal Events: Fixed Design Decisions"
type: decision-spec
status: implementer-handoff
---

# Offset projection at terminal events

## Implementer's Brief

**You are running under the FSM review protocol.** Before any implementation, post your smoketest hello to the `general` channel, then drive the work through the mandated role transitions. **You may not self-certify completion**: a task is done only when the review cycle has posted approving verdicts and the server marks it integrated. Skipping the smoketest, the transitions, or the review cycle is a protocol violation, not a shortcut.

**This document is a design specification, not a sequenced plan — you have full discretion over implementation order.** **First, inspect `git log`** to determine which case you are in. **Greenfield** (no prior plan or work committed): derive your own phased implementation plan and **write it into the repository as your first action** — this committed plan is the recovery baseline that lets any later run (including your own, after an interruption) resume instead of restarting. **Resuming** an interrupted run (a committed plan and/or partial implementation already exists): read that plan, locate the last committed checkpoint, and continue from there — do not restart, and do not re-author the plan. **Do not commit manually** — in the container a manual commit stays local and is lost when the container exits; persistence to the remote happens *only* through the build flow, which auto-commits and pushes. So the moment your plan is written, **request a build to checkpoint it to the remote**, and trigger a build at every suitably-scoped milestone thereafter — each build-commit is the audit trail required to diagnose and resume from a failure mid-run. To keep your own context lean for steering the work, launch sub-agents whenever additional code-context is needed (existing systems, engine APIs, style references); you may write and edit directly, or delegate implementation to sub-agents to preserve that leanness. Reconcile everything against the project's established style practices and the existing code. Your work will be reviewed against the artefacts in this document — **the type roster and the decisions/specification** — treat them as the contract.

---

At the exact offset of a terminal many-way event, `projectOffsetWavefront` reports an unclosed chain
instead of an answer. Five cases are named in
[solver-hardening-backlog.md](./solver-hardening-backlog.md) item 4, and area recovers cleanly a
nanometre either side of each.

**The working hypothesis, which decision 1 requires be confirmed before anything is changed.** Bisector
lifetimes are half-open `[birth, death)`. At an ordinary event a bisector's `death` is bit-for-bit the
next one's `birth`, read from the same node-offset table, so the wavefront vertex hands over cleanly.
**At a terminal event nothing is born** — the wavefront has finished — so every bisector dying at `t`
is correctly excluded and there is no successor to replace them. The chain therefore has no successor
because its ring has legitimately ceased to exist, not because a bisector was dropped. The projection
cannot currently distinguish those two situations and reports both as the same failure.

**This has become an arc dependency.** `computeOffsetRings` is how the recursive subdivision arc's
residue stream obtains its region, and recursion generates symmetric machine-generated geometry, which
generates many-way events by construction — precisely the case that fails. The count also rose on four
of seven near-regular fixtures when coincidence clustering was corrected, which is expected behaviour:
correct clustering produces more genuine many-way arrivals.

## 1. Type Roster

**[offset-projection.ts](../../packages/core/src/straight-skeleton/offset-projection.ts)**

- `computeOffsetRings` — behaviour changes at terminal event offsets, signature unchanged.
- `projectOffsetWavefront` — behaviour changes at terminal event offsets; its unclosed-chain report is **retained** for the genuine case.
- New module-private predicate distinguishing a terminated chain from a broken one, per decision 3.

Nothing outside this module changes. No solver file is touched, and no fixture is promoted.

## 2. Decisions / Specification

### Diagnosis before repair

1. **Confirm or refute the hypothesis by measurement, and report the result, BEFORE changing any
   behaviour.** For each of the five named cases — `NEAR_REGULAR_ELLIPSE_16 @72.361834`,
   `NEAR_REGULAR_ELLIPSE_32 @68.277064`, `NEAR_REGULAR_ROSETTE5_40 @37.456461` and `@55.672712`, and
   `NEAR_REGULAR_PEANUT_32 @106.597832` — establish whether every bisector in the failing chain dies at
   one node, whether that node has any bisector born at it, and whether the node is terminal. **A
   refuted hypothesis is a successful outcome of this task**: report it and stop rather than
   implementing decisions 3 to 6 against a mechanism that is not the one operating.

2. **The count has moved since item 4 was written and the current figures are the baseline, not the
   recorded ones.** `unclosedChains` now stands at ellipse-16 4, ellipse-32 5, peanut-32 4 and
   rosette5-40 22, measured at the coincidence-clustering merge. Re-measure rather than trusting either
   set of numbers.

### The distinction

3. **A terminated chain is identified POSITIVELY, never by elimination.** The test is that the chain's
   bisectors all die at a node which has no bisector born at it — an assertion about the graph, made
   from the node-offset table and the edge topology. **It is explicitly forbidden to infer termination
   from the failure to close**, which would convert every genuine dropped-bisector defect into a
   silently empty ring. That inversion is the single most dangerous way to make this task's tests pass,
   and it would disable the exact reporting this module was built to provide.

4. **A terminated ring contributes nothing and is not an error.** At the offset where a lobe's
   wavefront finishes, that lobe has no ring; emitting nothing for it is the correct answer, and other
   lobes alive at the same offset still emit theirs.

5. **The unclosed-chain report is RETAINED unchanged for chains that are not positively identified as
   terminated.** A dropped bisector must still be loud. The module's value is that it reports the
   problem honestly rather than returning a bare empty list, and this task must not cost that.

6. **No tolerance is introduced anywhere, and the module header already explains why in terms that
   remain correct.** Widening the lifetime interval makes a bisector alive at both ends of an event and
   duplicates a vertex; shifting it reintroduces exactly the dropout it would be meant to guard
   against. `birth` and `death` are the same quantity read from one table for two nodes and they agree
   bit-for-bit; **the comparison needs no slack and must not be given any.**

### The discriminating case

7. **`NEAR_REGULAR_PEANUT_32` is the test that separates a fix from a cover-up, and it must pass in
   both directions.** Its two lobes' terminal events sit **one ULP apart**, so at either exact offset
   one lobe has genuinely finished while the other is still alive. A correct implementation emits the
   living lobe's ring and nothing for the finished one, **at both offsets**. An implementation that
   suppresses unclosed chains generally will also pass the naive form of this test, which is why
   decision 3 is stated as a positive identification.

8. **Area continuity at the event offset is the numerical gate.** Item 4 records that area recovers
   cleanly a nanometre either side of each named offset. Assert that the area at the exact offset
   equals the limit approached from both sides, within the tolerance the surrounding tests already use.
   **A ring that closes but encloses the wrong area is a worse outcome than one that fails to close**,
   because nothing downstream would report it.

### Verification

9. **Convict the gate by mutation.** Break a genuine hand-over — perturb one node's offset so a
   bisector's `death` no longer matches its successor's `birth` — and show the unclosed-chain report
   still fires. A test suite that stays green under that mutation has implemented decision 3 by
   elimination, whatever the code appears to say.

10. **Re-measure the near-regular fixtures' promotability and report it; promote nothing.**
    `NEAR_REGULAR_CIRCLE_16/32/48`, `NEAR_REGULAR_ELLIPSE_16/32`, `NEAR_REGULAR_PEANUT_32` and
    `NEAR_REGULAR_ROSETTE5_40` are held out of `ALL_TEST_POLYGONS` because several suites sweep it
    asserting every entry solves completely. This task is expected to clear their remaining blocker.
    **Promoting them is a separate change** — it requires updating the hard-coded event-offset count in
    `offset-event-boundary-regression.test.ts` and re-running every sweeping suite, and bundling that
    here would make a regression unattributable.

11. **The acceptance gate is the full suite twice with the failure sets intersected**, plus the
    translation and scale envelope unmoved at 37 of 37 `ALL_TEST_POLYGONS` across every translate from
    native to 1e11 and every scale from 1e-6 to 1e8. The suite stood at 61 suites and 2637 tests;
    report actual counts.

## 3. Deferred (explicitly out of scope)

- **Promoting the near-regular fixtures.** Decision 10: measured here, done separately.
- **The recursion residue stream itself.** This task removes its blocker; it does not build it.
- **Backlog item 7, the collinear dumbbell.** A different mechanism — non-adjacent edges sharing a
  supporting line — and out of reach of anything in this module.
- **The `inEdges` ordering instability.** Unstable under any arithmetic perturbation, pre-existing, and
  a finding to report rather than a defect to fix here.

## 4. Retirement

Nothing is deleted. The module header's argument about half-open lifetimes and the prohibition on
tolerance is **correct as written and must survive this change intact** — extend it with the terminal
case rather than rewriting it.
