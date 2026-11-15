import type {SkeletonHole, SolveSkeletonOptions, Vector2} from '@proc-geo/core';

/*
 * ============================================================================
 *  THE HOLED ROSTER (skeleton loop-consumers spec, decisions 27 to 31; roadmap node 6).
 * ============================================================================
 *
 * A THIRD ROSTER, OUTSIDE `CLEAN_TEST_POLYGONS`, `KNOWN_DEFECT_POLYGONS` AND `FULL_CORPUS` (decision 28). A
 * `{name, vertices}` cannot hold a hole, and `FULL_CORPUS` goes on meaning every single-loop fixture: the single-loop
 * sweeps pin it at 53 clean and 7 defect entries and 60 digests.
 *
 * ONE RECORD HOLDS THE OUTLINE, ITS WEIGHTS AND ITS HOLES (decisions 27 and 30), so weighted holed fixtures live here
 * beside the unweighted ones: the reason `WEIGHTED_TEST_POLYGONS` stands apart (a weight is an option on the solve,
 * not a property of a bare ring) does not apply to a record. Every sweep solves a holed fixture through
 * {@link holedSolveOptions} and no other way.
 *
 * NO HOLED FIXTURE IS EVER PINNED AS A DEFECT OR HELD OUT (decision 31). A holed fixture that fails stays here, its
 * cell is a red test, and it gets an issue note. There is no holed counterpart of `KNOWN_DEFECT_POLYGONS`.
 *
 * WHERE THEY CAME FROM. F1 to F8 are node 4's fixtures (`holed-join-divide.test.ts`, the join-and-divide spec,
 * decision 41, and F8, the pocket of BSA.D309), moved verbatim. A to H are node 5's solved fixtures
 * (`holed-simultaneous-rings.test.ts`, the simultaneous-rings spec, decisions 34 to 37), moved verbatim in their
 * order. Their closed forms, stories and refusal specimens stay in those two test files: this roster holds fixtures
 * that solve, and a red test stays where its issue note points.
 */

/** An outline and its holes, as a caller passes them to `solveSkeleton` (decision 27). */
export interface HoledTestPolygon {
    name: string;
    /** The outline, clockwise. */
    outline: Vector2[];
    /** The outline's weights, as `SolveSkeletonOptions.weights`; omitted means all ones. */
    weights?: number[];
    /** Each hole, counter-clockwise, with its own optional weights (skeleton loops-input spec, decision 2). */
    holes: SkeletonHole[];
}

/**
 * The options a holed fixture is solved with: `{...options, weights: fixture.weights, holes: fixture.holes}`
 * (decision 27). The one way any sweep solves a holed fixture. The fixture's own weights and holes win over any the
 * caller passes, so a sweep cannot solve a fixture with another fixture's walls.
 */
export function holedSolveOptions(fixture: HoledTestPolygon, options?: SolveSkeletonOptions): SolveSkeletonOptions {
    return {...options, weights: fixture.weights, holes: fixture.holes};
}

const SQRT2 = Math.SQRT2;

/** A square of half-diagonal `r` about `centre`, turned by `angle`, counter-clockwise. */
function turnedSquare(centre: Vector2, r: number, angle: number): Vector2[] {
    return [0, 1, 2, 3].map(k => ({
        x: centre.x + r * Math.cos(angle + k * Math.PI / 2),
        y: centre.y + r * Math.sin(angle + k * Math.PI / 2),
    }));
}

/** Turn a ring of vertices by `angle` about `centre`. */
function turned(vertices: Vector2[], centre: Vector2, angle: number): Vector2[] {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return vertices.map(v => ({
        x: centre.x + c * (v.x - centre.x) - s * (v.y - centre.y),
        y: centre.y + s * (v.x - centre.x) + c * (v.y - centre.y),
    }));
}

/** Mirror a fixture in the vertical line `x = axis`, reversing every loop so each keeps its winding. */
function mirrored(fixture: HoledTestPolygon, axis: number, name: string): HoledTestPolygon {
    const flip = (vertices: readonly Vector2[]) => vertices.map(vertex => ({x: 2 * axis - vertex.x, y: vertex.y})).reverse();
    const flipWeights = (weights: readonly number[] | undefined) => {
        if (weights === undefined) {
            return undefined;
        }
        // Edge i runs from vertex i to i + 1; reversed, it runs from m - 1 - (i + 1) to m - 1 - i.
        const m = weights.length;
        return weights.map((_unused, j) => weights[(m - 2 - j + m) % m]);
    };
    return {
        name,
        outline: flip(fixture.outline),
        weights: flipWeights(fixture.weights),
        holes: fixture.holes.map(hole => ({vertices: flip(hole.vertices), weights: flipWeights(hole.weights)})),
    };
}

