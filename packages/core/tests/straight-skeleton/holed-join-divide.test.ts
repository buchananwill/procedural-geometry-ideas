/*
 * JOIN AND DIVIDE (docs/notes/skeleton-join-and-divide-decisions.md, roadmap node 4). The V5 event loop solves an
 * outline with holes in the generic case: a strike within a ring divides it, a strike across rings joins them, and
 * a step's children are its components, an outer ring and the inner rings inside it.
 *
 *  - F1 against its hand-derived closed form, node by node and edge by edge (decisions 47 to 49);
 *  - `checkWavefront` at every step boundary of every fixture of the holed roster, and each of node 4's fixtures'
 *    stories; F8, the pocket that pins decision 15's least-area rule (BSA.D309); the generic counts on every generic
 *    fixture. THE FIXTURES ARE THE HOLED ROSTER's (`HOLED_TEST_POLYGONS` in `@proc-geo/test-fixtures`, the
 *    loop-consumers spec, decision 29), and the rest of decision 42's battery is asserted by the roster's sweeps, each
 *    in its home file (that spec's decisions 32 and 33): containment, the strip tiling, causality, the graph-index
 *    invariants with the cycle rank, the offset projection, the digests and completeness;
 *  - a ring whose polygon crosses itself, refused rather than classified by its area's sign (BSA.D309);
 *  - the partition order of decisions 25 to 27, the causality check of decision 32, and the constructed tests of
 *    decision 45's last sentence: the step restriction of the struck segment and the guard on every validating
 *    segment, over a step holding two segments of one edge.
 *
 * Each fixture is chosen so that no two events of different rings share a layer (decision 41), and was checked
 * against that by its own run. The refusal tests of decision 44 are gone: node 5 solves the concentric square and the
 * off-centre rectangle, and they are its fixtures A and B (`holed-simultaneous-rings.test.ts`; the simultaneous-rings
 * spec, decision 41).
 */
import type {BisectionParams, StraightSkeletonSolverContext, Vector2} from '@proc-geo/core';
import {
    bisectWithParams,
    checkWavefrontCausality,
    initInteriorEdges,
    makeStraightSkeletonSolverContext,
    setSkeletonLogLevel,
} from '@proc-geo/core';
import {generateSplitEvent} from '@proc-geo/core/straight-skeleton/generate-split-event';
import {signedArea} from '@proc-geo/core/random-polygon/geometry-helpers';
import {beginStep, endStep} from '@proc-geo/core/straight-skeleton/step-scope';
import {componentsOfRings} from '@proc-geo/core/straight-skeleton/ring-components';
import {
    LayerLinks,
    linkMergeGap,
    linkPairCollapse,
    linkSplit,
    partitionArc,
} from '@proc-geo/core/straight-skeleton/layer-links';
import {linkInitialRing, retireBisectors} from '@proc-geo/core/straight-skeleton/wavefront-links';
import {
    HOLED_F1 as F1,
    HOLED_F1_HOLE as F1_HOLE,
    HOLED_F1_STRETCHED as F1_STRETCHED,
    HOLED_F2 as F2,
    HOLED_F3 as F3,
    HOLED_F4 as F4,
    HOLED_F5 as F5,
    HOLED_F5_MIRRORED as F5_MIRROR,
    HOLED_F6 as F6,
    HOLED_F7 as F7,
    HOLED_F8 as F8,
    HOLED_TEST_POLYGONS,
    HoledTestPolygon,
} from '@proc-geo/test-fixtures';
import {equiTimeViolations, extentOf, solveHoled, storyOf, timeOrderViolations} from './holed-test-helpers';

setSkeletonLogLevel('silent');

const SQRT2 = Math.SQRT2;

/** A clockwise outline: F1's. */
const SQUARE_OUTLINE: Vector2[] = F1.outline;

/** The irregular quadrilateral of F2 and F3, with no two walls parallel. */
const QUADRILATERAL: Vector2[] = F2.outline;

/**
 * Node 4's fixtures (decision 41), now the first ten of the holed roster. F8, THE POCKET (spec decision 15, the
 * least-area rule; BSA.D309): a C-shaped hole whose cavity holds a pentagon. The root step's first layer pinches the
 * C's mouth shut, a step of three rings that leaves four: the outline's ring O, the ring round the C R1, the pocket P
 * the pinch closes off, and the pentagon's ring H2. H2's witness lies inside both O's and P's polygon, and the
 * least-area rule gives it to P.
 */
const FIXTURES: HoledTestPolygon[] = [F1, F1_STRETCHED, F2, F3, F4, F5, F5_MIRROR, F6, F7, F8];

