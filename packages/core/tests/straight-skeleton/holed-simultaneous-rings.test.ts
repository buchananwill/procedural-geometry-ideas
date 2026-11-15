/*
 * SIMULTANEOUS EVENTS ACROSS RINGS (docs/notes/skeleton-simultaneous-rings-decisions.md, roadmap node 5). A layer in
 * which events of two rings coincide is resolved: a meeting of one run on each of two rings is one whole vertex event
 * bearing two bisectors (decisions 3 to 10); a ring of two bisectors such a layer leaves is its own child, closed by the
 * pair handler (decisions 11 and 12); and a strike on a segment two of whose pieces stand on the instigator's ring takes
 * the piece that contains it (decision 17). What stays refused is refused by name (decisions 21 and 22).
 *
 *  - every fixture of decisions 34 to 37 against its closed form, node by node, with the battery of join-and-divide
 *    decision 42 (decision 38), and under two translations (§2's measurement);
 *  - E′, refused by name as a meeting on a third front (decisions 22 and 44);
 *  - `crossRingRuns`' cases (decision 39's last paragraph);
 *  - two courtyards from the fuzz that do not solve, RED BY DESIGN, each with its issue note (BSA.D266).
 *
 * Each closed form is re-derived in its comment: for an axis-aligned, equal-weight region a node's time is its
 * L-infinity distance to the nearest wall, and a node lies at that distance from each of its walls.
 */
import type {Vector2} from '@proc-geo/core';
import {setSkeletonLogLevel} from '@proc-geo/core';
import {crossRingRuns} from '@proc-geo/core/straight-skeleton/coincident-events';
import {
    expectSoundHoledSolve,
    extentOf,
    HoledFixture,
    REFUSAL_KINDS,
    solveHoled,
    storyOf,
} from './holed-test-helpers';

setSkeletonLogLevel('silent');

const SQRT2 = Math.SQRT2;

/** A clockwise axis-aligned rectangle outline. */
function outlineRect(x0: number, y0: number, x1: number, y1: number): Vector2[] {
    return [{x: x0, y: y0}, {x: x0, y: y1}, {x: x1, y: y1}, {x: x1, y: y0}];
}

/** A counter-clockwise axis-aligned rectangle hole. */
function holeRect(x0: number, y0: number, x1: number, y1: number): Vector2[] {
    return [{x: x0, y: y0}, {x: x1, y: y0}, {x: x1, y: y1}, {x: x0, y: y1}];
}

/** A square of half-diagonal `r` about `centre`, turned by `angle`, counter-clockwise. */
function turnedSquare(centre: Vector2, r: number, angle: number): Vector2[] {
    return [0, 1, 2, 3].map(k => ({
        x: centre.x + r * Math.cos(angle + k * Math.PI / 2),
        y: centre.y + r * Math.sin(angle + k * Math.PI / 2),
    }));
}

/** A regular octagon of radius `r` about the origin, vertices at π/8 + kπ/4, clockwise or counter-clockwise. */
function octagon(r: number, clockwise: boolean): Vector2[] {
    return Array.from({length: 8}, (_unused, k) => {
        const angle = Math.PI / 8 + (clockwise ? -1 : 1) * k * Math.PI / 4;
        return {x: r * Math.cos(angle), y: r * Math.sin(angle)};
    });
}

/** One node of a closed form: where it is and when. */
interface ExpectedNode {
    name: string;
    at: Vector2;
    t: number;
}

/** The closed form of one fixture: its interior nodes, its counts, and the ridges that carry two half-edges. */
interface ClosedForm {
    nodes: ExpectedNode[];
    totalNodes: number;
    interiorEdges: number;
    /** Pairs of node names joined by two interior edges, one each way: the ridges of anti-parallel walls. */
    ridges: [string, string][];
}

const SQUARE = outlineRect(0, 0, 10, 10);

/*
 * A, THE CONCENTRIC SQUARE (decision 36). Every gap is 4, so every node is at t = 2, on the square's diagonals: an
 * outline corner (0,0), moving along (1,1), meets the hole corner (4,4), moving along (−1,−1), at (2,2). Four nodes, the
 * ridge square's corners; 8 corner bisectors and 4 ridges of two half-edges make 16 interior edges.
 */
