import {ALL_TEST_POLYGONS} from '@proc-geo/test-fixtures';
import {
    CollisionCache,
    CollisionEvent,
    NO_COLLISION_SENTINEL,
    SMALLEST_NORMAL_DOUBLE,
    SkeletonNormalisation,
    StraightSkeletonGraph,
    Vector2,
    denormaliseArea,
    denormaliseCollisionCache,
    denormaliseGraph,
    denormaliseLength,
    denormalisePosition,
    makeSkeletonNormalisation,
    makeStraightSkeletonSolverContext,
    normaliseArea,
    normaliseLength,
    normalisePolygon,
    normalisePosition,
    setSkeletonLogLevel,
    solveSkeleton,
} from '@proc-geo/core';

/*
 * ============================================================================
 *  THE SOLVER'S BOUNDARY TRANSFORM. THESE ASSERTIONS ARE A SPECIFICATION.
 * ============================================================================
 *
 * `FLOATING_POINT_EPSILON` is an ABSOLUTE `1e-8` compared against raw coordinates, so the
 * degeneracy test gets stricter as the polygon grows. Normalising to unit extent on the way in
 * and denormalising on the way out leaves the constant alone and makes it relative by
 * construction. See `normalisation.ts` for the full argument and for the enumeration of what
 * scales — this file guards that enumeration item by item.
 *
 * MEASURED IN THIS REPO WHEN THE TRANSFORM LANDED, over all 37 `ALL_TEST_POLYGONS` (solve +
 * offset ring at 50% of max + strips at the same depth):
 *
 *     translate      0   1e3   1e4   1e5   1e6   1e7   1e8   1e9  1e10  1e11
 *     before        37    37    37    37    37    37    35    37    29    29
 *     after         37    37    37    37    37    37    37    37    37    37
 *
 *     scale       1e-6  1e-4  1e-2     1   1e2   1e4   1e6   1e8
 *     before        37    37    37    37    37    37    27    18
 *     after         37    37    37    37    37    37    37    37
 *
 * `Broken Polygon` translated to 1e8 returned a maximum offset of 308.9784380383704 where its
 * native value is 126.63015964243034; it now returns 126.630159636494 and its offset rings
 * project all the way in.
 */

setSkeletonLogLevel('silent');

function makeGraph(): StraightSkeletonGraph {
    return {
        numExteriorNodes: 2,
        nodes: [
            {id: 0, position: {x: 10, y: 20}, inEdges: [], outEdges: [0]},
            {id: 1, position: {x: 30, y: 20}, inEdges: [0], outEdges: []},
        ],
        edges: [
            {id: 0, source: 0, target: 1, basisVector: {x: 1, y: 0}},
            {id: 1, source: 1, basisVector: {x: 0.6, y: -0.8}},
        ],
        interiorEdges: [
            {id: 1, clockwiseExteriorEdgeIndex: 0, widdershinsExteriorEdgeIndex: 0, length: Number.MAX_VALUE, maxOffset: 4},
            {id: 2, clockwiseExteriorEdgeIndex: 0, widdershinsExteriorEdgeIndex: 0, length: Number.MAX_VALUE},
        ],
    };
}

function makeEvent(overrides: Partial<CollisionEvent> = {}): CollisionEvent {
    return {
        offsetDistance: 3,
        collidingEdges: [4, 5],
        position: {x: 7, y: 9},
        intersectionData: [2, 5, 'converging'],
        eventType: 'interiorPair',
        ...overrides,
    };
}

