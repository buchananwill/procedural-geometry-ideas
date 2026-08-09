# Parcel generation — handoff

Written 2026-08-09, closing a single long session. 28 commits across three branches. This is the
orientation document for whoever picks it up next; it records **what exists, what was decided and
why, and what is deliberately not done**.

Companion documents:

- [solver-hardening-backlog.md](./solver-hardening-backlog.md) — seven parked defects, each measured
  and diagnosed, none blocking.
- In the game repo: `Notes/buildables/procedural-accommodation-parcels-research.md` — the literature
  survey and the decision to build here in TypeScript before porting to C++.

---

## The objective

A ski-resort builder in Unreal. A player marks out a region on mountainous terrain; the game divides
it into chalet lots and connects them. The research settled on building the geometry in TypeScript
first — where the iteration loop is fast and the output is visible — and porting once the design is
proven. That decision held all session and was repeatedly vindicated: **four separate defects were
found by looking at a render or a browser, none of which any test caught.**

---

## Where the work is

| Branch | Tip | Contains |
|---|---|---|
| `feature/parcel-generation` | `cb8381c` | Solver correctness, the stroke→skeleton pipeline, the vertex budget, the hardening backlog |
| `feature/parcel-ui` | `e7a447e` | The `/parcels` page, and the full-depth slicing fix it exposed |
| `feature/elevation` | `44def16` | The terrain seam and slope-aware parcels |

Each branch builds on the last, so **`feature/elevation` contains everything**. All three are pushed.
`main` is untouched — nothing has been merged, and no PR has been opened.

`parcel-generation-prerebase` is a local-only safety ref from a verified rebase and can be deleted.

Suites at the tip: **core 57 / 2207**, **dashboard 11 / 144**. All builds green.

---

## What runs, end to end

Draw a stroke → fit → detect closure → reduce to a vertex budget → serialise → paste → solve the
straight skeleton → project the wavefront to an offset contour → decompose into strips → slice into
parcels → evaluate every parcel against terrain.

Three demo pages, all live under `pnpm dev` at `localhost:3000`:

- **`/pen-stroke`** — draw; Max-vertices slider with a live on-canvas preview of exactly what Copy
  will write; Faithful / Straighten reduction modes.
- **`/straight-skeleton`** — paste, solve, inspect, step through the algorithm.
- **`/parcels`** — depth, slice bounds, seed; layer toggles; terrain sources with a slope threshold.

---

## Decisions that should not be re-litigated

Each of these was made against evidence. The reasoning is in the commit messages and in code
comments at the point of use.

**The terrain seam is a batch point-sample interface**, not a raster. mapgen4 holds elevation on an
irregular dual mesh; Unreal's `MultiQueryVoxelLayer` takes an array of positions and returns height
and normal in one dispatch. Neither is a grid. A per-point signature would fit both while lying
about the cost model.

**Everything at the seam is metres**, and slope is read from the normal in closed form, never by
differencing heights. mapgen4's elevation is normalised and sea-level-relative; a threshold tuned
against it would be meaningless after the port.

**The vertex budget reduces by RDP, not by uniform resampling.** RDP is error-bounded, preserves
corners, and yields non-uniform spacing. The original correctness argument for this has since
expired — the defect that punished even spacing was fixed — so the live reasons are cost and shape
fidelity.

**The pen's default budget is 16, core's `DEFAULT_VERTEX_BUDGET` is 64, and that divergence is
deliberate.** 64 is a ceiling derived from cost (~0.7 s to solve, against ~2 ms at 16); 16 is a
starting point chosen by drawing on it.

**Closed loops are out of scope for the articulation solver.** `ArticulationChain` has no topology
field — adjacency is array index with no wrap, four constraint fields are dead, and the seam link is
not addressable. Supporting them needs a closure projection, not index wrapping. Characterised in
`tests/articulation/closed-loop.test.ts`.

