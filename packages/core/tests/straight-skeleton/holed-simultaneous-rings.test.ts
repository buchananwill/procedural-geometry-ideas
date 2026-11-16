/*
 * SIMULTANEOUS EVENTS ACROSS RINGS (docs/notes/skeleton-simultaneous-rings-decisions.md, roadmap node 5). A layer in
 * which events of two rings coincide is resolved: a meeting of one run on each of two rings is one whole vertex event
 * bearing two bisectors (decisions 3 to 10); a ring of two bisectors such a layer leaves is its own child, closed by the
 * pair handler (decisions 11 and 12); and a strike on a segment two of whose pieces stand on the instigator's ring takes
 * the piece that contains it (decision 17). What stays refused is refused by name (decision 21).
 *
 *  - every fixture of decisions 34 to 37 against its closed form, node by node, with the battery of join-and-divide
 *    decision 42 (decision 38), and under two translations (§2's measurement);
 *  - the refusal specimen, grid draw `uniform-1-523`, refused by name as a vertex event across rings of three runs
 *    (decision 21). Node 5's E′, refused here under decision 22 until the flat-ring and third-front spec, is cured and
 *    asserted against its closed form in `holed-flat-and-third-front.test.ts`, with `2h-int-1`, once red here;
 *  - `crossRingRuns`' cases (decision 39's last paragraph);
 *  - `2h-int-113`, once red by design, a sound solve whose culled self-loop the battery had counted (BSA.D314), and
 *    the battery's interior-graph shape convicted on a culled and an un-culled self-loop;
 *  - fixtures A and D turned by an irrational angle and moved, against their closed forms carried through the same
 *    motion (BSA.D314).
 *
 * Each closed form is re-derived in its comment: for an axis-aligned, equal-weight region a node's time is its
 * L-infinity distance to the nearest wall, and a node lies at that distance from each of its walls.
 */
import type {BisectionParams, Vector2} from '@proc-geo/core';
import {initInteriorEdges, makeStraightSkeletonSolverContext, setSkeletonLogLevel} from '@proc-geo/core';
import {crossRingRuns} from '@proc-geo/core/straight-skeleton/vertex-event';
import {LayerLinks, linkBirth, linkSplit} from '@proc-geo/core/straight-skeleton/wavefront';
import {
    HOLED_F1 as F1,
    HOLED_F1_HOLE as F1_HOLE,
    HOLED_A as A,
    HOLED_A_PRIME as A_PRIME,
    HOLED_B as B,
    HOLED_C1 as C1,
    HOLED_C2 as C2,
    HOLED_C2_PRIME as C2_PRIME,
    HOLED_D as D,
    HOLED_E as E,
    HOLED_F as F,
    HOLED_G as G,
    HOLED_H as H,
    HOLED_H_THETA as H_THETA,
    HoledTestPolygon as HoledFixture,
} from '@proc-geo/test-fixtures';
import {
    ClosedForm,
    ExpectedNode,
    expectClosedForm,
    expectSoundHoledSolve,
    extentOf,
    GRID_DRAW_523,
    holeRect,
    interiorGraphShape,
    Motion,
    moved,
    outlineRect,
    REFUSAL_KINDS,
    solveHoled,
    storyOf,
    translated,
} from './holed-test-helpers';

setSkeletonLogLevel('silent');

const SQRT2 = Math.SQRT2;

/*
 * THE FIXTURES ARE THE HOLED ROSTER'S (`HOLED_TEST_POLYGONS` in `@proc-geo/test-fixtures`; the loop-consumers spec,
 * decision 29), moved there verbatim with names beginning `Holed `. Their closed forms stay here.
 */

/*
 * A, THE CONCENTRIC SQUARE (decision 36). Every gap is 4, so every node is at t = 2, on the square's diagonals: an
 * outline corner (0,0), moving along (1,1), meets the hole corner (4,4), moving along (−1,−1), at (2,2). Four nodes, the
 * ridge square's corners; 8 corner bisectors and 4 ridges of two half-edges make 16 interior edges.
 */
