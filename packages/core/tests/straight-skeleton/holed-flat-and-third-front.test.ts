/*
 * FLAT-RING TERMINATION AND THE THIRD-FRONT RULE (docs/notes/skeleton-flat-ring-and-third-front-decisions.md). Both rules
 * are reached only in a step of several rings. A ring a layer leaves that is flat by the positive test is closed in its
 * step (decisions 7 to 29); a vertex event whose node lies on a third front is resolved as one whole event, the gap that
 * faces the struck wall not born and the wall cut at the node instead (decisions 30 to 45).
 *
 *  - the closed forms of decision 50, each under the battery and to 1e-9 of the extent: E′ (and moved), E′w, `2h-int-1`
 *    and `2h-int-1w` (and moved), the weighted facing-band specimen of BSA.F118 and its asymmetric variant, and the
 *    issue note's other three fuzz cases;
 *  - the pure functions of decision 51: `flatRingVerdict` on hand-built rings, one failing each clause; `closeFlatRings`
 *    on a flat ring of each sign of area; and `wallFacingGap` on synthetic gaps of walls a legal input can pair.
 *
 * For an axis-aligned region a node's time is its weighted L-infinity distance to the nearest wall.
 */
import type {StraightSkeletonSolverContext, Vector2} from '@proc-geo/core';
import {
    angularResolution,
    makeStraightSkeletonSolverContext,
    setSkeletonLogLevel,
    signedArea,
    SKELETON_NOISE_FLOOR,
    solveSkeleton,
} from '@proc-geo/core';
import {MergeGap, wallFacingGap} from '@proc-geo/core/straight-skeleton/coincident-events';
import {closeFlatRings, flatRingVerdict, FlatRingVerdict} from '@proc-geo/core/straight-skeleton/flat-rings';
import {linkInitialRing, setWavefrontProbe} from '@proc-geo/core/straight-skeleton/wavefront';
import {ringsAmong} from '@proc-geo/core/straight-skeleton/wavefront-links';
import {HOLED_TEST_POLYGONS, holedSolveOptions} from '@proc-geo/test-fixtures';
import type {HoledTestPolygon} from '@proc-geo/test-fixtures';
import {jitterEveryLoop} from '../sweep-harness/sweep';
import {
    ClosedForm,
    expectClosedForm,
    expectSoundHoledSolve,
    extentOf,
    GRID_DRAW_523,
    holeRect,
    Motion,
    moved,
    outlineRect,
    REFUSAL_KINDS,
    solveHoled,
    translated,
} from './holed-test-helpers';

setSkeletonLogLevel('silent');

/** The interior nodes of a solve within 1e-9 of the extent of `at`. */
function interiorNodesAt(fixture: HoledTestPolygon, at: Vector2): number {
    const {result} = expectSoundHoledSolve(fixture);
    const {graph} = result;
    return graph.nodes.slice(graph.numExteriorNodes)
        .filter(node => Math.hypot(node.position.x - at.x, node.position.y - at.y) <= 1e-9 * extentOf(fixture)).length;
}

/*
 * E′, TWO HOLES WITH EVERY GAP 3 (node 5's refusal specimen, now cured): outline [0,21]×[0,10], holes [3,9]×[3,7] and
 * [12,18]×[3,7]. At t = 1.5 every gap closes at once. The four outer corners meet the holes' outer corners head-on at the
 * ridge rectangle's corners (1.5,1.5) to (19.5,8.5). The holes' inner corners (9,3) and (12,3) meet at (10.5,1.5) on the
 * bottom front, a third front (decision 36's worked example): gap X between the holes' facing walls runs up x = 10.5,
 * and the gap between the two hole bottoms, which faces the bottom wall, is not born; the bottom front is cut there
 * instead, east to (19.5,1.5) and west to (1.5,1.5). The top likewise at (10.5,8.5). Six interior nodes, 12 corner
 * bisectors and 7 ridges of two half-edges: 26 interior edges.
 */
const E_PRIME: HoledTestPolygon = {
    name: 'E′: two holes, every gap 3',
    outline: outlineRect(0, 0, 21, 10),
    holes: [{vertices: holeRect(3, 3, 9, 7)}, {vertices: holeRect(12, 3, 18, 7)}],
};
const E_PRIME_FORM: ClosedForm = {
    nodes: [
        {name: 'SW', at: {x: 1.5, y: 1.5}, t: 1.5},
        {name: 'NW', at: {x: 1.5, y: 8.5}, t: 1.5},
        {name: 'NE', at: {x: 19.5, y: 8.5}, t: 1.5},
        {name: 'SE', at: {x: 19.5, y: 1.5}, t: 1.5},
        {name: 'S', at: {x: 10.5, y: 1.5}, t: 1.5},
        {name: 'N', at: {x: 10.5, y: 8.5}, t: 1.5},
    ],
    totalNodes: 18,
    interiorEdges: 26,
    ridges: [['SW', 'NW'], ['NW', 'N'], ['N', 'NE'], ['NE', 'SE'], ['SE', 'S'], ['S', 'SW'], ['S', 'N']],
};

/*
 * E′w, E′ WITH WEIGHTED HOLE BOTTOMS (decision 50): holes [3,9]×[4.5,7] and [12,18]×[4.5,7], each hole's bottom wall of
 * weight 2. The bottom gap is 4.5, closed at t = 4.5 / (1 + 2) = 1.5, at y = 1.5; every other gap is 3 at unit weights.
 * So the same six nodes, every one at t = 1.5 by distance over weight. Hand-derived.
 */
const WEIGHTED_HOLE: number[] = [2, 1, 1, 1];
const E_PRIME_W: HoledTestPolygon = {
    name: 'E′w: E′ with both hole bottoms of weight 2',
    outline: outlineRect(0, 0, 21, 10),
    holes: [
        {vertices: holeRect(3, 4.5, 9, 7), weights: WEIGHTED_HOLE},
        {vertices: holeRect(12, 4.5, 18, 7), weights: WEIGHTED_HOLE},
    ],
};