**At full depth, lots may be triangular.** Proved structural: any two parcels of a triangular
skeleton face include at least one triangle, so "no triangular parcels" and "more than one lot per
full-depth strip" cannot both hold. Lots were chosen.

**A structural fix was written, measured, and reverted.** Exactly-subdivided reflex polygons failed;
a rewrite of layer partitioning fixed them. Drawn strokes scored 288/288 both before and after, so
it bought nothing for any input this project produces while costing several hundred lines in the
solver's most delicate machinery. Recoverable from history (`0e2f233`, reverted by `872bc4c`) if a
mesh importer or resample-to-N-points consumer ever appears.

---

## The invariants that did the work

If you change the solver, these are what will catch you. They are worth understanding before
editing anything under `straight-skeleton/`.

- **Wavefront causality** — time cannot run backwards along a skeleton edge. Offsets are re-derived
  from raw geometry, trusting none of the solver's own bookkeeping. Its header records that four
  weaker invariants failed to separate a known-bad output from a good one.
- **Directional** — every interior edge's target must lie forward along its own basis. Strictly
  stronger than the offset check for a whole class: an edge can travel backwards along its basis
  while still moving forward in offset.
- **Tiling** — strips plus rings equal the polygon; parcels equal their strip. Catches gaps and
  overlaps together, to ~1e-15 against a 1e-12 tolerance.
- **Egress** — every parcel owns a non-degenerate run of frontage. This is the guarantee the
  skeleton-strip method exists to provide.

---

## What is deliberately not done

**Emilien's growth loop.** The research recommends interest-driven seeding with interleaved,
terrain-aware routing — that is where the *alpine* character comes from. None of it is built. What
exists is the subdivision half.

**Terrain-aware routing.** Galin's anisotropic A* with an infinite-cost slope threshold. Not started.

**Slope-driven parcel shaping.** Parcels are currently *evaluated* against terrain, not *shaped* by
it. Emilien's anisotropic conquest with a quadratic directional-gradient cost is the reference.

**The C++ port.** Deliberately deferred until the geometry is proven. The property tests transfer
verbatim — they assert physical laws, not coordinates.

---

## Two things to fix early

**Terrain is fitted to the polygon's bounding box.** Right for a demo spanning fixtures three orders
of magnitude apart; wrong for the game, where terrain is fixed and the marked region moves within
it. It is one invertible transform in `terrain/placement.ts`.

**The mapgen4 vertical scale is an argument, not a fact.** 500 m per elevation unit gives 383 m of
relief and a 22° mean over a 2.4 km window. mapgen4's own renderer implies 1090 m/unit, at which the
same patch is a 37°-mean cliff. Decide what a resort should feel like and set it deliberately.

---

## Operational notes

- `pnpm` works directly in PowerShell; the Git Bash shim workaround in `CLAUDE.md` is not needed
  there.
- The Jest flag is `--testPathPatterns` (plural). `CLAUDE.md` was corrected; older notes may not be.
- **`node_modules` is fragile.** A filtered `pnpm install` once pruned `loglevel` from the root and
  broke 35 suites. The remedy is a full `pnpm install --config.confirmModulesPurge=false`.
- The dev server consumes `packages/core/dist`, not source. **Rebuild core after changing it** or the
  pages serve stale geometry.
- `pnpm lint` fails on two pre-existing issues in `apps/demo` unrelated to any of this work.
- Embedded double quotes in a commit message break PowerShell's native-command argument parsing.

---

## The habit worth keeping

The most valuable findings this session came from rendering the output and driving the UI in a
browser, not from tests:

- Parcels tiled perfectly while leaving every region's interior unallocated. Every property test
  passed.
- `result.closed` was permanently `false` on the pen page, so every copied payload would have been
  refused. The feature would have shipped dead.
- A clamped number input displayed a value diverging from the applied one.
- Full-depth strips came back as single wedges — which then exposed a real defect in the merge pass.

Property tests are excellent at proving a thing is self-consistent. They cannot tell you it is
**wrong in a way you did not think to assert**. Render it and look.
