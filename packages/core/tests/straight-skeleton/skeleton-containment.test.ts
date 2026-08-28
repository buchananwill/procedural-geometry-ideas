import {ALL_TEST_POLYGONS} from '@proc-geo/test-fixtures';
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
 * MEASURED 2026-08-28 OVER ALL 48 FIXTURES: zero nodes fall outside by ANY amount, so not one node
 * depends on the band. It is headroom against a legitimately on-boundary node, not slack bought to
 * make the corpus pass — the second test below pins that, so a change which starts leaning on the
 * band is caught rather than passing quietly. NEITHER MAY BE WEAKENED TO ADMIT A FAILURE.
 */

describe('no skeleton node escapes the polygon it was solved from', () => {
    it.each(ALL_TEST_POLYGONS.map(polygon => [polygon.name, polygon.vertices] as const))(
        '%s keeps every interior node inside its boundary',
        (_name, vertices) => {
            expect(escapedNodes(vertices)).toEqual([]);
        },
    );

    it('the corpus needs no tolerance at all: every node is strictly inside', () => {
        const leaning: string[] = [];
        for (const polygon of ALL_TEST_POLYGONS) {
            const {graph} = solveSkeleton(polygon.vertices);
            for (let id = graph.numExteriorNodes; id < graph.nodes.length; id++) {
                if (!isInside(graph.nodes[id].position, polygon.vertices)) {
                    leaning.push(`${polygon.name}: node ${id}`);
                }
            }
        }
        expect(leaning).toEqual([]);
    });
});
