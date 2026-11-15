/*
 * THE GUARD ON A HOLED SOLVE (BSA.D314, BSA.D318; `holed-guard.ts`). Some holed solves return `complete: true` with no
 * diagnostic and a wrong skeleton (BSA.F103, BSA.D315). After a solve with holes that would otherwise be complete,
 * `solveSkeleton` checks the finished graph, and each failure is a BLOCKING diagnostic, so the result is
 * `complete: false` and names the element:
 *
 *  - `holed-topology-violation`: the non-culled interior edges are one connected graph of cycle rank equal to the hole
 *    count, an arc recorded from both ends counted once; and an arc recorded from both ends names one pair of walls;
 *  - `holed-equal-time-violation`: every interior node is at one time from every wall that meets there, within the
 *    perceptual floor in unit space, compared by cross-multiplication as the causality check compares;
 *  - `holed-time-order-violation`: no non-culled interior edge ends earlier than it starts, compared the same way;
 *  - `holed-planarity-violation`: no two arcs cross at a point inside both, at the floor.
 *
 * A zero-length self-loop that is not culled is `holed-unculled-self-loop`, INFORMATIONAL: named, and blocking nothing
 * (BSA.D318).
 *
 * THESE TESTS ARE GREEN BECAUSE THEY ASSERT A GUARD IN PRODUCTION CODE, never a wrong skeleton (BSA.D266). The wrong
 * skeletons behind them are the single-ring defect of `ISSUE-skeleton-straight-bisector-between-collinear-walls.md`,
 * which is not cured here. Every reproducer is the review's, coordinates verbatim (BSA.F103).
 *
 * K1, the review's cycle-rank specimen, is solved correctly since BSA.D335 stage 1 and is now a test of that solve,
 * among the sound holed solves below (BSA.D336). The cycle-rank check it exercised is still reached on real solves by
 * the two courtyard specimens, whose guard diagnostic is that check's, and on a constructed graph by "counts a cycle too
 * many".
 */
import type {SkeletonSolveResult, Vector2} from '@proc-geo/core';
import {setSkeletonLogLevel, SKELETON_NOISE_FLOOR, solveSkeleton} from '@proc-geo/core';
import {HOLED_UNCULLED_SELF_LOOP, holedSkeletonViolations} from '@proc-geo/core/straight-skeleton/holed-guard';
import type {HoledTestPolygon} from '@proc-geo/test-fixtures';
import {HOLED_A, HOLED_C1, HOLED_D, HOLED_G, HOLED_TEST_POLYGONS, holedSolveOptions} from '@proc-geo/test-fixtures';
import {jitterEveryLoop} from '../sweep-harness/sweep';
import {expectSoundHoledSolve} from './holed-test-helpers';
import {place} from './placement-helpers';

setSkeletonLogLevel('silent');

const GUARD_KINDS: string[] = ['holed-topology-violation', 'holed-equal-time-violation', 'holed-time-order-violation',
    'holed-planarity-violation', HOLED_UNCULLED_SELF_LOOP];
const OTHER_BLOCKING = ['step-failure', 'unresolved-edges', 'simultaneous-across-rings', 'multi-ring-step-refused'];

const P = (pairs: number[][]): Vector2[] => pairs.map(([x, y]) => ({x, y}));

/** A clockwise axis-aligned rectangle outline, [x0, x1] × [y0, y1]. */
const outlineRect = (x0: number, x1: number, y0: number, y1: number): Vector2[] =>
    [{x: x0, y: y0}, {x: x0, y: y1}, {x: x1, y: y1}, {x: x1, y: y0}];

/** A counter-clockwise axis-aligned rectangle hole, [x0, x1] × [y0, y1]. */
const holeRect = (x0: number, x1: number, y0: number, y1: number): Vector2[] =>
    [{x: x0, y: y0}, {x: x1, y: y0}, {x: x1, y: y1}, {x: x0, y: y1}];

const turn = (theta: number) => (v: Vector2): Vector2 =>
    ({x: Math.cos(theta) * v.x - Math.sin(theta) * v.y, y: Math.sin(theta) * v.x + Math.cos(theta) * v.y});