/*
 * 2h-int-1 (ISSUE-skeleton-straight-vertex-in-zero-area-ring.md): outline [0,9]×[0,11], holes [6,7]×[8,9] and
 * [3,5]×[8,9], the hole tops collinear at y = 9. At t = 1 the strip under the outline's top closes along y = 10, and the
 * layer leaves the ring [27, 30, 31]: the straight vertex e27 at (5.5,10) and the newborn level ridges e30 at (2,10) and
 * e31 at (8,10). It is flat (decision 27's worked example): two stretches on y = 10, e30 running east to (5.5,10), e31
 * west to it, and e27 ending where it stands, at the true skeleton's node.
 */
const TWO_H_INT_1: HoledTestPolygon = {
    name: '2h-int-1: two holes with collinear tops',
    outline: outlineRect(0, 0, 9, 11),
    holes: [{vertices: holeRect(6, 8, 7, 9)}, {vertices: holeRect(3, 8, 5, 9)}],
};

/*
 * 2h-int-1w (decision 50): outline [0,9]×[0,12], holes [6,7]×[8,9] and [3,5]×[8,9], both hole tops of weight 2. The top
 * gap is 3, closed at t = 3 / (1 + 2) = 1, at y = 11; the straight vertex between the tops moves up at 2 and reaches it
 * there. One node at (5.5,11). Hand-derived.
 */
const TOP_WEIGHTED: number[] = [1, 1, 2, 1];
const TWO_H_INT_1W: HoledTestPolygon = {
    name: '2h-int-1w: 2h-int-1 with both hole tops of weight 2',
    outline: outlineRect(0, 0, 9, 12),
    holes: [{vertices: holeRect(6, 8, 7, 9), weights: TOP_WEIGHTED}, {vertices: holeRect(3, 8, 5, 9), weights: TOP_WEIGHTED}],
};

/** The issue note's other three fuzz cases (decision 50). */
const ISSUE_FUZZ: HoledTestPolygon[] = [
    {name: '2h-int-86', outline: outlineRect(0, 0, 19, 19),
        holes: [{vertices: holeRect(15, 11, 16, 13)}, {vertices: holeRect(3, 14, 16, 15)}]},
    {name: '2h-int-144', outline: outlineRect(0, 0, 27, 10),
        holes: [{vertices: holeRect(18, 2, 19, 5)}, {vertices: holeRect(4, 2, 17, 6)}]},
    {name: '2h-int-371', outline: outlineRect(0, 0, 27, 17),
        holes: [{vertices: holeRect(8, 3, 20, 14)}, {vertices: holeRect(22, 9, 23, 14)}]},
];

const THETA = Math.SQRT2;
const OFFSET: Vector2 = {x: 271.8281828, y: -314.1592654};
const turnAndMove: Motion = v => ({
    x: Math.cos(THETA) * v.x - Math.sin(THETA) * v.y + OFFSET.x,
    y: Math.sin(THETA) * v.x + Math.cos(THETA) * v.y + OFFSET.y,
});

describe('the third-front rule: E′ against its closed form (decision 50)', () => {
    it('E′', () => {
        expectClosedForm(E_PRIME, E_PRIME_FORM);
    });

    it('E′ translated by (1/3, 1/7)', () => {
        const offset = {x: 1 / 3, y: 1 / 7};
        expectClosedForm(translated(E_PRIME, offset), E_PRIME_FORM, v => ({x: v.x + offset.x, y: v.y + offset.y}));
    });

    it('E′ turned by √2 rad and moved', () => {
        expectClosedForm(moved(E_PRIME, turnAndMove, 'turned by √2 rad and moved'), E_PRIME_FORM, turnAndMove);
    });

    it('E′w: the same six nodes, every one at t = 1.5 by distance over weight', () => {
        expectClosedForm(E_PRIME_W, E_PRIME_FORM);
    });
});

/*
 * THE WEIGHTED THIRD-FRONT SPECIMEN OF BSA.F118 (BSA.D353; decisions 35, 36 and 46), non-rectilinear, hand-worked.
 * Outline [−300, 300] × [0, 300], its bottom wall W of weight 2 and every other wall 1. Hole 1 is the triangle
 * L1 (70, 60), B1 (190, 110), A1 (190, 150): its lower wall X1 along (12, 5), inward normal (5, −12)/13; its side R1 on
 * x = 190, normal (1, 0); its top Y1 along (4, 3), normal (−3, 4)/5. Hole 2 is its mirror in x = 0.
 *
 *  - P (0, 20), t = 10. X1, Y1, X2, Y2 each lie 10 from P and W lies 20 at weight 2. L1 moves at v·n_X1 = v·n_Y1 = 1,
 *    v = (−7, −4), and reaches P at t = 10 with L2 and W's front: a vertex event on a third front. Of its two gaps the
 *    hole bottoms {X1, X2} have v = (0, −13/12), n_W·v < 0: facing, not born. The hole tops {Y1, Y2} have
 *    v = (0, 5/4), n_W·v = 1.25: clear, though under W's weight 2, and born. W is cut at P, bearing {X1, W} east along
 *    v = (37/5, 2) and {W, X2} west along (−37/5, 2). P has degree 5.
 *  - Q1 (231.25, 82.5), t = 41.25. B1 moves at (1, −2/3) from (190, 110), and {X1, W} reaches it on W's front: X1
 *    closes, bearing {R1, W} along (1, 2).
 *  - S1 (240, 250), t = 50. A1 moves at (1, 2) from (190, 150) and strikes the top front y = 300 − t: {R1, top} leaves
 *    along (1, −1) and {Y1, top} along (−3, −1).
 *  - U1 (245, 110) and V1 (245, 245), t = 55: the corners (300, 0) at (−1, 2) and (300, 300) at (−1, −1) meet {R1, W}
 *    and {R1, top} as R1's front and the outline's right front, antiparallel, meet along x = 245: a ridge of two
 *    half-edges.
 *  - Z (0, 170), t = 130: {Y1, Y2} up x = 0 at 5/4 from P, {Y1, top} and its mirror close the last triangle.
 *
 * Ten interior nodes (P, Z and four a side), so 20 nodes. Interior edges: 10 corner bisectors, 3 departures from P,
 * Q–U, S–V and S–Z a side, and the two ridges U–V of two half-edges each: 23.
 */
