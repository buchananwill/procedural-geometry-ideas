WRONG SOLUTION:

```json
[
  {
    "x": 357.1282238,
    "y": 266.8750977431804
  },
  {
    "x": 430.4404646055483,
    "y": 357.46022576060363
  },
  {
    "x": 465.2756478344818,
    "y": 456.430337904654
  },
  {
    "x": 538.8299926295774,
    "y": 504.5666263934779
  },
  {
    "x": 547.3151281996757,
    "y": 571.6139326938707
  },
  {
    "x": 527.8194717090279,
    "y": 659.1000350506195
  },
  {
    "x": 717.433783622365,
    "y": 838.1506004222233
  },
  {
    "x": 701.080700845706,
    "y": 951.2318808490918
  },
  {
    "x": 666.7465397988484,
    "y": 967.2622963781478
  },
  {
    "x": 606.2563504682785,
    "y": 989.294636891941
  },
  {
    "x": 615.6312171809441,
    "y": 1059.0384833177984
  },
  {
    "x": 681.8418242277202,
    "y": 1095.6031176319032
  },
  {
    "x": 659.814337972926,
    "y": 1184.1808770260811
  },
  {
    "x": 652.9945814577154,
    "y": 1244.0867682557907
  },
  {
    "x": 710.567476036075,
    "y": 1272.01884342682
  },
  {
    "x": 685.9904565659375,
    "y": 1354.883122263904
  },
  {
    "x": 600.0864698618002,
    "y": 1407.4593002303786
  },
  {
    "x": 579.29508351339,
    "y": 1467.9730267970865
  },
  {
    "x": 629.5743438920324,
    "y": 1509.6374955488552
  },
  {
    "x": 683.1378894521803,
    "y": 1493.0233615156585
  },
  {
    "x": 724.1324012109544,
    "y": 1403.8453906531354
  },
  {
    "x": 735.9333850966899,
    "y": 1320.7549841192697
  },
  {
    "x": 712.1855023808566,
    "y": 1259.9002700896351
  },
  {
    "x": 718.7004867874936,
    "y": 1206.015909453782
  },
  {
    "x": 744.8440350486887,
    "y": 1163.641630735596
  },
  {
    "x": 805.9385138436218,
    "y": 1139.4253845961139
  },
  {
    "x": 833.0552152741028,
    "y": 1092.2498334387924
  },
  {
    "x": 832.1275480966812,
    "y": 1027.9778986287881
  },
  {
    "x": 889.7170171501264,
    "y": 963.0489532435678
  },
  {
    "x": 973.0865408347017,
    "y": 907.7290747225239
  },
  {
    "x": 994.5195663888803,
    "y": 849.9366426326947
  },
  {
    "x": 756.6161044477649,
    "y": 566.9433956383427
  }
]
```

EXPLANATION:

e43, aka the bisector formed at n11, the target of e10, is registering a false collision with e27. This should be
impossible, because as e10 expands, it must necessarily crash into e26 before is can reach e27. However, in the narrow
window where n27 is pointing just near the end of e7, the vector created by the candidate e82 causes the length of e27
to suddenly "explode" from the perspective of the current evaluator code. This falsely promotes e27 above e26 for
candidacy to collide with the expanding e10, via bisector e43.

## ROOT CAUSE — confirmed, with one refinement

The hypothesis is correct in substance. e43 does register a false split against e27, and e27's active segment does
suddenly explode. The refinement is *why* it explodes: the trigger is temporal, not angular.

`validateSplitReachesEdge` in [solver-context.ts](../../packages/core/src/straight-skeleton/solver-context.ts) decides
whether a bisector can reach an edge by reconstructing that edge's active wavefront segment at the candidate offset. It
does so with `vertexAtOffset`, which walks each bounding bisector by `offset - sourceOffsetDistance(bisector)`.

Nothing checked that the bounding bisector *exists* at the offset being queried.

Instrumenting the failing run shows e43 → e27 tested 26 times:

| bounding bisectors | local offset | reconstructed segment | verdict |
|--------------------|--------------|-----------------------|---------|
| e60 / e59 (× 24)   | +44.15       | 109.7                 | rejected — correct |
| e60 / **e83**      | **−25.71**   | **201.1**             | **accepted — the bug** |

e83 is born at offset 69.86, but the split is being evaluated at offset 44.15. The local offset is therefore negative,
and `vertexAtOffset` walks the endpoint *backwards* along the bisector — lengthening the segment instead of shrinking
it. e27's wavefront is reconstructed as 201.1 units against a true edge length of 86.8, which is easily long enough for
e43's ray to appear to strike it. e26 no longer occludes anything, because the thing it was occluding has been inflated
past it.

In the adjusted polygon that segment never arises: all 24 evaluations use e60/e59 at a positive local offset and are
correctly rejected.

So the edge does explode, and it does falsely outrank e26 — but because it is being measured at a moment before one of
its own delimiters exists, not because of a near-parallel basis vector. (Near-parallel bases *do* cause large
extrapolations elsewhere in this polygon — e22's segment reaches 586× its true length — but that happens identically in
both variants and is not what separates them.)

## FIX

Reject any segment whose bounding bisector has not yet been born at the offset under test. A bisector that begins at
offset *s* says nothing about the wavefront at any offset < *s*, so extrapolating it backwards describes geometry that
never existed.

## HOW IT IS TESTED

The difficulty is that the bad output is *locally impeccable*. These all pass on the broken result and so cannot
discriminate:

- the skeleton is planar — no self-crossings, no boundary crossings
- every bisector is exactly equidistant from its two parent edges
- every node is at or inside its clearance from the boundary
- the skeleton faces tile the polygon with **zero** area mismatch

