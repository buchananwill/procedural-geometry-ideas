---
title: "Recursive Subdivision Arc: Journal"
type: workflow
status: active
---

# Recursive subdivision arc — journal

Written 2026-08-17 at the close of the first session of this arc. The design lives in
[recursive-skeleton-subdivision.md](./recursive-skeleton-subdivision.md) and the per-task contracts in
the `*-decisions.md` files beside it; this records **what was measured, what was learned, and what is
left** — the things that would be expensive to rediscover.

Branch `feature/recursive-skeleton-subdivision`, tip `923eaca`. Nothing in flight, working tree clean,
every dispatched task terminal.

## 1. What exists now

Core went **2561 → 3466 tests** and 57 → 68 suites over ten merged tasks. Every arrival was verified
on the merged tree by re-running rather than by reading the container's report.

| Landed | Effect |
|---|---|
| Unit-extent normalisation | Envelope 24 damaged fixtures → 0; upstream backlog item 1 closed |
| Coincidence clustering, terminal base cases | Partition made an equivalence relation; three-edge terminal solved in closed form |
| Power-of-two round trip | Normalise/denormalise bit-exact in scale |
| Mirror-event canonicalisation | Backlog item 4 closed; all four unclosed-chain counts to zero |
| Input canonicalisation | Backlog item 3 **retired by eliminating its input class** |
| Skeleton tree substrate | All 37 fixtures `isTree`; carries all three spine strategies |
| Access-run provenance | `Region`, index remap, run-boundary pinning |
| Recursive segment subdivision + page | The visible artefact; full-depth recursion |
| Partial depth + residue stream | Droste recursion; both residue treatments |
| Tiling identity vs canonical boundary | Floor band reopened to three decades |
| Per-level specs | All four segment/residue combinations reachable |
| Spine extraction | Three strategies, rendered, compared, ruled |

## 2. Findings worth not rediscovering

**F1 — The regime the whole hardening sequence was ordered around barely fires.** Three levels of
genuine re-solving — solver output fed straight back as solver input — produced **zero**
degenerate-input failures on the corpus. Canonicalisation and the numerical work were still worth
doing, but the ordering that put them all ahead of anything visible was over-cautious, and the
evidence for that came from building the picture rather than from more analysis.

**F2 — The old normalisation was canonicalising by accident.** Every subdivision fixture spans exactly
300 units, so the pre-power-of-two scale was exactly the span, which put uniformly subdivided vertices
on exact fractions in unit space *on the bit*. Making the scale principled exposed that the solver had
been depending on it. This is why the round trip cost `k = 9` on the double-reflex plus and why
canonicalisation gave it back.

**F3 — Equal-k subdivision testing was flattering the solver.** With canonicalisation off, the
double-reflex plus fails **9 of 10** irregular insertion counts against **1 of 10** equal-k counts.
Every prior measurement of this defect class used the equal family only.

**F4 — Two of my hypotheses were refuted by measurement, and both refutations were more valuable than
the fixes would have been.** The offset-projection defect was not terminal events with no successor;
it is *simultaneous mirror events*, where one instant reads back as several offsets up to 3.5e-13
apart because each node's offset derives from its own parent edge. And wiring the root canonicalisation
floor down was predicted to widen the floor band; it narrowed it, **because a sub-region's own floor is
smaller in world terms than the root's**, so per-region canonicalisation removes less at depth, not
more.

**F5 — The floor band was bounded by an accounting error, not by geometry.** The per-node tiling
identity compared segments against the boundary *handed in* rather than the one they were *derived
from*, so canonicalisation's deliberate area change was scored as tiling error. Fixing that reopened
the band from a single point to at least `[1e-6, 1e-3]`, and the proof is that the worst tiling error
is now **flat at 2.41e-13 across three decades of floor** — the identity is floor-independent. No
tolerance was loosened anywhere.

**F6 — The power-of-two scale is exactly invertible in its scale and not in its centring.** Sterbenz
covers the translated case and not the general one, which the round-trip spec declined to overclaim.
It surfaced two tasks later on sub-regions: a vertex far from its region's bounding-box centre returns
a neighbouring double. Resolved by selecting rings from the caller's own coordinates through the index
remap, making "canonicalisation deletes vertices and never moves the ones it keeps" true by
construction.

**F7 — The square has six diameters, not two.** Every bisector is exactly the half-diagonal, so corner
→ centre → *any* other corner ties, adjacent corners included. A spec claiming the diameter ends on the
opposite corner over-specifies.