const solve = (outline: Vector2[], holes: Vector2[][]) => solveSkeleton(outline, {holes: holes.map(vertices => ({vertices}))});

/** The guard's diagnostics, as `kind: detail`. */
const guardOf = (result: SkeletonSolveResult) => result.diagnostics
    .filter(diagnostic => GUARD_KINDS.includes(diagnostic.kind))
    .map(diagnostic => `${diagnostic.kind}: ${diagnostic.detail}`);

/** The guard and nothing else blocks: `complete` is false, and no other blocking kind is present. */
function expectGuardedBy(result: SkeletonSolveResult, kind: string, detail: RegExp) {
    expect(result.complete).toBe(false);
    expect(result.diagnostics.map(diagnostic => diagnostic.kind).filter(found => OTHER_BLOCKING.includes(found)))
        .toEqual([]);
    expect(guardOf(result).filter(line => line.startsWith(`${kind}: `) && detail.test(line))).not.toEqual([]);
}

describe('the holed guard turns the silent wrong answers into signalled ones (BSA.D314)', () => {
    /*
     * A zero-length self-loop between two collinear walls, not marked culled (fuzz seed 219). It carries no geometry,
     * and the solve is otherwise sound: the guard names it and blocks nothing (BSA.D318).
     */
    it('an un-culled self-loop is named, informationally, and the result stays complete', () => {
        const result = solve(
            P([[1000, 1300], [1100, 1300], [1100, 1600], [2000, 1600], [2000, 400], [1100, 400], [1100, 800], [1000, 800]]),
            [holeRect(1600, 1700, 1300, 1400), holeRect(1300, 1700, 600, 800)]);
        expect(result.complete).toBe(true);
        expect(guardOf(result)).toEqual([expect.stringMatching(
            /^holed-unculled-self-loop: Interior edge 50 is a self-loop at node 27 that is not culled/)]);
    });

    /*
     * A WEIGHTED HOLED SOLVE WITH TWO EDGES BACKWARDS IN TIME (`weighted-time-order.test.ts`, fuzz 199; the issue note
     * `ISSUE-skeleton-weighted-edge-runs-backwards-in-time.md`): edges 26 and 29 run from nodes at times 0.060 and 0.062
     * to a node at 0.049 (unit space). Its red test there stays red for the property; here the guard names both edges.
     */
    it('a weighted holed edge backwards in time: a time-order violation naming each edge (fuzz 199)', () => {
        const result = solveSkeleton(
            [{x: 4.644951381349675, y: -6.755622066955957}, {x: -4.676706086567728, y: -1.8051107689625472},
                {x: -5.856314077244432, y: 4.453583238847551}, {x: -7.110811353116291, y: 6.3960198401196955},
                {x: -4.502168286839199, y: 5.304885333975109}],
            {holes: [{
                vertices: [{x: -2.3583155490914054, y: -0.9530021836380875}, {x: -3.4866321902198325, y: -0.4669003737703935},
                    {x: -4.160980778008071, y: -1.220304781069897}, {x: -2.7476422531883373, y: -1.851482057156852},
                    {x: -2.1273971586308535, y: -1.3570563212188393}],
                weights: [1.3717782009392976, 0.8257213525474071, 0.9963533831760287, 1.449862015619874, 0.7138404082506895],
            }]});
        expectGuardedBy(result, 'holed-time-order-violation', /Interior edge 26 runs backwards in time/);
        expectGuardedBy(result, 'holed-time-order-violation', /Interior edge 29 runs backwards in time/);
    });

    /*
     * THE GUARD'S OWN FUZZ (BSA.D318), one specimen each for the checks no review reproducer reaches alone. Unions of
     * grid rectangles with grid holes, scaled by 100: turned and moved (seed 699), or jittered by 1e-8 of the extent
     * (seeds 12 and 283), coordinates verbatim. Each is complete and wrong without the guard, and the check named is
     * the only one of the guard's that fires.
     */
    it('two arcs crossing inside both: a planarity violation (union turned, seed 699)', () => {
        const result = solve(
            P([[-1000.8224100865109, 1674.6173493338474], [-15.80507682733969, 2522.992769286],
                [702.0510477475583, 1689.516564220547], [550.5099195538397, 1558.9972688432927],
                [811.5485103083481, 1255.9150124558555], [432.69568982405144, 929.61677401272],
                [693.73428057856, 626.5345176252828], [466.42258828798185, 430.75557455940157],
                [-381.9528316641704, 1415.772907818573], [-609.2645239547484, 1219.9939647526917]]),
            [
                P([[-99.89240809319745, 1394.7510750021083], [127.41928419738065, 1590.5300180679897],
                    [-68.35965886850067, 1817.8417103585675], [-295.67135115907877, 1622.0627672926862]]),
                P([[213.70076470247204, 1796.8198775421033], [289.47132879933133, 1862.0795252307298],
                    [158.9520334220772, 2013.6206534244488], [83.1814693252179, 1948.361005735822]]),
                P([[377.9469585436566, 1146.4175498950658], [605.2586508342347, 1342.1964929609471],
                    [539.9990031456076, 1417.9670570578064], [312.6873108550295, 1222.188113991925]]),
            ]);
        expectGuardedBy(result, 'holed-planarity-violation', /cross at a point inside both/);
        expect(guardOf(result).every(line => line.startsWith('holed-planarity-violation'))).toBe(true);
    });

    it('an arc whose two records name different walls: a topology violation (union jittered, seed 12)', () => {
        const result = solve(
            P([[900.0000101035371, 1500.0000060112338], [1700.0000063001655, 1500.0000057524112],
                [1700.0000095725215, 399.9999957908948], [999.9999936554563, 400.00000480760906],
                [999.9999902777088, 700.0000096799336], [899.9999966438951, 699.999995812455]]),
            [
                P([[1200.0000107557864, 999.9999979556602], [1500.0000104258972, 999.9999992971854],
                    [1500.00000575632, 1400.0000033326105], [1200.0000074635468, 1400.000003783619]]),
                P([[1100.0000106714265, 699.9999990068146], [1500.0000073211343, 699.9999921318788],
                    [1499.9999919509341, 799.9999983403017], [1099.9999893477732, 800.0000075242584]]),
            ]);
        expectGuardedBy(result, 'holed-topology-violation', /recorded with different pairs of walls/);
        expect(guardOf(result).every(line => line.includes('different pairs of walls'))).toBe(true);
    });

    it('an unweighted edge backwards in time: a time-order violation (union jittered, seed 283)', () => {
        const result = solve(
            P([[100.00001581459149, 1999.9999824280203], [1599.9999849220774, 1999.99999543524],
                [1599.9999862136258, 1900.0000019654592], [1899.9999924216158, 1899.9999894971986],
                [1899.9999890108754, 700.0000054228518], [700.0000152229214, 700.0000073115312],
                [699.9999877496294, 1100.000010149776], [99.99999243906508, 1100.0000107570127]]),
            [P([[500.00001672098927, 1599.9999999479876], [600.000002642385, 1599.9999962843926],
                [599.9999961743191, 1700.0000003705125], [500.0000017335491, 1699.9999983636226]])]);
        expectGuardedBy(result, 'holed-time-order-violation', /Interior edge 36 runs backwards in time/);
        expect(guardOf(result).every(line => line.startsWith('holed-time-order-violation'))).toBe(true);
    });

    /* K2: three holes in a rectangle, turned by 2.3375797149036646 rad and moved; node n30 is off equal time by 4.19. */
    it('K2, a node misplaced under inexact arithmetic: an equal-time violation naming the node', () => {
        const result = solve(
            P([[-778.2175857176126, -390.7012999936986], [-1333.2755067593791, 185.41561894619156],
                [-829.1732026869752, 671.0912998577373], [-274.1152816452086, 94.97438091784716]]),
            [
                P([[-559.5413663778883, -41.157724605329065], [-698.30584663833, 102.87150512964348],
                    [-914.3496912407887, -105.27521526101901], [-775.585210980347, -249.30444499599156]]),
                P([[-981.0995566337441, 108.13625460417438], [-1050.481796763965, 180.15086947166066],
                    [-1122.4964116314513, 110.7686293414398], [-1053.1141715012304, 38.75401447395353]]),
                P([[-765.0557120312853, 316.2829749948369], [-903.8201922917269, 460.3122047298094],
                    [-975.8348071592131, 390.9299645995886], [-837.0703268987716, 246.90073486461603]]),
            ]);
        expectGuardedBy(result, 'holed-equal-time-violation', /^holed-equal-time-violation: Node 30 /);
        // Silent before the guard: no causality diagnostic either.
        expect(result.diagnostics.map(diagnostic => diagnostic.kind)).not.toContain('causality-violation');
    });

    /*
     * The review's rotated two-hole specimen: [0,900]×[0,400] with holes [500,600]×[100,200] and [200,300]×[100,200],
     * turned by 1.4643 rad about the origin. Read here, it does not bear the self-loop the review reports: one node is
     * misplaced by about 0.57 and the causality oracles report it. The guard names it too.
     */
    it('the rotated two-hole specimen: an equal-time violation', () => {
        const at = turn(1.4643);
        const result = solve(outlineRect(0, 900, 0, 400).map(at),
            [holeRect(500, 600, 100, 200).map(at), holeRect(200, 300, 100, 200).map(at)]);
        expectGuardedBy(result, 'holed-equal-time-violation', /Node \d+ /);
    });

    /*
     * The courtyard with wings under the sweep harness's 1× jitter (BSA.D315): at seeds 1 and 3 it reported complete
     * with no diagnostic, with five self-loops, two cycles for one hole and strips 0.24% short.
     */
    it.each([1, 3])('the courtyard with wings jittered at seed %i', seed => {
        const jittered = jitterEveryLoop(HOLED_D, 1, seed);
        const result = solveSkeleton(jittered.outline, holedSolveOptions(jittered));
        expectGuardedBy(result, 'holed-topology-violation', /./);
    });
});

