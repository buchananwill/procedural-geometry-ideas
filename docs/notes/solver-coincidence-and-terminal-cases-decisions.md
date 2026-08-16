---
title: "Solver Coincidence and Terminal Cases: Fixed Design Decisions"
type: decision-spec
status: implementer-handoff
---

# Solver coincidence and terminal cases

## Implementer's Brief

**You are running under the FSM review protocol.** Before any implementation, post your smoketest hello to the `general` channel, then drive the work through the mandated role transitions. **You may not self-certify completion**: a task is done only when the review cycle has posted approving verdicts and the server marks it integrated. Skipping the smoketest, the transitions, or the review cycle is a protocol violation, not a shortcut.

**This document is a design specification, not a sequenced plan — you have full discretion over implementation order.** **First, inspect `git log`** to determine which case you are in. **Greenfield** (no prior plan or work committed): derive your own phased implementation plan and **write it into the repository as your first action** — this committed plan is the recovery baseline that lets any later run (including your own, after an interruption) resume instead of restarting. **Resuming** an interrupted run (a committed plan and/or partial implementation already exists): read that plan, locate the last committed checkpoint, and continue from there — do not restart, and do not re-author the plan. **Do not commit manually** — in the container a manual commit stays local and is lost when the container exits; persistence to the remote happens *only* through the build flow, which auto-commits and pushes. So the moment your plan is written, **request a build to checkpoint it to the remote**, and trigger a build at every suitably-scoped milestone thereafter — each build-commit is the audit trail required to diagnose and resume from a failure mid-run. To keep your own context lean for steering the work, launch sub-agents whenever additional code-context is needed (existing systems, engine APIs, style references); you may write and edit directly, or delegate implementation to sub-agents to preserve that leanness. Reconcile everything against the project's established style practices and the existing code. Your work will be reviewed against the artefacts in this document — **the type roster and the decisions/specification** — treat them as the contract.

---

Three defects in one mechanism — how the solver resolves events that arrive at the same point — plus
one guard and one fixture. Two were found by a downstream C++ port that transcribed this solver
faithfully and then measured it across 44 fixtures at 7 translation placements; their measurements
are cited at the decisions they justify. This document fixes the type roster (§1) and the decisions
(§2), and carries no implementation bodies: the one worked example in decision 8 is a deliberate
tripwire against sign inversion, not a template.

The unifying fault: `clusterCoincidentMerges` is the only coincidence handling in the solver, it is
reachable from the n-gon path alone, and it is not an equivalence relation. The two terminal base
cases have no coincidence handling at all and answer a well-defined terminal state with a `throw`.

## 1. Type Roster

**[coincident-events.ts](../../packages/core/src/straight-skeleton/coincident-events.ts)**

- `clusterCoincidentMerges` — behaviour replaced, signature unchanged: `(events: CollisionEvent[]) => CoincidentMerge[]`.
- `CoincidentMerge` — shape unchanged. `position` is now always one of the grouped events' own positions.
- New module-private helpers for component discovery and representative selection. Not exported; `coincident-events.ts` exports only what [index.ts](../../packages/core/src/index.ts) already re-exports.

**[algorithm-termination-cases.ts](../../packages/core/src/straight-skeleton/algorithm-termination-cases.ts)**

- `handleInteriorEdgeTriangle` — behaviour replaced, signature unchanged: `(context: StraightSkeletonSolverContext, input: AlgorithmStepInput) => AlgorithmStepOutput`.
- `handleInteriorEdgePair` — one new branch, signature unchanged.
- New module-private closed-form solver over three supporting lines, returning position and offset together, or `undefined` when the system is not solvable.

**[solver-context.ts](../../packages/core/src/straight-skeleton/solver-context.ts)**

- `findOrAddNode` — gains a precondition, signature unchanged: `(position: Vector2) => PolygonNode`.

**[packages/test-fixtures](../../packages/test-fixtures/src/index.ts)**

- `COLLINEAR_DUMBBELL: Vector2[]` — new fixture, exported individually and **deliberately excluded** from `ALL_TEST_POLYGONS`.

## 2. Decisions / Specification

### Coincidence clustering

1. **`clusterCoincidentMerges` partitions by CONNECTED COMPONENTS under the same predicate at the
   same unchanged tolerance.** It currently joins each event to the *first* group already within
   `vectorsAreEqual` of it, and proximity under a fixed tolerance is not transitive, so the partition
   depends on arrival order. Downstream instrumentation of a 48-gon fan measured 1424 events over 48
   distinct edge ids reaching the clustering intact and being split into **four** groups; replaying
   the identical relation at the identical tolerance as connected components gives **one**, at every
   placement measured.

2. **The tolerance does not move.** It stays `vectorsAreEqual`'s default. Fixture conformance is the
   gate this whole solver rests on, and changing the predicate and the partition rule in one step
   makes a regression unattributable. Whether an absolute tolerance is the right instrument at all is
   a separate question this task does not open.

