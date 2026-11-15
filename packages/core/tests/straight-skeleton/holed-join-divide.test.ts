/*
 * JOIN AND DIVIDE (docs/notes/skeleton-join-and-divide-decisions.md, roadmap node 4). The V5 event loop solves an
 * outline with holes in the generic case: a strike within a ring divides it, a strike across rings joins them, and
 * a step's children are its components, an outer ring and the inner rings inside it.
 *
 *  - F1 against its hand-derived closed form, node by node and edge by edge (decisions 47 to 49);
 *  - the holed fixtures of decision 41, each asserting all of decision 42;
 *  - the refusal of decision 44 on node 5's concentric square and its off-centre rectangle with parallel walls;
 *  - the partition order of decisions 25 to 27, the causality check of decision 32, and the constructed tests of
 *    decision 45's last sentence: the step restriction of the struck segment and the guard on every validating
 *    segment, over a step holding two segments of one edge.
 *
 * Each fixture is chosen so that no two events of different rings share a layer (decision 41), and was checked
 * against that by its own run: every assertion below that no refusal was raised is that check.
 */
import type {BisectionParams, SkeletonDiagnostic, StraightSkeletonSolverContext, Vector2} from '@proc-geo/core';
import {
    bisectWithParams,
    checkWavefrontCausality,
    initInteriorEdges,
    makeStraightSkeletonSolverContext,
    setSkeletonLogLevel,
    solveSkeleton,
} from '@proc-geo/core';
import {generateSplitEvent} from '@proc-geo/core/straight-skeleton/generate-split-event';
import {
    beginLayerLinks,
    beginStep,
    endStep,
    linkInitialRing,
    linkMergeGap,
    linkPairCollapse,
    linkSplit,
    partitionArc,
    retireBisectors,
} from '@proc-geo/core/straight-skeleton/wavefront';
import {
    directionViolations,
    equiTimeViolations,
    escapedHoledNodes,
    extentOf,
    faceTiling,
    HoledFixture,
    interiorGraphShape,
    mirrored,
    rateViolations,
    solveHoled,
    storyOf,
} from './holed-test-helpers';

setSkeletonLogLevel('silent');

const SQRT2 = Math.SQRT2;

/** A clockwise outline. */
const SQUARE_OUTLINE: Vector2[] = [{x: 0, y: 0}, {x: 0, y: 10}, {x: 10, y: 10}, {x: 10, y: 0}];

/** F1's hole: a square of side √2 turned 45°, centred at (7, 5.5), counter-clockwise: NE, NW, SW, SE. */
const F1_HOLE: Vector2[] = [{x: 8, y: 5.5}, {x: 7, y: 6.5}, {x: 6, y: 5.5}, {x: 7, y: 4.5}];

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

const F1: HoledFixture = {name: 'F1', outline: SQUARE_OUTLINE, holes: [{vertices: F1_HOLE}]};

const F1_STRETCHED: HoledFixture = {
    name: 'F1 stretched',
    outline: [{x: -20, y: 0}, {x: -20, y: 10}, {x: 10, y: 10}, {x: 10, y: 0}],
    holes: [{vertices: F1_HOLE}],
};

/** An irregular quadrilateral with no two walls parallel. */
const QUADRILATERAL: Vector2[] = [{x: 0, y: 0}, {x: -1, y: 12}, {x: 14, y: 13}, {x: 16, y: -1}];

const F2: HoledFixture = {
    name: 'F2: two holes, one joining the other first',
    outline: QUADRILATERAL,
    holes: [
        {vertices: [{x: 7, y: 6}, {x: 6, y: 7}, {x: 5, y: 6}, {x: 6, y: 5}]},
        {vertices: turnedSquare({x: 9.4, y: 6.2}, 1.2, Math.PI / 4 + 0.3)},
    ],
};

const L_HOLE: Vector2[] = [{x: 5, y: 4}, {x: 9, y: 4}, {x: 9, y: 6}, {x: 7, y: 6}, {x: 7, y: 8}, {x: 5, y: 8}];

const F3: HoledFixture = {
    name: 'F3: an L-shaped hole',
    outline: QUADRILATERAL,
    holes: [{vertices: turned(L_HOLE, {x: 7, y: 6}, 0.15)}],
};