/**
 * The fixtures whose skeleton is GENERIC, every interior node of degree three, so Euler gives `n + 2h − 2` interior
 * nodes and `2n + 3h − 3` interior edges (decision 48). Measured: every fixture but F1 stretched. Its last step
 * (`2{0}` in its story) is a pair of bisectors meeting head-on between the outline's anti-parallel top and bottom
 * walls, and the midline they close is recorded once by each of them: 8 interior nodes, as Euler says, but 17
 * interior edges where Euler says 16, and two interior nodes of degree four. `interiorGraphShape` counts that arc
 * once.
 */
const NOT_GENERIC = new Set([F1_STRETCHED.name]);

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
 *
 * A STORY IS THE REASON A FIXTURE WAS CHOSEN, NOT A PROPERTY OF THE SOLVER (BSA.D309). It pins that the fixture still
 * exercises what it was picked to exercise (a join before a divide, a hole joining a hole, a ring sent to the second
 * child). A correct solver may tell another story of the same input — a different step grouping, or children in
 * another order — and a story that moves is a reason to check the fixture still tests its case, not by itself a
 * defect. The properties are decision 42's, asserted by the roster's sweeps in their home files (the loop-consumers
 * spec, decisions 32 and 33), and by the weighted equal-time and time-order checks below (BSA.D316).
 */
const STORIES: Record<string, string[]> = {
    // The join is the root step's only event; three divides of the joined ring follow (decision 49).
    [F1.name]: ['4{0}+4{1}', '9{0,1}', '3{0,1} | 7{0,1}', '3{0,1} | 5{0,1}', '3{0,1} | 3{0,1}', ''],
    // The same, then the hole's last two faces close in separate steps, the corridor last (decision 29's specimen).
    [F1_STRETCHED.name]: ['4{0}+4{1}', '9{0,1}', '3{0,1} | 7{0,1}', '3{0,1} | 5{0,1}', '4{0,1}', '2{0}', ''],
    // The two holes join first (a step of two rings and the joined one), then a collapse on the joined hole while
    // the outline shares its step, then the joined hole joins the outline.
    [F2.name]: [
        '4{0}+4{1}+4{2}', '4{0}+9{1,2}', '4{0}+8{1,2}', '13{0,1,2}',
        '5{0,1,2} | 9{0,1,2}', '3{0,1,2} | 3{0,2} | 5{0,1,2} | 5{0,1}', '3{0,2} | 3{0,1,2} | 3{0,1} | 3{0,1}', ''],
    [F3.name]: [
        '4{0}+6{1}', '11{0,1}', '5{0,1} | 7{0,1}', '4{0,1} | 6{0,1}', '3{0,1} | 5{0,1}', '4{0,1}', '3{0,1}', ''],
    [F4.name]: ['4{0}+4{1}', '9{0,1}', '3{0,1} | 7{0,1}', '3{0,1} | 5{0,1}', '3{0,1} | 3{0,1}', ''],
    // The outline's own split divides it while the hole shares the step: the hole goes to the second child here,
    // to the first in the mirror image.
    [F5.name]: [
        '7{0}+4{1}', '4{0} | 4{0}+4{1}', '3{0} | 9{0,1}', '5{0,1} | 5{0,1}', '3{0,1} | 3{0,1} | 3{0,1} | 3{0,1}', ''],
    [F5_MIRROR.name]: [
        '7{0}+4{1}', '4{0}+4{1} | 4{0}', '9{0,1} | 3{0}', '5{0,1} | 5{0,1}', '3{0,1} | 3{0,1} | 3{0,1} | 3{0,1}', ''],
    // The join comes first, then the outline's split, of one ring.
    [F6.name]: [
        '7{0}+4{1}', '12{0,1}', '11{0,1}', '3{0,1} | 9{0,1}', '8{0,1}', '4{0} | 5{0,1}', '3{0} | 4{0,1}', '3{0}', ''],
    // The outline's short edge collapses first while the hole shares the step (a step of two rings with no
    // partition), and the hole joins after it.
    [F7.name]: [
        '5{0}+4{1}', '4{0}+4{1}', '9{0,1}', '3{0,1} | 7{0,1}', '3{0,1} | 5{0,1}', '3{0,1} | 3{0,1}', ''],
    // The pinch is the root's first layer: the pocket and the pentagon go to one child (`6{1}+5{2}`), the outline and
    // the ring round the C to the other (`4{0}+7{1}`); each pair then joins.
    [F8.name]: [
        '4{0}+12{1}+5{2}', '6{1}+5{2} | 4{0}+7{1}', '12{1,2} | 4{0}+6{1}', '3{1,2} | 10{1,2} | 11{0,1}',
        '8{1,2} | 3{1,2} | 10{0,1}', '7{1,2} | 3{0,1} | 8{0,1}', '3{1,2} | 5{1,2} | 7{0,1}', '4{1,2} | 6{0,1}',
        '3{1,2} | 5{0,1}', '4{0,1}', '3{0,1}', ''],
};

