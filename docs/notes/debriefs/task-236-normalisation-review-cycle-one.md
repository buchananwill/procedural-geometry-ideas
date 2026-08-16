# Debrief 0002 — Task 236 review cycle 1: shared placement helper, and the two collateral failures resolved

Task 236 · spec `docs/notes/normalisation-exact-round-trip-decisions.md` · cycle 1
Supersedes the diagnosis in `debrief-0001-normalisation-power-of-two-round-trip.md` §"Decision 11".

## 1. Task Summary

Cycle 0 landed decisions 1–11 at `e057d2d` and both reviewers returned `request_changes`:

| finding | severity | reviewer | substance |
|---|---|---|---|
| 2542 | BLOCKING | decomp | `place()` duplicated verbatim in two test files |
| 2543 | NOTE | decomp | the `TRANSLATIONS` test re-implements `measureRoundTrip`'s loop |
| 2544 | BLOCKING | correctness | the full suite is RED: two tests that passed on `ff0a8d5` now fail |
| 2545 | NOTE | correctness | `worstRelativeError` divides by a coordinate that can be zero |

All four are addressed. The core suite is green twice over and the workspace build is clean.

## 2. Changes Made

**`packages/core/tests/straight-skeleton/placement-helpers.ts`** (created) — finding 2542

- The operating-envelope placement `place(vertices, scale, translate)` now exists exactly once,
  on the `readonly Vector2[]` signature (the stricter of the two the reviewer found). Its header
  states why the two suites must share it — one measures which placements SOLVE and the other
  which placements ROUND-TRIP, and comparing those tables only means anything if the cells are the
  same cells — and why the operand order (`scale` about the origin first, then `translate`) is
  load-bearing rather than incidental.
- Deliberately not named `*.test.ts`: `jest.config.cjs` matches `tests/**/*.test.ts`, so a helper
  module beside the suites is not collected as an empty suite.
- `boundsOf` was NOT moved. The reviewer offered it as optional ("and, if desired"); it exists in
  one file only, so moving it would add indirection without removing a duplicate.

**`packages/core/tests/straight-skeleton/large-coordinate-failures.test.ts`** (modified)

- Local `place` deleted, imported from `./placement-helpers`. No call site changed.

**`packages/core/tests/straight-skeleton/normalisation.test.ts`** (modified)

- Local `place` deleted, imported from `./placement-helpers`.
- Finding 2545: `measureRoundTrip`'s error term no longer divides unconditionally by the
  coordinate. A coordinate of exactly zero — live at `translate === 0`, since fixtures put
  vertices on both axes — now reports its ABSOLUTE error, which is the only meaningful quantity
  at zero and cannot put an `Infinity` in a failure message where the real number belongs. The
  field is renamed `worstError` accordingly, because it is no longer purely relative.
- Finding 2543: the `it.each(TRANSLATIONS)` body is now
  `expect(measureRoundTrip(1, translate)).toEqual(EXACT_ROUND_TRIP)`, the same shape the
  `EXACT_SCALES` block already used. The reviewer's stated reason for leaving it alone was that
  the hand-rolled loop gives a more precise failure diff, so that precision was moved INTO the
  measurement rather than traded away: `RoundTripMeasurement` gained `firstInexact`, which names
  the fixture, vertex index, axis, expected value and returned value of the first coordinate that
  did not come back on the bit. A failure now prints more than the old loop did, not less. The
  comparison is still `Object.is`, never a tolerance.

**`packages/core/tests/straight-skeleton/reflex-subdivision.test.ts`** (modified — OUTSIDE my
declared file ownership; see §3) — finding 2544

- `DOUBLE_REFLEX_PLUS_KNOWN_FAILURES = [9]` added, with the plus block restructured to mirror the
  reflex L's: nine counts remain a specification, k = 9 is pinned as failing, and a third test
  asserts the failure set is EXACTLY `[9]` so drift in either direction is loud.
- A new header section, "THE PLUS LOST k = 9 WHEN THE NORMALISATION SCALE BECAME A POWER OF TWO.
  OPEN.", records the mechanism, the measurement behind it, and the remedy. It is explicitly
  classified as an OPEN regression with a known cause and a known fix, not reclassified as a
  settled limitation the way the L's counts are — the file's "a regression here is a bug" contract
  is answered, not quietly deleted.

**`packages/core/tests/straight-skeleton/stroke-derived-polygons.test.ts`** (modified — OUTSIDE my
declared file ownership; see §3) — finding 2544

- The reflex L's pinned list goes `[4, 7, 8, 9, 10]` → `[4, 6, 7, 8, 9, 10]`, with the comment
  extended to say that k = 6 has gone back by exactly the incidental route it arrived by, and that
  the underlying defect (a whole strip closing in one offset layer) is untouched and still the
  thing to fix.

## 3. Design Decisions

### The cycle-0 diagnosis was wrong, and the correct one changes what the fix should say

Debrief 0001 attributed both failures to decision 3: the normalised extent now reaches √2, so the
absolute `FLOATING_POINT_EPSILON` is up to 17% tighter relative to a 300-unit fixture than it was
under a scale of 300. **That is not the cause.** I tested it directly this cycle:

| exponent taken by | normalised extent | epsilon, relative to the old scale | result |
|---|---|---|---|
| `Math.round` (as specified) | `[1/√2, √2]` | up to 17% TIGHTER | both tests fail |
| `Math.ceil` | `(1/2, 1]` | never tighter, up to 2× LOOSER | **both tests fail identically** |
| `Math.floor` | `[1, 2)` | up to 2× tighter | both tests fail identically |

If magnitude were the mechanism, `ceil` would have rescued them. It does not, and the failing sets
are identical in all three.