describe('the holed guard leaves every sound holed solve alone', () => {
    /*
     * K1 (fuzz seed 421), THE GUARD'S FIRST SPECIMEN, NOW SOLVED CORRECTLY (BSA.D335 stage 1, BSA.F109, BSA.D336). The
     * bar between the walls y = 1500 and y = 700 collapses at t = 400 along y = 1100, where two straight vertices reach
     * it: one down from the arm's ridge at x = 1250, between the two collinear top walls, and one up at x = 1400, between
     * the hole's top wall and the outline's wall y = 700 to its right. Read off the faces by hand, the ridge is the chain
     * 1100 → 1250 → 1400 → 1500, each arc between the top wall and the bottom wall whose faces meet over it. The pairwise
     * fallback used to pair each ridge bisector with the far straight vertex, so its arcs (1100,1100)→(1400,1100) and
     * (1500,1100)→(1250,1100) overlapped, and this test asserted the guard's cycle-rank violation; resolving the nearer
     * meeting first makes the solve right and leaves the guard nothing to say.
     */
    it('K1, two straight vertices on a collapsing ridge: the ridge chain 1100 → 1250 → 1400 → 1500, and a sound solve', () => {
        const fixture: HoledTestPolygon = {
            name: 'K1 (fuzz seed 421)',
            outline: P([[400, 800], [700, 800], [700, 1500], [900, 1500], [900, 1900], [1600, 1900], [1600, 1500],
                [1900, 1500], [1900, 700], [1600, 700], [1600, 300], [400, 300]]),
            holes: [{vertices: P([[1100, 400], [1200, 400], [1200, 700], [1100, 700]])}],
        };
        const {result} = expectSoundHoledSolve(fixture);
        expect(guardOf(result)).toEqual([]);

        const {graph} = result;
        const onRidge = (p: Vector2) => Math.abs(p.y - 1100) < 1e-6;
        const wall = (id: number) => {
            const [a, b] = [graph.nodes[graph.edges[id].source].position, graph.nodes[graph.edges[id].target!].position]
                .sort((p, q) => p.x - q.x || p.y - q.y);
            return `(${a.x},${a.y})-(${b.x},${b.y})`;
        };
        // Each arc on the ridge once, an arc recorded from both ends counted once, with its two parent walls.
        const ridge = new Set(graph.interiorEdges.flatMap(interior => {
            const edge = graph.edges[interior.id];
            if (interior.culled || edge.target === undefined) {
                return [];
            }
            const [from, to] = [graph.nodes[edge.source].position, graph.nodes[edge.target].position];
            if (!onRidge(from) || !onRidge(to)) {
                return [];
            }
            const walls = [wall(interior.clockwiseExteriorEdgeIndex), wall(interior.widdershinsExteriorEdgeIndex)].sort();
            return [`x ${Math.min(from.x, to.x).toFixed(6)} to ${Math.max(from.x, to.x).toFixed(6)}: ${walls.join(' and ')}`];
        }));
        expect([...ridge].sort()).toEqual([
            'x 1100.000000 to 1250.000000: (1100,700)-(1200,700) and (700,1500)-(900,1500)',
            'x 1250.000000 to 1400.000000: (1100,700)-(1200,700) and (1600,1500)-(1900,1500)',
            'x 1400.000000 to 1500.000000: (1600,1500)-(1900,1500) and (1600,700)-(1900,700)',
        ]);
    });

    it.each(HOLED_TEST_POLYGONS.map(fixture => [fixture.name, fixture] as const))('%s', (_name, fixture) => {
        const result = solveSkeleton(fixture.outline, holedSolveOptions(fixture));
        expect(guardOf(result)).toEqual([]);
        expect(result.complete).toBe(true);
    });

    /*
     * IT READS THE SOLVER'S ANSWER IN UNIT SPACE, not the caller-space graph. Carried back to a translation of 1e11 to
     * 1e13, every node is rounded to the caller's coordinates by more than the floor (one ulp of 1e13 is about 2e-3 on
     * an extent of 10), and read there the guard would call these sound solves off equal time: it did, on 42 of the
     * sweep harness's 126 translated holed cells, before it moved to unit space. C1 and G carry no other diagnostic.
     */
    it.each([HOLED_C1, HOLED_G].flatMap(fixture => [1e11, 1e13].map(t => [`${fixture.name} at ${t}`, fixture, t] as const)))(
        '%s: no guard diagnostic, complete', (_name, fixture, t) => {
            const moved = {
                ...fixture,
                outline: place(fixture.outline, 1, t),
                holes: fixture.holes.map(hole => ({...hole, vertices: place(hole.vertices, 1, t)})),
            };
            const result = solveSkeleton(moved.outline, holedSolveOptions(moved));
            expect(guardOf(result)).toEqual([]);
            expect(result.complete).toBe(true);
        });
});

