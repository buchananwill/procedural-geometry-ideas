/*
 * A STRAIGHT BISECTOR BETWEEN COLLINEAR WALLS THAT FACE THE SAME WAY (BSA.F103, BSA.D314;
 * docs/notes/ISSUE-skeleton-straight-bisector-between-collinear-walls.md). Wherever two collinear walls face the same
 * way the solver can bear a "straight" bisector between them, and the one-ring steps that follow can go wrong: two
 * straight vertices reach a collapsing ridge and each ridge bisector is paired with the far one (K1); a ring of two or
 * three straight bisectors the pair or triangle handler cannot close (K3); a zero-length self-loop that is not culled.
 *
 * EVERY TEST UNDER A `red by design` DESCRIBE IS RED BY DESIGN (BSA.D266): each asserts the property the true skeleton
 * has, and fails today on the review's reproducer, coordinates verbatim. One green test beside them shows their
 * overlap instrument reading a sound chain of collinear ridge arcs as sound. The defect is in how one-ring steps resolve, its cure is the user's
 * (BSA.D301), and nothing in the solver has been changed for it. The SINGLE-LOOP reproducers come first: they show the
 * defect owes nothing to holes. The holed K1, self-loop and K2 reproducers are held by the guard's green tests in
 * `holed-guard.test.ts` and need no red twin here; K3's two holed inputs are incomplete and signalled, and get red
 * tests asserting `complete`.
 */
import type {StraightSkeletonGraph, Vector2} from '@proc-geo/core';
import {buildSkeletonTree, setSkeletonLogLevel, solveSkeleton} from '@proc-geo/core';

setSkeletonLogLevel('silent');

const P = (pairs: number[][]): Vector2[] => pairs.map(([x, y]) => ({x, y}));

/** A clockwise axis-aligned rectangle outline, [x0, x1] × [y0, y1]. */
const outlineRect = (x0: number, x1: number, y0: number, y1: number): Vector2[] =>
    [{x: x0, y: y0}, {x: x0, y: y1}, {x: x1, y: y1}, {x: x1, y: y0}];

/** A counter-clockwise axis-aligned rectangle hole, [x0, x1] × [y0, y1]. */
const holeRect = (x0: number, x1: number, y0: number, y1: number): Vector2[] =>
    [{x: x0, y: y0}, {x: x1, y: y0}, {x: x1, y: y1}, {x: x0, y: y1}];

/**
 * Every pair of non-culled arcs that overlap along a common line by more than `tolerance`: one arc per node pair (an
 * arc recorded from both ends counts once), compared when they are collinear within the tolerance.
 */
function overlappingArcs(graph: StraightSkeletonGraph, tolerance: number): string[] {
    const arcs = new Map<string, [number, number]>();
    for (const interior of graph.interiorEdges) {
        const edge = graph.edges[interior.id];
        if (interior.culled || edge.target === undefined || edge.target === edge.source) {
            continue;
        }
        const a = Math.min(edge.source, edge.target);
        const b = Math.max(edge.source, edge.target);
        arcs.set(`${a}:${b}`, [a, b]);
    }
    const at = (node: number) => graph.nodes[node].position;
    const list = [...arcs.values()];
    const found: string[] = [];
    for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
            const [p0, p1] = list[i].map(at);
            const [q0, q1] = list[j].map(at);
            const length = Math.hypot(p1.x - p0.x, p1.y - p0.y);
            const ux = (p1.x - p0.x) / length;
            const uy = (p1.y - p0.y) / length;
            const off = (q: Vector2) => Math.abs((q.x - p0.x) * uy - (q.y - p0.y) * ux);
            if (off(q0) > tolerance || off(q1) > tolerance) {
                continue;
            }
            const along = (q: Vector2) => (q.x - p0.x) * ux + (q.y - p0.y) * uy;
            const low = Math.max(0, Math.min(along(q0), along(q1)));
            const high = Math.min(length, Math.max(along(q0), along(q1)));
            if (high - low > tolerance) {
                found.push(`arcs ${list[i].join('-')} and ${list[j].join('-')} overlap by ${high - low}`);
            }
        }
    }
    return found;
}