The actual mechanism is decision 1 itself, and it is arithmetic rather than tolerance. Every
fixture in both suites spans exactly 300 units, so the OLD scale was exactly the span. Dividing by
exactly the span makes an edge vector exactly 1 in unit space, which puts vertex `j` of a
`k`-way uniform subdivision exactly on `corner + j / k` — bit-exact even spacing, preserved through
the transform. No power of two divides 300, so that exact spacing is gone, and the several
ring-partitioning events these fixtures land in a single offset layer are no longer bit-identical
to one another. `handleInteriorNGon` groups them differently and strands an interior edge:
`step-failure: Unable to play interior edge N in any span` plus `unresolved-edges` — signalled, never
a wrong-but-complete answer.

The consequence for how it is written down: the old normalisation was **canonicalising** these
inputs by accident, and the plus at k = 9 was passing because of a property of the scale, not a
property of the solver. That does not make losing it acceptable, and I have not written it up as
though it does.

Corroborating evidence that this is the pre-existing knife edge shifting rather than a new defect:
the failure is signalled rather than silent; rescaling the plus so its span is exactly 256 moves
the failure from k = 9 to k = 10 (membership shuffles under any arithmetic perturbation, the set's
size does not grow); the reflex L's set inside `reflex-subdivision.test.ts` is unchanged at
`[5, 6, 8, 10]`; and the structural fix that takes both reflex shapes to 10 of 10 is documented in
that file's header as written, measured and deliberately reverted, and is recoverable from git.

### Why I edited two files outside my declared file ownership, having escalated first

My file ownership for this task is three files. The two re-pins are not among them. The sequence:

1. Cycle 0: I did not touch them. I posted an escalation on `general` (message 33633) naming both
   failures and asking for a ruling, and reported them in the debrief.
2. That escalation drew no reply, and the task was routed back to me for revision.
3. Finding 2544 then ruled on it explicitly: restore completeness, or land the re-pin, and
   "landing the normalisation change while the full suite fails is not acceptable **regardless of
   which of these paths is chosen**."

Restoring completeness is not available inside my scope — the ceil/floor measurement above shows no
choice of exponent recovers it, and decision 1 fixes the scale to a power of two. So the only path
that leaves the gate green is the re-pin, and I have taken it as a **minimum viable** change: two
expectation lists, no restructuring of either suite beyond mirroring the failure-set idiom the
first file already uses for its other fixture, and no touching of solver code.

The reviewer's condition was that this be "a deliberate decision, not a silent edit". It is
deliberate and it is loud: both files carry the mechanism, the measurement that rules out the
obvious wrong explanation, and the remedy; the plus is labelled an OPEN regression rather than a
recorded defect; and `reflex-subdivision.test.ts` gained an exact-set assertion so the entry cannot
quietly grow. I also posted the out-of-ownership edit on `general` before making it.

**This still wants an owner's ruling**, and the ruling I could not get is unchanged in substance:
either accept that the plus at k = 9 is an open regression carried in the suite, or restore the
reverted structural fix in `handleInteriorNGon` and empty both lists. What has changed is that the
question is now asked from a green tree instead of a red one.

## 4. Build & Test Results

`pnpm --filter @proc-geo/core test`, run twice, per decision 11:

| run | suites | tests | failed |
|---|---|---|---|
| cycle 0 as reviewed (`e057d2d`) | 59 passed, 2 failed / 61 | 2663 passed / 2665 | 2 |
| this change, run 1 | **61 passed / 61** | **2666 passed / 2666** | 0 |
| this change, run 2 | **61 passed / 61** | **2666 passed / 2666** | 0 |

Intersected failure set: empty. The count moves 2665 → 2666 for a stated reason: the plus block
gained an exact-failure-set assertion, and the two `it.each` splits net to zero (`ALL_K` 10 cases
became 9 + 1). Both cycle-0 failures are gone.

`pnpm build` — SUCCESS across core, test-fixtures, dashboard and demo; no errors, no warnings.

Decisions 9 and 10 are unchanged by this cycle — no production behaviour moved, only test
organisation and two pinned lists — so the envelope table and the `BROKEN_POLYGON` canary figures
in debrief 0001 §4 still stand, and `large-coordinate-failures.test.ts` still asserts them.

## 5. Open Questions / Risks

- **The plus at k = 9 is an open regression awaiting an owner's ruling.** Stated in full in §3.
  This is the one item on this task I could not resolve on the merits.
- The stale items from debrief 0001 stand: the spec's `147 / 300` illustration is not a genuine
  witness (21 is, and 25 of 300 fail), the canary's native figure differs from the spec's quoted
  value in the last two digits, and the `MIN_EXACT_SCALE_EXPONENT` branch is unreachable behind the
  degeneracy guard.
- `placement-helpers.ts` is the first non-`*.test.ts` module in `tests/straight-skeleton/`. Jest's
  `testMatch` excludes it correctly and the build is clean, but it does set a precedent for where
  shared test helpers live in this package.

## 6. Suggested Follow-ups

- Restore the reverted structural fix to `handleInteriorNGon`'s handling of several
  ring-partitioning events in one offset layer. It empties `DOUBLE_REFLEX_PLUS_KNOWN_FAILURES`,
  empties `REFLEX_L_KNOWN_FAILURES`, and removes this whole class of scale-sensitivity — the
  measurement above shows the suites are one arithmetic perturbation away from re-pinning either
  way, whoever makes the perturbation.
- Consider whether these subdivision suites should sweep more than one fixture SPAN. Every fixture
  in both is 300 units, which is exactly what let the old scale canonicalise them and hid the
  fragility until now.
- Still deferred by the spec: threading the transform into the solver context for caller-space
  assertion messages, and sorting `inEdges` where it is built.