3. **A group's position is the MEDOID of its members — the member position nearest their centroid,
   exact ties broken lexicographically by position (x, then y).** The representative must be an
   actual member. `CoincidentMerge.position` feeds `terminateEdgesAtPoint` and thence `findOrAddNode`,
   which matches existing nodes by *the same* tolerance this module clusters by; two merges whose
   positions compare equal there collapse onto one graph node, fusing two independent vertex events
   into one junction. That skeleton is causally consistent, so the causality, clearance and direction
   audits all pass it.

4. **A centroid is the yardstick the medoid is measured against, never the answer.** Nothing bounds a
   centroid's distance from any member: a component chained into a ring of radius R about a point P
   has centroid exactly P, and a separate single-event component at P is genuinely distinct from it
   at every member yet collapses to the same place. Under single-linkage chaining the centroid's
   drift from its own extremes grows as `(k - 1) * epsilon / 2`.

5. **Ties break on POSITION rather than on arrival index, and this is not a matter of taste.** For a
   two-member component the centroid is bit-identical under either arrival order — IEEE-754 addition
   commutes, and only associativity fails, which needs three terms — so both distances are computed
   identically and the selection can differ *only* on an exact tie. An index tie-break decides that
   case by arrival order and is the last remaining source of order dependence; a positional one makes
   the representative an exact function of the member set. Exact ties are characteristic of the
   symmetric input this change exists for, not a curiosity.

6. **Assert, in a form that survives into the suite, that no two merges from one layer carry
   positions comparing equal under `vectorsAreEqual`.** First-match clustering gave this invariant for
   free by construction; components plus a member representative restore it by an argument about the
   partition, so it is checked rather than trusted. Its failure mode is silent.

7. **Single-linkage chaining is an ACCEPTED cost, recorded because it is real.** Transitive closure
   under a fixed tolerance means a run of events each within tolerance of the next becomes one group
   however far its extremes lie apart. On this corpus that is the wanted behaviour — it is what
   reunites a fan whose extremes are measured 1.95e-08 apart. The alternative not taken is gap-based
   partitioning, which bounds a group's diameter but introduces a second threshold nothing has
   measured.

### The three-edge terminal case

8. **`handleInteriorEdgeTriangle` is solved in CLOSED FORM from its three distinct exterior parents,
   and needs no tolerance at all.** Each parent contributes `n · P - t = n · A`, where `n` is that
   edge's inward unit normal and `A` any point on it. Three parents give three equations in three
   unknowns `(x, y, t)`. **The wavefront clock `t` is an unknown, not a constraint checked
   afterwards**, so the returned point is by construction the one place all three offset lines
   coincide *at a single common offset* — strictly stronger than intersecting two bisectors and then
   pricing the result on each edge's clock and hoping the two agree. Coincident sources stop being a
   case, because the solve never reads a source. Downstream validation against the old path across
   785 terminals: agreement within 1e-15, worst case 3.3e-15.

9. **The inward normal is taken from the convention already established and working in
   [strip-decomposition.ts](../../packages/core/src/straight-skeleton/strip-decomposition.ts), where
   `FaceEdge.normal` is documented as the inward unit normal such that `(p - start) · normal` is the
   skeleton offset within that edge's face.** Do not re-derive the rotation from the winding order.
   That derivation is the sign-sensitive step in this whole document, `rotateCw90` and `rotateWs90`
   both exist and differ only in sign, and an outward normal produces a negative `t` that is
   internally consistent and wrong. **Verify the cited convention before reusing it**, then reuse it
   rather than restating it.

   **Worked example — a 6-8-10 right triangle, exact arithmetic.** Vertices `(0,0)`, `(8,0)`, `(0,6)`.
   The bottom edge has inward normal `(0,1)` through `(0,0)`; the left edge `(1,0)` through `(0,0)`;
   the hypotenuse `(-0.6,-0.8)` through `(8,0)`. The system is

   ```
   Py - t = 0
   Px - t = 0
   -0.6·Px - 0.8·Py - t = -4.8
   ```

   giving `Px = Py = t`, then `-2.4t = -4.8`, so **`t = 2` and `P = (2, 2)`** — the incentre, with `t`
   the incircle radius. The determinant is `2.4`. **If your implementation returns `t = -2`, the
   normals are outward and decision 9 has been got wrong.**

10. **A determinant guard exists for malformed input, not for conditioning.** Across the same 785
    terminals the system's determinant never fell below `0.106` in magnitude. Guard it, fall back to
    the existing collision path when it trips, and log the fall-through — but do not tune a threshold
    as though conditioning were the risk.

11. **Fewer than three distinct exterior parents falls through to the existing collision path and is
    logged.** Every one of the 785 measured terminals had exactly three, but that is a measurement on
    one corpus and not a proof. **This is an assumption made observable, not an assumption trusted.**

### The two-edge terminal case