describe('the holed fixtures (decisions 41 and 42)', () => {
    // The one assertion of decision 42 that stays here (loop-consumers spec, decision 33): no home sweep probes the
    // step boundaries. Over the whole roster, node 5's fixtures included.
    it.each(HOLED_TEST_POLYGONS.map(fixture => [fixture.name, fixture] as const))(
        '%s: checkWavefront holds at every step boundary', (_name, fixture) => {
            const {result, boundaries} = solveHoled(fixture);
            expect(result.complete).toBe(true);
            expect(boundaries.length).toBeGreaterThan(1);
            expect(boundaries.flatMap((boundary, step) => boundary.violations.map(v => `step ${step}: ${v}`))).toEqual([]);
        });

    // THE WEIGHTED EQUAL-TIME CHECK AND THE TIME ORDER, at 1e-9 of the extent (decision 42; BSA.D316). They were lost
    // when the battery moved to the home sweeps, which date a node from one parent and so cannot see a spread between
    // its walls; the weighted F4 is the fixture that needs them most.
    it.each(FIXTURES.map(fixture => [fixture.name, fixture] as const))(
        '%s: every interior node at one time from all its walls, and no edge running backwards in it', (_name, fixture) => {
            const {result} = solveHoled(fixture);
            expect(result.complete).toBe(true);
            const tolerance = 1e-9 * extentOf(fixture);
            expect(equiTimeViolations(result.graph, tolerance)).toEqual([]);
            expect(timeOrderViolations(result.graph, tolerance)).toEqual([]);
        });

    it.each(FIXTURES.map(fixture => [fixture.name, fixture] as const))('%s tells its story', (_name, fixture) => {
        expect(storyOf(solveHoled(fixture))).toEqual(STORIES[fixture.name]);
    });

    it.each(FIXTURES.filter(fixture => !NOT_GENERIC.has(fixture.name)).map(fixture => [fixture.name, fixture] as const))(
        '%s has the generic counts: n + 2h - 2 interior nodes and 2n + 3h - 3 interior edges', (_name, fixture) => {
            const {graph} = solveHoled(fixture).result;
            const n = graph.numExteriorNodes;
            const h = fixture.holes.length;
            expect(graph.nodes.length - n).toBe(n + 2 * h - 2);
            expect(graph.interiorEdges).toHaveLength(2 * n + 3 * h - 3);
        });

    it('F8: the least-area rule gives the pocket\'s hole to the pocket, and every other ring to the outline (decision 15)', () => {
        const {result, boundaries} = solveHoled(F8);
        expect(result.complete).toBe(true);
        const {graph} = result;
        // A ring named by its members' clockwise parents: O [0..3], R1 [4, 5, 6, 12..15], P [7..12], H2 [16..20].
        const parentsOf = (ring: number[]) => ring
            .map(id => graph.interiorEdges[id - graph.numExteriorNodes].clockwiseExteriorEdgeIndex)
            .sort((a, b) => a - b);
        const O = [0, 1, 2, 3];
        const R1 = [4, 5, 6, 12, 13, 14, 15];
        const P = [7, 8, 9, 10, 11, 12];
        const H2 = [16, 17, 18, 19, 20];
        // The root is one step of three rings; the pinch is its first layer, and leaves two children of two rings.
        expect(boundaries[0].ringsPerInput.map(rings => rings.length)).toEqual([3]);
        const children = boundaries[1].ringsPerInput
            .map(rings => rings.map(parentsOf).sort((a, b) => a[0] - b[0]));
        expect(children).toHaveLength(2);
        expect(children).toContainEqual([P, H2]);
        expect(children).toContainEqual([O, R1]);
    });

    it('F1 stretched: the hole\'s last open face is accepted only when it closes (decision 51)', () => {
        // Traced by hand in decision 29: at t = 4.5 the hole's NW segment collapses, and the cycle round the hole
        // then joins SW's two ends through accepted edges while SW's face is still open. The predicate reads no
        // topology, so SW stays open, the bisector naming it is born, and its face closes.
        const {result} = solveHoled(F1_STRETCHED);
        expect(result.complete).toBe(true);
        expect(result.context!.isAccepted(6)).toBe(true);
    });

    it('F5 and its mirror: the hole goes to the child that contains it, first once and second once', () => {
        const childOfHole = (fixture: HoledTestPolygon) => {
            const {boundaries, result} = solveHoled(fixture);
            expect(result.complete).toBe(true);
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

describe('the partition order (decisions 25 to 27)', () => {
    it('equals today\'s span on one loop: decision 26\'s worked example', () => {
        // A decagon; the ring is made to hold a pending birth T (cw 3, ws 7) and bisectors whose clockwise parents
        // are 4, 6 and 7, edge 5 closed: b4, X (cw 6, ws 4, from collapsing b5 and b6), and b7.
        const decagon = Array.from({length: 10}, (_unused, i) => ({
            x: Math.cos(-2 * Math.PI * i / 10), y: Math.sin(-2 * Math.PI * i / 10)}));
        const context = makeStraightSkeletonSolverContext(decagon);
        initInteriorEdges(context);
        const b = (node: number) => 10 + node;
        const layer = new LayerLinks(context);
        // T closes the gap a merge of b8, b9, b0, b1, b2 and b3 leaves: it stands between b7 and b4.
        const T: BisectionParams = {clockwiseExteriorEdgeIndex: 3, widdershinsExteriorEdgeIndex: 7, source: 0};
        linkMergeGap(layer, b(3), b(8), T);
        retireBisectors(context, [8, 9, 0, 1, 2, 3].map(b));
        const X: BisectionParams = {clockwiseExteriorEdgeIndex: 6, widdershinsExteriorEdgeIndex: 4, source: 0};
        linkPairCollapse(layer, [b(5), b(6)], b(5), b(6), X);
        // T's ring is T, b4, X, b7: gaps 1, 2 and 1.
        expect(partitionArc(layer, T)).toBe(4);
        expect(partitionArc(layer, T)).toBe((7 - 3 + 10) % 10);
        // X's is X, b7, T, b4: gaps 1, 6 and 1, which is (4 − 6) mod 10.
        expect(partitionArc(layer, X)).toBe(8);
    });

    it('counts a gap between edges of two loops as 1', () => {
        // F1's join, linked by hand: h4 (hole corner E) strikes the right wall's segment (b2, b3).
        const layer = new LayerLinks(f1Context());
        const before: BisectionParams = {clockwiseExteriorEdgeIndex: 4, widdershinsExteriorEdgeIndex: 2, source: 0};
        const after: BisectionParams = {clockwiseExteriorEdgeIndex: 2, widdershinsExteriorEdgeIndex: 7, source: 0};
        linkSplit(layer, 12, {exteriorEdge: 2, from: 10, to: 11}, {x: 10, y: 5.5}, before, after);
        // The joined ring: b0 b1 b2 before h5 h6 h7 after b3. From `before`: 4→5→6→7, then 7→2 across loops,
        // then 2→3→0→1→2: every gap 1, eight members, so 8.
        expect(partitionArc(layer, before)).toBe(8);
        expect(partitionArc(layer, after)).toBe(8);
    });
});

describe('a ring whose polygon crosses itself is refused, never classified by its area\'s sign (BSA.D309)', () => {
    /** The irregular quadrilateral and F2's first hole: outline bisectors 8 to 11, hole bisectors 12 to 15. */
    const quadrilateralContext = () => {
        const hole: Vector2[] = [{x: 7, y: 6}, {x: 6, y: 7}, {x: 5, y: 6}, {x: 6, y: 5}];
        const context = makeStraightSkeletonSolverContext(
            [...QUADRILATERAL, ...hole], undefined, undefined, [{start: 0, count: 4}, {start: 4, count: 4}]);
        initInteriorEdges(context);
        return context;
    };
    const STEP = [8, 9, 10, 11, 12, 13, 14, 15];

    it('classifies the simple rings of the step: the outline outer, the hole inside it', () => {
        const context = quadrilateralContext();
        beginStep(context, STEP);
        try {
            expect(componentsOfRings(context, [[8, 9, 10, 11], [12, 13, 14, 15]], 0))
                .toEqual([{outer: [8, 9, 10, 11], inner: [[12, 13, 14, 15]]}]);
        } finally {
            endStep(context);
        }
    });

    it('refuses the outline\'s ring read in a crossed order, naming the step and the ring', () => {
        // The ring 8, 10, 9, 11 at time 0 is the bowtie (0,0), (14,13), (-1,12), (16,-1): its two lobes are unequal, so
        // its signed area is negative and well clear of the degenerate bar, and the sign alone would call it outer.
        const context = quadrilateralContext();
        const bowtie = [8, 10, 9, 11].map(id => context.wavefrontVertexAt(id, 0));
        expect(signedArea(bowtie)).toBeLessThan(-1);
        beginStep(context, STEP);
        try {
            expect(() => componentsOfRings(context, [[8, 10, 9, 11], [12, 13, 14, 15]], 0)).toThrow(/crosses itself/);
        } finally {
            endStep(context);
        }
        const refusals = context.diagnostics.filter(diagnostic => diagnostic.kind === 'multi-ring-step-refused');
        expect(refusals).toHaveLength(1);
        expect(refusals[0].detail).toContain(`Step [${STEP.join(', ')}]`);
        expect(refusals[0].detail).toContain('ring [8, 10, 9, 11]');
        expect(refusals[0].detail).toContain('crosses itself');
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