const BAND_OUTLINE_WEIGHTS = [1, 1, 1, 2];
const BAND_HOLE_1: Vector2[] = [{x: 70, y: 60}, {x: 190, y: 110}, {x: 190, y: 150}];
const FACING_BAND: HoledTestPolygon = {
    name: 'the facing-band specimen: two triangles over a bottom of weight 2',
    outline: outlineRect(-300, 0, 300, 300),
    weights: BAND_OUTLINE_WEIGHTS,
    holes: [{vertices: BAND_HOLE_1}, {vertices: [{x: -70, y: 60}, {x: -190, y: 150}, {x: -190, y: 110}]}],
};
const FACING_BAND_FORM: ClosedForm = {
    nodes: [
        {name: 'P', at: {x: 0, y: 20}, t: 10},
        {name: 'Q1', at: {x: 231.25, y: 82.5}, t: 41.25},
        {name: 'Q2', at: {x: -231.25, y: 82.5}, t: 41.25},
        {name: 'S1', at: {x: 240, y: 250}, t: 50},
        {name: 'S2', at: {x: -240, y: 250}, t: 50},
        {name: 'U1', at: {x: 245, y: 110}, t: 55},
        {name: 'V1', at: {x: 245, y: 245}, t: 55},
        {name: 'U2', at: {x: -245, y: 110}, t: 55},
        {name: 'V2', at: {x: -245, y: 245}, t: 55},
        {name: 'Z', at: {x: 0, y: 170}, t: 130},
    ],
    totalNodes: 20,
    interiorEdges: 23,
    ridges: [['U1', 'V1'], ['U2', 'V2']],
};

/*
 * ITS ASYMMETRIC VARIANT (BSA.F118): hole 1 as above; hole 2 the triangle L2 (−26, 38), A2 (−146, 198), B2 (−146, 73),
 * its top Y2 along (−3, 4), inward normal (4, 3)/5, its lower wall X2 along (24, −7) from B2, normal (−7, −24)/25, its
 * side R2 on x = −146, normal (−1, 0). Both lie 10 from P, so L2, at v = (13/5, −9/5), meets L1 and W's front at P at
 * t = 10 again. The gaps: {Y1, Y2} has v = (1/5, 7/5), n_W·v = 1.4 < 2, clear and born; {X1, X2} has v = (1/17, −18/17),
 * facing. W is cut at P: {X1, W} east as above, {W, X2} west along (−73/7, 2).
 *
 *  - Hole 1's side is unchanged: Q1, S1, U1 and V1 as above.
 *  - S2 (−171.5, 274.5), t = 25.5: A2 moves at (−1, 3) from (−146, 198) and strikes the top front; {R2, top} leaves
 *    along (−1, −1) and {top, Y2} along (2, −1).
 *  - Q2 (−1898/11, 584/11), t = 292/11: B2 moves at (−1, −3/4) and {W, X2} reaches it on W's front; {R2, W} leaves along
 *    (−1, 2).
 *  - U2 (−223, 154) and V2 (−223, 223), t = 77: R2's front and the outline's left front meet along x = −223.
 *  - Z (22.5, 177.5), t = 122.5: {Y1, Y2} at (1/5, 7/5) from P, {Y1, top} from S1 and {top, Y2} from S2.
 *
 * The same counts as the symmetric specimen.
 */
const FACING_BAND_ASYMMETRIC: HoledTestPolygon = {
    name: 'the facing-band specimen, asymmetric',
    outline: outlineRect(-300, 0, 300, 300),
    weights: BAND_OUTLINE_WEIGHTS,
    holes: [{vertices: BAND_HOLE_1}, {vertices: [{x: -26, y: 38}, {x: -146, y: 198}, {x: -146, y: 73}]}],
};
const FACING_BAND_ASYMMETRIC_FORM: ClosedForm = {
    nodes: [
        {name: 'P', at: {x: 0, y: 20}, t: 10},
        {name: 'Q1', at: {x: 231.25, y: 82.5}, t: 41.25},
        {name: 'S1', at: {x: 240, y: 250}, t: 50},
        {name: 'U1', at: {x: 245, y: 110}, t: 55},
        {name: 'V1', at: {x: 245, y: 245}, t: 55},
        {name: 'S2', at: {x: -171.5, y: 274.5}, t: 25.5},
        {name: 'Q2', at: {x: -1898 / 11, y: 584 / 11}, t: 292 / 11},
        {name: 'U2', at: {x: -223, y: 154}, t: 77},
        {name: 'V2', at: {x: -223, y: 223}, t: 77},
        {name: 'Z', at: {x: 22.5, y: 177.5}, t: 122.5},
    ],
    totalNodes: 20,
    interiorEdges: 23,
    ridges: [['U1', 'V1'], ['U2', 'V2']],
};

describe('the third-front rule on a weighted non-rectilinear specimen (BSA.F118, BSA.D353)', () => {
    it('the facing-band specimen, its clear gap in the band 0 < n_W·v < w_W', () => {
        expectClosedForm(FACING_BAND, FACING_BAND_FORM);
    });

    it('the facing-band specimen, asymmetric', () => {
        expectClosedForm(FACING_BAND_ASYMMETRIC, FACING_BAND_ASYMMETRIC_FORM);
    });
});

/*
 * THE AREA'S SIGN DECIDES NOTHING (decisions 7 and 55; BSA.F117, BSA.D351). Still, the flat rings of `2h-int-1` and
 * `2h-int-1w` have area exactly 0; translated and turned as E′ is, their area moves off 0 at about 1e-15 (BSA.F117), and
 * a `closeFlatRings` that refused candidates of positive area refuses three of the four moved cells (measured). The
 * negative sign is held by the unit test of `closeFlatRings` below.
 */