const RIDGE_SQUARE: ExpectedNode[] = [
    {name: 'SW', at: {x: 2, y: 2}, t: 2},
    {name: 'NW', at: {x: 2, y: 8}, t: 2},
    {name: 'NE', at: {x: 8, y: 8}, t: 2},
    {name: 'SE', at: {x: 8, y: 2}, t: 2},
];
const RIDGE_SQUARE_SIDES: [string, string][] = [['SW', 'NW'], ['NW', 'NE'], ['NE', 'SE'], ['SE', 'SW']];

/*
 * A′, CHAMFERED (decision 36). The corner (0,0) is cut by the line x + y = c, c = 4 − 2√2. The chamfer's two bisectors
 * meet on the diagonal at (t, t) where the chamfer's front is (2t − c)/√2 = t, so t = c / (2 − √2) = 2: at (2,2), with
 * the hole corner (4,4). One more corner bisector than A: 17 interior edges, 13 nodes.
 */

/*
 * B, THE OFF-CENTRE RECTANGLE (decision 34): outline [0,20]×[0,10], hole [3,8]×[3,6]. Gaps: left 3, bottom 3, top 4,
 * right 12. At t = 1.5 the left and bottom gaps close: the head-on J1 at (1.5,1.5); the hole corner (3,6), moving along
 * (−1,1), reaches the left wall's front x = t at (1.5, 7.5); (8,3), moving along (1,−1), reaches the bottom's at
 * (9.5, 1.5). At t = 2 the top gap closes: (0,10) along (1,−1) meets J2's bisector at (2,8), and (8,6) reaches the top's
 * front at (10,8). At t = 5 the corridor between the bottom and top walls closes against the hole's right wall at
 * (13,5) and against the outline's right wall, (20 − 5, 5).
 */
const B_FORM: ClosedForm = {
    nodes: [
        {name: 'J1', at: {x: 1.5, y: 1.5}, t: 1.5},
        {name: 'J2', at: {x: 1.5, y: 7.5}, t: 1.5},
        {name: 'J3', at: {x: 9.5, y: 1.5}, t: 1.5},
        {name: 'P1', at: {x: 2, y: 8}, t: 2},
        {name: 'P2', at: {x: 10, y: 8}, t: 2},
        {name: 'Q1', at: {x: 13, y: 5}, t: 5},
        {name: 'Q2', at: {x: 15, y: 5}, t: 5},
    ],
    totalNodes: 15,
    interiorEdges: 19,
    ridges: [['J1', 'J2'], ['J1', 'J3'], ['P1', 'P2'], ['Q1', 'Q2']],
};

/*
 * C1, THE HOLE OF WEIGHT 2 (decision 36). The hole's fronts move at 2: the outline corner (t, t) meets the hole corner
 * (4 − 2t, 4 − 2t) at t = 4/3, at 4/3 from the outline walls and 8/3 = 2t from the hole's.
 */
const C1_NODES: ExpectedNode[] = [
    {name: 'SW', at: {x: 4 / 3, y: 4 / 3}, t: 4 / 3},
    {name: 'NW', at: {x: 4 / 3, y: 26 / 3}, t: 4 / 3},
    {name: 'NE', at: {x: 26 / 3, y: 26 / 3}, t: 4 / 3},
    {name: 'SE', at: {x: 26 / 3, y: 4 / 3}, t: 4 / 3},
];

/*
 * C2, THE BOTTOM WALL OF WEIGHT 2 (decision 36). The bottom front is y = 2t and the hole's bottom y = 4 − t: they meet
 * at t = 4/3, y = 8/3, where the hole's bottom corners (4 − t, 4 − t) and (6 + t, 4 − t) strike it, at x = 8/3 and
 * 22/3. The joins' bisectors between the hole's sides and the bottom run (4 − t, 2t) and (6 + t, 2t); the outline's
 * bottom corners run (t, 2t) and (10 − t, 2t), and they meet at t = 2, at (2,4) and (8,4). The top corners meet the hole's
 * top corners head-on at t = 2, (2,8) and (8,8). The ridges are the bottom corridor y = 8/3, the side corridors x = 2 and
 * x = 8 from y = 4 to 8, and the top corridor y = 8: 8 corner bisectors, 2 join bisectors to (2,4) and (8,4), and 4
 * ridges of two half-edges, 18 interior edges. C2′ is C2 with the hole listed from (6,4): the strike at x = 22/3 then
 * resolves first (decision 17's worked example).
 */