/** A clockwise axis-aligned rectangle outline. */
function outlineRect(x0: number, y0: number, x1: number, y1: number): Vector2[] {
    return [{x: x0, y: y0}, {x: x0, y: y1}, {x: x1, y: y1}, {x: x1, y: y0}];
}

/** A counter-clockwise axis-aligned rectangle hole. */
function holeRect(x0: number, y0: number, x1: number, y1: number): Vector2[] {
    return [{x: x0, y: y0}, {x: x1, y: y0}, {x: x1, y: y1}, {x: x0, y: y1}];
}

/** A regular octagon of radius `r` about the origin, vertices at π/8 + kπ/4, clockwise or counter-clockwise. */
function octagon(r: number, clockwise: boolean): Vector2[] {
    return Array.from({length: 8}, (_unused, k) => {
        const angle = Math.PI / 8 + (clockwise ? -1 : 1) * k * Math.PI / 4;
        return {x: r * Math.cos(angle), y: r * Math.sin(angle)};
    });
}

// ── Node 4's fixtures (join-and-divide spec, decision 41) ────────────────────────────────────────────────────────

/** A clockwise outline. */
const SQUARE_OUTLINE: Vector2[] = [{x: 0, y: 0}, {x: 0, y: 10}, {x: 10, y: 10}, {x: 10, y: 0}];

/** F1's hole: a square of side √2 turned 45°, centred at (7, 5.5), counter-clockwise: NE, NW, SW, SE. */
export const HOLED_F1_HOLE: Vector2[] = [{x: 8, y: 5.5}, {x: 7, y: 6.5}, {x: 6, y: 5.5}, {x: 7, y: 4.5}];

/** F1, the join-and-divide spec's worked fixture (its decisions 47 to 49). */
export const HOLED_F1: HoledTestPolygon = {name: 'Holed F1: turned square', outline: SQUARE_OUTLINE, holes: [{vertices: HOLED_F1_HOLE}]};

/** F1 stretched: the specimen that the last open face of a hole is accepted only when it closes. */
export const HOLED_F1_STRETCHED: HoledTestPolygon = {
    name: 'Holed F1 stretched',
    outline: [{x: -20, y: 0}, {x: -20, y: 10}, {x: 10, y: 10}, {x: 10, y: 0}],
    holes: [{vertices: HOLED_F1_HOLE}],
};

/** An irregular quadrilateral with no two walls parallel. */
const QUADRILATERAL: Vector2[] = [{x: 0, y: 0}, {x: -1, y: 12}, {x: 14, y: 13}, {x: 16, y: -1}];

/** F2: two holes, one joining the other before either reaches the outline. */
export const HOLED_F2: HoledTestPolygon = {
    name: 'Holed F2: two holes',
    outline: QUADRILATERAL,
    holes: [
        {vertices: [{x: 7, y: 6}, {x: 6, y: 7}, {x: 5, y: 6}, {x: 6, y: 5}]},
        {vertices: turnedSquare({x: 9.4, y: 6.2}, 1.2, Math.PI / 4 + 0.3)},
    ],
};

const L_HOLE: Vector2[] = [{x: 5, y: 4}, {x: 9, y: 4}, {x: 9, y: 6}, {x: 7, y: 6}, {x: 7, y: 8}, {x: 5, y: 8}];

/** F3: an L-shaped hole, whose inner corner is convex in the region. */
export const HOLED_F3: HoledTestPolygon = {
    name: 'Holed F3: L-shaped hole',
    outline: QUADRILATERAL,
    holes: [{vertices: turned(L_HOLE, {x: 7, y: 6}, 0.15)}],
};

/** F4: F1 with one hole wall of weight 1.3. */
export const HOLED_F4: HoledTestPolygon = {
    name: 'Holed F4: weighted hole',
    outline: SQUARE_OUTLINE,
    holes: [{vertices: HOLED_F1_HOLE, weights: [1.3, 1, 1, 1]}],
};

/** A reflex outline: a notch from the top whose tip strikes the bottom wall early. */
const NOTCHED: Vector2[] = [
    {x: 0, y: 0}, {x: 0.5, y: 6}, {x: 9, y: 6.3}, {x: 10, y: 1.5}, {x: 11, y: 6.2}, {x: 20, y: 5.8}, {x: 19.5, y: -0.3}];

