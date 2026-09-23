import {CLEAN_TEST_POLYGONS, FULL_CORPUS, KNOWN_DEFECT_POLYGONS} from '@proc-geo/test-fixtures';
import {solveSkeleton} from '@proc-geo/core';
import {escapedNodes, isInside} from './containment-helpers';

/*
 * ============================================================================
 *  EVERY SKELETON NODE LIES INSIDE THE POLYGON IT WAS SOLVED FROM.
 * ============================================================================
 *
 * The straight skeleton is the locus of the boundary's own vertices as the wavefront moves INWARD,
 * so no point of it can lie outside the boundary. That is a property of the definition rather than
 * of any particular algorithm, which makes it the cheapest possible check on a solve that reports
 * success: a bisector that escapes the perimeter is a wrong answer no completeness flag can catch,
 * and until this file existed nothing in the suite would have noticed one.
 *
 * WHY IT WAS WRITTEN. On 2026-08-28 both `SLIGHTLY_DEFORMED_PEANUT_1/2` reported `complete: true`
 * with empty diagnostics while a waist bisector left the polygon entirely — variant 2's terminal
 * node sat 40 units outside a 410-unit shape. Every other assertion in the suite was satisfied by
 * that wrong skeleton. The defect and its fix are recorded in `slightly-deformed-peanut.test.ts`.
 *
 * ----------------------------------------------------------------------------
 * THE TOLERANCE, AND WHY IT IS NOT DOING ANY WORK
 * ----------------------------------------------------------------------------
 *
 * A node passes if the even-odd test puts it inside, OR if it lies within `containmentTolerance` of
 * the boundary — the solver's absolute epsilon carried into caller space by the polygon's extent.
 * The band exists because a terminal node CAN legitimately land on the boundary and an even-odd
 * test is knife-edged there.
 *
 * MEASURED 2026-08-28 OVER ALL 56 FIXTURES: zero nodes fall outside by ANY amount, so not one node
 * depends on the band. It is headroom against a legitimately on-boundary node, not slack bought to
 * make the corpus pass — the second test below pins that, so a change which starts leaning on the
 * band is caught rather than passing quietly. NEITHER MAY BE WEAKENED TO ADMIT A FAILURE.
 *
 * ----------------------------------------------------------------------------
 * CONTAINMENT IS UNIVERSAL, MEASURED RATHER THAN ASSUMED — journal decision 72
 * ----------------------------------------------------------------------------
 *
 * Decision 72 enrolled the seven known-defect fixtures and required each invariant to be swept over
 * them and pinned at whatever actually holds. Containment HOLDS on all seven, including the three
 * whose roots solve while the recursive driver still fails on regions cut out of them, and including
 * the two that fail only at large translations. So this sweep runs the FULL CORPUS at one bar: a
 * fixture carrying a known defect is not licensed to put a node outside its own boundary.
 *
 * THAT IS A REAL RESULT AND NOT A VACUOUS ONE. Containment caught none of the wavefront-causality
 * damage those same fixtures carry — `wavefront-causality.test.ts` records offset, clearance and
 * direction violations on four of them, three of which report `complete: true` — so the two files
 * are auditing different things and this one is the weaker of the pair. It is kept universal
 * because the defect it was written for is the one that escapes the polygon.
 */

describe('no skeleton node escapes the polygon it was solved from', () => {
    it.each(FULL_CORPUS.map(polygon => [polygon.name, polygon.vertices] as const))(
        '%s keeps every interior node inside its boundary',
        (_name, vertices) => {
            expect(escapedNodes(vertices)).toEqual([]);
        },
    );

    it('the full corpus needs no tolerance at all: every node is strictly inside', () => {
        const leaning: string[] = [];
        for (const polygon of FULL_CORPUS) {
            const {graph} = solveSkeleton(polygon.vertices);
            for (let id = graph.numExteriorNodes; id < graph.nodes.length; id++) {
                if (!isInside(graph.nodes[id].position, polygon.vertices)) {
                    leaning.push(`${polygon.name}: node ${id}`);
                }
            }
        }
        expect(leaning).toEqual([]);
    });

    it('sweeps both rosters at their pinned sizes, so neither half can go quiet unnoticed', () => {
        // The guard on the sweep's own reach, and it is ABSOLUTE rather than relative on purpose:
        // `FULL_CORPUS` is built by concatenation, so a roster that lost a fixture upstream would
        // shrink this file's coverage while a `clean + defect` identity went on passing. The sizes
        // are the two rosters as ruled — 53 clean and 6 known-defect since 2026-08-28, when journal
        // decision 90's corridor-midline fix promoted `Collinear Dumbbell` out of the defect roster
        // and enrolled `Asymmetric Dumbbell` and `Three Globe Chain` beside it. Before that the
        // split was 50 and 7: the 49 of decision 73, plus `Invisible Vertex Rectangle` added under
        // decision 75, against the 7 known-defect of decision 72.
        //
        // 6 -> 7 known-defect: `Offset Cross Junction` enrolled 2026-09-23, decision 151(d). Its
        // containment signature is the clean one — every node of its partial graph strictly inside,
        // asserted by the sweep above.
        expect(CLEAN_TEST_POLYGONS).toHaveLength(53);
        expect(KNOWN_DEFECT_POLYGONS).toHaveLength(7);
        expect(FULL_CORPUS).toHaveLength(CLEAN_TEST_POLYGONS.length + KNOWN_DEFECT_POLYGONS.length);
    });
});