const TRANSLATION: Vector2 = {x: 1 / 3, y: 1 / 7};
const translate: Motion = v => ({x: v.x + TRANSLATION.x, y: v.y + TRANSLATION.y});

describe('flat-ring termination: the issue note\'s fuzz cases (decision 50)', () => {
    it('2h-int-1 is sound, with one node at (5.5, 10)', () => {
        expect(interiorNodesAt(TWO_H_INT_1, {x: 5.5, y: 10})).toBe(1);
    });

    it('2h-int-1 translated by (1/3, 1/7): one node at (5.5, 10) moved', () => {
        expect(interiorNodesAt(translated(TWO_H_INT_1, TRANSLATION), translate({x: 5.5, y: 10}))).toBe(1);
    });

    it('2h-int-1 turned by √2 rad and moved: one node at (5.5, 10) moved', () => {
        expect(interiorNodesAt(moved(TWO_H_INT_1, turnAndMove, 'turned by √2 rad and moved'),
            turnAndMove({x: 5.5, y: 10}))).toBe(1);
    });

    it('2h-int-1w is sound, with one node at (5.5, 11)', () => {
        expect(interiorNodesAt(TWO_H_INT_1W, {x: 5.5, y: 11})).toBe(1);
    });

    it('2h-int-1w translated by (1/3, 1/7): one node at (5.5, 11) moved', () => {
        expect(interiorNodesAt(translated(TWO_H_INT_1W, TRANSLATION), translate({x: 5.5, y: 11}))).toBe(1);
    });

    it('2h-int-1w turned by √2 rad and moved: one node at (5.5, 11) moved', () => {
        expect(interiorNodesAt(moved(TWO_H_INT_1W, turnAndMove, 'turned by √2 rad and moved'),
            turnAndMove({x: 5.5, y: 11}))).toBe(1);
    });

    it.each(ISSUE_FUZZ.map(fixture => [fixture.name, fixture] as const))('%s is sound', (_name, fixture) => {
        expectSoundHoledSolve(fixture);
    });
});

/** The probe's firings over one holed solve (decision 47): each closed flat ring and each resolved third-front meeting. */
function firingsOf(fixture: HoledTestPolygon): {flat: number; thirdFront: number} {
    const firings = {flat: 0, thirdFront: 0};
    setWavefrontProbe({
        flatRingClosed: () => {
            firings.flat++;
        },
        thirdFrontResolved: () => {
            firings.thirdFront++;
        },
    });
    try {
        solveSkeleton(fixture.outline, holedSolveOptions(fixture));
    } finally {
        setWavefrontProbe(null);
    }
    return firings;
}

describe('the probe (decisions 4, 47 and 53)', () => {
    it('fires on no fixture of HOLED_TEST_POLYGONS', () => {
        expect(HOLED_TEST_POLYGONS.map(fixture => ({name: fixture.name, ...firingsOf(fixture)})))
            .toEqual(HOLED_TEST_POLYGONS.map(fixture => ({name: fixture.name, flat: 0, thirdFront: 0})));
    });

    it('fires twice on E′, at (10.5, 1.5) and (10.5, 8.5), both third fronts', () => {
        expect(firingsOf(E_PRIME)).toEqual({flat: 0, thirdFront: 2});
    });

    it('fires once on the facing-band specimen and once on its asymmetric variant, each a third front at P', () => {
        expect([FACING_BAND, FACING_BAND_ASYMMETRIC].map(firingsOf))
            .toEqual([{flat: 0, thirdFront: 1}, {flat: 0, thirdFront: 1}]);
    });

    it('fires once on 2h-int-1, its one flat ring', () => {
        expect(firingsOf(TWO_H_INT_1)).toEqual({flat: 1, thirdFront: 0});
    });

    it('fires on neither rule on the refusal specimen, grid draw uniform-1-523', () => {
        expect(firingsOf(GRID_DRAW_523)).toEqual({flat: 0, thirdFront: 0});
    });
});

/*
 * THE FLAT REFUSAL (decision 28), on a real ring: `Holed A` (the concentric square) jittered at 1x the sweep harness's
 * 1e-8 amplitude, seed 0, the harness's own cell. The jitter parts the four corner meetings of t = 2, and a layer leaves
 * an L-shaped flat ring round one corner: a tree of two stretches that do not lie on one line, which decision 29 refuses.
 */
describe('a flat-by-area ring that fails the test is refused by name (decisions 28 and 29)', () => {
    it('Holed A jittered, seed 0: multi-ring-step-refused naming not-one-line, with no ring closed', () => {
        const fixture = jitterEveryLoop(HOLED_TEST_POLYGONS.find(candidate => candidate.name.startsWith('Holed A:'))!, 1, 0);
        const {result} = solveHoled(fixture);
        expect(result.complete).toBe(false);
        const refusals = result.diagnostics.filter(diagnostic => REFUSAL_KINDS.includes(diagnostic.kind));
        expect(refusals.map(diagnostic => diagnostic.kind)).toEqual(['multi-ring-step-refused']);
        expect(refusals[0].detail).toMatch(new RegExp('ring \\[[0-9, ]+\\] has area -?[0-9.e-]+ at time [0-9.e-]+, at or '
            + 'under the [0-9.e-]+ degenerate-area bar, and is not a flat termination: not-one-line: '));
        expect(firingsOf(fixture)).toEqual({flat: 0, thirdFront: 0});
    });
});

// ── The pure functions (decision 51) ──────────────────────────────────────────────────────────────────────────────────

/** A wall of a hand-built context: its source point, its basis (normalised here) and its weight. */
interface WallSpec {
    from: Vector2;
    basis: Vector2;
    weight?: number;
}

/**
 * A HAND-BUILT CONTEXT: one loop with one exterior edge per wall, each edge's source moved to the wall's `from` and its
 * basis set to the wall's. The loop's own geometry is never read by the functions under test, which read each wall's
 * basis, source and weight only.
 */