const A: HoledFixture = {name: 'A: the concentric square', outline: SQUARE, holes: [{vertices: holeRect(4, 4, 6, 6)}]};
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
const CHAMFER = 4 - 2 * SQRT2;
const A_PRIME: HoledFixture = {
    name: 'A′: the chamfered concentric square',
    outline: [{x: 0, y: CHAMFER}, {x: 0, y: 10}, {x: 10, y: 10}, {x: 10, y: 0}, {x: CHAMFER, y: 0}],
    holes: [{vertices: holeRect(4, 4, 6, 6)}],
};

/*
 * B, THE OFF-CENTRE RECTANGLE (decision 34): outline [0,20]×[0,10], hole [3,8]×[3,6]. Gaps: left 3, bottom 3, top 4,
 * right 12. At t = 1.5 the left and bottom gaps close: the head-on J1 at (1.5,1.5); the hole corner (3,6), moving along
 * (−1,1), reaches the left wall's front x = t at (1.5, 7.5); (8,3), moving along (1,−1), reaches the bottom's at
 * (9.5, 1.5). At t = 2 the top gap closes: (0,10) along (1,−1) meets J2's bisector at (2,8), and (8,6) reaches the top's
 * front at (10,8). At t = 5 the corridor between the bottom and top walls closes against the hole's right wall at
 * (13,5) and against the outline's right wall, (20 − 5, 5).
 */
const B: HoledFixture = {
    name: 'B: the off-centre rectangle',
    outline: outlineRect(0, 0, 20, 10),
    holes: [{vertices: holeRect(3, 3, 8, 6)}],
};
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
const C1: HoledFixture = {
    name: 'C1: A with the hole of weight 2',
    outline: SQUARE,
    holes: [{vertices: holeRect(4, 4, 6, 6), weights: [2, 2, 2, 2]}],
};
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
 * ridges of two half-edges, 18 interior edges.
 */
const C2_OUTLINE_WEIGHTS = [1, 1, 1, 2];
const C2: HoledFixture = {
    name: 'C2: A with the bottom wall of weight 2',
    outline: SQUARE,
    weights: C2_OUTLINE_WEIGHTS,
    holes: [{vertices: holeRect(4, 4, 6, 6)}],
};
/** C2 with the hole listed from (6,4): the strike at x = 22/3 now resolves first (decision 17's worked example). */
const C2_PRIME: HoledFixture = {
    name: 'C2′: C2 with the hole listed from (6,4)',
    outline: SQUARE,
    weights: C2_OUTLINE_WEIGHTS,
    holes: [{vertices: [{x: 6, y: 4}, {x: 6, y: 6}, {x: 4, y: 6}, {x: 4, y: 4}]}],
};
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
const D: HoledFixture = {
    name: 'D: the courtyard with wings',
    outline: [{x: 0, y: 0}, {x: 0, y: 300}, {x: -250, y: 300}, {x: -250, y: 700}, {x: 0, y: 700}, {x: 0, y: 1000},
        {x: 1000, y: 1000}, {x: 1000, y: 700}, {x: 1300, y: 700}, {x: 1300, y: 300}, {x: 1000, y: 300}, {x: 1000, y: 0}],
    holes: [{vertices: holeRect(300, 300, 700, 700)}],
};
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
const E: HoledFixture = {
    name: 'E: two holes',
    outline: outlineRect(0, 0, 22, 10),
    holes: [{vertices: holeRect(3, 3, 9, 7)}, {vertices: holeRect(13, 3, 19, 7)}],
};
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
 * E′, TWO HOLES WITH EVERY GAP 3 (decision 37; refused under decision 22): outline [0,21]×[0,10], holes [3,9]×[3,7]
 * and [12,18]×[3,7]. At t = 1.5 the corners (9,3) and (12,3) meet each other at (10.5, 1.5) on the bottom wall's front:
 * three fronts at one point.
 */
const E_PRIME: HoledFixture = {
    name: 'E′: two holes, every gap 3',
    outline: outlineRect(0, 0, 21, 10),
    holes: [{vertices: holeRect(3, 3, 9, 7)}, {vertices: holeRect(12, 3, 18, 7)}],
};

/*
 * F, AN OCTAGON IN AN OCTAGON (decision 37): radii 10 and 4, vertices on the rays π/8 + kπ/4. The apothems are
 * 10 cos(π/8) and 4 cos(π/8), so every gap is 6 cos(π/8) and every vertex pair meets head-on at t = 3 cos(π/8), at
 * radius (10 + 4) / 2 = 7 on its ray. 16 corner bisectors and 8 ridges of two half-edges: 32 interior edges.
 */
