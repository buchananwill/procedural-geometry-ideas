# Playtest seeds

Every `*.input.json` here is an `input@1` dump, named per solve as
`<dump basename>.<SolveIndex>.<Subject>.<Seed>.input.json`. The ingestion test,
[playtest-ingest.test.ts](../../tests/playtest-ingest.test.ts), loads, validates and runs each one through every
invariant. [wire-seeds.test.ts](../../tests/wire-seeds.test.ts) holds each seed to the code that wrote it.

## C++-replayable: the seeds `writeInput` writes

[export-playtest.ts](../../src/wire/export-playtest.ts) writes these seeds as `writeInput` of a prototype fixture,
together with one output, `prototype-seed.0.ValleyWings.0.output.json`:

- `prototype-seed.0.DefaultChalet.0.input.json`
- `prototype-seed.0.SingleStoreyT.0.input.json`
- `prototype-seed.0.ValleyWings.0.input.json`
- `prototype-seed.0.BridgeOverBlock.0.input.json`
- `prototype-seed.0.Courtyard.0.input.json`
- `prototype-seed.0.OverlapRingConflictSwapped.0.input.json`
- `prototype-seed.0.PortPokeOut300.0.input.json`

`writeInput` gives every side one run, from 0 to the side's whole length, which the C++ replay contains. These seeds
meet all seven conditions of `cppReplayabilityOf` in [golden.ts](../../src/golden.ts), so they are shown to replay
(journal decision 152, amended).

## Not C++-replayable: the hand-edited multi-run seed

`prototype-seed.0.MultiRunSide.0.input.json` is not replayable, on purpose. It is `multiRunDocument` in
[wire-round-trip-cases.ts](../../tests/wire-round-trip-cases.ts), edited by hand to split its S and N sides into
several runs. It has end slack, a junction inside the slack, a gap, and a sliver. `writeInput` writes one run per side,
so this is the only file that tests spec 16's run snap order (journal decisions 167, finding 1, and 179, finding 1).

The C++ does not snap runs. Under containment replay, a lone box's plate run is its whole side, and no split run
contains it. So the seed fails the seventh condition, `isOneWholeRun`, and it stays out of the golden set. Its reason
is `a side not one run from 0 to its length`.

## What the flag means

The `cppReplayable` flag means "shown to replay": a conservative subset of the files the C++ accepts, not that set
exactly (journal decision 182). A file that is not flagged may still replay in the C++. This prototype just cannot
show that it does.

## Line endings

[.gitattributes](./.gitattributes) turns off line-ending conversion for these files, as it does for
[golden/](../../golden/.gitattributes). A seed's bytes then do not depend on the checkout.