const F4: HoledFixture = {
    name: 'F4: a weighted hole',
    outline: SQUARE_OUTLINE,
    holes: [{vertices: F1_HOLE, weights: [1.3, 1, 1, 1]}],
};

/** A reflex outline: a notch from the top whose tip strikes the bottom wall early. */
const NOTCHED: Vector2[] = [
    {x: 0, y: 0}, {x: 0.5, y: 6}, {x: 9, y: 6.3}, {x: 10, y: 1.5}, {x: 11, y: 6.2}, {x: 20, y: 5.8}, {x: 19.5, y: -0.3}];

const F5: HoledFixture = {
    name: 'F5: a reflex outline divides while the hole shares the step',
    outline: NOTCHED,
    holes: [{vertices: turnedSquare({x: 5, y: 3}, 0.7, 0.2)}],
};

const F5_MIRROR = mirrored(F5, 10, 'F5 mirrored');

/** The notched outline with a shallow notch, whose split comes late. */
const SHALLOW_NOTCHED: Vector2[] = [
    {x: 0, y: 0}, {x: 0.5, y: 6}, {x: 9, y: 6.3}, {x: 10, y: 4.5}, {x: 11, y: 6.2}, {x: 20, y: 5.8}, {x: 19.5, y: -0.3}];

const F6: HoledFixture = {
    name: 'F6: a hole near one wall joins first',
    outline: SHALLOW_NOTCHED,
    holes: [{vertices: turnedSquare({x: 1.6, y: 3}, 0.5, 0.2)}],
};

/** The square outline with its top-right corner cut by a short edge, which collapses early. */
const CHAMFERED: Vector2[] = [{x: 0, y: 0}, {x: 0, y: 10}, {x: 9.6, y: 10}, {x: 10, y: 9.6}, {x: 10, y: 0}];

const F7: HoledFixture = {
    name: 'F7: a hole deep inside joins after an outline event',
    outline: CHAMFERED,
    holes: [{vertices: turnedSquare({x: 5.2, y: 4.7}, 0.8, 0.3)}],
};

const FIXTURES: HoledFixture[] = [F1, F1_STRETCHED, F2, F3, F4, F5, F5_MIRROR, F6, F7];

const REFUSAL_KINDS = ['simultaneous-across-rings', 'multi-ring-step-refused'];
const kindsOf = (diagnostics: SkeletonDiagnostic[]) => diagnostics.map(diagnostic => diagnostic.kind);

/**
 * The causality diagnostics a weighted fixture is pinned at, as `oracle elementId`. THE SOLVER'S ORACLES ARE
 * WEIGHT-NAIVE: they date a node by its DISTANCE from its first incident edge's clockwise parent and compare that
 * with the distance to the nearest wall, so a node whose dating wall is faster than its nearest wall reads as late.
 * Single-loop weighted fixtures carry the same signatures today (`Weighted L` 3, `Weighted Pentagon House` 2,
 * `Weighted Square (weight change at a 1e-3 turn)` 1). Such a fixture is held instead to the weighted equi-time check,
 * which every fixture here also passes. Everything else of decision 42 holds as stated.
 */
const WEIGHTED_CAUSALITY_SIGNATURES: Record<string, string[]> = {
    // J (node 8) is dated against NE, of weight 1.3, at 1.3 t, and lies t from the right wall.
    'F4: a weighted hole': ['clearance 8'],
};