function handBuilt(walls: WallSpec[], floor: number = SKELETON_NOISE_FLOOR): StraightSkeletonSolverContext {
    const polygon = walls.map((_wall, k) => ({
        x: 100 * Math.cos(-2 * Math.PI * k / walls.length),
        y: 100 * Math.sin(-2 * Math.PI * k / walls.length),
    }));
    const context = makeStraightSkeletonSolverContext(polygon, floor, walls.map(wall => wall.weight ?? 1));
    walls.forEach((wall, k) => {
        const size = Math.hypot(wall.basis.x, wall.basis.y);
        context.graph.nodes[context.graph.edges[k].source].position = wall.from;
        context.graph.edges[k].basisVector = {x: wall.basis.x / size, y: wall.basis.y / size};
    });
    return context;
}

/** A bisector standing at `at`, between walls `clockwise` and `widdershins`, sourced at a node there. */
function member(context: StraightSkeletonSolverContext, at: Vector2, clockwise: number, widdershins: number): number {
    const id = context.graph.edges.length;
    context.graph.interiorEdges.push({
        id, clockwiseExteriorEdgeIndex: clockwise, widdershinsExteriorEdgeIndex: widdershins, length: Number.MAX_VALUE,
    });
    context.graph.edges.push({id, source: context.findOrAddNode(at, 0).id, basisVector: context.getEdgeWithId(clockwise).basisVector});
    context.acceptedEdges.push(false);
    return id;
}

/** A wall whose front at time 1 runs through `through` along `basis`: its source lies one weight behind, along its normal. */
function wallWithFrontThrough(through: Vector2, basis: Vector2, weight = 1): WallSpec {
    const size = Math.hypot(basis.x, basis.y);
    const normal = {x: basis.y / size, y: -basis.x / size};
    return {from: {x: through.x - weight * normal.x, y: through.y - weight * normal.y}, basis, weight};
}

const EAST = {x: 1, y: 0};
const WEST = {x: -1, y: 0};
const NORTH = {x: 0, y: 1};
const SOUTH = {x: 0, y: -1};

/** The clause a verdict names, or `flat`. */
const clauseOf = (verdict: FlatRingVerdict) => verdict.ok ? 'flat' : verdict.clause;

/*
 * THE BASE LINE RING, `2h-int-1`'s at t = 1 in miniature. Walls T1 and T2 run east with fronts on y = 2, two collinear
 * walls facing the same way; B runs west with its front there too. a, level {T1 | B}, stands at P (2,2); m, the straight
 * vertex {T2 | T1}, at M (5,2); b, level {B | T2}, at Q (8,2). Two stretches: P–M on T1 and B, M–Q on T2 and B. T3 and
 * B2 are a second antiparallel pair, on y = 7, that no stretch runs on.
 */
const T1 = 0, T2 = 1, B = 2, T3 = 3, B2 = 4;
function baseLine(positions: {a: Vector2; m: Vector2; b: Vector2} = {a: {x: 2, y: 2}, m: {x: 5, y: 2}, b: {x: 8, y: 2}}) {
    const context = handBuilt([
        wallWithFrontThrough({x: 0, y: 2}, EAST), wallWithFrontThrough({x: 5, y: 2}, EAST),
        wallWithFrontThrough({x: 10, y: 2}, WEST), wallWithFrontThrough({x: 0, y: 7}, EAST),
        wallWithFrontThrough({x: 0, y: 7}, WEST),
    ]);
    const a = member(context, positions.a, T1, B);
    const m = member(context, positions.m, T2, T1);
    const b = member(context, positions.b, B, T2);
    return {context, a, m, b};
}

