import {
    collisionDistanceFromBasisUnits,
    sourceOffsetDistance,
} from '@/algorithms/straight-skeleton/collision-helpers';
import {
    createBisectionInteriorEdge,
} from '@/algorithms/straight-skeleton/algorithm-helpers';
import {makeStraightSkeletonSolverContext} from '@/algorithms/straight-skeleton/solver-context';
import {crossProduct, subtractVectors, normalize} from '@/algorithms/straight-skeleton/core-functions';
import {
    SYMMETRICAL_OCTAGON,
} from '@/algorithms/straight-skeleton/test-cases/test-constants';


// ---------------------------------------------------------------------------
// collisionDistanceFromBasisUnits
// ---------------------------------------------------------------------------

describe('collisionDistanceFromBasisUnits', () => {
    it('returns positive value for perpendicular vectors', () => {
        // crossProduct({1,0}, {0,1}) = 1*1 - 0*0 = 1;  5 * 1 = 5
        const result = collisionDistanceFromBasisUnits({x: 1, y: 0}, 5, {x: 0, y: 1});
        expect(result).toBeCloseTo(5);
    });

    it('returns 0 when units is 0', () => {
        const result = collisionDistanceFromBasisUnits({x: 1, y: 0}, 0, {x: 0, y: 1});
        expect(result).toBe(0);
    });

    it('returns 0 when vectors are parallel (cross product is 0)', () => {
        // crossProduct({1,0}, {1,0}) = 1*0 - 0*1 = 0
        const result = collisionDistanceFromBasisUnits({x: 1, y: 0}, 10, {x: 1, y: 0});
        expect(result).toBe(0);
    });

    it('returns negative value when cross product is negative', () => {
        // crossProduct({0,1}, {1,0}) = 0*0 - 1*1 = -1;  3 * -1 = -3
        const result = collisionDistanceFromBasisUnits({x: 0, y: 1}, 3, {x: 1, y: 0});
        expect(result).toBeCloseTo(-3);
    });
});

// ---------------------------------------------------------------------------
// sourceOffsetDistance
// ---------------------------------------------------------------------------

describe('sourceOffsetDistance', () => {
    it('returns the perpendicular distance from secondary edge source to its clockwise parent', () => {
        // Manually construct a secondary edge at a known position and verify by geometry,
        // without running the algorithm.
        //
        // SYMMETRICAL_OCTAGON vertices (clockwise):
        //   0:(0,3) 1:(0,6) 2:(3,9) 3:(6,9) 4:(9,6) 5:(9,3) 6:(6,0) 7:(3,0)
        //
        // In the real algorithm, the primary bisectors at vertices 0 and 1 share
        // exterior edge 0 as a parent. They collide at (3*(1+√2)/2, 4.5), producing
        // a secondary edge with cwParent=1, wsParent=7.
        //
        // We recreate that scenario manually: build the bare context + primary edges,
        // place an interior node at the known collision point, and attach a secondary
        // edge with the correct parents.
        //
        // Exterior edge 1: (0,6)→(3,9), basis = (√2/2, √2/2).
        // Source position:  (3*(1+√2)/2, 4.5).
        // Displacement from edge 1's source to the secondary source:
        //   d = (3*(1+√2)/2 - 0,  4.5 - 6) = (3*(1+√2)/2,  -1.5)
        // Perpendicular distance to edge 1's line (via right-hand normal (√2/2, -√2/2)):
        //   dot(d, (√2/2, -√2/2)) = √2/2 * (3*(1+√2)/2 + 1.5)
        //                          = 3*(1+√2)/2   ≈ 3.6213

        const context = makeStraightSkeletonSolverContext(SYMMETRICAL_OCTAGON);
        const exteriorEdges = [...context.graph.edges];
        for (let cw = 0; cw < exteriorEdges.length; cw++) {
            const ws = (cw - 1 + exteriorEdges.length) % exteriorEdges.length;
            createBisectionInteriorEdge(context, cw, ws, cw);
        }

        const sourcePos = {x: 3 * (1 + Math.sqrt(2)) / 2, y: 4.5};
        const node = context.findOrAddNode(sourcePos);
        const secEdgeId = createBisectionInteriorEdge(context, 1, 7, node.id);
        const secEdge = context.getInteriorWithId(secEdgeId);

        expect(context.edgeRank(secEdgeId)).toBe('secondary');

        const result = sourceOffsetDistance(secEdge, context);

        // Independent verification using the raw perpendicular-distance formula:
        //   displacement = sourcePos - cwParentSource
        //   perpendicular distance = |displacement| * cross(normalize(displacement), cwParentBasis)
        const cwParentSource = context.graph.nodes[context.graph.edges[1].source].position;
        const displacement = subtractVectors(sourcePos, cwParentSource);
        const [normalizedDisp, size] = normalize(displacement);
        const cwParentBasis = context.graph.edges[1].basisVector;
        const expected = crossProduct(normalizedDisp, cwParentBasis) * size;

        expect(result).toBeCloseTo(expected, 8);
        expect(result).toBeCloseTo(3 * (1 + Math.sqrt(2)) / 2, 8);
    });

});
