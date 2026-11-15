/*
 * THE GUARD ON A HOLED SOLVE (BSA.D314; `holed-guard.ts`). Some holed solves return `complete: true` with no
 * diagnostic and a wrong skeleton (BSA.F103, BSA.D315). After a solve with holes that would otherwise be complete,
 * `solveSkeleton` checks the finished graph for the two things every such answer shows, and a failure is a BLOCKING
 * diagnostic, so the result is `complete: false` and names the element:
 *
 *  - `holed-topology-violation`: the non-culled interior edges are one connected graph of cycle rank equal to the hole
 *    count, an arc recorded from both ends counted once, with no self-loop that is not culled;
 *  - `holed-equal-time-violation`: every interior node is at one time from every wall that meets there, within the
 *    perceptual floor in unit space, compared by cross-multiplication as the causality check compares.
 *
 * THESE TESTS ARE GREEN BECAUSE THEY ASSERT A GUARD IN PRODUCTION CODE, never a wrong skeleton (BSA.D266). The wrong
 * skeletons behind them are the single-ring defect of `ISSUE-skeleton-straight-bisector-between-collinear-walls.md`,
 * which is not cured here. Every reproducer is the review's, coordinates verbatim (BSA.F103).
 */
import type {SkeletonSolveResult, Vector2} from '@proc-geo/core';
import {setSkeletonLogLevel, SKELETON_NOISE_FLOOR, solveSkeleton} from '@proc-geo/core';
import {holedSkeletonViolations} from '@proc-geo/core/straight-skeleton/holed-guard';
import {HOLED_A, HOLED_C1, HOLED_D, HOLED_G, HOLED_TEST_POLYGONS, holedSolveOptions} from '@proc-geo/test-fixtures';
import {jitterEveryLoop} from '../sweep-harness/sweep';
import {place} from './placement-helpers';

setSkeletonLogLevel('silent');

const GUARD_KINDS = ['holed-topology-violation', 'holed-equal-time-violation'];
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
     * K1 (fuzz seed 421): two straight vertices reach a collapsing ridge and each ridge bisector is paired with the far
     * one. The arcs (1100,1100)→(1400,1100) and (1500,1100)→(1250,1100) overlap where the true ridge is 1100 → 1250 →
     * 1400 → 1500. Every node is in the right place; the interior graph has one cycle too many.
     */
    it('K1, overlapping ridge arcs: one cycle too many is a topology violation', () => {
        const result = solve(
            P([[400, 800], [700, 800], [700, 1500], [900, 1500], [900, 1900], [1600, 1900], [1600, 1500], [1900, 1500],
                [1900, 700], [1600, 700], [1600, 300], [400, 300]]),
            [P([[1100, 400], [1200, 400], [1200, 700], [1100, 700]])]);
        expectGuardedBy(result, 'holed-topology-violation', /cycle rank 2 .*1 hole\(s\)/);
        expect(guardOf(result).filter(line => line.startsWith('holed-equal-time-violation'))).toEqual([]);
    });

    /* A zero-length self-loop between two collinear x = 1100 walls, not marked culled (fuzz seed 219). */
    it('an un-culled self-loop is a topology violation naming the edge and its node', () => {
        const result = solve(
            P([[1000, 1300], [1100, 1300], [1100, 1600], [2000, 1600], [2000, 400], [1100, 400], [1100, 800], [1000, 800]]),
            [holeRect(1600, 1700, 1300, 1400), holeRect(1300, 1700, 600, 800)]);
        expectGuardedBy(result, 'holed-topology-violation', /Interior edge \d+ is a self-loop at node \d+ that is not culled/);
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

    it('names a self-loop that is not culled', () => {
        expect(violations(addSelfLoop(solved(), false))).toEqual(['holed-topology-violation']);
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
        expect(moveBy(4 * SKELETON_NOISE_FLOOR)).toEqual(['holed-equal-time-violation']);
        expect(moveBy(SKELETON_NOISE_FLOOR / 4)).toEqual([]);
    });
});