describe('flatRingVerdict on hand-built rings (decision 51)', () => {
    it('passes the base line ring: three nodes, two stretches, a forward on P–M and b backward on M–Q', () => {
        const {context, a, m, b} = baseLine();
        const verdict = flatRingVerdict(context, [a, m, b], 1, new Set([a, m, b]));
        if (!verdict.ok) {
            throw new Error(`${verdict.clause}: ${verdict.reason}`);
        }
        expect(verdict.value.nodes).toEqual([{x: 2, y: 2}, {x: 5, y: 2}, {x: 8, y: 2}]);
        expect(verdict.value.stretches).toEqual([
            {from: 0, to: 1, clockwiseWall: T1, widdershinsWall: B, forward: a},
            {from: 1, to: 2, clockwiseWall: T2, widdershinsWall: B, backward: b},
        ]);
    });

    it('passes a ring whose members all fall in one node (decision 20)', () => {
        const {context} = baseLine();
        const at = {x: 3, y: 2};
        const ring = [member(context, at, T1, B), member(context, at, B, T2), member(context, at, T2, T1)];
        expect(clauseOf(flatRingVerdict(context, ring, 1, new Set(ring)))).toBe('flat');
    });

    it('segment-against-wall: the base ring with a and b swapped, so a segment runs against its wall (decision 12)', () => {
        const {context, a, m, b} = baseLine({a: {x: 8, y: 2}, m: {x: 5, y: 2}, b: {x: 2, y: 2}});
        expect(clauseOf(flatRingVerdict(context, [a, m, b], 1, new Set([a, m, b])))).toBe('segment-against-wall');
    });

    it('segment-off-front: the base ring read at t = 1.5, its fronts half a unit off its nodes (decision 13)', () => {
        const {context, a, m, b} = baseLine();
        expect(clauseOf(flatRingVerdict(context, [a, m, b], 1.5, new Set([a, m, b])))).toBe('segment-off-front');
    });

    it('stretch-cover-count: P to Q and back twice, on four walls (decision 15)', () => {
        const context = handBuilt([
            wallWithFrontThrough({x: 0, y: 2}, EAST), wallWithFrontThrough({x: 5, y: 2}, EAST),
            wallWithFrontThrough({x: 10, y: 2}, WEST), wallWithFrontThrough({x: 5, y: 2}, WEST),
        ]);
        const [p, q] = [{x: 2, y: 2}, {x: 8, y: 2}];
        const ring = [member(context, p, 0, 3), member(context, q, 2, 0), member(context, p, 1, 2), member(context, q, 3, 1)];
        expect(clauseOf(flatRingVerdict(context, ring, 1, new Set(ring)))).toBe('stretch-cover-count');
    });

    /* A triangle P (0,0), Q (0,4), R (4,0) traced twice the same way on two walls per side: each pair twice, one way. */
    it('stretch-same-way: a triangle traced twice the same way (decision 15)', () => {
        const [p, q, r] = [{x: 0, y: 0}, {x: 0, y: 4}, {x: 4, y: 0}];
        const down = {x: 1, y: -1};
        const context = handBuilt([
            wallWithFrontThrough(p, NORTH), wallWithFrontThrough(q, down), wallWithFrontThrough(r, WEST),
            wallWithFrontThrough(p, NORTH), wallWithFrontThrough(q, down), wallWithFrontThrough(r, WEST),
        ]);
        const ring = [member(context, p, 0, 5), member(context, q, 1, 0), member(context, r, 2, 1),
            member(context, p, 3, 2), member(context, q, 4, 3), member(context, r, 5, 4)];
        expect(clauseOf(flatRingVerdict(context, ring, 1, new Set(ring)))).toBe('stretch-same-way');
    });

    /*
     * Two walls each within the angular resolution of the stretch's line, tilted 0.01 rad either way of it, so 0.02 rad
     * from antiparallel: at the floor 1e-2 the resolution is √2 · 1e-2.
     */
    it('stretch-walls-not-antiparallel: a stretch between two walls tilted either way of its line (decision 15)', () => {
        const tilt = 0.01;
        const [p, q, middle] = [{x: 0, y: 0}, {x: 1, y: 0}, {x: 0.5, y: 0}];
        const context = handBuilt([
            wallWithFrontThrough(middle, {x: Math.cos(tilt), y: Math.sin(tilt)}),
            wallWithFrontThrough(middle, {x: -Math.cos(tilt), y: Math.sin(tilt)}),
            wallWithFrontThrough({x: 1, y: 5}, NORTH),
        ], 1e-2);
        const ring = [member(context, p, 0, 1), member(context, q, 2, 0), member(context, q, 1, 2)];
        expect(clauseOf(flatRingVerdict(context, ring, 1, new Set(ring)))).toBe('stretch-walls-not-antiparallel');
    });

    /* Stretches A (0,0)–B (4,0) and C (2,−2)–D (2,2) cross at (2,0), which is no node; A–C joins them into one tour. */
    it('stretches-meet: two stretches crossing away from a node (decision 16)', () => {
        const [a, b, c, d] = [{x: 0, y: 0}, {x: 4, y: 0}, {x: 2, y: -2}, {x: 2, y: 2}];
        const context = handBuilt([
            wallWithFrontThrough(a, EAST), wallWithFrontThrough(a, WEST), wallWithFrontThrough(a, {x: 1, y: -1}),
            wallWithFrontThrough(c, NORTH), wallWithFrontThrough(c, SOUTH), wallWithFrontThrough(a, {x: -1, y: 1}),
        ]);
        const ring = [member(context, a, 0, 5), member(context, b, 1, 0), member(context, a, 2, 1),
            member(context, c, 3, 2), member(context, d, 4, 3), member(context, c, 5, 4)];
        expect(clauseOf(flatRingVerdict(context, ring, 1, new Set(ring)))).toBe('stretches-meet');
    });

    /* The triangle P, Q, R traced round and back: three stretches on three nodes, a cycle. */
    it('not-a-tree: a triangle traced round and back (decision 17)', () => {
        const [p, q, r] = [{x: 0, y: 0}, {x: 0, y: 4}, {x: 4, y: 0}];
        const context = handBuilt([
            wallWithFrontThrough(p, NORTH), wallWithFrontThrough(q, {x: 1, y: -1}), wallWithFrontThrough(r, WEST),
            wallWithFrontThrough(p, EAST), wallWithFrontThrough(r, {x: -1, y: 1}), wallWithFrontThrough(q, SOUTH),
        ]);
        const ring = [member(context, p, 0, 5), member(context, q, 1, 0), member(context, r, 2, 1),
            member(context, p, 3, 2), member(context, r, 4, 3), member(context, q, 5, 4)];
        expect(clauseOf(flatRingVerdict(context, ring, 1, new Set(ring)))).toBe('not-a-tree');
    });

    /* An L of two stretches, P (0,0)–Q (4,0) and P–R (0,4): a tree, not on one line. */
    it('not-one-line: an L of two stretches (decisions 17 and 29)', () => {
        const [p, q, r] = [{x: 0, y: 0}, {x: 4, y: 0}, {x: 0, y: 4}];
        const context = handBuilt([
            wallWithFrontThrough(p, EAST), wallWithFrontThrough(p, WEST), wallWithFrontThrough(p, NORTH),
            wallWithFrontThrough(p, SOUTH),
        ]);
        const ring = [member(context, p, 0, 3), member(context, q, 1, 0), member(context, p, 2, 1), member(context, r, 3, 2)];
        expect(clauseOf(flatRingVerdict(context, ring, 1, new Set(ring)))).toBe('not-one-line');
    });

    it('stretch-under-bar: the base ring shrunk to stretches of 3 floors (decision 18)', () => {
        const floor = SKELETON_NOISE_FLOOR;
        const {context, a, m, b} = baseLine({a: {x: 2, y: 2}, m: {x: 2 + 3 * floor, y: 2}, b: {x: 2 + 6 * floor, y: 2}});
        expect(clauseOf(flatRingVerdict(context, [a, m, b], 1, new Set([a, m, b])))).toBe('stretch-under-bar');
    });

    it('stretch-under-bar refuses a stretch at the bar and passes one just over it (decision 18)', () => {
        const floor = SKELETON_NOISE_FLOOR;
        const at = (length: number) => {
            const {context, a, m, b} = baseLine({a: {x: 2, y: 2}, m: {x: 2 + length, y: 2}, b: {x: 2 + 2 * length, y: 2}});
            return clauseOf(flatRingVerdict(context, [a, m, b], 1, new Set([a, m, b])));
        };
        expect(at(4 * floor)).toBe('stretch-under-bar');
        expect(at(4.5 * floor)).toBe('flat');
    });

    it('level-not-newborn: the base ring with its level member a older than the layer (decision 19)', () => {
        const {context, a, m, b} = baseLine();
        expect(clauseOf(flatRingVerdict(context, [a, m, b], 1, new Set([m, b])))).toBe('level-not-newborn');
    });

    it('level-not-newborn holds on a ring of one node too (decision 20)', () => {
        const {context} = baseLine();
        const at = {x: 3, y: 2};
        const ring = [member(context, at, T1, B), member(context, at, B, T2), member(context, at, T2, T1)];
        expect(clauseOf(flatRingVerdict(context, ring, 1, new Set(ring.slice(1))))).toBe('level-not-newborn');
    });

    it('level-off-stretch: a level member at P between two walls no stretch at P runs on (decision 19)', () => {
        const {context, a, m, b} = baseLine();
        const x = member(context, {x: 2, y: 2}, T3, B2);
        expect(clauseOf(flatRingVerdict(context, [a, m, b, x], 1, new Set([a, m, b, x])))).toBe('level-off-stretch');
    });

    it('level-doubled: two level members running one way along P–M (decision 19)', () => {
        const {context, a, m, b} = baseLine();
        const x = member(context, {x: 2, y: 2}, T1, B);
        expect(clauseOf(flatRingVerdict(context, [a, m, b, x], 1, new Set([a, m, b, x])))).toBe('level-doubled');
    });
});