/** Every assertion of decision 42, on one fixture. Returns the solve for further assertions. */
function expectSoundHoledSolve(fixture: HoledFixture) {
    const solve = solveHoled(fixture);
    const {result, boundaries} = solve;
    const {graph} = result;
    const kinds = kindsOf(result.diagnostics);

    // Complete, with no refusal and no causality diagnostic (a weighted fixture: its pinned weight-naive signature).
    expect(kinds.filter(kind => REFUSAL_KINDS.includes(kind) || kind === 'step-failure' || kind === 'unresolved-edges'))
        .toEqual([]);
    expect(result.diagnostics
        .flatMap(diagnostic => diagnostic.kind === 'causality-violation' ? [`${diagnostic.oracle} ${diagnostic.elementId}`] : []))
        .toEqual(WEIGHTED_CAUSALITY_SIGNATURES[fixture.name] ?? []);
    expect(equiTimeViolations(graph, 1e-9 * extentOf(fixture))).toEqual([]);
    expect(result.complete).toBe(true);

    // `checkWavefront` empty at every step boundary.
    expect(boundaries.flatMap((boundary, step) => boundary.violations.map(v => `step ${step}: ${v}`))).toEqual([]);

    // One face per exterior edge of every loop, and the faces tile the region.
    const tiling = faceTiling(graph, fixture);
    expect(tiling.open).toEqual([]);
    expect(tiling.relativeError).toBeLessThan(1e-12);

    // Every interior node inside the outline and outside every hole.
    expect(escapedHoledNodes(graph, fixture)).toEqual([]);

    // The rate and direction oracles clean.
    expect(directionViolations(graph, 1e-9 * extentOf(fixture))).toEqual([]);
    expect(rateViolations(graph, 1e-9)).toEqual([]);

    // The interior graph connected, with no self-loop and a cycle rank equal to the hole count.
    const shape = interiorGraphShape(graph);
    expect(shape.unresolved).toEqual([]);
    expect(shape.selfLoops).toEqual([]);
    expect(shape.components).toBe(1);
    expect(shape.cycleRank).toBe(fixture.holes.length);
    return {...solve, tiling, shape};
}

describe('F1 against its closed form (decisions 47 to 49)', () => {
    /** Node names, events and positions of decision 48's table. */
    const CLOSED_FORM: {name: string; t: number; at: Vector2}[] = [
        {name: 'J', t: 2 * SQRT2 - 2, at: {x: 12 - 2 * SQRT2, y: 5.5}},
        {name: 'S_T', t: 3.5 * (SQRT2 - 1), at: {x: 7, y: 13.5 - 3.5 * SQRT2}},
        {name: 'S_B', t: 4.5 * (SQRT2 - 1), at: {x: 7, y: 4.5 * SQRT2 - 4.5}},
        {name: 'P_TR', t: 3.25 * (2 - SQRT2), at: {x: 3.5 + 3.25 * SQRT2, y: 3.5 + 3.25 * SQRT2}},
        {name: 'P_BR', t: 3.75 * (2 - SQRT2), at: {x: 2.5 + 3.75 * SQRT2, y: 7.5 - 3.75 * SQRT2}},
        {name: 'S_L', t: 6 * (SQRT2 - 1), at: {x: 6 * SQRT2 - 6, y: 5.5}},
        {name: 'P_TL', t: 5.25 * (2 - SQRT2), at: {x: 10.5 - 5.25 * SQRT2, y: 5.25 * SQRT2 - 0.5}},
        {name: 'P_BL', t: 5.75 * (2 - SQRT2), at: {x: 11.5 - 5.75 * SQRT2, y: 11.5 - 5.75 * SQRT2}},
    ];
    const TOLERANCE = 1e-9 * extentOf(F1);

    /** The solved interior node at each closed-form node, by name, matched within the tolerance. */
    const matchNodes = () => {
        const {result} = solveHoled(F1);
        const {graph} = result;
        const named = new Map<string, number>();
        for (const expected of CLOSED_FORM) {
            const matches = graph.nodes
                .slice(graph.numExteriorNodes)
                .filter(node => Math.hypot(node.position.x - expected.at.x, node.position.y - expected.at.y) <= TOLERANCE);
            expect({name: expected.name, matches: matches.length}).toEqual({name: expected.name, matches: 1});
            named.set(expected.name, matches[0].id);
        }
        return {graph, named};
    };

    it('is the closed form\'s outline and hole: each event equidistant from its three walls', () => {
        // The table's own arithmetic, re-derived: every node lies at its time from each of its three walls.
        const distance = (p: Vector2, a: Vector2, b: Vector2) =>
            Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / Math.hypot(b.x - a.x, b.y - a.y);
        const [E, N, W, S] = F1_HOLE;
        const walls: Record<string, [Vector2, Vector2]> = {
            left: [{x: 0, y: 0}, {x: 0, y: 10}], top: [{x: 0, y: 10}, {x: 10, y: 10}],
            right: [{x: 10, y: 10}, {x: 10, y: 0}], bottom: [{x: 10, y: 0}, {x: 0, y: 0}],
            NE: [E, N], NW: [N, W], SW: [W, S], SE: [S, E],
        };
        const wallsOf: Record<string, string[]> = {
            J: ['right', 'NE', 'SE'], S_T: ['top', 'NE', 'NW'], S_B: ['bottom', 'SE', 'SW'],
            P_TR: ['right', 'top', 'NE'], P_BR: ['right', 'bottom', 'SE'], S_L: ['left', 'NW', 'SW'],
            P_TL: ['left', 'top', 'NW'], P_BL: ['left', 'bottom', 'SW'],
        };
        for (const {name, t, at} of CLOSED_FORM) {
            for (const wall of wallsOf[name]) {
                expect(distance(at, ...walls[wall])).toBeCloseTo(t, 12);
            }
        }
    });

    it('has 16 nodes, 8 exterior and 8 interior, and 16 interior edges, each node at its closed form', () => {
        const {graph} = matchNodes();
        expect(graph.numExteriorNodes).toBe(8);
        expect(graph.nodes).toHaveLength(16);
        expect(graph.interiorEdges).toHaveLength(16);
    });

    it('has the topology of decision 49, edge by edge, and one cycle round the hole', () => {
        const {graph, named} = matchNodes();
        // Outline nodes 0 (0,0), 1 (0,10), 2 (10,10), 3 (10,0); hole nodes 4 E, 5 N, 6 W, 7 S.
        const at = (name: string) => named.get(name)!;
        const expected = [
            [4, at('J')], [5, at('S_T')], [7, at('S_B')], [6, at('S_L')],
            [2, at('P_TR')], [3, at('P_BR')], [1, at('P_TL')], [0, at('P_BL')],
            [at('J'), at('P_TR')], [at('J'), at('P_BR')],
            [at('S_T'), at('P_TR')], [at('S_T'), at('P_TL')],
            [at('S_B'), at('P_BR')], [at('S_B'), at('P_BL')],
            [at('S_L'), at('P_TL')], [at('S_L'), at('P_BL')],
        ].map(([from, to]) => `${from}->${to}`).sort();
        const solved = graph.interiorEdges
            .map(edge => `${graph.edges[edge.id].source}->${graph.edges[edge.id].target}`)
            .sort();
        expect(solved).toEqual(expected);
    });

    it('resolves the join as the root step\'s only event, and the three later strikes as divides of the joined ring', () => {
        const {boundaries} = solveHoled(F1);
        // Boundary 0 is the root: two rings in one input. Boundary 1: one node made (J), one input of one ring.
        expect(boundaries[0].ringsPerInput.map(rings => rings.length)).toEqual([2]);
        expect(boundaries[1].nodeCount).toBe(9);
        expect(boundaries[1].ringsPerInput.map(rings => rings.length)).toEqual([1]);
        // Every later step is of one ring.
        expect(boundaries.slice(1).every(boundary => boundary.ringsPerInput.every(rings => rings.length === 1))).toBe(true);
    });
});

