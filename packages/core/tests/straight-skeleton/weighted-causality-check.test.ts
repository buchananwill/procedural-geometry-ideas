/*
 * THE CAUSALITY CHECK READS WEIGHTS (docs/notes/ISSUE-skeleton-causality-check-ignores-weights.md; BSA.F101, BSA.D309).
 *
 * The solver's `checkWavefrontCausality` and the test side's `causalityViolations` used to date a node by its
 * DISTANCE from one parent and compare that with distances, so on weighted input they reported correct skeletons.
 * Both now compare TIMES: offset asks that a node's time not decrease along an edge, and clearance asks that a node at
 * time `t` lie at least `w_min · t` from every wall, `w_min` the slowest wall's weight.
 *
 *  - Every weighted fixture that solves is first shown correct by two weight-aware properties written here
 *    independently of both oracles (one time at every interior node; no edge backwards in it), and then asserted to
 *    carry no causality diagnostic from either oracle. Four of them carried false reports before (BSA.F101).
 *  - The stronger clearance reading, at least `w · t` from each wall of weight `w`, is shown false on `Weighted L`:
 *    the weight-4 shelf's face closes before its front nears node 8, which lies 1.41 from the shelf at time 1.
 */
import type {Vector2} from '@proc-geo/core';
import {setSkeletonLogLevel, solveSkeleton} from '@proc-geo/core';
import {WEIGHTED_FAST_SHELF_L, WEIGHTED_TEST_POLYGONS} from '@proc-geo/test-fixtures';
import {equiTimeViolations, timeOrderViolations} from './holed-test-helpers';
import {causalityViolations, distanceToSegment} from './wavefront-measurement-helpers';

setSkeletonLogLevel('silent');

const extentOf = (vertices: Vector2[]) => Math.max(1, ...vertices.flatMap(v => [Math.abs(v.x), Math.abs(v.y)]));

/** The weighted fixtures `solveSkeleton` accepts at the door (two are refusal fixtures and throw). */
const SOLVABLE = WEIGHTED_TEST_POLYGONS.filter(fixture => {
    try {
        solveSkeleton(fixture.vertices, {weights: fixture.weights});
        return true;
    } catch {
        return false;
    }
});

describe('the causality check on weighted input compares times (BSA.D309)', () => {
    it('solves ten of the weighted fixtures, every one complete', () => {
        expect(SOLVABLE).toHaveLength(10);
        expect(SOLVABLE.filter(fixture => !solveSkeleton(fixture.vertices, {weights: fixture.weights}).complete)).toEqual([]);
    });

    describe.each([1e-6, 1e-5])('at the perceptual floor %s', perceptualFloor => {
        it.each(SOLVABLE.map(fixture => [fixture.name, fixture] as const))(
            '%s: correct by equal time and time order, and reported by neither oracle', (_name, fixture) => {
                const result = solveSkeleton(fixture.vertices, {weights: fixture.weights, perceptualFloor});
                const tolerance = 1e-9 * extentOf(fixture.vertices);
                expect(equiTimeViolations(result.graph, tolerance)).toEqual([]);
                expect(timeOrderViolations(result.graph, tolerance)).toEqual([]);
                expect(result.diagnostics
                    .flatMap(diagnostic => diagnostic.kind === 'causality-violation'
                        ? [`${diagnostic.oracle} ${diagnostic.elementId}`] : [])).toEqual([]);
                expect(causalityViolations(result.graph, result.normalisation, perceptualFloor))
                    .toEqual({offset: [], clearance: [], direction: []});
            });
    });

    it('Weighted L: a correct node lies nearer the fast shelf than w · t, so clearance is bounded by the slowest wall', () => {
        const {graph} = solveSkeleton(WEIGHTED_FAST_SHELF_L.vertices, {weights: WEIGHTED_FAST_SHELF_L.weights});
        // Node 8 at (1, 1) is equidistant, 1, from the left wall, the floor and the riser x = 2, all of weight 1.
        const node = graph.nodes.find(candidate => candidate.id >= graph.numExteriorNodes
            && Math.hypot(candidate.position.x - 1, candidate.position.y - 1) < 1e-9)!;
        expect(node).toBeDefined();
        // The shelf, from (2, 2) to (6, 2), has weight 4: unobstructed, its front would be 4 from it at time 1.
        const shelf = graph.edges.slice(0, graph.numExteriorNodes).find(edge => graph.exteriorWeights[edge.id] === 4)!;
        const from = graph.nodes[shelf.source].position;
        const to = graph.nodes[shelf.target!].position;
        expect([from.x, from.y, to.x, to.y].map(value => +value.toFixed(9))).toEqual([2, 2, 6, 2]);
        expect(distanceToSegment(node.position, from, to)).toBeCloseTo(Math.SQRT2, 12);
        expect(4 * 1).toBeGreaterThan(distanceToSegment(node.position, from, to));
        // ...and no causality diagnostic, because no correct node lies nearer any wall than the slowest front's reach.
        expect(Math.min(...graph.exteriorWeights) * 1).toBeLessThanOrEqual(distanceToSegment(node.position, from, to));
    });
});