const C2_FORM: ClosedForm = {
    nodes: [
        {name: 'J_L', at: {x: 8 / 3, y: 8 / 3}, t: 4 / 3},
        {name: 'J_R', at: {x: 22 / 3, y: 8 / 3}, t: 4 / 3},
        {name: 'L', at: {x: 2, y: 4}, t: 2},
        {name: 'R', at: {x: 8, y: 4}, t: 2},
        {name: 'NW', at: {x: 2, y: 8}, t: 2},
        {name: 'NE', at: {x: 8, y: 8}, t: 2},
    ],
    totalNodes: 14,
    interiorEdges: 18,
    ridges: [['J_L', 'J_R'], ['L', 'NW'], ['NW', 'NE'], ['NE', 'R']],
};

/*
 * D, THE COURTYARD WITH WINGS (decision 35). The hole [300,700]² sits 300 from the outline's four arms. At t = 150 the
 * gaps of 300 close: the head-ons A1 to A4 on the diagonals, and the wing corners (0,300), (0,700), (1000,300),
 * (1000,700), reflex in the region and moving along (±1, ±1), reach the hole's side walls' fronts at x = 150 and 850.
 * At t = 200 the wings, 400 high, close: the wing walls' corners meet at (−250 + 200, 500) and the strike bisectors
 * (hole side, wing wall) at (300 − 200, 500); the right wing likewise.
 */
const D_FORM: ClosedForm = {
    nodes: [
        {name: 'A1', at: {x: 150, y: 150}, t: 150},
        {name: 'A2', at: {x: 850, y: 150}, t: 150},
        {name: 'A3', at: {x: 850, y: 850}, t: 150},
        {name: 'A4', at: {x: 150, y: 850}, t: 150},
        {name: 'S1', at: {x: 150, y: 450}, t: 150},
        {name: 'S2', at: {x: 150, y: 550}, t: 150},
        {name: 'S3', at: {x: 850, y: 450}, t: 150},
        {name: 'S4', at: {x: 850, y: 550}, t: 150},
        {name: 'P1', at: {x: -50, y: 500}, t: 200},
        {name: 'P2', at: {x: 100, y: 500}, t: 200},
        {name: 'P3', at: {x: 900, y: 500}, t: 200},
        {name: 'P4', at: {x: 1100, y: 500}, t: 200},
    ],
    totalNodes: 28,
    interiorEdges: 36,
    ridges: [['A1', 'A2'], ['A4', 'A3'], ['A1', 'S1'], ['S2', 'A4'], ['A2', 'S3'], ['S4', 'A3'], ['P1', 'P2'], ['P3', 'P4']],
};

/*
 * E, TWO HOLES (decision 37): outline [0,22]×[0,10], holes [3,9]×[3,7] and [13,19]×[3,7]. Every outer gap is 3, so at
 * t = 1.5 the four outer corners meet head-on, and the holes' inner corners (9,3), (9,7), (13,3), (13,7), moving
 * diagonally outwards, reach the top and bottom fronts at x = 10.5 and 11.5. The gap between the holes is 4: at t = 2
 * the pocket closes at (11, 2) and (11, 8). 12 corner bisectors, 7 ridges of two half-edges and the 4 strike
 * bisectors into the pocket: 30 interior edges.
 */