const F: HoledFixture = {name: 'F: an octagon in an octagon', outline: octagon(10, true), holes: [{vertices: octagon(4, false)}]};
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
const G: HoledFixture = {
    name: 'G: the centred diamond',
    outline: SQUARE,
    holes: [{vertices: [{x: 6, y: 5}, {x: 5, y: 6}, {x: 4, y: 5}, {x: 5, y: 4}]}],
};
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
const H_THETA = 0.3;
const H_HOLE = turnedSquare({x: 5, y: 5}, 1.2, H_THETA);
const H: HoledFixture = {name: 'H: a centred square turned 0.3 rad', outline: SQUARE, holes: [{vertices: H_HOLE}]};
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

function translated(fixture: HoledFixture, offset: Vector2): HoledFixture {
    const move = (vertices: readonly Vector2[]) => vertices.map(v => ({x: v.x + offset.x, y: v.y + offset.y}));
    return {
        ...fixture,
        name: `${fixture.name} + (${offset.x}, ${offset.y})`,
        outline: move(fixture.outline),
        holes: fixture.holes.map(hole => ({...hole, vertices: move(hole.vertices)})),
    };
}

/** The closed form, node by node: one interior node within the tolerance of each, and nothing more. */
function expectClosedForm(fixture: HoledFixture, form: ClosedForm, offset: Vector2 = {x: 0, y: 0}) {
    const {result} = expectSoundHoledSolve(fixture);
    const {graph} = result;
    const tolerance = 1e-9 * extentOf(fixture);
    const named = new Map<string, number>();
    const found = form.nodes.map(expected => {
        const at = {x: expected.at.x + offset.x, y: expected.at.y + offset.y};
        const matches = graph.nodes.slice(graph.numExteriorNodes)
            .filter(node => Math.hypot(node.position.x - at.x, node.position.y - at.y) <= tolerance);
        if (matches.length === 1) {
            named.set(expected.name, matches[0].id);
        }
        return {name: expected.name, matches: matches.length};
    });
    expect(found).toEqual(form.nodes.map(expected => ({name: expected.name, matches: 1})));
    expect(graph.nodes).toHaveLength(form.totalNodes);
    expect(graph.interiorEdges).toHaveLength(form.interiorEdges);

    // Each node's time: its distance to the line of each wall that names a bisector meeting there, over that wall's
    // weight. Every such wall must give the closed form's time.
    const wallTime = (p: Vector2, wall: number) => {
        const a = graph.nodes[graph.edges[wall].source].position;
        const b = graph.nodes[graph.edges[wall].target!].position;
        const distance = Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / Math.hypot(b.x - a.x, b.y - a.y);
        return distance / graph.exteriorWeights[wall];
    };
    for (const expected of form.nodes) {
        const id = named.get(expected.name)!;
        const walls = new Set(graph.interiorEdges
            .filter(interior => graph.edges[interior.id].source === id || graph.edges[interior.id].target === id)
            .flatMap(interior => [interior.clockwiseExteriorEdgeIndex, interior.widdershinsExteriorEdgeIndex]));
        const times = [...walls].map(wall => wallTime(graph.nodes[id].position, wall));
        expect({name: expected.name, walls: walls.size >= 3, spread: Math.max(...times) - Math.min(...times) <= tolerance})
            .toEqual({name: expected.name, walls: true, spread: true});
        expect({name: expected.name, t: times[0]}).toEqual({name: expected.name, t: expect.closeTo(expected.t, 9)});
    }

    // The ridges between anti-parallel walls carry two half-edges, one each way (decision 11).
    for (const [first, second] of form.ridges) {
        const a = named.get(first)!;
        const b = named.get(second)!;
        const ways = graph.interiorEdges
            .map(interior => graph.edges[interior.id])
            .filter(edge => (edge.source === a && edge.target === b) || (edge.source === b && edge.target === a))
            .map(edge => edge.source === a ? 'forward' : 'back')
            .sort();
        expect({ridge: `${first}-${second}`, ways}).toEqual({ridge: `${first}-${second}`, ways: ['back', 'forward']});
    }
    return result;
}