/** F5: a reflex outline whose own split divides it while the hole ring shares the step. */
export const HOLED_F5: HoledTestPolygon = {
    name: 'Holed F5: reflex outline divides',
    outline: NOTCHED,
    holes: [{vertices: turnedSquare({x: 5, y: 3}, 0.7, 0.2)}],
};

/** F5's mirror image, so the hole lies in the first child once and the second once. */
export const HOLED_F5_MIRRORED = mirrored(HOLED_F5, 10, 'Holed F5 mirrored');

/** The notched outline with a shallow notch, whose split comes late. */
const SHALLOW_NOTCHED: Vector2[] = [
    {x: 0, y: 0}, {x: 0.5, y: 6}, {x: 9, y: 6.3}, {x: 10, y: 4.5}, {x: 11, y: 6.2}, {x: 20, y: 5.8}, {x: 19.5, y: -0.3}];

/** F6: a hole near one wall, which joins first. */
export const HOLED_F6: HoledTestPolygon = {
    name: 'Holed F6: hole near a wall',
    outline: SHALLOW_NOTCHED,
    holes: [{vertices: turnedSquare({x: 1.6, y: 3}, 0.5, 0.2)}],
};

/** The square outline with its top-right corner cut by a short edge, which collapses early. */
const CHAMFERED: Vector2[] = [{x: 0, y: 0}, {x: 0, y: 10}, {x: 9.6, y: 10}, {x: 10, y: 9.6}, {x: 10, y: 0}];

/** F7: a hole deep inside, which joins after an outline event. */
export const HOLED_F7: HoledTestPolygon = {
    name: 'Holed F7: deep hole',
    outline: CHAMFERED,
    holes: [{vertices: turnedSquare({x: 5.2, y: 4.7}, 0.8, 0.3)}],
};

/**
 * F8, THE POCKET (join-and-divide spec, decision 15, the least-area rule; BSA.D309): a C-shaped hole whose cavity
 * holds a pentagon. The root step's first layer pinches the C's mouth shut. The node 4 reviewer's input, verbatim.
 */
export const HOLED_F8: HoledTestPolygon = {
    name: 'Holed F8: pocket with a hole inside',
    outline: [{x: 4.338862577493184, y: -3.5202285030334624}, {x: -3.578503135260138, y: 25.74471850498312},
        {x: 25.65486047687673, y: 33.14608262162091}, {x: 33.228550672432355, y: 4.120178471173041}],
    holes: [
        {vertices: [{x: 6.613387521039814, y: 3.790771746296402}, {x: 20.421533037059973, y: 6.662528627654656},
            {x: 18.905855151704714, y: 12.980652655085823}, {x: 17.14890383730704, y: 12.619075988436236},
            {x: 18.026424203835717, y: 8.334121746194102}, {x: 8.30878317313876, y: 6.1615504147956965},
            {x: 5.915840626229241, y: 15.653377788028196}, {x: 15.902149229825921, y: 17.906943848542227},
            {x: 16.861398011475924, y: 13.687998639887855}, {x: 18.829827218975584, y: 14.181711197846449},
            {x: 17.208037893720782, y: 20.409084201640482}, {x: 3.778622864476371, y: 17.197736915470912}]},
        {vertices: [{x: 13.860159802943, y: 11.43287328939301}, {x: 13.133620308027059, y: 12.219173797543736},
            {x: 12.161291034970503, y: 11.77117389626237}, {x: 12.286897990881016, y: 10.707994222163164},
            {x: 13.33685663191368, y: 10.498912948703182}]},
    ],
};

// ── Node 5's fixtures (simultaneous-rings spec, decisions 34 to 37) ──────────────────────────────────────────────

const SQUARE = outlineRect(0, 0, 10, 10);

/** A, the concentric square: every gap is 4, every node at t = 2. */
export const HOLED_A: HoledTestPolygon = {name: 'Holed A: the concentric square', outline: SQUARE, holes: [{vertices: holeRect(4, 4, 6, 6)}]};

/** The chamfer of A′: the corner (0,0) cut by the line x + y = 4 − 2√2. */
const CHAMFER = 4 - 2 * SQRT2;

/** A′, the chamfered concentric square: the chamfer's two bisectors and a hole corner are one vertex event. */
export const HOLED_A_PRIME: HoledTestPolygon = {
    name: 'Holed A′: the chamfered concentric square',
    outline: [{x: 0, y: CHAMFER}, {x: 0, y: 10}, {x: 10, y: 10}, {x: 10, y: 0}, {x: CHAMFER, y: 0}],
    holes: [{vertices: holeRect(4, 4, 6, 6)}],
};