/**
 * Each fixture's story, step boundary by step boundary, as {@link storyOf} writes it: what each was chosen for
 * (decision 41), measured. `{0}` is the outline's loop and `{k}` hole k - 1; `a+b` is one step of two rings, and
 * `a | b` two steps.
 */
const STORIES: Record<string, string[]> = {
    // The join is the root step's only event; three divides of the joined ring follow (decision 49).
    'F1': ['4{0}+4{1}', '9{0,1}', '3{0,1} | 7{0,1}', '3{0,1} | 5{0,1}', '3{0,1} | 3{0,1}', ''],
    // The same, then the hole's last two faces close in separate steps, the corridor last (decision 29's specimen).
    'F1 stretched': ['4{0}+4{1}', '9{0,1}', '3{0,1} | 7{0,1}', '3{0,1} | 5{0,1}', '4{0,1}', '2{0}', ''],
    // The two holes join first (a step of two rings and the joined one), then a collapse on the joined hole while
    // the outline shares its step, then the joined hole joins the outline.
    'F2: two holes, one joining the other first': [
        '4{0}+4{1}+4{2}', '4{0}+9{1,2}', '4{0}+8{1,2}', '13{0,1,2}',
        '5{0,1,2} | 9{0,1,2}', '3{0,1,2} | 3{0,2} | 5{0,1,2} | 5{0,1}', '3{0,2} | 3{0,1,2} | 3{0,1} | 3{0,1}', ''],
    'F3: an L-shaped hole': [
        '4{0}+6{1}', '11{0,1}', '5{0,1} | 7{0,1}', '4{0,1} | 6{0,1}', '3{0,1} | 5{0,1}', '4{0,1}', '3{0,1}', ''],
    'F4: a weighted hole': ['4{0}+4{1}', '9{0,1}', '3{0,1} | 7{0,1}', '3{0,1} | 5{0,1}', '3{0,1} | 3{0,1}', ''],
    // The outline's own split divides it while the hole shares the step: the hole goes to the second child here,
    // to the first in the mirror image.
    'F5: a reflex outline divides while the hole shares the step': [
        '7{0}+4{1}', '4{0} | 4{0}+4{1}', '3{0} | 9{0,1}', '5{0,1} | 5{0,1}', '3{0,1} | 3{0,1} | 3{0,1} | 3{0,1}', ''],
    'F5 mirrored': [
        '7{0}+4{1}', '4{0}+4{1} | 4{0}', '9{0,1} | 3{0}', '5{0,1} | 5{0,1}', '3{0,1} | 3{0,1} | 3{0,1} | 3{0,1}', ''],
    // The join comes first, then the outline's split, of one ring.
    'F6: a hole near one wall joins first': [
        '7{0}+4{1}', '12{0,1}', '11{0,1}', '3{0,1} | 9{0,1}', '8{0,1}', '4{0} | 5{0,1}', '3{0} | 4{0,1}', '3{0}', ''],
    // The outline's short edge collapses first while the hole shares the step (a step of two rings with no
    // partition), and the hole joins after it.
    'F7: a hole deep inside joins after an outline event': [
        '5{0}+4{1}', '4{0}+4{1}', '9{0,1}', '3{0,1} | 7{0,1}', '3{0,1} | 5{0,1}', '3{0,1} | 3{0,1}', ''],
};