What is wrong is the *ordering in time*. The wavefront moves inward monotonically, so along any skeleton edge the offset
must not decrease: an event cannot precede the event that caused it. The broken output contains exactly one such edge —
interior edge 90, running from a node at offset 71.643 to a node at offset 62.697, backwards by 8.946.

[wavefront-causality.test.ts](../../packages/core/tests/straight-skeleton/wavefront-causality.test.ts) asserts this. It
re-derives every node's offset from raw geometry — perpendicular distance to a defining edge's supporting line — rather
than trusting the solver's own timing records, and hard-codes no expected output. Without the fix it fails the FAILS
fixture and passes the PASSES fixture; the invariant is also applied to every fixture in `ALL_TEST_POLYGONS`, all of
which satisfy it both before and after, so it is not merely a stricter filter.

Fixtures: `PREMATURE_BISECTOR_SPLIT_FAILS` and `PREMATURE_BISECTOR_SPLIT_PASSES` in
[premature-bisector-split.ts](../../packages/test-fixtures/src/premature-bisector-split.ts).

### A second defect, found while measuring the fix's blast radius

The guard fires 101 times across the 37 fixtures but changes the outcome only 5 times, in two fixtures. The second is
`FAILURE_CASE_DOUBLE_SPACESHIP_V2`, which was already carrying an unrelated-looking defect from the same root cause:
one of its nodes sat 4.369 units *further* from the boundary than its own offset. Since the mitered wavefront always
covers at least as much ground as an eroding disc of the same radius, a node that outruns its clearance has been placed
where the wavefront had already passed.

That defect is invisible to the causality check — the spaceship's offsets are monotonic either way — so the test file
asserts clearance separately. The two invariants are complementary:

| fixture | causality violation | clearance violation |
|---------|---------------------|---------------------|
| Premature Bisector Split (fails) | 1 → 0 | 0 → 0 |
| V2 Double Reflex Spaceship (fails) | 0 → 0 | 1 → 0 |

Across all 37 fixtures, both invariants now hold with zero violations.

## KNOWN LIMITATION OF THE CURRENT FIX

The guard *declines to answer* rather than answering correctly. When a delimiter has not been born, the honest question
is "what bounded this edge at that offset instead?" — and the answer is that bisector's predecessor in the event tree.
The current fix rejects the segment outright, so it can in principle suppress a legitimate split whose delimiter simply
needs walking back one generation. No fixture exhibits that today, but nothing rules it out.

The deeper question this exposes: `activeExteriorEdgeSegments` returns the segmentation as of *now*, while
`validateSplitReachesEdge` asks about an arbitrary past offset. The segmentation is not versioned by offset, so the two
can disagree. The premature bisector is one symptom of that mismatch; a full fix makes the segment query offset-aware.

RIGHT SOLUTION in same region, reached by adjusting n27:

```json
[
  {
    "x": 357.1282238,
    "y": 266.8750977431804
  },
  {
    "x": 430.4404646055483,
    "y": 357.46022576060363
  },
  {
    "x": 465.2756478344818,
    "y": 456.430337904654
  },
  {
    "x": 538.8299926295774,
    "y": 504.5666263934779
  },
  {
    "x": 547.3151281996757,
    "y": 571.6139326938707
  },
  {
    "x": 527.8194717090279,
    "y": 659.1000350506195
  },
  {
    "x": 717.433783622365,
    "y": 838.1506004222233
  },
  {
    "x": 701.080700845706,
    "y": 951.2318808490918
  },
  {
    "x": 666.7465397988484,
    "y": 967.2622963781478
  },
  {
    "x": 606.2563504682785,
    "y": 989.294636891941
  },
  {
    "x": 615.6312171809441,
    "y": 1059.0384833177984
  },
  {
    "x": 681.8418242277202,
    "y": 1095.6031176319032
  },
  {
    "x": 659.814337972926,
    "y": 1184.1808770260811
  },
  {
    "x": 652.9945814577154,
    "y": 1244.0867682557907
  },
  {
    "x": 710.567476036075,
    "y": 1272.01884342682
  },
  {
    "x": 685.9904565659375,
    "y": 1354.883122263904
  },
  {
    "x": 600.0864698618002,
    "y": 1407.4593002303786
  },
  {
    "x": 579.29508351339,
    "y": 1467.9730267970865
  },
  {
    "x": 629.5743438920324,
    "y": 1509.6374955488552
  },
  {
    "x": 683.1378894521803,
    "y": 1493.0233615156585
  },
  {
    "x": 724.1324012109544,
    "y": 1403.8453906531354
  },
  {
    "x": 735.9333850966899,
    "y": 1320.7549841192697
  },
  {
    "x": 712.1855023808566,
    "y": 1259.9002700896351
  },
  {
    "x": 718.7004867874936,
    "y": 1206.015909453782
  },
  {
    "x": 744.8440350486887,
    "y": 1163.641630735596
  },
  {
    "x": 805.9385138436218,
    "y": 1139.4253845961139
  },
  {
    "x": 833.0552152741028,
    "y": 1092.2498334387924
  },
  {
    "x": 833.181108337827,
    "y": 1028.5045088586703
  },
  {
    "x": 889.7170171501264,
    "y": 963.0489532435678
  },
  {
    "x": 973.0865408347017,
    "y": 907.7290747225239
  },
  {
    "x": 994.5195663888803,
    "y": 849.9366426326947
  },
  {
    "x": 756.6161044477649,
    "y": 566.9433956383427
  }
]
```