const E_FORM: ClosedForm = {
    nodes: [
        {name: 'H_SW', at: {x: 1.5, y: 1.5}, t: 1.5},
        {name: 'H_NW', at: {x: 1.5, y: 8.5}, t: 1.5},
        {name: 'H_NE', at: {x: 20.5, y: 8.5}, t: 1.5},
        {name: 'H_SE', at: {x: 20.5, y: 1.5}, t: 1.5},
        {name: 'S_1B', at: {x: 10.5, y: 1.5}, t: 1.5},
        {name: 'S_1T', at: {x: 10.5, y: 8.5}, t: 1.5},
        {name: 'S_2B', at: {x: 11.5, y: 1.5}, t: 1.5},
        {name: 'S_2T', at: {x: 11.5, y: 8.5}, t: 1.5},
        {name: 'M_B', at: {x: 11, y: 2}, t: 2},
        {name: 'M_T', at: {x: 11, y: 8}, t: 2},
    ],
    totalNodes: 22,
    interiorEdges: 30,
    ridges: [['H_SW', 'H_NW'], ['H_SW', 'S_1B'], ['H_NW', 'S_1T'], ['H_SE', 'H_NE'], ['S_2B', 'H_SE'], ['S_2T', 'H_NE'],
        ['M_B', 'M_T']],
};

/*
 * F, AN OCTAGON IN AN OCTAGON (decision 37): radii 10 and 4, vertices on the rays π/8 + kπ/4. The apothems are
 * 10 cos(π/8) and 4 cos(π/8), so every gap is 6 cos(π/8) and every vertex pair meets head-on at t = 3 cos(π/8), at
 * radius (10 + 4) / 2 = 7 on its ray. 16 corner bisectors and 8 ridges of two half-edges: 32 interior edges.
 */
const F_FORM: ClosedForm = {
    nodes: Array.from({length: 8}, (_unused, k) => {
        const angle = Math.PI / 8 + k * Math.PI / 4;
        return {name: `R${k}`, at: {x: 7 * Math.cos(angle), y: 7 * Math.sin(angle)}, t: 3 * Math.cos(Math.PI / 8)};
    }),
    totalNodes: 24,
    interiorEdges: 32,
    ridges: Array.from({length: 8}, (_unused, k) => [`R${k}`, `R${(k + 1) % 8}`] as [string, string]),
};

/*
 * G, THE CENTRED DIAMOND (decision 37; node 4's refusal specimen). The hole's corner (6,5) moves along (1,0) at √2 and
 * reaches the right wall's front x = 10 − t at 6 + √2t = 10 − t, so t = 4/(1 + √2) = 4(√2 − 1), at x = 14 − 4√2, and
 * the other three corners by the symmetry. Each corner region then closes as a triangle of the two outline walls and the
 * hole edge facing them: on the diagonal (p, p), 10 − p = t and the edge x + y = 11 is at (2p − 11)/√2 = t, so
 * t = 4.5(2 − √2) and p = 1 + 4.5√2. Generic: 8 interior nodes, 16 interior edges.
 */
const G_STRIKE_T = 4 * (SQRT2 - 1);
const G_TRIANGLE_T = 4.5 * (2 - SQRT2);
const G_P = 1 + 4.5 * SQRT2;
const G_FORM: ClosedForm = {
    nodes: [
        {name: 'S_R', at: {x: 14 - 4 * SQRT2, y: 5}, t: G_STRIKE_T},
        {name: 'S_T', at: {x: 5, y: 14 - 4 * SQRT2}, t: G_STRIKE_T},
        {name: 'S_L', at: {x: 4 * SQRT2 - 4, y: 5}, t: G_STRIKE_T},
        {name: 'S_B', at: {x: 5, y: 4 * SQRT2 - 4}, t: G_STRIKE_T},
        {name: 'T_NE', at: {x: G_P, y: G_P}, t: G_TRIANGLE_T},
        {name: 'T_NW', at: {x: 10 - G_P, y: G_P}, t: G_TRIANGLE_T},
        {name: 'T_SW', at: {x: 10 - G_P, y: 10 - G_P}, t: G_TRIANGLE_T},
        {name: 'T_SE', at: {x: G_P, y: 10 - G_P}, t: G_TRIANGLE_T},
    ],
    totalNodes: 16,
    interiorEdges: 16,
    ridges: [],
};

