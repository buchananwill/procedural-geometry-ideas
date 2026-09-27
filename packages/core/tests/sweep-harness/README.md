# Full-grid sweep harness

The instrument the C12 attempts were measured with (journal-5 decisions 172–177, findings
F80–F83). It solves every cell of the measurement grid and writes one JSON signature per
cell — completion, node and edge counts, the four causality oracles (solver and test-side),
the rate oracle, tiling error at depth fractions 0.2 / 0.5 / 1.0, the tree property and a
graph hash — so that two trees can be compared cell by cell.

**Provenance.** Rebuilt by the decision-176 delegate from the decision-171 delegate's
`sweep.ts`; validated to reproduce the earlier `v0` baseline bit for bit on `c6a510d`
(31,599 solves, 0 field differences). Copied into the repo at session close (decision 178)
because the scratchpad it lived in is session-specific.

**The grid** (`sweep.ts`, `runSweep(out, group)`):

| group       | cells  | what                                                                 |
|-------------|--------|----------------------------------------------------------------------|
| `corpus`    | 120    | `FULL_CORPUS` at floors 1e-6 and 1e-5                                |
| `fine`      | 92     | Circle 48 and Rosette5 40 at the 46 fine translations                |
| `offedge`   | 160    | the off-edge 1e-3 jitter grid, stage on (reflex L and plus, k × seed) |
| `alongedge` | 160    | the along-edge 1.0 jitter grid, stage off                            |
| `ladder`    | 48     | the jittered Circle 32 ladder (1/3/10/15/30/100 ×, seeds 0–7)        |
| `regular`   | 62     | the regular circles of the vertex-count sweep                        |

`runRegions(out, depthFraction, tag)` re-solves every level > 0 node of the census-grid
trees (merge groups 1–4, three levels, residue `'recurse'`) on its own boundary with the
root floor restated in the region's own space — 31,693 regions at depth fractions
0.25 / 0.6 / 1.

**Running it.** It is NOT part of the normal suite: the driver `sweep-harness.test.ts`
skips unless `SWEEP_OUT` is set. From `packages/core`:

```
SWEEP_OUT=<prefix> node ~/AppData/Roaming/npm/node_modules/pnpm/bin/pnpm.cjs test --testPathPatterns=sweep-harness
```

writes `<prefix>-<group>.json` and `<prefix>-regions-<tag>.json` (~2 minutes for the root
cells; the regions take longer). Compare two prefixes with a per-cell diff of the JSON
files; classify a moved cell as CURE (a failure or violation gone), NEUTRAL (sub-floor
structure — node count up, oracles clean, tiling at machine precision, tree held) or
REGRESSION (stopped solving, an oracle rise, tiling worse than machine precision, tree
lost) — the categories journal-5 decision 171(d) and F80 use.

**Machine-precision bars used for tiling** (from the decision-172 delegate): root cells
1e-14; regions 1e-12 (the recursion test's `AREA_TOLERANCE_FRACTION`); translated cells
`ε·T/75`.