**F8 — `wavefront-time` spines fragment on real input.** 8 of 37 fixtures produce a disconnected spine
somewhere in a 0.05-step sweep. That measurement is what settled decision 30a.

**F9 — The downstream port's D1 claim does not reproduce as stated.** Its divergence register says
native results are byte-identical after normalisation. Measured here, graph *structure* is preserved
exactly — counts, sources, targets, completeness, diagnostics, `inEdges` as sets — but every derived
quantity moves in the last ulps, `basisVector` included, because it is computed *from* unit-space
vertices. The defensible claim is structural identity below 1e-13. **This should be carried upstream.**

## 3. Process learnings

**P1 — A spec that states what would falsify it is worth more than a spec that states what to build.**
Both of F4's refutations were surfaced by an explicit "report a negative result and stop" clause. Without
it, a container would have implemented against a mechanism that was not operating, and the tests would
have passed because I would have specified the wrong tests too.

**P2 — Name the wrong implementation that would pass.** Several specs named the plausible-but-wrong
version explicitly — inferring termination from failure-to-close, treating the residue as one polygon,
excluding a fixture rather than pinning it. Each of those would have gone green.

**P3 — Build before the dashboard suite, always.** The dashboard resolves `@proc-geo/core` through
`dist` while core's own jest maps it to source. Running it pre-build tests a stale surface and produced
19 phantom failures against correct work. The arrival routine is **merge → core sweeps → build →
dashboard sweeps**.

**P4 — Check port 3000 for an orphan before capturing.** Dev servers survive the harness reporting them
killed, and a stale one serves pre-merge code to Playwright. This produced one screenshot of code three
merges old before the check was added.

**P5 — A watcher that polls only task status cannot tell a stranded task from a running one.** A dead
agent leaves its task at `engineering` indefinitely; the first watcher waited out a two-hour ceiling on
a corpse and reported "still engineering" as though it were news. The replacement emits on a terminal
status *or* a running task with no container alive.

**P6 — `--fresh` is safe only because of the merge that precedes it.** It hard-resets the agent branch
to `current-root`. When a container died mid-task with two unmerged commits, resume mode (no `--fresh`)
was the correct recovery, and it worked because the agent id is stable per name.

**P7 — The file-ownership boundary is what escalates a judgement to the arc lead.** Task 242 failed
rather than editing two test files it did not own. Its own recommended fix was to exclude a fixture from
an assertion, which would have deleted the evidence for a predicted finding. The boundary is what put
that decision in front of someone who could rule on it.

**P8 — Containers write debriefs to a root `Notes/` directory**, which is the game repo's convention,
not this one. They have been relocated to `docs/notes/debriefs/` keyed by task id each time; both
containers also number their first debrief `0001`, so the sequence collides across tasks while the task
id does not.

## 4. Outstanding

**Carried, in rough priority order:**

1. **The decision-99 correction has never been sent to the C++ team.** They ruled on 2026-08-16 that
   recursion is droste-style only, on the substrate argument that a boundary pass's courtyard is
   already a well-formed region — true of droste and false of segment recursion, which needs the merge
   pass and the access-set generalisation. They defer trunk-and-branch to this repo and will port what
   is proven here. **Flagged as cheap-now-expensive-later on day one and still outstanding.** F9 should
   travel with it.
2. **Radial promotion** (decisions 39–47). Any level creating an inner void must promote a connector.
   Nothing slices lots yet so nothing needs egress, but this gates the leaf work.
3. **Leaf slicing into parcels**, which is where `Region` and access-run provenance finally get a
   consumer, and where frontage retargets to the spine.
4. **The merge heuristic** — the partition DP and the objectives of decisions 31–38. Still a fixed
   group size. The aggregation choice (sum, max or variance) was mis-filed as engineering and is a
   taste axis.
5. **Backlog item 7, the collinear dumbbell.** Untouched by anything this arc did, by construction —
   its degeneracy is non-adjacent edges sharing a supporting line, invisible to any vertex-local test.
   The fixture and its characterisation test exist.
6. **The size ladder** (decisions 48–52), specified and unbuilt.

**Known and accepted:**

- Task 235 is the only task in the arc that went through unreviewed — the server was resolving another
  project's reviewers. Fixed by the restart; its work was reviewed by hand instead.
- `inEdges` ordering is unstable under any arithmetic perturbation, 21 of 37 fixtures at native.
- Post-solve debug recomputation runs in caller space, so the dashboard's sweep overlay keeps the
  magnitude sensitivity the solve no longer has.
- Assert and log text reports unit-space coordinates.