/*
 * THE AREA'S SIGN IS READ FOR NO CANDIDATE (decisions 7 and 55; BSA.D351). The base line ring, linked as one ring, with
 * its straight vertex m lifted or dropped by a quarter floor off y = 2: within the floor of every front, and Q half a
 * floor off the line P–M, so still flat, and of area ∓0.75 floors, either sign, under the degenerate-area bar of 6
 * floors. `closeFlatRings` closes it at both signs: a and b end at m's node, and m ends where it stands and is culled.
 */
describe('closeFlatRings closes a flat ring of either sign (decisions 7 and 55)', () => {
    const lift = SKELETON_NOISE_FLOOR / 4;
    it.each([['negative', lift], ['positive', -lift]] as const)('area %s', (sign, dy) => {
        const positions = {a: {x: 2, y: 2}, m: {x: 5, y: 2 + dy}, b: {x: 8, y: 2}};
        const {context, a, m, b} = baseLine(positions);
        const area = signedArea([positions.a, positions.m, positions.b]);
        expect(Math.sign(area)).toBe(sign === 'negative' ? -1 : 1);
        linkInitialRing(context, [a, m, b]);
        const closed = closeFlatRings(context, ringsAmong(context, [a, m, b]), 1, new Set([a, m, b]));
        expect([...closed].sort((first, second) => first - second)).toEqual([a, m, b]);
        const {edges} = context.graph;
        expect([edges[a].target, edges[m].target, edges[b].target]).toEqual([edges[m].source, edges[m].source, edges[m].source]);
        expect(context.getInteriorWithId(m).culled).toBe(true);
    });
});

/*
 * WALL-FACING GAPS ON E′'S WALLS (decisions 35 and 36). The struck wall is the outline's bottom, basis (−1, 0), inward
 * normal (0, 1). X, between hole 1's right wall (0, 1) and hole 2's left (0, −1), is antiparallel, so its direction is
 * hole 1 right's basis, (0, 1): clear. Y, between the two hole bottoms, (1, 0) each, is same-facing, so its direction is
 * their inward normal, (0, −1): facing. G grazes, on walls a legal input can pair (below).
 *
 * WALLS A LEGAL INPUT CAN PAIR AS A GAP (BSA.F118, BSA.D353): `n_wall` or `−n_wall` lies in the cone of the gap's two
 * inward normals, `±n_wall = λ n_cw + μ n_ws` with λ, μ ≥ 0. Then `n_wall · v = ±(λ w_cw + μ w_ws)`, whose sign no
 * positive weights change (decision 46). Every non-antiparallel gap these tests classify is checked to be such a pair.
 */
const BOTTOM_NORMAL: Vector2 = {x: 0, y: 1};
const inwardNormal = (context: StraightSkeletonSolverContext, wall: number): Vector2 => {
    const basis = context.getEdgeWithId(wall).basisVector;
    return {x: basis.y, y: -basis.x};
};
/** Does `normal` lie in the closed cone of the gap's two inward normals? */
function inConeOfGap(context: StraightSkeletonSolverContext, normal: Vector2, gap: MergeGap): boolean {
    const [a, b] = [inwardNormal(context, gap.clockwiseWall), inwardNormal(context, gap.widdershinsWall)];
    const cross = (p: Vector2, q: Vector2) => p.x * q.y - p.y * q.x;
    const determinant = cross(a, b);
    return cross(normal, b) / determinant >= 0 && cross(a, normal) / determinant >= 0;
}
/** Can a legal input pair this gap against a wall of inward normal `normal`: is `normal` or its negation in its cone? */
const legalAgainst = (context: StraightSkeletonSolverContext, normal: Vector2, gap: MergeGap) =>
    inConeOfGap(context, normal, gap) || inConeOfGap(context, {x: -normal.x, y: -normal.y}, gap);

/** A wall of inward normal at `angle` from the x axis: its basis is the normal turned a quarter anticlockwise. */
const basisOfNormalAt = (angle: number): Vector2 => ({x: -Math.sin(angle), y: Math.cos(angle)});

const gap = (clockwiseWall: number, widdershinsWall: number): MergeGap =>
    ({lastArrival: -1, firstDeparture: -1, clockwiseWall, widdershinsWall});