describe('unit-extent normalisation', () => {
    describe('deriving the transform', () => {
        it('takes the scale from the LONGEST BOUNDING-BOX SIDE, not the diagonal', () => {
            // 40 wide, 30 tall. The diagonal is 50, so a diagonal-based scale would give 1/50.
            const normalisation = makeSkeletonNormalisation([
                {x: 0, y: 0},
                {x: 40, y: 0},
                {x: 40, y: 30},
            ]);

            expect(normalisation.fromUnitScale).toBe(40);
            expect(normalisation.toUnitScale).toBe(1 / 40);
            expect(normalisation.degenerateExtent).toBe(false);
        });

        it('centres on the bounding box, not on the vertex mean', () => {
            const normalisation = makeSkeletonNormalisation([
                {x: -10, y: 4},
                {x: -10, y: 4},
                {x: -10, y: 4},
                {x: 30, y: 24},
            ]);

            expect(normalisation.centre).toEqual({x: 10, y: 14});
        });

        it('leaves no coordinate outside [-0.5, 0.5] after the transform', () => {
            // The point of taking the LONGEST side: the largest magnitude the solver will ever hold
            // is bounded at half a unit whatever the aspect ratio. The one-ulp slack is the
            // subtract-then-multiply rounding, not slack in the rule.
            const bound = 0.5 + Number.EPSILON;
            for (const polygon of ALL_TEST_POLYGONS) {
                const normalisation = makeSkeletonNormalisation(polygon.vertices);
                for (const vertex of normalisePolygon(polygon.vertices, normalisation)) {
                    expect(Math.abs(vertex.x)).toBeLessThanOrEqual(bound);
                    expect(Math.abs(vertex.y)).toBeLessThanOrEqual(bound);
                }
            }
        });

        it('cannot overflow the centre on a box spanning most of the double range', () => {
            // Summing before halving would give Infinity here, and every normalised vertex NaN.
            const huge = Number.MAX_VALUE / 2;
            const normalisation = makeSkeletonNormalisation([
                {x: -huge, y: -huge},
                {x: huge, y: huge},
            ]);

            expect(Number.isFinite(normalisation.centre.x)).toBe(true);
            expect(Number.isFinite(normalisation.centre.y)).toBe(true);
            expect(normalisation.centre).toEqual({x: 0, y: 0});
        });
    });

    describe('degenerate extent does not divide', () => {
        it('treats an EMPTY vertex list as degenerate, centred on the origin', () => {
            const normalisation = makeSkeletonNormalisation([]);

            expect(normalisation.degenerateExtent).toBe(true);
            expect(normalisation.centre).toEqual({x: 0, y: 0});
            expect(normalisation.toUnitScale).toBe(1);
            expect(normalisation.fromUnitScale).toBe(1);
        });

        it('treats ALL VERTICES COINCIDENT as degenerate, keeping the centring translation', () => {
            const normalisation = makeSkeletonNormalisation([
                {x: 5, y: -7},
                {x: 5, y: -7},
                {x: 5, y: -7},
            ]);

            expect(normalisation.degenerateExtent).toBe(true);
            expect(normalisation.centre).toEqual({x: 5, y: -7});
            expect(normalisation.toUnitScale).toBe(1);
            expect(normalisePosition(normalisation, {x: 5, y: -7})).toEqual({x: 0, y: 0});
        });

        it('treats a SUBNORMAL extent as degenerate, because its reciprocal overflows', () => {
            // Number.MIN_VALUE is the smallest SUBNORMAL. 1 / Number.MIN_VALUE is Infinity, and an
            // infinite scale would turn the whole polygon into NaN.
            expect(1 / Number.MIN_VALUE).toBe(Number.POSITIVE_INFINITY);

            const normalisation = makeSkeletonNormalisation([
                {x: 0, y: 0},
                {x: Number.MIN_VALUE, y: 0},
            ]);

            expect(normalisation.degenerateExtent).toBe(true);
            expect(normalisation.toUnitScale).toBe(1);
            expect(Number.isFinite(normalisePosition(normalisation, {x: 0, y: 0}).x)).toBe(true);
        });

        it('accepts the smallest NORMAL extent, which is the boundary of the rule', () => {
            expect(SMALLEST_NORMAL_DOUBLE).toBe(2.2250738585072014e-308);
            expect(Number.isFinite(1 / SMALLEST_NORMAL_DOUBLE)).toBe(true);

            const normalisation = makeSkeletonNormalisation([
                {x: 0, y: 0},
                {x: SMALLEST_NORMAL_DOUBLE, y: 0},
            ]);

            expect(normalisation.degenerateExtent).toBe(false);
            expect(normalisation.fromUnitScale).toBe(SMALLEST_NORMAL_DOUBLE);
        });

        it('treats an INFINITE extent as degenerate', () => {
            const normalisation = makeSkeletonNormalisation([
                {x: -Number.MAX_VALUE, y: 0},
                {x: Number.MAX_VALUE, y: 0},
            ]);

            expect(normalisation.degenerateExtent).toBe(true);
            expect(normalisation.toUnitScale).toBe(1);
        });

        it('treats a NaN extent as degenerate', () => {
            // A NaN side is how an infinite bound actually presents: two vertices both at positive
            // infinity give `Infinity - Infinity`, and `Math.max` propagates the NaN.
            const normalisation = makeSkeletonNormalisation([
                {x: Number.POSITIVE_INFINITY, y: 0},
                {x: Number.POSITIVE_INFINITY, y: 3},
            ]);

            expect(normalisation.degenerateExtent).toBe(true);
            expect(normalisation.toUnitScale).toBe(1);
        });

        it('is BLIND to a lone NaN coordinate, which the bounds scan cannot see', () => {
            // RECORDED, NOT ENDORSED. Every comparison against NaN is false, so a NaN vertex never
            // becomes a minimum or a maximum and the box closes around the finite vertices as though
            // it were not there. The transform is therefore perfectly ordinary and the NaN travels
            // into the solve intact. Rejecting non-finite input is a separate decision, owned
            // alongside `findOrAddNode`; this transform is not the place that catches it.
            const normalisation = makeSkeletonNormalisation([
                {x: 0, y: 0},
                {x: Number.NaN, y: 3},
                {x: 8, y: 3},
            ]);

            expect(normalisation.degenerateExtent).toBe(false);
            expect(normalisation.fromUnitScale).toBe(8);
            expect(Number.isNaN(normalisePosition(normalisation, {x: Number.NaN, y: 3}).x)).toBe(true);
        });

        it('does NOT treat extent on a single axis as degenerate — the longer side wins', () => {
            const horizontal = makeSkeletonNormalisation([
                {x: 0, y: 5},
                {x: 80, y: 5},
                {x: 40, y: 5},
            ]);
            const vertical = makeSkeletonNormalisation([
                {x: 5, y: 0},
                {x: 5, y: 80},
                {x: 5, y: 40},
            ]);

            expect(horizontal.degenerateExtent).toBe(false);
            expect(horizontal.fromUnitScale).toBe(80);
            expect(vertical.degenerateExtent).toBe(false);
            expect(vertical.fromUnitScale).toBe(80);
        });
    });

    describe('positions, lengths and areas travel differently', () => {
        const normalisation = makeSkeletonNormalisation([
            {x: 100, y: 200},
            {x: 300, y: 200},
            {x: 300, y: 260},
        ]);

        it('translates AND scales a position', () => {
            expect(normalisePosition(normalisation, {x: 300, y: 230})).toEqual({x: 0.5, y: 0});
            expect(denormalisePosition(normalisation, {x: 0.5, y: 0})).toEqual({x: 300, y: 230});
        });

        it('scales a length and never translates it', () => {
            // A distance travelled by the wavefront, not a point: the centring term must not touch it.
            expect(normaliseLength(normalisation, 200)).toBe(1);
            expect(denormaliseLength(normalisation, 1)).toBe(200);
            expect(normaliseLength(normalisation, 0)).toBe(0);
        });

        it('scales an area as the SQUARE', () => {
            expect(normaliseArea(normalisation, 200 * 200)).toBe(1);
            expect(denormaliseArea(normalisation, 1)).toBe(40000);
            expect(denormaliseArea(normalisation, 0.25)).toBe(10000);
        });

        it('round-trips a position back to where it started, to within a few ulps', () => {
            for (const polygon of ALL_TEST_POLYGONS) {
                const forPolygon = makeSkeletonNormalisation(polygon.vertices);
                for (const vertex of polygon.vertices) {
                    const round = denormalisePosition(forPolygon, normalisePosition(forPolygon, vertex));
                    expect(round.x).toBeCloseTo(vertex.x, 9);
                    expect(round.y).toBeCloseTo(vertex.y, 9);
                }
            }
        });
    });

    describe('denormalising a graph applies exactly the documented enumeration', () => {
        const normalisation: SkeletonNormalisation = {
            centre: {x: 1000, y: -500},
            toUnitScale: 1 / 8,
            fromUnitScale: 8,
            degenerateExtent: false,
        };

        it('translates and scales every node position', () => {
            const graph = makeGraph();
            denormaliseGraph(graph, normalisation);

            expect(graph.nodes[0].position).toEqual({x: 1080, y: -340});
            expect(graph.nodes[1].position).toEqual({x: 1240, y: -340});
        });

        it('scales maxOffset WITHOUT translating it, and leaves an absent one absent', () => {
            const graph = makeGraph();
            denormaliseGraph(graph, normalisation);

            expect(graph.interiorEdges[0].maxOffset).toBe(32);
            expect(graph.interiorEdges[1].maxOffset).toBeUndefined();
        });

        it('leaves the InteriorEdge.length sentinel untouched', () => {
            const graph = makeGraph();
            denormaliseGraph(graph, normalisation);

            expect(graph.interiorEdges[0].length).toBe(Number.MAX_VALUE);
            expect(graph.interiorEdges[1].length).toBe(Number.MAX_VALUE);
        });

        it('leaves ids, sources and targets untouched', () => {
            const graph = makeGraph();
            denormaliseGraph(graph, normalisation);

            expect(graph.edges.map(edge => [edge.id, edge.source, edge.target])).toEqual([
                [0, 0, 1],
                [1, 1, undefined],
            ]);
            expect(graph.numExteriorNodes).toBe(2);
        });

        it('leaves every basisVector BIT-FOR-BIT unchanged', () => {
            // ASSERTED WITH Object.is, NOT A TOLERANCE, DELIBERATELY. A basis vector is a unit
            // DIRECTION: a uniform positive scale does not rotate it, and scaling it would destroy
            // the unit length every ray distance and every derived offset is measured against. A
            // scaled unit vector is still very nearly unit at these magnitudes, so a tolerance
            // would pass the exact defect this guards.
            const graph = makeGraph();
            const before = graph.edges.map(edge => ({...edge.basisVector}));

            denormaliseGraph(graph, normalisation);

            graph.edges.forEach((edge, index) => {
                expect(Object.is(edge.basisVector.x, before[index].x)).toBe(true);
                expect(Object.is(edge.basisVector.y, before[index].y)).toBe(true);
            });
        });
    });

    describe('denormalising a collision cache', () => {
        const normalisation: SkeletonNormalisation = {
            centre: {x: 1000, y: -500},
            toUnitScale: 1 / 8,
            fromUnitScale: 8,
            degenerateExtent: false,
        };

        function cacheWith(...events: CollisionEvent[]): CollisionCache {
            return new Map([[4, new Map([[5, events]])]]);
        }

        it('scales the offset distance and both ray-unit distances, and moves the position', () => {
            const event = makeEvent();
            denormaliseCollisionCache(cacheWith(event), normalisation);

            expect(event.offsetDistance).toBe(24);
            expect(event.position).toEqual({x: 1056, y: -428});
            expect(event.intersectionData[0]).toBe(16);
            expect(event.intersectionData[1]).toBe(40);
        });

        it('leaves the intersection TYPE and the colliding-edge ids alone', () => {
            const event = makeEvent();
            denormaliseCollisionCache(cacheWith(event), normalisation);

            expect(event.intersectionData[2]).toBe('converging');
            expect(event.collidingEdges).toEqual([4, 5]);
            expect(event.eventType).toBe('interiorPair');
        });

        it('lets infinities survive the multiply, because the no-collision outcomes need them', () => {
            const event = makeEvent({
                intersectionData: [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 'parallel'],
            });
            denormaliseCollisionCache(cacheWith(event), normalisation);

            expect(event.intersectionData[0]).toBe(Number.POSITIVE_INFINITY);
            expect(event.intersectionData[1]).toBe(Number.NEGATIVE_INFINITY);
        });

        it('steps over the no-collision sentinel', () => {
            const cache: CollisionCache = new Map([[4, new Map([[5, NO_COLLISION_SENTINEL]])]]);

            expect(() => denormaliseCollisionCache(cache, normalisation)).not.toThrow();
            expect(cache.get(4)!.get(5)).toBe(NO_COLLISION_SENTINEL);
        });
    });

    describe('the solve boundary', () => {
        const square: Vector2[] = [
            {x: 100, y: 100},
            {x: 100, y: 500},
            {x: 500, y: 500},
            {x: 500, y: 100},
        ];

        it('surfaces the transform it used on the result, already undone on the graph', () => {
            const result = solveSkeleton(square);

            expect(result.normalisation.fromUnitScale).toBe(400);
            expect(result.normalisation.centre).toEqual({x: 300, y: 300});
            expect(result.normalisation.degenerateExtent).toBe(false);

            // The graph is back in the caller's coordinates, not in unit space.
            const boundary = result.graph.nodes.slice(0, result.graph.numExteriorNodes).map(node => node.position);
            expect(boundary).toEqual(square);
        });

        it('is the seam a consumer scales its own length- and area-dimensioned inputs across', () => {
            const result = solveSkeleton(square);

            // A 20-unit strip depth is 0.05 of the unit-extent square; a 400-unit^2 minimum parcel
            // is 0.0025 of its area. The square is the ratio, not the factor.
            expect(normaliseLength(result.normalisation, 20)).toBe(0.05);
            expect(normaliseArea(result.normalisation, 400)).toBe(0.0025);
            expect(denormaliseLength(result.normalisation, 0.05)).toBe(20);
            expect(denormaliseArea(result.normalisation, 0.0025)).toBe(400);
        });

        it("carries a solved graph's basisVectors out BIT-FOR-BIT as the solver computed them", () => {
            // The decisive form of the direction rule, end to end. Every exterior basis vector in a
            // returned graph must be the one derived from the UNIT-SPACE boundary, unchanged — not a
            // version of it multiplied by the extent on the way out. Compared with Object.is.
            const placed = ALL_TEST_POLYGONS[0].vertices.map(vertex => ({x: vertex.x * 250 + 1e6, y: vertex.y * 250 + 1e6}));
            const result = solveSkeleton(placed);

            const unit = normalisePolygon(placed, makeSkeletonNormalisation(placed));
            const reference = makeStraightSkeletonSolverContext(unit).graph;

            expect(result.graph.numExteriorNodes).toBe(reference.numExteriorNodes);
            for (let edgeId = 0; edgeId < reference.numExteriorNodes; edgeId++) {
                expect(Object.is(result.graph.edges[edgeId].basisVector.x, reference.edges[edgeId].basisVector.x)).toBe(true);
                expect(Object.is(result.graph.edges[edgeId].basisVector.y, reference.edges[edgeId].basisVector.y)).toBe(true);
            }
        });

        it('reports a degenerate transform rather than dividing, for a polygon of no extent', () => {
            const collapsed: Vector2[] = [
                {x: 42, y: 42},
                {x: 42, y: 42},
                {x: 42, y: 42},
            ];

            const result = solveSkeleton(collapsed);

            expect(result.normalisation.degenerateExtent).toBe(true);
            expect(result.normalisation.toUnitScale).toBe(1);
            for (const node of result.graph.nodes) {
                expect(Number.isFinite(node.position.x)).toBe(true);
                expect(Number.isFinite(node.position.y)).toBe(true);
            }
        });
    });
});