/*
 * H, A CENTRED SQUARE OF HALF-DIAGONAL 1.2 TURNED 0.3 RAD (decision 37): four strikes at one moment. The corner at angle
 * θ = 0.3 moves radially at √2 and reaches the right wall's front first (cos θ > sin θ): 5 + (1.2 + √2t) cos θ = 10 − t,
 * so t = (5 − 1.2 cos θ) / (1 + √2 cos θ); the others by the quarter-turn symmetry about (5,5). Each corner region then
 * closes as the triangle of its two outline walls and the hole edge between the two corners that struck them: on the
 * diagonal (10 − t, 10 − t), at distance t from that edge's line.
 */
const H_HOLE = H.holes[0].vertices;
const quarterTurn = (p: Vector2, k: number): Vector2 => {
    let {x, y} = p;
    for (let i = 0; i < k; i++) {
        [x, y] = [10 - y, x];
    }
    return {x, y};
};
const H_FORM: ClosedForm = (() => {
    const c = Math.cos(H_THETA);
    const s = Math.sin(H_THETA);
    const strikeT = (5 - 1.2 * c) / (1 + SQRT2 * c);
    const strike: Vector2 = {x: 10 - strikeT, y: 5 + (1.2 + SQRT2 * strikeT) * s};
    // The NE triangle: walls x = 10, y = 10 and the hole edge from corner 0 to corner 1, whose inward (region-side)
    // normal points away from the centre. (10 − t, 10 − t) lies at distance t from that edge's line.
    const [p0, p1] = [H_HOLE[0], H_HOLE[1]];
    const length = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    const normal = {x: (p1.y - p0.y) / length, y: -(p1.x - p0.x) / length};
    // n · ((10 − t, 10 − t) − p0) = t  ⇒  t = (n · ((10,10) − p0)) / (1 + n.x + n.y)
    const triangleT = (normal.x * (10 - p0.x) + normal.y * (10 - p0.y)) / (1 + normal.x + normal.y);
    const triangle: Vector2 = {x: 10 - triangleT, y: 10 - triangleT};
    return {
        nodes: [0, 1, 2, 3].flatMap(k => [
            {name: `S${k}`, at: quarterTurn(strike, k), t: strikeT},
            {name: `T${k}`, at: quarterTurn(triangle, k), t: triangleT},
        ]),
        totalNodes: 16,
        interiorEdges: 16,
        ridges: [],
    };
})();

/** A fixture with its closed form. */
const SOLVED: {fixture: HoledFixture; form: ClosedForm}[] = [
    {fixture: A, form: {nodes: RIDGE_SQUARE, totalNodes: 12, interiorEdges: 16, ridges: RIDGE_SQUARE_SIDES}},
    {fixture: A_PRIME, form: {nodes: RIDGE_SQUARE, totalNodes: 13, interiorEdges: 17, ridges: RIDGE_SQUARE_SIDES}},
    {fixture: B, form: B_FORM},
    {fixture: C1, form: {nodes: C1_NODES, totalNodes: 12, interiorEdges: 16, ridges: RIDGE_SQUARE_SIDES}},
    {fixture: C2, form: C2_FORM},
    {fixture: C2_PRIME, form: C2_FORM},
    {fixture: D, form: D_FORM},
    {fixture: E, form: E_FORM},
    {fixture: F, form: F_FORM},
    {fixture: G, form: G_FORM},
    {fixture: H, form: H_FORM},
];

describe('the fixtures of decisions 34 to 37, each against its closed form (decision 38)', () => {
    it.each(SOLVED.map(({fixture, form}) => [fixture.name, fixture, form] as const))('%s', (_name, fixture, form) => {
        expectClosedForm(fixture, form);
    });

    it.each(SOLVED.flatMap(({fixture, form}) => [{x: 1 / 3, y: 1 / 7}, {x: 1234.5678, y: -987.654321}]
        .map(offset => [`${fixture.name} translated by (${offset.x}, ${offset.y})`, fixture, form, offset] as const)))(
        '%s', (_name, fixture, form, offset) => {
            expectClosedForm(translated(fixture, offset), form, v => ({x: v.x + offset.x, y: v.y + offset.y}));
        });
});