/*
 * THE GUARD READS A FINISHED GRAPH, so each half is convicted on constructed graphs as well: the concentric square's
 * sound solve, and that solve with one thing changed.
 */
describe('holedSkeletonViolations on constructed graphs', () => {
    const solved = () => {
        const result = solveSkeleton(HOLED_A.outline, holedSolveOptions(HOLED_A));
        return {graph: structuredClone(result.graph), toUnitScale: result.normalisation.toUnitScale};
    };
    const violations = ({graph, toUnitScale}: ReturnType<typeof solved>) =>
        holedSkeletonViolations(graph, 1, SKELETON_NOISE_FLOOR, toUnitScale).map(found => found.kind);
    const addSelfLoop = (built: ReturnType<typeof solved>, culled: boolean) => {
        const {graph} = built;
        const node = graph.numExteriorNodes;
        const id = graph.edges.length;
        graph.edges.push({...graph.edges[graph.interiorEdges[0].id], id, source: node, target: node});
        graph.interiorEdges.push({...graph.interiorEdges[0], id, culled});
        return built;
    };

    it('finds nothing on a sound holed skeleton, whose ridges are recorded from both ends', () => {
        const built = solved();
        // A's four ridges are each written down by two bisectors, one each way: counted once, the rank is 1.
        expect(built.graph.interiorEdges).toHaveLength(16);
        expect(violations(built)).toEqual([]);
    });

    it('skips a culled self-loop', () => {
        expect(violations(addSelfLoop(solved(), true))).toEqual([]);
    });

    it('names a self-loop that is not culled, informationally, and counts no cycle for it', () => {
        expect(violations(addSelfLoop(solved(), false))).toEqual([HOLED_UNCULLED_SELF_LOOP]);
    });

    it('finds an arc whose two records name different walls', () => {
        const built = solved();
        const {graph} = built;
        // A ridge of A recorded a third time, between the same two nodes, naming another wall from one end.
        const ridge = graph.interiorEdges.find(interior => graph.edges[interior.id].source >= graph.numExteriorNodes)!;
        const id = graph.edges.length;
        graph.edges.push({...graph.edges[ridge.id], id});
        graph.interiorEdges.push({...ridge, id, widdershinsExteriorEdgeIndex: (ridge.clockwiseExteriorEdgeIndex + 1) % 4});
        expect(violations(built)).toContain('holed-topology-violation');
    });

    it('finds two arcs crossing: two corner bisectors with their targets swapped', () => {
        const built = solved();
        const {graph} = built;
        // The bisectors of the outline corners (0,0) and (10,0) end at (2,2) and (8,2); swapped, they cross at (5,1.25).
        const cornerAt = (x: number, y: number) => graph.interiorEdges.find(interior => {
            const source = graph.nodes[graph.edges[interior.id].source].position;
            return source.x === x && source.y === y;
        })!;
        const first = graph.edges[cornerAt(0, 0).id];
        const second = graph.edges[cornerAt(10, 0).id];
        [first.target, second.target] = [second.target, first.target];
        expect(violations(built)).toContain('holed-planarity-violation');
    });

    it('finds an edge running backwards in time: a corner bisector turned round', () => {
        const built = solved();
        const {graph} = built;
        const corner = graph.interiorEdges.find(interior => graph.edges[interior.id].source < graph.numExteriorNodes)!;
        const edge = graph.edges[corner.id];
        graph.edges[corner.id] = {...edge, source: edge.target!, target: edge.source};
        expect(violations(built)).toEqual(['holed-time-order-violation']);
    });

    it('counts a cycle too many: a ridge recorded a second time between other nodes', () => {
        const built = solved();
        const {graph} = built;
        // A fifth arc between the ridge square's corners: from a corner to the corner on its diagonal, which no ridge
        // joins it to.
        const corner = graph.interiorEdges.find(interior => graph.edges[interior.id].source < graph.numExteriorNodes)!;
        const edge = graph.edges[corner.id];
        const from = graph.nodes[edge.target!].position;
        const other = graph.nodes.slice(graph.numExteriorNodes).reduce((far, node) =>
            Math.hypot(node.position.x - from.x, node.position.y - from.y)
                > Math.hypot(far.position.x - from.x, far.position.y - from.y) ? node : far);
        const id = graph.edges.length;
        graph.edges.push({...edge, id, source: edge.target!, target: other.id});
        graph.interiorEdges.push({...corner, id});
        expect(violations(built)).toContain('holed-topology-violation');
    });

    it('finds a node moved off equal time, by more than the floor and not by less', () => {
        const moveBy = (fraction: number) => {
            const built = solved();
            const node = built.graph.nodes[built.graph.numExteriorNodes];
            // Along x only: the walls that meet at a ridge corner are two vertical and two horizontal.
            node.position = {x: node.position.x + fraction / built.toUnitScale, y: node.position.y};
            return violations(built);
        };
        expect(moveBy(4 * SKELETON_NOISE_FLOOR)).toContain('holed-equal-time-violation');
        expect(moveBy(SKELETON_NOISE_FLOOR / 4)).toEqual([]);
    });
});