describe('the fixtures of decisions 34 to 37, each against its closed form (decision 38)', () => {
    it.each(SOLVED.map(({fixture, form}) => [fixture.name, fixture, form] as const))('%s', (_name, fixture, form) => {
        expectClosedForm(fixture, form);
    });

    it.each(SOLVED.flatMap(({fixture, form}) => [{x: 1 / 3, y: 1 / 7}, {x: 1234.5678, y: -987.654321}]
        .map(offset => [`${fixture.name} translated by (${offset.x}, ${offset.y})`, fixture, form, offset] as const)))(
        '%s', (_name, fixture, form, offset) => {
            expectClosedForm(translated(fixture, offset), form, offset);
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

describe('what stays refused (decisions 21, 22 and 44)', () => {
    it('E′, two holes with every gap 3, is refused by name as a meeting on a third front, and makes no node', () => {
        const {result, boundaries} = solveHoled(E_PRIME);
        expect(result.complete).toBe(false);
        const refusals = result.diagnostics.filter(diagnostic => REFUSAL_KINDS.includes(diagnostic.kind));
        expect(refusals.map(diagnostic => diagnostic.kind)).toEqual(['simultaneous-across-rings']);
        const stepInput = boundaries[0].inputs[0];
        expect(refusals[0].detail).toContain(`Step [${[...stepInput].sort((a, b) => a - b).join(', ')}]`);
        expect(refusals[0].detail).toContain('meets a third front');
        expect(result.diagnostics.map(diagnostic => diagnostic.kind)).toContain('step-failure');
        expect(result.graph.nodes).toHaveLength(result.graph.numExteriorNodes);
    });
});

/*
 * RED BY DESIGN (BSA.D266): two courtyards from the fuzz of axis-aligned rectangles with two rectangular holes, each a
 * valid input that this unit lets through its root layer and that does not solve. Both have two holes with collinear
 * walls. Each asserts the battery and the node the true skeleton has; each has its issue note.
 */
describe('red by design: two holes with collinear walls', () => {
    /** The node of `fixture`'s solve at `at`, if exactly one interior node is there. */
    const nodeAt = (fixture: HoledFixture, at: Vector2) => {
        const {graph} = solveHoled(fixture).result;
        return graph.nodes.slice(graph.numExteriorNodes)
            .filter(node => Math.hypot(node.position.x - at.x, node.position.y - at.y) <= 1e-9 * extentOf(fixture)).length;
    };

    /*
     * ISSUE-skeleton-straight-vertex-in-zero-area-ring.md. The holes' tops are collinear at y = 9, 1 apart. At t = 0.5
     * the gap between them closes, and the meeting at (5.5, 9.5) bears a bisector between the two collinear tops: a
     * straight vertex, moving up at 1. At t = 1 the strip between the tops and the outline's top (gap 2) collapses along
     * y = 10, and the straight vertex reaches it at (5.5, 10), where the true skeleton has a node: the ridge y = 10 runs
     * from (2, 10) to (8, 10) through it. The straight vertex is not reflex, so it is never tested for a split; it is left
     * on a ring of three with the two ridge bisectors, at area 0, which `componentsOfRings` refuses.
     */
    it('a straight vertex between collinear hole walls closes on the ridge it reaches (2h-int-1)', () => {
        const fixture: HoledFixture = {
            name: 'two holes with collinear tops',
            outline: outlineRect(0, 0, 9, 11),
            holes: [{vertices: holeRect(6, 8, 7, 9)}, {vertices: holeRect(3, 8, 5, 9)}],
        };
        expectSoundHoledSolve(fixture);
        expect(nodeAt(fixture, {x: 5.5, y: 10})).toBe(1);
    });

    /*
     * ISSUE-skeleton-three-front-meeting-on-one-ring.md. The holes' left walls are collinear at x = 4, 4 from the
     * outline's left wall, and 4 apart vertically (y = 8 to 12). By t = 2 every ring has joined, and at t = 2 the outline's
     * left front, both holes' left fronts and the gap between the holes all close at (2, 10): a node of degree five
     * where nothing is born. The one-ring step bears a bisector between the two collinear hole walls there and ends it
     * where it began, a self-loop. Every other check holds.
     */
    it('a meeting of three fronts on one ring bears no bisector of zero length (2h-int-113)', () => {
        const fixture: HoledFixture = {
            name: 'two holes with collinear left walls',
            outline: outlineRect(0, 0, 8, 14),
            holes: [{vertices: holeRect(4, 6, 5, 8)}, {vertices: holeRect(4, 12, 7, 13)}],
        };
        expectSoundHoledSolve(fixture);
        expect(nodeAt(fixture, {x: 2, y: 10})).toBe(1);
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