12. **`handleInteriorEdgePair` terminates both edges at their shared source when the pair's
    intersection classifies as `identical-source`.** No new predicate and no new tolerance is
    introduced: `intersectRays` classifies coincident sources **first, before every other test**, the
    function already computes that verdict into a local for its head-on check, and
    `NO_COLLISION_RESULTS` then discards it as "no collision" so the base case throws two lines later.
    An existing decision simply stops being thrown away.

13. **The two-edge case gets NO closed form, and the reason is structural rather than numerical.**
    With two parents the three-line system is underdetermined — two lines leave the entire bisector as
    the solution set — and the corpus contains terminal pairs with two, three and four distinct
    parents, so the construction is underdetermined, determined and overdetermined by turns. A pair's
    terminal point depends on where its bisectors were born and the boundary lines do not record that;
    the triangle's does not, which is why one case gets a closed form and the other does not.

14. **Rays leaving one point in different directions do not intersect, and that is a TERMINAL STATE
    rather than a failure.** The wavefront has finished; there is nothing left to propagate. The
    existing `throw` reads "no collision generated" as an error when it is the correct answer, and
    `terminateEdgesAtPoint` — the right response — already sits two lines below it.

### Guards and fixtures

15. **`findOrAddNode` throws on a non-finite position.** A NaN coordinate never compares equal to
    itself under an absolute tolerance, because the difference is NaN and every comparison against it
    is false, so the existing lookup misses and appends **a fresh node on every call**. A non-finite
    position is a defect upstream of this function; failing loudly at the first one beats accumulating
    duplicate nodes that no later pass can reconcile.

16. **`COLLINEAR_DUMBBELL` is added as an export-only fixture and is NOT placed in
    `ALL_TEST_POLYGONS`.** Several suites sweep that list asserting every entry solves completely, and
    this shape does not. Its coordinates are the measured repro recorded in
    [solver-hardening-backlog.md](./solver-hardening-backlog.md) item 7.

17. **The dumbbell arrives with a CHARACTERISATION test that pins its current wrong behaviour, not a
    test that asserts the right one.** It tiles with a 1.00e-1 relative error at depths 0.2 and 0.5 of
    max offset — strips overlapping strips — while the solve reports `complete: true` with empty
    diagnostics. Pin the failure exactly, so drift in either direction is loud. The existing
    [reflex-subdivision.test.ts](../../packages/core/tests/straight-skeleton/reflex-subdivision.test.ts)
    is the established pattern for this.

18. **The dumbbell's degeneracy is NOT redundant vertices and must not be described as such.** Every
    one of its twelve turns is 90°, so nothing is collinear at a vertex. Its degeneracy is that
    *non-adjacent* edges share a supporting line — two on `y=10`, two on `y=0`, two on `x=10` — making
    wall-to-wall distances exactly equal so the pinches land in one layer. No vertex-local test can
    see it. Record this at the fixture, because the obvious wrong reading is one line away.

### Verification

19. **Every gate in this task is convicted by mutation before it is trusted.** A test that cannot fail
    is not a gate. For decision 6, construct a layer whose components would collide under a centroid
    representative and show the assertion fires. For decision 9, run the worked example with the
    normal negated and show the sign test catches it.

20. **`SYMMETRICAL_OCTAGON` and the near-regular fixtures are re-measured but NOT promoted here.**
    Decisions 8 and 12 are expected to change their outcomes. Report what each one now does; promoting
    any of them into `ALL_TEST_POLYGONS` is a separate change gated on other work and must not ride
    along.

21. **The acceptance gate is the full core suite, twice, with the failure sets intersected.** It stood
    at 2207 tests; report the actual count before and after rather than the expected one. A count that
    moves without a stated reason is itself a finding.

## 3. Deferred (explicitly out of scope)

- **Unit-extent normalisation.** In flight as a separate task and it touches
  `algorithm-termination-cases.ts`, which this task also edits — **do not begin until it has landed
  and merged**, and rebase onto it rather than resolving against it.
- **Input canonicalisation.** The next phase; it depends on normalisation and not on this.
- **Fixing the dumbbell's strip overlap.** This task adds the fixture and pins the failure. Whether
  the overlap is downstream fallout of the reverted layer-partitioning defect or independent is the
  question the fixture exists to make answerable.
- **The `co-linear-from-1` cross-wiring in `handleInteriorEdgePair`.** Latent and known wrong — by the
  classification's own definition the leader always receives a target behind itself — but it fires
  zero times across the corpus. Leave it; touching a branch nothing reaches earns no evidence.
- **Replacing the absolute epsilon outright.** Four distinct defect classes now implicate it, which is
  the standing argument for eventually doing so, and is still not a licence to move it here.

## 4. Retirement

Nothing is deleted. Two `throw` sites stop being reachable for the inputs described — the
"Unable to generate any collision from last two edges" throw in `handleInteriorEdgePair` and the
"Failed to collide interior edges in triangle" throw in `handleInteriorEdgeTriangle` — but both
**remain in place** as guards for the cases decisions 11 and 13 route to them.