/** Every interior edge that is not culled and ends at its own source. */
const unculledSelfLoops = (graph: StraightSkeletonGraph) => graph.interiorEdges
    .filter(interior => !interior.culled && graph.edges[interior.id].target === graph.edges[interior.id].source)
    .map(interior => interior.id);

describe('red by design: a straight bisector between collinear walls on a single loop', () => {
    /*
     * K1 (fuzz seed 413): a bar [200,1400]×[700,1100] with an arm up [600,900]×[1100,1900] and an arm down
     * [800,1100]×[400,700]. Each arm collapses at t = 150 and leaves a straight bisector between the bar's two collinear
     * top walls, down from (750,950), and its two collinear bottom walls, up from (950,850). At t = 200 the bar collapses
     * along y = 900: the true ridge is 400 → 750 → 950 → 1200, a tree. The one-ring step of four pairs each ridge
     * bisector with the far straight vertex, and the arcs (400,900)→(950,900) and (1200,900)→(750,900) overlap.
     */
    it('K1: the skeleton is a tree and no two of its arcs overlap', () => {
        const result = solveSkeleton(P([[800, 700], [200, 700], [200, 1100], [600, 1100], [600, 1900], [900, 1900],
            [900, 1100], [1400, 1100], [1400, 700], [1100, 700], [1100, 400], [800, 400]]));
        expect(result.complete).toBe(true);
        expect(overlappingArcs(result.graph, 1e-9 * 1200)).toEqual([]);
        expect(buildSkeletonTree(result).isTree).toBe(true);
    });

    /* The un-culled self-loop (fuzz seed 795): parents 9 and 5, the two collinear x = 1200 walls. */
    it('no interior edge that is not culled ends at its own source', () => {
        const result = solveSkeleton(P([[0, 1300], [300, 1300], [300, 1200], [800, 1200], [800, 1100], [1200, 1100],
            [1200, 900], [1700, 900], [1700, 300], [1200, 300], [1200, 100], [600, 100], [600, 600], [300, 600],
            [300, 400], [0, 400]]));
        expect(result.complete).toBe(true);
        expect(unculledSelfLoops(result.graph)).toEqual([]);
    });
});

/*
 * THE RED TESTS' INSTRUMENT, ON A SOUND SOLVE: K1's bar with only its arm up. One straight bisector reaches the ridge
 * y = 900, which runs 400 → 750 → 1200 as a chain of collinear arcs meeting end to end: no overlap, and a tree.
 */
describe('overlappingArcs reads a sound chain of collinear ridge arcs as no overlap', () => {
    it('the bar with one arm', () => {
        const result = solveSkeleton(P([[200, 700], [200, 1100], [600, 1100], [600, 1900], [900, 1900], [900, 1100],
            [1400, 1100], [1400, 700]]));
        expect(result.complete).toBe(true);
        expect(overlappingArcs(result.graph, 1e-9 * 1200)).toEqual([]);
        expect(buildSkeletonTree(result).isTree).toBe(true);
        expect(unculledSelfLoops(result.graph)).toEqual([]);
    });
});

describe('red by design: a ring of straight bisectors the pair or triangle handler cannot close', () => {
    /* K3, a ring of two straight bisectors with mirrored parents travelling the same way (fuzz seed 10). */
    it('two holes in an outline with two wings solve completely', () => {
        const result = solveSkeleton(
            P([[1500, 400], [900, 400], [900, 0], [100, 0], [100, 1800], [1500, 1800], [1500, 1600], [2300, 1600],
                [2300, 500], [1500, 500]]),
            {holes: [{vertices: holeRect(500, 1100, 700, 1300)}, {vertices: holeRect(1500, 1700, 800, 1200)}]});
        expect(result.complete).toBe(true);
    });

    /* K3, a ring of three straight bisectors: three holes in a row, their tops and bottoms on two lines. */
    it('three holes in a row in a long rectangle solve completely', () => {
        const result = solveSkeleton(outlineRect(0, 950, 0, 250), {holes: [
            {vertices: holeRect(100, 300, 100, 200)},
            {vertices: holeRect(400, 650, 100, 200)},
            {vertices: holeRect(750, 850, 100, 200)},
        ]});
        expect(result.complete).toBe(true);
    });
});