/** B, the off-centre rectangle: outline [0,20]×[0,10], hole [3,8]×[3,6]. */
export const HOLED_B: HoledTestPolygon = {
    name: 'Holed B: the off-centre rectangle',
    outline: outlineRect(0, 0, 20, 10),
    holes: [{vertices: holeRect(3, 3, 8, 6)}],
};

/** C1: A with the hole of weight 2. */
export const HOLED_C1: HoledTestPolygon = {
    name: 'Holed C1: A with the hole of weight 2',
    outline: SQUARE,
    holes: [{vertices: holeRect(4, 4, 6, 6), weights: [2, 2, 2, 2]}],
};

/** C2's outline weights: the bottom wall of weight 2. */
const C2_OUTLINE_WEIGHTS = [1, 1, 1, 2];

/** C2: A with the bottom wall of weight 2. */
export const HOLED_C2: HoledTestPolygon = {
    name: 'Holed C2: A with the bottom wall of weight 2',
    outline: SQUARE,
    weights: C2_OUTLINE_WEIGHTS,
    holes: [{vertices: holeRect(4, 4, 6, 6)}],
};

/** C2 with the hole listed from (6,4): the strike at x = 22/3 now resolves first. */
export const HOLED_C2_PRIME: HoledTestPolygon = {
    name: 'Holed C2′: C2 with the hole listed from (6,4)',
    outline: SQUARE,
    weights: C2_OUTLINE_WEIGHTS,
    holes: [{vertices: [{x: 6, y: 4}, {x: 6, y: 6}, {x: 4, y: 6}, {x: 4, y: 4}]}],
};

/** D, the courtyard with wings (BSA.F90): the hole [300,700]² sits 300 from the outline's four arms. */
export const HOLED_D: HoledTestPolygon = {
    name: 'Holed D: the courtyard with wings',
    outline: [{x: 0, y: 0}, {x: 0, y: 300}, {x: -250, y: 300}, {x: -250, y: 700}, {x: 0, y: 700}, {x: 0, y: 1000},
        {x: 1000, y: 1000}, {x: 1000, y: 700}, {x: 1300, y: 700}, {x: 1300, y: 300}, {x: 1000, y: 300}, {x: 1000, y: 0}],
    holes: [{vertices: holeRect(300, 300, 700, 700)}],
};

/** E, two holes: outline [0,22]×[0,10], holes [3,9]×[3,7] and [13,19]×[3,7]. */
export const HOLED_E: HoledTestPolygon = {
    name: 'Holed E: two holes',
    outline: outlineRect(0, 0, 22, 10),
    holes: [{vertices: holeRect(3, 3, 9, 7)}, {vertices: holeRect(13, 3, 19, 7)}],
};

/** F, an octagon in an octagon: radii 10 and 4, vertices on the rays π/8 + kπ/4. */
export const HOLED_F: HoledTestPolygon = {
    name: 'Holed F: an octagon in an octagon',
    outline: octagon(10, true),
    holes: [{vertices: octagon(4, false)}],
};

/** G, the centred diamond: node 4's refusal specimen, solved by node 5. */
export const HOLED_G: HoledTestPolygon = {
    name: 'Holed G: the centred diamond',
    outline: SQUARE,
    holes: [{vertices: [{x: 6, y: 5}, {x: 5, y: 6}, {x: 4, y: 5}, {x: 5, y: 4}]}],
};

/** H's turn: a centred square of half-diagonal 1.2 turned 0.3 rad. */
export const HOLED_H_THETA = 0.3;

/** H, a centred square turned 0.3 rad: four strikes at one moment. */
export const HOLED_H: HoledTestPolygon = {
    name: 'Holed H: a centred square turned 0.3 rad',
    outline: SQUARE,
    holes: [{vertices: turnedSquare({x: 5, y: 5}, 1.2, HOLED_H_THETA)}],
};

/**
 * Every holed fixture that solves: node 4's F1 to F8 in the order of the loop-consumers spec's decision 29 (F8 after
 * F7), then node 5's A to H in their own order. Outside `FULL_CORPUS` (decision 28).
 */
export const HOLED_TEST_POLYGONS: HoledTestPolygon[] = [
    HOLED_F1,
    HOLED_F1_STRETCHED,
    HOLED_F2,
    HOLED_F3,
    HOLED_F4,
    HOLED_F5,
    HOLED_F5_MIRRORED,
    HOLED_F6,
    HOLED_F7,
    HOLED_F8,
    HOLED_A,
    HOLED_A_PRIME,
    HOLED_B,
    HOLED_C1,
    HOLED_C2,
    HOLED_C2_PRIME,
    HOLED_D,
    HOLED_E,
    HOLED_F,
    HOLED_G,
    HOLED_H,
];