/*
 * TURNED BY AN IRRATIONAL ANGLE AND MOVED (BSA.D314). A rigid motion carries a skeleton to the skeleton of the moved
 * region, so each closed form is the same one carried through the same motion, and each node's time is unchanged. The
 * angle is √2 rad, so no wall of either fixture lands on an axis and no coordinate stays exact: every event is
 * computed in rounded arithmetic. A is the concentric square (one layer of four head-ons); D is the courtyard with
 * wings, whose two outline walls either side of each wing are collinear and face the same way (BSA.F103's
 * precondition).
 */
describe('A and D turned by √2 rad and moved, against their closed forms carried through the same motion', () => {
    const THETA = Math.SQRT2;
    const OFFSET: Vector2 = {x: 271.8281828, y: -314.1592654};
    const turnAndMove: Motion = v => ({
        x: Math.cos(THETA) * v.x - Math.sin(THETA) * v.y + OFFSET.x,
        y: Math.sin(THETA) * v.x + Math.cos(THETA) * v.y + OFFSET.y,
    });

    it.each([
        ['A', A, {nodes: RIDGE_SQUARE, totalNodes: 12, interiorEdges: 16, ridges: RIDGE_SQUARE_SIDES}],
        ['D', D, D_FORM],
    ] as const)('%s', (_name, fixture, form) => {
        expectClosedForm(moved(fixture, turnAndMove, 'turned by √2 rad and moved'), form, turnAndMove);
    });
});

describe('what the fixtures were chosen for', () => {
    it('A: the root layer is the only multi-ring step, and leaves four rings of two (decisions 11, 12 and 26)', () => {
        const solve = solveHoled(A);
        expect(storyOf(solve)).toEqual(['4{0}+4{1}', '2{0,1} | 2{0,1} | 2{0,1} | 2{0,1}', '']);
    });

    it('A′: the chamfer\'s two bisectors and the hole corner are one vertex event, resolved whole (decisions 3 and 7)', () => {
        const {result} = expectSoundHoledSolve(A_PRIME);
        const {graph} = result;
        // The SW node: the two chamfer bisectors and the hole corner (4,4) end there, and two ridges leave it.
        const sw = graph.nodes.slice(graph.numExteriorNodes)
            .find(node => Math.hypot(node.position.x - 2, node.position.y - 2) < 1e-9)!;
        expect(sw).toBeDefined();
        const arriving = graph.interiorEdges.filter(interior => graph.edges[interior.id].target === sw.id
            && graph.edges[interior.id].source < graph.numExteriorNodes);
        expect(arriving.map(interior => graph.edges[interior.id].source).sort((a, b) => a - b)).toEqual([0, 4, 5]);
    });

    it('C2 and C2′ give one answer whichever strike of the bottom wall resolves first (decision 17)', () => {
        const positions = (fixture: HoledFixture) => {
            const {graph} = solveHoled(fixture).result;
            return graph.nodes.slice(graph.numExteriorNodes)
                .map(node => `${node.position.x.toFixed(9)},${node.position.y.toFixed(9)}`)
                .sort();
        };
        expect(positions(C2_PRIME)).toEqual(positions(C2));
    });
});

describe('what stays refused (decision 21; flat-ring and third-front spec, decision 53)', () => {
    it('the refusal specimen, grid draw uniform-1-523, is refused by name as a vertex event of three runs', () => {
        const {result} = solveHoled(GRID_DRAW_523);
        expect(result.complete).toBe(false);
        const refusals = result.diagnostics.filter(diagnostic => REFUSAL_KINDS.includes(diagnostic.kind));
        expect(refusals.map(diagnostic => diagnostic.kind)).toEqual(['simultaneous-across-rings']);
        expect(refusals[0].detail).toMatch(/^Step \[[0-9, ]+\]: /);
        expect(refusals[0].detail).toContain('in other than one run on each of two');
        expect(refusals[0].detail).toContain('(decision 21)');
        expect(result.diagnostics.map(diagnostic => diagnostic.kind)).toContain('step-failure');
    });
});

