/*
 * FLAT-RING TERMINATION AND THE THIRD-FRONT RULE (docs/notes/skeleton-flat-ring-and-third-front-decisions.md). Both rules
 * are reached only in a step of several rings. A ring a layer leaves that is flat by the positive test is closed in its
 * step (decisions 7 to 29); a vertex event whose node lies on a third front is resolved as one whole event, the gap that
 * faces the struck wall not born and the wall cut at the node instead (decisions 30 to 45).
 *
 *  - the closed forms of decision 50, each under the battery and to 1e-9 of the extent: E′ (and moved), E′w, `2h-int-1`,
 *    `2h-int-1w`, and the issue note's other three fuzz cases;
 *  - the pure functions of decision 51: `flatRingVerdict` on hand-built rings, one failing each clause, and
 *    `wallFacingGap` on synthetic gaps.
 *
 * For an axis-aligned region a node's time is its weighted L-infinity distance to the nearest wall.
 */
import type {StraightSkeletonSolverContext, Vector2} from '@proc-geo/core';
import {makeStraightSkeletonSolverContext, setSkeletonLogLevel, SKELETON_NOISE_FLOOR, solveSkeleton} from '@proc-geo/core';
import {MergeGap, wallFacingGap} from '@proc-geo/core/straight-skeleton/coincident-events';
import {flatRingVerdict, FlatRingVerdict} from '@proc-geo/core/straight-skeleton/flat-rings';
import {setWavefrontProbe} from '@proc-geo/core/straight-skeleton/wavefront';
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

describe('flat-ring termination: the issue note\'s fuzz cases (decision 50)', () => {
    it('2h-int-1 is sound, with one node at (5.5, 10)', () => {
        expect(interiorNodesAt(TWO_H_INT_1, {x: 5.5, y: 10})).toBe(1);
    });

    it('2h-int-1w is sound, with one node at (5.5, 11)', () => {
        expect(interiorNodesAt(TWO_H_INT_1W, {x: 5.5, y: 11})).toBe(1);
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
const clauseOf = (verdict: FlatRingVerdict) => verdict.flat ? 'flat' : verdict.clause;

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
        if (!verdict.flat) {
            throw new Error(`${verdict.clause}: ${verdict.detail}`);
        }
        expect(verdict.plan.nodes).toEqual([{x: 2, y: 2}, {x: 5, y: 2}, {x: 8, y: 2}]);
        expect(verdict.plan.stretches).toEqual([
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
 * WALL-FACING GAPS ON E′'S WALLS (decisions 35 and 36). The struck wall is the outline's bottom, basis (−1, 0), inward
 * normal (0, 1). X, between hole 1's right wall (0, 1) and hole 2's left (0, −1), is antiparallel, so its direction is
 * hole 1 right's basis, (0, 1): clear. Y, between the two hole bottoms, (1, 0) each, is same-facing, so its direction is
 * their inward normal, (0, −1): facing. G grazes: walls of inward normals (1, 1)/√2 and (1, −1)/√2 give (√2, 0), along
 * the struck wall.
 */
describe('wallFacingGap on synthetic gaps (decision 51)', () => {
    const BOTTOM = 0, H1_RIGHT = 1, H2_LEFT = 2, H1_BOTTOM = 3, H2_BOTTOM = 4, G_CW = 5, G_WS = 6, H2_HEAVY = 7;
    const context = handBuilt([
        {from: {x: 21, y: 0}, basis: WEST}, {from: {x: 9, y: 3}, basis: NORTH}, {from: {x: 12, y: 7}, basis: SOUTH},
        {from: {x: 3, y: 3}, basis: EAST}, {from: {x: 12, y: 3}, basis: EAST},
        {from: {x: 0, y: 0}, basis: {x: -1, y: 1}}, {from: {x: 0, y: 0}, basis: {x: 1, y: 1}},
        {from: {x: 12, y: 3}, basis: EAST, weight: 2},
        {from: {x: 0, y: 0}, basis: NORTH}, {from: {x: 0, y: 0}, basis: {x: 0.8, y: 0.6}},
        {from: {x: 0, y: 0}, basis: NORTH, weight: 2},
    ]);
    const gap = (clockwiseWall: number, widdershinsWall: number): MergeGap =>
        ({lastArrival: -1, firstDeparture: -1, clockwiseWall, widdershinsWall});
    const X = gap(H1_RIGHT, H2_LEFT);
    const Y = gap(H2_BOTTOM, H1_BOTTOM);
    const G = gap(G_CW, G_WS);

    it('one facing: E′\'s gaps, Y facing and X clear', () => {
        expect(wallFacingGap([X, Y], BOTTOM, context)).toBe(1);
    });

    it('none facing: X alone', () => {
        expect(wallFacingGap([X], BOTTOM, context)).toBe('0 of its 1 gaps face wall 0, not one');
    });

    it('two facing: Y twice', () => {
        expect(wallFacingGap([Y, Y], BOTTOM, context)).toBe('2 of its 2 gaps face wall 0, not one');
    });

    it('a grazing gap: G, whose direction runs along the wall', () => {
        expect(wallFacingGap([X, Y, G], BOTTOM, context)).toBe('the gap {cw: 5, ws: 6} grazes wall 0');
    });

    /*
     * THE KERNEL'S WEIGHT TERMS DECIDE THE VERDICT (decision 35; §6 item 2, convicted here at the function, not by a
     * solved specimen). Walls of inward normals (1, 0) and (0.6, −0.8): v · (1, 0) = w1 and v · (0.6, −0.8) = w2 give
     * v = (w1, (0.6 w1 − w2) / 0.8). At equal weights v = (1, −0.5), which faces the bottom wall; with the first wall at
     * weight 2, v = (2, 0.25), which is clear of it.
     */
    it('the weights decide whether a gap between non-parallel walls faces the wall', () => {
        const W1 = 8, W2 = 9, W1_HEAVY = 10;
        expect(wallFacingGap([gap(W1, W2)], BOTTOM, context)).toBe(0);
        expect(wallFacingGap([gap(W1_HEAVY, W2)], BOTTOM, context)).toBe('0 of its 1 gaps face wall 0, not one');
    });

    it('a gap between same-facing parallel walls of unequal weight has no direction (decision 44 (d))', () => {
        expect(wallFacingGap([X, gap(H2_HEAVY, H1_BOTTOM)], BOTTOM, context))
            .toBe('the gap {cw: 7, ws: 3} lies between same-facing parallel walls of unequal weight (2, 1)');
    });
});