describe('wallFacingGap on synthetic gaps (decision 51)', () => {
    /*
     * G GRAZES ON WALLS A LEGAL INPUT CAN PAIR. Inward normals at ψ ± (π/2 − γ), with ρ the angular resolution, γ = 0.7 ρ
     * and ψ = 0.85 ρ: their cone, of half-angle π/2 − γ about ψ, holds the bottom wall's normal at π/2 because ψ > γ.
     * The walls are 2γ = 1.4 ρ from antiparallel, so the antiparallel exemption does not take them, and v runs along ψ,
     * so v̂ · n_wall = sin ψ ≈ 0.85 ρ: inside the grazing band of decision 36, on its clear side.
     */
    const RESOLUTION = angularResolution(SKELETON_NOISE_FLOOR);
    const [GAMMA, PSI] = [0.7 * RESOLUTION, 0.85 * RESOLUTION];
    const BOTTOM = 0, H1_RIGHT = 1, H2_LEFT = 2, H1_BOTTOM = 3, H2_BOTTOM = 4, G_CW = 5, G_WS = 6, H2_HEAVY = 7;
    const context = handBuilt([
        {from: {x: 21, y: 0}, basis: WEST}, {from: {x: 9, y: 3}, basis: NORTH}, {from: {x: 12, y: 7}, basis: SOUTH},
        {from: {x: 3, y: 3}, basis: EAST}, {from: {x: 12, y: 3}, basis: EAST},
        {from: {x: 0, y: 0}, basis: basisOfNormalAt(PSI + Math.PI / 2 - GAMMA)},
        {from: {x: 0, y: 0}, basis: basisOfNormalAt(PSI - Math.PI / 2 + GAMMA)},
        {from: {x: 12, y: 3}, basis: EAST, weight: 2},
    ]);
    const X = gap(H1_RIGHT, H2_LEFT);
    const Y = gap(H2_BOTTOM, H1_BOTTOM);
    const G = gap(G_CW, G_WS);

    it('one facing: E′\'s gaps, Y facing and X clear', () => {
        expect(wallFacingGap([X, Y], BOTTOM, context)).toEqual({ok: true, value: 1});
    });

    it('none facing: X alone', () => {
        expect(wallFacingGap([X], BOTTOM, context)).toEqual({ok: false, reason: '0 of its 1 gaps face wall 0, not one'});
    });

    it('two facing: Y twice', () => {
        expect(wallFacingGap([Y, Y], BOTTOM, context)).toEqual({ok: false, reason: '2 of its 2 gaps face wall 0, not one'});
    });

    it('a grazing gap: G, on walls a legal input can pair, whose direction is within the resolution of the wall', () => {
        expect(context.angularResolution).toBe(RESOLUTION);
        expect(inConeOfGap(context, BOTTOM_NORMAL, G)).toBe(true);
        expect(wallFacingGap([X, Y, G], BOTTOM, context)).toEqual({ok: false, reason: 'the gap {cw: 5, ws: 6} grazes wall 0'});
    });

    it('a gap between same-facing parallel walls of unequal weight has no direction (decision 44 (d))', () => {
        expect(wallFacingGap([X, gap(H2_HEAVY, H1_BOTTOM)], BOTTOM, context)).toEqual({
            ok: false,
            reason: 'the gap {cw: 7, ws: 3} lies between same-facing parallel walls of unequal weight (2, 1)',
        });
    });
});

/*
 * THE WEIGHTS DECIDE NO FACING VERDICT (decision 46, restated by BSA.D353 on BSA.F118). The gaps of the facing-band
 * specimen: C between the hole tops, inward normals (−3, 4)/5 and (3, 4)/5, whose cone holds the bottom wall's normal
 * (0, 1); F between the hole bottoms, (5, −12)/13 and (−5, −12)/13, whose cone holds (0, −1). At every positive weight of
 * either wall, and against a struck wall of weight 1 or 2, C is clear and F faces, though C's `n_wall · v` falls below
 * the struck wall's weight at some of them (5/4 < 2 at equal weights): the verdict reads the sign of `n_wall · v` and
 * never compares it with `w_wall`.
 */
describe('wallFacingGap: the weights decide no verdict on walls a legal input can pair (decision 46)', () => {
    const WEIGHTS = [0.5, 1, 2, 10];
    const BASES: Vector2[] = [{x: -0.8, y: -0.6}, {x: -0.8, y: 0.6}, {x: 12 / 13, y: 5 / 13}, {x: 12 / 13, y: -5 / 13}];
    const [Y1, Y2, X1, X2] = [0, 1, 2, 3];
    const STRUCK = [0, 1];
    const context = handBuilt([
        {from: {x: 300, y: 0}, basis: WEST}, {from: {x: 300, y: 0}, basis: WEST, weight: 2},
        ...WEIGHTS.flatMap(weight => BASES.map(basis => ({from: {x: 0, y: 0}, basis, weight}))),
    ]);
    const wallAt = (kind: number, weight: number) => STRUCK.length + BASES.length * WEIGHTS.indexOf(weight) + kind;
    const pairs = WEIGHTS.flatMap(first => WEIGHTS.map(second => [first, second] as const));

    it('every gap classified is one a legal input can pair against the bottom wall', () => {
        const gaps = pairs.flatMap(([first, second]) => [gap(wallAt(Y1, first), wallAt(Y2, second)),
            gap(wallAt(X1, first), wallAt(X2, second))]);
        expect(gaps.filter(candidate => !legalAgainst(context, BOTTOM_NORMAL, candidate))).toEqual([]);
    });

    it('C is clear and F faces at every weight of their walls, against a struck wall of weight 1 or 2', () => {
        const verdicts = STRUCK.flatMap(wall => pairs.map(([first, second]) => {
            const clear = gap(wallAt(Y1, first), wallAt(Y2, second));
            const facing = gap(wallAt(X1, first), wallAt(X2, second));
            const verdict = wallFacingGap([clear, facing], wall, context);
            return `wall of weight ${context.weightOf(wall)}, gap walls (${first}, ${second}): `
                + `${verdict.ok ? verdict.value : verdict.reason}`;
        }));
        expect(verdicts).toEqual(STRUCK.flatMap(wall => pairs.map(([first, second]) =>
            `wall of weight ${context.weightOf(wall)}, gap walls (${first}, ${second}): 1`)));
    });
});