/*
 * A SOUND SOLVE ONCE MISREAD AS A DEFECT (BSA.F103, BSA.D314). The holes' left walls are collinear at x = 4, 4 from the
 * outline's left wall, and 4 apart vertically (y = 8 to 12). By t = 2 every ring has joined, and at t = 2 the outline's
 * left front, both holes' left fronts and the gap between the holes all close at (2, 10): a node of degree five where
 * nothing is born. The one-ring step bears a bisector between the two collinear hole walls there and retires it at its
 * own source as a CULLED self-loop (`applyDegenerateClosure`), which is how a sound solve represents a surplus bisector
 * at a degenerate closure. This was a red test only because the battery's `interiorGraphShape` counted culled
 * self-loops; it now skips them, as `buildSkeletonTree` does, and the solve passes the whole battery.
 */
describe('two holes with collinear left walls meet three fronts on one ring soundly (2h-int-113)', () => {
    const fixture: HoledFixture = {
        name: 'two holes with collinear left walls',
        outline: outlineRect(0, 0, 8, 14),
        holes: [{vertices: holeRect(4, 6, 5, 8)}, {vertices: holeRect(4, 12, 7, 13)}],
    };

    it('passes the battery, with one node at (2, 10)', () => {
        const {result} = expectSoundHoledSolve(fixture);
        const {graph} = result;
        const atMeeting = graph.nodes.slice(graph.numExteriorNodes)
            .filter(node => Math.hypot(node.position.x - 2, node.position.y - 10) <= 1e-9 * extentOf(fixture));
        expect(atMeeting).toHaveLength(1);
    });

    it('carries its surplus bisector between the collinear walls as a culled self-loop at (2, 10)', () => {
        const {graph} = solveHoled(fixture).result;
        const selfLoops = graph.interiorEdges.filter(interior =>
            graph.edges[interior.id].target === graph.edges[interior.id].source);
        expect(selfLoops.map(interior => ({
            culled: interior.culled === true,
            at: graph.nodes[graph.edges[interior.id].source].position,
        }))).toEqual([{culled: true, at: {x: 2, y: 10}}]);
    });
});

/*
 * THE BATTERY'S INTERIOR-GRAPH SHAPE skips a culled edge before it counts anything (BSA.D314), and still reports a
 * self-loop that is not culled. Convicted on constructed graphs: A's sound solve with one self-loop added at an interior
 * node, once culled and once not.
 */
describe('interiorGraphShape reads a culled self-loop as no edge and an un-culled one as a defect', () => {
    const withSelfLoop = (culled: boolean) => {
        const graph = structuredClone(solveHoled(A).result.graph);
        const node = graph.numExteriorNodes;
        const id = graph.edges.length;
        graph.edges.push({...graph.edges[graph.interiorEdges[0].id], id, source: node, target: node});
        graph.interiorEdges.push({...graph.interiorEdges[0], id, culled});
        return {graph, id};
    };

    it('a culled self-loop changes nothing: no self-loop, one component, cycle rank 1', () => {
        const {graph} = withSelfLoop(true);
        expect(interiorGraphShape(graph)).toEqual({components: 1, selfLoops: [], cycleRank: 1, unresolved: []});
    });

    it('an un-culled self-loop is reported, and adds a cycle', () => {
        const {graph, id} = withSelfLoop(false);
        expect(interiorGraphShape(graph)).toEqual({components: 1, selfLoops: [id], cycleRank: 2, unresolved: []});
    });
});

/*
 * THE PIECE RULE'S FALLBACK (decision 17; BSA.D314). When two or more pieces of a struck segment stand on the
 * instigator's ring and none of them contains the strike, the strike takes the piece that contains it by position along
 * the edge, as the branch for no piece on the ring does, and no longer the first piece on the ring. No roster reaches
 * this branch, so it is convicted on links written by hand in F1's context: outline bisectors b8 to b11 at (0,0),
 * (0,10), (10,10), (10,0) and hole bisectors h12 to h15. Edge 2 runs (10,10) to (10,0), basis (0, −1), and its one
 * segment is (b10, b11). Three strikes of that segment in one layer:
 *
 *  1. h12 strikes it at y = 7, a join: pieces P0 = (b10, B1) and P1 = (A1, b11), both on the joined ring
 *     b8 b9 b10 B1 h13 h14 h15 A1 b11.
 *  2. b9 strikes it at y = 3, inside P1, a divide: P1 becomes (A1, B2) and P2 = (A2, b11). The ring through b10 is now
 *     b10 B1 h13 h14 h15 A1 B2, which holds P0 and P1; P2 is on the other ring, b8 A2 b11.
 *  3. h14 strikes it at y = 1, beyond both cuts. P0 and P1 stand on h14's ring and neither contains y = 1; P2 does.
 */