/*
 * ============================================================================
 *  SIGNALLED, NEVER SILENT: a complete solve strands no geometry.
 * ============================================================================
 *
 * `complete` is what every consumer reads, so the failure mode that matters most is a solve that
 * reports success while leaving geometry behind. Two things can be left behind and both are checked
 * over the FULL CORPUS, defect fixtures included, because the point of enrolling a defect fixture is
 * that its wrongness stays visible rather than becoming licensed:
 *
 *  - an interior edge that never acquired a target node, so the skeleton has a dangling ray;
 *  - a node outside the polygon, which the sweep above owns.
 *
 * MEASURED 2026-08-28: it holds on all 56 fixtures. The unresolved-edge half is near-tautological —
 * `solveSkeleton` sets `complete` false when it emits an `unresolved-edges` diagnostic — and it is
 * asserted anyway, from the GRAPH rather than from the diagnostics, so that a future change which
 * stopped emitting the diagnostic would be caught by the geometry instead of hidden by it.
 *
 * WHAT THIS DOES NOT COVER, AND MUST NOT BE READ AS COVERING. `COLLINEAR_DUMBBELL` passes here: it
 * reports `complete: true`, strands no edge and escapes nowhere, while its strips overlap by a tenth
 * of its area. Silence about STRANDED geometry is not silence about WRONG geometry, and the
 * dumbbell's overlap is pinned in `collinear-dumbbell.test.ts` where it is measurable.
 */

describe('a complete solve strands nothing', () => {
    it.each(FULL_CORPUS.map(polygon => [polygon.name, polygon.vertices] as const))(
        '%s leaves no interior edge without a target when it reports complete',
        (_name, vertices) => {
            const {graph, complete} = solveSkeleton(vertices);
            if (!complete) return;
            const stranded = graph.interiorEdges
                .filter(interiorEdge => graph.edges[interiorEdge.id]?.target === undefined)
                .map(interiorEdge => interiorEdge.id);
            expect(stranded).toEqual([]);
        },
    );

    it('is not vacuous: every fixture in the corpus but the one pinned incomplete reports complete', () => {
        // If every fixture were incomplete the sweep above would assert nothing at all. Since the
        // parallel-vertex closure cured `Off-edge Jitter Plus (seed 7919)`, the corpus's last
        // incomplete root, the whole of FULL_CORPUS reached the assertion — until 2026-09-23, when
        // `Offset Cross Junction` was enrolled (decision 151(d)) as a root that fails: its three
        // stranded bisectors (26, 27, 32) are reported by `unresolved-edges` and `complete` is false,
        // which is this suite's signature for it. It also makes the incomplete branch below live on a
        // corpus fixture again.
        const incomplete = FULL_CORPUS
            .filter(polygon => !solveSkeleton(polygon.vertices).complete)
            .map(polygon => polygon.name);
        expect(incomplete).toEqual(['Offset Cross Junction']);
    });

    it('still exercises the incomplete branch, on a BUILT specimen', () => {
        // SPECIMEN DEBT, PAID THE WAY THE CORE PRECEDENT PAYS IT (journal F15a/F15c): the early
        // return above needs an incomplete solve to be more than dead code, and the corpus no longer
        // has one. A counter-clockwise ring solved with winding normalisation off is the smallest
        // construction that produces one — `runAlgorithmV5`'s own documented silent-failure mode —
        // and unlike a fixture it cannot be cured out from under this test.
        const counterClockwiseSquare = [{x: 0, y: 0}, {x: 10, y: 0}, {x: 10, y: 10}, {x: 0, y: 10}];
        const {graph, complete} = solveSkeleton(counterClockwiseSquare, {normaliseWinding: false});

        expect(complete).toBe(false);
        expect(graph.interiorEdges
            .filter(interiorEdge => graph.edges[interiorEdge.id]?.target === undefined))
            .not.toEqual([]);
    });
});