describe('the holed fixtures (decisions 41 and 42)', () => {
    it.each(FIXTURES.map(fixture => [fixture.name, fixture] as const))('%s', (_name, fixture) => {
        const solve = expectSoundHoledSolve(fixture);
        expect(storyOf(solve)).toEqual(STORIES[fixture.name]);
    });

    it('F1 stretched: the hole\'s last open face is accepted only when it closes (decision 51)', () => {
        // Traced by hand in decision 29: at t = 4.5 the hole's NW segment collapses, and the cycle round the hole
        // then joins SW's two ends through accepted edges while SW's face is still open. The predicate reads no
        // topology, so SW stays open, the bisector naming it is born, and its face closes.
        const {result} = expectSoundHoledSolve(F1_STRETCHED);
        expect(result.context!.isAccepted(6)).toBe(true);
    });

    it('F5 and its mirror: the hole goes to the child that contains it, first once and second once', () => {
        const childOfHole = (fixture: HoledFixture) => {
            const {boundaries, result} = expectSoundHoledSolve(fixture);
            const holeBisectors = new Set(result.graph.loops[1] === undefined ? [] : Array.from(
                {length: result.graph.loops[1].count},
                (_unused, j) => result.graph.numExteriorNodes + result.graph.loops[1].start + j));
            // The first boundary with two inputs is the one after the divide.
            const divided = boundaries.find(boundary => boundary.inputs.length === 2)!;
            expect(divided).toBeDefined();
            return divided.inputs.findIndex(input => input.some(id => holeBisectors.has(id)));
        };
        expect([childOfHole(F5), childOfHole(F5_MIRROR)].sort()).toEqual([0, 1]);
    });
});