describe('the piece rule takes the piece by position when no piece on the ring contains the strike (decision 17)', () => {
    it('strikes P2, the piece holding the strike, and not P0, the first piece on the ring', () => {
        const context = makeStraightSkeletonSolverContext(
            [...F1.outline, ...F1_HOLE], undefined, undefined, [{start: 0, count: 4}, {start: 4, count: 4}]);
        initInteriorEdges(context);
        const segment = {exteriorEdge: 2, from: 10, to: 11};
        const params = (clockwise: number, widdershins: number): BisectionParams =>
            ({clockwiseExteriorEdgeIndex: clockwise, widdershinsExteriorEdgeIndex: widdershins, source: 0});
        const births = {
            B1: params(4, 2), A1: params(2, 7),
            B2: params(1, 2), A2: params(2, 0),
            B3: params(6, 2), A3: params(2, 5),
        };
        const layer = new LayerLinks(context);
        linkSplit(layer, 12, segment, {x: 10, y: 7}, births.B1, births.A1);
        linkSplit(layer, 9, segment, {x: 10, y: 3}, births.B2, births.A2);
        linkSplit(layer, 14, segment, {x: 10, y: 1}, births.B3, births.A3);
        // Every pending birth born, so the links read as ids: B1 100, A1 101, B2 102, A2 103, B3 104, A3 105.
        Object.values(births).forEach((birth, k) => linkBirth(layer, birth, 100 + k));
        const {clockwiseNeighbour, widdershinsNeighbour} = context.wavefront;
        // B3 opens behind the strike on the struck piece's `from`, which is A2: P2's start, not b10, P0's.
        expect(widdershinsNeighbour[104]).toBe(103);
        expect(clockwiseNeighbour[103]).toBe(104);
        expect(clockwiseNeighbour[10]).toBe(100);
        // A3 closes on P2's end, b11, and the strike's two births go to h14's neighbours, h15 and h13.
        expect([widdershinsNeighbour[105], clockwiseNeighbour[105]]).toEqual([13, 11]);
        expect(clockwiseNeighbour[104]).toBe(15);
    });
});

describe('crossRingRuns (decision 39)', () => {
    const RINGS = [[8, 9, 10, 11], [12, 13, 14, 15], [16, 17, 18, 19]];

    it('finds one run on each of two rings, first the run on the ring that comes first', () => {
        expect(crossRingRuns(RINGS, {edgeIds: [8, 12]})).toEqual([[8], [12]]);
        // A run that wraps round its ring's start is read in its clockwise order.
        expect(crossRingRuns(RINGS, {edgeIds: [8, 11, 14]})).toEqual([[11, 8], [14]]);
        expect(crossRingRuns(RINGS, {edgeIds: [13, 14, 17, 18]})).toEqual([[13, 14], [17, 18]]);
    });

    it('is undefined for two runs on one ring with a third ring', () => {
        expect(crossRingRuns(RINGS, {edgeIds: [8, 10, 12]})).toBeUndefined();
    });

    it('is undefined for three rings', () => {
        expect(crossRingRuns(RINGS, {edgeIds: [8, 12, 16]})).toBeUndefined();
    });

    it('is undefined when a run is its whole ring', () => {
        expect(crossRingRuns(RINGS, {edgeIds: [8, 9, 10, 11, 12]})).toBeUndefined();
    });

    it('is undefined for a merge on one ring, and for an edge on no ring', () => {
        expect(crossRingRuns(RINGS, {edgeIds: [8, 9]})).toBeUndefined();
        expect(crossRingRuns(RINGS, {edgeIds: [8, 40]})).toBeUndefined();
    });
});