describe('the refusal of a layer node 5 owns (decision 44)', () => {
    const CONCENTRIC: HoledFixture = {
        name: 'the concentric square',
        outline: SQUARE_OUTLINE,
        holes: [{vertices: [{x: 4, y: 4}, {x: 6, y: 4}, {x: 6, y: 6}, {x: 4, y: 6}]}],
    };
    const PARALLEL_WALLED: HoledFixture = {
        name: 'the off-centre rectangle with parallel walls',
        outline: [{x: 0, y: 0}, {x: 0, y: 10}, {x: 20, y: 10}, {x: 20, y: 0}],
        holes: [{vertices: [{x: 3, y: 3}, {x: 8, y: 3}, {x: 8, y: 6}, {x: 3, y: 6}]}],
    };

    /**
     * Not one of decision 44's two: a diamond centred in the square, whose four corners strike the four walls at
     * one moment. Both of decision 44's fixtures meet a vertex event across rings first, so neither reaches the
     * rule that a join may not share its layer; this one does, and convicts that rule (decision 45's first and
     * last gates).
     */
    const CENTRED_DIAMOND: HoledFixture = {
        name: 'the centred diamond',
        outline: SQUARE_OUTLINE,
        holes: [{vertices: [{x: 6, y: 5}, {x: 5, y: 6}, {x: 4, y: 5}, {x: 5, y: 4}]}],
    };

    // Measured: each is refused at the root step (after boundary 0), as `simultaneous-across-rings`. The concentric
    // square and the rectangle by an outline corner and a hole corner meeting head-on on one diagonal
    // (`interiorNonAdjacent [8, 12]`), the diamond by its four joins.
    it.each([
        [CONCENTRIC.name, CONCENTRIC, 'simultaneous-across-rings', 0, 'interiorNonAdjacent [8, 12] at time 0.25 meets bisectors of two rings'],
        [PARALLEL_WALLED.name, PARALLEL_WALLED, 'simultaneous-across-rings', 0, 'interiorNonAdjacent [8, 12]'],
        [CENTRED_DIAMOND.name, CENTRED_DIAMOND, 'simultaneous-across-rings', 0, 'the join interiorAgainstExterior [12, 2]'],
    ] as const)('%s is refused, incomplete, naming the step', (_name, fixture, kind, step, reason) => {
        const {result, boundaries} = solveHoled(fixture);
        expect(result.complete).toBe(false);
        const refusals = result.diagnostics.filter(diagnostic => REFUSAL_KINDS.includes(diagnostic.kind));
        expect(refusals.map(diagnostic => diagnostic.kind)).toEqual([kind]);
        // The step it names is the one that ran after boundary `step`; the refused layer changed nothing.
        const stepInput = boundaries[step].inputs[0];
        expect(refusals[0].detail).toContain(`Step [${[...stepInput].sort((a, b) => a - b).join(', ')}]`);
        expect(refusals[0].detail).toContain(reason);
        expect(kindsOf(result.diagnostics)).toContain('step-failure');
        expect(result.graph.nodes).toHaveLength(result.graph.numExteriorNodes);
    });
});

describe('the partition order (decisions 25 to 27)', () => {
    it('equals today\'s span on one loop: decision 26\'s worked example', () => {
        // A decagon; the ring is made to hold a pending birth T (cw 3, ws 7) and bisectors whose clockwise parents
        // are 4, 6 and 7, edge 5 closed: b4, X (cw 6, ws 4, from collapsing b5 and b6), and b7.
        const decagon = Array.from({length: 10}, (_unused, i) => ({
            x: Math.cos(-2 * Math.PI * i / 10), y: Math.sin(-2 * Math.PI * i / 10)}));
        const context = makeStraightSkeletonSolverContext(decagon);
        initInteriorEdges(context);
        const b = (node: number) => 10 + node;
        beginLayerLinks(context);
        // T closes the gap a merge of b8, b9, b0, b1, b2 and b3 leaves: it stands between b7 and b4.
        const T: BisectionParams = {clockwiseExteriorEdgeIndex: 3, widdershinsExteriorEdgeIndex: 7, source: 0};
        linkMergeGap(context, b(3), b(8), T);
        retireBisectors(context, [8, 9, 0, 1, 2, 3].map(b));
        const X: BisectionParams = {clockwiseExteriorEdgeIndex: 6, widdershinsExteriorEdgeIndex: 4, source: 0};
        linkPairCollapse(context, [b(5), b(6)], b(5), b(6), X);
        // T's ring is T, b4, X, b7: gaps 1, 2 and 1.
        expect(partitionArc(context, T)).toBe(4);
        expect(partitionArc(context, T)).toBe((7 - 3 + 10) % 10);
        // X's is X, b7, T, b4: gaps 1, 6 and 1, which is (4 − 6) mod 10.
        expect(partitionArc(context, X)).toBe(8);
    });

    it('counts a gap between edges of two loops as 1', () => {
        // F1's join, linked by hand: h4 (hole corner E) strikes the right wall's segment (b2, b3).
        const context = f1Context();
        beginLayerLinks(context);
        const before: BisectionParams = {clockwiseExteriorEdgeIndex: 4, widdershinsExteriorEdgeIndex: 2, source: 0};
        const after: BisectionParams = {clockwiseExteriorEdgeIndex: 2, widdershinsExteriorEdgeIndex: 7, source: 0};
        linkSplit(context, 12, {exteriorEdge: 2, from: 10, to: 11}, {x: 10, y: 5.5}, before, after);
        // The joined ring: b0 b1 b2 before h5 h6 h7 after b3. From `before`: 4→5→6→7, then 7→2 across loops,
        // then 2→3→0→1→2: every gap 1, eight members, so 8.
        expect(partitionArc(context, before)).toBe(8);
        expect(partitionArc(context, after)).toBe(8);
    });
});

/** F1's context after `initInteriorEdges`: outline bisectors 8 to 11, hole bisectors 12 to 15. */
function f1Context(): StraightSkeletonSolverContext {
    const context = makeStraightSkeletonSolverContext(
        [...SQUARE_OUTLINE, ...F1_HOLE], undefined, undefined, [{start: 0, count: 4}, {start: 4, count: 4}]);
    initInteriorEdges(context);
    return context;
}

describe('the causality check reads each exterior edge\'s own ends (decision 32)', () => {
    it('dates every node of F1 against its parent\'s own line, the last edge of each loop included', () => {
        // Outline edge 3 runs (10, 0) to (0, 0) and hole edge 7 runs (7, 4.5) to (8, 5.5): each is its loop's
        // last edge, so `(parent + 1) % edgeCount` would date their faces' nodes against the next loop's first node.
        const {result} = solveHoled(F1);
        expect(result.complete).toBe(true);
        const graph = result.graph;
        expect(graph.edges[3].target).toBe(0);
        expect(graph.edges[7].target).toBe(4);
        expect(checkWavefrontCausality(graph, 1e-6, result.normalisation.toUnitScale)).toEqual([]);
    });
});

describe('the struck segment, over a step holding two segments of one edge (decisions 4 and 5)', () => {
    /**
     * F1's context with a second copy of the right wall's segment: c2 (cw 2, ws 1) at node 2 and c3 (cw 3, ws 2)
     * at node 3, linked as a ring of their own. Edge 2 then has two live segments, (b2, b3) and (c2, c3), over the
     * same extent, and the hole corner E's bisector h4 strikes both at the join's time.
     */
    const twoSegments = () => {
        const context = f1Context();
        const c2 = bisectWithParams(context, {clockwiseExteriorEdgeIndex: 2, widdershinsExteriorEdgeIndex: 1, source: 2});
        const c3 = bisectWithParams(context, {clockwiseExteriorEdgeIndex: 3, widdershinsExteriorEdgeIndex: 2, source: 3});
        linkInitialRing(context, [c2, c3]);
        const arrival = {distance: 2 * SQRT2 - 2, weight: 1, uncertainty: 0};
        return {context, c2, c3, arrival};
    };

    it('searches every segment outside a step, and only the step\'s inside one', () => {
        const {context, c2, c3, arrival} = twoSegments();
        expect(context.validateSplitReachesEdge(12, 2, arrival)).toEqual([
            {exteriorEdge: 2, from: 10, to: 11},
            {exteriorEdge: 2, from: c2, to: c3},
        ]);
        beginStep(context, [8, 9, 10, 11, 12, 13, 14, 15]);
        expect(context.validateSplitReachesEdge(12, 2, arrival)).toEqual([{exteriorEdge: 2, from: 10, to: 11}]);
        endStep(context);
        beginStep(context, [c2, c3, 12, 13, 14, 15]);
        expect(context.validateSplitReachesEdge(12, 2, arrival)).toEqual([{exteriorEdge: 2, from: c2, to: c3}]);
        endStep(context);
    });

    it('takes the first validating segment the neighbour guard does not refuse', () => {
        const {context, c2, c3} = twoSegments();
        // Make b2 h4's clockwise neighbour, so the guard refuses the first segment, (b2, b3), and not (c2, c3).
        context.wavefront.clockwiseNeighbour[12] = 10;
        const event = generateSplitEvent(context.getInteriorWithId(12), context.getEdgeWithId(2), context);
        expect(event).not.toBeNull();
        expect(event!.struckSegment).toEqual({exteriorEdge: 2, from: c2, to: c3});
    });
});
